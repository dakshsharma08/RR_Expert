# RR Clutch Index: framework review and execution plan

**Status: proposal for approval. No analysis has been run.** The master prompt (`docs/master_prompt/MASTER_PROMPT.md`) is not changed. Every fix below is a proposal. Once approved, it goes into `logs/DECISIONS.md` with its reason.

The review was done on 2026-11-17, against dataset v2: 200,999 balls in 867 matches. Of these, 367 matches (87,687 balls) are IPL.

---

## 1. What the dataset can and cannot support

The dataset has 33 columns. **It does not have** a venue, the toss, a result or winner, a season label, a match stage, a DLS target, the number of overs a match was reduced to, the Impact Player, the fielder, or anything about players beyond their names and IDs.

| Requirement (where in the prompt) | Supported? | How, or what is missing |
|---|---|---|
| Seasons, match and ball counts, last match date (Step 0) | **Yes** | Season comes from the date. IPL has 5 seasons, 2022–2026. The IPL 2026 final (31 May 2026) is in the data, so **the data does reach the end of IPL 2026**. The last ball overall is 1 Nov 2026, in a non-IPL match |
| Inconsistent season labels (Step 0) | Not applicable | There is no season column. The season is taken from the date, so labels cannot disagree |
| Player ID map, name variants (Step 0) | **Yes** | Batter, non-striker, bowler and dismissed player all have IDs. Step 0 checks IDs that carry several names and names that carry several IDs |
| Team ID map, name changes (Step 0) | **Partly** | IDs are stable, but there are **no team names**. The 10 IPL franchises were identified from their regular players (`scripts/teams.py`), and the Facts Researcher will verify this. No franchise was renamed between 2022 and 2026 |
| IPL vs other T20 (user instruction) | **Yes** | An IPL match is one where both teams are among the 10 franchise IDs: 367 IPL matches and 500 others. No match mixes the two |
| Super overs (Part 5, Step 0) | **Yes** | They are innings 3 and 4 (6 matches across the whole dataset) |
| Extras (Part 5) | **Mostly** | Wides, "Overstep" (= no-ball), legbyes, byes and Penalty are clear. **"other" (254 balls) and `extras_2_runs` (36 balls) are undecoded**, and Step 0 must decode them before the definitions are final |
| Phases (Part 5) | **Yes** | From `overid` |
| Batting position (Step 2) | **Yes** | `batting_order` |
| Batting hand; pace vs spin; bowling type (Rule 2, Step 3) | **Yes, in the data** | `batting_type` (RHB/LHB), `pace_or_spin`, and `bowling_type` are recorded on every ball. This contradicts the prompt's assumption that they must come from outside (see C2) |
| Result, winner, margin, target (Steps 1A, 1B) | **Derived** | For normal matches these come from the scores. **They cannot be derived for DLS, no-result or abandoned matches** |
| DLS revised targets (Step 0) | **No** | DLS matches must be detected (overs cut short, a chase ending short of its target, long gaps between ball timestamps) and confirmed from outside. Per the prompt, they then stay out of the win-probability model |
| Playoffs and knockouts (Step 0, 1B) | **Derived** | The last 4 matches of each season by date. This pattern holds in all 5 seasons. How it was derived will be logged |
| Impact Player era (Step 0) | **Partly** | The era is 2023 onward (a flag by season). Who was the Impact Player in each match is **not** recorded |
| **Venue par** (WP model input, batting-first boost, Step 2 venue adjustment) | **No** | **There is no venue column.** The options are an external mapping or dropping venue (Question 1) |
| Opposition quality (Step 2) | **Derived** | Team-season ratings computed from the data itself |
| Age, overseas or capped status, wicketkeeper, injuries, prices, squads, retentions, purse, limits (Step 5) | **No** | These are external facts. Each must be VERIFIED or tagged [ASSUMPTION] |
| Fielding under pressure | **No** | The fielder is not recorded, so catches, drops and run-outs effected by a fielder cannot be credited. This is a stated limitation |
| `bowl_speed` | **Unreliable** | 0 means missing on 25.9% of IPL balls, and one value is -1. **Not used** |

### Data limitations by component

**Pressure Index**
- Venue par is missing (Question 1).
- DLS and no-result matches lack labels and must be left out of the win-probability model.
- The prompt says pars should use only earlier matches. For 2022 there are no earlier seasons, so a start-up rule is needed (see G12).
- The model has only about 360 matches with an outcome. The test season has 74, so calibration is judged on matches, not balls, and will be noisy.

