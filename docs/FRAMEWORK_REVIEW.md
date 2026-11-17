# RR Clutch Index: framework review and execution plan

**Status: revision 3, the final plan, waiting for your explicit approval. No setup or Step 0 work has started and no analysis has been run.** The master prompt (`docs/master_prompt/MASTER_PROMPT.md`) is unchanged. Approved decisions D1–D17 are in `logs/DECISIONS.md` and summarised in section 0. Three clarifications (U4–U6) and every other fix below are still proposals until you approve this plan.

The review was done on 2026-11-17, against dataset v2: 200,999 balls in 867 matches. Of these, 367 matches (87,687 balls) are IPL.

---

## 0. Approved decisions (2026-11-17)

Decisions D1–D17 are recorded in `logs/DECISIONS.md`. This is what they change in the plan:

| Decision | Change to the plan |
|---|---|
| D1 Venue | Step 0B maps all 367 matches to venues using official IPL/BCCI fixture lists, matching on date, teams and match number. Each mapping keeps its source, and an unverified venue is marked UNKNOWN. A venue map links each ground's different names to one ID. A match with an UNKNOWN venue gets no venue effect (season par only), and this is logged |
| D2 Auction facts | The facts ledger records, for each fact: what it is · its value · status (VERIFIED or [ASSUMPTION]) · source · publication date · date verified. Facts are checked three times: **F1** in Step 0, **F2** before the Step 5 recommendations, **F3** before final delivery |
| D3 Not scorable | A **"Not Scorable on IPL Data"** list gives each player's reason and IPL sample (balls, and high-pressure balls). It appears in Step 5, on the dashboard's Auction Board and in the PDF |
| D4 Chronological WP | **This replaces my proposal C3.** Each season is scored only by a model trained on earlier eligible matches: 2023 ← 2022, 2024 ← 2022–23, 2025 ← 2022–24, 2026 ← 2022–25. The same predictions feed both the descriptive history and the backtest. The all-season model is kept for future use only and never produces a historical number. **Consequence: 2022 balls get no out-of-sample prediction (open question U1)** |
| D5–D6 Freeze | New **gate P (pre-registration)** after Step 2. These rules are written to `logs/PREREGISTRATION.md`, with its sha256 logged, and you approve them before any player-level performance number is computed: metric list, weights, scaling, shrinkage, recency, interval method, minimum samples, all-rounder weighting, backtest protocol and pass criteria. Before the freeze, only sample counts may be looked at, never performance values. Weights are never tuned on backtest seasons |
| D7 Uncertainty | Step 1 reports the Brier score and calibration for each season fold, with intervals from resampling whole matches and the number of matches behind each. The same is shown in the method note, Tab 7 and the limitations |
| D8 Hindsight | The main score uses the pressure index **without** the close-game boost. The with-boost ranking is a separate comparison table and is never blended in |
| D9, D17 Prompt intact | The master prompt is not edited. Every change goes into DECISIONS.md |
| D10 IPL 2022 | 2022 is training data only, for the 2023 model. The Pressure Index, WPA and pressure metrics cover **2023–2026**. Every output discloses that the 2023 model has only one earlier season of training data |
| D11 Earlier data only | Everything used to judge a historical ball comes only from matches before it: win probability, leverage outcome frequencies, expected runs, venue and season par, opposition strength, and every other benchmark. Early in a season, the previous season is used as a documented fallback, with shrinkage. Every benchmark table records the cut-off it was built to |
| D12 Venue sources | Official IPL/BCCI sources first. Otherwise two independent reputable secondary sources must agree, recording both sources, the matching evidence and the status. Without agreement the venue is UNKNOWN |
| D13 Simple model | Logistic regression first. A more complex model only if out-of-sample results justify it (rule: U5) |
| D14 Per-season calibration | Calibration and uncertainty are reported for each season separately |
| D15 Framing | The Clutch Reliability Score is a **historical pressure-performance indicator**. Every deliverable states that its ability to predict IPL 2027 performance is not established |
| D16 Backtest separation | The backtest runs only after the freeze (gate P). Its results never change weights or metrics. If it is weak, it is reported as weak |

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
- The data has no venue. It will be mapped externally (D1, D12), and any venue that can't be verified is UNKNOWN.
- DLS and no-result matches lack labels and must be left out of the win-probability model.
- **Resolved by D10:** 2022 is used only for training, so the historical index covers 2023–2026. The 2023 model has only one season (74 matches) behind it. Early in each season, pars fall back to the previous season, with shrinkage (D11).
- The models learn from few matches: 74 (to score 2023) up to about 290 (to score 2026), and fewer once DLS and no-result matches are left out. Each scored season has only 74 matches, so calibration is judged on matches, not balls, and will be noisy (D7).

