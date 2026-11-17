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
