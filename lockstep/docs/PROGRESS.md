# LOCKSTEP — Progress (single source of truth)

**Deadline:** 2026-11-23 23:59 UTC (system clock is UTC). Code freeze 22:00 UTC; finalize at 22:45 UTC.
**Project root:** `lockstep/` inside the `RR_Expert` repo · branch `ccr-d3fe6a20-92epng` (see DECISIONS.md).

## Current phase
**P6 done (Tier 1 built and tested). Deploy is BLOCKED by the environment (see below).** Next: Tier 2 Living Wallpaper server route, then Tier 3.

## Environment facts (checked 03:23 UTC)
- No `GEMINI_API_KEY` → AI is built and tested against MSW mocks **in tests only**; the live smoke test reports **SKIPPED**. The running app shows an honest "Gemini isn't connected" state and offers the manual plan path.
- Network policy blocks `api.vercel.com` and `supabase.com` → no deploy, no Supabase. Exact steps are in `docs/SETUP.md`. `generativelanguage.googleapis.com` and npm are reachable.

## Done (with evidence)
| Item | Command | Result |
|---|---|---|
| Countdown engine: DST gap/overlap, leap day, month ends, zone change, past/same-day/midnight deadlines | `npx vitest run tests/unit/time.test.ts` | 19/19 pass |
| Plan schema, deterministic validation, capacity, code feasibility, one-tap fixes | `npx vitest run tests/unit/plan.test.ts` | 13/13 pass |
| Design tokens: every text/background pair ≥ 4.5:1 in dark and light | `npx vitest run tests/unit/tokens.test.ts` | 37/37 pass |
| Wallpaper renderer (8 templates × 6 themes, native sizes from IHDR, scrims, safe band, determinism) | `npx vitest run tests/unit/contrast.test.ts tests/unit/wallpaper.test.ts` | 70/70 pass · contact sheets in `docs/evidence/wallpapers/_sheet-*.png` |
| Insight math, streaks, .ics escaping | `npx vitest run tests/unit/insights.test.ts` | 5/5 pass |
| Gemini API (SSE plan + repair, coach function calling, motivation, weekly insight, rate limit, timeouts, retry, injection defence, cancel) with MSW-mocked Gemini | `npx vitest run tests/integration` | 43/43 pass |
| Live Gemini smoke test | `npm run test:live` | **SKIPPED** (no key), not passed |
| Full suite | `npx vitest run` | 187 passed, 3 skipped |
| Typecheck + lint | `npx tsc -b && npx eslint .` | clean |
| Secret leak guard (fails the build if the key reaches `dist/`) | `node scripts/check-bundle-secrets.mjs` (planted-key test) | fails as intended on a planted key; passes on the real build |
| **Acceptance test §C3** at 360/390/430/1440 (guest → goal → plan → edit → approve → countdown → studio → template → preview data → export 1206×2622 checked → guide → tasks → refresh → offline reload) + Android 1080×2400 export | `npm run build && npx playwright test --trace off` | **8/8 pass** · screenshots `docs/evidence/e2e/*.png` (Gemini = test fixture model `gemini-e2e-mock`) |
| Vercel function bundle runs in plain Node ESM | `node scripts/build-server.mjs` + import → `/api/health` 200 | pass |
| **Submission assets v1** | `node scripts/submission.mjs` | lockscreen.png 1206×2622 ✓, lockscreen-android.png 1080×2400 ✓, cover.png 2400×1600 ✓, description 338 chars. Mode **manual-no-key**: the Gemini sentence is marked PENDING (see `submission/CHECKLIST.md`) |

## Tier status
- **Tier 1:** built and tested end-to-end. Deploy **blocked** (no Vercel/Firebase access from this sandbox); `docs/SETUP.md` has the 5-step deploy.
- **Tier 2:** dashboard ✓, adaptive coach (function calling + diff + Accept/Reject) ✓, multimodal intake (PDF/image ≤10 MB inline data, voice input) ✓, insights ✓, PWA/offline + update toast ✓ (offline reload verified in E2E), Living Wallpaper client ✓. **Next:** the server route `/api/wallpaper`.
- **Tier 3:** not started (3D hero, Supabase auth/sync + RLS, achievements, AI backgrounds).

## Next step
Implement `/api/wallpaper` (create/update/revoke + GET today's PNG via `server/wallpaper/node-render.ts`, Upstash or file store), with an integration test.

## Known issues
- No real-Gemini run has happened (no key). After adding a key: `npm run test:live` and `npm run submission -- --url <live-url>`.
- 128 MB of sample renders were committed once before being untracked (see DECISIONS.md).
