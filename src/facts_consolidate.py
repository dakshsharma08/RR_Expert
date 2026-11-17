"""Consolidate the Facts Researcher outputs (data/work/facts/*) into logs/FACTS.md (supervisor-owned).

Re-runnable: it regenerates the ledger table from the evidence files and never edits the evidence.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pandas as pd
from config import FACTS_WORK, LOGS

HEADER = (LOGS / "FACTS.md").read_text().split("| ID | Fact |")[0]
rows = []
led = pd.read_csv(FACTS_WORK / "facts_f1_ledger.csv").fillna("")
for r in led.itertuples():
    rows.append(f"| {r.id} | {r.fact} | {str(r.value).replace('|','/')} | {r.status} | {r.source1_publisher} {r.source1_url} | "
                f"{r.source2_publisher} {r.source2_url} | {r.source1_published} | {r.verified_on} | F1 | {str(r.notes).replace('|','/')[:300]} |")
v = pd.concat([pd.read_csv(FACTS_WORK / f) for f in ["venues_2022_2024.csv", "venues_2025_2026.csv"]])
vc = v.status.value_counts().to_dict()
rows.append(f"| F1-V | Venue of each IPL match (367) | {vc} | UNKNOWN (all) | — | — | — | 2026-11-17 | F1 | Source hosts blocked by network policy (D23); see data/work/facts/venues_*_log.md |")
sl = pd.read_csv(FACTS_WORK / "season_leaders_official.csv").fillna("")
for i, r in enumerate(sl.itertuples(), 1):
    rows.append(f"| F1-L{i:02d} | Official {r.cap} {r.season} | {r.player}: {str(r.value).replace('|','/')} | {str(r.status).split(';')[0]} | {str(r.source)[:120]} | | | 2026-11-17 | F1 | sanity check only |")
table = "| ID | Fact | Value | Status | Source 1 | Source 2 | Published | Verified on | Check | Notes |\n|---|---|---|---|---|---|---|---|---|---|\n" + "\n".join(rows)
note = ("\n\n**F1 summary (2026-11-17).** WebFetch could not read any official, cricket or news host, because the network policy blocks them (D23). "
        "So **no fact is VERIFIED**. Every external fact is `REPORTED (search summary only)` or `UNKNOWN`, with a recheck due. "
        "Where an auction fact is needed downstream (purse, RR squad, availability, prices), it is used as an explicit **[ASSUMPTION]**, with its reason, in Step 5.\n")
(LOGS / "FACTS.md").write_text(HEADER + table + note)
print(len(rows), "ledger rows written")
