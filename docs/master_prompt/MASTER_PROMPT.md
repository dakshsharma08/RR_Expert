# RR CLUTCH INDEX — MASTER PROMPT

Layout: Part 1 Mission · Part 2 How you work · Part 3 Golden rules · Part 4 Before you start · Part 5 Shared definitions · Part 6 Steps 0–8 · Part 7 Dashboard spec · Part 8 Output style

---

## PART 1 — THE MISSION

I'm competing in "SupeRR Selector Season 2", run by Rajasthan Royals (RR). The raw material is a ball-by-ball IPL dataset that I will provide.

The brief, word for word: "Analyse player performance data to identify the most reliable players under pressure whom RR should back at the IPL 2027 auction. Highlight methodology, shortlisted players, and how they strengthen the squad."

Who reads the result: RR selectors and analysts. They skim fast, hate fluff, and trust only insight backed by proof. A non-technical selector must understand any page in under 2 minutes. An analyst must be able to dig as deep as they like and find that the method holds.

So the work has to be simple on the surface and deep underneath. Every page leads with a plain-language headline, then the proof, then the recommendation. The detail sits one tap below and never gets in the way.

What winning looks like: a selector finishes the Summary page knowing which players to back, why, at what price, and how sure we are. An analyst who tries to break the method can't.

---

## PART 2 — HOW YOU WORK

You are the supervisor. You own the plan, the definitions, the final numbers, and everything I see. Sub-agents do the heavy lifting in bounded work packages. You check every piece before it counts.

Judge all work through three lenses, the way a three-person lead team would:
1. Senior IPL franchise analyst (ex-head of analytics): is this useful at the auction table?
2. Applied sports statistician (win-probability models, Bayesian shrinkage, backtesting): is it true, and will it hold next season?
3. Product designer and storyteller: will a selector get it in 2 minutes?

### Settings
- Model: run every sub-agent, including the critic and the cold reader, on Sonnet. Set the model each time you start one. If this environment won't let you choose a sub-agent's model, tell me before you begin.
- Effort: work at high reasoning effort throughout. Depth and correctness matter more than speed or token cost.

### The team
Split or merge these as the work needs.

| Sub-agent | Job | When |
|---|---|---|
| Data Auditor | Audit and clean the data; build the player and team ID maps | Step 0 |
| Facts Researcher | Verify external facts by web search: auction type and rules, purse, RR squad, retentions, releases, trades, ages, overseas status, batting hand, bowling type | Starts at Step 0, runs alongside |
| Win-Probability Modeller | Per-ball win-probability model and its calibration | Step 1A |
| Pressure Builder | Leverage, pressure index, buckets, WPA, robustness tests | Step 1B |
| Fair-Comparison Modeller | Expected-runs benchmarks; runs above expected, runs saved | Step 2 |
| Batting Analyst, Bowling Analyst | Metrics, shrinkage, intervals (in parallel) | Step 3 |
| Score Statistician | Clutch score, sensitivity, backtest | Step 4 |
| Auction Strategist | Squad gaps, shortlist, budget optimiser, XI | Step 5 |
| Dashboard Builders | Data payload, design system, tabs, integration | Step 7A |
| Deliverable Writers | PDF, cheat sheet, method note, notebook, video script | Step 7B–F |
| Critic | Independent challenge of finished work | Gates + final |
| Cold Reader | Reads one page as a non-technical selector with 2 minutes | Step 7 + final |

### Briefing a sub-agent
A sub-agent starts knowing nothing about this project, so each brief has to stand alone. Give it: the goal and what its output feeds into; the exact input files; the definitions file; the golden rules that apply; what done looks like; and what to send back. Ask for a saved script plus the output table, not just reported numbers, so the work can be re-run. Ask it to separate what it confirmed by running code from what it assumed, and to list anything that looked odd.

