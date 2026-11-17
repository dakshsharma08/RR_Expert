# Venue verification log, IPL 2025-2026 (verified_on 2026-11-17)

## Outcome
All 148 matches are UNKNOWN. No venue could be verified under rules D1/D12. Nothing was guessed or inferred.

## Sources tried
- https://en.wikipedia.org/wiki/2025_Indian_Premier_League -> FAILED (WebFetch getaddrinfo ENOTFOUND; host not in session's allowed network domains)
- https://www.espncricinfo.com/series/ipl-2025-1449924/match-schedule-fixtures-and-results -> FAILED (same ENOTFOUND)
- https://www.iplt20.com/matches/results -> FAILED (same ENOTFOUND)
- WebSearch "IPL 2025 full schedule results venue match list" -> WORKED but returned only a short summary and link list (aajtak, wisden, timesofindia, sportskeeda, khelnow, mykhel, outlookindia, etc.). No per-match venue table, so it cannot meet the two-source rule. The links were not fetched.
- Cricbuzz, bcci.tv, wisden, sportskeeda and others were NOT tried by WebFetch: the tool error said to stop trying other sites after hosts failed to resolve. Bypassing the proxy with curl was not attempted.
- No 2026 source was tried (stopped after the 2025 attempt hit the same block).

## Conflicts
None found (no data read).

## UNKNOWN matches
All 148 (74 in 2025, 74 in 2026). Reason: network policy blocks every site tried.
Special cases still open: 40751 (8 May 2025 PBKS v DC, 63 balls) and 43057 (24 May 2025 replay) each need a separate venue; the 2025 post-resumption relocations need checking.

## Remedy
Allow in the environment's network settings: en.wikipedia.org, www.espncricinfo.com, www.iplt20.com, www.cricbuzz.com (and optionally www.bcci.tv), then rerun.

## Data note
first_ball_recorded times (e.g. 14:00 for evening games, 10:00 for afternoon games) look like UTC, not IST, although the task says local IST. Dates are unaffected.
