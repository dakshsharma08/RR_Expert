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
