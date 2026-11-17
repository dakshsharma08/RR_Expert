"""Step 5: auction lens. RR squad gaps, shortlist, budget optimiser (Plans A/B), XI, contrarian picks, unsung hero, avoid list.

All external facts are UNKNOWN or REPORTED (F1; web reading blocked, D23). Every input the data can't give
is an explicit [ASSUMPTION] in outputs/tables/step5_assumptions.csv. Data-derived inferences are labelled as such.
Run: python3 -I src/step5_auction.py
"""
import itertools, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import pandas as pd
from config import TABLES, WORK, IPL_TEAMS, OTHER_TEAMS
from io_raw import load_raw
import player_agg as P

RR = "3"
ASSUMPTIONS = [
    ("A1", "RR's current group", "RR players who appeared for RR in IPL 2026, from the data", "RR's 2027 retention list is UNKNOWN (F1-019: not published or not readable). The 2026 group is the best data-based proxy. Recheck at F2"),
    ("A2", "Availability of every non-RR player", "UNKNOWN: treated as 'possibly in the auction pool'", "Retention and release lists can't be read (network policy, D23). Every shortlist card says 'pursue only if in the official auction list'"),
    ("A3", "Likely retained (excluded from shortlist)", "Each franchise's 6 most-involved players in IPL 2026 (balls faced + legal balls bowled)", "Franchises usually keep their core in a mini-auction. A transparent proxy, not a fact. These players still appear on the leaderboard"),
    ("A4", "RR auction purse", "Rs 15.0 crore", "UNKNOWN (F1-022). Reported context: Rs 2.65 cr left after the 2026 auction (F1-024), with 2027 releases unknown. Illustrative only; the dashboard budget builder lets the user change it"),
    ("A5", "RR open slots", "6 slots, of which up to 2 overseas", "UNKNOWN (F1-023). Squad limits 18–25 and overseas max 8 are REPORTED (F1-006/007)"),
    ("A6", "Price bands", "Rule-based from data: Established (≥3 of 2023–26 seasons with ≥10 matches) Indian Rs 8–14 cr / overseas Rs 6–12 cr; Regular (2 such seasons) Rs 3–8 / Rs 3–7 cr; Emerging Rs 0.3–3 cr. Walk-away = top of band", "No market data could be read. Bands are illustrative assumptions, not predictions"),
    ("A7", "Overseas / Indian status", "Inferred from the dataset: a player who appears for a non-India national side (T20Is in this dataset) is overseas; one who appears for India is Indian (capped). Otherwise UNKNOWN", "Evidence-based inference, not verified externally"),
    ("A8", "Age", "UNKNOWN for every player", "Not in the data and not verifiable here"),
    ("A9", "Overseas limit in XI", "4 (REPORTED, F1-008)", "One source only"),
    ("A11", "Wicketkeeper", "Dhruv Jurel keeps wicket in the sample XI", "The keeper is not recorded in the data (no fielder column). Jurel is RR's most-involved middle-order batter in 2026; keeper status is external and unverified here"),
    ("A10", "Optimiser value", "score/100 x 1.5 if the player fills a measured RR gap (Step 5 gap table), x 0.6 otherwise", "Puts the purse on RR's measured weaknesses. RR's bowling is above league in every phase, so extra bowlers add less"),
]

scope = pd.read_csv(TABLES / "step3_scope.csv", dtype={"player_id": str})
pmap = pd.read_csv(WORK / "player_map.csv", dtype={"player_id": str})
sb = pd.read_csv(TABLES / "step4_scores_batters.csv", dtype={"player_id": str}).set_index("player_id")
sw = pd.read_csv(TABLES / "step4_scores_bowlers.csv", dtype={"player_id": str}).set_index("player_id")
sa = pd.read_csv(TABLES / "step4_scores_allrounders.csv", dtype={"player_id": str}).set_index("player_id")
bm = pd.read_csv(TABLES / "step3_batting_metrics.csv", dtype={"player_id": str}).set_index("player_id")
wm = pd.read_csv(TABLES / "step3_bowling_metrics.csv", dtype={"player_id": str}).set_index("player_id")

