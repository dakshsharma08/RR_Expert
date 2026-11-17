"""Step 7 (A): build the dashboard data payload and the summary-numbers file from outputs/tables (single source).

Outputs: outputs/deliverables/dashboard_payload.json   (pre-aggregated; only showcase matches carry ball-level data)
         outputs/tables/summary_numbers.json             (every headline number used by the PDF, cheat sheet, notes)
Run: python3 -I src/step7_payload.py

Round 1 brief (organisers' clarification, 17 Nov; D38): the deliverable is the Top 10 batters and the Top 10
bowlers under pressure, with the method. It is NOT an auction recommendation, so no availability, price,
squad-fit or auction content is written to the payload. Step 5 tables stay in the repo but are not used here.
"""
import json, sys, datetime, hashlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import pandas as pd
from config import TABLES, WORK, DELIVERABLES, SEED, IPL_TEAMS, RAW_SHA256, LOGS
import player_agg as P

T = lambda n, **k: pd.read_csv(TABLES / f"{n}.csv", **k)
r1 = lambda x, d=1: None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), d)

scope = T("step3_scope", dtype={"player_id": str})
_pm = pd.read_csv(WORK / "player_map.csv", dtype={"player_id": str}).set_index("player_id").canonical_name
from io_raw import load_raw as _lr
_rn = _lr()[["non_striker_id", "non_striker_name"]].drop_duplicates("non_striker_id").set_index("non_striker_id").non_striker_name
scope["player_name"] = scope.player_name.fillna(scope.player_id.map(_pm)).fillna(scope.player_id.map(_rn))
cand = T("step5_candidates", dtype={"player_id": str})
sb = T("step4_scores_batters", dtype={"player_id": str}); sw = T("step4_scores_bowlers", dtype={"player_id": str})
sa = T("step4_scores_allrounders", dtype={"player_id": str})
bm = T("step3_batting_metrics", dtype={"player_id": str}).set_index("player_id")
wm = T("step3_bowling_metrics", dtype={"player_id": str}).set_index("player_id")
trend = T("step4_player_season", dtype={"player_id": str})
bt = T("step4_backtest_summary"); comp = T("step4_component_info"); sens = T("step4_sensitivity")
rob = T("step4_definition_robustness"); wpe = T("step1a_wp_eval"); cal = T("step1a_calibration")
shares = T("step1b_bucket_shares"); bcorr = T("step1b_boost_correlation"); ovb = T("step1b_definition_overlap_balls")
ex = T("step1c_example_balls"); show = T("step1c_showcase_matches"); pmap_ = T("step1b_pressure_map"); dist = T("step1b_distribution")
ns = T("step5_not_scorable", dtype={"player_id": str})   # descriptive list of in-scope players below the sample minimum
cov = T("step0_coverage"); notes0 = T("step0_data_notes"); offs = T("step2_season_offsets")
matches = pd.read_csv(WORK / "matches_ipl.csv"); elig = pd.read_csv(WORK / "wp_eligibility.csv")

# ------------------------------------------------ ball frames for receipts, aggregates, showcase
b = P.load_ball_frames("pi_bucket")
b = b[b.season.isin([2023, 2024, 2025, 2026])]
bat, bowl = P.bat_balls(b), P.bowl_balls(b)
inscope = set(scope.player_id)
scorable = set(cand.player_id)

