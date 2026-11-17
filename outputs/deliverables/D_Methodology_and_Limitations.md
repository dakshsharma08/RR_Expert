# RR Clutch Index: Methodology and Limitations

Brief: SupeRR Selector Season 2, Round 1: identify the top 10 batters and top 10 bowlers who perform best under pressure, and show the method. Data: 367 IPL matches (2022–2026), 87,687 balls, to 2026-05-31. Rated: 293 matches and 67,880 balls in 2023–2026; 2022 is used only to train the win-chance model. Build 2026-11-17, seed 2027. Raw data sha256 01e2b4379edfbab6a6e456d304cb3c70f554cb312ef93d9588f3f32a82cb396e.

> **Read this first.** Historical record of pressure performance, not a forecast. Tested one season ahead, the Clutch Score did not clearly beat simple strike-rate or economy rankings (for batters it did not beat a random pick either). Top 10 above average next season: batters 42.9% v 46.7% simple ranking v 50.8% random pick; bowlers 72.8% v 75.0% v 59.5% (score minus simple ranking: batters −3.8 pts, 80% interval −17.1 to +3.8; bowlers −2.2 pts, −14.6 to +4.4; historical indicator; persistence not demonstrated).

## 1. The answer

Ranked by Clutch Score (0–100 within role). The 80% ranges of top-10 players overlap, so read each list as a group of ten, not a strict order. Team is the player's 2026 team. Rated if the player faced at least 100 High-pressure balls (batters) or bowled at least 60 legal High-pressure balls (bowlers) in IPL 2023–26.

### Top 10 batters

| # | Player | Team | Role | Clutch Score (80% range) | High balls | SR | Runs above exp. /100 | Seasons above | Why |
| ---: | :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| 1 | Vaibhav Sooryavanshi | RR | Top-order batter | 99.3 (91.8–99.9) | 111 | 255.0 | +96.5 | 2 of 2 | 111 High-pressure balls faced (2023–26): 283 runs at strike rate 255, +96 runs per 100 balls above an average batter in the same situations; above expected in 2 of 2 assessed seasons. |
| 2 | Ashutosh Sharma | DC | Finisher | 98.7 (66.2–99.9) | 119 | 199.2 | +44.3 | 2 of 2 | 119 High-pressure balls faced (2023–26): 237 runs at strike rate 199, +44 runs per 100 balls above an average batter in the same situations; above expected in 2 of 2 assessed seasons. |
| 3 | Shreyas Iyer | PBKS | Middle-order batter | 96.1 (73.1–99.7) | 203 | 172.9 | +24.6 | 2 of 2 | 203 High-pressure balls faced (2023–26): 351 runs at strike rate 173, +25 runs per 100 balls above an average batter in the same situations; above expected in 2 of 2 assessed seasons. |
| 4 | Heinrich Klaasen | SRH | Middle-order batter | 94.3 (69.2–99.3) | 205 | 187.8 | +37.0 | 3 of 3 | 205 High-pressure balls faced (2023–26): 385 runs at strike rate 188, +37 runs per 100 balls above an average batter in the same situations; above expected in 3 of 3 assessed seasons. |
| 5 | Virat Kohli | RCB | Top-order batter | 88.1 (57.9–98.2) | 255 | 165.9 | +19.6 | 3 of 4 | 255 High-pressure balls faced (2023–26): 423 runs at strike rate 166, +20 runs per 100 balls above an average batter in the same situations; above expected in 3 of 4 assessed seasons. |
| 6 | Prabhsimran Singh | PBKS | Top-order batter | 87.9 (44.7–98.0) | 276 | 173.6 | +22.9 | 4 of 4 | 276 High-pressure balls faced (2023–26): 479 runs at strike rate 174, +23 runs per 100 balls above an average batter in the same situations; above expected in 4 of 4 assessed seasons. |
| 7 | Marcus Stoinis | PBKS | All-rounder | 85.9 (37.0–99.3) | 135 | 193.3 | +38.2 | 2 of 2 | 135 High-pressure balls faced (2023–26): 261 runs at strike rate 193, +38 runs per 100 balls above an average batter in the same situations; above expected in 2 of 2 assessed seasons. |
| 8 | Sameer Rizvi | DC | Middle-order batter | 80.0 (44.9–94.9) | 101 | 163.4 | +19.2 | 1 of 1 | 101 High-pressure balls faced (2023–26): 165 runs at strike rate 163, +19 runs per 100 balls above an average batter in the same situations; above expected in 1 of 1 assessed seasons. |
| 9 | Abdul Samad | LSG | Finisher | 79.6 (37.5–96.1) | 112 | 178.6 | +19.6 | 1 of 1 | 112 High-pressure balls faced (2023–26): 200 runs at strike rate 179, +20 runs per 100 balls above an average batter in the same situations; above expected in 1 of 1 assessed seasons. |
| 10 | Venkatesh Iyer | RCB | Top-order batter | 79.6 (31.0–96.2) | 106 | 182.1 | +20.6 | 1 of 1 | 106 High-pressure balls faced (2023–26): 193 runs at strike rate 182, +21 runs per 100 balls above an average batter in the same situations; above expected in 1 of 1 assessed seasons. |