# ------------------------------------------------ nationality inference from non-IPL matches in the same dataset (A7)
raw = load_raw()
ipl = set(IPL_TEAMS)
nonipl = raw[~(raw.batting_team_id.isin(ipl) & raw.bowling_team_id.isin(ipl))]
side = pd.concat([nonipl[["striker_id", "batting_team_id"]].rename(columns={"striker_id": "pid", "batting_team_id": "team"}),
                  nonipl[["non_striker_id", "batting_team_id"]].rename(columns={"non_striker_id": "pid", "batting_team_id": "team"}),
                  nonipl[["bowler_id", "bowling_team_id"]].rename(columns={"bowler_id": "pid", "bowling_team_id": "team"})]).drop_duplicates()
NATIONAL_INDIA = {"18"}; INDIA_A = {"222"}
nat = {}
for pid, g in side.groupby("pid"):
    teams = set(g.team)
    named = sorted(OTHER_TEAMS.get(t, t) for t in teams)
    if teams & NATIONAL_INDIA:
        nat[pid] = ("Indian (capped: India T20Is in data)", False, ", ".join(named))
    elif teams & INDIA_A:
        nat[pid] = ("Indian (India A in data)", False, ", ".join(named))
    else:
        nat[pid] = ("Overseas (inferred)", True, ", ".join(named))

# ------------------------------------------------ IPL 2026 involvement and core players (A1, A3)
b = P.load_ball_frames("pi_bucket")
inv = pd.concat([b[b.ball_faced.astype(bool)].groupby(["season", "batting_team_id", "striker_id"]).size().rename("n").reset_index()
                 .rename(columns={"batting_team_id": "team", "striker_id": "pid"}),
                 b[b.legal_ball.astype(bool)].groupby(["season", "bowling_team_id", "bowler_id"]).size().rename("n").reset_index()
                 .rename(columns={"bowling_team_id": "team", "bowler_id": "pid"})]).groupby(["season", "team", "pid"]).n.sum().reset_index()
i26 = inv[inv.season == 2026]
core = set(i26.sort_values("n", ascending=False).groupby("team").head(6).pid)
rr26 = set(i26[i26.team == RR].pid)
mt = b.groupby(["season", "match_id"]).size().reset_index()
seasons_10 = {}
for pid, g in pd.concat([b[["season", "match_id", "striker_id"]].rename(columns={"striker_id": "pid"}),
                         b[["season", "match_id", "bowler_id"]].rename(columns={"bowler_id": "pid"})]).drop_duplicates().groupby("pid"):
    c = g[g.season >= 2023].groupby("season").match_id.nunique()
    seasons_10[pid] = int((c >= 10).sum())

# median batting position and death-bowling share (2023-26)
bb = b[(b.season >= 2023) & b.ball_faced.astype(bool)]
bat_pos = bb.groupby("striker_id").batting_order_n.median()
bw = b[(b.season >= 2023) & b.legal_ball.astype(bool)]
death_share = bw.groupby("bowler_id").apply(lambda g: (g.phase == "Death").mean(), include_groups=False)


def price_band(pid, overseas):
    s10 = seasons_10.get(pid, 0)
    if s10 >= 3:
        lo, hi, tier = (6.0, 12.0, "Established") if overseas else (8.0, 14.0, "Established")
    elif s10 == 2:
        lo, hi, tier = (3.0, 7.0, "Regular") if overseas else (3.0, 8.0, "Regular")
    else:
        lo, hi, tier = 0.3, 3.0, "Emerging"
    return lo, hi, tier