# receipts: top-3 positive WPA innings / spells per scorable player
mi = matches.set_index("match_id")
def receipts(rows, pid, kind):
    g = rows[rows.player_id == pid].groupby("match_id").agg(wpa=("wpa", "sum"), runs=("runs", "sum"), balls=("balls", "sum"),
                                                              **({"wkts": ("wkts", "sum"), "legal": ("legal", "sum")} if kind == "bowl" else {"outs": ("outs", "sum")}))
    g = g[g.wpa > 0].sort_values("wpa", ascending=False).head(3)
    out = []
    for m, r in g.iterrows():
        mm = mi.loc[m]
        opp = mm.batting_second if mm.batting_first in rows[rows.match_id == m].player_name.head(0) else None
        what = (f"{int(r.runs)} off {int(r.balls)} balls" if kind == "bat" else f"{int(r.wkts)} wkt(s), {int(r.runs)} runs off {int(r.legal)} legal balls")
        res = f"{mm.winner} won" if isinstance(mm.winner, str) else "no result/tie"
        out.append(dict(match=f"{mm.batting_first} v {mm.batting_second}", date=mm.match_date, what=what,
                        wpa=r1(100 * r.wpa, 1), result=res, playoff=mm.playoff_label if isinstance(mm.playoff_label, str) else ""))
    return out

# pre-aggregated table for filters (scorable players only)
def agg_rows(rows, kind):
    keys = ["player_id", "season", "phase", "bucket", "innings"]
    if kind == "bat":
        a = rows[rows.player_id.isin(scorable)].groupby(keys).agg(n=("balls", "sum"), r=("runs", "sum"), o=("outs", "sum"),
                                                                   f=("fours", "sum"), s=("sixes", "sum"), d=("dots", "sum"),
                                                                   x=("rae", "sum"), w=("wpa", "sum")).reset_index()
    else:
        a = rows[rows.player_id.isin(scorable)].groupby(keys).agg(n=("balls", "sum"), l=("legal", "sum"), r=("runs", "sum"),
                                                                   k=("wkts", "sum"), d=("dots", "sum"), bd=("bdry", "sum"),
                                                                   x=("rae", "sum"), w=("wpa", "sum")).reset_index()
    a["phase"] = a.phase.map({"Powerplay": "P", "Middle": "M", "Death": "D"}); a["bucket"] = a.bucket.str[0]
    for c in a.columns:
        if a[c].dtype.kind == "f":
            a[c] = a[c].round(3)
    return a.values.tolist(), list(a.columns)

agg_bat, agg_bat_cols = agg_rows(bat, "bat")
agg_bowl, agg_bowl_cols = agg_rows(bowl, "bowl")

# ------------------------------------------------ players
def score_block(df, pid):
    r = df[df.player_id == pid]
    if r.empty:
        return None
    r = r.iloc[0]
    n = len(df)
    rank = int((df.score > r.score).sum() + 1)
    blk = dict(score=r1(r.score, 3), lo=r1(r.score_lo80, 3), hi=r1(r.score_hi80, 3), rank=rank, of=n, pct=r1(100 * (1 - (rank - 1) / n), 0))
    for c in ("S", "C", "S_raw", "I_raw", "H_raw", "seasons_assessed", "seasons_positive", "n_hi_w", "hi_qual_n"):
        if c in r:
            blk[c] = r1(r[c], 4)
    return blk