### Top 10 bowlers

| # | Player | Team | Role | Clutch Score (80% range) | High balls | Econ | Runs saved /100 | Seasons above | Why |
| ---: | :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| 1 | Kuldeep Yadav | DC | Spin bowler | 99.6 (95.5–99.9) | 226 | 7.38 | +30.8 | 3 of 3 | 226 High-pressure balls bowled (2023–26): 16 wickets at economy 7.38, +31 runs per 100 balls saved against an average bowler in the same situations; above expected in 3 of 3 assessed seasons. |
| 2 | Jasprit Bumrah | MI | Pace bowler | 98.7 (69.4–99.9) | 209 | 7.15 | +38.4 | 3 of 3 | 209 High-pressure balls bowled (2023–26): 10 wickets at economy 7.15, +38 runs per 100 balls saved against an average bowler in the same situations; above expected in 3 of 3 assessed seasons. |
| 3 | Matheesha Pathirana | KKR | Pace bowler, death specialist | 98.4 (83.8–99.9) | 180 | 8.53 | +30.6 | 2 of 2 | 180 High-pressure balls bowled (2023–26): 16 wickets at economy 8.53, +31 runs per 100 balls saved against an average bowler in the same situations; above expected in 2 of 2 assessed seasons. |
| 4 | Patrick Cummins | SRH | Pace bowler | 96.5 (60.5–99.6) | 123 | 7.56 | +27.6 | 2 of 2 | 123 High-pressure balls bowled (2023–26): 6 wickets at economy 7.56, +28 runs per 100 balls saved against an average bowler in the same situations; above expected in 2 of 2 assessed seasons. |
| 5 | Ravindra Jadeja | RR | All-rounder | 95.6 (55.6–99.5) | 198 | 7.52 | +18.5 | 4 of 4 | 198 High-pressure balls bowled (2023–26): 10 wickets at economy 7.52, +18 runs per 100 balls saved against an average bowler in the same situations; above expected in 4 of 4 assessed seasons. |
| 6 | Krunal Pandya | RCB | All-rounder | 93.9 (76.3–99.8) | 170 | 7.41 | +20.8 | 1 of 2 | 170 High-pressure balls bowled (2023–26): 14 wickets at economy 7.41, +21 runs per 100 balls saved against an average bowler in the same situations; above expected in 1 of 2 assessed seasons. |
| 7 | Sunil Narine | KKR | Spin bowler | 93.7 (49.1–99.4) | 191 | 7.66 | +18.4 | 3 of 4 | 191 High-pressure balls bowled (2023–26): 16 wickets at economy 7.66, +18 runs per 100 balls saved against an average bowler in the same situations; above expected in 3 of 4 assessed seasons. |
| 8 | Vyshak Kumar | PBKS | Pace bowler | 91.5 (36.3–99.0) | 88 | 9.89 | +9.9 | 1 of 1 | 88 High-pressure balls bowled (2023–26): 4 wickets at economy 9.89, +10 runs per 100 balls saved against an average bowler in the same situations; above expected in 1 of 1 assessed seasons. |
| 9 | Mohsin Khan | LSG | Pace bowler | 89.7 (38.7–99.7) | 113 | 8.23 | +21.4 | 1 of 2 | 113 High-pressure balls bowled (2023–26): 4 wickets at economy 8.23, +21 runs per 100 balls saved against an average bowler in the same situations; above expected in 1 of 2 assessed seasons. |
| 10 | Lungi Ngidi | DC | Pace bowler, death specialist | 87.3 (67.5–95.9) | 63 | 7.33 | +31.8 | 1 of 1 | 63 High-pressure balls bowled (2023–26): 6 wickets at economy 7.33, +32 runs per 100 balls saved against an average bowler in the same situations; above expected in 1 of 1 assessed seasons. |

