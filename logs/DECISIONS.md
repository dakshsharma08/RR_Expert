# Decisions log

These are changes and clarifications to how the master prompt is carried out. The prompt itself (`docs/master_prompt/MASTER_PROMPT.md`) is never edited. Every original requirement still applies unless a decision below says otherwise.

| ID | Date approved | Decision | Reason | Affects |
|---|---|---|---|---|
| D1 | 2026-11-17 | **Venue:** map all 367 IPL matches using official IPL/BCCI fixture lists. Match on reliable identifiers: date, teams, match number. Record the source for each mapping. If a venue cannot be verified, mark it **UNKNOWN**. Never guess a venue or silently substitute one | The dataset has no venue column, yet venue par is used in Steps 1A, 1B and 2 | Step 0B, 1A, 1B, 2 |
| D2 | 2026-11-17 | **Auction facts:** verify independently RR's retained and released players, purse, squad limits, overseas limits, trades and auction rules. For every fact, record source, publication date and verification date. Keep confirmed facts and assumptions clearly apart. **Recheck all facts before the final auction recommendations** | The situation is still changing: retention lists are due 17 Nov 2026, and trades remain open | Step 0B, 5, 8 |
| D3 | 2026-11-17 | **Players without enough IPL data** stay out of the scored shortlist. They are shown separately as **"Not Scorable on IPL Data"**, with the reason and the sample they do have. T20I or other T20 stats are never mixed into the IPL-only score | IPL-only scope (user instruction) | Step 3, 5, 7 |
| D4 | 2026-11-17 | **Win probability for historical balls is chronological and out of sample.** For each season, train only on eligible earlier matches and predict the next season, keeping each match whole within a split. In-sample predictions, from a model trained on the matches it scores, are never used for historical pressure, WPA or player evaluation. A model fitted on all seasons may be kept for future prediction only | Avoids leakage. Supersedes proposal C3 in `docs/FRAMEWORK_REVIEW.md` | Step 1A, 1B, 2–4, dashboard |
| D5 | 2026-11-17 | **Freeze the metric list, score weights and scaling rules before looking at any player rankings or backtest results** | Prevents tuning to the results | Step 3, 4 |
| D6 | 2026-11-17 | **Never tune weights against the backtest seasons** | Leakage and overfitting | Step 4 |
| D7 | 2026-11-17 | **Report the limits of the small match sample and the uncertainty in model calibration** | Honesty (Golden Rule 6) | Step 1, 4, 7D, dashboard |
| D8 | 2026-11-17 | **The main score never uses the hindsight-based close-game boost.** The version with the boost is reported separately, as a comparison, and is never blended into the main score | The boost uses the final margin, which is hindsight | Step 1B, 4, 7 |
| D9 | 2026-11-17 | **Keep every original requirement of the master prompt.** Approved changes are recorded here, never by editing the prompt | Traceability | All |

| D10 | 2026-11-17 | **IPL 2022 is training data only**, used for the 2023 model. The historical Pressure Index, WPA and player pressure metrics cover **2023–2026**. Disclose clearly that the 2023 model has only one earlier season of training data. Start with a simple model and report its limits | D4 leaves no earlier season from which to score 2022 | Step 1–4, 7 |
| D11 | 2026-11-17 | **Earlier-data-only rule for every historical benchmark.** This covers win-probability predictions, leverage outcome frequencies, expected-runs benchmarks, venue and season pars, opposition strength, and any other historical benchmark used in player scoring. Every historical ball is evaluated only with information available before its match. Early-season matches with little history use a documented fallback to the prior season, plus shrinkage. Future matches are never used | Consistent protection against leakage | Step 1–4 |
| D12 | 2026-11-17 | **Venue sources.** Prefer official IPL/BCCI sources. If they can't be accessed, accept two independent reputable secondary sources (for example ESPNcricinfo and Cricbuzz). Record both sources, the matching evidence and the verification status. If reliable agreement is unavailable, mark the venue **UNKNOWN**. Never guess | Accuracy of an external input to the model | Step 0B |
| D13 | 2026-11-17 | **Win-probability model:** start with simple logistic regression. Consider more complex models only if out-of-sample results justify them | Simplicity; little training data | Step 1A |
| D14 | 2026-11-17 | **Report model calibration and uncertainty separately for each season** | Each season has a different amount of training data | Step 1, 7 |
| D15 | 2026-11-17 | **Framing.** The Clutch Reliability Score is described as a **historical pressure-performance indicator**. Say clearly that its ability to predict IPL 2027 performance is **not established**, and never overstate its predictive power | Honesty (Golden Rule 6) | Step 4–8, all deliverables |
| D16 | 2026-11-17 | **The backtest is kept completely separate from weight selection and metric tuning.** It is run only after the pre-registration is frozen, and its results never feed back into weights or metrics | Prevents tuning to the test | Step 4 |
| D17 | 2026-11-17 | Reaffirms D9: keep the original master prompt and record every decision in this file | Traceability | All |

## Clarifications awaiting approval

These follow from D4 and D11. They are proposed and **not yet in force**.

| ID | Proposal | Why it is needed |
|---|---|---|
| U4 | The reference for the 0–100 Pressure Index scale and the Low/Medium/High cut-offs comes **from earlier seasons only**. A 2024 ball is ranked against 2023 balls, 2025 against 2023–24, and 2026 against 2023–25. 2023 is ranked against 2022 balls. Those 2022 balls are scored by models trained on other 2022 matches, so no ball is scored by a model trained on its own match. They are used only as this yardstick, never to evaluate players | Percentile cut-offs taken from the same season would use matches played after the ball, which breaks D11 |
| U5 | Logistic regression scores every season. A more complex model may replace it from season *s* onward **only if it beat logistic regression on the folds before *s***. Otherwise it appears only as a reported comparison | Choosing a model on later seasons' results and then using it to score earlier seasons would leak future information |
| U6 | Player-level summaries (shrinkage, intervals, recency, consistency, 0–100 score) are computed **as of a cut-off date**, using only balls up to that date. For the final leaderboard the cut-off is the end of the data (IPL 2026). For each backtest fold it is the end of season N-1 | Makes D11 precise for player aggregates, which pool many matches |

Proposals in `docs/FRAMEWORK_REVIEW.md` (C1–C14, G1–G15, W1–W11) that are not listed above are still **pending**. They take effect only once the revised plan is approved.
