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