trend_g = trend.groupby(["player_id", "role"])
players = []
nm = pd.concat([scope.set_index("player_id").player_name])
for pid in sorted(inscope, key=lambda p: str(nm.get(p, p))):
    c = cand[cand.player_id == pid]
    c = c.iloc[0] if len(c) else None
    srow = scope[scope.player_id == pid].iloc[0]
    rec = dict(id=pid, name=str(srow.player_name) if isinstance(srow.player_name, str) else f'id {pid}', role=srow.role, scorable=c is not None,
               hi_faced=int(srow.hi_balls_faced), hi_bowled=int(srow.hi_legal_bowled))
    if c is not None:
        rec.update(sub_role=c.sub_role, team=c.latest_team, team_season=int(c.latest_season),
                   similar=[s for s in str(c.similar_players).split("|") if s and s != "nan"])
        rec["bat"] = score_block(sb, pid); rec["bowl"] = score_block(sw, pid)
        rec["ar"] = score_block(sa, pid) if pid in set(sa.player_id) else None
        main = rec["ar"] or rec["bat"] or rec["bowl"]
        rec["score"], rec["lo"], rec["hi"] = main["score"], main["lo"], main["hi"]
        role_word = {"Batter": "batters", "Bowler": "bowlers", "All-rounder": "all-rounders"}[srow.role]
        width = main["hi"] - main["lo"]
        certainty = "a fairly tight range" if width < 35 else ("a wide range: treat with caution" if width >= 55 else "a moderate range")
        rec["verdict"] = (f"Ranked {main['rank']} of {main['of']} {role_word} on historical pressure performance "
                          f"(score {main['score']:.0f}, 80% range {main['lo']:.0f}–{main['hi']:.0f}: {certainty}). "
                          f"Past record (IPL 2023–26), not a forecast.")
        if pid in bm.index:
            m_ = bm.loc[pid]
            rec["bat_hl"] = {k: r1(m_.get(k)) for k in ["High_balls", "High_runs", "High_outs", "High_sr", "High_avg", "High_balls_per_out",
                             "High_boundary_pct", "High_dot_pct", "High_rae_per100", "High_wpa_per100", "Low_balls", "Low_sr",
                             "Low_avg", "Low_boundary_pct", "Low_dot_pct", "Low_rae_per100", "Low_wpa_per100", "pressure_drop_per100",
                             "High_rae_per100_pace", "High_balls_pace", "High_rae_per100_spin", "High_balls_spin", "High_rae_per100_death",
                             "High_balls_death", "High_rae_per100_setting", "High_balls_setting", "High_rae_per100_chasing", "High_balls_chasing"]}
        if pid in wm.index:
            m_ = wm.loc[pid]
            rec["bowl_hl"] = {k: r1(m_.get(k), 2) for k in ["High_legal", "High_runs", "High_wkts", "High_econ", "High_balls_per_wkt",
                              "High_dot_pct", "High_boundary_pct", "High_rse_per100", "High_wpa_per100", "Low_legal", "Low_econ",
                              "Low_dot_pct", "Low_rse_per100", "pressure_drop_per100", "High_rse_per100_vs_lhb", "High_balls_vs_lhb",
                              "High_rse_per100_vs_rhb", "High_balls_vs_rhb", "High_rse_per100_death", "High_balls_death", "death_econ_all"]}
        rec["trend"] = {role: [[int(r.season), r1(r.per100, 1), int(r.balls), r1(r.league_per100, 1)] for r in g.itertuples()]
                        for (p, role), g in trend_g if p == pid}
        rec["receipts"] = receipts(bat, pid, "bat") if srow.role in ("Batter", "All-rounder") else receipts(bowl, pid, "bowl")
        caveats = []
        if width >= 55: caveats.append("wide 80% range")
        if (main.get("seasons_assessed") or 0) <= 1: caveats.append("one assessed season or fewer")
        rec["caveats"] = caveats
    else:
        rec["reason"] = "Not scorable on IPL data: below minimum High-pressure sample (bat ≥100 faced / bowl ≥60 legal)"
    players.append(rec)

# ------------------------------------------------ pressure tab: showcase matches (ball level)
pb = pd.read_parquet(WORK / "pressure_ball.parquet")
from loaders import load_balls
bl = load_balls()
showcase = []
for r in show.itertuples():
    x = pb[pb.match_id == r.match_id].merge(bl[["match_id", "innings", "innings_ball_num", "overid", "legal_balls_before", "team_runs_before",
                                                 "wickets_before", "target", "striker_name", "bowler_name", "total_runs", "is_wicket",
                                                 "dismissal_type", "batting_team_id"]], on=["match_id", "innings", "innings_ball_num"])
    x = x.sort_values(["innings", "innings_ball_num"])
    bf = str(matches.set_index("match_id").batting_first_id[r.match_id])
    balls = []
    for y in x.itertuples():
        wp_bf = y.wp_before if str(y.batting_team_id) == bf else 1 - y.wp_before   # batting-first team's win probability
        balls.append([int(y.innings), int(y.legal_balls_before), r1(wp_bf, 3), r1(y.pi, 0), y.pi_bucket[0],
                      f"{y.striker_name} v {y.bowler_name}: {int(y.team_runs_before)}/{int(y.wickets_before)}"
                      + (f", need {int(y.target - y.team_runs_before)} off {120 - int(y.legal_balls_before)}" if y.innings == 2 else "")
                      + (" | WICKET" if str(y.is_wicket).lower() == "true" else f" | {int(y.total_runs)} run(s)"),
                      r1(100 * y.wpa_batter, 1), r1(100 * y.wpa_bowler, 1)])
    showcase.append(dict(id=int(r.match_id), title=f"{r.batting_first} v {r.batting_second}", date=r.match_date,
                         result=(f"{r.winner} won by {int(r.margin_value)} {str(r.margin_type).replace('_', ' ')}" if isinstance(r.winner, str) else ""),
                         playoff=r.playoff_label if isinstance(r.playoff_label, str) else "", rr=bool(r.has_rr),
                         batting_first=r.batting_first, balls=balls))

