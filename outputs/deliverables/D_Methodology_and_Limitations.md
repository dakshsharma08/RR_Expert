# RR Clutch Index: Methodology and Limitations

Submission to Rajasthan Royals' SupeRR Selector Season 2. Data: 367 IPL matches, 87,687 balls, to 2026-05-31 (build 2026-11-17, seed 2027). Raw data sha256 01e2b4379edfbab6a6e456d304cb3c70f554cb312ef93d9588f3f32a82cb396e.

> **Read this first.** Historical pressure-performance indicator, not a forecast. Its ability to predict IPL 2027 is not established. Backtest, top 10 still above average next season: batters: score 42.9% v simple ranking 46.7%; random pick 50.8%; difference −3.8 points, 80% interval −17.1 to +3.8 (includes 0) (historical indicator; persistence not demonstrated); bowlers: score 72.8% v simple ranking 75.0%; random pick 59.5%; difference −2.2 points, 80% interval −14.6 to +4.4 (includes 0) (historical indicator; persistence not demonstrated). Prices, availability, ages and nationality are assumptions or UNKNOWN: nothing external was VERIFIED.

## 1. What the score is, in one paragraph

The Clutch Reliability Score (0 to 100, roughly a percentile within a role) measures how well a player performed on the balls that could swing a match, IPL 2023–2026. It is a **historical pressure-performance indicator**. Its ability to predict IPL 2027 performance is **not established** (D15). We rated 110 distinct players (47 in the batter list, 71 in the bowler list and 8 all-rounders, who are scored on both; some players are in more than one list). 147 of the 257 players in scope had too little High-pressure data and are listed separately as Not Scorable on IPL data. IPL 2022 is used only for training the win-probability model (D10).

## 2. The six steps, in plain words

1. Data: 367 IPL matches 2022–26, ball by ball; 2022 used only to train.
2. Win probability: simple logistic model per season, trained only on earlier seasons.
3. Pressure Index: how much each ball can swing the result (leverage), plus small context boosts, ranked 0–100 against earlier balls only.
4. Fair comparison: runs above (batters) or saved (bowlers) versus an average player in the same situation, from earlier matches only.
5. Reliability: small samples pulled toward average (shrinkage), recent seasons weighted more, 80% ranges by resampling matches.
6. Clutch score 0–100: frozen weights, percentile-like scale within role; backtested against a naive ranking.

Samples: a batter needs at least 100 High-pressure balls faced, a bowler at least 60 legal balls bowled in High pressure; an all-rounder needs both. High pressure means a Pressure Index of 80 or more; Medium is 50 to 80; Low is below 50.

## 3. The formula and the weights

Score = 100 × Φ( Σ w·z / sd ), with z = each component standardised among scorable players of the role. Planned weights: Skill under pressure 0.40, Match impact 0.25, Holds up 0.15, Consistency 0.20. Effective weights after components with no detectable player differences drop out: batters: skill under pressure 0.40, match impact 0.25, holds up 0.15, consistency 0.20; bowlers: skill under pressure 0.53, holds up 0.20, consistency 0.27.

