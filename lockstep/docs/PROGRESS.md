# LOCKSTEP — Progress (single source of truth)

**Deadline:** 2026-11-23 23:59 UTC (system clock is UTC). Code freeze 22:00 UTC; finalize at 22:45 UTC.
**Project root:** `lockstep/` inside the `RR_Expert` repo · branch `ccr-d3fe6a20-92epng` (see DECISIONS.md).

## Current phase
**P9 (bug sweep).** Tiers 1, 2 and 3 are built and tested. Deploy is **BLOCKED** by the environment (no Vercel/Firebase/Supabase access, no Gemini key); everything is ready for the developer (`docs/SETUP.md`). Last update: 05:05 UTC.

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
| Living Wallpaper server (hashed token + secret, daily server render, update, revoke → 404, photos stripped) | `npx vitest run tests/integration/living.test.ts` + E2E "Living Wallpaper link" | 3/3 + E2E pass at 4 widths |
| AI backgrounds (image-model discovery from the shared listing, abstract/no-people prompt, auto-hide after failure) | `npx vitest run tests/integration/background.test.ts` | 5/5 pass (mocked) |
| Account deletion (verifies caller token, service-role delete, rows cascade) | `npx vitest run tests/integration/account.test.ts` | 2/2 pass |
| Supabase RLS: real migration in PGlite; cross-user reads/writes/inserts fail; anon sees nothing | `npx vitest run tests/unit/rls.test.ts` | 16/16 pass |
| Cloud sync merge (LWW, deletions, mapping, error sentences) | `npx vitest run tests/unit/sync.test.ts` | 20/20 pass |
| Achievements (only from real data) | `npx vitest run tests/unit/achievements.test.ts` | 3/3 pass |
| Trimmed-scope feasibility (full goal judged, not the trimmed plan) | `npx vitest run tests/unit/plan.test.ts` | 15/15 pass |
| **Accessibility sweep**: axe-core (WCAG 2.2 AA, serious/critical) on 12 screens, dark + light, at 360/390/430/1440 | `npx playwright test e2e/screens.spec.ts` | pass at all 4 widths · `docs/evidence/screens/` |
| **Lighthouse mobile** (simulated slow 4G) | `npx lighthouse http://localhost:4173/<path>` | landing perf 93–97 / a11y 100 / BP 100; /new 95–98 / 100 / 100; /guide 96 / 100 / 100; empty /app on a cold profile 84–86 / 100 / 100 |
| 3D hero (desktop, lazy, not precached) renders without errors | Playwright + SwiftShader screenshot | pass |
| All unit + integration tests | `npx vitest run` | **238 passed, 3 skipped (live Gemini)** |
| All E2E | `npm run build && npx playwright test --trace off` | **16/16 pass** |
| **Submission assets v1** | `node scripts/submission.mjs` | lockscreen.png 1206×2622 ✓, lockscreen-android.png 1080×2400 ✓, cover.png 2400×1600 ✓, description 338 chars. Mode **manual-no-key**: the Gemini sentence is marked PENDING (see `submission/CHECKLIST.md`) |

## Tier status
- **Tier 1:** ✅ built and tested end-to-end. Deploy **blocked**: no Vercel/Firebase access from this sandbox. `docs/SETUP.md` has the 5-step deploy, and `api/index.js` imports a pre-bundled API, verified in plain Node ESM.
- **Tier 2:** ✅ dashboard, adaptive coach (function calling + old→new diff + Accept/Reject), multimodal intake (PDF/image ≤10 MB inline, voice), insights (Recharts + weekly AI summary), PWA (offline reload verified, update toast), Living Wallpaper URL (server + Shortcuts guide + revoke).
- **Tier 3:** ✅ optional Supabase auth + sync + RLS (PGlite-proven), 3D landing hero, AI backgrounds (only when an image model exists), achievements, in-app + local notifications. Web Push is not built: it needs VAPID keys and a push service, so it's documented only.

## Next step
Act on the independent code review, then re-run every suite and regenerate the submission assets.

## Known issues
- No real-Gemini run has happened (no key). After adding a key: `npm run test:live` and `npm run submission -- --url <live-url>`.
- 128 MB of sample renders were committed once before being untracked (see DECISIONS.md).