# ------------------------------------------------ leaderboard rows and "what the method adds"
def lb_rows(df, role):
    out = []
    naive_src = bm if role == "bat" else wm
    for r in df.itertuples():
        c = cand[cand.player_id == r.player_id]
        c = c.iloc[0] if len(c) else None
        nv = None
        if r.player_id in naive_src.index:
            q = naive_src.loc[r.player_id]
            if role == "bat":
                tb = (q.High_balls or 0) + (q.Low_balls or 0)
                nv = r1(100 * ((q.High_runs or 0) + (q.Low_balls or 0) * (q.Low_sr or 0) / 100) / tb, 1) if tb else None
            else:
                tl = (q.High_legal or 0) + (q.Low_legal or 0)
                nv = r1(6 * ((q.High_runs or 0) + (q.Low_runs or 0)) / tl, 2) if tl else None
        out.append(dict(id=r.player_id, score=r1(r.score, 3), lo=r1(r.score_lo80, 3), hi=r1(r.score_hi80, 3), rank=int(r.rank) if hasattr(r, "rank") else None,
                        S=r1(r.S * 100, 1), C=r1(r.C * 100, 0), n=int(r.hi_qual_n), naive=nv,
                        caveat=("wide 80% range" if (r.score_hi80 - r.score_lo80) >= 55 else "")))
    return out

lb = {"bat": lb_rows(sb, "bat"), "bowl": lb_rows(sw, "bowl"),
      "ar": [dict(id=r.player_id, score=r1(r.score), lo=r1(r.score_lo80), hi=r1(r.score_hi80), bat=r1(r.bat_score), bowl=r1(r.bowl_score),
                  combined_wpa_per_match=r1(100 * r.combined_wpa_per_match, 2)) for r in sa.itertuples()]}