Each component is shrunk toward the role average (Empirical Bayes using each player's own sampling variance and a Kish effective sample size, D31; shrinkage strength floored at 30 balls; consistency uses a prior strength of 2 seasons). Recent seasons count more: 2026 = 1.00, 2025 = 0.75, 2024 = 0.56, 2023 = 0.42 (decay 0.75 a season). Intervals: 1,000 bootstrap draws over the player's matches, seed 2027; the 80% range is the 10th to 90th percentile. All-rounders: 0.5 x batting score + 0.5 x bowling score.

| Role | Component | Planned weight | Informative? | Prior mean | Prior spread (S, I, H: between-player variance; C: prior strength in seasons) | Effective weight |
| :--- | :--- | ---: | :--- | ---: | ---: | ---: |
| Batters | **S**: Skill under pressure (runs above expected for batters, runs saved vs expected for bowlers, per ball in High pressure) | 0.40 | yes | 0.0735 | 0.02029 | **0.400** |
| Batters | **I**: Match impact (win probability added per ball in High pressure) | 0.25 | yes | 0.0030 | 7.669e-07 | **0.250** |
| Batters | **H**: Holds up (Low-pressure form minus High-pressure form, sign set so that dropping off is penalised) | 0.15 | yes | 0.0407 | 0.008006 | **0.150** |
| Batters | **C**: Consistency (share of seasons with enough High balls where the player was above expected) | 0.20 | yes | 0.5966 | 2 | **0.200** |
| Bowlers | **S**: Skill under pressure (runs above expected for batters, runs saved vs expected for bowlers, per ball in High pressure) | 0.40 | yes | -0.0241 | 0.01308 | **0.533** |
| Bowlers | **I**: Match impact (win probability added per ball in High pressure) | 0.25 | no: no detectable difference between players (weight moved to the other components) | -0.0019 | n/a (no between-player spread) | **0.000** |
| Bowlers | **H**: Holds up (Low-pressure form minus High-pressure form, sign set so that dropping off is penalised) | 0.15 | yes | -0.0374 | 0.002637 | **0.200** |
| Bowlers | **C**: Consistency (share of seasons with enough High balls where the player was above expected) | 0.20 | yes | 0.4521 | 2 | **0.267** |

**What this means.** Components with no detectable between-player differences at these sample sizes: match impact (I) for bowlers only (D30). With nothing to separate players, every player is shrunk to the mean and the component's z-score is set to 0. The effective weights are therefore batters: skill under pressure 0.40, match impact 0.25, holds up 0.15, consistency 0.20; bowlers: skill under pressure 0.53, holds up 0.20, consistency 0.27. The planned weights were frozen before any player number existed (pre-registration sha256 1a7bc8035d6c96327596ee83b99948b21ef70fc025457d3a890e3e9521dfe66d, D29) and were never tuned on the backtest (D6, D16).

## 4. Why not a simple average?

- Components are on different scales, so each is standardised before weighting.
- Small samples are shrunk toward the average first, so 30 lucky balls can't top the list.
- Weights were frozen before any ranking existed (pre-registration), never tuned to results.

## 5. Win-probability model and Pressure Index quality

One simple logistic model per season, trained only on earlier seasons and scored out of sample (D4, D13, D26). Brier score: lower is better. A coin flip scores 0.25. Calibration by probability bin is in `outputs/tables/step1a_calibration.csv`.

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

Second-innings models beat a coin flip clearly; first-innings models have little skill beyond the base rate (Brier 0.205 to 0.248). The 2023 model learned from one season only. A gradient-boosting model was tried and was worse in every fold, so it was not adopted (D19).

| Season | High (main, D27) | Medium | Low | High (strict D18, comparison) | Balls |
| :--- | ---: | ---: | ---: | ---: | ---: |
| 2023 | 22.8% | 30.6% | 46.6% | 17.6% | 17,307 |
| 2024 | 14.3% | 29.7% | 56.0% | 4.8% | 16,902 |
| 2025 | 22.4% | 31.7% | 45.9% | 8.6% | 16,555 |
| 2026 | 19.9% | 28.7% | 51.4% | 15.7% | 17,116 |

## 6. Backtest: did the score predict next season?

Folds 2024, 2025, 2026. For fold N the score is rebuilt from seasons 2023 to N-1 only. The outcome is High-pressure runs above expected (batters) or runs saved (bowlers) per ball in season N, needing at least 30 High balls; "above average" is relative to all players that season. Entry needs at least 60 High balls faced or 40 High legal balls bowled in the history window. Naive baseline: top 10 by overall strike rate (batters) or economy (bowlers).

| Role | Fold | Qualified | Assessable | Top-10 assessable (score / naive) | Hit rate excl. unassessable (score / naive) | Random-pick hit rate | Hit rate, unassessable = miss (score / naive) | Rank correlation (score / naive) | Difference, 80% range (pts) | Pre-registered claim |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| Batters | 2024 | 18 | 6 | 4 / 5 | 75.0% / 60.0% | 66.7% | 30.0% / 30.0% | +0.31 / −0.60 | — | — |
| Batters | 2025 | 36 | 23 | 6 / 6 | 16.7% / 50.0% | 43.5% | 10.0% / 30.0% | −0.43 / −0.19 | — | — |
| Batters | 2026 | 60 | 30 | 4 / 4 | 50.0% / 25.0% | 53.3% | 20.0% / 10.0% | +0.00 / −0.19 | — | — |
| Batters | **pooled** | 114 | 59 | 14 / 15 | 42.9% / 46.7% | 50.8% | 20.0% / 23.3% | −0.13 / −0.15 | −17.1 to +3.8 | historical indicator; persistence not demonstrated |
| Bowlers | 2024 | 40 | 18 | 5.3 / 4 | 50.0% / 50.0% | 66.7% | 26.3% / 20.0% | −0.37 / −0.29 | — | — |
| Bowlers | 2025 | 61 | 33 | 7 / 10 | 85.7% / 70.0% | 54.5% | 60.0% / 70.0% | +0.20 / +0.44 | — | — |
| Bowlers | 2026 | 77 | 23 | 4.3 / 6 | 79.5% / 100.0% | 60.9% | 34.4% / 60.0% | −0.30 / +0.50 | — | — |
| Bowlers | **pooled** | 178 | 74 | 16.6 / 20 | 72.8% / 75.0% | 59.5% | 40.3% / 50.0% | −0.05 / +0.29 | −14.6 to +4.4 | historical indicator; persistence not demonstrated |

**Result.** Batters: score 42.9% v simple ranking 46.7%; random pick 50.8%; difference −3.8 points, 80% interval −17.1 to +3.8 (includes 0): **historical indicator; persistence not demonstrated**. Bowlers: score 72.8% v simple ranking 75.0%; random pick 59.5%; difference −2.2 points, 80% interval −14.6 to +4.4 (includes 0): **historical indicator; persistence not demonstrated**. Rank correlation with next-season outcome: batters −0.13 (naive −0.15), bowlers −0.05 (naive +0.29).

The random-pick hit rate is the share of all assessable players who were above average next season: it is what picking at random would score.

**Caution.** Only 14 batter and 16.6 bowler player-seasons in the score's top 10 could be assessed across the three folds, so every hit rate is very noisy. Counting players who could not be assessed as misses lowers every rate (see the table). The result is published as it came out; no weight or metric was changed after seeing it. Earlier runs are kept for the record in `step4_backtest_summary_prefix_bug.csv` (D30) and `step4_backtest_summary_v1_preD31.csv` (before the D31 corrections).

## 7. Sensitivity: do the weights matter?

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

Each planned weight moved by plus or minus 10% (others renormalised): the top-10 overlap with the main ranking never drops below 90%. If some components carry no information (section 3), changing their weights cannot change the ranking.

Alternative weightings (D31): consistency_only; equal_weights; skill_only.

| Role | Alternative weighting | Top-10 overlap with main |
| :--- | :--- | ---: |
| Batters | Only skill under pressure (S) | 80% |
| Batters | Only consistency (C) | 40% |
| Batters | All informative components equal | 90% |
| Bowlers | Only skill under pressure (S) | 80% |
| Bowlers | Only consistency (C) | 60% |
| Bowlers | All informative components equal | 90% |

Top-10 pairs separated by their 80% ranges (`step4_too_close_to_call.csv`); every other pair is too close to call.

| Role | Top-10 pairs | Pairs separated by 80% ranges | Pairs too close to call |
| :--- | ---: | ---: | ---: |
| Batters | 45 | 0 | 45 |
| Bowlers | 45 | 0 | 45 |

## 8. Robustness: other definitions of pressure

| Variant | Role | Scorable (main) | Scorable (variant) | Top-20 overlap | Rank correlation |
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

Top-20 overlap is the share of the main top 20 that is also in the variant's top 20. Below 60%: pressure from rules (chase, death, etc.) instead of leverage (batters 20%); pressure from rules (chase, death, etc.) instead of leverage (bowlers 40%); pressure scale from earlier seasons only (strict d18, comparison) (batters 40%). The rule-based and strict-D18 variants count situations or use fewer High balls, so different players pass the sample rules; the shortlist should be read with that in mind.

## 9. Season level: expected runs trail scoring jumps

| Season | Balls | Mean runs above expected per ball | Actual runs per ball | Expected runs per ball |
| :--- | ---: | ---: | ---: | ---: |
| 2022 | 17,207 | −0.010 | 1.339 | 1.353 |
| 2023 | 17,237 | +0.019 | 1.417 | 1.399 |
| 2024 | 16,374 | +0.040 | 1.506 | 1.466 |
| 2025 | 16,576 | +0.004 | 1.525 | 1.521 |
| 2026 | 16,727 | +0.016 | 1.563 | 1.547 |

Expected runs come from earlier matches only and trail scoring jumps (D28). Season-centred check (comparison only): top-20 overlap with the main list is 100% for batters and 100% for bowlers.

## 10. Limitations, stated plainly

1. Venues are UNKNOWN for all matches (source sites blocked), so there is no venue adjustment.
2. No external fact could be verified (squads, prices, ages, purse): all are REPORTED, UNKNOWN or [ASSUMPTION].
3. First-innings win probabilities have little skill beyond the base rate; second-innings ones are informative.
4. The 2023 model learned from one season (2022) only.
5. Expected runs from earlier matches trail scoring jumps: mean RAE per ball +0.02 (2023), +0.04 (2024), +0.00 (2025), +0.02 (2026). Season-centred check: top-20 unchanged 100%.
6. Top-10 rankings are too close to call: no pair of top-10 players is separated by their 80% ranges (step4_too_close_to_call).
7. Backtest: batters historical indicator; persistence not demonstrated; bowlers historical indicator; persistence not demonstrated. Intervals of the difference: batters −17.1 to +3.8, bowlers −14.6 to +4.4 points.
8. Fielding is not in the data; wicketkeeper and captaincy are not identifiable.
9. Ages, injuries and availability are not verifiable here; the shortlist is conditional on the official auction list.
10. Components with no detectable between-player differences at these sample sizes carry no weight: match impact (I) for bowlers only (D30).
11. A rule-based definition of pressure keeps only 20% of the batter and 40% of the bowler top 20, so exact names depend on how pressure is defined.
12. RR's phase gaps are within noise except powerplay batting; see the gap table (`step5_gaps.csv`).

## 11. External facts and assumptions

Under Golden Rule 2 every external fact is either VERIFIED or tagged. **None could be verified**: the network policy blocked the sources (D23). Ledger of 29 facts: 26 REPORTED (search summary only), 3 UNKNOWN. Full ledger: `logs/FACTS.md`. Recheck before the auction (D2).

| ID | Item | Value used | Reason |
| :--- | :--- | :--- | :--- |
| A1 | RR's current group | The 20 players who appeared for RR in IPL 2026, from the data | RR's 2027 retention list is UNKNOWN (F1-019). Recheck at F2 |
| A2 | Availability of every other player | UNKNOWN: treated as 'possibly in the auction pool' | Retention and release lists can't be read (D23). Every card says 'pursue only if in the official auction list' |
| A3 | Likely retained (excluded from shortlist and plans) | Players who appeared in ≥80% of their team's 2026 matches (regulars) | Franchises rarely release regular starters before a mini-auction. A proxy, not a fact; they stay on the leaderboard |
| A4 | RR auction purse | Rs 15 crore | UNKNOWN (F1-022). Context REPORTED: Rs 2.65 cr left after the 2026 auction (F1-024). Illustrative; adjustable in the dashboard |
| A5 | RR open slots | 5 slots (25 max − 20 in the 2026 group); 1 overseas (8 max − 7 inferred overseas) | Assumes only the players who actually appeared in 2026 are retained. REPORTED context conflicts: RR had a 25-player squad (8 overseas) and Rs 2.65 cr left after the 2026 auction (F1-024), which would leave 0 slots until releases are known. Plans are therefore illustrative. Limits REPORTED (F1-006/007) |
| A6 | Price bands | Rule-based from data: Established (≥3 of 2023–26 seasons with ≥10 matches) Indian Rs 8–14 cr / overseas Rs 6–12 cr; Regular (2 such seasons) Rs 3–8 / 3–7 cr; Emerging Rs 0.3–3 cr. Walk-away = top of band | No market data could be read. Ignores reputation; illustrative only |
| A7 | Overseas / Indian status | Inferred from T20Is in this dataset (2022–26); UNKNOWN when a player has none. UNKNOWN players count as Indian in the optimiser and XI, which is flagged | Evidence-based, not verified externally |
| A8 | Age | UNKNOWN for every player | Not in the data and not verifiable here |
| A9 | Overseas limit in XI | 4 (REPORTED, F1-008) | One source only |
| A10 | Optimiser value | score/100 × 1.5 if the player fills a measured RR gap (his own High-pressure record in that phase beats the league on ≥30 balls; D33), × 0.6 otherwise; at most one non-gap 'depth' pick; Must-Back picks forced in where feasible | RR's gaps are directional (see gap table: within noise), so this is a judgement weighting, not a proof |
| A11 | Wicketkeeper | Dhruv Jurel keeps wicket in the sample XI | Keeper not recorded in the data (no fielder column); external, unverified |
| A12 | Impact Player rule in 2027 | Assumed to continue (REPORTED F1-014: expected to continue, under review) | Affects the XI + Impact Player format only |

## 12. Data handling

- Scope: IPL only. 367 matches, 87,687 balls; 353 matches eligible for win probability (no-result, abandoned, DLS or reduced-overs matches excluded from pressure and WPA, still in descriptive totals).
- Players: 257 in scope (appeared in IPL 2025 or 2026); 110 distinct players scorable (47 batter list, 71 bowler list, 8 all-rounders; some are in more than one list); 147 not scorable.
- Every drop, merge, filter or fix is logged: 32 entries in `logs/DATA_NOTES.md`. Super overs are excluded from all metrics. Venues are UNKNOWN for all matches (D23).
- Every number in this note is read from `outputs/tables/*.csv`, `outputs/tables/summary_numbers.json` and `outputs/deliverables/dashboard_payload.json` by `src/step7_docs.py`.
