## PART 7 — THE DASHBOARD (Deliverable A)

The dashboard is the centrepiece. It should feel simple at first glance and reward every tap with more depth.

### Design principle: three depths on every tab
1. **The 10-second layer:** one headline sentence in plain words that states the insight.
2. **The 2-minute layer:** one or two charts that prove it, each with its "So what for RR" line.
3. **The deep-dive layer:** full tables, intervals, splits, and method notes behind a "Show detail" control.

A global Simple ⇄ Detailed switch (default: Simple) hides or shows the deep-dive layer everywhere. Simple mode alone must be enough for a selector to act. Detailed mode must be enough for an analyst to audit.

### Build constraints
- One HTML file. All code and data inlined. No CDN, no external requests. Works offline. Under 5 MB.
- Charts are hand-built in inline SVG or canvas.
- Embed pre-aggregated tables (player × season × phase × pressure level × innings) for in-scope players, never the raw ball-by-ball. The only ball-level data is for the showcase matches in the Pressure Index tab.
- A build script injects every number from `outputs/tables/`. Nothing is typed by hand.

### Build order
1. Data payload script (final tables → compact JSON)
2. Shell and design system: colours, type scale, cards, tooltips, filter bar, chart helpers
3. Tabs, built against that system (in parallel where possible)
4. One integration pass into the single file
5. Testing (see the end of this part)

### Look and feel
- Dark theme in RR pink and royal blue. Large text (16px+ body on mobile). Tap targets 44px+.
- Mobile-first: design and test at 380px wide, then scale up. Tables become cards on small screens. Nothing scrolls sideways except inside its own container.
- Colour-blind safe: never rely on colour alone. Pair it with labels, shapes, or patterns. Pink and blue can look alike to some viewers, so check the palette with a colour-blindness simulation.
- Tooltips open on tap as well as hover. Every metric name has an "i" with its one-line meaning.
- Every chart has: a title that states the takeaway, a subtitle saying what is plotted, labelled axes with units, a legend, the sample size, and the "So what for RR" line. Bar charts start at zero. Any other cut axis is labelled as cut.
- 80% intervals appear as whiskers or bands on every ranked metric. When two players' intervals overlap, the dashboard says "too close to call" and does not imply a winner.
- Small samples are greyed and tagged. They are never hidden and never ranked as if solid.
- Every external fact on screen carries its VERIFIED or [ASSUMPTION] tag.
- No player photos.

### Global controls
Sticky on desktop. On mobile they fold into a "Filters" sheet, with chips for active filters and a reset button.
- Filters: role, phase, season, pressure level, Indian/overseas. Plus an "available at auction only" toggle and player search.
- Filters re-slice the descriptive stats. The Clutch Score is computed once with the full method and does not change with filters. Say this on screen so nobody misreads a filtered view.
- An empty result explains itself (for example, "No bowlers with 60+ high-pressure balls in this slice").
- Tapping a player name anywhere opens that player's profile card.
- The open tab and selected player are kept in the URL hash, so a view can be bookmarked or shared.

### Tab 1 — Summary (the page a selector may never leave)
- Project name, one-line thesis, 5-line executive summary
- KPI tiles: seasons, matches, and balls analysed; last match date in the data; players scored; backtest hit rate vs the naive baseline
- Must-Back cards: clutch score with interval, one-line reason, price band, risk tag
- Hero chart: the shortlist ranked by clutch score with interval whiskers, marked by tier
- Before → after strip: RR's biggest gaps and how the Plan A picks close them
- "How to read this dashboard" in 3 lines, and the count of assumptions with a link to the ledger

### Tab 2 — Pressure Index (what "pressure" means, shown and not just told)
- A 3-line plain explanation and the one-line formula
- Match explorer: choose one of 6–10 showcase close matches from the data → the win-probability line across the match with a pressure strip beneath it. Tap any ball to see the situation, its pressure score, and who gained or lost WPA.
- Pressure map: heatmap of average pressure by over × wickets down, with a 1st / 2nd innings toggle
- Distribution of pressure scores with the Low / Medium / High cut-offs marked and the share of balls in each
- The example balls table from Step 1
- Detail: calibration chart and Brier score in plain words; the component correlation check; top-20 overlap across the three pressure definitions