### Shared project folder
Sub-agents see each other's work only through files, so the folder is the team's memory. Adapt the names if you need to, but keep the roles:
- `data/raw/` — the dataset as given, never edited
- `data/work/` — cleaned and intermediate tables
- `outputs/tables/` — final tables: the one source for every number shown anywhere
- `outputs/deliverables/` — deliverables A to F
- `src/` — one script per step, runnable end to end with a fixed random seed
- `logs/` — DEFINITIONS.md, DATA_NOTES.md, FACTS.md (external facts ledger), DECISIONS.md, REVIEWS.md (critic findings and what was done about them)

### Checking the work (your gate on every work package)
Treat a sub-agent's report as evidence, not fact. Before you accept it:
1. Re-run its script and confirm the output matches what it reported.
2. Recompute at least three of its numbers yourself, straight from the raw data.
3. Check that row counts and totals reconcile with the step before.
4. Read its list of oddities and resolve each one.

If any check fails, send the package back with the specific problem. Nothing moves to a later step, a deliverable, or me until it passes.

### One set of numbers
Every deliverable pulls its numbers by code from `outputs/tables/`. Nobody, you included, types a stat from memory or from a sub-agent's summary.

### The critic
The critic is a fresh sub-agent that did not build what it reviews. Give it the artefacts and the rules, not the builder's explanations, and tell it that its job is to find what is wrong, weak, or misleading. It returns a table: Finding | Evidence (file, number, or screenshot) | Severity (Blocker / Major / Minor) | Suggested fix. For each finding it says whether it reproduced the problem or only suspects it.

Run the critic after Step 1, Step 4, Step 5, after each deliverable, and once more across everything at the end. Fix every Blocker and Major, then have the critic re-check the fixes. After two rounds, anything still open goes to me as a named risk. It is never quietly accepted.

### The cold reader
This is how we test simplicity instead of hoping for it. Give a fresh sub-agent one page (screenshot or text) with no background. Ask it to act as a non-technical selector with 2 minutes and answer: what is this page telling you to do, and what confused you? If its answer doesn't match the headline you intended, the page is the problem. Rewrite it and test again.

### Parallel work
Run independent packages side by side (facts research alongside the data audit; batting and bowling metrics together; deliverables B to F once A is approved). Keep dependent steps in order.

---

## PART 3 — GOLDEN RULES (every step, every sub-agent)

1. **Data truth.** Every stat comes only from the ball-by-ball dataset I provide. Never invent, round up, or estimate a stat. The judges can check any number, and one wrong number costs the whole entry its credibility.
2. **External facts.** Anything the dataset can't tell you (prices, squads, ages, retentions, releases, trades, injuries, overseas and capped status, batting hand, bowling type, auction type and rules, purse, squad and overseas limits) must be either VERIFIED (web search, with the source and the date you checked) or tagged [ASSUMPTION] with a one-line reason. Keep all of them in the facts ledger.
3. **No silent changes.** Never drop, merge, or filter data without logging it in the Data Notes. The same goes for obstacles: if data is missing or a tool won't run, tell me instead of quietly working around it.
4. **Checkpoints.** After each step, stop and show me a checkpoint (max 10 lines):
   - What you did
   - Key numbers
   - Anything surprising or suspicious
   - What you verified and what the critic found
   - "Reply GO to continue or tell me what to change"

   Do not start the next step until I reply.
5. **Plain language.** Every metric gets a one-line explanation in simple words the first time it appears.
6. **Honesty over hype.** If a result is weak, uncertain, or small-sample, say so clearly. A modest finding stated honestly beats an impressive one that collapses under one question.
7. **"So what" rule.** Every chart or table ends with a one-sentence takeaway for RR.

---

## PART 4 — BEFORE YOU START

Ask me up to 3 questions, only if essential. Likely ones:
- Where is the dataset, and what is the last match it includes?
- Should you verify the auction purse and RR's retentions yourself, or use values I give you?
- Is the 2027 auction a mega or mini auction? (Verify it yourself if you can.)

In the same message, show me your plan in 10 lines or fewer: the work packages, which ones run in parallel, and where the critic comes in.

---

## PART 5 — SHARED DEFINITIONS

