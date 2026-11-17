"""Step 0 (Data Auditor): audit of the raw ball-by-ball file and the base tables for every later step.

Run from the repo root:  python3 -I src/step0_audit.py

Reads the raw data only through io_raw.load_raw() (checksum verified, every value a string).
Deterministic: no randomness is used (config.SEED is imported for completeness).

Writes (nothing else):
  data/work/balls_ipl.parquet                  ball table, IPL only, raw columns unchanged + derived columns
  data/work/matches_ipl.csv                    one row per IPL match
  data/work/player_map.csv                     one row per player id
  data/work/team_map_data.csv                  team evidence (one row per team and season)
  data/work/step0_definitions_section_B.md     proposed replacement for Section B of logs/DEFINITIONS.md
  outputs/tables/step0_*.csv                   coverage, integrity, extras decoding, columns, results, super overs,
                                               id checks, season leaders, data notes
  logs/DATA_NOTES.md                           only the placeholder line is replaced (see write_data_notes_md)
Every number in these files is computed here from the data.
"""
import sys
import re
import difflib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))   # python -I does not add the script folder

import numpy as np
import pandas as pd

from config import (IPL_TEAMS, SEED, WORK, TABLES, LOGS, phase_of, IMPACT_PLAYER_FROM, SUPER_OVER_INNINGS)
from io_raw import load_raw

np.random.seed(SEED)

LEAGUE_VOID_MATCH = 40751          # named in the task brief: abandoned after 63 balls, later replayed
LONG_GAP_S = 20 * 60               # task: gaps over 20 minutes within an innings
LONG_BREAK_S = 30 * 60             # innings break over 30 minutes (typical break is about 16 minutes)
MIN_OVERS_FOR_RESULT_BALLS = 30    # ASSUMPTION: below 5 overs (30 legal balls) a T20 result cannot be set by DLS
BOWLER_WICKET_TYPES = ["Bowled", "Caught", "LBW", "Stump", "Hit Wicket"]   # Part 5
OBSTRUCT_VARIANTS = ["Obstracting the field", "Obstructing the field"]
NONLEGAL_TYPES = ["wide", "Overstep", "other"]       # decided in section 4, see evidence in step0_extras_decoding.csv
NOBALL_TYPES = ["Overstep", "other"]

NOTES = []        # data notes rows: (Issue, Rows affected, Action taken, Why)
COVERAGE = []     # coverage / integrity rows: (section, metric, scope, value, note)


def note(issue, rows, action, why):
    NOTES.append((issue, str(rows), action, why))


def cov(section, metric, scope, value, nt=""):
    COVERAGE.append((section, metric, scope, value, nt))


def fmt_list(xs, sep="|"):
    return sep.join(str(x) for x in xs)


# ----------------------------------------------------------------------------------------------------------------
# 0. Load, type, and identify IPL matches
# ----------------------------------------------------------------------------------------------------------------
raw = load_raw()
INT_COLS = ["match_id", "innings", "overid", "over_ball_num", "innings_ball_num", "runs", "extras1_runs", "extras_2_runs"]
r = raw.copy()
for c in INT_COLS:
    r[c] = r[c].astype(int)

team_sets = r.groupby("match_id").apply(
    lambda g: frozenset(g.batting_team_id) | frozenset(g.bowling_team_id), include_groups=False)
ipl_keys = set(IPL_TEAMS)
is_ipl_match = team_sets.map(lambda s: s <= ipl_keys)
mixed = team_sets.map(lambda s: bool(s & ipl_keys) and not s <= ipl_keys)
ipl_ids = sorted(is_ipl_match[is_ipl_match].index)
n_all_matches, n_ipl_matches = len(team_sets), len(ipl_ids)
n_non_ipl_matches = n_all_matches - n_ipl_matches
assert mixed.sum() == 0, "a match mixes IPL and non-IPL team ids"

is_ipl_row = r.match_id.isin(set(ipl_ids))
n_all_rows, n_ipl_rows = len(r), int(is_ipl_row.sum())
n_non_ipl_rows = n_all_rows - n_ipl_rows

# the only look at non-IPL rows: the dismissal-disagreement count, to reconcile with DATA_AUDIT.md
disagree_all = int(((r.dismissal_type != "") != (r.dismissed_player_id != "")).sum())

b = r[is_ipl_row].copy()          # IPL balls, raw order, string raw columns + typed int columns
b = b.sort_values("row_id").reset_index(drop=True)
raw_order_ok = bool((b.sort_values(["match_id", "innings", "innings_ball_num"]).row_id.values == b.row_id.values).all())
assert raw_order_ok, "raw rows are not sorted by match, innings, ball"
assert len(b) == n_ipl_rows

# ----------------------------------------------------------------------------------------------------------------
# 1. Timestamps and match dates
# ----------------------------------------------------------------------------------------------------------------
b["ts_clock"] = pd.to_datetime(b.delivery_ist_time.str[:19])
label_counts = b.delivery_ist_time.str[20:].value_counts().to_dict()
first_ts = b.groupby("match_id").ts_clock.min()
match_date = first_ts.dt.strftime("%Y-%m-%d")
season_of = first_ts.dt.year
b["match_date"] = b.match_id.map(match_date)
b["season"] = b.match_id.map(season_of).astype(int)
b["ts_ist"] = b.ts_clock.where(b.season <= 2023, b.ts_clock + pd.Timedelta(hours=5, minutes=30))

# 1a. test of the clock claim: first ball of innings 1 per match
f1 = b[(b.innings == 1) & (b.innings_ball_num == 1)].copy()
f1["hm"] = f1.ts_clock.dt.strftime("%H:%M")
f1["mins"] = f1.ts_clock.dt.hour * 60 + f1.ts_clock.dt.minute
f1["ist_mins"] = f1.ts_ist.dt.hour * 60 + f1.ts_ist.dt.minute


def share_near(series, targets, tol=10):
    return float(np.mean([any(abs(m - t) <= tol for t in targets) for m in series]))


SLOT_AFT_IST, SLOT_EVE_IST = 15 * 60 + 30, 19 * 60 + 30
clock_rows = []
for s, g in f1.groupby("season"):
    top = g.hm.value_counts().head(4)
    clock_rows.append((s, len(g), ", ".join(f"{k} x{v}" for k, v in top.items()),
                       share_near(g.mins, [SLOT_AFT_IST, SLOT_EVE_IST]),
                       share_near(g.mins, [10 * 60, 14 * 60]),
                       share_near(g.ist_mins, [SLOT_AFT_IST, SLOT_EVE_IST])))
for s, n, top, sh_ist, sh_utc, sh_conv in clock_rows:
    cov("timestamps", "modal first-ball clock times (innings 1 ball 1)", f"season {s}", top, f"{n} matches")
    cov("timestamps", "share of matches with first ball within 10 min of 15:30 or 19:30 on the recorded clock",
        f"season {s}", round(sh_ist, 4), "IST slots read directly off the clock")
    cov("timestamps", "share of matches with first ball within 10 min of 10:00 or 14:00 on the recorded clock",
        f"season {s}", round(sh_utc, 4), "the same slots 5h30 earlier: what UTC would show")
    cov("timestamps", "share within 10 min of 15:30 or 19:30 after treating 2022-23 as IST and 2024+ as UTC (+5h30)",
        f"season {s}", round(sh_conv, 4), "derived column ts_ist")
clock_claim_ok = all((sh_ist > 0.9 if s <= 2023 else sh_utc > 0.9) and sh_conv > 0.9
                     for s, n, top, sh_ist, sh_utc, sh_conv in clock_rows)
cov("timestamps", "clock claim (IST for 2022-23, UTC from 2024) supported by modal first-ball times", "IPL",
    "yes" if clock_claim_ok else "NO",
    "assumes IPL slots of 15:30 and 19:30 IST (external knowledge, ASSUMPTION); the data alone shows a 5h30 shift between 2023 and 2024")
for k, v in label_counts.items():
    cov("timestamps", "text label after the time in delivery_ist_time", "IPL balls", f"{k}: {v}",
        "every row carries the same label, whatever the true zone")
ph = int((b.delivery_ist_time.str[11:19] == "00:00:00").sum())
cov("timestamps", "balls with a 00:00:00 placeholder time", "IPL", ph, "")

# 1b. gaps within innings (sorted by innings_ball_num == raw order)
b["gap_prev_s"] = b.groupby(["match_id", "innings"]).ts_clock.diff().dt.total_seconds()
b["gap_next_s"] = b.groupby(["match_id", "innings"]).gap_prev_s.shift(-1)
back = b[b.gap_prev_s < 0]
n_back = len(back)
# a forward jump immediately reversed by the next ball is a single wrong timestamp, not an interruption
glitch = b[(b.gap_prev_s > LONG_GAP_S) & (b.gap_next_s < 0)]
long_gap = b[(b.gap_prev_s > LONG_GAP_S) & ~((b.gap_next_s < 0).fillna(False))]
cov("timestamps", "balls whose time is earlier than the previous ball in the same innings", "IPL", n_back,
    f"matches: {fmt_list(sorted(back.match_id.unique()))}")
cov("timestamps", "forward jumps over 20 min reversed by the next ball (one wrong timestamp, not a stoppage)", "IPL",
    len(glitch), f"matches: {fmt_list(sorted(glitch.match_id.unique()))}")
cov("timestamps", "gaps over 20 min between consecutive balls of an innings (possible rain or other stoppage)", "IPL",
    len(long_gap), f"in {long_gap.match_id.nunique()} matches")
inn_ts = b.groupby(["match_id", "innings"]).ts_clock.agg(["min", "max"]).reset_index()
brk = inn_ts[inn_ts.innings == 1].merge(inn_ts[inn_ts.innings == 2], on="match_id", suffixes=("1", "2"))
brk["break_s"] = (brk.min2 - brk.max1).dt.total_seconds()
cov("timestamps", "innings break (last ball of innings 1 to first ball of innings 2): median minutes", "IPL",
    round(brk.break_s.median() / 60, 1), f"{len(brk)} matches with both innings")
cov("timestamps", "innings breaks over 30 min", "IPL", int((brk.break_s > LONG_BREAK_S).sum()),
    f"matches: {fmt_list(sorted(brk[brk.break_s > LONG_BREAK_S].match_id))}")

# ----------------------------------------------------------------------------------------------------------------
# 2. Coverage
# ----------------------------------------------------------------------------------------------------------------
cov("coverage", "columns in raw file (excluding the added row_id)", "all", raw.shape[1] - 1, ", ".join(raw.columns[1:]))
cov("coverage", "balls", "all", n_all_rows, "")
cov("coverage", "balls", "IPL", n_ipl_rows, "")
cov("coverage", "balls", "non-IPL", n_non_ipl_rows, "excluded from every output; this count is the only trace of them")
cov("coverage", "matches", "all", n_all_matches, "")
cov("coverage", "matches", "IPL", n_ipl_matches, "both teams among the 10 ids of config.IPL_TEAMS")
cov("coverage", "matches", "non-IPL", n_non_ipl_matches, "excluded from every output; this count is the only trace of them")
cov("coverage", "matches mixing IPL and non-IPL team ids", "all", int(mixed.sum()), "")
mt = pd.DataFrame({"first_ts": first_ts, "last_ts": b.groupby("match_id").ts_clock.max(), "date": match_date,
                   "season": season_of})
for s, g in mt.groupby("season"):
    cov("coverage", "IPL matches", f"season {s}", len(g), "")
    cov("coverage", "first match date (first ball, recorded clock date)", f"season {s}", g.date.min(), "")
    cov("coverage", "last match date (first ball, recorded clock date)", f"season {s}", g.date.max(), "")
last_ipl_date = mt.date.max()
cov("coverage", "last IPL match date", "IPL", last_ipl_date, "")
n_2026 = int((mt.season == 2026).sum())
cov("coverage", "does the data reach the end of IPL 2026", "IPL",
    f"{n_2026} matches in 2026, last {mt[mt.season == 2026].date.max()}",
    "74 matches = 70 league + 4 playoffs is the format seen in 2022 and 2023, so the season looks complete; "
    "that the last date is the real final needs external verification")
cov("coverage", "season column in the raw file", "all", "none",
    "season = calendar year of the first-ball date; dates come from delivery_ist_time (recorded clock)")
cov("coverage", "innings values present", "IPL", fmt_list(f"{k}: {v}" for k, v in b.innings.value_counts().sort_index().items()),
    "innings 3 and 4 are super overs")
cov("coverage", "balls in innings 1 and 2", "IPL", int(b.innings.isin([1, 2]).sum()), "")
cov("coverage", "balls in super overs (innings 3 and 4)", "IPL", int(b.innings.isin([3, 4]).sum()), "")

