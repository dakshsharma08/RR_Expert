# LOCKSTEP — Final verification report

Run 2026-11-23 ~05:30–06:10 UTC on branch `ccr-d3fe6a20-92epng`, against the production build. Every number below was produced by a command run in this pass.

**Verdict:** all critical issues found by testing and review are fixed and the app is safe to merge **as software**. Two things were **not** verified and cannot be from this sandbox: real Gemini API calls (no key) and a live deployment (Vercel/Supabase hosts are blocked). They are listed under §9 so the merge decision is made knowingly. The branch has **not** been merged.

---

## 1. Test results

| Suite | Command | Result |
|---|---|---|
| Unit + integration (Vitest) | `npx vitest run` | **249 passed, 3 skipped**, 16 files passed, 1 skipped |
| Browser E2E + accessibility (Playwright, production build) | `npm run build && npx playwright test --trace off` | **20 / 20 passed** (5 tests × 4 widths) |
| Typecheck | `npx tsc -b` | clean |
| Lint | `npx eslint .` | clean (0 errors, 0 warnings) |

**The 3 skipped tests** are the live Gemini smoke tests in `tests/live/gemini.live.test.ts`. They are reported as **SKIPPED, not passed**, because `GEMINI_API_KEY` is not set here:
1. `health resolves a real model`
2. `streams a plan that passes every hard check`
3. `writes a motivation line and answers a coach question with tools`

Run them with a key: `GEMINI_API_KEY=… npm run test:live`.

**Browser tests per width (360 / 390 / 430 / 1440):**
1. Full acceptance journey, brief §C3: guest → goal + deadline + zone → hours + working days → plan passes 7/7 code checks → edit one milestone → approve → live countdown → Studio template → preview shows real days left / next milestone / progress → export, PNG size read from the header → wallpaper guide → tick tasks, progress updates → refresh wallpaper reflects it → **offline reload, data persists**.
2. Android 1080×2400 export has native dimensions.
3. Living Wallpaper link: create → URL returns today's PNG → revoke → URL returns 404.
4. Countdown accuracy (new): countdown read from the page vs an independent calculation from the stored UTC deadline, within 2 minutes.
5. Every screen (12, in dark and light): axe-core WCAG 2.2 AA with no serious/critical violations, and no horizontal overflow.

Caveat: in E2E, Gemini is a **test fixture** (`e2e/mock-api.ts`, model name `gemini-e2e-mock`). It exercises the real server and the real SDK request path, but the model's answers are canned.

## 2. The 15 review findings (independent reviewer, all fixed)

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | High | Wallpaper routes unthrottled and unbounded (30 × 5 MB POSTs stored 150 MB; one 4096² GET cost 5.9 s CPU) | Own rate limits, 64 KB body cap (→ 413), hex-only colours, phone-sized custom dimensions, per-day PNG cache |
| 2 | High | AI rate limit bypassable with a forged `X-Forwarded-For` | Client IP uses Vercel's own headers there, otherwise `TRUST_PROXY` hops (default 0). Tested live: 25 spoofed IPs → 20 allowed, 6 blocked |
| 3 | Med | Mid-plan feasibility compared the whole plan with remaining capacity | Judges remaining work only; fixes recomputed |
| 4 | Med | Ticking a task re-opened a milestone completed by hand | Only un-ticking re-opens |
| 5 | Med | "Today's focus" could never finish | Today's done minutes count toward the budget |
| 6 | Med | Deleting a goal left its public wallpaper link live | Links are revoked first; failures keep the secret so Settings can retry |
| 7 | Low | Task delete/Undo lost logged minutes and skipped completion | `restoreTask` restores logs and re-syncs completion |
| 8 | Low | Adding/deleting milestones skipped goal-completion check | Re-checked on add, delete, restore |
| 9 | Low | Wizard accepted deadlines with no plannable working day | Blocked with a clear message |
| 10 | Low | No limit on deadline distance (9999-12-31 blocked the server 1.65 s) | Capped at 3 years; fix search scales with horizon |
| 11 | Low | Reminders mixed UTC date with local hours | Local date |
| 12 | Low | Coach failed above 20 milestones | Client sends at most 20 (open ones first) |
| 13 | Low | Living link counted days from a different start | Same start as the app |
| 14 | Low | Export "Refresh" didn't re-render | Re-renders when data or design changes |
| 15 | Low | Studio preview aspect hard-coded; autosave race between goals | Real device aspect; design saved with its goal id, flushed on switch/leave |

Each has a regression test or is covered by an existing E2E; see `tests/unit/{metrics,plan,liveChecks}.test.ts` and `tests/integration/{api,living}.test.ts`. One edge the reviewer found was **left as is** and documented: a 00:00 deadline on a day whose midnight falls in a DST gap (e.g. Santiago, September) counts one day late.