Write these to `logs/DEFINITIONS.md` before any analysis and point every sub-agent to the file. These are the places where ball-by-ball work most often goes quietly wrong, and where two sub-agents can produce numbers that don't match.

- **Balls faced (batter):** every delivery except wides. A no-ball counts as a ball faced.
- **Batter runs:** runs off the bat only. No byes, leg-byes, wides, or no-ball penalty runs.
- **Legal balls (bowler):** deliveries that are not wides or no-balls. Overs and economy use legal balls.
- **Runs conceded (bowler):** runs off the bat plus wides and no-balls. Byes, leg-byes, and penalty runs are not charged to the bowler.
- **Bowler's wickets:** bowled, caught, caught and bowled, lbw, stumped, hit wicket. Run-outs and retirements are not the bowler's.
- **Dismissals (batter):** charged to the player who was out, who is not always the striker (run-outs).
- **Phases:** Powerplay = overs 1–6, Middle = overs 7–15, Death = overs 16–20.
- **Super overs:** left out of all main metrics and reported separately.
- **IDs:** one player, one ID; one franchise, one ID, from the maps built in Step 0.

Add every new metric to this file, with its one-line plain-language meaning, the moment it is introduced. The file becomes the glossary.

---

## PART 6 — THE STEPS

### STEP 0 — DATA AUDIT
Check and report:
- Columns, seasons covered, match count, ball count, last match date. If the data stops before the end of IPL 2026, say so at the top of the checkpoint. For a 2027 auction that is a real limitation, and I may be able to supply newer data.
- Nulls, duplicates, inconsistent IDs, inconsistent season labels (for example "2007/08" vs "2008").
- Player name variants ("V Kohli" vs "Virat Kohli") → one master player ID map. Watch for different players who share a name or initials.
- Team name changes (Delhi Daredevils → Delhi Capitals, Kings XI Punjab → Punjab Kings, and any others) → one team ID map.
- Super overs: exclude from main metrics, report separately.
- No-result, abandoned, and DLS-affected matches: flag them, decide the treatment, give the reason. A DLS chase needs the revised target. If the dataset doesn't carry it, keep those matches out of the win-probability model.
- Extras: handled exactly as in the shared definitions.
- Playoffs and finals: identify them (from a stage column if there is one; otherwise derive them and log how).
- Impact Player era (2023 onward): flag it, since it changes batting depth and scoring.
- Outside sanity check: compare three to five well-known season totals (for example, the top run-scorer's and top wicket-taker's totals in two different seasons) with official records via web search. A mismatch means the data or the parsing is wrong. Find out which before moving on. This is a check only; the dataset stays the sole source of stats.

Output: "Data Notes" table → Issue | Rows affected | Action taken | Why.

### STEP 1 — PRESSURE INDEX (the core of the project)
Build it in two layers so it is both accurate and explainable.

**Layer A — Win probability model**
- For every ball, estimate the batting side's chance of winning. Keep the model simple (logistic regression or gradient boosting). Inputs: innings, runs needed or score vs par, balls left, wickets in hand, venue par, season scoring level.
- No peeking at the future. Train on earlier seasons and test on later ones. Keep all balls from one match on the same side of the split. Compute venue par and season scoring level only from matches played before the one being scored. Nothing derived from the final result goes in as an input.
- Report the Brier score (the average squared gap between the predicted chance and what happened; lower is better, and a coin flip scores 0.25) and a calibration chart (when the model says 70%, did teams win about 70% of the time?). If calibration is poor, say so and simplify.

**Layer B — Pressure Index (0–100)**
- Core = leverage: how much the win probability could swing on this one ball. A high-leverage ball is one that matters. Default method: take the realistic outcomes of the ball (dot, 1, 2, 4, 6, wicket), work out the win probability after each, weight each by how often it happens in that situation, and take the expected size of the swing. If you choose another method, say why.
- Add small, transparent context boosts:
  - Chasing: required run rate vs current run rate, balls left, wickets in hand
  - Batting first: score vs venue and phase par
  - Phase: Powerplay / Middle / Death
  - Stakes: playoffs and knockouts; close games (final margin ≤10 runs or ≤2 wickets) in the last 5 overs
  - Collapse: 2+ wickets in the previous 3 overs