# ----------------------------------------------------------------------------------------------------------------
# 3. Integrity (IPL)
# ----------------------------------------------------------------------------------------------------------------
empties = (b[list(raw.columns[1:])] == "").sum()
for c, n in empties.items():
    cov("integrity", "empty values", f"column {c}", int(n), "" if n == 0 else f"{n / len(b):.2%} of IPL rows")
dup_rows = int(b.duplicated(subset=list(raw.columns[1:])).sum())
dup_keys = int(b.duplicated(["match_id", "innings", "innings_ball_num"]).sum())
cov("integrity", "exact duplicate rows", "IPL", dup_rows, "")
cov("integrity", "duplicate keys (match_id, innings, innings_ball_num)", "IPL", dup_keys, "")
grp = b.groupby(["match_id", "innings"])
seq_ok = grp.innings_ball_num.agg(lambda s: bool((s.values == np.arange(1, len(s) + 1)).all()))
cov("integrity", "innings whose innings_ball_num runs 1..N with no gap", "IPL", f"{int(seq_ok.sum())} of {len(seq_ok)}", "")
tm_ok = grp.agg(nb=("batting_team_id", "nunique"), nw=("bowling_team_id", "nunique"))
cov("integrity", "innings with exactly one batting team and one bowling team", "IPL",
    f"{int(((tm_ok.nb == 1) & (tm_ok.nw == 1)).sum())} of {len(tm_ok)}", "")
tt = grp.agg(bat=("batting_team_id", "first"), bowl=("bowling_team_id", "first")).reset_index()
bat_ne_bowl = int((tt.bat == tt.bowl).sum())
cov("integrity", "innings where batting team equals bowling team", "IPL", bat_ne_bowl, "")
# innings 1 bowling team == innings 2 batting team, and so on
pv = tt.pivot(index="match_id", columns="innings", values=["bat", "bowl"])
both12 = pv.dropna(subset=[("bat", 1), ("bat", 2)])
cov("integrity", "matches where the innings 1 batting team is the innings 2 bowling team and vice versa", "IPL",
    f"{int(((both12[('bat', 1)] == both12[('bowl', 2)]) & (both12[('bat', 2)] == both12[('bowl', 1)])).sum())} of {len(both12)}", "")
so_pv = pv.dropna(subset=[("bat", 3), ("bat", 4)])
cov("integrity", "super-over matches where the two super-over innings have opposite batting teams", "IPL",
    f"{int((so_pv[('bat', 3)] != so_pv[('bat', 4)]).sum())} of {len(so_pv)}", "")
cov("integrity", "balls where striker equals non-striker", "IPL", int((b.striker_id == b.non_striker_id).sum()), "")
cov("integrity", "is_wicket == (dismissal_type non-empty)", "IPL",
    "holds on every row" if bool(((b.is_wicket == "true") == (b.dismissal_type != "")).all()) else "VIOLATED", "")
cov("integrity", "over_ball_num equals the running delivery count within the over (so it counts wides and no-balls)",
    "IPL innings 1-2", bool((b[b.innings <= 2].groupby(["match_id", "innings", "overid"]).cumcount() + 1
                              == b[b.innings <= 2].over_ball_num).all()),
    f"max over_ball_num = {b.over_ball_num.max()}")
cov("integrity", "overs numbered 1..k with no gap in every innings 1-2", "IPL",
    bool(b[b.innings <= 2].groupby(["match_id", "innings"]).overid.agg(
        lambda s: sorted(set(s)) == list(range(1, max(s) + 1))).all()), f"max overid = {b.overid.max()}")
bs = b.bowl_speed
cov("integrity", "bowl_speed == 0", "IPL", int((bs == "0").sum()), f"{(bs == '0').mean():.1%} of IPL balls: speed not recorded")
cov("integrity", "bowl_speed == -1", "IPL", int((bs == "-1").sum()), f"matches: {fmt_list(sorted(b[bs == '-1'].match_id.unique()))}")

# ----------------------------------------------------------------------------------------------------------------
# 4. Extras decoding
# ----------------------------------------------------------------------------------------------------------------
EX = []     # (section, subject, metric, value, conclusion, confidence)


def ex(section, subject, metric, value, conclusion="", confidence=""):
    EX.append((section, subject, metric, value, conclusion, confidence))


m12 = b[b.innings <= 2].copy()
et_counts = b.extras_type.value_counts()
for t in ["None", "wide", "Overstep", "other", "legbyes", "byes", "Penalty"]:
    sub = b[b.extras_type == t]
    ex("A. profile", t, "IPL balls (all innings)", len(sub))
    ex("A. profile", t, "extras1_runs distribution", fmt_list(f"{k}:{v}" for k, v in sub.extras1_runs.value_counts().sort_index().items()))
    ex("A. profile", t, "runs distribution", fmt_list(f"{k}:{v}" for k, v in sub.runs.value_counts().sort_index().items()))
    ex("A. profile", t, "extras_2_runs distribution", fmt_list(f"{k}:{v}" for k, v in sub.extras_2_runs.value_counts().sort_index().items()))
    ex("A. profile", t, "share of balls with runs > 0", round(float((sub.runs > 0).mean()), 4) if len(sub) else "n/a")
    ex("A. profile", t, "wicket kinds on these balls",
       fmt_list(f"{k or 'none'}:{v}" for k, v in sub.dismissal_type.value_counts().items()))
ex("A. profile", "Penalty", "note", 0, "no Penalty ball exists in the IPL subset (the single raw Penalty row is a non-IPL match); "
   "the rule below is coded but untested on IPL data", "n/a")
ex("A. profile", "all", "extras_type == 'None' exactly when extras1_runs == 0", bool(((b.extras_type == "None") == (b.extras1_runs == 0)).all()))
ex("A. profile", "all", "is_four balls with runs != 4", int(((b.is_four == "true") & (b.runs != 4)).sum()))
ex("A. profile", "all", "is_six balls with runs != 6", int(((b.is_six == "true") & (b.runs != 6)).sum()))
ex("A. profile", "all", "is_four or is_six balls with an extras_type in (byes, legbyes, wide)",
   int((((b.is_four == "true") | (b.is_six == "true")) & b.extras_type.isin(["byes", "legbyes", "wide"])).sum()),
   "boundaries are never recorded on byes, leg-byes or wides, so runs is off the bat only (confirms `runs` = batter runs)", "high")

# B. over structure: which extras types are re-bowled (non-legal)?  complete overs must hold exactly 6 legal deliveries
m12["complete"] = m12.overid < m12.groupby(["match_id", "innings"]).overid.transform("max")
combos = [
    ("wide + Overstep + other not legal (decision)", ["wide", "Overstep", "other"]),
    ("wide + Overstep not legal; other legal", ["wide", "Overstep"]),
    ("wide + other not legal; Overstep legal", ["wide", "other"]),
    ("Overstep + other not legal; wide legal", ["Overstep", "other"]),
    ("only wide not legal", ["wide"]),
    ("only Overstep not legal", ["Overstep"]),
    ("only other not legal", ["other"]),
    ("nothing re-bowled (every delivery legal)", []),
    ("decision + byes not legal", ["wide", "Overstep", "other", "byes"]),
    ("decision + legbyes not legal", ["wide", "Overstep", "other", "legbyes"]),
]
n_complete = int(m12[m12.complete].groupby(["match_id", "innings", "overid"]).ngroups)
ex("B. over structure", "all", "complete overs tested (innings 1-2, an over followed by another over in the same innings)", n_complete)
best = None
for label, nonlegal in combos:
    lg = (~m12.extras_type.isin(nonlegal))
    per_over = lg[m12.complete].groupby([m12.match_id, m12.innings, m12.overid]).sum()
    n6 = int((per_over == 6).sum())
    ex("B. over structure", label, "complete overs with exactly 6 legal balls", f"{n6} of {n_complete}",
       "" if label != combos[0][0] else "the only hypothesis under which (almost) every over has 6 legal balls", "")
    if best is None:
        best = n6
dec_lg = (~m12.extras_type.isin(NONLEGAL_TYPES))
per_over_dec = dec_lg.groupby([m12.match_id, m12.innings, m12.overid]).sum().rename("legal").reset_index()
per_over_dec = per_over_dec.merge(m12.groupby(["match_id", "innings", "overid"]).complete.first().reset_index(),
                                  on=["match_id", "innings", "overid"])
short_overs = per_over_dec[per_over_dec.complete & (per_over_dec.legal != 6)]
ex("B. over structure", "decision", "complete overs without exactly 6 legal balls", len(short_overs),
   "match/over: " + fmt_list(f"{x.match_id}/{x.overid} ({x.legal} legal)" for x in short_overs.itertuples()) +
   "; both innings of 14130 and one innings of 14164 each have a 5-ball over 14: possible missing ball in the source; flagged, not repaired",
   "")
inn_leg = m12.assign(lg=dec_lg).groupby(["match_id", "innings"]).lg.sum()
ex("B. over structure", "decision", "innings with more than 120 legal balls", int((inn_leg > 120).sum()),
   "none: 6 legal balls per over, 20 overs", "high")
ex("B. over structure", "other", "overs that hold 7 deliveries when the only odd ball is 'other'",
   int(((m12.groupby(["match_id", "innings", "overid"]).agg(n=("runs", "size"), o=("extras_type", lambda s: (s == "other").sum()),
                                                            w=("extras_type", lambda s: s.isin(["wide", "Overstep"]).sum()))
         .query("o == 1 and w == 0 and n == 7")).shape[0])),
   "'other' deliveries are re-bowled exactly like no-balls and wides", "high")

# C. which runs column holds what
nb_like = b[b.extras_type.isin(NOBALL_TYPES)]
ex("C. runs fields", "Overstep", "extras1_runs equals 1 on every ball", bool((b[b.extras_type == "Overstep"].extras1_runs == 1).all()),
   "Overstep = no-ball: 1 penalty run in extras1_runs, bat runs in `runs`", "high")
ex("C. runs fields", "other", "extras1_runs equals 1 on every ball", bool((b[b.extras_type == "other"].extras1_runs == 1).all()),
   "'other' behaves like a no-ball: 1 extra run, bat runs (0-6) in `runs`, only run-outs possible, re-bowled", "high (behaviour); medium (label)")
ex("C. runs fields", "other", "share of balls where the batter scored", round(float((b[b.extras_type == "other"].runs > 0).mean()), 4),
   "a wide never carries bat runs (see wide row), so 'other' is not a wide", "high")
ex("C. runs fields", "wide", "balls with runs > 0", int((b[b.extras_type == "wide"].runs > 0).sum()),
   "all wide runs sit in extras1_runs (1 to 5); byes taken off a wide are inside that figure", "high")
ex("C. runs fields", "byes/legbyes", "balls with runs > 0", int((b[b.extras_type.isin(["byes", "legbyes"])].runs > 0).sum()),
   "byes and leg-byes sit entirely in extras1_runs, never in `runs`", "high")
x2 = b[b.extras_2_runs > 0]
ex("C. runs fields", "extras_2_runs", "IPL balls with extras_2_runs > 0", len(x2),
   "values: " + fmt_list(f"{k}:{v}" for k, v in x2.extras_2_runs.value_counts().sort_index().items()), "")
ex("C. runs fields", "extras_2_runs", "extras_type on those balls", fmt_list(f"{k}:{v}" for k, v in x2.extras_type.value_counts().items()),
   "only on no-ball-type deliveries", "")
ex("C. runs fields", "extras_2_runs", "balls where the batter also scored (runs > 0)", int((x2.runs > 0).sum()),
   f"0 of {len(x2)}; among no-ball-type balls the batter scores on {(nb_like.runs > 0).mean():.0%}, "
   "so runs here are not off the bat: consistent with byes / leg-byes run off a no-ball", "medium")
ex("C. runs fields", "extras_2_runs", "balls flagged is_four or is_six", int(((x2.is_four == "true") | (x2.is_six == "true")).sum()),
   "a 4 here is not a bat boundary", "")