**Design critique (12 findings, separate pass):** applied the low-risk, high-visibility ones: toasts (one at a time, clear of the header, no white close disc), stat-chip type and wording, review bar copy, Focus top bar on phones, Studio inspector width ("Background" no longer cut off), export sheet (Download above the fold on phones, tidy filename), and the flat grey widget slabs removed from the cover and landing mockups. **Not applied** (visual consistency work, none functional): unifying heading/eyebrow type scale, one shared content-column width, mobile hero ring layout, Coach card eyebrow/chip grid, Insights chart palette, hiding the tab bar inside the mobile Studio, planning-screen skeleton → staged checklist.

## 3. Mobile responsiveness (360 / 390 / 430)

Evidence: `docs/evidence/screens/{360,390,430,1440}-*.png`, `docs/evidence/e2e/*.png`.
- All 12 screens × dark/light × 3 phone widths: **no horizontal scroll** (asserted), **no axe serious/critical violations** (asserted).
- Full journey passes at 360, 390 and 430, including the draggable bottom-sheet Studio and the export flow.
- Lighthouse mobile on the final build (simulated slow 4G):

| Page | Performance | Accessibility | Best practices | LCP |
|---|---|---|---|---|
| `/` landing | 94 | 100 | 100 | 0.8 s |
| `/new` | 99 | 100 | 100 | 0.8 s |
| `/guide` | 100 | 100 | 100 | 0.8 s |
| `/app` (empty dashboard, cold profile) | **85** | 100 | 100 | 4.2 s |

`/app` is below the 90 target: its first headline waits for the local database. Known limitation (§9).

## 4. Wallpaper dimensions and visual quality

Checked by an independent Python header reader, not the app's own code:

| File | Size | Expected | Result |
|---|---|---|---|
| `submission/lockscreen.png` | 1206 × 2622 (iPhone Pro) | 1206 × 2622 | ✅ 4.1 MB |
| `submission/lockscreen-android.png` | 1080 × 2400 | 1080 × 2400 | ✅ 3.4 MB |
| `submission/cover.png` | 2400 × 1600 (3:2) | 2400 × 1600 | ✅ 1.0 MB |

Also: the renderer's 70 tests check every template × themes × SE / Pro Max / Pixel at native size, content inside safe zones, and automatic ≥ 4.5:1 contrast scrims. I looked at the final images: text is crisp and legible, content sits inside the safe band, no private data (goal title only). **Visual caveats:** the exported wallpapers show *Day 1 · 0% done* because the goal is new, and their quote line is the app's own built-from-numbers sentence, not Gemini output (§5). Device sizes for 2026 phones came from search results (apple.com was blocked) and the safe zones are estimates; check on a real phone.

## 5. Gemini integration with real API calls — **NOT VERIFIED**

No `GEMINI_API_KEY` exists in this environment, so **no real Gemini request has been made**. What is true:
- `generativelanguage.googleapis.com` is reachable from the sandbox, but without a key nothing can be called. `ai.google.dev` (docs) is **not** reachable, so schema support could not be checked against Google's docs.
- 53 integration tests drive the real Express routes and the real `@google/genai` SDK over HTTP, with MSW answering as Gemini (streaming SSE, repair call, function-calling coach, retry/backoff, timeouts, cancel, rate limit, prompt-injection delimiters). These prove **our code and the SDK request shapes**; the mock responses are written from the documented format, **not captured from Google**.
- Without a key the app says so honestly ("Gemini isn't connected"), offers the manual plan, and never fakes AI output.
- **Highest-risk unverified item:** the response schema (`responseJsonSchema`) uses `enum` dates, `format: "date"`, `minimum`/`minItems`/`maxItems` and `propertyOrdering`. If Gemini rejects any of these, planning fails. This pass removed one such risk (a nullable union type). First thing to run after adding a key: `npm run test:live`, then one plan in the app.
- The submission description is therefore marked `[PENDING REAL GEMINI RUN …]` and `submission/CHECKLIST.md` says re-run `npm run submission` with a key.

## 6. Countdown accuracy and milestones