# ------------------------------------------------ candidate table: everyone scorable
rows = []
for pid, r in scope.set_index("player_id").iterrows():
    if r.role.startswith("Not scorable"):
        continue
    natl, ovs, nat_ev = nat.get(pid, ("UNKNOWN (no international data)", None, ""))
    role = r.role
    if role == "All-rounder":
        sc, lo, hi = sa.score.get(pid), sa.score_lo80.get(pid), sa.score_hi80.get(pid)
    elif role == "Batter":
        sc, lo, hi = sb.score.get(pid), sb.score_lo80.get(pid), sb.score_hi80.get(pid)
    else:
        sc, lo, hi = sw.score.get(pid), sw.score_lo80.get(pid), sw.score_hi80.get(pid)
    pos = bat_pos.get(pid, np.nan)
    sub = role
    if role == "Batter":
        sub = "Top-order batter" if pos <= 3 else ("Middle-order batter" if pos <= 5 else "Finisher")
    elif role == "Bowler":
        pm_ = pmap.set_index("player_id").main_pace_or_spin.get(pid, "")
        sub = f"{pm_} bowler" + (" (death specialist)" if death_share.get(pid, 0) >= 0.35 else "")
    plo, phi, tier = price_band(pid, bool(ovs))
    width = hi - lo
    risks = []
    if width >= 50: risks.append("sample size (wide interval)")
    if seasons_10.get(pid, 0) <= 1: risks.append("short track record")
    trend = None
    risks.append("age UNKNOWN"); risks.append("injury UNKNOWN")
    lt = pmap.set_index("player_id").latest_team.get(pid, ""); ls = pmap.set_index("player_id").latest_season.get(pid, np.nan)
    rows.append(dict(player_id=pid, player_name=r.player_name, role=role, sub_role=sub, score=sc, score_lo80=lo, score_hi80=hi,
                     interval_width=width, nationality=natl, overseas=ovs, nationality_evidence=nat_ev, age="UNKNOWN [A8]",
                     latest_team=lt, latest_season=ls, in_rr_2026=pid in rr26, likely_retained_core=(pid in core) and pid not in rr26,
                     availability=("RR player (retention is RR's decision) [A1]" if pid in rr26 else
                                   ("Likely retained by current team [ASSUMPTION A3]" if pid in core else "In auction pool: UNKNOWN [ASSUMPTION A2]")),
                     price_tier=tier, price_lo_cr=plo, price_hi_cr=phi, price_band=f"Rs {plo:g}–{phi:g} cr [ASSUMPTION A6]",
                     walk_away_cr=phi, risk_tags="; ".join(risks), median_bat_pos=pos, death_share=death_share.get(pid, np.nan),
                     hi_balls=r.hi_balls_faced if role != "Bowler" else r.hi_legal_bowled))
cand = pd.DataFrame(rows)

# ------------------------------------------------ RR gaps: current group (2026 RR players) vs league, High pressure, by phase
hi = b[(b.season.isin([2025, 2026])) & (b.bucket == "High")]
league_bat = hi[hi.ball_faced.astype(bool)].groupby("phase").agg(rae=("rae_bat", "sum"), n=("rae_bat", "size"))
league_bowl = hi.groupby("phase").agg(rse=("rse_bowl", "sum"), n=("rse_bowl", "size"))
grp_bat = hi[hi.ball_faced.astype(bool) & hi.striker_id.isin(rr26)].groupby("phase").agg(rae=("rae_bat", "sum"), n=("rae_bat", "size"))
grp_bowl = hi[hi.bowler_id.isin(rr26)].groupby("phase").agg(rse=("rse_bowl", "sum"), n=("rse_bowl", "size"))
gaps = []
for ph in ["Powerplay", "Middle", "Death"]:
    gaps.append(dict(area=f"Batting under pressure: {ph}", rr_group_per100=100 * grp_bat.rae.get(ph, np.nan) / grp_bat.n.get(ph, np.nan),
                     league_per100=100 * league_bat.rae[ph] / league_bat.n[ph], rr_balls=int(grp_bat.n.get(ph, 0))))
    gaps.append(dict(area=f"Bowling under pressure: {ph}", rr_group_per100=100 * grp_bowl.rse.get(ph, np.nan) / grp_bowl.n.get(ph, np.nan),
                     league_per100=100 * league_bowl.rse[ph] / league_bowl.n[ph], rr_balls=int(grp_bowl.n.get(ph, 0))))
