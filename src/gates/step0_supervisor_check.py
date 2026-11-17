"""Supervisor gate for Step 0: independent recomputation straight from the raw file.

Deliberately shares no code with src/step0_audit.py. It encodes the supervisor's own reading of
the extras columns, so that it can be compared with the Data Auditor's decoding.
Run: python3 -I src/gates/step0_supervisor_check.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import pandas as pd
from config import IPL_TEAMS
from io_raw import load_raw

d = load_raw()
ipl_ids = set(IPL_TEAMS)
m_teams = d.groupby("match_id").apply(lambda g: set(g.batting_team_id) | set(g.bowling_team_id), include_groups=False)
ipl_matches = {m for m, t in m_teams.items() if t <= ipl_ids}
x = d[d.match_id.isin(ipl_matches)].copy()
x["season"] = x.delivery_ist_time.str[:4].astype(int)
for c in ["runs", "extras1_runs", "extras_2_runs", "overid", "innings_ball_num", "innings"]:
    x[c] = x[c].astype(int)
out = {}
out["ipl_matches"] = len(ipl_matches)
out["ipl_balls"] = len(x)
out["ipl_balls_by_season"] = x.groupby("season").size().to_dict()
main = x[x.innings.isin([1, 2])]
out["super_over_balls"] = int((~x.innings.isin([1, 2])).sum())

# Supervisor hypothesis: wides and 'Overstep' are not legal deliveries; everything else is.
illegal = main.extras_type.isin(["wide", "Overstep", "other"])
last_over = main.groupby(["match_id", "innings"]).overid.transform("max")
legal_per_over = main[~illegal & (main.overid != last_over)].groupby(["match_id", "innings", "overid"]).size()
out["overs_total"] = int(len(legal_per_over))
out["overs_with_6_legal"] = int((legal_per_over == 6).sum())
out["overs_with_>6_legal"] = int((legal_per_over > 6).sum())
# how does each extras type sit within overs that have >6 'legal' balls?
over_key = main.set_index(["match_id", "innings", "overid"]).index
bad_overs = set(legal_per_over[legal_per_over > 6].index)
out["extras_types_in_overs_with_>6"] = main[[k in bad_overs for k in over_key]].extras_type.value_counts().to_dict()
out["other_rows_ipl"] = int((main.extras_type == "other").sum())
out["other_runs_extras"] = main[main.extras_type == "other"][["runs", "extras1_runs", "extras_2_runs"]].value_counts().head(8).to_dict()

def season_bat_runs(name, season):
    g = main[(main.striker_name == name) & (main.season == season)]
    return int(g.runs.sum()), g.match_id.nunique()

BOWLER_WKTS = {"Bowled", "Caught", "LBW", "Stump", "Hit Wicket"}
def season_wkts(name, season):
    g = main[(main.bowler_name == name) & (main.season == season)]
    return int(g.dismissal_type.isin(BOWLER_WKTS).sum()), g.match_id.nunique()

out["Jos Buttler 2022 runs, matches"] = season_bat_runs("Jos Buttler", 2022)
out["Shubman Gill 2023 runs, matches"] = season_bat_runs("Shubman Gill", 2023)
out["Yuzvendra Chahal 2022 wkts, matches"] = season_wkts("Yuzvendra Chahal", 2022)
out["Mohammed Shami 2023 wkts, matches"] = season_wkts("Mohammed Shami", 2023)

# innings total for the first IPL match in the file
first = main[main.match_id == min(ipl_matches, key=int)]
out["first_match_innings_totals"] = (first.groupby("innings")[["runs", "extras1_runs", "extras_2_runs"]].sum().sum(axis=1)).to_dict()
for k, v in out.items():
    print(f"{k}: {v}")

# ---- compare with the Data Auditor's outputs
import pandas as pd
bt = pd.read_parquet(Path(__file__).resolve().parents[2] / "data/work/balls_ipl.parquet")
mt = pd.read_csv(Path(__file__).resolve().parents[2] / "data/work/matches_ipl.csv")
sl = pd.read_csv(Path(__file__).resolve().parents[2] / "outputs/tables/step0_season_leaders.csv")
print("auditor ball table rows:", len(bt), "== supervisor:", len(bt) == out["ipl_balls"])
print("auditor legal balls total:", int(bt.legal_ball.sum()), "| supervisor legal (wide/Overstep/other illegal):",
      int((~x.extras_type.isin(["wide", "Overstep", "other"])).sum()))
tot = main.assign(t=main.runs + main.extras1_runs + main.extras_2_runs).groupby(["match_id", "innings"]).t.sum()
mt2 = mt.set_index("match_id")
mism = sum(int(tot.get((str(m), 1), -1)) != int(r.inns1_runs) for m, r in mt2.iterrows())
print("innings-1 totals mismatching auditor:", mism)
print(sl.head(3).to_string())