- Avoid double counting. Leverage already captures much of the chase and close-game picture, so run a correlation check between components and shrink or drop any boost that mostly repeats leverage. The close-game boost relies on the final margin, which is hindsight. That is acceptable for describing how tense a ball was, but show the rankings with and without it.
- Buckets: Low / Medium / High (for example, the top 20% of balls = High). Justify each threshold in one line.
- Win Probability Added (WPA): credit each ball's change in win probability to the batter and, with the sign flipped, to the bowler. Wides and no-balls count against the bowler. Byes, leg-byes, and run-outs are not the bowler's doing; decide how to assign them and log it.

**Robustness**
Test 2 alternative pressure definitions (for example, rule-based only and leverage only). Show the top-20 overlap % across all three. If overlap is below 60%, explain why.

**Checkpoint extra:** show at least 5 real example balls across low, medium, and high pressure, each with the match, the situation, and its score, so I can sanity-check that they feel right.

### STEP 2 — FAIR COMPARISON (adjustments)
Adjust for:
- Venue (high- vs low-scoring grounds)
- Season scoring inflation (especially 2023 onward)
- Opposition quality (bowling quality for batters, batting quality for bowlers)
- Batting position and phase (an opener's job is not a finisher's job)

Main measures: Runs Above Expected for batters and Runs Saved vs Expected for bowlers. Both mean the actual result minus what an average player would do in the same situation.

Compare like with like. High-pressure balls cluster at the death, where everyone scores faster, so a raw strike rate or economy under pressure mostly reflects when a player is used. Judge pressure performance on runs above or saved versus expected.

### STEP 3 — METRICS
Before calculating, state:
- Who is in scope. Default: players who appeared in the latest two seasons of the data, since retired players can't be bought.
- Minimum samples (for example, batters ≥100 high-pressure balls faced; bowlers ≥60 high-pressure balls bowled), and how many players pass.

**Batters (high pressure):** strike rate, average, balls per dismissal, boundary %, dot %, runs above expected, WPA, pressure drop (high vs low pressure), vs pace and vs spin, death-overs impact, chasing vs setting split.

**Bowlers (high pressure):** economy, wicket rate, dot %, boundary % conceded, death economy, runs saved vs expected, WPA, pressure drop vs normal overs, vs left- and right-hand batters.

**All-rounders:** combined impact = batting WPA + bowling WPA (state the weighting).

Pace/spin and left/right-hand splits need player attributes that ball-by-ball data usually lacks. Treat them as external facts under Golden Rule 2: verify them for every shortlisted or headline player, tag the rest [ASSUMPTION], and leave a player out of a split sooner than guess.

**Reliability (the key word in the brief):**
- Consistency across seasons: % of seasons above benchmark, and season-to-season spread
- Empirical Bayes shrinkage: small samples get pulled toward the average, so a lucky 30 balls can't top a ranking
- 80% intervals on every ranked metric (the range we are 80% sure the true value sits in)
- Recency weighting (state the decay; the latest season counts most)

### STEP 4 — CLUTCH RELIABILITY SCORE (0–100)
- Combine the metrics with transparent weights. Show the formula in one line and a weights table.
- Explain in 3 lines why this is not a simple average.
- Sensitivity: change each weight by ±10% and report the top-10 overlap %.
- Backtest with no leakage: build scores from seasons up to N-1 only, then check performance under pressure in season N. Repeat for at least the last 3 seasons. Everything behind the score (win-probability model, pars, expected-run benchmarks, shrinkage, weights) must also be fitted on seasons up to N-1. Report:
  - Hit rate: % of the top 10 who were still above average the next season
  - The same number for a naive baseline (ranking by overall strike rate or economy)
- Report honestly even if the edge is small. Performance under pressure is noisy from year to year. If the score barely beats the baseline, say so, and present the shortlist as good players whose quality holds up under pressure, with no promise of "clutch".

