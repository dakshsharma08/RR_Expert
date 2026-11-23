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