### Tab 3 — Leaderboard
- Batters | Bowlers | All-rounders switch
- Sortable table (cards on mobile): rank, player, role, Indian/overseas, age, clutch score with interval bar, high-pressure sample size, runs above expected or runs saved, WPA, pressure drop, consistency, availability tag, risk tag
- "What the method adds" chart: rank by clutch score vs rank by naive strike rate or economy, showing who rises and who falls
- Detail: skill-vs-steadiness scatter (pressure performance against season-to-season consistency; bubble size = sample) and the full metric columns

### Player profile card (opens from any player name)
- Header: name, role, Indian/overseas, age, latest team in the data, availability, price band, risk tags
- Clutch score dial with its 80% interval, rank and percentile within role, and a one-sentence plain-English verdict generated from the numbers
- High vs Low pressure side by side: the core stats with sample sizes, and the pressure drop
- Season trend: pressure performance by season with an interval band and the league-average line
- Splits: by phase; batters vs pace / vs spin and chasing / setting; bowlers vs left- / right-handers and at the death
- Receipts: his three highest-WPA innings or spells (match, date, situation, what he did). These are the moments a selector will remember.
- Similar players: the three closest profiles (this feeds Plan B)
- Fit for RR: the gap he fills
- Caveats: sample size, interval width, assumptions

### Tab 4 — Player Compare
- Choose 2–4 players. Warn when their roles differ.
- Radar on 6–8 axes, each a 0–100 percentile within role so the axes are comparable, with every axis defined
- Under the radar, a side-by-side table of the real numbers with intervals. The radar gives the shape; the table gives the truth. A value is marked "better" only when the intervals don't overlap.
- Season-trend overlay and a one-sentence verdict built from the data

### Tab 5 — Squad Fit (before / after)
- RR's current group by role slot, with overseas count, left/right balance, and age profile (each fact tagged)
- Gap meter: RR vs the league under pressure, by phase, for batting and bowling
- Before / Plan A / Plan B switch: phase-by-phase strength bars, overseas slots used, purse used
- Lineup card: best XI in batting order, Impact Player, bench, and a 20-over bowling plan by phase
- One honest line: what RR still lacks after the auction

### Tab 6 — Auction Board
- Tier columns: Must-Back | Value Picks | Hidden Gems. Cards show clutch score with interval, price band, walk-away price, and risk tag (price fields tagged [ASSUMPTION]).
- Budget builder: tap players into a basket. It shows purse left, overseas slots, and squad size live, and warns when a limit breaks. Presets for Plan A and Plan B.
- Plan B table: "If X goes past ₹Y crore → switch to Z; what RR loses"
- Value map: clutch score against expected price, with the bargain zone shaded
- Contrarian picks, Unsung hero, and Who not to chase, each with its one stat and one line, respectful in tone

### Tab 7 — Method & Proof
- The method as a six-box flow (data → win probability → pressure index → fair comparison → reliability → clutch score), one line per box
- The clutch score formula in one line, the weights table, and "why not a simple average" in 3 lines
- Proof: the backtest by season against the naive baseline, weight sensitivity, and pressure-definition robustness, each with an honest one-line verdict
- Data Notes table; facts ledger (Fact | Value | VERIFIED or ASSUMPTION | Source | Date); limitations; glossary; the Step 8 audit table
- Build stamp: last match date in the data, build date, random seed

### Test before you show me
- Open the file in a headless browser with the network off. Capture every tab at 380px and at desktop width, and look at the screenshots yourself.
- No console errors, no external requests, no sideways scroll, no clipped or overlapping text. File under 5 MB.
- Every filter changes what it should.
- Pick five players at random and confirm that every number on their cards matches `outputs/tables/`.
- Run the cold reader on each tab in Simple mode and the critic on the whole file. Fix what they find.
- If you can't run a headless browser here, say so and give me an exact checklist to run by hand.

At the dashboard checkpoint, give me the file path, the file size, and a screenshot of each tab at 380px.
