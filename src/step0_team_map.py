"""Team id map (Step 0 deliverable; critic Step 0 finding #1).

data/work/team_map.csv: one franchise per id, with the name, how it was established, and the status.
The raw file carries team ids only. Names come from each id's regular players (scripts/teams.py) and are
consistent with every reported match result (data/work/facts/results_verification.csv) and the Step 0 critic's
independent player-based cross-check. External verification was blocked (D23), so status = INFERRED.
No franchise renamed or relocated between 2022 and 2026, so one id = one franchise.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pandas as pd
from config import WORK, IPL_TEAMS

FULL = {"CSK": "Chennai Super Kings", "MI": "Mumbai Indians", "RR": "Rajasthan Royals", "PBKS": "Punjab Kings",
        "RCB": "Royal Challengers Bengaluru", "DC": "Delhi Capitals", "KKR": "Kolkata Knight Riders",
        "SRH": "Sunrisers Hyderabad", "GT": "Gujarat Titans", "LSG": "Lucknow Super Giants"}
ev = pd.read_csv(WORK / "team_map_data.csv", dtype=str)
rows = []
for tid, short in IPL_TEAMS.items():
    e = ev[ev.iloc[:, 0] == tid]
    rows.append(dict(team_id=tid, short_name=short, franchise=FULL[short], seasons="2022-2026" if short not in ("GT", "LSG") else "2022-2026 (joined 2022)",
                     method="regular players per id (scripts/teams.py); consistent with reported results; critic cross-check",
                     status="INFERRED (external verification blocked, D23)", evidence_rows=len(e)))
pd.DataFrame(rows).to_csv(WORK / "team_map.csv", index=False)
print(pd.DataFrame(rows)[["team_id", "short_name", "franchise", "status"]].to_string(index=False))