**Clutch score**
- Only 4 seasons can be scored (2023–26, per D10), from 5 IPL seasons in the data.
- In-scope players (those who played in 2025–26) may have only 1–2 seasons. That makes "% of seasons above benchmark" coarse.
- Within one season, a player has few high-pressure balls and very few dismissals.

**Backtest**
- Three test seasons. 2024's win-probability model is trained on 2022–23, 2025's on 2022–24 and 2026's on 2022–25.
- The player scores behind each test rest on 2023 only (2024 test), 2023–24 (2025 test) and 2023–25 (2026 test).
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
| C3 | "Train on earlier seasons only", yet every ball needs a pressure score, including 2022 balls, which have no earlier season | Step 1A | **Superseded by D4:** chronological out-of-sample predictions only. My two-model proposal is withdrawn. What to do with 2022 is open question U1 |
| C4 | Venue par is required in three places but the data has no venue | Steps 1A, 1B, 2 | Question 1 |
| C5 | The close-game boost uses the final margin, which is hindsight. A leakage-free backtest is also required | Step 1B vs Step 4 | Make the **index without the boost the primary one**, and show the with-boost version as the comparison the prompt asks for. The backtest always uses the version without hindsight. **Approved as D8** |
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
| G12 | Pars and season scoring level early in a season | Use earlier matches only: the previous season plus earlier matches in the same season. 2022 is used only to train (U1) |
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
| 0B Facts | Facts Researcher | 0A, and through Step 5 | FACTS.md: auction type, date and rules; purse; squad and overseas limits; team names for IDs; DLS/NR list; 2025 replay status; 3–5 official season totals; **venues for all 367 matches from official IPL/BCCI lists, UNKNOWN if unverified (D1)**; RR retained and released players, trades, purse, squad and overseas limits, auction rules, each with source, publication date and date verified (D2). This is fact check **F1** | Spot-check 10% of venue mappings and every auction fact's source |
| 1A Win probability | WP Modeller | — | **Logistic regression (D13)**, one model per season trained only on earlier eligible matches: 2023 ← 2022, 2024 ← 2022–23, 2025 ← 2022–24, 2026 ← 2022–25 (D4, D10). Gives an out-of-sample prediction for every ball from 2023 to 2026. **Brier score and calibration for each season separately**, with intervals from resampling whole matches and the number of matches behind each (D7, D14). States the 2023 model's one-season limit. Uses the model-switch rule (U5). The all-season model is saved for future use only | Part 2 gate + script check that no historical ball uses an in-sample prediction |
| 1B Pressure | Pressure Builder | — | Leverage (outcome frequencies from earlier matches only, D11), boosts, correlation check, Low/Medium/High buckets and the 0–100 scale against an earlier-season yardstick (U4), WPA, 2 alternative definitions with top-20 overlap, 5+ example balls. **The main index has no close-game boost; the with-boost version is kept separately (D8)** | Gate + **Critic 1** (2 rounds) → **Checkpoint 1** |
| 2 Fair comparison | Fair-Comparison Modeller | — | Expected-runs models; Runs Above Expected and Runs Saved per ball (how benchmarks are timed: U2) | Gate → **Checkpoint 2** |
| **P Pre-registration** | Me, with the Score Statistician drafting | — | `logs/PREREGISTRATION.md`: metric list, weights, 0–100 scaling, shrinkage, recency decay, interval method, minimum samples (with pass counts only), all-rounder weighting, the summary cut-off rule (U6), backtest protocol and pass criteria. Its sha256 goes in DECISIONS.md. **Frozen before any ranking or backtest result exists (D5, D6, D16)** | Critic reviews the spec → **your approval** |
| 3 Metrics | Batting Analyst, Bowling Analyst | each other | Computed only after P is approved, exactly as pre-registered: metrics, shrinkage, 80% intervals, recency, consistency | Gate + check against the pre-registration → **Checkpoint 3** |
| 4 Score | Score Statistician | — | Formula and weights exactly as pre-registered. The **backtest is run only after the freeze and never feeds back into weights or metrics (D6, D16)**. ±10% sensitivity. Backtest on 2024–26 against a naive baseline built from the same seasons, with rank correlation and a bootstrap interval. The result is described as evidence about history only (D15) | Gate + **Critic 2** → **Checkpoint 4** |
| 5 Auction | Auction Strategist (+ facts) | — | Fact check **F2** first. Then availability tags, squad gaps, shortlist from scorable players only, the **Not Scorable on IPL Data** list (D3), optimiser (Plans A/B), XI, contrarian picks, unsung hero, who not to chase | Gate + **Critic 3** → **Checkpoint 5** |
| 6 Story | Me | — | Name, thesis, 5-line summary, glossary. Wording follows D15: a historical pressure-performance indicator whose ability to predict 2027 is not established | → **Checkpoint 6** |
| 7A Dashboard | Dashboard Builders: payload → design system → tabs in parallel → integration | — | One offline HTML file under 5 MB; Playwright screenshots at 380px and desktop, network off | Gate + **Critic** + **Cold Reader** per tab → **Checkpoint 7A** |
| 7B–F | Deliverable Writers | each other, after A is approved | PDF + QR code, cheat sheet, method note + data dictionary, notebook, video script | Critic each; Cold Reader on B and C → checkpoints |
| 8 Final audit | Me + Critic | — | Fact check **F3**, 15-item audit table, final critic pass, list of uncertainties, handover | → **Final checkpoint** |

