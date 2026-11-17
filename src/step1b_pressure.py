"""Step 1B: Pressure Index (0-100), buckets, WPA and robustness (D8, D11, D18, D25).

Leverage (core): expected absolute swing in win probability on this ball,
    L = sum_o P(o | situation) * |WP(state after o) - WP(state before)|,
    outcomes o in {dot, 1, 2, 3, 4, 6, wicket, extra (wide/no-ball: +1 run, ball not used)}.
    P(o | situation) comes from IPL matches played BEFORE this ball's match only (expanding window, D11);
    situation = innings x phase x wickets-lost band, shrunk toward innings x phase (k = 200 balls).
Context boosts (small, transparent): chase pressure, below par (batting first), death overs, playoffs, collapse.
    Double-counting rule (fixed in advance): Spearman rho(boost, leverage) on the 2022 reference balls only;
    rho > 0.7 -> dropped, 0.5 < rho <= 0.7 -> halved, otherwise kept.
Main index raw = L * (1 + sum_k w_k * b_k). NO close-game boost in the main index (D8).
0-100 scale and buckets (D18): percentile of the raw value within the earlier-season reference distribution:
    2023 <- 2022 reference balls; 2024 <- 2023; 2025 <- 2023-24; 2026 <- 2023-25.  High >= 80, Medium 50-80, Low < 50.
WPA: change in batting-side win probability on the ball; batter and bowler get counterfactual shares (see DEFINITIONS).
Run: python3 -I src/step1b_pressure.py
"""
import pickle, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from config import SEED, WORK, TABLES
import wp_model as W  # noqa: F401  (needed to unpickle the models)

K_SHRINK = 200
BOOST_W = {"chase_pressure": 0.10, "below_par": 0.10, "death": 0.10, "playoff": 0.10, "collapse": 0.10}
CLOSE_GAME_W = 0.10
OUTCOMES = ["dot", "r1", "r2", "r3", "r4", "r6", "wicket", "extra"]
O_RUNS = {"dot": 0, "r1": 1, "r2": 2, "r3": 3, "r4": 4, "r6": 6, "wicket": 0, "extra": 1}
O_BALL = {o: (0 if o == "extra" else 1) for o in OUTCOMES}
O_WKT = {o: (1 if o == "wicket" else 0) for o in OUTCOMES}

balls = pd.read_parquet(WORK / "balls_ipl.parquet")
matches = pd.read_csv(WORK / "matches_ipl.csv")
elig = pd.read_csv(WORK / "wp_eligibility.csv")
par = pd.read_csv(WORK / "par_by_match.csv")
wp = pd.read_parquet(WORK / "wp_ball.parquet")
with open(WORK / "wp_models.pkl", "rb") as fh:
    models = pickle.load(fh)
matches = matches.merge(elig, on="match_id")
matches["first_ball_ts"] = matches.match_date + " " + matches.first_ball_recorded
matches["margin_runs"] = np.where(matches.margin_type == "runs", matches.margin_value, np.nan)
matches["margin_wickets"] = np.where(matches.margin_type == "wickets", matches.margin_value, np.nan)

b = balls[(~balls.is_super_over) & balls.innings.astype(int).isin([1, 2])].copy()
b["innings"] = b.innings.astype(int)
b = b.merge(matches[["match_id", "first_ball_ts", "is_playoff", "margin_runs", "margin_wickets", "wp_eligible"]], on="match_id")
b = b.merge(par[["match_id", "par"]], on="match_id")
b["wkband"] = pd.cut(b.wickets_before, [-1, 2, 5, 10], labels=["0-2", "3-5", "6+"]).astype(str)

# outcome class of each ball (for frequencies)
def outcome_class(r_total, wide, nob, wkt, legal):
    o = np.where(wkt, "wicket", "")
    o = np.where((o == "") & (wide | nob), "extra", o)
    rr = np.clip(r_total, 0, 6)
    cls = np.select([rr == 0, rr == 1, rr == 2, rr == 3, rr == 4, rr == 5, rr == 6], ["dot", "r1", "r2", "r3", "r4", "r4", "r6"], "r6")
    return np.where(o == "", cls, o)

