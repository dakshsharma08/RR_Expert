# LOCKSTEP — Progress (single source of truth)

**Deadline:** 2026-11-23 23:59 UTC (system clock is UTC). Code freeze 22:00 UTC; finalize at 22:45 UTC.

## Current phase
P1–P3 in progress (scaffold, tokens, countdown engine).

## Environment facts (checked 03:23 UTC)
- No `GEMINI_API_KEY` in the environment → every AI feature is built and tested against mocks (tests only), and the live smoke test reports **SKIPPED**.
- Network policy blocks `api.vercel.com` and `supabase.com` → the deploy and Supabase steps are documented in `docs/SETUP.md` for the developer to run.
- `generativelanguage.googleapis.com` and the npm registry are reachable.

## Done (with evidence)
| Item | Command | Result |
|---|---|---|
| Countdown engine (DST gap/overlap, leap day, month ends, zone change, past/same-day/midnight deadlines) | `npx vitest run tests/unit/time.test.ts` | 19/19 pass |
| Plan schema + deterministic validation + capacity + feasibility + fixes | `npx vitest run tests/unit` | 32/32 pass |

## Next step
Server Gemini engine (agent), wallpaper renderer (agent), frontend shell + wizard (main).

## Known issues
- None yet.