# ------------------------------------------------ Round 1 answer: Top 10 batters and Top 10 bowlers under pressure (D38)
def top10(df, role):
    d = df.sort_values("score", ascending=False).reset_index(drop=True)
    out = []
    for i, r in d.head(10).iterrows():
        c = cand[cand.player_id == r.player_id]
        team = f"{c.latest_team.iloc[0]} ({int(c.latest_season.iloc[0])})" if len(c) else ""
        sub = c.sub_role.iloc[0] if len(c) else ""
        if role == "bat":
            q = bm.loc[r.player_id]
            stats = dict(balls=int(q.High_balls), runs=int(q.High_runs), sr=r1(q.High_sr, 1), outs=int(q.High_outs),
                         above_per100=r1(q.High_rae_per100, 1), wpa_per100=r1(q.High_wpa_per100, 2))
            why = (f"{stats['balls']} High-pressure balls faced (2023–26): {stats['runs']} runs at strike rate {stats['sr']:.0f}, "
                   f"{stats['above_per100']:+.0f} runs per 100 balls above an average batter in the same situations")
        else:
            q = wm.loc[r.player_id]
            stats = dict(balls=int(q.High_legal), runs=int(q.High_runs), econ=r1(q.High_econ, 2), wkts=int(q.High_wkts),
                         saved_per100=r1(q.High_rse_per100, 1), wpa_per100=r1(q.High_wpa_per100, 2))
            why = (f"{stats['balls']} High-pressure balls bowled (2023–26): {stats['wkts']} wickets at economy {stats['econ']:.2f}, "
                   f"{stats['saved_per100']:+.0f} runs per 100 balls saved against an average bowler in the same situations")
        sa_, sp_ = int(r.seasons_assessed), int(r.seasons_positive)
        if sa_:
            why += f"; above expected in {sp_} of {sa_} assessed seasons"
        out.append(dict(rank=i + 1, id=r.player_id, name=r.player_name, team=team, sub_role=sub,
                        score=r1(r.score, 3), lo=r1(r.score_lo80, 3), hi=r1(r.score_hi80, 3), stats=stats, why=why + "."))
    nxt = d.iloc[10]
    tenth = d.iloc[9]
    edge = dict(next_name=nxt.player_name, next_id=nxt.player_id, next_score=r1(nxt.score, 3), next_lo=r1(nxt.score_lo80, 3),
                next_hi=r1(nxt.score_hi80, 3),
                overlaps_10th=bool(nxt.score_hi80 >= tenth.score_lo80 and tenth.score_hi80 >= nxt.score_lo80))
    return out, edge

tc = pd.read_csv(TABLES / "step4_too_close_to_call.csv").set_index("role")
t10_bat, edge_bat = top10(sb, "bat")
t10_bowl, edge_bowl = top10(sw, "bowl")
top10_block = dict(
    bat=t10_bat, bowl=t10_bowl, edge=dict(bat=edge_bat, bowl=edge_bowl),
    pairs=dict(bat=dict(total=int(tc.loc["bat", "top10_pairs"]), separated=int(tc.loc["bat", "pairs_separated_by_80pct_ranges"])),
               bowl=dict(total=int(tc.loc["bowl", "top10_pairs"]), separated=int(tc.loc["bowl", "pairs_separated_by_80pct_ranges"]))),
    pool=dict(bat=int(len(sb)), bowl=int(len(sw))),
    eligibility="Rated if the player faced at least 100 High-pressure balls (batters) or bowled at least 60 legal High-pressure balls (bowlers) in IPL 2023–26.",
    read="Ranked by Clutch Score (0–100 within role). The 80% ranges of top-10 players overlap, so read each list as a group of ten, not a strict order.",
    not_scorable=[dict(id=r.player_id, name=r.player_name, faced=int(r.hi_balls_faced), bowled=int(r.hi_legal_bowled), reason=r.reason)
                  for r in ns.itertuples()],
)