# D. team-score test: which formula for total runs makes every successful chase end exactly on the ball that reaches the target?
cs = m12.copy()
formulas = [
    ("runs + extras1_runs + extras_2_runs (decision)", cs.runs + cs.extras1_runs + cs.extras_2_runs),
    ("runs + extras1_runs", cs.runs + cs.extras1_runs),
    ("runs only", cs.runs),
]
for label, tot in formulas:
    cs["tot"] = tot
    cs["cum"] = cs.groupby(["match_id", "innings"]).tot.cumsum()
    t1 = cs[cs.innings == 1].groupby("match_id").tot.sum() + 1
    c2 = cs[cs.innings == 2].copy()
    c2["target"] = c2.match_id.map(t1)
    c2["before"] = c2.cum - c2.tot
    lastb = c2.groupby("match_id").innings_ball_num.transform("max")
    after = int((c2.before >= c2.target).sum())
    reached = c2.groupby("match_id").apply(lambda g: g.cum.max() >= g.target.iloc[0], include_groups=False)
    fin = c2[c2.innings_ball_num == lastb]
    exact = int(((fin.cum >= fin.target) & (fin.before < fin.target)).sum())
    ex("D. team-score test", label, "balls bowled after the chase had already reached the target", after,
       "must be 0 if the formula equals the real team score" if label.startswith("runs +") and "extras_2" in label else "")
    ex("D. team-score test", label, "chases that reach the target", int(reached.sum()))
    ex("D. team-score test", label, "of those, chases whose last ball is exactly the ball that reaches the target", exact,
       "all of them under the decision formula" if exact == int(reached.sum()) else "some chases do not stop on the target ball")
dec_exact_ok = True

# E. decisions
decisions = [
    ("wide", "is_wide = True; legal ball: NO; ball faced by batter: NO; batter runs 0; wide_runs = extras1_runs (1 to 5), all charged to the bowler", "high"),
    ("Overstep", "no-ball. is_noball = True; legal: NO; ball faced: YES; bat_runs = runs; noball_runs = extras1_runs (always 1); charged to bowler: bat runs + 1", "high"),
    ("other", "treated as a no-ball-type illegal delivery (is_noball = True, noball_kind = 'other'): re-bowled, 1 extra run, bat runs counted, only run-outs; "
              "the exact cricket meaning of 'other' (for example a different kind of no-ball) is NOT in the data", "high that it is re-bowled and not a wide; medium that it is a no-ball"),
    ("legbyes", "legal ball (unless also wide/no-ball); ball faced: YES; bat runs 0; legbye_runs = extras1_runs; added to team score, NOT charged to bowler", "high"),
    ("byes", "legal ball; ball faced: YES; bat runs 0; bye_runs = extras1_runs; added to team score, NOT charged to bowler", "high"),
    ("Penalty", "penalty_runs = extras1_runs; added to team score; not charged to bowler; the delivery is not treated as wide or no-ball. Never occurs in IPL data", "untested"),
    ("None", "no extras; legal; bat_runs = runs", "high"),
    ("extras_2_runs", "second extras amount seen only on no-ball-type balls with no bat runs: read as byes or leg-byes run off the no-ball. "
                      "Added to team score (confirmed by the chase test), NOT charged to the bowler (assumed, 20 balls); kept in its own column extras2_runs, "
                      "never split into bye_runs / legbye_runs because the data does not say which", "high that it is added to the score; low on bye vs leg-bye"),
    ("total_runs", "runs + extras1_runs + extras_2_runs (confirmed by the chase test above)", "high"),
    ("bowler_runs_conceded", "bat runs + wide_runs + noball_runs, per Part 5", "high (rule is Part 5)"),
]
for subj, text, conf in decisions:
    ex("E. decision", subj, "rule adopted", text, "", conf)
ex_df = pd.DataFrame(EX, columns=["section", "subject", "metric", "value", "conclusion", "confidence"])

# ----------------------------------------------------------------------------------------------------------------
# 5. Ball table: derived columns
# ----------------------------------------------------------------------------------------------------------------
et = b.extras_type
b["is_super_over"] = b.innings.isin([int(x) for x in SUPER_OVER_INNINGS])
b["phase"] = np.where(b.is_super_over, "SuperOver", b.overid.map(phase_of))
b["is_wide"] = et == "wide"
b["is_noball"] = et.isin(NOBALL_TYPES)
b["noball_kind"] = np.where(et == "Overstep", "Overstep", np.where(et == "other", "other_inferred", ""))
b["legal_ball"] = ~(b.is_wide | b.is_noball)
b["ball_faced"] = ~b.is_wide
b["impact_player_era"] = b.season >= IMPACT_PLAYER_FROM
b["bat_runs"] = b.runs
b["wide_runs"] = np.where(b.is_wide, b.extras1_runs, 0)
b["noball_runs"] = np.where(b.is_noball, b.extras1_runs, 0)
b["bye_runs"] = np.where(et == "byes", b.extras1_runs, 0)
b["legbye_runs"] = np.where(et == "legbyes", b.extras1_runs, 0)
b["penalty_runs"] = np.where(et == "Penalty", b.extras1_runs, 0)
b["extras2_runs"] = b.extras_2_runs
b["total_runs"] = b.runs + b.extras1_runs + b.extras_2_runs
b["bowler_runs_conceded"] = b.bat_runs + b.wide_runs + b.noball_runs
assert (b.total_runs == b.bat_runs + b.wide_runs + b.noball_runs + b.bye_runs + b.legbye_runs + b.penalty_runs + b.extras2_runs).all()

# wickets and dismissals
dt = b.dismissal_type
b["dismissal_kind"] = dt.replace({"Obstracting the field": "Obstructing the field"})
b["is_wicket_flag"] = b.is_wicket == "true"
b["is_bowler_wicket"] = dt.isin(BOWLER_WICKET_TYPES)
b["is_run_out"] = dt == "RunOut"
b["player_out_id"] = ""
b["player_out_source"] = ""
has_id = b.dismissed_player_id != ""
b.loc[b.is_wicket_flag & has_id, "player_out_id"] = b.dismissed_player_id
b.loc[b.is_wicket_flag & has_id, "player_out_source"] = "raw"
b["retired_player_id"] = ""
dis_rows = []
# (i) wicket rows without a dismissed id: resolve from who leaves the crease
for row in b[b.is_wicket_flag & ~has_id].itertuples():
    later = b[(b.match_id == row.match_id) & (b.innings == row.innings) & (b.innings_ball_num > row.innings_ball_num)]
    cand = {}
    for p, role in [(row.striker_id, "striker"), (row.non_striker_id, "non-striker")]:
        cand[p] = int(((later.striker_id == p) | (later.non_striker_id == p)).sum())
    gone = [p for p, n in cand.items() if n == 0]
    if len(gone) == 1:
        b.loc[row.Index, "player_out_id"] = gone[0]
        b.loc[row.Index, "player_out_source"] = "inferred: the only batter at the crease who never appears again in the innings"
        dis_rows.append((row, "RESOLVED", gone[0], cand))
    else:
        b.loc[row.Index, "player_out_source"] = "UNRESOLVED"
        dis_rows.append((row, "UNRESOLVED", "", cand))
# (ii) non-wicket rows that carry a dismissed id: batter left the crease without a dismissal (retired, not out)
ret_mask = (~b.is_wicket_flag) & has_id
for row in b[ret_mask].itertuples():
    later = b[(b.match_id == row.match_id) & (b.innings == row.innings) & (b.innings_ball_num > row.innings_ball_num)]
    n_later = int(((later.striker_id == row.dismissed_player_id) | (later.non_striker_id == row.dismissed_player_id)).sum())
    b.loc[row.Index, "retired_player_id"] = row.dismissed_player_id
    dis_rows.append((row, "RETIRED_NOT_OUT" if n_later == 0 else "RETIRED_THEN_RETURNED", row.dismissed_player_id, {row.dismissed_player_id: n_later}))
b["is_retired"] = (dt == "Retire Out") | ret_mask
b.loc[dt == "Retire Out", "retired_player_id"] = b.player_out_id
assert (b.is_wicket_flag == b.dismissal_kind.ne("")).all()
po = b[b.player_out_id != ""]
po_ok = ((po.player_out_id == po.striker_id) | (po.player_out_id == po.non_striker_id))
assert po_ok.all(), "player_out_id is neither striker nor non-striker"

# game state before each ball (innings order == raw order)
g = b.groupby(["match_id", "innings"], sort=False)
b["team_runs_before"] = g.total_runs.cumsum() - b.total_runs
b["wickets_before"] = g.is_wicket_flag.cumsum() - b.is_wicket_flag.astype(int)
b["legal_balls_before"] = g.legal_ball.cumsum() - b.legal_ball.astype(int)

# innings summaries and match table
inn = b.groupby(["match_id", "innings"]).agg(
    runs=("total_runs", "sum"), wkts=("is_wicket_flag", "sum"), legal=("legal_ball", "sum"), balls=("legal_ball", "size"),
    retired=("is_retired", "sum"), bat=("batting_team_id", "first"), bowl=("bowling_team_id", "first"),
    t_first=("ts_clock", "min"), t_last=("ts_clock", "max")).reset_index()
I = {(int(x.match_id), int(x.innings)): x for x in inn.itertuples()}

# target and chase state for innings 2
t_map = {m: I[(m, 1)].runs + 1 for m in ipl_ids if (m, 1) in I}
b["target"] = pd.array(np.where(b.innings == 2, b.match_id.map(t_map), np.nan), dtype="Int64")
b["runs_needed_before"] = pd.array(np.where(b.innings == 2, b.target.astype("float") - b.team_runs_before, np.nan), dtype="Int64")
b["legal_balls_left_before"] = pd.array(np.where(b.innings == 2, 120 - b.legal_balls_before, np.nan), dtype="Int64")

# ----------------------------------------------------------------------------------------------------------------
# 6. Match table
# ----------------------------------------------------------------------------------------------------------------
gaps = b[b.innings <= 2].groupby("match_id").gap_prev_s.max()
matches = []
tn = IPL_TEAMS
for m in ipl_ids:
    i1, i2 = I.get((m, 1)), I.get((m, 2))
    teams = sorted(team_sets[m])
    bat1 = i1.bat
    bat2 = i2.bat if i2 is not None else [t for t in teams if t != bat1][0]
    row = dict(match_id=m, season=int(season_of[m]), match_date=match_date[m], first_ball_recorded=first_ts[m].strftime("%H:%M:%S"),
               batting_first_id=bat1, batting_first=tn[bat1], batting_second_id=bat2, batting_second=tn[bat2],
               inns1_balls=int(i1.balls), inns2_balls=int(i2.balls) if i2 is not None else 0)
    row.update(inns1_runs=int(i1.runs), inns1_wickets=int(i1.wkts), inns1_legal_balls=int(i1.legal),
               inns2_runs=int(i2.runs) if i2 is not None else np.nan, inns2_wickets=int(i2.wkts) if i2 is not None else np.nan,
               inns2_legal_balls=int(i2.legal) if i2 is not None else 0,
               target=int(i1.runs) + 1, retired_not_out_inns1=int(((b.match_id == m) & (b.innings == 1) & (b.is_retired) & (~b.is_wicket_flag)).sum()),
               retired_not_out_inns2=int(((b.match_id == m) & (b.innings == 2) & (b.is_retired) & (~b.is_wicket_flag)).sum()))
    # super over
    s3, s4 = I.get((m, 3)), I.get((m, 4))
    row["super_over"] = s3 is not None or s4 is not None
    row["so_first_team_id"] = s3.bat if s3 is not None else ""
    row["so_second_team_id"] = s4.bat if s4 is not None else ""
    row["so_first_runs"] = int(s3.runs) if s3 is not None else np.nan
    row["so_second_runs"] = int(s4.runs) if s4 is not None else np.nan
    # reduced-overs evidence
    ev, reduced, noresult = [], False, False
    inn1_short = i1.legal < 120 and i1.wkts < 10
    if inn1_short:
        reduced = True
        ev.append(f"innings 1 ended after {int(i1.legal)} legal balls with {int(i1.wkts)} wickets down (120 balls, 10 wickets not used; "
                  f"short by {120 - int(i1.legal)} ball(s))")
        if i1.legal < MIN_OVERS_FOR_RESULT_BALLS:
            noresult = True
    inn2_short_unmet = False
    if i2 is None:
        noresult = True
        ev.append("only innings 1 exists in the data")
    else:
        unmet = i2.runs < row["target"]
        if unmet and i2.legal < 120 and i2.wkts < 10:
            inn2_short_unmet = True
            reduced = True
            ev.append(f"innings 2 ended after {int(i2.legal)} legal balls with {int(i2.wkts)} wickets down, target {row['target']} not reached "
                      f"(scored {int(i2.runs)}; short by {120 - int(i2.legal)} ball(s))")
            if i2.legal < MIN_OVERS_FOR_RESULT_BALLS:
                noresult = True
    if i2 is not None and inn1_short and int(i2.legal) == int(i1.legal):
        ev.append(f"both innings ended on the same legal-ball count ({int(i1.legal)}): consistent with both sides limited to the same shortened overs, "
                  "but the data cannot confirm the allotted overs or any revised target")
    gmax = gaps.get(m, np.nan)
    mg = long_gap[long_gap.match_id == m]
    row["long_gap_count"] = len(mg)
    row["max_gap_min"] = round(float(mg.gap_prev_s.max()) / 60, 1) if len(mg) else np.nan
    row["long_gap_where"] = fmt_list(f"inns {x.innings} over {x.overid}.{x.over_ball_num} ({x.gap_prev_s / 60:.1f} min)" for x in mg.itertuples())
    row["timestamp_glitch"] = bool(len(glitch[glitch.match_id == m]))
    bk = brk[brk.match_id == m]
    row["long_innings_break"] = bool(len(bk) and bk.break_s.iloc[0] > LONG_BREAK_S)
    row["innings_break_min"] = round(float(bk.break_s.iloc[0]) / 60, 1) if len(bk) else np.nan
    # result
    cat, winner, reason, mtype, mval, mballs, mwk = "", "", "", "", np.nan, np.nan, np.nan
    if i2 is None:
        cat, reason = "UNDETERMINED_FROM_DATA", "only one innings in the data (no-result / abandoned / incomplete record)"
    else:
        if i2.runs >= row["target"]:
            cat, winner = "CHASING_SIDE_REACHED_TARGET", bat2
            mtype, mwk, mballs = "wickets", 10 - int(i2.wkts), 120 - int(i2.legal)
            mval = mwk
        elif i2.runs < row["target"]:
            complete2 = i2.legal >= 120 or i2.wkts >= 10
            if i2.runs == i1.runs and complete2:
                # tie in the main innings
                s_ok = s3 is not None and s4 is not None
                if s_ok:
                    if s4.runs > s3.runs:
                        cat, winner = "TIE_DECIDED_BY_SUPER_OVER", s4.bat
                    elif s4.runs < s3.runs and (s4.legal >= 6 or s4.wkts >= 2):
                        cat, winner = "TIE_DECIDED_BY_SUPER_OVER", s3.bat
                    else:
                        cat, reason = "UNDETERMINED_FROM_DATA", "tie in the main innings; super over not decisive in the data"
                else:
                    cat, reason = "UNDETERMINED_FROM_DATA", "tie in the main innings and no super over in the data"
                if winner:
                    mtype, mval = "super_over_runs", abs(int(s4.runs) - int(s3.runs))
            elif complete2:
                cat, winner = "DEFENDING_SIDE_WON", bat1
                mtype, mval = "runs", int(i1.runs) - int(i2.runs)
            else:
                cat, reason = "UNDETERMINED_FROM_DATA", "innings 2 ended short of its overs with wickets in hand and the target not reached (rain / DLS / abandoned?)"
    row.update(result_category=cat, winner_id=winner, winner=tn.get(winner, ""), result_reason=reason, margin_type=mtype,
               margin_value=mval, margin_balls_remaining=mballs if cat == "CHASING_SIDE_REACHED_TARGET" else np.nan)
    row["suspected_reduced_overs_dls"] = reduced
    row["reduced_overs_evidence"] = "; ".join(ev)
    row["suspected_no_result_or_abandoned"] = noresult
    row["impact_player_era"] = row["season"] >= IMPACT_PLAYER_FROM
    matches.append(row)
