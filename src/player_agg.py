"""Shared player-level machinery for Steps 3-4 (implements logs/PREREGISTRATION.md exactly).

Per-ball tables:
  bat_balls(): one row per ball faced (wides excluded) + one row per non-striker dismissal (balls = 0),
  bowl_balls(): one row per delivery (wides and no-balls included; legal balls counted separately).
Score components (per role) with recency weights, Empirical-Bayes shrinkage, z-scores and the 0-100 score,
plus match-bootstrap 80% intervals with the shrinkage priors and standardisation held fixed.
"""
import numpy as np
import pandas as pd
from scipy.stats import norm
from loaders import load_balls
from config import WORK

WEIGHTS = {"S": 0.40, "I": 0.25, "H": 0.15, "C": 0.20}
DECAY = 0.75
K_FLOOR = 30.0
C_PRIOR_SEASONS = 2.0
C_MIN_SEASON_BALLS = 30


def load_ball_frames(bucket_col="pi_bucket"):
    balls = load_balls()
    pres = pd.read_parquet(WORK / "pressure_ball.parquet")
    exp = pd.read_parquet(WORK / "expected_ball.parquet")
    key = ["match_id", "innings", "innings_ball_num"]
    pres = pres[~pres.reference_only]
    b = balls[(~balls.is_super_over)].copy()
    b["innings"] = b.innings.astype(int)
    b = b.merge(pres, on=key, how="inner", suffixes=("", "_p")).merge(exp.drop(columns=["season"]), on=key, how="left")
    b["bucket"] = b[bucket_col]
    return b


def bat_balls(b):
    f = b[b.ball_faced.astype(bool)].copy()
    out = pd.DataFrame({
        "player_id": f.striker_id.astype(str), "player_name": f.striker_name, "match_id": f.match_id, "season": f.season,
        "innings": f.innings, "phase": f.phase, "bucket": f.bucket, "balls": 1.0, "runs": f.bat_runs.astype(float),
        "outs": ((f.player_out_id.astype(str) == f.striker_id.astype(str)) & f.is_wicket.astype(str).str.lower().eq("true")).astype(float),
        "fours": (f.bat_runs == 4).astype(float), "sixes": (f.bat_runs == 6).astype(float),
        "dots": (f.bat_runs == 0).astype(float), "rae": f.rae_bat.astype(float), "wpa": f.wpa_batter.astype(float),
        "vs": f.pace_or_spin, "hand": f.batting_type})
    ns = b[(b.wpa_nonstriker_out != 0)].copy()
    ns_rows = pd.DataFrame({
        "player_id": ns.player_out_id.astype(str), "player_name": ns.non_striker_name, "match_id": ns.match_id, "season": ns.season,
        "innings": ns.innings, "phase": ns.phase, "bucket": ns.bucket, "balls": 0.0, "runs": 0.0, "outs": 1.0, "fours": 0.0,
        "sixes": 0.0, "dots": 0.0, "rae": 0.0, "wpa": ns.wpa_nonstriker_out.astype(float), "vs": ns.pace_or_spin, "hand": ns.batting_type})
    return pd.concat([out, ns_rows], ignore_index=True)


def bowl_balls(b):
    legal = b.legal_ball.astype(bool)
    return pd.DataFrame({
        "player_id": b.bowler_id.astype(str), "player_name": b.bowler_name, "match_id": b.match_id, "season": b.season,
        "innings": b.innings, "phase": b.phase, "bucket": b.bucket, "balls": 1.0, "legal": legal.astype(float),
        "runs": b.bowler_runs_conceded.astype(float), "wkts": b.is_bowler_wicket.astype(float),
        "dots": (legal & (b.bowler_runs_conceded.astype(float) == 0)).astype(float),
        "bdry": b.bat_runs.isin([4, 6]).astype(float), "rae": b.rse_bowl.astype(float), "wpa": b.wpa_bowler.astype(float),
        "vs": b.batting_type, "hand": b.batting_type})


def _eb(xbar, n, within_var):
    """Empirical-Bayes posterior means (method of moments). Returns shrunk values, mu, k."""
    ok = n > 0
    mu = np.average(xbar[ok], weights=n[ok])
    v_obs = np.average((xbar[ok] - mu) ** 2, weights=n[ok])
    v_noise = np.average(within_var / n[ok], weights=n[ok])
    informative = (v_obs - v_noise) > 0
    v_between = max(v_obs - v_noise, 1e-12)
    k = max(within_var / v_between, K_FLOOR)
    return (n * xbar + k * mu) / (n + k), mu, k, informative