gaps = pd.DataFrame(gaps)
gaps["gap_vs_league_per100"] = gaps.rr_group_per100 - gaps.league_per100
gaps["metric"] = np.where(gaps.area.str.startswith("Batting"), "runs above expected per 100 High-pressure balls", "runs saved vs expected per 100 High-pressure balls")
gaps = gaps.sort_values("gap_vs_league_per100")
top_gaps = gaps[gaps.gap_vs_league_per100 < 0].head(3).area.tolist()   # only areas where RR is BELOW the league

rr_group = cand[cand.in_rr_2026].copy()
rr_all = pd.DataFrame({"player_id": sorted(rr26)})
rr_all["player_name"] = rr_all.player_id.map(pmap.set_index("player_id").canonical_name)
rr_all = rr_all.merge(cand[["player_id", "role", "sub_role", "score", "score_lo80", "score_hi80", "nationality", "overseas"]], how="left", on="player_id")
rr_all["role"] = rr_all.role.fillna("Not scorable (sample)")
rr_all["nationality"] = rr_all.apply(lambda r: r.nationality if isinstance(r.nationality, str) else nat.get(r.player_id, ("UNKNOWN",))[0], axis=1)
rr_all["ipl2026_involvement_balls"] = rr_all.player_id.map(i26[i26.team == RR].set_index("pid").n)
rr_all["main_batting_type"] = rr_all.player_id.map(pmap.set_index("player_id").main_batting_type)
rr_all["main_pace_or_spin"] = rr_all.player_id.map(pmap.set_index("player_id").main_pace_or_spin)
rr_all = rr_all.sort_values("ipl2026_involvement_balls", ascending=False)


def fills(row):
    out = []
    for g in top_gaps:
        if g.startswith("Batting") and row.role in ("Batter", "All-rounder"):
            ph = g.split(": ")[1]
            if (ph == "Death" and row.sub_role in ("Finisher", "Middle-order batter")) or (ph == "Powerplay" and row.sub_role == "Top-order batter") \
               or (ph == "Middle" and row.sub_role in ("Middle-order batter", "Top-order batter")) or row.role == "All-rounder":
                out.append(g)
        if g.startswith("Bowling") and row.role in ("Bowler", "All-rounder"):
            ph = g.split(": ")[1]
            if ph != "Death" or (row.death_share or 0) >= 0.25:
                out.append(g)
    return out


cand["fills_gaps"] = cand.apply(lambda r: "; ".join(fills(r)), axis=1)
cand["fit_weight"] = np.where(cand.fills_gaps != "", 1.5, 0.6)
pool = cand[~cand.in_rr_2026 & ~cand.likely_retained_core].copy()

# ------------------------------------------------ shortlist tiers (scorable, non-RR, non-core)
pool["value"] = pool.score / 100 * pool.fit_weight
must = pool[(pool.score_lo80 >= 50)].sort_values(["fit_weight", "score"], ascending=False).head(3)
rest = pool[~pool.player_id.isin(must.player_id)]
value = rest[(rest.score >= 60) & rest.price_tier.isin(["Regular", "Emerging"])].sort_values(["fit_weight", "score"], ascending=False).head(4)
rest = rest[~rest.player_id.isin(value.player_id)]
gems = rest[(rest.score >= 60) & rest.price_tier.isin(["Emerging", "Regular"])].sort_values("hi_balls").head(3)   # low-profile: smallest samples
short = pd.concat([must.assign(tier="Must-Back"), value.assign(tier="Value Pick"), gems.assign(tier="Hidden Gem")])
short = short.head(10)

# ------------------------------------------------ budget optimiser (A4, A5): maximise sum(score/100 x fit) within purse, slots, overseas
PURSE, SLOTS, OVS_SLOTS = 15.0, 6, 2
opts = short.assign(mid=(short.price_lo_cr + short.price_hi_cr) / 2).reset_index(drop=True)


def best_plan(df, exclude=()):
    d = df[~df.player_id.isin(exclude)].reset_index(drop=True)
    best, best_v = (), -1
    for k in range(1, min(SLOTS, len(d)) + 1):
        for combo in itertools.combinations(range(len(d)), k):
            c = d.iloc[list(combo)]
            if c.mid.sum() > PURSE or c.overseas.fillna(False).astype(bool).sum() > OVS_SLOTS:
                continue
            v = (c.score / 100 * c.fit_weight).sum()
            if v > best_v + 1e-12:
                best, best_v = tuple(c.player_id), v
    return list(best), best_v