M = pd.DataFrame(matches)
M = M.sort_values(["season", "match_date", "first_ball_recorded", "match_id"]).reset_index(drop=True)
M.insert(2, "order_in_season", M.groupby("season").cumcount() + 1)

# playoffs (provisional): last 4 matches of each season by date order
M["is_playoff"] = False
M["playoff_label"] = ""
labels = ["Qualifier 1", "Eliminator", "Qualifier 2", "Final"]
M["playoff_method"] = ""
for s, gg in M.groupby("season"):
    last4 = gg.tail(4).index
    for lab, idx in zip(labels, last4):
        M.loc[idx, ["is_playoff", "playoff_label"]] = [True, lab]
        M.loc[idx, "playoff_method"] = "PROVISIONAL: last 4 matches of the season by (date, first-ball time, match_id), labelled in that order"
# structural plausibility check on the playoff labels, using team ids only
play_chk = {}
for s, gg in M[M.is_playoff].groupby("season"):
    P = {x.playoff_label: {x.batting_first_id, x.batting_second_id} for x in gg.itertuples()}
    q1, el, q2, fi = P["Qualifier 1"], P["Eliminator"], P["Qualifier 2"], P["Final"]
    ok = (len(q1 & el) == 0 and len(q2 & q1) == 1 and len(q2 & el) == 1 and fi <= (q1 | q2) and len(fi & q2) >= 1)
    play_chk[s] = ok
M["playoff_structure_check"] = M.season.map(play_chk).where(M.is_playoff, "")

# other matches between the same team pair in the same season
pair = M.apply(lambda x: tuple(sorted([x.batting_first_id, x.batting_second_id])), axis=1)
M["same_pair_other_matches_in_season"] = [
    fmt_list(M.match_id[(pair == pair[i]) & (M.season == M.season[i]) & (M.match_id != M.match_id[i])]) for i in M.index]

# provisional win-probability eligibility
elig, why = [], []
for x in M.itertuples():
    reasons = []
    if x.result_category == "UNDETERMINED_FROM_DATA":
        reasons.append("result undetermined from data: " + x.result_reason)
    if x.suspected_reduced_overs_dls:
        reasons.append("suspected reduced overs / DLS: " + x.reduced_overs_evidence)
    if x.suspected_no_result_or_abandoned and x.result_category != "UNDETERMINED_FROM_DATA":
        reasons.append("suspected no-result / abandoned")
    elig.append(not reasons)
    why.append(" | ".join(reasons))
M["wp_eligible_provisional"] = elig
M["wp_ineligible_reason"] = why
cav = []
for x in M.itertuples():
    c = []
    if x.long_gap_count:
        c.append(f"{x.long_gap_count} gap(s) over 20 min inside an innings, max {x.max_gap_min} min")
    if x.long_innings_break:
        c.append(f"innings break {x.innings_break_min} min")
    if x.timestamp_glitch:
        c.append("one out-of-order timestamp")
    cav.append("; ".join(c))
M["interruption_caveat"] = cav

# reconcile with the supervisor's preliminary keys
keys = pd.read_csv(WORK / "ipl_match_keys.csv", dtype=str, keep_default_na=False)
mk = M[["match_id", "season", "order_in_season", "match_date", "first_ball_recorded", "batting_first_id", "batting_first",
        "batting_second_id", "batting_second", "inns1_balls", "inns2_balls"]].astype(str)
rec = keys.merge(mk, on="match_id", how="outer", suffixes=("_keys", "_audit"), indicator=True)
only_one = int((rec._merge != "both").sum())
diff_cols = []
for c in [c for c in mk.columns if c != "match_id"]:
    nd = int((rec[c + "_keys"] != rec[c + "_audit"]).sum())
    if nd:
        diff_cols.append((c, nd))
reconciled = only_one == 0 and not diff_cols and len(keys) == len(M) == 367
cov("reconciliation", "match table vs data/work/ipl_match_keys.csv", "IPL",
    "identical" if reconciled else f"DIFFERENCES: only_in_one={only_one}, columns={diff_cols}",
    f"{len(keys)} keys rows, {len(M)} match rows; compared columns: match_id, season, order_in_season, match_date, first_ball_recorded, teams, innings ball counts")
assert reconciled, f"match table does not reconcile with ipl_match_keys.csv: {only_one}, {diff_cols}"

# attach match-level columns to the ball table
mm = M.set_index("match_id")
b["reduced_overs_suspected"] = b.match_id.map(mm.suspected_reduced_overs_dls)
b["is_playoff_match"] = b.match_id.map(mm.is_playoff)

# ----------------------------------------------------------------------------------------------------------------
# 7. Output: ball table
# ----------------------------------------------------------------------------------------------------------------
RAW_COLS = list(raw.columns)           # row_id + 33 raw columns
DERIVED = [
    "season", "match_date", "ts_ist", "is_super_over", "phase", "is_wide", "is_noball", "noball_kind", "legal_ball", "ball_faced",
    "bat_runs", "wide_runs", "noball_runs", "bye_runs", "legbye_runs", "penalty_runs", "extras2_runs", "total_runs", "bowler_runs_conceded",
    "is_bowler_wicket", "dismissal_kind", "player_out_id", "player_out_source", "is_run_out", "is_retired", "retired_player_id",
    "team_runs_before", "wickets_before", "legal_balls_before", "target", "runs_needed_before", "legal_balls_left_before",
    "reduced_overs_suspected", "impact_player_era", "is_playoff_match"]
bt = b.copy()
bt["season"] = bt.season.astype("int64")
out_b = pd.concat([raw.loc[b.row_id.values, RAW_COLS].reset_index(drop=True), bt[DERIVED].reset_index(drop=True)], axis=1)
WORK.mkdir(parents=True, exist_ok=True)
TABLES.mkdir(parents=True, exist_ok=True)
out_b.to_parquet(WORK / "balls_ipl.parquet", index=False)

# reconciliation checks
pq = pd.read_parquet(WORK / "balls_ipl.parquet")
assert len(pq) == n_ipl_rows == int(is_ipl_row.sum())
assert (pq[RAW_COLS].reset_index(drop=True).equals(raw[raw.row_id.isin(pq.row_id)].reset_index(drop=True)[RAW_COLS])), "raw columns changed"
n12 = int(pq.innings.isin(["1", "2"]).sum())
nso = int(pq.innings.isin(["3", "4"]).sum())
assert n12 + nso == n_ipl_rows
assert int(M.inns1_balls.sum() + M.inns2_balls.sum()) == n12
cov("reconciliation", "ball table rows == IPL rows in raw", "IPL", f"{len(pq)} == {n_ipl_rows}", "")
cov("reconciliation", "innings 1 balls + innings 2 balls + super-over balls == IPL balls", "IPL",
    f"{int(M.inns1_balls.sum())} + {int(M.inns2_balls.sum())} + {nso} == {n_ipl_rows}", "")
cov("reconciliation", "raw columns in the ball table identical to raw (all values, all IPL rows)", "IPL", "identical", "")

# ----------------------------------------------------------------------------------------------------------------
# 8. Match table output, result flags, super overs
# ----------------------------------------------------------------------------------------------------------------
M_out_cols = ["match_id", "season", "order_in_season", "match_date", "first_ball_recorded", "batting_first_id", "batting_first",
              "batting_second_id", "batting_second", "inns1_runs", "inns1_wickets", "inns1_legal_balls", "inns1_balls",
              "inns2_runs", "inns2_wickets", "inns2_legal_balls", "inns2_balls", "target", "retired_not_out_inns1", "retired_not_out_inns2",
              "result_category", "winner_id", "winner", "result_reason", "margin_type", "margin_value", "margin_balls_remaining",
              "suspected_reduced_overs_dls", "reduced_overs_evidence", "suspected_no_result_or_abandoned",
              "long_gap_count", "max_gap_min", "long_gap_where", "long_innings_break", "innings_break_min", "timestamp_glitch", "interruption_caveat",
              "super_over", "so_first_team_id", "so_second_team_id", "so_first_runs", "so_second_runs",
              "is_playoff", "playoff_label", "playoff_method", "playoff_structure_check", "impact_player_era",
              "same_pair_other_matches_in_season", "wp_eligible_provisional", "wp_ineligible_reason"]
M_out = M[M_out_cols].copy()
for c in ["inns2_runs", "inns2_wickets", "margin_value", "margin_balls_remaining", "so_first_runs", "so_second_runs"]:
    M_out[c] = M_out[c].astype("Int64")
M_out.to_csv(WORK / "matches_ipl.csv", index=False, lineterminator="\n")

# result flags: every non-normal match
fl = []
for x in M.itertuples():
    kinds = []
    if x.result_category == "UNDETERMINED_FROM_DATA":
        kinds.append("RESULT_UNDETERMINED")
    if x.suspected_reduced_overs_dls:
        kinds.append("SUSPECTED_REDUCED_OVERS_OR_DLS")
    if x.suspected_no_result_or_abandoned:
        kinds.append("SUSPECTED_NO_RESULT_OR_ABANDONED")
    if x.long_gap_count:
        kinds.append("LONG_GAP_IN_INNINGS")
    if x.long_innings_break:
        kinds.append("LONG_INNINGS_BREAK")
    if x.timestamp_glitch:
        kinds.append("TIMESTAMP_GLITCH")
    if x.super_over:
        kinds.append("SUPER_OVER")
    if x.result_category == "TIE_DECIDED_BY_SUPER_OVER":
        kinds.append("TIE")
    if x.match_id == LEAGUE_VOID_MATCH:
        kinds.append("NAMED_IN_BRIEF_ABANDONED_AND_REPLAYED")
    if (short_overs.match_id == x.match_id).any():
        kinds.append("OVER_WITH_5_LEGAL_BALLS")
    if kinds:
        fl.append(dict(match_id=x.match_id, season=x.season, match_date=x.match_date, playoff_label=x.playoff_label,
                       batting_first=x.batting_first, batting_second=x.batting_second,
                       inns1=f"{x.inns1_runs}/{x.inns1_wickets} ({x.inns1_legal_balls} legal balls)",
                       inns2=("" if x.inns2_legal_balls == 0 else f"{int(x.inns2_runs)}/{int(x.inns2_wickets)} ({x.inns2_legal_balls} legal balls)"),
                       target=x.target, result_category=x.result_category, derived_winner=x.winner, margin_type=x.margin_type,
                       margin_value=x.margin_value, flags=fmt_list(kinds),
                       evidence="; ".join(filter(None, [x.reduced_overs_evidence, x.result_reason,
                                                        ("gaps: " + x.long_gap_where) if x.long_gap_where else "",
                                                        x.interruption_caveat])),
                       same_pair_other_matches_in_season=x.same_pair_other_matches_in_season,
                       wp_eligible_provisional=x.wp_eligible_provisional, wp_ineligible_reason=x.wp_ineligible_reason,
                       external_check_needed="official result, margin, DLS target and overs per innings"))