def components(pm, last_season):
    """pm: per player-match aggregates with columns player_id, season, n_hi, s_hi (sum rae high), w_hi (sum wpa high),
    n_lo, s_lo, and ss_hi/ss_lo (sum of squares) for within-variance. Returns per-player raw component inputs."""
    w = DECAY ** (last_season - pm.season)
    g = pm.assign(wn_hi=w * pm.n_hi, ws_hi=w * pm.s_hi, ww_hi=w * pm.w_hi, wn_lo=w * pm.n_lo, ws_lo=w * pm.s_lo) \
          .groupby("player_id")[["wn_hi", "ws_hi", "ww_hi", "wn_lo", "ws_lo"]].sum()
    seas = pm.groupby(["player_id", "season"])[["n_hi", "s_hi"]].sum()
    seas = seas[seas.n_hi >= C_MIN_SEASON_BALLS]
    seas["pos"] = (seas.s_hi / seas.n_hi > 0).astype(float)
    cs = seas.groupby("player_id").agg(c_pos=("pos", "sum"), c_n=("pos", "size"))
    g = g.join(cs).fillna({"c_pos": 0, "c_n": 0})
    return g


class RoleScorer:
    """Fits shrinkage priors and standardisation on one role's scorable players, then scores and bootstraps."""

    def __init__(self, pm, last_season, sign=1.0, weights=None):
        self.weights = weights or WEIGHTS
        self.last = last_season
        self.pm = pm
        g = components(pm, last_season)
        self.g = g
        # within-player per-ball variances (pooled)
        self.var_rae = float(pm.ss_hi.sum() / max(pm.n_hi.sum(), 1) - (pm.s_hi.sum() / max(pm.n_hi.sum(), 1)) ** 2)
        self.var_wpa = float(pm.sw2_hi.sum() / max(pm.n_hi.sum(), 1) - (pm.w_hi.sum() / max(pm.n_hi.sum(), 1)) ** 2)
        self.var_rae_lo = float(pm.ss_lo.sum() / max(pm.n_lo.sum(), 1) - (pm.s_lo.sum() / max(pm.n_lo.sum(), 1)) ** 2)
        raw = self._raw(g)
        self.prior = {}
        S, self.prior["S"] = self._shrink(raw.S, g.wn_hi, self.var_rae)
        I, self.prior["I"] = self._shrink(raw.I, g.wn_hi, self.var_wpa)
        nH = (g.wn_hi * g.wn_lo / (g.wn_hi + g.wn_lo)).fillna(0)
        H, self.prior["H"] = self._shrink(raw.H, nH, self.var_rae + self.var_rae_lo)
        cmu = g.c_pos.sum() / max(g.c_n.sum(), 1)
        self.prior["C"] = (cmu, C_PRIOR_SEASONS, True)
        C = (g.c_pos + C_PRIOR_SEASONS * cmu) / (g.c_n + C_PRIOR_SEASONS)
        comp = pd.DataFrame({"S": S, "I": I, "H": H, "C": C})
        self.mean, self.sd = comp.mean(), comp.std(ddof=0).replace(0, 1)
        # D30: a component whose between-player variance is not identifiable (Empirical Bayes shrinks everyone to
        # the mean) carries no information -> its z-score is 0. Without this guard, the residual 1e-10-scale
        # differences rank players by total volume (n * excess), which is not the pre-registered quantity.
        self.informative = {c: bool(self.prior[c][2]) and comp[c].std(ddof=0) > 1e-9 for c in comp}
        Z = sum(self.weights[c] * ((comp[c] - self.mean[c]) / self.sd[c] if self.informative[c] else 0.0) for c in self.weights)
        self.zsd = float(Z.std(ddof=0)) or 1.0
        self.comp = comp.assign(Z=Z, score=100 * norm.cdf(Z / self.zsd), n_hi_w=g.wn_hi, n_lo_w=g.wn_lo,
                                seasons_assessed=g.c_n, seasons_positive=g.c_pos,
                                S_raw=raw.S, I_raw=raw.I, H_raw=raw.H)

    @staticmethod
    def _raw(g):
        S = g.ws_hi / g.wn_hi
        I = g.ww_hi / g.wn_hi
        lo = (g.ws_lo / g.wn_lo).where(g.wn_lo > 0, S)
        H = S - lo
        return pd.DataFrame({"S": S, "I": I, "H": H})

    @staticmethod
    def _shrink(x, n, var):
        s, mu, k, inf = _eb(x.values, n.values, var)
        return pd.Series(s, index=x.index), (mu, k, inf)

    def score_from_raw(self, S, I, H, wn_hi, nH, c_pos, c_n, weights=None):
        w = weights or self.weights
        sh = lambda x, n, key: (n * x + self.prior[key][1] * self.prior[key][0]) / (n + self.prior[key][1])
        comp = {"S": sh(S, wn_hi, "S"), "I": sh(I, wn_hi, "I"), "H": sh(H, nH, "H"),
                "C": (c_pos + C_PRIOR_SEASONS * self.prior["C"][0]) / (c_n + C_PRIOR_SEASONS)}
        Z = sum(w[c] * ((comp[c] - self.mean[c]) / self.sd[c] if self.informative[c] else 0.0) for c in w)
        return 100 * norm.cdf(Z / self.zsd)

    def bootstrap(self, rng, n_boot=1000):
        """Resample each player's matches; priors and standardisation fixed. Returns 10th/90th percentiles."""
        rows = []
        pm = self.pm
        for pid, g in pm.groupby("player_id"):
            if pid not in self.comp.index:
                continue
            w = (DECAY ** (self.last - g.season)).values
            arr = {c: g[c].values for c in ["n_hi", "s_hi", "w_hi", "n_lo", "s_lo"]}
            seas = g.season.values
            m = len(g)
            idx = rng.integers(0, m, size=(n_boot, m))
            wn_hi = (w[idx] * arr["n_hi"][idx]).sum(1); ws_hi = (w[idx] * arr["s_hi"][idx]).sum(1)
            ww_hi = (w[idx] * arr["w_hi"][idx]).sum(1); wn_lo = (w[idx] * arr["n_lo"][idx]).sum(1)
            ws_lo = (w[idx] * arr["s_lo"][idx]).sum(1)
            with np.errstate(invalid="ignore", divide="ignore"):
                S = np.where(wn_hi > 0, ws_hi / wn_hi, self.prior["S"][0])
                I = np.where(wn_hi > 0, ww_hi / wn_hi, self.prior["I"][0])
                lo = np.where(wn_lo > 0, ws_lo / np.where(wn_lo > 0, wn_lo, 1), S)
                H = S - lo
                nH = np.where((wn_hi + wn_lo) > 0, wn_hi * wn_lo / np.where((wn_hi + wn_lo) > 0, wn_hi + wn_lo, 1), 0)
            # consistency per resample: seasons with >= 30 high balls and positive mean
            c_pos = np.zeros(n_boot); c_n = np.zeros(n_boot)
            for s in np.unique(seas):
                msk = seas[idx] == s
                ns = (arr["n_hi"][idx] * msk).sum(1); ss = (arr["s_hi"][idx] * msk).sum(1)
                ok = ns >= C_MIN_SEASON_BALLS
                c_n += ok; c_pos += ok & (ss > 0)
            sc = self.score_from_raw(S, I, H, wn_hi, nH, c_pos, c_n)
            rows.append(dict(player_id=pid, score_lo80=float(np.percentile(sc, 10)), score_hi80=float(np.percentile(sc, 90)),
                             S_lo80=float(np.percentile(S, 10)), S_hi80=float(np.percentile(S, 90))))
        return pd.DataFrame(rows).set_index("player_id")


def player_match_table(rows, bucket_hi="High", bucket_lo="Low"):
    """Aggregate per-ball rows (bat or bowl) to player x match sums used by RoleScorer."""
    hi = rows[rows.bucket == bucket_hi]; lo = rows[rows.bucket == bucket_lo]
    num = "balls"
    a = hi.groupby(["player_id", "match_id", "season"]).agg(n_hi=(num, "sum"), s_hi=("rae", "sum"), w_hi=("wpa", "sum"),
                                                             ss_hi=("rae", lambda x: float((x ** 2).sum())),
                                                             sw2_hi=("wpa", lambda x: float((x ** 2).sum())))
    c = lo.groupby(["player_id", "match_id", "season"]).agg(n_lo=(num, "sum"), s_lo=("rae", "sum"),
                                                             ss_lo=("rae", lambda x: float((x ** 2).sum())))
    pm = a.join(c, how="outer").fillna(0).reset_index()
    return pm