**Gate on every WP (from Part 2):**
1. Re-run the script and confirm the output matches what was reported.
2. Recompute 3 or more of its numbers from the raw data myself.
3. Reconcile its totals with the previous step: 200,999 → 87,687 IPL balls → the subset in each step.
4. Resolve every oddity it lists.
5. Decision checks by script. No historical number uses an in-sample win probability (D4). Every benchmark table's cut-off comes before the matches it judges (D11). The main score never uses the close-game boost (D8). Weights and metrics match the frozen pre-registration (D5, D16).

A failure goes back to the sub-agent with the specific problem.

### Part 4 plan, in 10 lines

1. Setup: folders, definitions, facts ledger, pinned libraries. Decisions are already logged.
2. Step 0: Data Auditor and Facts Researcher in parallel (venues D1, fact check F1). Short critic, then Checkpoint 0.
3. Step 1: logistic regression for each season on earlier matches only (D4, D10, D13), calibrated per season (D14). Then pressure index and WPA, with hindsight kept separate (D8). Critic 1, then Checkpoint 1.
4. Step 2: expected-runs benchmarks. Checkpoint 2.
5. Gate P: freeze metrics, weights, scaling and backtest rules (D5–D6). Your approval.
6. Step 3: batting and bowling metrics in parallel, then Checkpoint 3. Step 4: score, sensitivity, then the backtest, kept separate from tuning (D16). Critic 2, then Checkpoint 4.
7. Step 5: fact check F2, then the auction lens and the Not Scorable list (D3). Critic 3, then Checkpoint 5.
8. Step 6: the story. Checkpoint 6.
9. Step 7: dashboard first (critic + cold reader on each tab), then B–F in parallel. A checkpoint after each.
10. Step 8: fact check F3, self-audit, final critic, handover.

---

## 6. Part 4 questions: answered

1. Venue: approved with conditions (D1).
2. Auction facts: approved with conditions (D2).
3. Players without IPL data: approved with conditions (D3).

## 7. Open questions

U1–U3 are answered by D10, D11 and D12.

**Three clarifications that need your OK** (they follow from D4 and D11):

