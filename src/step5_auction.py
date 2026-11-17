"""Step 5: auction lens. RR gaps, conditional shortlist, budget optimiser (Plans A/B), sample XI, contrarian, unsung, avoid.

All external facts are UNKNOWN or REPORTED (F1; web reading blocked, D23). Every value the data can't give is an
explicit [ASSUMPTION] in outputs/tables/step5_assumptions.csv. Data-derived inferences are labelled as such.
Rewritten after Critic 3 (D35). Run: python3 -I src/step5_auction.py
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
MAX_SQUAD, MAX_OVS = 25, 8                  # REPORTED F1-006 / F1-007
PURSE = 15.0                                # [ASSUMPTION A4]
MIN_PHASE_BALLS = 30                        # D33
MUST_RECENT = 60                            # Must-Back needs >= 60 balls (faced or bowled) in IPL 2026
REGULAR_SHARE = 0.80                        # A3: played >= 80% of the team's 2026 matches

scope = pd.read_csv(TABLES / "step3_scope.csv", dtype={"player_id": str})
pmap = pd.read_csv(WORK / "player_map.csv", dtype={"player_id": str}).set_index("player_id")
sb = pd.read_csv(TABLES / "step4_scores_batters.csv", dtype={"player_id": str}).set_index("player_id")
sw = pd.read_csv(TABLES / "step4_scores_bowlers.csv", dtype={"player_id": str}).set_index("player_id")
sa = pd.read_csv(TABLES / "step4_scores_allrounders.csv", dtype={"player_id": str}).set_index("player_id")
names = pmap.canonical_name.copy()
_rawn = load_raw()[["non_striker_id", "non_striker_name"]].drop_duplicates("non_striker_id").set_index("non_striker_id").non_striker_name
names = names.combine_first(_rawn)          # players seen only as non-striker (e.g. id 6461) still get a name

# ------------------------------------------------ nationality inference from non-IPL matches in this dataset (A7)
raw = load_raw()
ipl = set(IPL_TEAMS)
nonipl = raw[~(raw.batting_team_id.isin(ipl) & raw.bowling_team_id.isin(ipl))]
side = pd.concat([nonipl[["striker_id", "batting_team_id"]].set_axis(["pid", "team"], axis=1),
                  nonipl[["non_striker_id", "batting_team_id"]].set_axis(["pid", "team"], axis=1),
                  nonipl[["bowler_id", "bowling_team_id"]].set_axis(["pid", "team"], axis=1)]).drop_duplicates()
nat = {}
for pid, g in side.groupby("pid"):
    teams = set(g.team)
    named = ", ".join(sorted(OTHER_TEAMS.get(t, t) for t in teams))
    if "18" in teams:
        nat[pid] = ("Indian, capped (India T20Is in data) [A7]", False, named)
    elif "222" in teams:
        nat[pid] = ("Indian (India A in data; capped status UNKNOWN) [A7]", False, named)
    else:
        nat[pid] = ("Overseas (inferred from T20Is in data) [A7]", True, named)
NAT_UNKNOWN = ("UNKNOWN (no T20I in 2022–26 data) [A7]", None, "")

# ------------------------------------------------ ball frames, 2026 involvement, regulars (A1, A3)
b = P.load_ball_frames("pi_bucket")
b23 = b[b.season >= 2023]
apps = pd.concat([b[["season", "match_id", "batting_team_id", "striker_id"]].set_axis(["season", "match_id", "team", "pid"], axis=1),
                  b[["season", "match_id", "batting_team_id", "non_striker_id"]].set_axis(["season", "match_id", "team", "pid"], axis=1),
                  b[["season", "match_id", "bowling_team_id", "bowler_id"]].set_axis(["season", "match_id", "team", "pid"], axis=1)]).drop_duplicates()
a26 = apps[apps.season == 2026]
team_m = a26.groupby("team").match_id.nunique()
share26 = a26.groupby(["team", "pid"]).match_id.nunique().reset_index()
share26["share"] = share26.match_id / share26.team.map(team_m)
regular = set(share26[share26.share >= REGULAR_SHARE].pid)
rr26 = set(a26[a26.team == RR].pid)
bf26 = b[(b.season == 2026)]
recent_balls = (bf26[bf26.ball_faced.astype(bool)].groupby("striker_id").size().add(
                bf26[bf26.legal_ball.astype(bool)].groupby("bowler_id").size(), fill_value=0))
seasons_10 = {}
for pid, g in apps[apps.season >= 2023].groupby("pid"):
    seasons_10[pid] = int((g.groupby("season").match_id.nunique() >= 10).sum())
bat_pos = b23[b23.ball_faced.astype(bool)].groupby("striker_id").batting_order_n.median()
bw = b23[b23.legal_ball.astype(bool)]
death_share = bw.groupby("bowler_id").apply(lambda g: (g.phase == "Death").mean(), include_groups=False)
phase_legal = bw.groupby(["bowler_id", "phase"]).size().unstack(fill_value=0)


def price_band(pid, overseas):
    s10 = seasons_10.get(pid, 0)
    if s10 >= 3:
        lo, hi, tier = (6.0, 12.0, "Established") if overseas else (8.0, 14.0, "Established")
    elif s10 == 2:
        lo, hi, tier = (3.0, 7.0, "Regular") if overseas else (3.0, 8.0, "Regular")
    else:
        lo, hi, tier = 0.3, 3.0, "Emerging"
    return lo, hi, tier


# ------------------------------------------------ RR gaps with standard errors (High pressure, 2025-26)
hi = b[(b.season.isin([2025, 2026])) & (b.bucket == "High")]
fb = hi[hi.ball_faced.astype(bool)]
gaps = []
for kind, frame, col, who in (("Batting", fb, "rae_bat", "striker_id"), ("Bowling", hi, "rse_bowl", "bowler_id")):
    for ph in ["Powerplay", "Middle", "Death"]:
        lg = frame[frame.phase == ph][col]; rr = frame[(frame.phase == ph) & frame[who].isin(rr26)][col]
        gap = 100 * (rr.mean() - lg.mean())
        se = 100 * np.sqrt(rr.var(ddof=1) / len(rr) + lg.var(ddof=1) / len(lg)) if len(rr) > 1 else np.nan
        gaps.append(dict(area=f"{kind} under pressure: {ph}", rr_group_per100=100 * rr.mean(), league_per100=100 * lg.mean(),
                         rr_balls=len(rr), gap_vs_league_per100=gap, se_per100=se,
                         gap_lo80=gap - 1.2816 * se, gap_hi80=gap + 1.2816 * se,
                         verdict="below league" if gap + 1.2816 * se < 0 else ("above league" if gap - 1.2816 * se > 0 else "within noise (directional only)")))
gaps = pd.DataFrame(gaps).sort_values("gap_vs_league_per100")
gaps["metric"] = np.where(gaps.area.str.startswith("Batting"), "runs above expected per 100 High-pressure balls",
                          "runs saved vs expected per 100 High-pressure balls")
top_gaps = gaps[gaps.gap_vs_league_per100 < 0].head(2).area.tolist()      # directional: negative point estimate

own_bat = b23[(b23.bucket == "High") & b23.ball_faced.astype(bool)].groupby(["striker_id", "phase"]).agg(x=("rae_bat", "sum"), n=("rae_bat", "size"))
own_bowl = b23[b23.bucket == "High"].groupby(["bowler_id", "phase"]).agg(x=("rse_bowl", "sum"), n=("rse_bowl", "size"))
lg_bat = b23[(b23.bucket == "High") & b23.ball_faced.astype(bool)].groupby("phase").rae_bat.mean() * 100
lg_bowl = b23[b23.bucket == "High"].groupby("phase").rse_bowl.mean() * 100


def fills(pid):
    out = []
    for g in top_gaps:
        kind, ph = g.split(" under pressure: ")
        src, lg = (own_bat, lg_bat) if kind == "Batting" else (own_bowl, lg_bowl)
        if (pid, ph) in src.index:
            r = src.loc[(pid, ph)]
            if r.n >= MIN_PHASE_BALLS and 100 * r.x / r.n > lg[ph]:
                out.append(g)
    return out


# ------------------------------------------------ candidate table: every scorable player
rows = []
for pid, r in scope.set_index("player_id").iterrows():
    if r.role.startswith("Not scorable"):
        continue
    natl, ovs, nat_ev = nat.get(pid, NAT_UNKNOWN)
    src = {"All-rounder": sa, "Batter": sb, "Bowler": sw}[r.role]
    sc, lo, hi_ = src.score.get(pid), src.score_lo80.get(pid), src.score_hi80.get(pid)
    pos = bat_pos.get(pid, np.nan)
    sub = r.role
    if r.role == "Batter":
        sub = "Top-order batter" if pos <= 3 else ("Middle-order batter" if pos <= 5 else "Finisher")
    elif r.role == "Bowler":
        sub = f"{pmap.main_pace_or_spin.get(pid, '')} bowler" + (", death specialist" if death_share.get(pid, 0) >= 0.35 else "")
    plo, phi, tier = price_band(pid, bool(ovs))
    rb = float(recent_balls.get(pid, 0))
    risks = []
    if hi_ - lo >= 55: risks.append("sample size (wide 80% range)")
    if seasons_10.get(pid, 0) <= 1: risks.append("short track record")
    if rb < MUST_RECENT: risks.append(f"low IPL 2026 volume ({rb:.0f} balls)")
    risks += ["age UNKNOWN [A8]", "injury UNKNOWN"]
    in_rr, reg = pid in rr26, (pid in regular) and (pid not in rr26)
    rows.append(dict(player_id=pid, player_name=r.player_name, role=r.role, sub_role=sub, score=sc, score_lo80=lo, score_hi80=hi_,
                     interval_width=hi_ - lo, nationality=natl, overseas=ovs, nationality_evidence=nat_ev, age="UNKNOWN [A8]",
                     latest_team=pmap.latest_team.get(pid, ""), latest_season=pmap.latest_season.get(pid, np.nan),
                     ipl2026_balls=rb, in_rr_2026=in_rr, likely_retained_core=reg,
                     availability=("RR player: retention is RR's decision [A1]" if in_rr else
                                   ("Likely retained: regular for his team in 2026 [ASSUMPTION A3]" if reg else "In auction pool: UNKNOWN [ASSUMPTION A2]")),
                     price_tier=tier, price_lo_cr=plo, price_hi_cr=phi, price_band=f"Rs {plo:g}–{phi:g} cr [ASSUMPTION A6]",
                     walk_away_cr=phi, risk_tags="; ".join(risks), median_bat_pos=pos, death_share=death_share.get(pid, np.nan),
                     hi_balls=r.hi_balls_faced if r.role != "Bowler" else r.hi_legal_bowled,
                     fills_gaps="; ".join(fills(pid))))
cand = pd.DataFrame(rows)
cand["fit_weight"] = np.where(cand.fills_gaps != "", 1.5, 0.6)


def similar(df):
    """Three closest profiles within role (standardised score, batting position, death share, range width)."""
    out = {}
    feats = ["score", "median_bat_pos", "death_share", "interval_width"]
    for role, g in df.groupby("role"):
        X = g[feats].astype(float)
        X = X.fillna(X.median())
        X = (X - X.mean()) / X.std(ddof=0).replace(0, 1)
        for i, pid in enumerate(g.player_id):
            d = np.array(np.sqrt(((X - X.iloc[i]) ** 2).sum(axis=1)), dtype=float, copy=True)
            d[i] = np.inf
            out[pid] = list(g.player_id.iloc[np.argsort(d)[:3]])
    return out


_sim = similar(cand)
cand["similar_players"] = cand.player_id.map(lambda p: "|".join(_sim.get(p, [])))
pool = cand[~cand.in_rr_2026 & ~cand.likely_retained_core].copy()

# ------------------------------------------------ shortlist tiers (D35)
must = pool[(pool.score_lo80 >= 50) & (pool.fills_gaps != "") & (pool.ipl2026_balls >= MUST_RECENT)].sort_values("score", ascending=False).head(3)
rest = pool[~pool.player_id.isin(must.player_id)]
value = rest[(rest.score >= 60) & rest.price_tier.isin(["Regular", "Emerging"])].sort_values(["fit_weight", "score_lo80"], ascending=False).head(4)
rest = rest[~rest.player_id.isin(value.player_id)]
gems = rest[(rest.score >= 60) & (rest.score_lo80 >= 40)].sort_values("score_lo80", ascending=False).head(3)
short = pd.concat([must.assign(tier="Must-Back"), value.assign(tier="Value Pick"), gems.assign(tier="Hidden Gem")]).head(10)


def tier_reason(r):
    if r.tier == "Must-Back":
        return "Strongest pressure record among likely-available players that also fills an RR gap, with a solid floor and recent volume."
    why_not = []
    if r.score_lo80 < 50: why_not.append(f"lower end of range {r.score_lo80:.0f} (< 50)")
    if r.fills_gaps == "": why_not.append("fills no measured RR gap")
    if r.ipl2026_balls < MUST_RECENT: why_not.append(f"only {r.ipl2026_balls:.0f} balls in IPL 2026")
    base = ("Good pressure record (score ≥ 60) at an assumed modest price band." if r.tier == "Value Pick"
            else "Lower-profile player with a sturdy lower end of range (≥ 40).")
    return base + (" Not Must-Back: " + "; ".join(why_not) + "." if why_not else "")


short["tier_reason"] = [tier_reason(r) for r in short.itertuples()]

# ------------------------------------------------ squad room (A5) and optimiser (A4, A10)
rr_all = pd.DataFrame({"player_id": sorted(rr26)})
rr_all["player_name"] = rr_all.player_id.map(names)
rr_all = rr_all.merge(cand[["player_id", "role", "sub_role", "score", "score_lo80", "score_hi80"]], how="left", on="player_id")
rr_all["role"] = rr_all.role.fillna("Not scorable (sample)")
rr_all["nationality"] = rr_all.player_id.map(lambda p: nat.get(p, NAT_UNKNOWN)[0])
rr_all["overseas"] = rr_all.player_id.map(lambda p: nat.get(p, NAT_UNKNOWN)[1])
rr_all["ipl2026_involvement_balls"] = rr_all.player_id.map(recent_balls).fillna(0)
rr_all["main_batting_type"] = rr_all.player_id.map(pmap.main_batting_type)
rr_all["main_pace_or_spin"] = rr_all.player_id.map(pmap.main_pace_or_spin)
rr_all = rr_all.sort_values("ipl2026_involvement_balls", ascending=False)
rr_ovs = int(rr_all.overseas.fillna(False).astype(bool).sum())
SLOTS = max(MAX_SQUAD - len(rr_all), 0)
OVS_SLOTS = max(MAX_OVS - rr_ovs, 0)
opts = short.assign(mid=(short.price_lo_cr + short.price_hi_cr) / 2).reset_index(drop=True)
forced = list(opts[opts.tier == "Must-Back"].player_id)


def best_plan(df, exclude=()):
    d = df[~df.player_id.isin(exclude)].reset_index(drop=True)
    need = set(f for f in forced if f not in exclude)
    best, best_v = (), -1.0
    for k in range(1, min(SLOTS, len(d)) + 1):
        for combo in itertools.combinations(range(len(d)), k):
            c = d.iloc[list(combo)]
            if c.mid.sum() > PURSE or c.overseas.fillna(False).astype(bool).sum() > OVS_SLOTS:
                continue
            if not need <= set(c.player_id) or (c.fills_gaps == "").sum() > 1:
                continue
            v = (c.score / 100 * c.fit_weight).sum()
            if v > best_v + 1e-12:
                best, best_v = tuple(c.player_id), v
    if not best and need:          # forced picks infeasible together (e.g. overseas room): relax the forcing, log it
        forced_ok = []
        for k in range(1, min(SLOTS, len(d)) + 1):
            for combo in itertools.combinations(range(len(d)), k):
                c = d.iloc[list(combo)]
                if c.mid.sum() > PURSE or c.overseas.fillna(False).astype(bool).sum() > OVS_SLOTS or (c.fills_gaps == "").sum() > 1:
                    continue
                v = (c.score / 100 * c.fit_weight).sum() + 10 * len(need & set(c.player_id))
                if v > best_v:
                    best, best_v = tuple(c.player_id), v
        best_v = (d[d.player_id.isin(best)].score / 100 * d[d.player_id.isin(best)].fit_weight).sum()
    return list(best), best_v


planA, vA = best_plan(opts)
pa = opts[opts.player_id.isin(planA)].copy()
pb_rows = []
for r in pa.itertuples():                           # Plan B for EVERY Plan A player (D35)
    alt, vB = best_plan(opts, exclude=(r.player_id,))
    repl = opts[opts.player_id.isin(alt) & ~opts.player_id.isin(planA)]
    pb_rows.append(dict(if_player=r.player_name, player_id=r.player_id, goes_past_cr=r.walk_away_cr,
                        switch_to="; ".join(repl.player_name) if len(repl) else "(no replacement: leave the slot open)",
                        value_planA=vA, value_planB=vB, rr_loses_pct=100 * (vA - vB) / vA if vA else np.nan,
                        what_changes=(f"{r.sub_role} → " + ", ".join(repl.sub_role)) if len(repl) else f"lose a {r.sub_role.lower()}"))
plan_b = pd.DataFrame(pb_rows).sort_values("rr_loses_pct", ascending=False)
top_b = plan_b.iloc[0] if len(plan_b) else None
pbB = opts[opts.player_id.isin(best_plan(opts, exclude=(top_b.player_id,))[0])] if top_b is not None else opts.iloc[:0]
plans = pd.concat([pa.assign(plan="A"), pbB.assign(plan="B")])
plans["purse_assumed_cr"] = PURSE
plans_meta = pd.DataFrame([dict(plan=p_, players=len(g), cost_mid_cr=g.mid.sum(), cost_walkaway_cr=g.walk_away_cr.sum(), purse_cr=PURSE,
                                overseas=int(g.overseas.fillna(False).astype(bool).sum()), slots_assumed=SLOTS, overseas_slots_assumed=OVS_SLOTS,
                                must_back_included=int(g.tier.eq("Must-Back").sum()), must_back_total=len(forced))
                           for p_, g in plans.groupby("plan")])

# ------------------------------------------------ sample XI from RR 2026 group + Plan A (slot-based, D35)
squad = pd.concat([rr_all, pa[["player_id", "player_name", "role", "sub_role", "score", "score_lo80", "score_hi80", "nationality", "overseas"]].assign(
    ipl2026_involvement_balls=np.nan)], ignore_index=True).drop_duplicates("player_id")
squad["overseas_b"] = squad.overseas.fillna(False).astype(bool)
squad["bat_pos"] = squad.player_id.map(bat_pos)
squad["legal_per_match"] = squad.player_id.map(bw.groupby("bowler_id").size() / bw.groupby("bowler_id").match_id.nunique())
squad["score_f"] = squad.score.fillna(30)
SQ = squad.set_index("player_id")
xi_ids, notes = [], {}


def take(r, why):
    if r.player_id in xi_ids or len(xi_ids) >= 11:
        return
    if r.overseas_b and sum(SQ.overseas_b[x] for x in xi_ids) >= 4:
        return
    xi_ids.append(r.player_id); notes[r.player_id] = why


for _, r in squad[squad.player_name == "Dhruv Jurel"].iterrows():
    take(r, "wicketkeeper [ASSUMPTION A11]")
for _, r in squad[squad.bat_pos <= 2.5].sort_values("score_f", ascending=False).head(2).iterrows():
    take(r, "opener (median batting position ≤ 2.5)")
squad["spin"] = squad.player_id.map(pmap.main_pace_or_spin).eq("Spin")
for _, r in squad[(squad.legal_per_match.fillna(0) >= 12) & squad.spin].sort_values("score_f", ascending=False).head(1).iterrows():
    take(r, "frontline spinner (at least one spin option)")
for _, r in squad[squad.legal_per_match.fillna(0) >= 12].sort_values("score_f", ascending=False).iterrows():
    if sum(1 for x in xi_ids if SQ.legal_per_match.fillna(0)[x] >= 12) >= 5:
        break
    take(r, "frontline bowler (≥2 overs a match)")
for _, r in squad[squad.bat_pos.notna() & (squad.bat_pos <= 7)].sort_values("score_f", ascending=False).iterrows():
    take(r, "batter by pressure score")
for _, r in squad.sort_values("score_f", ascending=False).iterrows():
    take(r, "best remaining")
xi = squad[squad.player_id.isin(xi_ids)].copy()
xi["why"] = xi.player_id.map(notes)
xi["bat_order"] = xi.bat_pos.fillna(11)
xi = xi.sort_values(["bat_order", "score_f"], ascending=[True, False])
xi["slot"] = range(1, len(xi) + 1)
bench = squad[~squad.player_id.isin(xi.player_id)].sort_values("score_f", ascending=False)
n_bowl_xi = int((xi.legal_per_match.fillna(0) >= 12).sum())
imp_pool = bench[bench.bat_pos.notna() & (bench.bat_pos <= 7)] if n_bowl_xi >= 5 else bench[bench.legal_per_match.fillna(0) >= 12]
impact = imp_pool.iloc[0] if len(imp_pool) else (bench.iloc[0] if len(bench) else None)

plan_rows = []      # bowlers in the XI ranked by legal balls bowled in that phase (2023-26), >= 60 (Critic 3 blocker)
for ph, overs in (("Powerplay", 6), ("Middle", 9), ("Death", 5)):
    c_ = sorted([(p, int(phase_legal.loc[p, ph])) for p in xi.player_id if p in phase_legal.index and phase_legal.loc[p, ph] >= 60],
                key=lambda t: -t[1])[:3]
    plan_rows.append(dict(phase=ph, overs=overs, bowlers=", ".join(f"{names.get(p, p)} ({n} legal balls in this phase, 2023–26)" for p, n in c_)))

# ------------------------------------------------ contrarian, unsung, avoid (data-backed one-line reasons)
vol = pd.concat([b[b.season >= 2025].groupby("striker_id").bat_runs.sum().rename("runs_2526"),
                 b[b.season >= 2025].groupby("bowler_id").is_bowler_wicket.sum().rename("wkts_2526")], axis=1).fillna(0)
cand = cand.join(vol, on="player_id")
cand["popularity_proxy"] = np.where(cand.role == "Bowler", cand.wkts_2526.rank(pct=True), cand.runs_2526.rank(pct=True))
reason = lambda r, txt: f"{txt}: score {r.score:.0f} (80% range {r.score_lo80:.0f}–{r.score_hi80:.0f}) on {r.hi_balls:.0f} High-pressure balls."
contr = cand[(cand.popularity_proxy >= 0.75) & (cand.score < 35)].sort_values("score").head(2).copy()
contr["reason"] = [reason(r, f"Top quarter by 2025–26 {'wickets' if r.role == 'Bowler' else 'runs'}, yet below average under pressure") for r in contr.itertuples()]
unsung = cand[(cand.popularity_proxy <= 0.5) & ~cand.in_rr_2026 & ~cand.likely_retained_core].sort_values("score_lo80", ascending=False).head(1).copy()
unsung["reason"] = [reason(r, "Low profile by 2025–26 volume, yet a solid pressure record") for r in unsung.itertuples()]
avoid = pool[(pool.score < 30) & (pool.score_hi80 < 60) & ~pool.player_id.isin(contr.player_id)].sort_values("score").head(5).copy()
avoid["reason"] = [reason(r, "Below average under pressure even at the top of his 80% range") for r in avoid.itertuples()]

ns = scope[scope.role.str.startswith("Not scorable")].copy()
ns["player_name"] = ns.player_name.fillna(ns.player_id.map(names))
ns["reason"] = "Below minimum High-pressure sample (bat ≥100 faced / bowl ≥60 legal)"
ns = ns[["player_id", "player_name", "hi_balls_faced", "hi_legal_bowled", "reason"]]

ASSUMPTIONS = [
    ("A1", "RR's current group", f"The {len(rr_all)} players who appeared for RR in IPL 2026, from the data", "RR's 2027 retention list is UNKNOWN (F1-019). Recheck at F2"),
    ("A2", "Availability of every other player", "UNKNOWN: treated as 'possibly in the auction pool'", "Retention and release lists can't be read (D23). Every card says 'pursue only if in the official auction list'"),
    ("A3", "Likely retained (excluded from shortlist and plans)", f"Players who appeared in ≥{REGULAR_SHARE:.0%} of their team's 2026 matches (regulars)", "Franchises rarely release regular starters before a mini-auction. A proxy, not a fact; they stay on the leaderboard"),
    ("A4", "RR auction purse", f"Rs {PURSE:g} crore", "UNKNOWN (F1-022). Context REPORTED: Rs 2.65 cr left after the 2026 auction (F1-024). Illustrative; adjustable in the dashboard"),
    ("A5", "RR open slots", f"{SLOTS} slots ({MAX_SQUAD} max − {len(rr_all)} in the 2026 group); {OVS_SLOTS} overseas ({MAX_OVS} max − {rr_ovs} inferred overseas)", "Assumes the whole 2026 group is retained (no releases known). Limits REPORTED (F1-006/007)"),
    ("A6", "Price bands", "Rule-based from data: Established (≥3 of 2023–26 seasons with ≥10 matches) Indian Rs 8–14 cr / overseas Rs 6–12 cr; Regular (2 such seasons) Rs 3–8 / 3–7 cr; Emerging Rs 0.3–3 cr. Walk-away = top of band", "No market data could be read. Ignores reputation; illustrative only"),
    ("A7", "Overseas / Indian status", "Inferred from T20Is in this dataset (2022–26); UNKNOWN when a player has none. UNKNOWN players count as Indian in the optimiser and XI, which is flagged", "Evidence-based, not verified externally"),
    ("A8", "Age", "UNKNOWN for every player", "Not in the data and not verifiable here"),
    ("A9", "Overseas limit in XI", "4 (REPORTED, F1-008)", "One source only"),
    ("A10", "Optimiser value", "score/100 × 1.5 if the player fills a measured RR gap (his own High-pressure record in that phase beats the league on ≥30 balls; D33), × 0.6 otherwise; at most one non-gap 'depth' pick; Must-Back picks forced in where feasible", "RR's gaps are directional (see gap table: within noise), so this is a judgement weighting, not a proof"),
    ("A11", "Wicketkeeper", "Dhruv Jurel keeps wicket in the sample XI", "Keeper not recorded in the data (no fielder column); external, unverified"),
    ("A12", "Impact Player rule in 2027", "Assumed to continue (REPORTED F1-014: expected to continue, under review)", "Affects the XI + Impact Player format only"),
]
out = {"step5_candidates": cand, "step5_rr_group": rr_all, "step5_gaps": gaps, "step5_shortlist": short, "step5_plans": plans,
       "step5_plans_meta": plans_meta, "step5_plan_b": plan_b, "step5_contrarian": contr, "step5_unsung": unsung,
       "step5_not_to_chase": avoid, "step5_not_scorable": ns,
       "step5_xi": xi[["slot", "player_id", "player_name", "role", "sub_role", "bat_order", "overseas_b", "score", "why"]],
       "step5_bench": bench[["player_id", "player_name", "role", "score"]], "step5_bowling_plan": pd.DataFrame(plan_rows),
       "step5_assumptions": pd.DataFrame(ASSUMPTIONS, columns=["id", "item", "value_used", "reason"])}
for k, v in out.items():
    v.to_csv(TABLES / f"{k}.csv", index=False)
lhb = int(sum(1 for p in xi.player_id if pmap.main_batting_type.get(p, "") == "LHB"))
pd.DataFrame([dict(impact_player=impact.player_name if impact is not None else "", impact_why=("batter (XI already has 5 frontline bowlers)" if n_bowl_xi >= 5 else "bowler"),
                   overseas_in_xi=int(xi.overseas_b.sum()), lhb_in_xi=lhb, frontline_bowlers_in_xi=n_bowl_xi,
                   unknown_nationality_in_xi=int(xi.overseas.isna().sum()), purse_used_planA=float(pa.mid.sum()) if len(pa) else 0.0)]).to_csv(TABLES / "step5_xi_meta.csv", index=False)
print("gaps:\n", gaps[["area", "gap_vs_league_per100", "se_per100", "verdict", "rr_balls"]].round(1).to_string(index=False))
print("slots", SLOTS, "overseas slots", OVS_SLOTS, "| pool", len(pool), "of", len(cand), "scorable")
print(short[["tier", "player_name", "sub_role", "score", "score_lo80", "score_hi80", "ipl2026_balls", "fills_gaps"]].round(1).to_string(index=False))
print(plans_meta.round(2).to_string(index=False)); print(plan_b[["if_player", "switch_to", "rr_loses_pct", "what_changes"]].round(1).to_string(index=False))
print("XI:", list(xi.player_name), "| impact:", impact.player_name if impact is not None else None, "| overseas:", int(xi.overseas_b.sum()), "| LHB:", lhb)
print(pd.DataFrame(plan_rows).to_string(index=False))
print("contrarian:", list(contr.player_name), "| unsung:", list(unsung.player_name), "| avoid:", list(avoid.player_name))