**Clutch score**
- There are only 5 IPL seasons.
- In-scope players (those who played in 2025–26) may have only 1–2 seasons. That makes "% of seasons above benchmark" coarse.
- Within one season, a player has few high-pressure balls and very few dismissals.

**Backtest**
- At most 3 test seasons: 2024 (trained on 2022–23), 2025 (2022–24) and 2026 (2022–25).
- 2024 is trained on just 2 seasons.
- The top-10 hit rate rests on about 30 player-seasons per role, so its sampling error is about ±15 points.
- 3 league fixtures are absent from the 2024 source, including 1 RR game.

**Auction**
- Retention lists are due today. The auction pool is final only in December.
- Prices can only be assumptions.
- Players in the pool with little or no IPL data cannot be scored on IPL data (Question 3).

---

## 2. Contradictions and overlaps in the prompt

| # | Issue | Where | Proposed fix (needs approval) |
|---|---|---|---|
| C1 | "Never… estimate a stat" conflicts with a method built on estimates: win probability, expected runs, shrinkage and intervals | Rule 1 vs Steps 1–4 | Two labelled kinds of number. **Counted stats** are exact from the data and never altered. **Model estimates** always show their method and an 80% interval. Both go in DEFINITIONS.md |
| C2 | Batting hand and bowling type are listed as external facts, but they are in the data on every ball | Rule 2, Step 3 | Treat the data values as data (Rule 1). Step 0 checks that each player has one consistent value. Check headline players externally only where the data conflicts with itself |
| C3 | "Train on earlier seasons only", yet every ball needs a pressure score, including 2022 balls, which have no earlier season | Step 1A | **Walk-forward models** for validation and the backtest. One **production model** fitted on all IPL seasons (no input derived from results) for the descriptive scores. Both are logged |
| C4 | Venue par is required in three places but the data has no venue | Steps 1A, 1B, 2 | Question 1 |
| C5 | The close-game boost uses the final margin, which is hindsight. A leakage-free backtest is also required | Step 1B vs Step 4 | Make the **index without the boost the primary one**, and show the with-boost version as the comparison the prompt asks for. The backtest always uses the version without hindsight |
| C6 | Season scoring level fitted only on seasons up to N-1 cannot see season N's scoring inflation | Step 4 vs Step 2 | Measure the backtest outcome against **season N's own league average**. That is the realised outcome, not an input, so there is no leakage |
| C7 | "Pressure drop" means High vs Low for batters but "vs normal overs" for bowlers | Step 3 | One definition for both: **High vs Low pressure**, with Medium left out |
| C8 | A checkpoint is capped at 10 lines, yet the Step 1 checkpoint needs 5+ example balls and the dashboard checkpoint needs 7+ screenshots | Rule 4 vs Step 1, Part 7 | A 10-line checkpoint, with the examples and screenshots attached separately |
| C9 | One script per step in `src/`, plus a notebook that must regenerate the final tables, means two code paths that can drift apart | Part 2 vs Step 7E | The notebook **calls the `src/` scripts**, so there is a single code path |
| C10 | The required folder layout differs from the existing repo (`data/`, `scripts/`, audit reports) | Part 2 | Add the Part 2 folders. `data/raw/` holds a checksum-verified copy of v2. Existing files stay untouched. DATA_NOTES.md links to the audit and recovery reports |
| C11 | "Never round up" vs "numbers rounded sensibly" | Rule 1 vs Part 8 | Store full precision and round only for display (strike rate 1 decimal place, economy 2). Never round in a flattering direction |
| C12 | The prompt calls it an "IPL dataset", but 500 of the 867 matches are not IPL | Part 1 | IPL only for every metric, per your instruction. Non-IPL matches are excluded, and this is logged |
| C13 | "Better only when intervals don't overlap" is a stricter test than a real difference test | Part 7 Tab 4 | Keep the rule as written. In Detailed mode, also show the chance that A is truly better than B |
| C14 | No critic runs after Steps 0, 2 or 3, so data and benchmark errors only surface at Step 4 | Part 2 | Add a short critic after Step 0. Have the Step 4 critic explicitly cover Steps 2–3 |

## 3. Gaps the prompt leaves open

Each gap needs a definition. I'll propose one in DEFINITIONS.md or DECISIONS.md at the step concerned, and you approve it at that step's checkpoint.

