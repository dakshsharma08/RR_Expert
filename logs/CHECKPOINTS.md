# CHECKPOINTS (Golden Rule 4 content; recorded without waiting for GO under D22)

## Checkpoint 0: Data audit (2026-11-17), recorded under D22

- **Did:**
  - The Data Auditor built the ball and match tables, player and team maps, and Data Notes.
  - The gate re-ran it: outputs are identical.
  - I recomputed key numbers independently.
  - Facts check F1 was done (web reading blocked).
  - All venues are UNKNOWN (D23).
- **Numbers:**
  - 367 IPL matches, 87,687 balls; the last IPL match is 2026-05-31, so the data reaches the end of IPL 2026.
  - 353 matches are eligible for win probability. The 14 excluded are no-result, DLS or reduced-overs.
  - 2 super-over matches (14 balls). 382 players.
- **Verified:**
  - All 10 season leaders (top run-scorer and wicket-taker, 2022–26) match the reported official totals exactly (for example Buttler 863, Kohli 741, Sooryavanshi 776, Rabada 29).
  - Innings totals: 0 mismatches. Legal balls: 83,755 by both methods.
  - 13,331 of 13,334 complete overs have 6 legal balls.
- **Surprising:**
  - "other" extras behave as no-balls.
  - Over 14 is missing a ball in 2 matches from 2022.
  - 2024 has 3 league fixtures absent from the source.
  - Every external fact is unverifiable here: all REPORTED or UNKNOWN.
- **Critic:** running.

## Checkpoint 1: Pressure Index (2026-11-17)

- **Did:**
  - Logistic win-probability models, one per season, trained on earlier seasons only.
  - The 2022 reference used expanding windows: 52 of 74 matches scored, the first 22 left unscored (D18).
  - Leverage-based Pressure Index with 5 small boosts, WPA, and 3 alternative definitions.
- **Numbers:**
  - Brier score (coin flip = 0.25): 2023 0.217, 2024 0.167, 2025 0.169, 2026 0.183.
  - First innings 0.205–0.248, second innings 0.121–0.185.
  - The more complex model (gradient boosting) was worse in every fold, so it was not adopted (D19).
  - High-pressure share: 22.7% / 14.3% / 22.2% / 19.8%.
- **Surprising:**
  - First-innings win probability has little skill beyond the base rate in 2023 and 2026.
  - Very early first-innings balls score Medium (around 75).
  - The rule-based definition overlaps only 30% with the main index, because rules count situations rather than how much a ball can swing the result.
- **Verified:**
  - WPA adds up exactly: zero mismatches between a ball's win probability after and the next ball's before.
  - Leverage rises toward the death overs in a chase (0.013 → 0.047 a ball).
  - The boosts' correlation with leverage is between −0.07 and +0.08 on the 2022 reference, so all were kept.
- **Changes:** D26, D27.
- **Examples:** `outputs/tables/step1c_example_balls.csv` (8 real balls, Low to High).
- **Critic 1:** launched.

## Checkpoint 2: Fair comparison (2026-11-17)

- **Did:** expected runs (batters) and runs conceded and wickets (bowlers) per ball, from earlier matches only. The adjustments are situation cell, batting position, phase-specific season level (D28) and opposition strength. There is no venue adjustment (D23).
- **Numbers:** mean RAE per ball faced: 2023 +0.019, 2024 +0.040, 2025 +0.004, 2026 +0.017. Benchmarks trail scoring inflation and fluctuations within a season.
- **Surprising:** 2024 mid-season scoring outlier, with +0.149 runs a ball in matches 31–45.
- **Verified:** coverage is 0 missing values for 2023–26 balls. The opposition factor averages 1.000 in every season.

## Gate P: Pre-registration frozen (2026-11-17)

- Frozen before any player metric was computed; sha256 recorded in D29.
- Scorable players: 45 batters (≥ 100 High balls faced), 71 bowlers (≥ 60 High legal balls), 8 all-rounders. 257 players in scope.

## Checkpoint 3: Metrics (2026-11-17)

- **Did:** High- and Low-pressure descriptive metrics for every player in scope: strike rate, average, balls per dismissal, boundary %, dot %, RAE/RSE per 100, WPA per 100, and the pace/spin, left/right, death and chasing/setting splits.
  - Tables: `step3_batting_metrics.csv`, `step3_bowling_metrics.csv`, `step3_scope.csv`.
- **Not scorable on IPL data (sample):** 149 of 257 players in scope.

## Checkpoint 4: Clutch Reliability Score (2026-11-17)

- **Did:** score exactly as pre-registered, with match-bootstrap 80% intervals, sensitivity, robustness and a backtest.
- **Numbers:** effective weights are S 2/3 and C 1/3 (D30). WPA and pressure drop showed no detectable between-player differences.
- **Sensitivity:** ±10% on any weight keeps 100% of the top 10.
- **Robustness (top-20 overlap, batters / bowlers):**
  - leverage-only: 70% / 70%
  - with close-game boost: 85% / 100%
  - season-centred: 100% / 100%
  - rule-based: 25% / 50% — below 60%, because rules flag situations rather than how much a ball can swing the result
  - strict D18 buckets: 35% / 45% — fewer High balls make different players scorable (20 batters, 50 bowlers)
