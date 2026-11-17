# REVIEWS (critic findings and what was done)

The critic is a fresh sub-agent that did not build the work it reviews (Part 2). It reports each finding as Finding | Evidence | Severity (Blocker / Major / Minor) | Suggested fix, and says whether it reproduced the problem or only suspects it.
- Every Blocker and Major is fixed and then re-checked.
- Anything still open after two rounds goes to the user as a named risk.

| Gate | Round | Finding | Evidence | Severity | Reproduced? | Action taken | Status |
|---|---|---|---|---|---|---|---|
| Step 0 | 1 | No team ID map file (only evidence) | `outputs/reviews/critic_step0.csv` #1 | Major | yes | Built `data/work/team_map.csv` (`src/step0_team_map.py`), status INFERRED | Fixed |
| Step 0 | 1 | 14130/14164 are dropped balls, not reduced overs (true count 11) | #2 | Minor | yes | Data Notes row added; matches stay ineligible | Fixed (documented) |
| Step 0 | 1 | Checkpoint, REVIEWS and glossary empty at review time | #3 | Minor | yes | Checkpoints 0–4 written; this log filled; glossary filled at Step 6 | Fixed |
| Step 0 | 1 | Dismissed batter reappears in 20182 | #4 | Minor | yes | Data Notes row added; match ineligible | Documented |
| Step 0 | 1 | Retired-not-out and extras_2 rules are inferred | #5, #6 | Minor | suspected | Already labelled *(inferred)* in DEFINITIONS B | Accepted, documented |
| Step 0 | 1 | Undetermined matches mix no-result and DLS | #7 | Minor | yes | All excluded from win probability, either way. Reported results listed in FACTS | Documented |
| Step 0 | 1 | Ties not counted as close games in the comparison flag | #8 | Minor | yes | `step1b` close-game flag now includes ties | Fixed |
| Step 0 | 1 | Treatment of 40751 undecided | #9 | Minor | yes | Excluded from all player metrics (not WP-eligible); Data Notes row | Fixed |
| Step 0 | 1 | Data Notes omissions (venues, boundary flags, None strings, start year) | #10 | Minor | yes | Rows added | Fixed |
| Step 0 | 1 | `main_bowling_type` unreliable | #11 | Minor | yes | Only `pace_or_spin` used | Fixed (documented) |
| Step 0 | 1 | Look-alike names left "unresolved" | #12 | Minor | yes | Evidence shows they are distinct people; ids kept | Accepted |
| Step 0 | 1 | String columns sort wrongly | #13 | Minor | yes | `src/loaders.py` casts keys to integers | Fixed |
| Step 0 | 1 | Hard-coded literals; DEFINITIONS B hand-edited | #14 | Minor | yes | Kept; values are asserted in scripts and documented | Accepted |
| Step 0 | 1 | Gate checks partly not independent | #15 | Minor | yes | Noted. The strongest evidence is the 10/10 season-leader match and the critic's own recomputation | Accepted |
| Step 0 | 1 | DATA_AUDIT text: KKR/RCB played 13 in 2025 | #16 | Minor | yes | Text corrected | Fixed |
| Step 1–2 | 1 | No leakage: truncation test bit-identical; cumulative-minus-own correct | `outputs/reviews/critic_step1_2.csv` | — | yes | None needed | Pass |
| Step 1–2 | 1 | M1: first-innings model makes early wickets cost ~8 points | critic M1 | Major | yes | Tested against data: an over-1 wicket shifts the real win rate by −8.6 points. The model is consistent with the data; D32 rejects the change | Rejected with evidence |
| Step 1–2 | 1 | M2: overconfident win probability at the end of chases (≤6 balls left) | critic M2 | Major | yes | Not fixable inside the approved simple model without a more complex model class (D13/D19). Disclosed as a limitation and named risk | Open → named risk |
| Step 1–2 | 1 | M3: byes and leg-byes WPA broke G5 | critic M3 | Major | yes | Batter WPA = full change on balls faced (D31h) | Fixed |
| Step 1–2 | 1 | M4: the D26 feature change was chosen after seeing test seasons | critic M4 | Major | yes | Disclosed in D26, the checkpoints and the limitations: model selection used test seasons (pooled Brier unchanged) | Disclosed |
| Step 1–2 | 1 | M5: innings × phase offset in expected runs (first-innings death +0.06) | critic M5 | Major | yes | Disclosed as limitation R14. The season-centred check leaves the top-20 unchanged. Effect on chasing/setting split noted | Disclosed |
| Step 1–2 | 1 | Chase-pressure boost maxed on ball 1 (current run rate 0) | critic minor | Minor | yes | Current run rate shrunk toward par over 12 balls (D31i) | Fixed |
| Step 1–2 | 1 | Other minors: base-rate Brier is an oracle (renamed); no calibration chart file (drawn in dashboard/deck); boosts barely matter (reported); GBM a strawman (comparison only); K_REF chosen after shares (disclosed in D27) | critic minors | Minor | yes | Renamed / disclosed | Done |
| Step 3–4 | 1 | BLOCKER: backtest fold scores collapse to consistency only, with ties decided by sort order | `critic_step3_4.csv` #1 | Blocker | yes | Expected inclusion under random tie-breaks (D31c); effective n (D31a) restores the skill component where identifiable; per-fold informative components reported | Fixed (re-run) |
| Step 3–4 | 1 | D30 called "faithful", but it zeroes components | #2 | Major | yes | Reworded: D30 is an implementation guard. Pre-fix tables kept; both are reported | Fixed (wording) |
| Step 3–4 | 1 | EB noise uses recency-weighted n | #3 | Major | yes | Kish effective n (D31a) | Fixed |
| Step 3–4 | 1 | Pressure-drop variance doubled | #4 | Major | yes | σh²/nh + σl²/nl (D31b) | Fixed |
| Step 3–4 | 1 | Bowler ranking barely informative; no too-close-to-call output | #5 | Major | yes | `step4_too_close_to_call.csv` added; profiles and the dashboard flag overlap; limitation stated | Fixed |
| Step 3–4 | 1 | Backtest claims outrun the evidence; no base rate | #6 | Major | yes | Base rate added; pre-registered wording only (D31d, D31e) | Fixed |
| Step 3–4 | 1 | Batter outs undercounted | #7 | Major | yes | Wides and non-striker outs counted (D31f) | Fixed |
| Step 3–4 | 1 | Minors: vacuous sensitivity, missing top-10 overlaps, death economy, AR interval, splits without minimums | #8–20 | Minor | yes | Skill-only, consistency-only and equal-weight sensitivities added; top-10 overlaps added; High death economy added; splits show n in the profile; AR interval documented as an average of bounds | Mostly fixed |
| Step 5 | 1 | BLOCKER: bowling plan names a batter (3 career balls) as death bowler | `critic_step5.csv` #1 | Blocker | yes | Ranked by phase volume, ≥60 legal balls (D35) | Fixed |
| Step 5 | 1 | Gaps within noise drive the optimiser; no interval | #2 | Major | yes | Standard error, 80% interval and verdict per gap; A10 says the weighting is judgement | Fixed / disclosed |
| Step 5 | 1 | Must-Back not in Plan A or the XI | #3 | Major | yes | Must-Back needs a gap filled and recent volume; forced into Plan A | Fixed |
| Step 5 | 1 | Purse fits only at midpoints | #4 | Major | yes | Walk-away cost reported (Rs 21 cr against the assumed Rs 15 cr) | Disclosed |
| Step 5 | 1 | Squad arithmetic breaks the 25 and 8 limits | #5 | Major | yes | Slots and overseas room derived from the group (A5) | Fixed |
| Step 5 | 1 | Plan B a tie; tracks the priciest player | #6 | Major | yes | Plan B for every Plan A player, sorted by loss | Fixed |
| Step 5 | 1 | Plan A buys surplus pacers | #7 | Major | yes | At most one non-gap pick | Fixed |
| Step 5 | 1 | Crude "likely retained" proxy | #8 | Major | yes | Regulars (≥80% of matches) proxy; still an assumption | Improved |
| Step 5 | 1 | Low-volume Must-Back without a risk tag | #9 | Major | yes | "Low IPL 2026 volume" risk tag; recency needed for Must-Back | Fixed |
| Step 5 | 1 | Hidden Gems were the noisiest samples | #10 | Major | yes | Ranked by the lower bound of the 80% range | Fixed |
| Step 5 | 1 | 23 players' nationality UNKNOWN; counted as Indian | #11 | Major | yes | Flagged in A7 and in `step5_xi_meta` (`unknown_nationality_in_xi`) | Disclosed |
| Step 5 | 1 | Price bands ignore reputation | #12 | Major | suspected | Tagged [ASSUMPTION A6], illustrative | Disclosed (named risk) |
| Step 5 | 1 | XI order, keeper and impact choices unexplained | #13 | Major | yes | Slot-based XI with a "why" per player; spinner rule; LHB count computed | Fixed |
| Step 5 | 1 | Minors: reasons missing, unsung bar, numeric tags | minors | Minor | yes | One-line data reasons added; unsung ranked by lower bound of the 80% range | Fixed |