| # | Gap | Proposal |
|---|---|---|
| G1 | Roles: batter, bowler, all-rounder, keeper. The data has no role field, and keepers cannot be identified from it | Assign roles from usage thresholds in the data. Keeper status is an external fact |
| G2 | How the 0–100 Clutch score is scaled, and how all-rounders get one | Percentile within role. All-rounders get batting and bowling WPA combined, with the weighting stated |
| G3 | What the extras types "other" and `extras_2_runs` mean | Decode them in Step 0 before the definitions are frozen |
| G4 | Ties decided by a super over, for win-probability labels | Main-innings label = 0.5. Super overs are reported separately |
| G5 | How byes, leg-byes and run-outs count in WPA. The prompt says "decide and log" | Credit the batter with the full change. Credit the bowler with the change minus byes, leg-byes and run-outs. Log this |
| G6 | "Walk-away price" and the source of price bands are undefined | Define them in Step 5. Both are always [ASSUMPTION] |
| G7 | The measure behind "Similar players" | Distance across the radar percentiles, within role |
| G8 | Recency decay, the shrinkage prior, and how intervals are computed | State all three in Step 3. Intervals by bootstrap over matches |
| G9 | In the backtest: top-10 players who don't play in season N, and the minimum sample needed to judge them | Show these players both ways, once counted as misses and once excluded. Set a minimum number of balls in season N |
| G10 | The minimum samples given are examples only (≥100 / ≥60) | Show how many players pass at those values before fixing them |
| G11 | Leverage outcome set: wides, no-balls and 3s are not in the list | Add 3 and wide/no-ball as outcomes, each weighted by how often it happens in that situation. Log this |
| G12 | Pars and season scoring level for the first 2022 matches, which have no earlier data | An in-season running average from a fixed starting value, tagged [ASSUMPTION] |
| G13 | 2025 PBKS v DC (match 40751) was abandoned after 63 balls and later replayed (43057) | Check its official status, then decide whether those balls count |
| G14 | How to detect DLS matches | Rules from the data, plus a timestamp-gap check, then external confirmation |
| G15 | Public URL for the dashboard (PDF and QR code) | Ask at Step 7B. Leave a marked placeholder until then |

## 4. Weaknesses in the method, and the safeguards I propose

| # | Weakness | Safeguard |
|---|---|---|
| W1 | Clutch may not be a lasting skill. Pressure performance is noisy from year to year | The backtest is the judge. If the edge is small, the claim is reframed to "quality that holds up under pressure", as the prompt says |
| W2 | Role decides exposure: finishers face more high-pressure balls | Expected runs must condition on the game state (phase, wickets, innings, chase situation, batting position) |
| W3 | WPA depends heavily on context and is noisy | Use per-ball rates, shrunk toward the average, with intervals. Totals are shown only as context |
| W4 | Under pressure, dismissals are tiny counts, so batting average and balls per dismissal are unstable | Shrinkage plus wide intervals. These metrics get low weight in the score |
| W5 | Tuning the weights on backtest results is itself a form of leakage | Fix the weights in advance, before seeing rankings or backtest results. The backtest only validates them |
| W6 | With many metrics, there is a risk of cherry-picking | Fix the metric list in advance and report every metric, not only the favourable ones |
| W7 | Top-10 hit rate is a coarse, noisy test | Add a rank correlation across all qualifying players, and a bootstrap interval on "score minus baseline" |
| W8 | Calibration checked over balls overstates its precision | Bootstrap by match, with error bars on the calibration chart |
| W9 | The adjustments themselves are noisy | Shrink the venue and opposition effects |
| W10 | 2022 comes before the Impact Player rule | An era flag plus recency weighting. Show results with and without 2022 |
| W11 | Players without IPL data cannot be scored (survivorship) | List them as "not scorable on IPL data" (Question 3) |

---

## 5. Execution plan

Every sub-agent runs on **Sonnet** at **high** effort, both set explicitly at each launch. Every work package hands back a script in `src/`, its output tables, a split between what it ran and what it assumed, and a list of oddities.

### Folder layout (set up in WP-S; existing files untouched)

`data/raw/` holds a checksummed copy of v2. The other folders are `data/work/`, `outputs/tables/`, `outputs/deliverables/` and `src/`. `logs/` holds `DEFINITIONS.md`, `DATA_NOTES.md`, `FACTS.md`, `DECISIONS.md` and `REVIEWS.md`. Pinned libraries go in `requirements.txt` (scikit-learn, scipy, statsmodels, matplotlib, nbformat, qrcode), with one fixed random seed.

### Work packages