- **Backtest (pooled 2024–26, hit rate of the top 10 still above average next season):**
  - batters: score 57.1% v naive strike rate 50.0%; difference interval −11.5 to +10.0 → **persistence not demonstrated**
  - bowlers: score 64.7% v naive economy 84.2%; interval −25.0 to −3.3 → **naive economy predicts better**
  - Rank correlation with next-season outcome: batters −0.02 (naive −0.16), bowlers 0.11 (naive 0.36).
- **Framing (D15):** a historical pressure-performance indicator. Its ability to predict 2027 is not established. For bowlers, overall economy is a better forward signal and is shown next to the score.
- **Surprising:** the backtest samples are tiny (3–8 assessable players per fold top 10), so every hit rate is very noisy.
- **Critic 2:** launched.

## Checkpoint 4 (REVISED after Critics 1–2; supersedes the earlier Checkpoint 4 numbers)

- **Did:**
  - Fixed WPA so byes and leg-byes follow G5, and fixed the chase-pressure boost.
  - Corrected the shrinkage: Kish effective n, and the right pressure-drop variance.
  - Made the backtest robust to ties, and added a base rate.
  - Tested and rejected the first-innings model change (D32).
- **Effective weights:**
  - batters: S 0.40 / I 0.25 / H 0.15 / C 0.20 (all components informative);
  - bowlers: S 0.53 / H 0.20 / C 0.27 (WPA per ball has no detectable player signal).
- **Backtest (pooled 2024–26, top 10 still above average next season):**
  - batters: score 42.9% v naive 46.7% v random pick 50.8%; difference interval -17.1 to +3.8;
  - bowlers: 72.8% v 75.0% v 59.5%; interval -14.6 to +4.4.
  - Pre-registered verdict for both: "historical indicator; persistence not demonstrated".
- **Too close to call:** 0 of 45 top-10 pairs are separated by their 80% ranges, for batters and for bowlers. The data identifies the top group, not the order within it.
- **Robustness (top-20 overlap, batters / bowlers):**
  - leverage-only: 70% / 80%
  - with close-game boost: 85% / 95%
  - season-centred: 100% / 100%
  - strict D18 buckets: 40% / 65%
  - rule-based: 20% / 40% (below 60%: rules flag situations, not how much a ball can swing the result)
- **Weight sensitivity (top-10 overlap):** ±10% keeps 90–100%; skill-only 80%; consistency-only 40% / 60%; equal weights 90%.
- **Changes since the earlier Checkpoint 4:** the top 10 overlaps 8/10 (batters) and 7/10 (bowlers) with the pre-correction version (kept as `*_v1_preD31.csv`).

## Checkpoint 5: Auction lens (2026-11-17)

- **Did:**
  - Measured RR's gaps: the RR 2026 group against the league under High pressure, by phase.
  - Built the conditional shortlist, optimiser Plans A/B, a sample XI, contrarian picks, the unsung hero, the avoid list and the not-scorable list.
- **Gaps:** middle-overs batting and death-overs batting under pressure. RR's bowling is above league in every phase.
- **Shortlist:** Must-Back Ashutosh Sharma, Matheesha Pathirana, Patrick Cummins. Plan A (assumed Rs 15 cr purse, 6 slots): Vyshak Kumar, Xavier Bartlett, Mohsin Khan, Abdul Samad, Ashutosh Sharma, Sameer Rizvi.
- **Caveats:**
  - Every external fact is UNKNOWN or REPORTED. Assumptions A1–A11 are tagged (availability, purse, price bands, nationality inferred from the data, keeper).
  - The shortlist is conditional on the official auction list (recheck F2).
- **Critic 3:** pending (to run on the Step 5 tables alongside the dashboard review).

## Checkpoint 7: Deliverables (2026-11-17)

- **A dashboard:** one offline HTML file; Node/Chromium test suite passes (no console errors, no network, no sideways scroll at 380px, filters, card numbers).
- **B deck** (7 slides), **C cheat sheet** (1 page), **D method note and data dictionary** (10 pages), **E notebook** (re-runs the whole pipeline from raw in about 145 s), **F video script.**
- Every deliverable is generated by code from `outputs/tables`.
- **Reviews:**
  - Critic 3 and the final critic: fixes applied (D35, D36, REVIEWS).
  - Cold reader, 2 rounds: round 2 understood 4 of 15 pages within 2 minutes. The rest are "partly", mainly because tall phone screenshots can't be read at test scale.

## Checkpoint 8: Final audit (2026-11-17)

- **Audit status:** {'Pass': 12, 'Partial': 2, 'Open (named risk)': 1}.
- **Open, named risk:** availability of shortlisted players can't be verified (network blocked).
- **Partial:** survivorship (pool players with no IPL record) and the cold reader.
- **Final picks:**
  - Must-Back: Ashutosh Sharma, Patrick Cummins.
  - Plan A: Patrick Cummins, Ashutosh Sharma, Sameer Rizvi. Rs 13.0 cr even at walk-away prices, within the assumed Rs 15 cr.