| ID | Proposal | Why it is needed |
|---|---|---|
| U4 | The 0–100 Pressure Index scale and the Low/Medium/High cut-offs use **earlier seasons only** as the yardstick. A 2024 ball is ranked against 2023 balls, 2025 against 2023–24, and 2026 against 2023–25. 2023 is ranked against 2022 balls; those 2022 balls are scored by models trained on other 2022 matches, so no ball is scored by a model trained on its own match. They serve only as this yardstick, never to evaluate players. In plain words: **"High pressure = among the top 20% most pressured balls seen in earlier seasons."** As a result, the share of High balls can differ a little from season to season, and that share is reported | Cut-offs taken from the same season would use matches played after the ball, which breaks D11 |
| U5 | Logistic regression scores every season. A more complex model may replace it from season *s* onward **only if it beat logistic regression on the seasons before *s***. Otherwise it is reported only as a comparison | Choosing a model on later seasons' results, then using it to score earlier seasons, would leak future information |
| U6 | Player summaries (shrinkage, intervals, recency, consistency, 0–100 score) are computed **as of a cut-off date**, using only balls up to it. For the final leaderboard the cut-off is the end of IPL 2026. For each backtest fold it is the end of season N-1 | Makes D11 precise for summaries that pool many matches |

## 8. Risk register

| # | Risk | Effect | Mitigation | When |
|---|---|---|---|---|
| R1 | The 2023 model has one season of training data (74 matches, fewer after DLS and no-result exclusions) | Weak win probabilities and pressure scores for 2023 | Logistic regression (D13); report each season separately (D14); disclose the limit in every output (D10); say so plainly if calibration is poor | Step 1 |
| R2 | Calibration uncertainty: 74 scored matches per season, and balls within a match are not independent | Over-confident accuracy claims | Resample whole matches for intervals; always state the number of matches | Step 1 |
| R3 | Low backtest power: about 10 players per role per fold and 3 folds. The 2024 fold rests on one season (2023) of pressure history | The edge over baseline may be within noise | Intervals, rank correlation, honest framing (D15) | Step 4 |
| R4 | Clutch may not be a lasting skill | Weak predictive claim | Reframe as "quality that holds up under pressure" | Step 4 |
| R5 | Venue coverage: many UNKNOWN venues would weaken the venue adjustment | Less fair comparison | Report coverage %, and show results with and without the venue effect | Step 0, 2 |
| R6 | Auction facts keep changing: trades stay open until about 9 Dec, the auction is 16 Dec, and the pool list comes out later | Recommendations go stale | Fact checks F2 and F3; every fact dated | Step 5, 8 |
| R7 | Strong pool players may have no IPL record | The shortlist misses them | Show them on the Not Scorable list (D3); state this limit in the summary | Step 5 |
| R8 | The extras codes "other" and `extras_2_runs` are not yet decoded | Balls-faced and runs-conceded counts could change | Decode in Step 0, before the definitions freeze | Step 0 |
| R9 | No DLS or no-result flag in the data | Wrong win/loss labels | Detect by rules, confirm externally; leave unconfirmed cases out of training and log them | Step 0, 1 |
| R10 | No fielding data | Fielders can't be credited; run-outs need a rule | Assign by the logged rule (G5); state the limit | Step 1, 3 |
| R11 | Gaps in the source: 3 league fixtures absent in 2024 (one of them RR's), and a 2025 match abandoned then replayed | Small bias | Log both; decide on the replayed match after verifying it | Step 0 |
| R12 | Sub-agent errors | Wrong numbers | The Part 2 gate plus script checks on every work package | All |
| R13 | Websites unreadable, or search limits | Facts and venues unverified | Tell you instead of working around it (Rule 3); mark as UNKNOWN or [ASSUMPTION] (D12) | Step 0, 5 |
| R14 | Early-season benchmarks rely on the previous season, but squads change at every auction and scoring levels jump (for example in 2024) | Early-season matches are judged against a yardstick that is out of date | Fall back to the prior season with shrinkage (D11). Measure the average "above expected" offset in each season and report it | Step 1–3 |
| R15 | Opposition strength comes from earlier matches, while squads turn over between seasons | Opposition adjustment is noisy early in each season | Shrink toward the league average; keep the adjustment small and show results with and without it | Step 2 |
| R16 | The mission asks "who to back", while D15 says predictive power for 2027 is not established | A selector may read the shortlist as a forecast | Every page states what the score is and what it is not; the backtest result is shown next to each recommendation; the cold reader tests this wording | Step 6–7 |
| R17 | The history has only four scored seasons (2023–26) | Consistency across seasons is coarse, and players with 1–2 seasons have wide intervals | Show "too close to call" and grey out small samples (Part 7); never rank thin samples as if they were solid | Step 3–4 |