b["o_class"] = outcome_class(b.total_runs.values, b.is_wide.values.astype(bool), b.is_noball.values.astype(bool),
                             b.is_wicket.astype(str).str.lower().eq("true").values, b.legal_ball.values.astype(bool))

# ---------------------------------------------------------------- prior-only outcome frequencies (expanding by match)
order = matches.sort_values(["first_ball_ts", "match_id"]).match_id.tolist()
pos = {m: i for i, m in enumerate(order)}
b["mpos"] = b.match_id.map(pos)
cnt = b.groupby(["mpos", "innings", "phase", "wkband", "o_class"]).size().unstack("o_class", fill_value=0).reindex(columns=OUTCOMES, fill_value=0)
allpos = pd.MultiIndex.from_product([range(len(order)), [1, 2], ["Powerplay", "Middle", "Death"], ["0-2", "3-5", "6+"]],
                                    names=["mpos", "innings", "phase", "wkband"])
cnt_full = cnt.reindex(allpos, fill_value=0)
prior_cell = cnt_full.groupby(["innings", "phase", "wkband"]).cumsum() - cnt_full   # counts from earlier matches only
parent = prior_cell.groupby(["mpos", "innings", "phase"]).sum()
pc = prior_cell.reset_index().merge(parent.reset_index(), on=["mpos", "innings", "phase"], suffixes=("", "_par"))
n_c = pc[OUTCOMES].sum(1).values[:, None]
n_p = pc[[o + "_par" for o in OUTCOMES]].sum(1).values[:, None]
p_par = np.where(n_p > 0, pc[[o + "_par" for o in OUTCOMES]].values / np.maximum(n_p, 1), np.nan)
p_cell = (pc[OUTCOMES].values + K_SHRINK * p_par) / (n_c + K_SHRINK)
probs = pd.DataFrame(p_cell, columns=["p_" + o for o in OUTCOMES])
probs[["mpos", "innings", "phase", "wkband"]] = pc[["mpos", "innings", "phase", "wkband"]].values
probs["mpos"] = probs.mpos.astype(int); probs["innings"] = probs.innings.astype(int)
b = b.merge(probs, on=["mpos", "innings", "phase", "wkband"], how="left")

# ---------------------------------------------------------------- attach wp_before and its model
b = b.merge(wp[["match_id", "innings", "innings_ball_num", "wp_before", "wp_model", "reference_only"]],
            on=["match_id", "innings", "innings_ball_num"], how="inner")
b["balls_left"] = 120 - b.legal_balls_before
b["target_f"] = b.target.fillna(0)


def model_for(tag):
    if tag.startswith("lr_<"):
        return models[int(tag[4:])]
    return models[("ref2022", int(tag.split("_")[-1]))]


def predict_states(df, runs, wkts, balls_left):
    """WP for hypothetical states, grouped by the model that scored each ball."""
    out = np.empty(len(df))
    for tag, idx in df.groupby("wp_model").indices.items():
        st = pd.DataFrame({"innings": df.innings.values[idx], "runs": runs[idx], "wkts": wkts[idx],
                           "balls_left": balls_left[idx], "target": df.target_f.values[idx], "par": df.par.values[idx]})
        out[idx] = model_for(tag).predict(st)
    return out


R0, K0, B0 = b.team_runs_before.values, b.wickets_before.values, b.balls_left.values
lev = np.zeros(len(b))
for o in OUTCOMES:
    w_o = predict_states(b, R0 + O_RUNS[o], K0 + O_WKT[o], B0 - O_BALL[o])
    lev += b["p_" + o].values * np.abs(w_o - b.wp_before.values)
b["leverage"] = lev

