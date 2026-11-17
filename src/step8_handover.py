"""Step 8: handover note (HANDOVER.md) with every number pulled from outputs/tables. Run last."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pandas as pd
from config import TABLES, DELIVERABLES, ROOT

_j = json.loads((TABLES / "summary_numbers.json").read_text())
s, t10 = _j["summary"], _j["top10"]
bt = s["backtest"]
audit = pd.read_csv(TABLES / "step8_audit.csv") if (TABLES / "step8_audit.csv").exists() else pd.DataFrame()
size = lambda f: f"{(DELIVERABLES / f).stat().st_size / 1e6:.2f} MB" if (DELIVERABLES / f).exists() else "missing"
URL_FILE = TABLES / "dashboard_url.txt"
URL = (URL_FILE.read_text().strip().splitlines() or [""])[0].strip() if URL_FILE.exists() else ""
lines = [
    "# RR Clutch Index: handover",
    "",
    "> **The question (SupeRR Selector Season 2, Round 1, organisers' clarification of 17 Nov):** who are the top 10 batters and the top 10 bowlers who perform best under pressure, and how do we define and measure that? Not an auction recommendation (D38).",
    "> **What the score is:** a historical pressure-performance indicator for IPL 2023–26. **What it is not:** a forecast (D15).",
    "",
    "## Open these first",
    f"1. `outputs/deliverables/RR_Clutch_Index_Dashboard.html` ({size('RR_Clutch_Index_Dashboard.html')}). Works offline in any modern browser. Start on the Summary tab."
    + (f" Online copy: {URL} (private until the owner shares it from the page's Share menu)." if URL else ""),
    f"2. `outputs/deliverables/C_RR_Clutch_Index_Cheat_Sheet.pdf`: one page with both top-10 lists, their 80% ranges and the definition of pressure.",
    f"3. `outputs/deliverables/B_RR_Clutch_Index_Deck.pdf`: 7 slides. `RR_Clutch_Index_Submission.pdf` is the deck plus the cheat sheet in one 8-page file, for forms that take one upload.",
    "4. `outputs/deliverables/D_Methodology_and_Limitations.pdf` and `D_Data_Dictionary.md`: the method, proof and limits.",
    "5. `outputs/deliverables/E_RR_Clutch_Index_Notebook.ipynb`: re-runs everything from the raw file.",
    "6. `outputs/deliverables/F_Walkthrough_Video_Script.md`: a 60–90 s script.",
    "",
    "## Headline results (from `outputs/tables`)",
    f"- **Coverage:** {s['ipl_matches']} IPL matches {s['ipl_matches_span']} ({s['ipl_balls']:,} balls); 2022 used only to train; {s['scored_matches']} matches rated ({s['seasons_scored']}, {s['scored_balls']:,} balls). Last match {s['last_match']}. Match list cross-checked against the organisers' official match file (`step0_official_meta_check.csv`).",
    f"- **Players scored:** {s['scorable_bat'] + s['scorable_bowl'] - s['scorable_ar']} ({s['scorable_bat']} batters and {s['scorable_bowl']} bowlers, {s['scorable_ar']} of them all-rounders rated both ways). {s['not_scorable']} players in scope are listed as Not Scorable on IPL Data.",
    "- **Top 10 batters under pressure:** " + "; ".join(f"{x['rank']}. {x['name']} {x['score']:.1f} ({x['lo']:.0f}–{x['hi']:.0f})" for x in t10["bat"]) + ".",
    "- **Top 10 bowlers under pressure:** " + "; ".join(f"{x['rank']}. {x['name']} {x['score']:.1f} ({x['lo']:.0f}–{x['hi']:.0f})" for x in t10["bowl"]) + ".",
    f"- **How sure:** 0 of {t10['pairs']['bat']['total']} top-10 pairs are separated by their 80% ranges in either list, and #11 ({t10['edge']['bat']['next_name']}, {t10['edge']['bowl']['next_name']}) overlaps #10: each list is a group, not a strict order. Rating every qualifying player instead of only those active in 2025–26 leaves both lists unchanged (`step4_scope_sensitivity.csv`).",
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
    "- `outputs/tables/step5_*`: the earlier auction lens, kept for the record; **not used in the Round 1 deliverables** (D38).",
    "- `outputs/reviews/`: critic and cold-reader findings.",
    "- `logs/`: DEFINITIONS, DATA_NOTES, FACTS, DECISIONS (D1–D38), PREREGISTRATION (frozen), REVIEWS, CHECKPOINTS, PROGRESS.",
    "- `docs/master_prompt/`: the brief, verbatim. `docs/FRAMEWORK_REVIEW.md`: the approved plan.",
    "",
    "## Named risks",
    "- **Order within each top 10 is not meaningful:** read each list as a group of ten, with its 80% ranges.",
    "- **No venue adjustment:** venue names could not be looked up (network policy); the organisers' venue ids arrived after the method was frozen.",
    "- **IPL only:** T20I and A-team matches in the dataset are deliberately left out (same opposition level and conditions for everyone).",
]
if len(audit):
    lines += ["", "## Step 8 audit", "", "| Check | Status | Remaining risk |", "|---|---|---|"]
    lines += [f"| {r.check} | {r.status} | {r.remaining_risk} |" for r in audit.itertuples()]
(ROOT / "HANDOVER.md").write_text("\n".join(lines) + "\n")
print("\n".join(lines[:22]))
