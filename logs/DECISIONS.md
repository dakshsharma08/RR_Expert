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

Proposals in `docs/FRAMEWORK_REVIEW.md` (C1–C14, G1–G15, W1–W11) that are not listed above are still **pending**. They take effect only once the revised plan is approved.
