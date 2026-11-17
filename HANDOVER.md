# RR Clutch Index: handover

> **What it is:** a historical pressure-performance indicator for IPL 2023–26, used to shortlist IPL 2027 auction targets for Rajasthan Royals.
> **What it is not:** a forecast. Its ability to predict 2027 is not established (D15).

## Open these first
1. `outputs/deliverables/RR_Clutch_Index_Dashboard.html` (1.16 MB). Works offline in any modern browser. Start on the Summary tab.
2. `outputs/deliverables/C_RR_Clutch_Index_Cheat_Sheet.pdf`: one page with the picks and their uncertainty.
3. `outputs/deliverables/B_RR_Clutch_Index_Deck.pdf`: 7 slides.
4. `outputs/deliverables/D_Methodology_and_Limitations.pdf` and `D_Data_Dictionary.md`: the method, proof and limits.
5. `outputs/deliverables/E_RR_Clutch_Index_Notebook.ipynb`: re-runs everything from the raw file.
6. `outputs/deliverables/F_Walkthrough_Video_Script.md`: a 60–90 s script.

## Headline results (from `outputs/tables`)
- **Coverage:** 367 IPL matches and 87,687 balls. Scored seasons 2023–2026; 2022 used only to train. Last match 2026-05-31.
- **Players scored:** 110 (47 batters and 71 bowlers, 8 of them all-rounders rated both ways). 147 players in scope are listed as Not Scorable on IPL Data.
- **Must-Back, if available at the auction:** Ashutosh Sharma, Patrick Cummins.
- **Plan A**, with an assumed Rs 15 cr purse, 5 slots and 1 overseas: Patrick Cummins, Abdul Samad, Ashutosh Sharma, Sameer Rizvi. Cost Rs 13.8 cr at mid-band prices, Rs 21.0 cr at walk-away prices.
- **Backtest** (top 10 still above average next season):
  - batters 42.9% v naive 46.7% v random pick 50.8%;
  - bowlers 72.8% v naive 75.0% v random pick 59.5%.
  - Verdict: *historical indicator; persistence not demonstrated* (batters); *historical indicator; persistence not demonstrated* (bowlers).

## Reproduce
- `pip install -r requirements.txt`, then `python3 -I src/run_all.py`. The whole pipeline runs from `data/raw` in about 3 minutes, with seed 2027.
- Then `python3 -I src/step7_build_dashboard.py`, `python3 -I src/step7_docs.py`, `python3 -I src/step7_video_script.py`, `python3 -I src/step7_notebook.py`, `python3 -I src/step8_audit.py` and `python3 -I src/step8_handover.py`.
- Dashboard tests: `node src/tests/test_dashboard.js`.

## Where things are
- `data/raw/`: the dataset as given (checksum-verified, read-only).
- `data/work/`: Step 0–2 working tables.
- `outputs/tables/`: the single source of every number.
- `outputs/deliverables/`: deliverables A–F.
- `outputs/reviews/`: critic and cold-reader findings.
- `logs/`: DEFINITIONS, DATA_NOTES, FACTS, DECISIONS (D1–D35), PREREGISTRATION (frozen), REVIEWS, CHECKPOINTS, PROGRESS.
- `docs/master_prompt/`: the brief, verbatim. `docs/FRAMEWORK_REVIEW.md`: the approved plan.

## Before 16 Dec 2026 (named risks)
- **No external fact could be verified:** the network policy blocked every cricket and news site. Recheck availability, purse, squads, prices and ages against the official lists (fact checks F2 and F3).
- **Venues are UNKNOWN for all matches,** so there is no venue adjustment.
- **Rankings within the top group are too close to call.** Use the shortlist with its ranges, not the decimals.

## Step 8 audit

| Check | Status | Remaining risk |
|---|---|---|
| Small-sample traps | Pass | No top-10 pair is separated by 80% ranges (90 of 90 pairs overlap): order within the top group is not meaningful |
| Survivorship bias (retired or unsold players) | Partial | Auction-pool players with no IPL record can't be scored or listed (pool unpublished/unreadable) |
| Season / era bias | Pass | Earlier-only benchmarks trail scoring jumps (mean RAE/ball offsets by season reported) |
| Double counting in the pressure index | Pass | Boosts change little: main vs leverage-only Spearman on balls is very high |
| Leakage in the backtest | Pass | Some design choices (D26 features, D27 reference weight) were made after seeing test-season diagnostics; disclosed |
| Cherry-picked stats | Pass | Implementation corrections after the freeze (D30, D31) are logged with pre/post numbers |
| Totals that don't match the raw data | Pass | Official totals themselves are REPORTED (search summary), not VERIFIED |
| Player name typos / mismatched IDs | Pass | Team names inferred from players (external check blocked) |
| Misleading chart axes | Pass | Diverging gap bars (negative/positive) are centred on 0 by design |
| Colour-blind readability | Pass | Pink and blue are close in luminance under deuteranopia, so patterns and labels carry the distinction |
| Every external fact tagged VERIFIED or [ASSUMPTION] | Pass | Nothing could be VERIFIED (network policy, D23): every fact is REPORTED, UNKNOWN or [ASSUMPTION] |
| The same number everywhere (dashboard, PDF, cheat sheet, notebook = outputs/tables) | Partial | Free-text sentences in deliverables are templates; they were rebuilt after the last data change |
| Every shortlisted player is actually available at the auction | Open (named risk) | Retention lists and the auction pool could not be read (network policy). Must recheck (F2) before 16 Dec 2026 |
| Every selector-facing page passes the cold-reader test | Pending | nan |
| The dashboard works offline at 380px with no console errors | Pass | Tested in Chromium only |
