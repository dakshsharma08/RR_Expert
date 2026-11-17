"""Step 8: handover note (HANDOVER.md) with every number pulled from outputs/tables. Run last."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pandas as pd
from config import TABLES, DELIVERABLES, ROOT

s = json.loads((TABLES / "summary_numbers.json").read_text())["summary"]
bt = s["backtest"]
audit = pd.read_csv(TABLES / "step8_audit.csv") if (TABLES / "step8_audit.csv").exists() else pd.DataFrame()
short = pd.read_csv(TABLES / "step5_shortlist.csv")
pm = pd.read_csv(TABLES / "step5_plans_meta.csv")
size = lambda f: f"{(DELIVERABLES / f).stat().st_size / 1e6:.2f} MB" if (DELIVERABLES / f).exists() else "missing"
pa = pm[pm.plan == "A"].iloc[0]
URL_FILE = TABLES / "dashboard_url.txt"
URL = (URL_FILE.read_text().strip().splitlines() or [""])[0].strip() if URL_FILE.exists() else ""
lines = [
    "# RR Clutch Index: handover",
    "",
    "> **What it is:** a historical pressure-performance indicator for IPL 2023–26, used to shortlist IPL 2027 auction targets for Rajasthan Royals.",
    "> **What it is not:** a forecast. Its ability to predict 2027 is not established (D15).",
    "",
    "## Open these first",
    f"1. `outputs/deliverables/RR_Clutch_Index_Dashboard.html` ({size('RR_Clutch_Index_Dashboard.html')}). Works offline in any modern browser. Start on the Summary tab."
    + (f" Online copy: {URL} (private until the owner shares it from the page's Share menu)." if URL else ""),
    f"2. `outputs/deliverables/C_RR_Clutch_Index_Cheat_Sheet.pdf`: one page with the picks and their uncertainty.",
    f"3. `outputs/deliverables/B_RR_Clutch_Index_Deck.pdf`: 7 slides. `RR_Clutch_Index_Submission.pdf` is the deck plus the cheat sheet in one 8-page file, for forms that take one upload.",
    "4. `outputs/deliverables/D_Methodology_and_Limitations.pdf` and `D_Data_Dictionary.md`: the method, proof and limits.",
    "5. `outputs/deliverables/E_RR_Clutch_Index_Notebook.ipynb`: re-runs everything from the raw file.",
    "6. `outputs/deliverables/F_Walkthrough_Video_Script.md`: a 60–90 s script.",
    "",
    "## Headline results (from `outputs/tables`)",
    f"- **Coverage:** {s['ipl_matches']} IPL matches and {s['ipl_balls']:,} balls. Scored seasons {s['seasons_scored']}; 2022 used only to train. Last match {s['last_match']}.",
    f"- **Players scored:** {s['scorable_bat'] + s['scorable_bowl'] - s['scorable_ar']} ({s['scorable_bat']} batters and {s['scorable_bowl']} bowlers, {s['scorable_ar']} of them all-rounders rated both ways). {s['not_scorable']} players in scope are listed as Not Scorable on IPL Data.",
    f"- **Must-Back, if available at the auction:** {', '.join(s['must_back'])}.",
    f"- **Plan A**, with an assumed Rs {pa.purse_cr:g} cr purse, {int(pa.slots_assumed)} slots and {int(pa.overseas_slots_assumed)} overseas: {', '.join(s['planA'])}. Cost Rs {pa.cost_mid_cr:.1f} cr at mid-band prices, Rs {pa.cost_walkaway_cr:.1f} cr at walk-away prices.",
    f"- **Backtest** (top 10 still above average next season):",
    f"  - batters {bt['bat_score']}% v naive {bt['bat_naive']}% v random pick {bt['bat_base']}%;",
    f"  - bowlers {bt['bowl_score']}% v naive {bt['bowl_naive']}% v random pick {bt['bowl_base']}%.",
    f"  - Verdict: *{bt['bat_claim']}* (batters); *{bt['bowl_claim']}* (bowlers).",
    "",
    "## Reproduce",
    "- `pip install -r requirements.txt`, then `python3 -I src/run_all.py`. The whole pipeline runs from `data/raw` in about 3 minutes, with seed 2027.",
    "- Deliverables and audit, in order: `python3 -I src/build_final.py` (notebook → dashboard + tests → docs → video script → audit → handover).",
    "- Dashboard tests: `node src/tests/test_dashboard.js`.",
    "",
    "## Where things are",
    "- `data/raw/`: the dataset as given (checksum-verified, read-only).",
    "- `data/work/`: Step 0–2 working tables.",
    "- `outputs/tables/`: the single source of every number.",
    "- `outputs/deliverables/`: deliverables A–F.",
    "- `outputs/reviews/`: critic and cold-reader findings.",
    "- `logs/`: DEFINITIONS, DATA_NOTES, FACTS, DECISIONS (D1–D37), PREREGISTRATION (frozen), REVIEWS, CHECKPOINTS, PROGRESS.",
    "- `docs/master_prompt/`: the brief, verbatim. `docs/FRAMEWORK_REVIEW.md`: the approved plan.",
    "",
    "## Before 16 Dec 2026 (named risks)",
    "- **No external fact could be verified:** the network policy blocked every cricket and news site. Recheck availability, purse, squads, prices and ages against the official lists (fact checks F2 and F3).",
    "- **Venues are UNKNOWN for all matches,** so there is no venue adjustment.",
    "- **Rankings within the top group are too close to call.** Use the shortlist with its ranges, not the decimals.",
]
if len(audit):
    lines += ["", "## Step 8 audit", "", "| Check | Status | Remaining risk |", "|---|---|---|"]
    lines += [f"| {r.check} | {r.status} | {r.remaining_risk} |" for r in audit.itertuples()]
(ROOT / "HANDOVER.md").write_text("\n".join(lines) + "\n")
print("\n".join(lines[:22]))
