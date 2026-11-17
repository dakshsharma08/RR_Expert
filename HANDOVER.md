# RR Clutch Index: handover

> **The question (SupeRR Selector Season 2, Round 1, organisers' clarification of 17 Nov):** who are the top 10 batters and the top 10 bowlers who perform best under pressure, and how do we define and measure that? Not an auction recommendation (D38).
> **What the score is:** a historical pressure-performance indicator for IPL 2023–26. **What it is not:** a forecast (D15).

## Open these first
1. `outputs/deliverables/RR_Clutch_Index_Dashboard.html` (1.18 MB). Works offline in any modern browser. Start on the Summary tab.
2. `outputs/deliverables/C_RR_Clutch_Index_Cheat_Sheet.pdf`: one page with both top-10 lists, their 80% ranges and the definition of pressure.
3. `outputs/deliverables/B_RR_Clutch_Index_Deck.pdf`: 7 slides. `RR_Clutch_Index_Submission.pdf` is the deck plus the cheat sheet in one 8-page file, for forms that take one upload.
4. `outputs/deliverables/D_Methodology_and_Limitations.pdf` and `D_Data_Dictionary.md`: the method, proof and limits.
5. `outputs/deliverables/E_RR_Clutch_Index_Notebook.ipynb`: re-runs everything from the raw file.
6. `outputs/deliverables/F_Walkthrough_Video_Script.md`: a 60–90 s script.

## Headline results (from `outputs/tables`)
- **Coverage:** 367 IPL matches 2022–2026 (87,687 balls); 2022 used only to train; 293 matches rated (2023–2026, 67,880 balls). Last match 2026-05-31. Match list cross-checked against the organisers' official match file (`step0_official_meta_check.csv`).
- **Players scored:** 110 (47 batters and 71 bowlers, 8 of them all-rounders rated both ways). 147 players in scope are listed as Not Scorable on IPL Data.
- **Top 10 batters under pressure:** 1. Vaibhav Sooryavanshi 99.3 (92–100); 2. Ashutosh Sharma 98.7 (66–100); 3. Shreyas Iyer 96.1 (73–100); 4. Heinrich Klaasen 94.3 (69–99); 5. Virat Kohli 88.1 (58–98); 6. Prabhsimran Singh 87.9 (45–98); 7. Marcus Stoinis 85.9 (37–99); 8. Sameer Rizvi 80.0 (45–95); 9. Abdul Samad 79.6 (38–96); 10. Venkatesh Iyer 79.6 (31–96).
- **Top 10 bowlers under pressure:** 1. Kuldeep Yadav 99.6 (96–100); 2. Jasprit Bumrah 98.7 (69–100); 3. Matheesha Pathirana 98.4 (84–100); 4. Patrick Cummins 96.5 (60–100); 5. Ravindra Jadeja 95.6 (56–99); 6. Krunal Pandya 93.9 (76–100); 7. Sunil Narine 93.7 (49–99); 8. Vyshak Kumar 91.5 (36–99); 9. Mohsin Khan 89.7 (39–100); 10. Lungi Ngidi 87.3 (67–96).
- **How sure:** 0 of 45 top-10 pairs are separated by their 80% ranges in either list, and #11 (Jos Buttler, Jofra Archer) overlaps #10: each list is a group, not a strict order. Rating every qualifying player instead of only those active in 2025–26 leaves both lists unchanged (`step4_scope_sensitivity.csv`).
- **Backtest** (top 10 still above average next season):
  - batters 42.9% v naive 46.7% v random pick 50.8%;
  - bowlers 72.8% v naive 75.0% v random pick 59.5%.
  - Verdict: *historical indicator; persistence not demonstrated* (batters); *historical indicator; persistence not demonstrated* (bowlers).

## Reproduce
- `pip install -r requirements.txt`, then `python3 -I src/run_all.py`. The whole pipeline runs from `data/raw` in about 3 minutes, with seed 2027.
- Deliverables and audit, in order: `python3 -I src/build_final.py` (notebook → dashboard + tests → docs → video script → audit → handover).
- Dashboard tests: `node src/tests/test_dashboard.js`.

## Where things are
- `data/raw/`: the dataset as given (checksum-verified, read-only).
- `data/work/`: Step 0–2 working tables.
- `outputs/tables/`: the single source of every number.
- `outputs/deliverables/`: deliverables A–F.
- `outputs/tables/step5_*`: the earlier auction lens, kept for the record; **not used in the Round 1 deliverables** (D38).
- `outputs/reviews/`: critic and cold-reader findings.
- `logs/`: DEFINITIONS, DATA_NOTES, FACTS, DECISIONS (D1–D38), PREREGISTRATION (frozen), REVIEWS, CHECKPOINTS, PROGRESS.
- `docs/master_prompt/`: the brief, verbatim. `docs/FRAMEWORK_REVIEW.md`: the approved plan.

## Named risks
- **Order within each top 10 is not meaningful:** read each list as a group of ten, with its 80% ranges.
- **No venue adjustment:** venue names could not be looked up (network policy); the organisers' venue ids arrived after the method was frozen.
- **IPL only:** T20I and A-team matches in the dataset are deliberately left out (same opposition level and conditions for everyone).

## Step 8 audit

| Check | Status | Remaining risk |
|---|---|---|
| Small-sample traps | Pass | No top-10 pair is separated by 80% ranges (90 of 90 pairs overlap): order within the top group is not meaningful |
| Survivorship bias (retired or inactive players) | Pass | Players outside IPL (no IPL record) cannot be rated: IPL-only by design (D38) |
| Season / era bias | Pass | Earlier-only benchmarks trail scoring jumps (mean RAE/ball offsets by season reported) |
| Double counting in the pressure index | Pass | Boosts change little: main vs leverage-only Spearman on balls is very high |
| Leakage in the backtest | Pass | Some design choices (D26 features, D27 reference weight) were made after seeing test-season diagnostics; disclosed |
| Cherry-picked stats | Pass | Implementation corrections after the freeze (D30, D31) are logged with pre/post numbers |
| Totals that don't match the raw data | Pass | Official totals themselves are REPORTED (search summary), not VERIFIED |
| Player name typos / mismatched IDs | Pass | Team names inferred from players (external check blocked) |
| Misleading chart axes | Pass | Diverging gap bars (negative/positive) are centred on 0 by design |
| Colour-blind readability | Pass | Pink and blue are close in luminance under deuteranopia, so patterns and labels carry the distinction |
| Match list agrees with the organisers' official match file | Pass | Our reduced-overs flag is wider than the official one (13 v 5): those matches are left out of win probability, which is conservative |
| The same number everywhere (dashboard, PDF, cheat sheet, notebook = outputs/tables) | Pass | Free-text sentences in deliverables are templates; they were rebuilt after the last data change |
| Answers the Round 1 brief (top 10 batters and bowlers under pressure, no player-selection advice) | Pass | #11 is too close to call with #10 in both lists (80% ranges overlap), so the edge of each top 10 is soft |
| Every selector-facing page passes the cold-reader test | Partial | Remaining confusions listed in outputs/reviews/cold_reader.csv |
| The dashboard works offline at 380px with no console errors | Pass | Tested in Chromium only |