# ------------------------------------------------ method & proof
btp = bt[bt.fold == "pooled"].set_index("role")
summary = dict(
    seasons_scored="2023–2026", training_only="2022", ipl_matches=int(len(matches)), ipl_balls=int(len(pd.read_parquet(WORK / "balls_ipl.parquet", columns=["match_id"]))),
    ipl_matches_span="2022–2026", scored_matches=int((matches.season >= 2023).sum()), scored_balls=int(len(b)),
    wp_eligible=int(elig.wp_eligible.sum()), last_match=str(matches.match_date.max()), in_scope=int(len(scope)),
    scorable_bat=int(len(sb)), scorable_bowl=int(len(sw)), scorable_ar=int(len(sa)), not_scorable=int(len(ns)),
    brier={int(r.season): r1(r.brier, 3) for r in wpe[wpe.innings == "all"].itertuples()},
    brier_inn={f"{int(r.season)}_{r.innings}": r1(r.brier, 3) for r in wpe[wpe.innings != "all"].itertuples()},
    high_share={int(r.season): r1(100 * r.D27_High, 1) for r in shares.itertuples()},
    backtest=dict(bat_score=r1(btp.loc["bat", "score_hit_rate_excl"]), bat_naive=r1(btp.loc["bat", "naive_hit_rate_excl"]),
                  bat_diff_lo=r1(btp.loc["bat", "hit_diff_lo80"]), bat_diff_hi=r1(btp.loc["bat", "hit_diff_hi80"]),
                  bowl_score=r1(btp.loc["bowl", "score_hit_rate_excl"]), bowl_naive=r1(btp.loc["bowl", "naive_hit_rate_excl"]),
                  bowl_diff_lo=r1(btp.loc["bowl", "hit_diff_lo80"]), bowl_diff_hi=r1(btp.loc["bowl", "hit_diff_hi80"]),
                  bat_rho=r1(btp.loc["bat", "spearman_score_outcome"], 2), bat_rho_naive=r1(btp.loc["bat", "spearman_naive_outcome"], 2),
                  bowl_rho=r1(btp.loc["bowl", "spearman_score_outcome"], 2), bowl_rho_naive=r1(btp.loc["bowl", "spearman_naive_outcome"], 2),
                  bat_base=r1(btp.loc["bat", "base_rate_random_pick"]), bowl_base=r1(btp.loc["bowl", "base_rate_random_pick"]),
                  bat_claim=str(btp.loc["bat", "claim"]), bowl_claim=str(btp.loc["bowl", "claim"])),
    effective_weights={f"{r.role}_{r.component}": r1(r.effective_weight, 3) for r in comp.itertuples()},
    sens_min_overlap=r1(sens.top10_overlap_pct.min(), 0),
    robustness={f"{r.variant}_{r.role}": r1(r.top20_overlap_pct, 0) for r in rob.itertuples()},
    top10_bat=[x["name"] for x in t10_bat], top10_bowl=[x["name"] for x in t10_bowl],
    season_offsets={int(r.season): r1(r.mean_rae_per_ball, 3) for r in offs.itertuples()},
)
verdict_word = ("evidence of persistence" if all("evidence of persistence" in str(btp.loc[r_, "claim"]) for r_ in ("bat", "bowl"))
                else "persistence not demonstrated")
