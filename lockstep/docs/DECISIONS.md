# Decisions log

One line per ambiguous choice: what we picked and why. Newest at the bottom.

- **Project folder:** LOCKSTEP lives in `lockstep/` inside the existing `RR_Expert` repo. The repo already holds an unrelated cricket-analytics project (and a GitHub Pages site in `/docs`), so building at the root would mix the two projects and overwrite their `docs/`. Every path in the brief (`/docs`, `/submission`) is relative to `lockstep/`.
- **Git branch:** work is committed on `ccr-d3fe6a20-92epng`, because this cloud session is only allowed to push to that branch. The brief asked for `lockstep-build`; the cloud session rules override it.
- **TypeScript 6.0.3, not 7.x:** typescript-eslint supports `<6.1`, and TS 7 is the new native compiler, which lint tooling doesn't support yet.
- **React Router 7.18 (not 8.x):** v7 is the long-term-stable line with the library-mode API we use; v8 adds nothing we need.
- **@playwright/test 1.63.0:** this matches the Chromium build that is pre-installed in the environment (so no browser download).
- **Model choice:** if `GEMINI_MODEL` is empty, the server lists the models the key can use and picks the newest *stable* `gemini-X.Y-flash`. If listing fails, it uses Google's `gemini-flash-latest` alias.
- **DST rules:** a local time that falls in a DST gap moves forward by the gap (02:30 → 03:30). An ambiguous time in a DST overlap uses the earlier instant. This is the same as Temporal's `compatible` option. The UI shows a note when either happens.
- **Midnight deadline:** a deadline at exactly 00:00 local counts as due at the end of the previous day, for day counting and the due-today state.
- **"After today" milestone rule:** milestone dates must be strictly after today, except when the deadline itself is today (then today is the only valid date).
- **Capacity:** working days from today to the deadline day, both inclusive, × hours/day. Today counts because you can start right away.
- **Capacity vs. hard errors:** date, order and working-day violations are *hard* errors that trigger the single repair call. Going over capacity is a *feasibility signal*: the plan is still shown, the code's feasibility becomes "Unrealistic" with the numbers, and the one-tap fixes appear. A plan that doesn't fit is still useful information, and refusing to show it would hide why.
- **Code feasibility thresholds:** ≤85% of capacity = Achievable, ≤100% = Tight, >100% = Unrealistic.
- **Pace:** "ahead" or "behind" when task % and time % differ by more than 5 percentage points; otherwise "on track".
- **Bottom sheet:** dropped Vaul and wrote a small non-modal sheet (`src/components/ui/bottom-sheet.tsx`). Vaul 1.1.2 always mounts Radix Dialog in *modal* mode, which hides the rest of the Studio (the header, the Export button, the nav) from screen readers with `aria-hidden`. An always-open studio sheet must not do that. Library failed once on accessibility, so we used the simpler option.
- **Sample renders:** the renderer agent's 52 full-size sample PNGs (~128 MB, grain makes them hard to compress) were committed locally by mistake. They're now untracked and gitignored, and the small `_sheet-*` contact sheets stay as evidence. Following the 'no history rewrites' rule, the earlier commit was **not** rewritten, so those blobs stay in branch history. The developer can squash the branch before merging if repo size matters.
- **No GSAP:** the hero's motion is a slow Three.js rotation plus a little Framer Motion. GSAP would add a library with no job to do, which the brief rules out.
- **3D hero gating:** the 3D ring loads only on ≥768px screens with WebGL2, without reduced motion or Save-Data, after the browser is idle. It's excluded from the offline precache. Everyone else sees the static SVG ring.
- **Performance budget:** to reach mobile Lighthouse 90+, the landing paints its headline without waiting for JS animation (no opacity fade on LCP text). The phone mock draws after idle. The app shell and reminders are lazy. The two hero fonts are preloaded. Icons and vendors are grouped into a few cacheable chunks. Measured: landing 93–97, /new 95–98, /guide 96. The empty dashboard on a cold profile scores 84–86, because its first headline waits for IndexedDB; recorded honestly rather than gamed.
- **AI backgrounds:** offered only when the key's model list includes an image-capable Gemini model (`gemini-X.Y-(flash|pro)-image[-preview]`; set `GEMINI_IMAGE_MODEL` to override). If a call fails with that model, the feature hides itself for an hour. The prompt forbids text, people and faces. Images are saved as local blobs, like uploads.
- **Model listing shared:** the text-model and image-model resolvers share one cached `models.list()` call, so `/api/health` lists models at most once per hour.
- **Living Wallpaper secrets:** the server stores only SHA-256 hashes of the token and secret. A wrong secret returns 404, not 403, so links can't be probed. Revoking deletes the record.
- **Status colours in light mode:** darkened (`#2f6b3d`, `#7a4f00`, `#963d32`) so badge text passes AA on its own tinted background. axe-core caught the original values.
