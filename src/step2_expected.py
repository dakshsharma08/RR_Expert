"""Step 2: fair comparison. Expected runs from earlier matches only (D11), and Runs Above / Saved vs Expected.

Expected runs for a batter on a ball faced = cell rate x season factor x opposition-bowling factor
  cell   = innings x phase x wickets-lost band x batting-position group x (innings 2: required-rate band),
           using bat runs per ball faced in IPL matches played BEFORE this match; shrunk toward innings x phase (k = 100 balls).
  season = runs-per-ball level of earlier matches in this season, shrunk toward the previous season's level (k = 2,000 balls),
           relative to the level of the benchmark data -> captures scoring inflation (e.g. 2023+) without future data.
  opposition = the bowling team's runs conceded per ball in earlier matches of this season relative to league,
           shrunk toward 1.0 (half-weighted toward last season's team ratio; k = 600 balls), capped to [0.85, 1.15].
  venue  = not used: all venues UNKNOWN (D23).
Bowlers: the same, for bowler-chargeable runs per delivery (and bowler wickets per delivery), with the batting
  team's strength as the opposition factor. Runs Saved = expected - actual.
Run: python3 -I src/step2_expected.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import pandas as pd
from config import WORK, TABLES

K_CELL, K_SEASON, K_OPP = 100, 2000, 600

balls = pd.read_parquet(WORK / "balls_ipl.parquet")
matches = pd.read_csv(WORK / "matches_ipl.csv")
matches["first_ball_ts"] = matches.match_date + " " + matches.first_ball_recorded
order = matches.sort_values(["first_ball_ts", "match_id"]).match_id.tolist()
pos = {m: i for i, m in enumerate(order)}

b = balls[(~balls.is_super_over) & balls.innings.astype(int).isin([1, 2])].copy()
b["innings"] = b.innings.astype(int)
b["mpos"] = b.match_id.map(pos)
b["wkband"] = pd.cut(b.wickets_before, [-1, 2, 5, 10], labels=["0-2", "3-5", "6+"]).astype(str)
bo = pd.to_numeric(b.batting_order, errors="coerce")
b["posgrp"] = np.select([bo <= 3, bo <= 5], ["top", "middle"], "lower")
need = b.runs_needed_before.astype(float)
bl = b.legal_balls_left_before.astype(float)
rrr = np.where(bl > 0, need * 6 / np.maximum(bl, 1), 99)
b["rrband"] = np.where(b.innings == 2, np.select([rrr <= 7, rrr <= 10], ["<=7", "7-10"], ">10"), "na")
b["is_faced"] = b.ball_faced.astype(bool)
b["bowl_runs"] = b.bowler_runs_conceded.astype(float)
b["bowl_wkt"] = b.is_bowler_wicket.astype(int)
NPOS = len(order)


def prior_rate(df, keys, num, den, k, parent_keys):
    """Expanding (earlier matches only) cell rate num/den, shrunk toward the parent cell. Returns per-row value."""
    g = df.groupby(["mpos"] + keys)[[num, den]].sum()
    cells = g.reset_index()[keys].drop_duplicates()
    full_idx = pd.MultiIndex.from_frame(pd.DataFrame(
        [(p, *c) for p in range(NPOS) for c in cells.itertuples(index=False)], columns=["mpos"] + keys))
    gf = g.reindex(full_idx, fill_value=0)
    prior = gf.groupby(keys).cumsum() - gf
    par = prior.groupby(["mpos"] + parent_keys).sum().rename(columns=lambda c: c + "_p")
    pr = prior.reset_index().merge(par.reset_index(), on=["mpos"] + parent_keys)
    p_rate = np.where(pr[den + "_p"] > 0, pr[num + "_p"] / pr[den + "_p"].clip(lower=1), np.nan)
    pr["rate"] = (pr[num] + k * p_rate) / (pr[den] + k)
    pr["prior_n"] = pr[den]
    return df.merge(pr[["mpos"] + keys + ["rate", "prior_n"]], on=["mpos"] + keys, how="left")[["rate", "prior_n"]].values


def season_factor(df, num, den):
    """Level of earlier matches this season, shrunk toward previous season, relative to all earlier data."""
    per_m = df.groupby("mpos").agg(n=(num, "sum"), d=(den, "sum"), season=("season", "first")).reindex(range(NPOS))
    per_m["season"] = per_m.season.ffill().bfill()
    out = np.full(NPOS, np.nan)
    cum_n = per_m.n.fillna(0).cumsum() - per_m.n.fillna(0)
    cum_d = per_m.d.fillna(0).cumsum() - per_m.d.fillna(0)
    for p in range(NPOS):
        s = per_m.season.iloc[p]
        cur = per_m.iloc[:p][per_m.season.iloc[:p] == s]
        prev = per_m[per_m.season == s - 1]
        base = cum_n.iloc[p] / cum_d.iloc[p] if cum_d.iloc[p] > 0 else np.nan
        prev_lvl = prev.n.sum() / prev.d.sum() if prev.d.sum() > 0 else base
        lvl = (cur.n.sum() + K_SEASON * prev_lvl) / (cur.d.sum() + K_SEASON) if not np.isnan(prev_lvl) else np.nan
        out[p] = lvl / base if base and not np.isnan(base) else np.nan
    return pd.Series(out).reindex(df.mpos.values).values


def team_factor(df, team_col, num, den):
    """Team runs-per-ball ratio vs league from earlier matches this season, shrunk toward 0.5*last-season ratio + 0.5*1."""
    t = df.groupby(["mpos", team_col]).agg(n=(num, "sum"), d=(den, "sum")).reset_index()
    t["season"] = t.mpos.map(df.groupby("mpos").season.first())
    lg = df.groupby("mpos").agg(n=(num, "sum"), d=(den, "sum"))
    lg["season"] = df.groupby("mpos").season.first()
    res = {}
    seasons = sorted(df.season.unique())
    for s in seasons:
        ts = t[t.season == s].sort_values("mpos"); prev = t[t.season == s - 1]
        lgs = lg[lg.season == s]; lgp = lg[lg.season == s - 1]
        prev_ratio = {}
        if len(prev):
            lrate = lgp.n.sum() / lgp.d.sum()
            for team, g in prev.groupby(team_col):
                prev_ratio[team] = (g.n.sum() / g.d.sum()) / lrate
        for p in sorted(lgs.index):
            earlier = ts[ts.mpos < p]; lge = lgs[lgs.index < p]
            lrate = lge.n.sum() / lge.d.sum() if lge.d.sum() > 0 else np.nan
            for team in ts[ts.mpos == p][team_col]:
                e = earlier[earlier[team_col] == team]
                cur_ratio = (e.n.sum() / e.d.sum()) / lrate if e.d.sum() > 0 and lrate == lrate else 1.0
                prior = 0.5 * prev_ratio.get(team, 1.0) + 0.5 * 1.0
                f = (e.d.sum() * cur_ratio + K_OPP * prior) / (e.d.sum() + K_OPP)
                res[(p, team)] = float(np.clip(f, 0.85, 1.15))
    return np.array([res.get((p, tm), 1.0) for p, tm in zip(df.mpos.values, df[team_col].values)])


# ---------------------------------------------------------------- batters
f = b[b.is_faced].copy()
f["one"] = 1.0
f["bat_runs_f"] = f.bat_runs.astype(float)
cell_keys = ["innings", "phase", "wkband", "posgrp", "rrband"]
r = prior_rate(f, cell_keys, "bat_runs_f", "one", K_CELL, ["innings", "phase"])
f["xr_cell"], f["xr_prior_balls"] = r[:, 0], r[:, 1]
f["season_f"] = season_factor(f, "bat_runs_f", "one")
f["opp_bowl_f"] = team_factor(f, "bowling_team_id", "bat_runs_f", "one")   # bowling side's runs allowed per ball faced
f["xr_bat"] = f.xr_cell * f.season_f * f.opp_bowl_f
f["rae_bat"] = f.bat_runs_f - f.xr_bat
out_b = f[["match_id", "innings", "innings_ball_num", "xr_cell", "xr_prior_balls", "season_f", "opp_bowl_f", "xr_bat", "rae_bat"]]

# ---------------------------------------------------------------- bowlers (per delivery, incl. wides and no-balls)
d = b.copy()
d["one"] = 1.0
cell_keys_b = ["innings", "phase", "wkband", "rrband"]
r = prior_rate(d, cell_keys_b, "bowl_runs", "one", K_CELL, ["innings", "phase"])
d["xrc_cell"] = r[:, 0]
r = prior_rate(d, cell_keys_b, "bowl_wkt", "one", K_CELL, ["innings", "phase"])
d["xw_cell"] = r[:, 0]
d["season_f_b"] = season_factor(d, "bowl_runs", "one")
d["opp_bat_f"] = team_factor(d, "batting_team_id", "bowl_runs", "one")   # batting side's runs scored per delivery
d["xrc_bowl"] = d.xrc_cell * d.season_f_b * d.opp_bat_f
d["rse_bowl"] = d.xrc_bowl - d.bowl_runs
d["wae_bowl"] = d.bowl_wkt - d.xw_cell
out_d = d[["match_id", "innings", "innings_ball_num", "xrc_cell", "xw_cell", "season_f_b", "opp_bat_f", "xrc_bowl", "rse_bowl", "wae_bowl"]]

exp = b[["match_id", "innings", "innings_ball_num", "season"]].merge(out_b, how="left", on=["match_id", "innings", "innings_ball_num"]) \
       .merge(out_d, how="left", on=["match_id", "innings", "innings_ball_num"])
exp.to_parquet(WORK / "expected_ball.parquet", index=False)

# ---------------------------------------------------------------- checks: offsets per season (R14) and coverage
fb = f.groupby("season").agg(balls=("rae_bat", "size"), missing=("xr_bat", lambda x: int(x.isna().sum())),
                             mean_rae_per_ball=("rae_bat", "mean"), actual_rpb=("bat_runs_f", "mean"), expected_rpb=("xr_bat", "mean"))
db = d.groupby("season").agg(deliveries=("rse_bowl", "size"), missing=("xrc_bowl", lambda x: int(x.isna().sum())),
                             mean_rse_per_delivery=("rse_bowl", "mean"), actual_rpd=("bowl_runs", "mean"), expected_rpd=("xrc_bowl", "mean"),
                             mean_wae=("wae_bowl", "mean"))
summ = fb.join(db).reset_index()
summ.to_csv(TABLES / "step2_season_offsets.csv", index=False)
ph = f.groupby(["season", "phase"]).agg(mean_rae=("rae_bat", "mean"), balls=("rae_bat", "size")).reset_index()
ph.to_csv(TABLES / "step2_phase_offsets.csv", index=False)
print(summ.round(4).to_string())
print(ph.round(4).to_string())