| WP | Owner | Runs alongside | Main outputs | Gate |
|---|---|---|---|---|
| S Setup | Me | — | Folders, DEFINITIONS.md (Part 5 word for word + data encodings), DECISIONS.md, empty facts ledger | Self-check |
| 0A Data audit | Data Auditor | 0B | `src/step0_audit.py`. IPL ball table with match facts (target, result, margin, NR/DLS flag, playoffs, super overs). Player and team maps. Data Notes table | Part 2 gate + short critic (C14) → **Checkpoint 0** |
| 0B Facts | Facts Researcher | 0A, and through Step 5 | FACTS.md: auction type, date and rules; purse; squad and overseas limits; team names for IDs; DLS/NR list; 2025 replay status; 3–5 official season totals; venues (if Q1 = yes); and, once lists are published, RR squad, retentions and releases | Spot-check sources |
| 1A Win probability | WP Modeller | — | Walk-forward and production models; Brier score; calibration with match-level bootstrap | Part 2 gate |
| 1B Pressure | Pressure Builder | — | Leverage, boosts, correlation check, buckets, WPA, 2 alternative definitions with top-20 overlap, 5+ example balls | Gate + **Critic 1** (2 rounds) → **Checkpoint 1** |
| 2 Fair comparison | Fair-Comparison Modeller | — | Expected-runs models; Runs Above Expected and Runs Saved per ball | Gate → **Checkpoint 2** |
| 3 Metrics | Batting Analyst, Bowling Analyst | each other | Scope and minimum-sample pass counts; metrics; shrinkage; 80% intervals; recency; consistency | Gate → **Checkpoint 3** |
| 4 Score | Score Statistician | — | Formula and weights (fixed in advance); ±10% sensitivity; backtest on 2024–26 vs naive baseline, with rank correlation and a bootstrap interval | Gate + **Critic 2** → **Checkpoint 4** |
| 5 Auction | Auction Strategist (+ facts) | — | Availability tags, squad gaps, shortlist, optimiser (Plans A/B), XI, contrarian picks, unsung hero, who not to chase | Gate + **Critic 3** → **Checkpoint 5** |
| 6 Story | Me | — | Name, thesis, 5-line summary, glossary | → **Checkpoint 6** |
| 7A Dashboard | Dashboard Builders: payload → design system → tabs in parallel → integration | — | One offline HTML file under 5 MB; Playwright screenshots at 380px and desktop, network off | Gate + **Critic** + **Cold Reader** per tab → **Checkpoint 7A** |
| 7B–F | Deliverable Writers | each other, after A is approved | PDF + QR code, cheat sheet, method note + data dictionary, notebook, video script | Critic each; Cold Reader on B and C → checkpoints |
| 8 Final audit | Me + Critic | — | 15-item audit table, final critic pass, list of uncertainties, handover | → **Final checkpoint** |

**Gate on every WP (from Part 2):**
1. Re-run the script and confirm the output matches what was reported.
2. Recompute 3 or more of its numbers from the raw data myself.
3. Reconcile its totals with the previous step: 200,999 → 87,687 IPL balls → the subset in each step.
4. Resolve every oddity it lists.

A failure goes back to the sub-agent with the specific problem.

### Part 4 plan, in 10 lines

1. Setup: folders, definitions, decisions, facts ledger, pinned libraries.
2. Step 0: Data Auditor and Facts Researcher in parallel. Short critic, then Checkpoint 0.
3. Step 1: win-probability model, then pressure index and WPA. Critic 1, then Checkpoint 1.
4. Step 2: expected-runs models (venue as per Q1). Checkpoint 2.
5. Step 3: batting and bowling analysts in parallel, with shrinkage, intervals and recency. Checkpoint 3.
6. Step 4: score with weights fixed in advance, sensitivity, leakage-free backtest. Critic 2, then Checkpoint 4.
7. Step 5: auction lens from verified availability and squad. Critic 3, then Checkpoint 5.
8. Step 6: the story. Checkpoint 6.
9. Step 7: dashboard first (critic + cold reader on each tab), then B–F in parallel. A checkpoint after each.
10. Step 8: self-audit, final critic across everything, handover.

---

## 6. Questions (Part 4: up to 3)

1. **Venue.** The data has no venue, and the prompt uses venue in three places.
   - **Recommended:** the Facts Researcher maps all 367 IPL matches to their grounds from official fixture lists, one source per season, logged as VERIFIED.
   - Alternative: drop venue and state it as a limitation.
2. **Auction facts.** Retention lists are due today, 17 Nov 2026.
   - **Recommended:** we verify the purse, limits, RR's retained squad and the released players ourselves.
   - Alternative: you supply these values.
3. **Pool players with little or no IPL data.** By your instruction, the index is built on IPL data only, so these players can't be scored.
   - **Recommended:** keep them off the shortlist, and list them as "not scorable on IPL data".
   - Alternative: show a separately labelled view based on T20 internationals for them.