FL = pd.DataFrame(fl)
FL.to_csv(TABLES / "step0_result_flags.csv", index=False, lineterminator="\n")

# super overs
so_rows = []
for x in M[M.super_over].itertuples():
    sb = b[(b.match_id == x.match_id) & b.is_super_over]
    row = dict(match_id=x.match_id, season=x.season, match_date=x.match_date, main_innings_score=f"{x.inns1_runs} v {int(x.inns2_runs)}",
               result_category=x.result_category, so_winner_id=x.winner_id, so_winner=x.winner)
    for k, lab in [(3, "so1"), (4, "so2")]:
        s = I.get((x.match_id, k))
        if s is not None:
            row.update({f"{lab}_team_id": s.bat, f"{lab}_team": tn[s.bat], f"{lab}_balls_all": int(s.balls), f"{lab}_legal_balls": int(s.legal),
                        f"{lab}_runs": int(s.runs), f"{lab}_wickets": int(s.wkts),
                        f"{lab}_bowler_ids": fmt_list(sorted(sb[sb.innings == k].bowler_id.unique()))})
    so_rows.append(row)
SO = pd.DataFrame(so_rows)
SO.to_csv(TABLES / "step0_super_overs.csv", index=False, lineterminator="\n")

# league-format checks (for notes)
league = M[~M.is_playoff]
lg_games = {}
for s, gg in league.groupby("season"):
    cnt = pd.concat([gg.batting_first_id, gg.batting_second_id]).value_counts()
    lg_games[s] = (len(gg), {tn[k]: int(v) for k, v in cnt.items()})
cat_counts = M.result_category.value_counts().to_dict()
import itertools
never_meet = {}
for s_, gg in league.groupby("season"):
    pc_ = pd.concat([gg.apply(lambda x: tuple(sorted([x.batting_first, x.batting_second])), axis=1)]).value_counts()
    never_meet[s_] = [f"{a_}-{b_}" for a_, b_ in itertools.combinations(sorted(IPL_TEAMS.values()), 2) if pc_.get((a_, b_), 0) == 0]

# ----------------------------------------------------------------------------------------------------------------
# 9. ID checks and player map
# ----------------------------------------------------------------------------------------------------------------
ID = []     # (check, status, severity, id_a, name_a, id_b, name_b, detail)


def idc(check, status, severity, a="", an="", bb="", bn="", detail=""):
    ID.append((check, status, severity, a, an, bb, bn, detail))


roles = pd.concat([
    b[["match_id", "season", "innings", "is_super_over", "striker_id", "striker_name", "batting_team_id", "ball_faced", "batting_type"]]
    .rename(columns={"striker_id": "pid", "striker_name": "pname", "batting_team_id": "team"}).assign(role="striker"),
    b[["match_id", "season", "innings", "is_super_over", "non_striker_id", "non_striker_name", "batting_team_id"]]
    .rename(columns={"non_striker_id": "pid", "non_striker_name": "pname", "batting_team_id": "team"}).assign(role="non_striker"),
    b[["match_id", "season", "innings", "is_super_over", "bowler_id", "bowler_name", "bowling_team_id"]]
    .rename(columns={"bowler_id": "pid", "bowler_name": "pname", "bowling_team_id": "team"}).assign(role="bowler")], ignore_index=True)
pn = roles.groupby(["pid", "pname"]).size().reset_index(name="n")
n_players = roles.pid.nunique()
idc("ids with more than one name (striker, non-striker, bowler combined)", "PASS" if (pn.groupby("pid").pname.nunique() > 1).sum() == 0 else "ISSUE",
    "info", detail=f"{int((pn.groupby('pid').pname.nunique() > 1).sum())} of {n_players} ids")
for pid, gg in pn.groupby("pid"):
    if len(gg) > 1:
        idc("id with several names", "ISSUE", "high", pid, fmt_list(f"{r_.pname} ({r_.n})" for r_ in gg.itertuples()))
idc("names with more than one id", "PASS" if (pn.groupby("pname").pid.nunique() > 1).sum() == 0 else "ISSUE", "info",
    detail=f"{int((pn.groupby('pname').pid.nunique() > 1).sum())} of {pn.pname.nunique()} names")
for nm, gg in pn.groupby("pname"):
    if len(gg) > 1:
        idc("name with several ids", "ISSUE", "high", fmt_list(gg.pid), nm, detail="different people sharing a name, or one person with several ids")
idc("empty player id or name in striker/non-striker/bowler", "PASS" if ((roles.pid == "") | (roles.pname == "")).sum() == 0 else "ISSUE", "info",
    detail=f"{int(((roles.pid == '') | (roles.pname == '')).sum())} rows")
idc("dismissed_player_id is striker or non-striker on that ball", "PASS" if po_ok.all() else "ISSUE", "info",
    detail=f"{int(len(po))} resolved dismissals checked, {int((~po_ok).sum())} failures (also true for the 5 retired-not-out ids)")
idc("striker equals non-striker on a ball", "PASS", "info", detail=f"{int((b.striker_id == b.non_striker_id).sum())} IPL rows")
# a player listed for two teams in the same match
pm = roles.groupby(["pid", "match_id"]).team.nunique()
idc("player id on both teams in one match", "PASS" if (pm > 1).sum() == 0 else "ISSUE", "info", detail=f"{int((pm > 1).sum())} player-matches")
for (pid, m_id), _ in pm[pm > 1].items():
    idc("player id on both teams in one match", "ISSUE", "high", pid, "", detail=f"match {m_id}")
# the dismissal disagreement rows
for row, status, pid, cand in dis_rows:
    nm = lambda p: roles[roles.pid == p].pname.iloc[0] if p in set(roles.pid) else ""
    if status == "RESOLVED":
        idc("dismissal_type present but dismissed_player_id empty", "RESOLVED (inferred)", "medium", pid, nm(pid),
            detail=f"match {row.match_id} innings {row.innings} over {row.overid}.{row.over_ball_num} row_id {row.row_id}: dismissal_type '{row.dismissal_type}'; "
                   f"striker {row.striker_id} and non-striker {row.non_striker_id} later appearances in innings: {cand}; "
                   f"only {pid} never bats again, so he is player_out_id (needs external confirmation)")
    elif status == "UNRESOLVED":
        idc("dismissal_type present but dismissed_player_id empty", "UNRESOLVED", "high", detail=f"match {row.match_id} row_id {row.row_id}")
    else:
        idc("dismissed_player_id present but dismissal_type empty and is_wicket false", f"RESOLVED as {status}", "medium", pid, nm(pid),
            detail=f"match {row.match_id} innings {row.innings} over {row.overid}.{row.over_ball_num} row_id {row.row_id}: not a wicket; "
                   f"the batter does not bat again ({cand.get(pid)} later appearances) and a new batter comes in: read as retired not out (retired hurt). "
                   f"player_out_id left empty, retired_player_id = {pid}; is_wicket stays false")
idc("dismissal_type / dismissed_player_id disagreement rows", "INFO", "info",
    detail=f"{disagree_all} rows in the whole raw file (DATA_AUDIT.md: 13); {len(dis_rows)} are IPL rows and all are listed above; the others are non-IPL and excluded")

# names: near duplicates and name oddities
canon = pn.sort_values(["pid", "n", "pname"], ascending=[True, False, True]).groupby("pid").first().reset_index()[["pid", "pname"]]


def norm_name(s):
    s = re.sub(r"\d+", " ", s.lower())
    s = re.sub(r"[^a-z ]", " ", s.replace("-", " "))
    return " ".join(s.split())


canon["norm"] = canon.pname.map(norm_name)
canon["toks"] = canon.norm.str.split()
_hand = b[b.ball_faced & ~b.is_super_over].groupby("striker_id").batting_type.agg(lambda x: x.value_counts().index[0])
_bty = b[~b.is_super_over].groupby("bowler_id").bowling_type.agg(lambda x: x.value_counts().index[0])
PM_ATTR = {p: f"bat {_hand.get(p, 'n/a')}, bowl {_bty.get(p, 'n/a')}" for p in canon.pid}
by_pid_matches = roles.groupby("pid").match_id.agg(set)
by_pid_seasons = roles.groupby("pid").season.agg(lambda s: sorted(set(s)))
by_pid_teams = roles.groupby("pid").team.agg(lambda s: sorted(set(s)))
cand_pairs = []
rows_ = list(canon.itertuples())
for i in range(len(rows_)):
    for j in range(i + 1, len(rows_)):
        a, c = rows_[i], rows_[j]
        why = []
        if a.norm == c.norm:
            why.append("same name after normalisation")
        ratio = difflib.SequenceMatcher(None, a.norm, c.norm).ratio()
        if ratio >= 0.85:
            why.append(f"similar spelling (ratio {ratio:.2f})")
        if a.toks and c.toks and a.toks[-1] == c.toks[-1] and a.toks[0][0] == c.toks[0][0]:
            why.append("same surname and same first initial")
        if sorted(a.toks) == sorted(c.toks) and a.norm != c.norm:
            why.append("same words in a different order")
        sa, sc = set(a.toks), set(c.toks)
        if len(sa) >= 2 and len(sc) >= 2 and (sa < sc or sc < sa):
            why.append("one name's words are contained in the other's")
        if why:
            cand_pairs.append((a, c, why, ratio))
for a, c, why, ratio in cand_pairs:
    shared = len(by_pid_matches[a.pid] & by_pid_matches[c.pid])
    spelling_like = a.norm == c.norm or ratio >= 0.85
    same_season_other_team = any(
        set(roles[(roles.pid == a.pid) & (roles.season == sn)].team) != set(roles[(roles.pid == c.pid) & (roles.season == sn)].team)
        for sn in set(by_pid_seasons[a.pid]) & set(by_pid_seasons[c.pid]))
    if shared:
        status, sev = "DISTINCT PEOPLE (both appear in the same match)", "info"
    elif spelling_like:
        status, sev = "UNRESOLVED (spelling-like, never in the same match; needs external check)", "medium"
    else:
        status, sev = "DIFFERENT GIVEN NAMES (only surname and initial coincide; never in the same match; no evidence of identity)", "low"
    pa = PM_ATTR.get(a.pid, "")
    pc = PM_ATTR.get(c.pid, "")
    idc("near-duplicate or look-alike names", status, sev, a.pid, a.pname, c.pid, c.pname,
        detail=f"{'; '.join(why)}. Seasons {fmt_list(by_pid_seasons[a.pid])} vs {fmt_list(by_pid_seasons[c.pid])}; teams "
               f"{fmt_list(by_pid_teams[a.pid])} vs {fmt_list(by_pid_teams[c.pid])}; matches in common {shared}; "
               f"{'same season with different teams; ' if same_season_other_team and not shared else ''}"
               f"main profile {pa} vs {pc}. Not merged.")
n_unres = sum(1 for x in ID if x[0].startswith("near-duplicate") and x[1].startswith("UNRESOLVED"))
n_dist = sum(1 for x in ID if x[0].startswith("near-duplicate") and x[1].startswith("DISTINCT PEOPLE"))
n_lookalike = sum(1 for x in ID if x[0].startswith("near-duplicate"))
for x in canon.itertuples():
    if re.search(r"\d", x.pname):
        idc("name with a numeric suffix", "FLAG", "medium", x.pid, x.pname,
            detail="a digit suffix usually separates two people with the same name; the other person may sit under another id or be absent from IPL data")
    if x.toks and len(x.toks[0]) == 1 and len(x.toks) > 1:
        idc("name starts with a single initial", "FLAG", "low", x.pid, x.pname, detail="abbreviated first name; the full name may appear under another spelling elsewhere")
    if len(x.toks) == 1:
        idc("single-word name", "FLAG", "low", x.pid, x.pname, detail="no surname or initials to compare")

