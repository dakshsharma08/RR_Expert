"""Step 0 (supervisor prep): preliminary IPL match keys for the venue and results fact-checks.

Output: data/work/ipl_match_keys.csv. One row per IPL match: match_id, season, the date of the
first recorded ball, the order within the season, and which team batted first and second
(team names inferred from scripts/teams.py; the Facts Researcher verifies them).

The authoritative match table comes from the Data Auditor (src/step0_audit.py), and the two are
reconciled at the Step 0 gate. Dates come straight from `delivery_ist_time`. Every IPL match's
first ball is recorded between 10:00 and 20:31 on its clock (the timezone label is inconsistent; see
DATA_AUDIT.md), so the recorded date is the local (IST) match date.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import IPL_TEAMS, WORK
from io_raw import load_raw

d = load_raw()
d = d[d.innings.isin(["1", "2"])]
rows = []
for mid, g in d.groupby("match_id", sort=False):
    teams = set(g.batting_team_id) | set(g.bowling_team_id)
    if not teams <= set(IPL_TEAMS):
        continue
    first = g.delivery_ist_time.min()
    i1 = g[g.innings == "1"]; i2 = g[g.innings == "2"]
    bat1 = i1.batting_team_id.iloc[0] if len(i1) else (set(teams) - set(i2.batting_team_id)).pop()
    bat2 = (teams - {bat1}).pop()
    rows.append(dict(match_id=int(mid), season=int(first[:4]), match_date=first[:10],
                     first_ball_recorded=first[11:19], batting_first_id=bat1, batting_first=IPL_TEAMS[bat1],
                     batting_second_id=bat2, batting_second=IPL_TEAMS[bat2],
                     inns1_balls=len(i1), inns2_balls=len(i2)))
import pandas as pd
k = pd.DataFrame(rows).sort_values(["season", "match_date", "first_ball_recorded", "match_id"])
k.insert(2, "order_in_season", k.groupby("season").cumcount() + 1)
WORK.mkdir(parents=True, exist_ok=True)
k.to_csv(WORK / "ipl_match_keys.csv", index=False)
print(len(k), "IPL matches;", k.groupby("season").size().to_dict())
print("duplicate (season, date, team pair):",
      k.assign(pair=k[["batting_first", "batting_second"]].apply(lambda r: tuple(sorted(r)), axis=1))
       .duplicated(["match_date", "pair"]).sum())
print("first-ball clock range:", k.first_ball_recorded.min(), "-", k.first_ball_recorded.max())
