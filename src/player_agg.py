"""Shared player-level machinery for Steps 3-4 (implements logs/PREREGISTRATION.md; corrections D30, D31).

Per-ball tables:
  bat_balls(): one row per ball faced (wides excluded) + one row per dismissal not on a ball faced
               (wicket on a wide; non-striker run-out), balls = 0 (D31: outs were undercounted before).
  bowl_balls(): one row per delivery (wides and no-balls included; legal balls counted separately).
Score components per role: recency-weighted means, normal-normal Empirical-Bayes shrinkage with each player's own
sampling variance (D31: effective n = (sum w n)^2 / sum w^2 n; pressure-drop variance = s_h^2/n_h + s_l^2/n_l),
z-scores, 0-100 score, and match-bootstrap 80% intervals with priors and standardisation held fixed.
A component whose between-player variance is not identifiable carries no information: z = 0 (D30).
"""
import numpy as np
import pandas as pd
from scipy.stats import norm
from loaders import load_balls
from config import WORK

WEIGHTS = {"S": 0.40, "I": 0.25, "H": 0.15, "C": 0.20}
DECAY = 0.75
K_FLOOR = 30.0            # pre-registered floor on shrinkage strength (in balls): tau^2 <= var_within / 30
C_PRIOR_SEASONS = 2.0
C_MIN_SEASON_BALLS = 30


def load_ball_frames(bucket_col="pi_bucket"):
    balls = load_balls()
    pres = pd.read_parquet(WORK / "pressure_ball.parquet")
    exp = pd.read_parquet(WORK / "expected_ball.parquet")
    key = ["match_id", "innings", "innings_ball_num"]
    pres = pres[~pres.reference_only]
    b = balls[(~balls.is_super_over)].copy()
    b = b.merge(pres, on=key, how="inner", suffixes=("", "_p")).merge(exp.drop(columns=["season"]), on=key, how="left")
    b["bucket"] = b[bucket_col]
    return b


def bat_balls(b):
    wk = b.is_wicket.astype(str).str.lower().eq("true")
    out_id = b.player_out_id.astype(str)
    f = b[b.ball_faced.astype(bool)].copy()
    fw = wk[f.index]
    out = pd.DataFrame({
        "player_id": f.striker_id.astype(str), "player_name": f.striker_name, "match_id": f.match_id, "season": f.season,
        "innings": f.innings, "phase": f.phase, "bucket": f.bucket, "balls": 1.0, "runs": f.bat_runs.astype(float),
        "outs": ((out_id[f.index] == f.striker_id.astype(str)) & fw).astype(float),
        "fours": (f.bat_runs == 4).astype(float), "sixes": (f.bat_runs == 6).astype(float),
        "dots": (f.bat_runs == 0).astype(float), "rae": f.rae_bat.astype(float), "wpa": f.wpa_batter.astype(float),
        "vs": f.pace_or_spin, "hand": f.batting_type})
    sw = b[~b.ball_faced.astype(bool) & wk & (out_id == b.striker_id.astype(str))]   # striker out on a wide
    rows_w = pd.DataFrame({
        "player_id": sw.striker_id.astype(str), "player_name": sw.striker_name, "match_id": sw.match_id, "season": sw.season,
        "innings": sw.innings, "phase": sw.phase, "bucket": sw.bucket, "balls": 0.0, "runs": 0.0, "outs": 1.0, "fours": 0.0,
        "sixes": 0.0, "dots": 0.0, "rae": 0.0, "wpa": sw.wpa_batter.astype(float), "vs": sw.pace_or_spin, "hand": sw.batting_type})
    ns = b[wk & (out_id == b.non_striker_id.astype(str))]                              # non-striker out (D31)
    rows_ns = pd.DataFrame({
        "player_id": ns.non_striker_id.astype(str), "player_name": ns.non_striker_name, "match_id": ns.match_id, "season": ns.season,
        "innings": ns.innings, "phase": ns.phase, "bucket": ns.bucket, "balls": 0.0, "runs": 0.0, "outs": 1.0, "fours": 0.0,
        "sixes": 0.0, "dots": 0.0, "rae": 0.0, "wpa": ns.wpa_nonstriker_out.astype(float), "vs": ns.pace_or_spin, "hand": ns.batting_type})
    return pd.concat([out, rows_w, rows_ns], ignore_index=True)