# actual and counterfactual after-states for WPA
wkt_any = b.is_wicket.astype(str).str.lower().eq("true").values
legal = b.legal_ball.values.astype(int)
b["wp_after"] = predict_states(b, R0 + b.total_runs.values, K0 + wkt_any, B0 - legal)
striker_out = (b.player_out_id.astype(str) == b.striker_id.astype(str)).values & wkt_any
wp_bat = predict_states(b, R0 + b.bat_runs.values, K0 + striker_out, B0 - legal)
bowler_runs = (b.bat_runs + b.wide_runs + b.noball_runs).values
wp_bowl = predict_states(b, R0 + bowler_runs, K0 + b.is_bowler_wicket.values.astype(int), B0 - legal)
ns_out = wkt_any & ~striker_out & (b.player_out_id.astype(str) != "").values & (b.player_out_id.astype(str) != "nan").values
wp_no_wkt = predict_states(b, R0 + b.total_runs.values, K0, B0 - legal)
b["wpa_ball"] = b.wp_after - b.wp_before
b["wpa_batter"] = np.where(b.is_wide.values.astype(bool), 0.0, wp_bat - b.wp_before.values)
b["wpa_bowler"] = -(wp_bowl - b.wp_before.values)
b["wpa_nonstriker_out"] = np.where(ns_out, b.wp_after.values - wp_no_wkt, 0.0)

# ---------------------------------------------------------------- context boosts
bb = b.legal_balls_before.values
crr = np.where(bb > 0, b.team_runs_before.values * 6.0 / np.maximum(bb, 1), 0.0)
need = (b.target_f - b.team_runs_before).clip(lower=0).values
rrr = np.where(B0 > 0, need * 6.0 / np.maximum(B0, 1), 36.0)
b["chase_pressure"] = np.where(b.innings == 2, np.clip((rrr - crr) / 6.0, 0, 1), 0.0)
par_path = b.par.values * bb / 120.0
b["below_par"] = np.where(b.innings == 1, np.clip((par_path - b.team_runs_before.values) / 30.0, 0, 1), 0.0)
b["death"] = (b.phase == "Death").astype(float)
b["playoff"] = b.is_playoff.astype(bool).astype(float)
# collapse: 2+ wickets in the previous 18 legal balls of the same innings (before this ball)
b = b.sort_values(["match_id", "innings", "innings_ball_num"]).reset_index(drop=True)
coll = np.zeros(len(b))
for (mid, inn), idx in b.groupby(["match_id", "innings"]).indices.items():
    lb = b.legal_balls_before.values[idx]; wb = b.wickets_before.values[idx]
    for k, i in enumerate(idx):
        j = np.searchsorted(lb[:k + 1], lb[k] - 18, side="left")
        coll[i] = 1.0 if (wb[k] - wb[j]) >= 2 else 0.0
b["collapse"] = coll
# hindsight close-game flag (comparison only, D8)
close = (b.margin_runs.fillna(99) <= 10) | (b.margin_wickets.fillna(99) <= 2)
b["close_game_last5"] = (close & (b.overid.astype(int) >= 16)).astype(float)

# double-counting check on the 2022 reference balls only (decided before any scored season is used)
ref = b[b.reference_only]
corr_rows, w_final = [], {}
for k, w in BOOST_W.items():
    x = ref[k].values
    rho = float(spearmanr(x, ref.leverage.values).correlation) if np.std(x) > 0 else 0.0
    act = "dropped" if rho > 0.7 else ("halved" if rho > 0.5 else "kept")
    w_final[k] = 0.0 if act == "dropped" else (w / 2 if act == "halved" else w)
    corr_rows.append(dict(boost=k, spearman_with_leverage_2022ref=rho, initial_weight=w, final_weight=w_final[k], action=act,
                          share_of_ref_balls_nonzero=float((x > 0).mean())))
pd.DataFrame(corr_rows).to_csv(TABLES / "step1b_boost_correlation.csv", index=False)
boost_sum = sum(w_final[k] * b[k].values for k in w_final)
b["pi_raw"] = b.leverage * (1 + boost_sum)
b["pi_raw_lev"] = b.leverage
b["pi_raw_rule"] = b.chase_pressure + b.below_par + b.death + b.playoff + b.collapse + ((10 - b.wickets_before) <= 4).astype(float)
b["pi_raw_close"] = b.leverage * (1 + boost_sum + CLOSE_GAME_W * b.close_game_last5)