Next in line: Jos Buttler among batters (79.2, 80% range 35.7–92.8) and Jofra Archer among bowlers (85.5, 66.9–98.2). Both overlap the 10th-ranked player, so the data cannot separate them. Top-10 pairs separated by their 80% ranges: batters 0 of 45; bowlers 0 of 45 (`step4_too_close_to_call.csv`).

## 2. How we define pressure

The Clutch Reliability Score (Clutch Score, 0 to 100, roughly a percentile within a role) is a **historical pressure-performance indicator**: it describes how a player did when a ball could swing the match. It is not a forecast (D15). The method has six steps.

1. Data: 367 IPL matches 2022–26 ball by ball, checked against the organisers' match list; 2022 used only to train, 293 matches (2023–26) rated.
2. Win probability: simple logistic model per season, trained only on earlier seasons.
3. Pressure Index: how much each ball can swing the result (leverage), plus small context boosts, ranked 0–100 against earlier balls only.
4. Fair comparison: runs above (batters) or saved (bowlers) versus an average player in the same situation, from earlier matches only.
5. Reliability: small samples pulled toward average (shrinkage), recent seasons weighted more, 80% ranges by resampling matches.
6. Clutch score 0–100: frozen weights, percentile-like scale within role; backtested against a naive ranking.

A simple logistic win-chance model, one per season, is trained only on earlier seasons and scored out of sample (D4, D13, D26). **Leverage** is the expected size of the win-probability swing on a ball. The Pressure Index is leverage with small context boosts, ranked 0 to 100 against earlier balls only (D18, D27). High is 80 or more (about the top 20%), Medium 50 to 80, Low below 50. Formula: `Pressure = leverage × (1 + 0.1·chase pressure + 0.1·below par + 0.1·death + 0.1·playoff + 0.1·collapse), ranked 0–100 against earlier balls only`.

| Boost | Correlation with leverage (2022 reference) | Initial weight | Final weight | Action |
| :--- | ---: | ---: | ---: | :--- |
| chase_pressure | +0.08 | 0.1 | 0.1 | kept |
| below_par | −0.01 | 0.1 | 0.1 | kept |
| death | +0.02 | 0.1 | 0.1 | kept |
| playoff | +0.06 | 0.1 | 0.1 | kept |
| collapse | −0.07 | 0.1 | 0.1 | kept |

| Season | High (main, D27) | Medium | Low | High (strict D18, comparison) | Balls |
| :--- | ---: | ---: | ---: | ---: | ---: |
| 2023 | 22.8% | 30.6% | 46.6% | 17.6% | 17,307 |
| 2024 | 14.3% | 29.7% | 56.0% | 4.8% | 16,902 |
| 2025 | 22.4% | 31.7% | 45.9% | 8.6% | 16,555 |
| 2026 | 19.9% | 28.7% | 51.4% | 15.7% | 17,116 |

### Win-chance forecast quality

Brier score: lower is better; a coin flip scores 0.25. Calibration by probability bin is in `outputs/tables/step1a_calibration.csv`.