# player attributes
brows = b[b.ball_faced & ~b.is_super_over]
bow_all = b[~b.is_super_over]
pm_rows = []
for x in canon.itertuples():
    pid = x.pid
    ro = roles[roles.pid == pid]
    names = pn[pn.pid == pid].sort_values(["n", "pname"], ascending=[False, True])
    sts = brows[brows.striker_id == pid]
    bw = bow_all[bow_all.bowler_id == pid]
    ts_ = ro.groupby(["season", "team"]).size().reset_index(name="n").sort_values(["season", "n", "team"], ascending=[True, False, True])
    seasons = sorted(ts_.season.unique())
    team_by_season = {s: ts_[ts_.season == s].team.iloc[0] for s in seasons}
    multi = [s for s in seasons if (ts_.season == s).sum() > 1]
    last_ball = ro.sort_values(["season", "match_id"]).iloc[-1]
    flags = []
    row = dict(player_id=pid, canonical_name=x.pname, name_variants=fmt_list(f"{r_.pname} ({r_.n})" for r_ in names.itertuples()),
               n_name_variants=len(names), seasons_active=fmt_list(seasons), n_seasons=len(seasons),
               ipl_matches=int(ro.match_id.nunique()), matches_batted=int(ro[ro.role != "bowler"].match_id.nunique()),
               matches_bowled=int(ro[ro.role == "bowler"].match_id.nunique()), balls_faced=int(len(sts)),
               legal_balls_bowled=int(bw.legal_ball.sum()), deliveries_bowled=int(len(bw)),
               team_id_by_season=fmt_list(f"{s}:{team_by_season[s]}" for s in seasons),
               team_by_season=fmt_list(f"{s}:{tn[team_by_season[s]]}" for s in seasons),
               latest_season=int(last_ball.season), latest_team_id=last_ball.team, latest_team=tn[last_ball.team])
    if len(sts):
        sh = sts.batting_type.value_counts(normalize=True)
        row.update(rhb_share=round(float(sh.get("RHB", 0)), 4), lhb_share=round(float(sh.get("LHB", 0)), 4),
                   main_batting_type=sh.index[0])
        if sh.iloc[0] < 0.99:
            flags.append("batting_type_not_99pct_one_value")
    else:
        row.update(rhb_share=np.nan, lhb_share=np.nan, main_batting_type="")
    if len(bw):
        ps = bw.pace_or_spin.value_counts(normalize=True)
        bt_ = bw.bowling_type.value_counts(normalize=True)
        row.update(pace_share=round(float(ps.get("Pace", 0)), 4), spin_share=round(float(ps.get("Spin", 0)), 4),
                   main_pace_or_spin=ps.index[0], bowling_type_shares=fmt_list(f"{k}:{v:.4f}" for k, v in bt_.items()),
                   main_bowling_type=bt_.index[0])
        if ps.iloc[0] < 0.99:
            flags.append("pace_or_spin_not_99pct_one_value")
        if bt_.iloc[0] < 0.99:
            flags.append("bowling_type_not_99pct_one_value")
    else:
        row.update(pace_share=np.nan, spin_share=np.nan, main_pace_or_spin="", bowling_type_shares="", main_bowling_type="")
    if len(names) > 1:
        flags.append("multiple_name_variants")
    if multi:
        flags.append("more_than_one_team_in_a_season:" + fmt_list(multi))
    if re.search(r"\d", x.pname):
        flags.append("name_has_digit_suffix")
    if x.toks and len(x.toks[0]) == 1 and len(x.toks) > 1:
        flags.append("name_starts_with_initial")
    if any(x.pid in (a.pid, c.pid) for a, c, _, _ in cand_pairs):
        flags.append("in_near_duplicate_name_list")
    row["flags"] = fmt_list(flags)
    pm_rows.append(row)
PM = pd.DataFrame(pm_rows).sort_values("player_id", key=lambda s: s.astype(int)).reset_index(drop=True)
PM.to_csv(WORK / "player_map.csv", index=False, lineterminator="\n")
# id-level flags into the id checks file
for x in PM.itertuples():
    for fl_ in [f for f in x.flags.split("|") if f and f.split(":")[0] in
                ("batting_type_not_99pct_one_value", "pace_or_spin_not_99pct_one_value", "bowling_type_not_99pct_one_value",
                 "more_than_one_team_in_a_season")]:
        idc("attribute inconsistency", "FLAG", "medium", x.player_id, x.canonical_name, detail=fl_)
n_bt = int(PM["flags"].str.contains("batting_type_not_99pct").sum())
n_ps = int(PM["flags"].str.contains("pace_or_spin_not_99pct").sum())
n_bty = int(PM["flags"].str.contains("bowling_type_not_99pct").sum())
n_mt = int(PM["flags"].str.contains("more_than_one_team_in_a_season").sum())
idc("batting_type not >= 99% one value for a striker", "PASS" if n_bt == 0 else "ISSUE", "info", detail=f"{n_bt} players")
idc("pace_or_spin not >= 99% one value for a bowler", "PASS" if n_ps == 0 else "ISSUE", "info", detail=f"{n_ps} players")
idc("bowling_type not >= 99% one value for a bowler", "PASS" if n_bty == 0 else "ISSUE", "info", detail=f"{n_bty} players")
idc("player with more than one team in a season", "INFO", "info", detail=f"{n_mt} players (mid-season moves are legitimate; listed as flags)")
IDDF = pd.DataFrame(ID, columns=["check", "status", "severity", "id_a", "name_a", "id_b", "name_b", "detail"])
IDDF.to_csv(TABLES / "step0_id_checks.csv", index=False, lineterminator="\n")

# ----------------------------------------------------------------------------------------------------------------
# 10. Team map data
# ----------------------------------------------------------------------------------------------------------------
main_b = b[~b.is_super_over]
tm_rows = []
for tid in sorted(IPL_TEAMS, key=int):
    tmatch = M[(M.batting_first_id == tid) | (M.batting_second_id == tid)]
    for s, gg in tmatch.groupby("season"):
        bats = main_b[(main_b.batting_team_id == tid) & (main_b.season == s) & main_b.ball_faced].groupby(["striker_id", "striker_name"]).size()
        bowl = main_b[(main_b.bowling_team_id == tid) & (main_b.season == s) & main_b.legal_ball].groupby(["bowler_id", "bowler_name"]).size()
        top_b = bats.reset_index(name="n").sort_values(["n", "striker_id"], ascending=[False, True]).head(5)
        top_w = bowl.reset_index(name="n").sort_values(["n", "bowler_id"], ascending=[False, True]).head(5)
        tm_rows.append(dict(team_id=tid, short_name=IPL_TEAMS[tid], seasons_all=fmt_list(sorted(tmatch.season.unique())),
                            matches_all=len(tmatch), season=s, matches_in_season=len(gg),
                            top5_batters_by_balls_faced=fmt_list(f"{x.striker_name} [{x.striker_id}] ({x.n})" for x in top_b.itertuples()),
                            top5_bowlers_by_legal_balls=fmt_list(f"{x.bowler_name} [{x.bowler_id}] ({x.n})" for x in top_w.itertuples())))
TM = pd.DataFrame(tm_rows)
TM.to_csv(WORK / "team_map_data.csv", index=False, lineterminator="\n")

# ----------------------------------------------------------------------------------------------------------------
# 11. Season leaders (data-validation check only)
# ----------------------------------------------------------------------------------------------------------------
LABEL = "DATA-VALIDATION CHECK ONLY: not a player ranking; Part 5 definitions, super overs excluded, playoffs included"
mb = b[~b.is_super_over]
SL = []


def leaders(df_, variant):
    for s, gg in df_.groupby("season"):
        sm, si = gg.match_id.nunique(), gg.groupby(["match_id", "innings"]).ngroups
        runs = gg.groupby(["striker_id", "striker_name"]).agg(value=("bat_runs", "sum"), balls_faced=("ball_faced", "sum"),
                                                              matches=("match_id", "nunique")).reset_index()
        runs = runs.sort_values(["value", "striker_id"], ascending=[False, True])
        runs["rank"] = runs.value.rank(method="min", ascending=False).astype(int)
        for x in runs[runs["rank"] <= 5].itertuples():
            SL.append(dict(record_type="run_scorer", season=s, variant=variant, rank=x.rank, player_id=x.striker_id, player_name=x.striker_name,
                           value=int(x.value), balls_faced=int(x.balls_faced), matches_batted=int(x.matches), legal_balls_bowled="", matches_bowled="",
                           season_matches=sm, season_innings=si))
        wk = gg[gg.is_bowler_wicket].groupby(["bowler_id", "bowler_name"]).size().reset_index(name="value")
        wk = wk.sort_values(["value", "bowler_id"], ascending=[False, True])
        wk["rank"] = wk.value.rank(method="min", ascending=False).astype(int)
        bl = gg.groupby("bowler_id").agg(lb=("legal_ball", "sum"), mb_=("match_id", "nunique"))
        for x in wk[wk["rank"] <= 5].itertuples():
            SL.append(dict(record_type="wicket_taker", season=s, variant=variant, rank=x.rank, player_id=x.bowler_id, player_name=x.bowler_name,
                           value=int(x.value), balls_faced="", matches_batted="", legal_balls_bowled=int(bl.loc[x.bowler_id, "lb"]),
                           matches_bowled=int(bl.loc[x.bowler_id, "mb_"]), season_matches=sm, season_innings=si))
        SL.append(dict(record_type="season_totals", season=s, variant=variant, rank="", player_id="", player_name="", value="",
                       balls_faced="", matches_batted="", legal_balls_bowled="", matches_bowled="", season_matches=sm, season_innings=si))


leaders(mb, "all_matches")
leaders(mb[(mb.season == 2025) & (mb.match_id != LEAGUE_VOID_MATCH)], "2025_excluding_match_40751")
SLD = pd.DataFrame(SL)
SLD["label"] = LABEL
SLD.to_csv(TABLES / "step0_season_leaders.csv", index=False, lineterminator="\n")

# ----------------------------------------------------------------------------------------------------------------
# 12. Notes: facts used below
# ----------------------------------------------------------------------------------------------------------------
n_und = int((M.result_category == "UNDETERMINED_FROM_DATA").sum())
n_red = int(M.suspected_reduced_overs_dls.sum())
n_nr = int(M.suspected_no_result_or_abandoned.sum())
n_elig = int(M.wp_eligible_provisional.sum())
one_inn = M[M.inns2_legal_balls == 0].match_id.tolist()
so_matches = M[M.super_over].match_id.tolist()
bw0 = int((b.bowl_speed == "0").sum())
n_oth = int((b.extras_type == "other").sum())
n_x2 = int((b.extras_2_runs > 0).sum())
n_obs = int(b.dismissal_type.isin(OBSTRUCT_VARIANTS).sum())
ret_n = [x for x in dis_rows if x[1].startswith("RETIRED")]
res_n = [x for x in dis_rows if x[1] == "RESOLVED"]
ipl_by_season = M.groupby("season").size().to_dict()
unres_txt = f"{n_lookalike} look-alike pairs listed: {n_dist} are shown distinct (they share a match), {n_unres} are spelling-like and never share a match (unresolved), the rest differ in given name"
l24 = lg_games.get(2024)
l25 = lg_games.get(2025)
off24 = {k: v for k, v in l24[1].items() if v != 14} if l24 else {}
off25 = {k: v for k, v in l25[1].items() if v != 14} if l25 else {}
m40751 = M[M.match_id == LEAGUE_VOID_MATCH].iloc[0] if (M.match_id == LEAGUE_VOID_MATCH).any() else None
gap_matches = sorted(long_gap.match_id.unique())

note("Non-IPL matches", f"{n_non_ipl_matches} matches, {n_non_ipl_rows} balls",
     "Excluded from every output; only the counts appear (step0_coverage.csv)",
     "Scope is IPL only (D3): a match is IPL when both teams are among the 10 franchise ids")
note("No season column in the raw file", f"all {n_ipl_rows} IPL balls",
     "season = calendar year of the first-ball date of the match (derived column, ball and match tables)",
     "The raw file has no season, league or stage column; IPL is played March to June, so the calendar year is unambiguous")
note("Timestamp label 'UTC' is wrong for 2022-23", f"{n_ipl_rows} IPL balls (delivery_ist_time)",
     "Raw text untouched. Clock claim tested on modal first-ball times: " + ("supported" if clock_claim_ok else "NOT supported") +
     ". Derived column ts_ist adds +5h30 for 2024 onward; match_date and first_ball_recorded use the raw clock",
     "2022-23 first balls sit at 15:30 / 19:30 (IST slots), 2024+ at 10:00 / 14:00 (the same slots in UTC). Every row carries the label 'UTC'")