# ---------------------------------------------------------------- 0-100 scale vs earlier-season reference (D18)
REF_SEASONS = {2023: "ref2022", 2024: [2023], 2025: [2023, 2024], 2026: [2023, 2024, 2025]}
main = ~b.reference_only
for col, out in [("pi_raw", "pi"), ("pi_raw_lev", "pi_lev"), ("pi_raw_rule", "pi_rule"), ("pi_raw_close", "pi_close")]:
    b[out] = np.nan
    for s, refs in REF_SEASONS.items():
        refvals = np.sort(b.loc[b.reference_only, col].values) if refs == "ref2022" else np.sort(b.loc[main & b.season.isin(refs), col].values)
        sel = main & (b.season == s)
        b.loc[sel, out] = 100.0 * np.searchsorted(refvals, b.loc[sel, col].values, side="right") / len(refvals)
    b[out + "_bucket"] = np.select([b[out] >= 80, b[out] >= 50], ["High", "Medium"], "Low")
    b.loc[~main, out + "_bucket"] = "reference"

keep = ["match_id", "innings", "innings_ball_num", "season", "reference_only", "wp_model", "wp_before", "wp_after", "leverage",
        "chase_pressure", "below_par", "death", "playoff", "collapse", "close_game_last5",
        "pi_raw", "pi", "pi_bucket", "pi_lev", "pi_lev_bucket", "pi_rule", "pi_rule_bucket", "pi_close", "pi_close_bucket",
        "wpa_ball", "wpa_batter", "wpa_bowler", "wpa_nonstriker_out"]
pb = b[keep]
pb.to_parquet(WORK / "pressure_ball.parquet", index=False)

# ---------------------------------------------------------------- summary tables
m2 = b[main]
shares = m2.groupby("season").pi_bucket.value_counts(normalize=True).unstack().reset_index()
shares["balls"] = m2.groupby("season").size().values
shares.to_csv(TABLES / "step1b_bucket_shares.csv", index=False)
ov = []
for alt in ["pi_lev", "pi_rule", "pi_close"]:
    hi_main = m2.pi_bucket == "High"; hi_alt = m2[alt + "_bucket"] == "High"
    ov.append(dict(definition=alt, high_balls_main=int(hi_main.sum()), high_balls_alt=int(hi_alt.sum()),
                   share_of_main_high_also_high=float((hi_main & hi_alt).sum() / hi_main.sum()),
                   jaccard=float((hi_main & hi_alt).sum() / (hi_main | hi_alt).sum()),
                   spearman_raw=float(spearmanr(m2.pi_raw, m2["pi_raw" + {"pi_lev": "_lev", "pi_rule": "_rule", "pi_close": "_close"}[alt]]).correlation)))
pd.DataFrame(ov).to_csv(TABLES / "step1b_definition_overlap_balls.csv", index=False)
pmap = m2.assign(over=m2.overid.astype(int) if "overid" in m2 else 0).groupby(["innings", "overid", "wickets_before"]).agg(mean_pi=("pi", "mean"), balls=("pi", "size")).reset_index()
pmap.to_csv(TABLES / "step1b_pressure_map.csv", index=False)
hist = pd.cut(m2.pi, np.arange(0, 101, 5), include_lowest=True).value_counts(sort=False).rename_axis("pi_bin").reset_index(name="balls")
hist["pi_bin"] = hist.pi_bin.astype(str)
hist.to_csv(TABLES / "step1b_distribution.csv", index=False)
wpa_check = m2.groupby("match_id").wpa_ball.sum().describe()
print(pd.DataFrame(corr_rows).round(3).to_string())
print(shares.round(3).to_string())
print(pd.DataFrame(ov).round(3).to_string())
print("WPA per match (sum of ball changes) summary:", wpa_check.round(3).to_dict())