| Season | Innings | Trained on | Train matches | Test matches | Brier | Brier 80% range | Log loss |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: |
| 2023 | All | 2022-2022 | 67 | 71 | 0.217 | 0.189–0.249 | 0.645 |
| 2023 | 1st | 2022-2022 | 67 | 71 | 0.248 | 0.221–0.276 | 0.701 |
| 2023 | 2nd | 2022-2022 | 67 | 71 | 0.185 | 0.150–0.224 | 0.585 |
| 2024 | All | 2022-2023 | 138 | 70 | 0.166 | 0.150–0.186 | 0.496 |
| 2024 | 1st | 2022-2023 | 138 | 70 | 0.205 | 0.186–0.224 | 0.595 |
| 2024 | 2nd | 2022-2023 | 138 | 70 | 0.125 | 0.100–0.150 | 0.389 |
| 2025 | All | 2022-2024 | 208 | 69 | 0.169 | 0.149–0.188 | 0.515 |
| 2025 | 1st | 2022-2024 | 208 | 69 | 0.205 | 0.185–0.225 | 0.604 |
| 2025 | 2nd | 2022-2024 | 208 | 69 | 0.130 | 0.107–0.155 | 0.420 |
| 2026 | All | 2022-2025 | 277 | 71 | 0.183 | 0.163–0.203 | 0.545 |
| 2026 | 1st | 2022-2025 | 277 | 71 | 0.240 | 0.214–0.269 | 0.693 |
| 2026 | 2nd | 2022-2025 | 277 | 71 | 0.121 | 0.101–0.141 | 0.383 |

Second-innings forecasts beat a coin flip clearly; first-innings forecasts have little skill beyond the base rate (Brier 0.205 to 0.248). The 2023 forecast learned from one season only. A gradient-boosting model was tried and was worse in every fold, so it was not adopted (D19).

## 3. How we judge performance under pressure

On High-pressure balls each player is compared with an average player in exactly the same situation (**Runs Above Expected**, RAE, for batters; **Runs Saved vs Expected**, RSE, for bowlers), and four parts are blended with weights frozen before any ranking existed (pre-registration sha256 1a7bc8035d6c96327596ee83b99948b21ef70fc025457d3a890e3e9521dfe66d, D29; never tuned on the backtest, D6, D16).

Score = 100 × Φ( Σ w·z / sd ), with z = each part standardised among rated players of the role.

| Role | Part | Planned weight | Informative? | Prior mean | Prior spread (S, I, H: between-player variance; C: prior strength in seasons) | Effective weight |
| :--- | :--- | ---: | :--- | ---: | ---: | ---: |
| Batters | **S**: Skill under pressure: RAE (batters) or RSE (bowlers) per ball in High pressure | 0.40 | yes | 0.0735 | 0.02029 | **0.400** |
| Batters | **I**: Match impact: win probability added (WPA) per ball in High pressure | 0.25 | yes | 0.0030 | 7.669e-07 | **0.250** |
| Batters | **H**: Holds up: Low-pressure level minus High-pressure level, sign set so that dropping off is penalised | 0.15 | yes | 0.0407 | 0.008006 | **0.150** |
| Batters | **C**: Consistency: share of seasons (at least 30 High balls) in which the player was above expected | 0.20 | yes | 0.5966 | 2 | **0.200** |
| Bowlers | **S**: Skill under pressure: RAE (batters) or RSE (bowlers) per ball in High pressure | 0.40 | yes | -0.0241 | 0.01308 | **0.533** |
| Bowlers | **I**: Match impact: win probability added (WPA) per ball in High pressure | 0.25 | no: no detectable difference between players | -0.0019 | n/a | **0.000** |
| Bowlers | **H**: Holds up: Low-pressure level minus High-pressure level, sign set so that dropping off is penalised | 0.15 | yes | -0.0374 | 0.002637 | **0.200** |
| Bowlers | **C**: Consistency: share of seasons (at least 30 High balls) in which the player was above expected | 0.20 | yes | 0.4521 | 2 | **0.267** |