def bowl_balls(b):
    legal = b.legal_ball.astype(bool)
    return pd.DataFrame({
        "player_id": b.bowler_id.astype(str), "player_name": b.bowler_name, "match_id": b.match_id, "season": b.season,
        "innings": b.innings, "phase": b.phase, "bucket": b.bucket, "balls": 1.0, "legal": legal.astype(float),
        "runs": b.bowler_runs_conceded.astype(float), "wkts": b.is_bowler_wicket.astype(float),
        "dots": (legal & (b.bowler_runs_conceded.astype(float) == 0)).astype(float),
        "bdry": b.bat_runs.isin([4, 6]).astype(float), "rae": b.rse_bowl.astype(float), "wpa": b.wpa_bowler.astype(float),
        "vs": b.batting_type, "hand": b.batting_type})


def eb(xbar, v):
    """Normal-normal Empirical Bayes. xbar: player means; v: their sampling variances.
    tau^2 by method of moments (unweighted). Returns shrunk values and (mu, tau2, informative)."""
    ok = np.isfinite(xbar) & np.isfinite(v) & (v > 0)
    w = 1.0 / v[ok]
    mu = np.sum(w * xbar[ok]) / np.sum(w)
    tau2 = max(np.var(xbar[ok]) - np.mean(v[ok]), 0.0)
    if tau2 <= 0:
        return np.full_like(xbar, mu), (mu, 0.0, False)
    shr = np.where(ok, (xbar / v + mu / tau2) / (1.0 / v + 1.0 / tau2), mu)
    return shr, (mu, tau2, True)


def shrink_with(x, v, prior):
    mu, tau2, inf = prior
    x = np.asarray(x, dtype=float)
    if not inf:
        return np.full_like(x, mu)
    return (x / v + mu / tau2) / (1.0 / v + 1.0 / tau2)


def components(pm, last_season):
    """Recency-weighted sums per player. n_eff = (sum w n)^2 / sum w^2 n (Kish effective sample size)."""
    w = DECAY ** (last_season - pm.season)
    g = pm.assign(wn_hi=w * pm.n_hi, w2n_hi=w ** 2 * pm.n_hi, ws_hi=w * pm.s_hi, ww_hi=w * pm.w_hi,
                  wn_lo=w * pm.n_lo, w2n_lo=w ** 2 * pm.n_lo, ws_lo=w * pm.s_lo) \
          .groupby("player_id")[["wn_hi", "w2n_hi", "ws_hi", "ww_hi", "wn_lo", "w2n_lo", "ws_lo"]].sum()
    g["neff_hi"] = g.wn_hi ** 2 / g.w2n_hi.replace(0, np.nan)
    g["neff_lo"] = g.wn_lo ** 2 / g.w2n_lo.replace(0, np.nan)
    seas = pm.groupby(["player_id", "season"])[["n_hi", "s_hi"]].sum()
    seas = seas[seas.n_hi >= C_MIN_SEASON_BALLS]
    seas["pos"] = (seas.s_hi / seas.n_hi > 0).astype(float)
    cs = seas.groupby("player_id").agg(c_pos=("pos", "sum"), c_n=("pos", "size"))
    return g.join(cs).fillna({"c_pos": 0, "c_n": 0})