note("Timestamp stepping backwards", f"{n_back} IPL balls (matches {fmt_list(sorted(back.match_id.unique()))})",
     "Kept as is. A forward jump immediately reversed by the next ball is treated as a wrong single timestamp, not a stoppage",
     "Only one ball's time is wrong; ball order comes from innings_ball_num, not the clock")
note("Long gaps between consecutive balls (>20 min)", f"{len(long_gap)} gaps in {len(gap_matches)} matches ({fmt_list(gap_matches)})",
     "Flagged as possible stoppages in matches_ipl.csv (long_gap_where) and step0_result_flags.csv. Not by itself a reason to drop a match",
     "Rain or other interruptions can change targets; only a short innings (below) is treated as evidence of reduced overs")
note("00:00:00 placeholder times", f"{ph} IPL balls", "None needed", "The placeholder matches listed in DATA_AUDIT.md are non-IPL")
note("bowl_speed 0 and -1", f"{bw0} IPL balls with 0 ({bw0 / len(b):.1%}); {int((b.bowl_speed == '-1').sum())} with -1 (match 14108)",
     "Column kept unchanged and not used", "0 means not recorded; -1 is an invalid value")
note("Empty values in stroke / delivery_style / over_or_around", f"{int(empties['stroke'])} / {int(empties['delivery_style'])} / {int(empties['over_or_around'])} IPL balls",
     "Left empty", "Not used by any later step; dismissal columns are empty by design on non-wicket balls")
note("extras_type 'other' undecoded", f"{n_oth} IPL balls",
     "Decoded as a re-bowled, no-ball-type delivery: is_noball = True, not legal, ball faced, extras1_runs (1) charged to the bowler with the bat runs; noball_kind = 'other_inferred'",
     "Complete overs hold exactly 6 legal balls only if 'other' is re-bowled; the batter scores on it (so not a wide); 1 extra run; only run-outs. The cricket label is inferred, not given. See step0_extras_decoding.csv")
note("extras_type 'Overstep'", f"{int((b.extras_type == 'Overstep').sum())} IPL balls",
     "Decoded as a no-ball: is_noball = True, noball_kind = 'Overstep'", "extras1_runs is always 1, bat runs in runs, re-bowled")
note("extras_2_runs undecoded", f"{n_x2} IPL balls",
     "Read as byes or leg-byes run off a no-ball-type delivery; included in total_runs, kept in column extras2_runs, not charged to the bowler, not split into bye / leg-bye",
     "Appears only on no-ball-type balls with no bat runs. Adding it makes every successful chase stop on the ball that reaches the target; leaving it out does not. Which of bye / leg-bye is not recorded")
note("Wide runs", f"{int(b.is_wide.sum())} IPL balls",
     "wide_runs = extras1_runs (1 to 5), all charged to the bowler; batter does not face the ball", "runs is 0 on every wide; wides are re-bowled")
note("Penalty runs", "0 IPL balls", "Rule coded, untested", "The only Penalty row in the raw file is a non-IPL match")
note("No-ball / wide / 'other' are re-bowled; over_ball_num is a delivery counter", f"{int((~b.legal_ball).sum())} IPL balls non-legal",
     "legal_ball = not wide and not no-ball; legal_balls_before counts legal balls only; innings_ball_num and over_ball_num count every delivery (max over_ball_num "
     f"{b.over_ball_num.max()})", "Overs have more than 6 rows when deliveries are re-bowled")
note("Overs with 5 legal balls", f"{len(short_overs)} overs: " + fmt_list(f"{x.match_id} inns {x.innings} over {x.overid}" for x in short_overs.itertuples()),
     "Kept; matches flagged in step0_result_flags.csv (OVER_WITH_5_LEGAL_BALLS)", "A complete over should have 6 legal balls: possible missing ball in the source, or a genuine short over; cannot be told from the data")
note("Dismissal spelling variants", f"{n_obs} IPL balls ('Obstracting the field' / 'Obstructing the field')",
     "Raw text kept; derived dismissal_kind merges the two spellings; neither is a bowler's wicket", "Same dismissal type spelled two ways")
note("dismissal_type and dismissed_player_id disagree", f"{len(dis_rows)} IPL rows (whole raw file: {disagree_all})",
     f"{len(res_n)} wicket row(s) with no dismissed id resolved from the crease (player_out_id, source recorded); {len(ret_n)} non-wicket rows with a dismissed id read as retired not out "
     "(is_retired = True, retired_player_id set, player_out_id empty, is_wicket unchanged)",
     "Details per row in step0_id_checks.csv. Resolutions are inferences from who never bats again; confirm externally")
note("Retire Out counts as a team wicket, not as a bowler wicket", f"{int((b.dismissal_type == 'Retire Out').sum())} IPL balls",
     "is_wicket stays true (wickets_before counts it); is_bowler_wicket False; is_retired True", "Part 5: retirements are not the bowler's")
note("bowling_type changes between balls for the same bowler", f"{n_bty} bowlers (bowling_type not >= 99% one value)",
     "Kept as recorded. pace_or_spin is >= 99% one value for every bowler, so use pace_or_spin, or main_bowling_type in player_map.csv, not per-ball bowling_type",
     "The pace sub-label (for example fast vs fast-medium) varies ball to ball for these bowlers; the pace/spin split is stable")
note("Player ids and names", f"{n_players} ids",
     "No id has several names and no name has several ids. No merges done. Look-alike names listed in step0_id_checks.csv; " + unres_txt,
     "One player, one id holds in the IPL subset; look-alikes are different ids and are never merged without evidence")
note("Super overs", f"{nso} balls in {len(so_matches)} matches ({fmt_list(so_matches)})",
     "Flagged (is_super_over, phase 'SuperOver'), excluded from main metrics, reported in step0_super_overs.csv", "Part 5")
note("Matches with one innings only", f"{len(one_inn)} matches ({fmt_list(one_inn)})",
     "Kept in the tables; result UNDETERMINED_FROM_DATA; wp_eligible_provisional False", "No second innings recorded: no-result, abandoned or incomplete record")
note("Result not derivable", f"{n_und} matches", "result_category = UNDETERMINED_FROM_DATA with reason; listed in step0_result_flags.csv",
     "Innings ended short with wickets in hand and the target not reached, one innings only, or a tie without a decisive super over. No winner is assigned")
note("Suspected reduced overs / DLS", f"{n_red} matches",
     "Flagged with evidence in matches_ipl.csv; wp_eligible_provisional False; ball table column reduced_overs_suspected",
     "An innings ended short of 120 legal balls with wickets in hand. The dataset carries no revised target, so these cannot enter the win-probability model (Part 6 Step 0)")
note("Suspected no-result / abandoned", f"{n_nr} matches", "Flagged; wp_eligible_provisional False",
     f"One innings only, or an innings ended before {MIN_OVERS_FOR_RESULT_BALLS} legal balls (5 overs; ASSUMPTION about the minimum overs for a DLS result)")
note("Playoffs derived, not given", f"{int(M.is_playoff.sum())} matches",
     "is_playoff / playoff_label from the last 4 matches per season by (date, first-ball time, match_id) labelled Qualifier 1, Eliminator, Qualifier 2, Final. "
     "Structural check (Q2 shares one team with each of Q1 and Eliminator; Final teams come from Q1 and Q2) passed in seasons: " + fmt_list(k for k, v in play_chk.items() if v) + "; failed in: " + (fmt_list(k for k, v in play_chk.items() if not v) or "none"),
     "No stage column; PROVISIONAL until external verification")
if l24:
    note("2024 league fixtures absent from the source", f"{l24[0]} league matches found (a full league has 70)",
         "Nothing added or imputed", f"Teams with other than 14 league games (team: games): {off24}; team pairs with no league meeting: {never_meet.get(2024)}. These fixtures are absent from the source file itself (DATA_AUDIT.md); "
         "they may be washed out without a ball, which needs external verification")
if l25:
    note("2025 replayed match", f"match {LEAGUE_VOID_MATCH}" + (f": {m40751.inns1_balls} balls, {int(m40751.inns2_balls)} in innings 2" if m40751 is not None else ""),
         "Kept as a one-innings match: UNDETERMINED_FROM_DATA, wp_eligible False; season leaders also shown excluding it",
         f"Abandoned after 63 balls and replayed in a full match with the same teams ({m40751.same_pair_other_matches_in_season if m40751 is not None else ''}); may be void in official records. "
         f"2025 teams with other than 14 league games (team: games, counting 40751): {off25}")
note("Impact Player era", f"{int(b.impact_player_era.sum())} IPL balls (season >= {IMPACT_PLAYER_FROM})", "Flag impact_player_era added", "Part 6 Step 0")
note("Season leaders are a data check only", "all seasons", "step0_season_leaders.csv written and labelled; not used as a ranking (D5)",
     "Compared externally by a colleague; no player ranking is produced in Step 0")
note("wp_eligible_provisional", f"{n_elig} of {len(M)} matches eligible", "Provisional flag in matches_ipl.csv with reason",
     "Normal derived result or a tie decided by super over, no suspected reduced overs or no-result; the supervisor finalises it after external verification")
note("Data reaches end of IPL 2026?", f"{n_2026} matches in 2026, last {mt[mt.season == 2026].date.max()}", "Reported at the top of the audit summary",
     "74 matches is the full 70 + 4 format; confirm the final externally")

NOTES_DF = pd.DataFrame(NOTES, columns=["Issue", "Rows affected", "Action taken", "Why"])
NOTES_DF.to_csv(TABLES / "step0_data_notes.csv", index=False, lineterminator="\n")

# ----------------------------------------------------------------------------------------------------------------
# 13. Coverage file, ball columns doc, section B, DATA_NOTES.md
# ----------------------------------------------------------------------------------------------------------------
cov("results", "result categories", "IPL matches", fmt_list(f"{k}: {v}" for k, v in sorted(cat_counts.items())), "")
cov("results", "suspected reduced overs / DLS", "IPL matches", n_red, "")
cov("results", "suspected no-result / abandoned", "IPL matches", n_nr, "")
cov("results", "wp_eligible_provisional true", "IPL matches", n_elig, "")
cov("results", "matches with super overs", "IPL", len(so_matches), fmt_list(so_matches))
cov("results", "players (ids) in IPL data", "IPL", n_players, "")
cov("results", "playoff structure check by season", "IPL", fmt_list(f"{k}:{v}" for k, v in play_chk.items()), "")
for s, (n_lg, cnts) in sorted(lg_games.items()):
    cov("results", "league matches (all but the last 4 of the season)", f"season {s}", n_lg, f"games per team: {cnts}")
COV = pd.DataFrame(COVERAGE, columns=["section", "metric", "scope", "value", "note"])
COV.to_csv(TABLES / "step0_coverage.csv", index=False, lineterminator="\n")
ex_df.to_csv(TABLES / "step0_extras_decoding.csv", index=False, lineterminator="\n")

RAW_DOC = {
    "row_id": "0-based position of the row in the raw file (line = row_id + 2). Added by load_raw()",
    "match_id": "Match identifier", "innings": "1, 2 = main innings; 3, 4 = super over",
    "overid": "Over number, 1 to 20 (1 in a super over)", "over_ball_num": "Delivery counter inside the over; counts wides and no-balls (max 11)",
    "innings_ball_num": "Delivery counter inside the innings; counts every delivery", "batting_team_id": "Team id batting", "bowling_team_id": "Team id bowling",
    "striker_id": "Batter facing the ball", "striker_name": "Name as in source", "non_striker_id": "Batter at the other end", "non_striker_name": "Name as in source",
    "bowler_id": "Bowler id", "bowler_name": "Name as in source", "batting_type": "RHB / LHB of the striker", "bowling_type": "Bowling style text",
    "batting_order": "Batting position of the striker", "runs": "Runs off the bat only (confirmed in section 4)", "is_four": "true when runs == 4 as a boundary",
    "is_six": "true when runs == 6 as a boundary", "is_wicket": "true exactly when dismissal_type is non-empty",
    "dismissal_type_id": "Numeric code of dismissal_type", "dismissal_type": "Dismissal text; two spellings of obstructing the field",
    "dismissed_player_id": "Player dismissed as recorded (5 non-wicket rows carry an id, 1 wicket row lacks one)",
    "extras_type": "None, wide, Overstep (no-ball), other (no-ball-type, inferred), legbyes, byes, Penalty",
    "extras1_runs": "All extras runs on the ball except extras_2_runs", "extras_2_runs": "Second extras amount: byes / leg-byes off a no-ball (inferred)",
    "pace_or_spin": "Pace or Spin of the bowler", "bowl_speed": "Speed; 0 = not recorded, -1 invalid; not used", "stroke": "Shot name as in source",
    "delivery_style": "Delivery description as in source", "over_or_around": "Over or Around the wicket", "on_or_off": "Off-side / On-side",
    "delivery_ist_time": "Recorded clock time with a 'UTC' label; actually IST for 2022-23 and UTC from 2024 (see coverage)"}
