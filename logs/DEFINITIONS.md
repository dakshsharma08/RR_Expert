# DEFINITIONS (the shared glossary)

Every sub-agent reads this file before working. Every new metric is added here, with a one-line plain-language meaning, the moment it is introduced (Part 5). Decisions referenced as D# are in `logs/DECISIONS.md`.

## A. Shared definitions: master prompt Part 5, verbatim

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

## B. How the dataset encodes these (CONFIRMED in Step 0; adopted by the supervisor at the Step 0 gate)

Every line was tested by `src/step0_audit.py` on the 87,687 IPL balls (367 matches). The evidence is in `outputs/tables/step0_extras_decoding.csv`.
Columns marked *(inferred)* are decisions drawn from the structure of the data, not from a data dictionary.

| Concept | Column(s) and rule |
|---|---|
| One row | One delivery, wides and no-balls included. Unique key: `match_id`, `innings`, `innings_ball_num` (no duplicates; numbering 1..N in every innings) |
| IPL match | Both teams are among the 10 franchise ids: 1 CSK, 2 MI, 3 RR, 4 PBKS, 5 RCB, 7 DC, 8 KKR, 242 SRH, 3508 GT, 3509 LSG. 367 of 867 matches. No match mixes IPL and non-IPL ids. The rest are excluded from all metrics (D3) |
| Season | No season column. Season = calendar year of the first-ball date (`delivery_ist_time`). IPL runs March to June |
| Clock | `delivery_ist_time` is labelled UTC on every row. 2022-23 values are IST, 2024 onward UTC (add 5h30 for IST). `ts_ist` in the ball table does this |
| Super over | `innings` 3 or 4 (2 IPL matches: 40725|50359). Left out of the main metrics and reported separately. Innings 1 and 2 hold 87,673 balls, super overs 14 |
| Phase | From `overid`: 1-6 Powerplay, 7-15 Middle, 16-20 Death; super-over balls get phase `SuperOver` |
| Over and ball counters | `over_ball_num` and `innings_ball_num` count **every delivery**, including wides and no-balls (an over can have up to 11 rows). Use `legal_ball` to count legal balls. An innings has at most 120 legal balls |
| Wide | `extras_type == 'wide'` (3552 balls). Not a legal ball, not a ball faced. `runs` is 0; all wide runs (1 to 5) are in `extras1_runs`; charged to the bowler |
| No-ball | `extras_type == 'Overstep'` (257 balls) is a no-ball: `extras1_runs` is always 1, bat runs are in `runs`. Not legal; a ball faced; the bowler is charged bat runs + 1 |
| `other` | `extras_type == 'other'` (123 balls) *(inferred)*: behaves exactly like a no-ball (re-bowled, `extras1_runs` is always 1, the batter scores off it, only run-outs fall). Treated as a no-ball (`noball_kind = 'other_inferred'`). Its real cricket meaning is not in the data |
| Leg-byes, byes | `extras_type in ('legbyes', 'byes')`: legal ball, ball faced, `runs` is 0, the amount is in `extras1_runs` (1, 2 or 4). Added to the team score, not charged to the bowler |
| Penalty | `extras_type == 'Penalty'`: none in IPL data. Rule coded: `extras1_runs` to the team score, not to the bowler |
| `extras_2_runs` | Non-zero on 20 IPL balls, only on no-ball-type balls with `runs == 0` *(inferred)*: byes or leg-byes run off a no-ball. Added to the team score (confirmed: with it, all successful chases end exactly on the ball that reaches the target), not charged to the bowler. Bye vs leg-bye is not recorded, so it is kept as `extras2_runs` |
| Batter runs | `runs` (off the bat only; boundaries are never recorded on byes, leg-byes or wides) |
| Balls faced | every delivery except wides (`ball_faced`) |
| Legal balls | not a wide and not a no-ball (`legal_ball`) |
| Team score on a ball | `total_runs = runs + extras1_runs + extras_2_runs` |
| Runs conceded (bowler) | `bowler_runs_conceded = runs + wide runs + no-ball runs` (byes, leg-byes, penalty and `extras_2_runs` excluded) |
| Wicket | `is_wicket` is true exactly when `dismissal_type` is non-empty (every row) |
| Bowler's wickets | `dismissal_type` in Bowled, Caught (includes caught and bowled), LBW, Stump, Hit Wicket (`is_bowler_wicket`). Not the bowler's: RunOut, Retire Out, Obstructing the field (spelled 'Obstracting' on 1 ball(s)) |
| Player dismissed | `player_out_id` (ball table). `dismissed_player_id` is always the striker or non-striker where present. Of the 6 IPL rows that disagree with `dismissal_type`: 1 wicket row(s) lacked the id and were resolved from who never bats again; 5 non-wicket rows carry an id and are retired-not-out (`is_retired`, `retired_player_id`; `is_wicket` false, no dismissal) |
| Team wickets | `is_wicket` true, so run-outs, Retire Out and obstructing the field count; retired-not-out does not |
| Batting hand, pace/spin, bowling type | `batting_type`, `pace_or_spin`, `bowling_type` are on every ball. Per-player consistency: batting_type not >= 99% one value for 0 players, pace_or_spin for 0, bowling_type for 24 (`player_map.csv`) |
| Bowling speed | `bowl_speed` is **not used**: 0 means missing on 25.9% of IPL balls, one row has -1 |
| Target and balls left | Innings 2: `target = innings 1 total + 1`, balls left = 120 minus legal balls. Not valid for the 13 matches flagged for suspected reduced overs / DLS |
| Playoffs | No stage column. Provisional: the last 4 matches of each season by (date, first-ball time, match_id) = Qualifier 1, Eliminator, Qualifier 2, Final |