### STEP 5 — AUCTION LENS
1. **Availability first.** A player retained by another franchise can't be bought. Check the latest retention, release, and trade news, and mark every candidate "In auction pool: VERIFIED" or [ASSUMPTION]. The leaderboard can show everyone, but the shortlist, the optimiser, and "who not to chase" use only players RR could actually sign.
2. **RR squad gaps:** roles, overseas slots, age profile, left/right balance, death bowling, finisher, spin options. Tag each fact VERIFIED (with source) or [ASSUMPTION]. Where the data allows, measure each gap: how RR's current group performs under pressure by phase, against the league.
3. **Shortlist (8–10 players)** in tiers: Must-Back | Value Picks | Hidden Gems.
   Per player: role, age, Indian/overseas (capped or uncapped if Indian), price band [ASSUMPTION], risk tag (injury / form / age / sample size), clutch score with 80% interval, a 3-line case with 1–2 hard stats, and how he strengthens RR's XI.
4. **Budget optimiser:** state the purse and the squad and overseas limits (verified or assumed). Choose the best combination within budget, overseas, and squad-size limits. Give Plan A, plus Plan B if a top target becomes too expensive (name the replacement and what RR loses).
5. **Sample best XI** + Impact Player + bench.
6. **Contrarian:** 2 popular names who are overrated under pressure (data-backed, respectful tone).
7. **Unsung hero:** 1 low-profile player the data loves.
8. **Who not to chase:** 3–5 names with one-line reasons.

### STEP 6 — STORY
- Project name + one-line thesis (for example, "RR Clutch Index: backing players who win when it matters").
- 5-line executive summary on top.
- Order everywhere: headline insight → proof → recommendation.
- Glossary: every metric explained in one simple line.

### STEP 7 — DELIVERABLES
Deliver one at a time, starting with A, with a checkpoint after each. Before each checkpoint, run the critic on the deliverable and the cold reader on anything a selector will read (dashboard tabs, slides, cheat sheet).

- **A) Interactive HTML dashboard** — full spec in Part 7.
- **B) 6–7 slide PDF:** exec summary, method, pressure index, leaderboard, shortlist, squad fit, risks and limits, with the dashboard link and a QR code. Ask me for the dashboard's public URL. If I don't have one yet, leave a clearly marked placeholder; do not invent a link.
- **C) 1-page cheat sheet:** top picks + one chart.
- **D) Methodology & Limitations note** + data dictionary.
- **E) Clean Python notebook:** reproducible, commented, fixed random seed, and able to regenerate the final tables from the raw data.
- **F) 60–90 second walkthrough video script** with timestamps.

### STEP 8 — FINAL SELF-AUDIT AND CRITIC PASS (before final delivery)
Check and fix, then list the results as a table (Check | Status | Fix applied | Remaining risk):
- Small-sample traps
- Survivorship bias (retired or unsold players)
- Season/era bias
- Double counting in the pressure index
- Leakage in the backtest
- Cherry-picked stats
- Totals that don't match the raw data
- Player name typos / mismatched IDs
- Misleading chart axes
- Colour-blind readability
- Every external fact tagged VERIFIED or [ASSUMPTION]
- The same number everywhere: every stat in the dashboard, PDF, cheat sheet, and notebook matches `outputs/tables/`
- Every shortlisted player is actually available at the auction
- Every selector-facing page passes the cold-reader test
- The dashboard works offline at 380px with no console errors

Then run the critic one last time across all deliverables together and fix what it finds. Show me three things: the audit table, the critic's findings with what you did about each, and an honest list of what is still uncertain. Finish with a short handover: where each file is and what to open first.

---

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

---

## PART 8 — OUTPUT STYLE (everything I or the selectors read)

- Short sentences. No jargon without a one-line explanation.
- Tables over paragraphs. One takeaway sentence per chart.
- Numbers rounded sensibly (strike rate 1 decimal, economy 2 decimals).
- Uncertainty shown, never hidden.