BC = [(c, "raw column", RAW_DOC.get(c, ""), "unchanged string from load_raw()") for c in RAW_COLS]
DER = {
    "season": ("Season of the match", "calendar year of the first-ball date of the match (no season column in raw)"),
    "match_date": ("Match date", "date part of the earliest delivery_ist_time in the match (recorded clock)"),
    "ts_ist": ("Delivery time on an IST clock", "delivery_ist_time as is for 2022-23; +5h30 from 2024 (clock claim, section 3)"),
    "is_super_over": ("Super-over ball", "innings in (3, 4)"),
    "phase": ("Phase of the innings", "overid 1-6 Powerplay, 7-15 Middle, 16-20 Death (config.phase_of); 'SuperOver' for innings 3-4"),
    "is_wide": ("Wide", "extras_type == 'wide'"),
    "is_noball": ("No-ball (or no-ball-type)", "extras_type in ('Overstep', 'other')"),
    "noball_kind": ("Source of the no-ball flag", "'Overstep', 'other_inferred' or empty"),
    "legal_ball": ("Legal delivery for the bowler", "not is_wide and not is_noball"),
    "ball_faced": ("Ball faced by the batter", "not is_wide (a no-ball counts)"),
    "bat_runs": ("Runs off the bat", "runs"),
    "wide_runs": ("Wide runs", "extras1_runs when is_wide"),
    "noball_runs": ("No-ball penalty runs", "extras1_runs when is_noball"),
    "bye_runs": ("Byes", "extras1_runs when extras_type == 'byes'"),
    "legbye_runs": ("Leg-byes", "extras1_runs when extras_type == 'legbyes'"),
    "penalty_runs": ("Penalty runs", "extras1_runs when extras_type == 'Penalty' (none in IPL)"),
    "extras2_runs": ("Second extras amount", "extras_2_runs; byes or leg-byes off a no-ball, split unknown"),
    "total_runs": ("All runs added to the team score on the ball", "runs + extras1_runs + extras_2_runs (chase test confirms)"),
    "bowler_runs_conceded": ("Runs charged to the bowler", "bat_runs + wide_runs + noball_runs (Part 5)"),
    "is_bowler_wicket": ("Wicket credited to the bowler", "dismissal_type in Bowled, Caught, LBW, Stump, Hit Wicket (Part 5)"),
    "dismissal_kind": ("Dismissal with spellings merged", "dismissal_type with 'Obstracting' changed to 'Obstructing the field'"),
    "player_out_id": ("Batter who was dismissed (resolved)", "dismissed_player_id on wicket rows; inferred when missing; empty on non-wicket rows"),
    "player_out_source": ("How player_out_id was set", "'raw' or the inference used"),
    "is_run_out": ("Run-out", "dismissal_type == 'RunOut'"),
    "is_retired": ("Batter retired on this ball", "dismissal_type == 'Retire Out', or a non-wicket row carrying a dismissed id (retired not out)"),
    "retired_player_id": ("Batter who retired", "player id of the retiring batter, else empty"),
    "team_runs_before": ("Team score before the ball", "sum of total_runs on earlier balls of the innings"),
    "wickets_before": ("Wickets down before the ball", "count of is_wicket true on earlier balls of the innings (includes run-outs and Retire Out)"),
    "legal_balls_before": ("Legal balls bowled before this ball", "count of legal_ball on earlier balls of the innings"),
    "target": ("Target for the chasing side", "innings 1 total_runs + 1, innings 2 balls only (not revised for DLS)"),
    "runs_needed_before": ("Runs still needed before the ball", "target - team_runs_before, innings 2 only"),
    "legal_balls_left_before": ("Legal balls left before the ball", "120 - legal_balls_before, innings 2 only; wrong when overs were reduced (see reduced_overs_suspected)"),
    "reduced_overs_suspected": ("Match flagged for suspected reduced overs / DLS", "match-level flag from matches_ipl.csv"),
    "impact_player_era": ("Impact Player era", f"season >= {IMPACT_PLAYER_FROM}"),
    "is_playoff_match": ("Playoff match (provisional)", "last 4 matches of the season by date order"),
}
for c in DERIVED:
    BC.append((c, "derived", DER[c][0], DER[c][1]))
pd.DataFrame(BC, columns=["column", "kind", "meaning", "rule"]).to_csv(TABLES / "step0_ball_columns.csv", index=False, lineterminator="\n")
assert list(pq.columns) == RAW_COLS + DERIVED

# section B proposal
cnt_et = b.extras_type.value_counts()
secB = f"""## B. How the dataset encodes these (confirmed by Step 0; proposed replacement)

Every line was tested by `src/step0_audit.py` on the {n_ipl_rows:,} IPL balls ({n_ipl_matches} matches). The evidence is in `outputs/tables/step0_extras_decoding.csv`.
Columns marked *(inferred)* are decisions drawn from the structure of the data, not from a data dictionary.

| Concept | Column(s) and rule |
|---|---|
| One row | One delivery, wides and no-balls included. Unique key: `match_id`, `innings`, `innings_ball_num` (no duplicates; numbering 1..N in every innings) |
| IPL match | Both teams are among the 10 franchise ids: 1 CSK, 2 MI, 3 RR, 4 PBKS, 5 RCB, 7 DC, 8 KKR, 242 SRH, 3508 GT, 3509 LSG. {n_ipl_matches} of {n_all_matches} matches. No match mixes IPL and non-IPL ids. The rest are excluded from all metrics (D3) |
| Season | No season column. Season = calendar year of the first-ball date (`delivery_ist_time`). IPL runs March to June |
| Clock | `delivery_ist_time` is labelled UTC on every row. 2022-23 values are IST, 2024 onward UTC (add 5h30 for IST). `ts_ist` in the ball table does this |
| Super over | `innings` 3 or 4 ({len(so_matches)} IPL matches: {fmt_list(so_matches)}). Left out of the main metrics and reported separately. Innings 1 and 2 hold {n12:,} balls, super overs {nso} |
| Phase | From `overid`: 1-6 Powerplay, 7-15 Middle, 16-20 Death; super-over balls get phase `SuperOver` |
| Over and ball counters | `over_ball_num` and `innings_ball_num` count **every delivery**, including wides and no-balls (an over can have up to {b.over_ball_num.max()} rows). Use `legal_ball` to count legal balls. An innings has at most 120 legal balls |
| Wide | `extras_type == 'wide'` ({int(cnt_et.get('wide', 0))} balls). Not a legal ball, not a ball faced. `runs` is 0; all wide runs (1 to 5) are in `extras1_runs`; charged to the bowler |
| No-ball | `extras_type == 'Overstep'` ({int(cnt_et.get('Overstep', 0))} balls) is a no-ball: `extras1_runs` is always 1, bat runs are in `runs`. Not legal; a ball faced; the bowler is charged bat runs + 1 |
| `other` | `extras_type == 'other'` ({int(cnt_et.get('other', 0))} balls) *(inferred)*: behaves exactly like a no-ball (re-bowled, `extras1_runs` is always 1, the batter scores off it, only run-outs fall). Treated as a no-ball (`noball_kind = 'other_inferred'`). Its real cricket meaning is not in the data |
| Leg-byes, byes | `extras_type in ('legbyes', 'byes')`: legal ball, ball faced, `runs` is 0, the amount is in `extras1_runs` (1, 2 or 4). Added to the team score, not charged to the bowler |
| Penalty | `extras_type == 'Penalty'`: none in IPL data. Rule coded: `extras1_runs` to the team score, not to the bowler |
| `extras_2_runs` | Non-zero on {n_x2} IPL balls, only on no-ball-type balls with `runs == 0` *(inferred)*: byes or leg-byes run off a no-ball. Added to the team score (confirmed: with it, all successful chases end exactly on the ball that reaches the target), not charged to the bowler. Bye vs leg-bye is not recorded, so it is kept as `extras2_runs` |
| Batter runs | `runs` (off the bat only; boundaries are never recorded on byes, leg-byes or wides) |
| Balls faced | every delivery except wides (`ball_faced`) |
| Legal balls | not a wide and not a no-ball (`legal_ball`) |
| Team score on a ball | `total_runs = runs + extras1_runs + extras_2_runs` |
| Runs conceded (bowler) | `bowler_runs_conceded = runs + wide runs + no-ball runs` (byes, leg-byes, penalty and `extras_2_runs` excluded) |
| Wicket | `is_wicket` is true exactly when `dismissal_type` is non-empty (every row) |
| Bowler's wickets | `dismissal_type` in Bowled, Caught (includes caught and bowled), LBW, Stump, Hit Wicket (`is_bowler_wicket`). Not the bowler's: RunOut, Retire Out, Obstructing the field (spelled 'Obstracting' on {int((b.dismissal_type == 'Obstracting the field').sum())} ball(s)) |
| Player dismissed | `player_out_id` (ball table). `dismissed_player_id` is always the striker or non-striker where present. Of the {len(dis_rows)} IPL rows that disagree with `dismissal_type`: {len(res_n)} wicket row(s) lacked the id and were resolved from who never bats again; {len(ret_n)} non-wicket rows carry an id and are retired-not-out (`is_retired`, `retired_player_id`; `is_wicket` false, no dismissal) |
| Team wickets | `is_wicket` true, so run-outs, Retire Out and obstructing the field count; retired-not-out does not |
| Batting hand, pace/spin, bowling type | `batting_type`, `pace_or_spin`, `bowling_type` are on every ball. Per-player consistency: batting_type not >= 99% one value for {n_bt} players, pace_or_spin for {n_ps}, bowling_type for {n_bty} (`player_map.csv`) |
| Bowling speed | `bowl_speed` is **not used**: 0 means missing on {bw0 / len(b):.1%} of IPL balls, one row has -1 |
| Target and balls left | Innings 2: `target = innings 1 total + 1`, balls left = 120 minus legal balls. Not valid for the {n_red} matches flagged for suspected reduced overs / DLS |
| Playoffs | No stage column. Provisional: the last 4 matches of each season by (date, first-ball time, match_id) = Qualifier 1, Eliminator, Qualifier 2, Final |
"""
(WORK / "step0_definitions_section_B.md").write_text(secB, encoding="utf-8")


def md_escape(s):
    return str(s).replace("|", "\\|").replace("\n", " ")


md = ["| Issue | Rows affected | Action taken | Why |", "|---|---|---|---|"]
for row in NOTES:
    md.append("| " + " | ".join(md_escape(x) for x in row) + " |")
block = ("<!-- STEP0_DATA_NOTES_BEGIN (generated by src/step0_audit.py; rewritten on every run) -->\n\n"
         + "\n".join(md) + "\n\n<!-- STEP0_DATA_NOTES_END -->")
dn_path = LOGS / "DATA_NOTES.md"
txt = dn_path.read_text(encoding="utf-8")
PLACEHOLDER = "*(Written by the Data Auditor in Step 0.)*"
if PLACEHOLDER in txt:
    txt = txt.replace(PLACEHOLDER, block)
elif "<!-- STEP0_DATA_NOTES_BEGIN" in txt:
    a_ = txt.index("<!-- STEP0_DATA_NOTES_BEGIN")
    e_ = txt.index("<!-- STEP0_DATA_NOTES_END -->") + len("<!-- STEP0_DATA_NOTES_END -->")
    txt = txt[:a_] + block + txt[e_:]
else:
    raise RuntimeError("DATA_NOTES.md has neither the placeholder line nor the generated block")
dn_path.write_text(txt, encoding="utf-8")

# ----------------------------------------------------------------------------------------------------------------
# console summary
# ----------------------------------------------------------------------------------------------------------------
print(f"IPL matches {n_ipl_matches} / all {n_all_matches}; IPL balls {n_ipl_rows} / all {n_all_rows}; last IPL date {last_ipl_date}")
print("matches per season:", ipl_by_season)
print("result categories:", cat_counts)
print("reduced/DLS suspected:", n_red, "| no-result suspected:", n_nr, "| wp eligible:", n_elig)
print("super over matches:", so_matches, "| players:", n_players, "| ID check rows:", len(IDDF))
print("reconciliation OK:", reconciled, "| clock claim:", clock_claim_ok)
print("done")