| Win-probability eligibility | `data/work/wp_eligibility.csv`: 353 of 367 matches. The 14 excluded are no-result, abandoned, DLS or reduced-overs matches, and their balls carry no pressure or WPA (D4). They still count in descriptive totals |

## C. Scope rules from the approved decisions

- **Counted stat:** an exact count or ratio taken from the data, never altered (Golden Rule 1).
- **Model estimate:** an output of a model, such as win probability or expected runs. It is always labelled, and shown with its method and an 80% interval where it is ranked (C1).
- **Seasons:** 2022 is training data only. Pressure Index, WPA and player pressure metrics cover 2023–2026 (D10).
- **Earlier data only:** every historical ball is judged only with information from matches before its own (D4, D11, D18).
- **Close-game boost:** never part of the main score; it is reported only as a separate comparison (D8).
- **What the score means:** the Clutch Reliability Score is a historical pressure-performance indicator. Its ability to predict IPL 2027 is not established (D15).

## D. Metric glossary

One line per metric, added as each metric is introduced. Format: **Name**: plain-language meaning (step, owner).

- **Pressure Index (0–100)**: How much a ball could swing the match result, ranked against earlier balls; 80+ = High pressure.
- **Leverage**: The expected size of the win-probability swing on a ball, given what usually happens in that situation.
- **Win probability**: The batting side's chance of winning before a ball, from a model trained on earlier seasons only.
- **WPA (win probability added)**: How much a player's ball changed his team's chance of winning (in percentage points).
- **Runs Above Expected (RAE)**: Runs scored minus what an average batter would score on the same balls in the same situations.
- **Runs Saved vs Expected (RSE)**: Runs an average bowler would concede on the same balls minus the runs actually conceded.
- **Shrinkage**: Pulling small samples toward the average so a few lucky balls can't top a ranking.
- **80% range**: The range we are 80% sure the true value sits in, from resampling the player's matches.
- **Consistency**: Share of seasons (with ≥30 High-pressure balls) in which the player was above expected.
- **Clutch Reliability Score**: 0–100 historical pressure-performance indicator within role; roughly a percentile. Not a forecast.
- **Backtest**: Score built from earlier seasons only, then checked against the next season's pressure performance.
- **Too close to call**: Two players whose 80% ranges overlap: the data can't say who is better.
- **[ASSUMPTION]**: A value the data can't supply and the web couldn't verify here; stated with its reason.

- **High / Medium / Low pressure**: Pressure Index 80+ / 50–80 / below 50. High = about the top 20% of balls seen earlier; Low = the ordinary half (Step 1B, D27).
- **Skill under pressure (S)**: shrunk, recency-weighted RAE (batters) or RSE (bowlers) per ball on High-pressure balls (Step 4).
- **Match impact (I)**: shrunk WPA per ball on High-pressure balls (Step 4).
- **Holds up (H)**: High-pressure minus Low-pressure RAE/RSE per ball; positive = better under pressure (Step 4).
- **Pressure drop (descriptive)**: RAE/RSE per 100 balls in High minus Low (Step 3).
- **Hit rate (backtest)**: share of a ranking's top 10 who were above the league average under pressure the next season (Step 4).
- **Random-pick base rate**: hit rate expected by picking assessable players at random (Step 4).
- **Effective sample size**: (Σw·n)²/Σw²·n for recency-weighted balls (D31).