planA, vA = best_plan(opts)
pa = opts[opts.player_id.isin(planA)]
top_target = pa.sort_values("mid", ascending=False).iloc[0] if len(pa) else None
planB, vB = best_plan(opts, exclude=(top_target.player_id,)) if top_target is not None else ([], 0)
pb_ = opts[opts.player_id.isin(planB)]
replacement = pb_[~pb_.player_id.isin(planA)]
plans = pd.concat([pa.assign(plan="A"), pb_.assign(plan="B")])
plans["purse_assumed_cr"] = PURSE
plan_b_row = dict(if_player=top_target.player_name if top_target is not None else "",
                  goes_past_cr=top_target.walk_away_cr if top_target is not None else np.nan,
                  switch_to="; ".join(replacement.player_name) if len(replacement) else "(no change)",
                  value_planA=vA, value_planB=vB, rr_loses=f"{100 * (vA - vB) / vA:.0f}% of Plan A's pressure value (score x gap fit)" if vA else "")

# ------------------------------------------------ similar players (feature distance within role)
def similar(df):
    out = {}
    feats = ["score", "median_bat_pos", "death_share", "interval_width"]
    for role, g in df.groupby("role"):
        X = g[feats].fillna(g[feats].median()).astype(float)
        X = (X - X.mean()) / X.std(ddof=0).replace(0, 1)
        for i, pid in enumerate(g.player_id):
            d = np.sqrt(((X - X.iloc[i]) ** 2).sum(axis=1)); d.iloc[i] = np.inf
            out[pid] = list(g.player_id.iloc[np.argsort(d.values)[:3]])
    return out


sim = similar(cand)
cand["similar_players"] = cand.player_id.map(lambda p: "|".join(sim.get(p, [])))

# ------------------------------------------------ contrarian, unsung, avoid
vol = pd.concat([b[(b.season >= 2025)].groupby("striker_id").bat_runs.sum().rename("runs_2526"),
                 b[(b.season >= 2025)].groupby("bowler_id").is_bowler_wicket.sum().rename("wkts_2526")], axis=1).fillna(0)
cand = cand.join(vol, on="player_id")
cand["popularity_proxy"] = np.where(cand.role == "Bowler", cand.wkts_2526.rank(pct=True), cand.runs_2526.rank(pct=True))
contr = cand[(cand.popularity_proxy >= 0.75) & (cand.score < 35)].sort_values("score").head(2)
unsung = cand[(cand.popularity_proxy <= 0.5) & ~cand.in_rr_2026].sort_values("score", ascending=False).head(1)
avoid = pool[(pool.score < 30) & (pool.score_hi80 < 60) & ~pool.player_id.isin(contr.player_id)].sort_values("score").head(5)

# ------------------------------------------------ sample XI from RR 2026 group + Plan A (A1)
squad = pd.concat([rr_all.merge(cand[["player_id", "median_bat_pos", "death_share", "sub_role"]], on="player_id", how="left", suffixes=("", "_c")),
                   pa.assign(ipl2026_involvement_balls=np.nan)], ignore_index=True).drop_duplicates("player_id")
squad["overseas_b"] = squad.player_id.map(lambda p: nat.get(p, (None, False))[1]).fillna(False)
squad["bat_pos"] = squad.player_id.map(bat_pos)
squad["bowl_share"] = squad.player_id.map(bw.groupby("bowler_id").size() / bw.groupby("bowler_id").match_id.nunique() / 24)
squad["score_f"] = squad.score.fillna(30)
xi_ids, ovs = [], 0


def add(r):
    global ovs
    if r.player_id in xi_ids or len(xi_ids) >= 11 or (bool(r.overseas_b) and ovs >= 4):
        return False
    xi_ids.append(r.player_id); ovs += bool(r.overseas_b)
    return True


