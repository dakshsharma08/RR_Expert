# Venue verification log, seasons 2022-2024 (run 2026-11-17)

## Outcome
All 219 matches are UNKNOWN. No venue was recorded, because no source page could be read. Nothing was guessed or inferred.

## Sources tried
| URL | Result |
|---|---|
| https://en.wikipedia.org/wiki/2022_Indian_Premier_League (WebFetch) | FAILED: getaddrinfo ENOTFOUND (host not in session network allowlist) |
| https://www.espncricinfo.com/series/indian-premier-league-2022-1298423/match-schedule-fixtures-and-results (WebFetch) | FAILED: ENOTFOUND |
| https://www.iplt20.com/matches/results/2022 (WebFetch) | FAILED: ENOTFOUND |
| https://www.cricbuzz.com/cricket-series/4061/indian-premier-league-2022/matches (WebFetch) | FAILED: "unable to fetch from www.cricbuzz.com" |
| https://www.wisden.com/series/tata-ipl-2022/... schedule page (WebFetch) | FAILED: ENOTFOUND |
| https://www.wikiwand.com/en/articles/IPL_2022 (WebFetch) | FAILED: ENOTFOUND |
| https://www.mykhel.com/cricket/ipl-schedule-results-s4/?season=2022 (WebFetch) | FAILED: ENOTFOUND |
| WebSearch "IPL 2022 full schedule results venue match list" | Worked, but returns only a short summary with links, no per-match venues. Not usable as a verification source. |

Not attempted: raw curl or proxy workarounds (the tool environment says not to try more hosts after DNS failures; a proxy-status check was denied by the permission classifier). Not tried for 2023 and 2024 because the same host block applies.

## Conflicts
None found (no per-match data obtained).

## UNKNOWN matches
All 74 (2022), 74 (2023) and 71 (2024). Reason: network policy blocks every reputable source host. General facts from search summaries (2022 league stage in Mumbai and Pune; playoffs in Kolkata and Ahmedabad) cannot be assigned to individual matches under rule 3.

## To resolve
Allow these hosts in the environment's Network access settings (Allowed domains), then re-run: en.wikipedia.org, www.espncricinfo.com, www.cricbuzz.com, www.iplt20.com.