summary["claim"] = f"Historical pressure-performance indicator; {verdict_word}. It describes IPL 2023–26; it is not a forecast (D15)."
method = dict(
    flow=[f"Data: {len(matches)} IPL matches 2022–26 ball by ball, checked against the organisers' match list; 2022 used only to train, {int((matches.season >= 2023).sum())} matches (2023–26) rated.",
          "Win probability: simple logistic model per season, trained only on earlier seasons.",
          "Pressure Index: how much each ball can swing the result (leverage), plus small context boosts, ranked 0–100 against earlier balls only.",
          "Fair comparison: runs above (batters) or saved (bowlers) versus an average player in the same situation, from earlier matches only.",
          "Reliability: small samples pulled toward average (shrinkage), recent seasons weighted more, 80% ranges by resampling matches.",
          "Clutch score 0–100: frozen weights, percentile-like scale within role; backtested against a naive ranking."],
    formula=("Score = 100 × Φ( Σ w·z / sd ) with z = standardised, shrunk component among scorable players of the role; "
             "pre-registered w: Skill 0.40, Impact 0.25, Holds-up 0.15, Consistency 0.20. A component with no detectable player "
             "differences gets weight 0 (D30). Effective weights: " + "; ".join(
                 f"{r_} " + ", ".join(f"{c} {100 * comp[(comp.role == r_) & (comp.component == c)].effective_weight.iloc[0]:.0f}%" for c in "SIHC")
                 for r_ in ("bat", "bowl")) + "."),
    weights=comp.to_dict("records"),
    why_not_average=["Components are on different scales, so each is standardised before weighting.",
                     "Small samples are shrunk toward the average first, so 30 lucky balls can't top the list.",
                     "Weights were frozen before any ranking existed (pre-registration), never tuned to results."],
    backtest=bt.to_dict("records"), sensitivity=sens.to_dict("records"), robustness=rob.to_dict("records"),
    wp_eval=wpe.to_dict("records"), calibration=cal.to_dict("records"), boosts=bcorr.to_dict("records"),
    overlap_balls=ovb.to_dict("records"), shares=shares.to_dict("records"), offsets=offs.to_dict("records"),
    data_notes=notes0.fillna("").to_dict("records"),
    too_close=(pd.read_csv(TABLES / "step4_too_close_to_call.csv").to_dict("records") if (TABLES / "step4_too_close_to_call.csv").exists() else []),
    official_check=(pd.read_csv(TABLES / "step0_official_meta_check.csv").to_dict("records") if (TABLES / "step0_official_meta_check.csv").exists() else []),
    limitations=[
        "No venue adjustment: venue names could not be looked up (source sites blocked). The organisers' venue ids arrived on 17 Nov, after the method was frozen, so they are not used.",
        "First-innings win probabilities have little skill beyond the base rate; second-innings ones are informative.",
        "The 2023 model learned from one season (2022) only.",
        "Expected runs from earlier matches trail scoring jumps: mean RAE per ball +0.02 (2023), +0.04 (2024), +0.00 (2025), +0.02 (2026). Season-centred check: top-20 unchanged 100%.",
        ("Components with no detectable player differences at these sample sizes (weight 0): " +
         (", ".join(f"{r_.role} {dict(S='skill', I='match impact (WPA)', H='holds up', C='consistency')[r_.component]}" for r_ in comp[~comp.informative].itertuples()) or "none") + "."),
        "Top-10 rankings are too close to call: no pair of top-10 players is separated by their 80% ranges (step4_too_close_to_call).",
        "Backtest: persistence of the score from one season to the next is not demonstrated (small samples; see Method & Proof for hit rates against naive and random-pick baselines).",
        "IPL only (2023–26): T20I and A-team matches in the dataset are left out so every player is measured against the same opposition level and the same playing conditions (D38).",
        "Fielding is not in the data; wicketkeeper and captaincy are not identifiable."],
    stamp=dict(last_match=str(matches.match_date.max()), build=datetime.date.today().isoformat(), seed=SEED, data_sha256=RAW_SHA256),
    audit=[])
audit_path = TABLES / "step8_audit.csv"
if audit_path.exists():
    method["audit"] = pd.read_csv(audit_path).fillna("").to_dict("records")

glossary = [
    ("Pressure Index (0–100)", "How much a ball could swing the match result, ranked against earlier balls; 80+ = High pressure."),
    ("Leverage", "The expected size of the win-probability swing on a ball, given what usually happens in that situation."),
    ("Win probability", "The batting side's chance of winning before a ball, from a model trained on earlier seasons only."),
    ("WPA (win probability added)", "How much a player's ball changed his team's chance of winning (in percentage points)."),
    ("Runs Above Expected (RAE)", "Runs scored minus what an average batter would score on the same balls in the same situations."),
    ("Runs Saved vs Expected (RSE)", "Runs an average bowler would concede on the same balls minus the runs actually conceded."),
    ("Shrinkage", "Pulling small samples toward the average so a few lucky balls can't top a ranking."),
    ("80% range", "The range we are 80% sure the true value sits in, from resampling the player's matches."),
    ("Consistency", "Share of seasons (with ≥30 High-pressure balls) in which the player was above expected."),
    ("Clutch Reliability Score", "0–100 historical pressure-performance indicator within role; roughly a percentile. Not a forecast."),
    ("Backtest", "Score built from earlier seasons only, then checked against the next season's pressure performance."),
    ("Too close to call", "Two players whose 80% ranges overlap: the data can't say who is better."),
]
summary["exec_summary"] = [
    "Pressure, defined ball by ball: how much one ball could swing the match result (win-probability leverage), lifted for chases, being below par, the death overs, playoffs and collapses. The top 20% of balls, ranked only against earlier balls, count as High pressure.",
    "Performance under pressure: runs above (batters) or saved (bowlers) versus an average player in exactly the same situation, plus win probability added, holding up versus the player's own low-pressure level and consistency across seasons; small samples are pulled toward average.",
    f"Top 10 batters under pressure (IPL 2023–26): {', '.join(summary['top10_bat'])}.",
    f"Top 10 bowlers under pressure (IPL 2023–26): {', '.join(summary['top10_bowl'])}.",
    f"How sure we are: the 80% ranges inside each top 10 overlap, so read each as a group, not a strict order. Tested one season ahead, the score did not beat simple strike-rate/economy rankings (batters {summary['backtest']['bat_score']}% v {summary['backtest']['bat_naive']}%; bowlers {summary['backtest']['bowl_score']}% v {summary['backtest']['bowl_naive']}%): it is a record of past pressure performance, not a forecast.",
]