A part with no detectable between-player differences at these sample sizes carries no weight and its weight moves to the others (D30): match impact for bowlers only. Effective weights: batters skill under pressure 0.40, match impact 0.25, holds up 0.15, consistency 0.20; bowlers skill under pressure 0.53, holds up 0.20, consistency 0.27.

Each part is shrunk toward the role average (Empirical Bayes using each player's own sampling variance and a Kish effective sample size, D31; shrinkage strength floored at 30 balls; consistency uses a prior strength of 2 seasons). Recent seasons count more: 2026 = 1.00, 2025 = 0.75, 2024 = 0.56, 2023 = 0.42 (decay 0.75 a season). 80% range: 1,000 bootstrap draws over the player's matches, seed 2027, 10th to 90th percentile. All-rounders: 0.5 x batting score + 0.5 x bowling score.

### Why not a simple average?

- Components are on different scales, so each is standardised before weighting.
- Small samples are shrunk toward the average first, so 30 lucky balls can't top the list.
- Weights were frozen before any ranking existed (pre-registration), never tuned to results.

### Who is rated

Rated if the player faced at least 100 High-pressure balls (batters) or bowled at least 60 legal High-pressure balls (bowlers) in IPL 2023–26. All-rounders need both thresholds. 257 players were in scope (appeared in IPL 2025 or 2026): 47 batters and 71 bowlers are rated (8 all-rounders are scored on both; 110 distinct players) and 147 are listed as Not Scorable on IPL data because their High-pressure sample is too small.

## 4. Did the score predict next season? (backtest)

Folds 2024, 2025, 2026. For fold N the score is rebuilt from seasons 2023 to N-1 only. The outcome is High-pressure runs above expected (batters) or runs saved (bowlers) per ball in season N, needing at least 30 High balls; "above average" is relative to all players that season. Entry needs at least 60 High balls faced or 40 High legal balls bowled in the history window. Naive baseline: top 10 by overall strike rate (batters) or economy (bowlers).

| Role | Fold | Qualified | Assessable | Top-10 assessable (score / naive) | Hit rate excl. unassessable (score / naive) | Random-pick hit rate | Hit rate, unassessable = miss (score / naive) | Rank correlation (score / naive) | Difference, 80% interval (pts) | Pre-registered claim |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| Batters | 2024 | 18 | 6 | 4 / 5 | 75.0% / 60.0% | 66.7% | 30.0% / 30.0% | +0.31 / −0.60 | — | — |
| Batters | 2025 | 36 | 23 | 6 / 6 | 16.7% / 50.0% | 43.5% | 10.0% / 30.0% | −0.43 / −0.19 | — | — |
| Batters | 2026 | 60 | 30 | 4 / 4 | 50.0% / 25.0% | 53.3% | 20.0% / 10.0% | +0.00 / −0.19 | — | — |
| Batters | **pooled** | 114 | 59 | 14 / 15 | 42.9% / 46.7% | 50.8% | 20.0% / 23.3% | −0.13 / −0.15 | −17.1 to +3.8 | historical indicator; persistence not demonstrated |
| Bowlers | 2024 | 40 | 18 | 5.3 / 4 | 50.0% / 50.0% | 66.7% | 26.3% / 20.0% | −0.37 / −0.29 | — | — |
| Bowlers | 2025 | 61 | 33 | 7 / 10 | 85.7% / 70.0% | 54.5% | 60.0% / 70.0% | +0.20 / +0.44 | — | — |
| Bowlers | 2026 | 77 | 23 | 4.3 / 6 | 79.5% / 100.0% | 60.9% | 34.4% / 60.0% | −0.30 / +0.50 | — | — |
| Bowlers | **pooled** | 178 | 74 | 16.6 / 20 | 72.8% / 75.0% | 59.5% | 40.3% / 50.0% | −0.05 / +0.29 | −14.6 to +4.4 | historical indicator; persistence not demonstrated |

**Result.** Batters: score 42.9% v simple ranking 46.7%; random pick 50.8%; difference −3.8 points, 80% interval −17.1 to +3.8 (includes 0): **historical indicator; persistence not demonstrated**. Bowlers: score 72.8% v simple ranking 75.0%; random pick 59.5%; difference −2.2 points, 80% interval −14.6 to +4.4 (includes 0): **historical indicator; persistence not demonstrated**. Rank correlation with next-season outcome: batters −0.13 (naive −0.15), bowlers −0.05 (naive +0.29). The random-pick hit rate is the share of all assessable players who were above average next season: what picking at random would score.

**Caution.** Only 14 batter and 16.6 bowler player-seasons in the top 10 could be assessed across the three folds, so every hit rate is very noisy. The result is published as it came out; no weight or metric was changed after seeing it.

## 5. Sensitivity and robustness

| Role | Weight changed | −10% | +10% |
| :--- | :--- | ---: | ---: |
| Bowlers | S | 100% | 100% |
| Bowlers | I | 100% | 100% |
| Bowlers | H | 100% | 100% |
| Bowlers | C | 100% | 100% |
| Batters | S | 90% | 100% |
| Batters | I | 100% | 100% |
| Batters | H | 100% | 100% |
| Batters | C | 100% | 90% |

Each planned weight moved by plus or minus 10% (others renormalised): the top-10 overlap with the main ranking is shown above (top-10 overlap across all weighting variants never drops below 40%).

| Role | Alternative weighting | Top-10 overlap with main |
| :--- | :--- | ---: |
| Batters | Only skill under pressure (S) | 80% |
| Batters | Only consistency (C) | 40% |
| Batters | All informative parts equal | 90% |
| Bowlers | Only skill under pressure (S) | 80% |
| Bowlers | Only consistency (C) | 60% |
| Bowlers | All informative parts equal | 90% |

| Role | Top-10 pairs | Pairs separated by 80% ranges | Pairs too close to call |
| :--- | ---: | ---: | ---: |
| Batters | 45 | 0 | 45 |
| Bowlers | 45 | 0 | 45 |

| Variant | Role | Rated (main) | Rated (variant) | Top-20 overlap | Rank correlation |
| :--- | :--- | ---: | ---: | ---: | ---: |
| Pressure = leverage only, no context boosts | Batters | 47 | 45 | 70% | 0.83 |
| Pressure = leverage only, no context boosts | Bowlers | 71 | 70 | 80% | 0.81 |
| Pressure from rules (chase, death, etc.) instead of leverage | Batters | 47 | 40 | 20% | 0.21 |
| Pressure from rules (chase, death, etc.) instead of leverage | Bowlers | 71 | 73 | 40% | 0.41 |
| Adds the hindsight close-game boost (comparison only, D8) | Batters | 47 | 48 | 85% | 0.96 |
| Adds the hindsight close-game boost (comparison only, D8) | Bowlers | 71 | 73 | 95% | 0.97 |
| Pressure scale from earlier seasons only (strict D18, comparison) | Batters | 47 | 21 | 40% | 0.81 |
| Pressure scale from earlier seasons only (strict D18, comparison) | Bowlers | 71 | 50 | 65% | 0.75 |
| Season-average RAE/RSE removed (comparison only, uses later matches) | Batters | 47 | 47 | 100% | 1.00 |
| Season-average RAE/RSE removed (comparison only, uses later matches) | Bowlers | 71 | 71 | 100% | 0.99 |

Top-20 overlap is the share of the main top 20 that is also in the variant's top 20. Below 60%: pressure from rules (chase, death, etc.) instead of leverage (batters 20%); pressure from rules (chase, death, etc.) instead of leverage (bowlers 40%); pressure scale from earlier seasons only (strict d18, comparison) (batters 40%). The rule-based and strict-D18 variants count situations or use fewer High balls, so different players pass the sample rules; read the lists with that in mind.

### Season level: expected runs trail scoring jumps

| Season | Balls | Mean runs above expected per ball | Actual runs per ball | Expected runs per ball |
| :--- | ---: | ---: | ---: | ---: |
| 2022 | 17,207 | −0.010 | 1.339 | 1.353 |
| 2023 | 17,237 | +0.019 | 1.417 | 1.399 |
| 2024 | 16,374 | +0.040 | 1.506 | 1.466 |
| 2025 | 16,576 | +0.004 | 1.525 | 1.521 |
| 2026 | 16,727 | +0.016 | 1.563 | 1.547 |

Expected runs come from earlier matches only and trail scoring jumps (D28). Season-centred check (comparison only): top-20 overlap with the main list is 100% for batters and 100% for bowlers.

## 6. Data and the official cross-check

- Scope: IPL only. 367 matches (2022–2026), 87,687 balls; 353 matches are eligible for win probability (no-result, abandoned, DLS or reduced-overs matches are left out of pressure and WPA but stay in descriptive totals). 293 matches and 67,880 balls are rated (2023–2026).
- Every drop, merge, filter or fix is logged: 32 entries in `logs/DATA_NOTES.md`. Super overs are excluded from all metrics.
- The organisers' official match file was checked against our 367 matches: 9 of 11 checks pass, and two differ, as listed below. The 4 official matches with no balls in our data were all abandoned.

| Check | Status | Detail |
| :--- | :--- | :--- |
| One IPL competition per season 2022-2026 | Pass | comp_ids 2022:1358, 2023:1715, 2024:2193, 2025:2725, 2026:3298 |
| Every match in our IPL table is in the official IPL list | Pass | 0 of 367 not found |
| Season agrees | Pass | 0 differ |
| Date agrees | Pass | 0 differ |
| Official matches absent from the ball data are all 'Match Abandoned' | Pass | 4 absent: 31281 (2024, Match Abandoned); 31284 (2024, Match Abandoned); 31288 (2024, Match Abandoned); 40761 (2025, Match Abandoned) |
| Winner agrees (no result = no winner) | Differs | 7 of 367 differ |
| Playoff flag agrees with official stage | Pass | 20 official playoff matches; 0 differ |
| Reduced-overs (DLS) matches agree | Differs | official 5, ours 13; 8 differ |
| No-result matches agree | Pass | official 5, ours 5; 0 differ |
| Super-over matches agree | Pass | official 2, ours 2; 0 differ |
| Venue id present for every match (ids only, no names) | Pass | 18 distinct venue ids, all in India |

### Why IPL only

T20I and A-team matches appear in the dataset but are left out of every metric: a player is then measured against the same opposition level and the same playing conditions as every other player, which is what a fair pressure comparison needs.

## 7. Limitations, stated plainly

1. IPL only: T20I and A-team matches are left out so every player faces the same opposition level and conditions (D38).
2. No venue adjustment: venue names could not be looked up (source sites blocked); the organisers' venue ids (18 venues) arrived after the method was frozen, so they are not used.
3. First-innings win probabilities have little skill beyond the base rate (Brier 0.205 to 0.248); second-innings ones are informative.
4. The 2023 forecast learned from one season (2022) only.
5. Expected runs from earlier matches trail scoring jumps: mean RAE per ball +0.02 (2023), +0.04 (2024), +0.00 (2025), +0.02 (2026); the season-centred check leaves the top 20 unchanged.
6. Parts of the score with no detectable player differences carry no weight: match impact for bowlers only (D30).
7. Top-10 rankings are too close to call: 0 of 90 top-10 pairs are separated by their 80% ranges.
8. Backtest: batters historical indicator; persistence not demonstrated; bowlers historical indicator; persistence not demonstrated. Intervals of the difference: batters −17.1 to +3.8, bowlers −14.6 to +4.4 points.
9. A rule-based definition of pressure keeps only 20% of the batter and 40% of the bowler top 20, so the names depend on how pressure is defined.
10. Fielding is not in the data; wicketkeeper and captaincy are not identifiable.

## 8. Next steps

- Use the organisers' venue ids for a home-ground adjustment.
- Extend to T20I with a level-of-opposition adjustment.
- Add more seasons (the 2023 forecast learned from one).

Every number in this note is read from `outputs/tables/*.csv`, `outputs/tables/summary_numbers.json` and `outputs/deliverables/dashboard_payload.json` by `src/step7_docs.py`. Independent submission, not an official Rajasthan Royals product.