class RoleScorer:
    """Fits shrinkage priors and standardisation on one role's scorable players, then scores and bootstraps."""

    def __init__(self, pm, last_season, sign=1.0, weights=None):
        self.weights = weights or WEIGHTS
        self.last = last_season
        self.pm = pm
        g = components(pm, last_season)
        self.g = g
        n_hi, n_lo = pm.n_hi.sum(), pm.n_lo.sum()
        self.var_rae = float(pm.ss_hi.sum() / max(n_hi, 1) - (pm.s_hi.sum() / max(n_hi, 1)) ** 2)
        self.var_wpa = float(pm.sw2_hi.sum() / max(n_hi, 1) - (pm.w_hi.sum() / max(n_hi, 1)) ** 2)
        self.var_rae_lo = float(pm.ss_lo.sum() / max(n_lo, 1) - (pm.s_lo.sum() / max(n_lo, 1)) ** 2)
        raw = self._raw(g)
        self.prior = {}
        vS = self.var_rae / g.neff_hi
        vI = self.var_wpa / g.neff_hi
        vH = vS + self.var_rae_lo / g.neff_lo
        S, self.prior["S"] = self._shrink(raw.S, vS, self.var_rae)
        I, self.prior["I"] = self._shrink(raw.I, vI, self.var_wpa)
        H, self.prior["H"] = self._shrink(raw.H, vH, self.var_rae + self.var_rae_lo)
        cmu = g.c_pos.sum() / max(g.c_n.sum(), 1)
        self.prior["C"] = (cmu, C_PRIOR_SEASONS, True)
        C = (g.c_pos + C_PRIOR_SEASONS * cmu) / (g.c_n + C_PRIOR_SEASONS)
        comp = pd.DataFrame({"S": S, "I": I, "H": H, "C": C})
        self.mean, self.sd = comp.mean(), comp.std(ddof=0).replace(0, 1)
        self.informative = {c: bool(self.prior[c][2]) and comp[c].std(ddof=0) > 1e-9 for c in comp}   # D30
        Z = sum(self.weights[c] * ((comp[c] - self.mean[c]) / self.sd[c] if self.informative[c] else 0.0) for c in self.weights)
        self.zsd = float(Z.std(ddof=0)) or 1.0
        self.comp = comp.assign(Z=Z, score=100 * norm.cdf(Z / self.zsd), n_hi_w=g.wn_hi, n_eff_hi=g.neff_hi, n_lo_w=g.wn_lo,
                                seasons_assessed=g.c_n, seasons_positive=g.c_pos, S_raw=raw.S, I_raw=raw.I, H_raw=raw.H)

    @staticmethod
    def _raw(g):
        S = g.ws_hi / g.wn_hi
        I = g.ww_hi / g.wn_hi
        lo = (g.ws_lo / g.wn_lo).where(g.wn_lo > 0, np.nan)
        return pd.DataFrame({"S": S, "I": I, "H": S - lo})

    @staticmethod
    def _shrink(x, v, within_var):
        xv = x.values.astype(float); vv = v.values.astype(float)
        vv = np.where(np.isfinite(vv) & (vv > 0), vv, np.inf)
        xs, (mu, tau2, inf) = eb(np.where(np.isfinite(xv), xv, np.nan), vv)
        if inf:   # pre-registered floor: shrinkage strength k = v_within / tau2 >= 30 balls  <=>  tau2 <= v_within / 30
            tau2 = min(tau2, within_var / K_FLOOR)
            with np.errstate(invalid="ignore", divide="ignore"):
                xs = np.where(np.isfinite(xv) & np.isfinite(vv), (xv / vv + mu / tau2) / (1.0 / vv + 1.0 / tau2), mu)
        return pd.Series(xs, index=x.index), (mu, tau2, inf)

    def score_from_raw(self, S, I, H, vS, vI, vH, c_pos, c_n, weights=None):
        w = weights or self.weights
        comp = {"S": shrink_with(S, vS, self.prior["S"]), "I": shrink_with(I, vI, self.prior["I"]),
                "H": shrink_with(H, vH, self.prior["H"]),
                "C": (c_pos + C_PRIOR_SEASONS * self.prior["C"][0]) / (c_n + C_PRIOR_SEASONS)}
        Z = sum(w[c] * ((comp[c] - self.mean[c]) / self.sd[c] if self.informative[c] else 0.0) for c in w)
        return 100 * norm.cdf(Z / self.zsd)

    def bootstrap(self, rng, n_boot=1000):
        """Resample each player's matches; priors and standardisation fixed. Returns 10th/90th percentiles."""
        rows = []
        for pid, g in self.pm.groupby("player_id"):
            if pid not in self.comp.index:
                continue
            w = (DECAY ** (self.last - g.season)).values
            arr = {c: g[c].values for c in ["n_hi", "s_hi", "w_hi", "n_lo", "s_lo"]}
            seas = g.season.values
            idx = rng.integers(0, len(g), size=(n_boot, len(g)))
            W, nh, nl = w[idx], arr["n_hi"][idx], arr["n_lo"][idx]
            wn_hi = (W * nh).sum(1); w2n_hi = (W ** 2 * nh).sum(1)
            ws_hi = (W * arr["s_hi"][idx]).sum(1); ww_hi = (W * arr["w_hi"][idx]).sum(1)
            wn_lo = (W * nl).sum(1); w2n_lo = (W ** 2 * nl).sum(1); ws_lo = (W * arr["s_lo"][idx]).sum(1)
            with np.errstate(invalid="ignore", divide="ignore"):
                ne_hi = np.where(w2n_hi > 0, wn_hi ** 2 / w2n_hi, np.nan)
                ne_lo = np.where(w2n_lo > 0, wn_lo ** 2 / w2n_lo, np.nan)
                S = ws_hi / wn_hi; I = ww_hi / wn_hi; H = S - ws_lo / wn_lo
                vS = self.var_rae / ne_hi; vI = self.var_wpa / ne_hi; vH = vS + self.var_rae_lo / ne_lo
            fix = lambda a, d: np.where(np.isfinite(a), a, d)
            S = fix(S, self.prior["S"][0]); I = fix(I, self.prior["I"][0]); H = fix(H, self.prior["H"][0])
            vS = fix(vS, 1e9); vI = fix(vI, 1e9); vH = fix(vH, 1e9)
            c_pos = np.zeros(n_boot); c_n = np.zeros(n_boot)
            for s in np.unique(seas):
                msk = seas[idx] == s
                ns_ = (nh * msk).sum(1); ss = (arr["s_hi"][idx] * msk).sum(1)
                ok = ns_ >= C_MIN_SEASON_BALLS
                c_n += ok; c_pos += ok & (ss > 0)
            sc = self.score_from_raw(S, I, H, vS, vI, vH, c_pos, c_n)
            rows.append(dict(player_id=pid, score_lo80=float(np.percentile(sc, 10)), score_hi80=float(np.percentile(sc, 90)),
                             S_lo80=float(np.nanpercentile(S, 10)), S_hi80=float(np.nanpercentile(S, 90))))
        return pd.DataFrame(rows).set_index("player_id")


def player_match_table(rows, bucket_hi="High", bucket_lo="Low"):
    """Aggregate per-ball rows (bat or bowl) to player x match sums used by RoleScorer."""
    hi = rows[rows.bucket == bucket_hi]; lo = rows[rows.bucket == bucket_lo]
    a = hi.groupby(["player_id", "match_id", "season"]).agg(n_hi=("balls", "sum"), s_hi=("rae", "sum"), w_hi=("wpa", "sum"),
                                                             ss_hi=("rae", lambda x: float((x ** 2).sum())),
                                                             sw2_hi=("wpa", lambda x: float((x ** 2).sum())))
    c = lo.groupby(["player_id", "match_id", "season"]).agg(n_lo=("balls", "sum"), s_lo=("rae", "sum"),
                                                             ss_lo=("rae", lambda x: float((x ** 2).sum())))
    return a.join(c, how="outer").fillna(0).reset_index()