how_to_use = [
    "What the score is: a 0–100 rating of how well a player did on the balls that could swing the match (IPL 2023–26), compared with an average player in the same situation.",
    "How to read it: higher is better, and the whisker is how sure we are. When two whiskers overlap the data cannot separate the players, so each top 10 is a group, not a strict order.",
    "What it is not: a forecast. Tested one season ahead, it did not beat simple strike-rate or economy rankings.",
]
payload = dict(meta=dict(name="RR Clutch Index", subtitle="Who performs best under pressure · IPL 2023–26", how_to_use=how_to_use,
                         thesis="Who delivered when the match was on the line: the top 10 batters and top 10 bowlers under pressure in IPL 2023–26, and how sure we are.",
                         brief="SupeRR Selector Season 2, Round 1: identify the top 10 batters and top 10 bowlers who perform best under pressure, and show the method.",
                         **summary["stamp"] if "stamp" in summary else {}, **method["stamp"], kpi=summary),
               exec=summary["exec_summary"], glossary=[dict(term=a, meaning=b_) for a, b_ in glossary], players=players,
               agg=dict(bat=agg_bat, bat_cols=agg_bat_cols, bowl=agg_bowl, bowl_cols=agg_bowl_cols),
               pressure=dict(cutoffs=dict(high=80, medium=50, rule="High = 80+ (about the top 20% of earlier balls), Medium = 50-80, Low = below 50 (D18/D27)"),
                             formula="Pressure = leverage × (1 + 0.1·chase pressure + 0.1·below par + 0.1·death + 0.1·playoff + 0.1·collapse), ranked 0–100 against earlier balls only",
                             explain=["Every ball gets a win probability for the batting side, from a model that has only seen earlier seasons.",
                                      "Leverage = how much that probability could swing on this ball, weighted by what usually happens.",
                                      "Ranked against earlier balls: 80+ = High (about the top 20%), 50–80 = Medium, below 50 = Low."],
                             showcase=showcase, map=pmap_.to_dict("records"), dist=dist.to_dict("records"),
                             shares=shares.to_dict("records"), examples=ex.fillna("").to_dict("records"),
                             wp_eval=wpe.to_dict("records"), calibration=cal.to_dict("records"), boosts=bcorr.to_dict("records"),
                             overlap_balls=ovb.to_dict("records"), robustness=rob.to_dict("records")),
               leaderboard=lb, top10=top10_block, method=method)


def clean(o):
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating, float)):
        return None if np.isnan(o) else round(float(o), 4)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    return o


DELIVERABLES.mkdir(parents=True, exist_ok=True)
js = json.dumps(clean(payload), separators=(",", ":"), ensure_ascii=False)
(DELIVERABLES / "dashboard_payload.json").write_text(js)
(TABLES / "summary_numbers.json").write_text(json.dumps(clean(dict(summary=summary, top10=top10_block)), indent=1, ensure_ascii=False))
print("payload bytes:", len(js.encode()), "| players:", len(players), "| showcase:", len(showcase), "| agg rows:", len(agg_bat) + len(agg_bowl))
print(json.dumps(clean(summary), indent=0)[:2500])