- `tests/unit/time.test.ts` (19): DST gap and overlap (New York, Berlin), leap day, month ends, zone change, past / same-day / midnight deadlines.
- Reviewer probed DST and extreme zones (New York, St John's, Lord Howe, London, Kiritimati): correct.
- Browser: countdown matches an independent calculation from the stored UTC deadline (within the 1-minute refresh) at all 4 widths.
- Milestones: create / edit ("Edited by you") / delete + Undo / reorder / live re-validation / approve / tick tasks → milestone and goal completion → progress, streak, pace, insights. Covered by unit tests, the acceptance journey and review-fix tests.

## 7. Security audit

| Check | Result |
|---|---|
| Secret patterns (Google key, private key, JWT, GitHub token) in tracked files | none |
| Same patterns across all 24 commits on the branch | none |
| Tracked env files | only `.env.example`, and every secret there is empty |
| `.env` ignored | yes; no `.env` exists |
| `VITE_` variables | only Supabase URL + **anon** key (public by design) |
| Client code reading `process.env` / API key / service role | none |
| Built bundle scan (`check-bundle-secrets`) | pass (55 files). **Caveat:** with no key set it matches patterns only; I proved earlier that it fails on a planted key |
| Production server logs mention key/secret/token | 0 lines |
| Security headers | CSP (`frame-ancestors 'none'`), HSTS, nosniff, COOP/CORP, `Referrer-Policy: no-referrer`; no `X-Powered-By` |
| CORS from an unlisted origin | no `Access-Control-Allow-Origin` returned |
| AI routes without key | `503 AI_NOT_CONFIGURED`, no stack trace or details leaked |
| Rate limit vs 25 spoofed IPs | 20 allowed, 6 blocked (not bypassable) |
| Wallpaper API | oversized body → 413; unknown token → 404; tokens 192-bit random, only SHA-256 hashes stored, wrong secret → 404 |
| `DELETE /api/account` | needs a valid user token; verified server-side before deleting that user only (2 tests) |
| Supabase RLS | the real migration run in PGlite: 16 tests prove cross-user reads, writes and inserts fail and `anon` sees nothing |
| `npm audit --omit=dev` | **0** vulnerabilities |
| `npm audit` (all) | 4 moderate, all one chain in dev tooling: `vite-plugin-pwa → workbox-build → glob/minimatch`. Build-time only, not shipped. npm's suggested fix is a *downgrade* (`vite-plugin-pwa@1.1.0`), so I did not apply it |

Not tested: a real Supabase project (blocked host), Upstash, and a deployed environment's header behaviour.

## 8. Production build

`rm -rf dist dist-server && npm run build` → success in **10.6 s**: typecheck → Vite build (79 precache entries, 2.3 MB) → API bundle for Vercel → secret-leak check. The bundled API (`dist-server/app.mjs`) starts under plain Node ESM and answers `/api/health` 200. `vercel.json` + `api/index.js` are ready, but **no deployment was made**.

## 9. Known limitations and remaining risks

**Needs you (cannot be done from this sandbox):**
1. **Real Gemini run.** Add `GEMINI_API_KEY`, run `npm run test:live`, then `npm run submission -- --url <live-url>` to regenerate the three submission images and description from a real plan. Replace `[DEVELOPER: write your own lesson]` yourself.
2. **Deploy** (`docs/SETUP.md`, ~5 min on Vercel; Cloud Run fallback documented, needs `TRUST_PROXY=1`). Set `GEMINI_API_KEY`, `ALLOWED_ORIGINS`, `PUBLIC_APP_URL`, and ideally Upstash (otherwise rate limits and Living Wallpaper links live in memory on serverless; the app warns about this).
3. **Supabase** (optional): run the migration, add the redirect URL, set the two public env vars. Sync and account deletion are untested against a real project.

**Known limitations:**
- Empty-dashboard performance 85 (cold profile); 3D hero and Studio chunks are large but lazy/not precached.
- Remaining design-critique items in §2 (consistency polish, not functional).
- Web Push is not built (needs VAPID keys); in-app and local notifications work.
- Living Wallpaper text is Latin-only on the server renderer; safe zones are estimates.
- Wallpapers need a manual one-time setup on the phone: a website cannot change a lock screen (the app says so).
- The Santiago DST-midnight edge (§2).
- **Repository weight:** the branch's history carries **~490 MB** (439 MB from full-size sample renders the renderer agent committed before I untracked them, ~45 MB from regenerated screenshots). The final tree is **38 MB**. History was not rewritten (no-rewrite rule). **Use a squash merge.**
- Evidence screenshots show test-fixture text ("Fixture…", `gemini-e2e-mock`); they are test data, not Gemini output.

## 10. Merge safety

- Branch is 24 commits ahead of `claude/rr-clutch-index-d4bfp2`; **304 files added, 0 existing files modified or deleted, nothing outside `lockstep/` touched**. The cricket project is untouched.
- All suites above are green on the final commit; the branch is pushed and not merged.
- **Recommendation:** safe to merge as a **squash** merge. Do the real-Gemini run before treating the submission as final.