bowlers = squad[squad.bowl_share.fillna(0) >= 0.5].sort_values("score_f", ascending=False)
batters = squad[squad.bat_pos.notna() & (squad.bat_pos <= 7)].sort_values("score_f", ascending=False)
KEEPER = squad[squad.player_name == "Dhruv Jurel"]          # A11
for _, r in KEEPER.iterrows():
    add(r)
nb = 0
for _, r in bowlers.iterrows():
    if nb >= 5: break
    nb += add(r)
for _, r in batters.iterrows():
    add(r)
for _, r in squad.sort_values("score_f", ascending=False).iterrows():
    add(r)
xi_df = squad[squad.player_id.isin(xi_ids)].copy()
xi_df = xi_df.assign(bat_order=xi_df.bat_pos.astype(float).fillna(11)).sort_values("bat_order")
bench = squad[~squad.player_id.isin(xi_df.player_id)].sort_values("score_f", ascending=False)
impact = bench.iloc[0] if len(bench) else None

# bowling plan by phase: bowlers in XI by their phase usage (2023-26)
ph_use = bw.groupby(["bowler_id", "phase"]).size().unstack(fill_value=0)
plan_rows = []
for ph in ["Powerplay", "Middle", "Death"]:
    cands_ = [p for p in xi_df.player_id if p in ph_use.index]
    ranked = sorted(cands_, key=lambda p: -ph_use.loc[p].get(ph, 0) / max(ph_use.loc[p].sum(), 1))
    plan_rows.append(dict(phase=ph, overs={"Powerplay": 6, "Middle": 9, "Death": 5}[ph],
                          bowlers=", ".join(pmap.set_index("player_id").canonical_name.get(p, p) for p in ranked[:3])))

# ------------------------------------------------ not scorable list (D3)
ns = scope[scope.role.str.startswith("Not scorable")].copy()
ns["reason"] = "Below minimum High-pressure sample (bat ≥100 faced / bowl ≥60 legal)"
ns = ns[["player_id", "player_name", "hi_balls_faced", "hi_legal_bowled", "reason"]]

# ------------------------------------------------ write
out = {"step5_candidates": cand, "step5_rr_group": rr_all, "step5_gaps": gaps, "step5_shortlist": short,
       "step5_plans": plans, "step5_contrarian": contr, "step5_unsung": unsung, "step5_not_to_chase": avoid,
       "step5_not_scorable": ns, "step5_xi": xi_df[["player_id", "player_name", "role", "sub_role", "bat_order", "overseas_b", "score"]],
       "step5_bench": bench[["player_id", "player_name", "role", "score"]], "step5_bowling_plan": pd.DataFrame(plan_rows),
       "step5_assumptions": pd.DataFrame(ASSUMPTIONS, columns=["id", "item", "value_used", "reason"])}
for k, v in out.items():
    v.to_csv(TABLES / f"{k}.csv", index=False)
pd.DataFrame([plan_b_row]).to_csv(TABLES / "step5_plan_b.csv", index=False)
pd.DataFrame([dict(impact_player=impact.player_name if impact is not None else "", overseas_in_xi=ovs,
                   purse_used_planA=pa.assign(mid=(pa.price_lo_cr + pa.price_hi_cr) / 2).mid.sum() if len(pa) else 0)]).to_csv(TABLES / "step5_xi_meta.csv", index=False)
print("top gaps:", top_gaps)
print(gaps.round(2).to_string(index=False))
print(short[["tier", "player_name", "role", "sub_role", "score", "score_lo80", "score_hi80", "price_band", "nationality", "fills_gaps"]].round(1).to_string(index=False))
print("Plan A:", list(pa.player_name), "value", round(vA, 3), "| Plan B:", list(pb_.player_name), "value", round(vB, 3), plan_b_row)
print("contrarian:", list(contr.player_name), "| unsung:", list(unsung.player_name), "| avoid:", list(avoid.player_name))
print("XI:", list(xi_df.player_name), "| impact:", impact.player_name if impact is not None else None, "| overseas in XI:", ovs)
print("RR 2026 group size:", len(rr_all), "| not scorable in scope:", len(ns))
