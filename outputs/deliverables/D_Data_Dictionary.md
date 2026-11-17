# RR Clutch Index: Data Dictionary

Part A lists every column of the ball table. Part B lists every metric. Part C gives the shared definitions the numbers rely on. Sources: `outputs/tables/step0_ball_columns.csv`, `dashboard_payload.json` (glossary), `logs/DEFINITIONS.md`.

## Part A. Ball table columns

69 columns: 34 raw columns (unchanged from the source) and 35 derived columns. One row = one delivery (wides and no-balls included).

| Column | Kind | Meaning | Rule |
| :--- | :--- | :--- | :--- |
| `row_id` | raw | 0-based position of the row in the raw file (line = row_id + 2). Added by load_raw() | unchanged string from load_raw() |
| `match_id` | raw | Match identifier | unchanged string from load_raw() |
| `innings` | raw | 1, 2 = main innings; 3, 4 = super over | unchanged string from load_raw() |
| `overid` | raw | Over number, 1 to 20 (1 in a super over) | unchanged string from load_raw() |
| `over_ball_num` | raw | Delivery counter inside the over; counts wides and no-balls (max 11) | unchanged string from load_raw() |
| `innings_ball_num` | raw | Delivery counter inside the innings; counts every delivery | unchanged string from load_raw() |
| `batting_team_id` | raw | Team id batting | unchanged string from load_raw() |
| `bowling_team_id` | raw | Team id bowling | unchanged string from load_raw() |
| `striker_id` | raw | Batter facing the ball | unchanged string from load_raw() |
| `striker_name` | raw | Name as in source | unchanged string from load_raw() |
| `non_striker_id` | raw | Batter at the other end | unchanged string from load_raw() |
| `non_striker_name` | raw | Name as in source | unchanged string from load_raw() |
| `bowler_id` | raw | Bowler id | unchanged string from load_raw() |
| `bowler_name` | raw | Name as in source | unchanged string from load_raw() |
| `batting_type` | raw | RHB / LHB of the striker | unchanged string from load_raw() |
| `bowling_type` | raw | Bowling style text | unchanged string from load_raw() |
| `batting_order` | raw | Batting position of the striker | unchanged string from load_raw() |
| `runs` | raw | Runs off the bat only (confirmed in section 4) | unchanged string from load_raw() |
| `is_four` | raw | true when runs == 4 as a boundary | unchanged string from load_raw() |
| `is_six` | raw | true when runs == 6 as a boundary | unchanged string from load_raw() |
| `is_wicket` | raw | true exactly when dismissal_type is non-empty | unchanged string from load_raw() |
| `dismissal_type_id` | raw | Numeric code of dismissal_type | unchanged string from load_raw() |
| `dismissal_type` | raw | Dismissal text; two spellings of obstructing the field | unchanged string from load_raw() |
| `dismissed_player_id` | raw | Player dismissed as recorded (5 non-wicket rows carry an id, 1 wicket row lacks one) | unchanged string from load_raw() |
| `extras_type` | raw | None, wide, Overstep (no-ball), other (no-ball-type, inferred), legbyes, byes, Penalty | unchanged string from load_raw() |
| `extras1_runs` | raw | All extras runs on the ball except extras_2_runs | unchanged string from load_raw() |
| `extras_2_runs` | raw | Second extras amount: byes / leg-byes off a no-ball (inferred) | unchanged string from load_raw() |
| `pace_or_spin` | raw | Pace or Spin of the bowler | unchanged string from load_raw() |
| `bowl_speed` | raw | Speed; 0 = not recorded, -1 invalid; not used | unchanged string from load_raw() |
| `stroke` | raw | Shot name as in source | unchanged string from load_raw() |
| `delivery_style` | raw | Delivery description as in source | unchanged string from load_raw() |
| `over_or_around` | raw | Over or Around the wicket | unchanged string from load_raw() |
| `on_or_off` | raw | Off-side / On-side | unchanged string from load_raw() |
| `delivery_ist_time` | raw | Recorded clock time with a 'UTC' label; actually IST for 2022-23 and UTC from 2024 (see coverage) | unchanged string from load_raw() |
| `season` | derived | Season of the match | calendar year of the first-ball date of the match (no season column in raw) |
| `match_date` | derived | Match date | date part of the earliest delivery_ist_time in the match (recorded clock) |
| `ts_ist` | derived | Delivery time on an IST clock | delivery_ist_time as is for 2022-23; +5h30 from 2024 (clock claim, section 3) |
| `is_super_over` | derived | Super-over ball | innings in (3, 4) |
| `phase` | derived | Phase of the innings | overid 1-6 Powerplay, 7-15 Middle, 16-20 Death (config.phase_of); 'SuperOver' for innings 3-4 |
| `is_wide` | derived | Wide | extras_type == 'wide' |
| `is_noball` | derived | No-ball (or no-ball-type) | extras_type in ('Overstep', 'other') |
| `noball_kind` | derived | Source of the no-ball flag | 'Overstep', 'other_inferred' or empty |
| `legal_ball` | derived | Legal delivery for the bowler | not is_wide and not is_noball |
| `ball_faced` | derived | Ball faced by the batter | not is_wide (a no-ball counts) |
| `bat_runs` | derived | Runs off the bat | runs |
| `wide_runs` | derived | Wide runs | extras1_runs when is_wide |
| `noball_runs` | derived | No-ball penalty runs | extras1_runs when is_noball |
| `bye_runs` | derived | Byes | extras1_runs when extras_type == 'byes' |
| `legbye_runs` | derived | Leg-byes | extras1_runs when extras_type == 'legbyes' |
| `penalty_runs` | derived | Penalty runs | extras1_runs when extras_type == 'Penalty' (none in IPL) |
| `extras2_runs` | derived | Second extras amount | extras_2_runs; byes or leg-byes off a no-ball, split unknown |
| `total_runs` | derived | All runs added to the team score on the ball | runs + extras1_runs + extras_2_runs (chase test confirms) |
| `bowler_runs_conceded` | derived | Runs charged to the bowler | bat_runs + wide_runs + noball_runs (Part 5) |
| `is_bowler_wicket` | derived | Wicket credited to the bowler | dismissal_type in Bowled, Caught, LBW, Stump, Hit Wicket (Part 5) |
| `dismissal_kind` | derived | Dismissal with spellings merged | dismissal_type with 'Obstracting' changed to 'Obstructing the field' |
| `player_out_id` | derived | Batter who was dismissed (resolved) | dismissed_player_id on wicket rows; inferred when missing; empty on non-wicket rows |
| `player_out_source` | derived | How player_out_id was set | 'raw' or the inference used |
| `is_run_out` | derived | Run-out | dismissal_type == 'RunOut' |
| `is_retired` | derived | Batter retired on this ball | dismissal_type == 'Retire Out', or a non-wicket row carrying a dismissed id (retired not out) |
| `retired_player_id` | derived | Batter who retired | player id of the retiring batter, else empty |
| `team_runs_before` | derived | Team score before the ball | sum of total_runs on earlier balls of the innings |
| `wickets_before` | derived | Wickets down before the ball | count of is_wicket true on earlier balls of the innings (includes run-outs and Retire Out) |
| `legal_balls_before` | derived | Legal balls bowled before this ball | count of legal_ball on earlier balls of the innings |
| `target` | derived | Target for the chasing side | innings 1 total_runs + 1, innings 2 balls only (not revised for DLS) |
| `runs_needed_before` | derived | Runs still needed before the ball | target - team_runs_before, innings 2 only |
| `legal_balls_left_before` | derived | Legal balls left before the ball | 120 - legal_balls_before, innings 2 only; wrong when overs were reduced (see reduced_overs_suspected) |
| `reduced_overs_suspected` | derived | Match flagged for suspected reduced overs / DLS | match-level flag from matches_ipl.csv |
| `impact_player_era` | derived | Impact Player era | season >= 2023 |
| `is_playoff_match` | derived | Playoff match (provisional) | last 4 matches of the season by date order |

## Part B. Metrics

### B1. Glossary (shown in the dashboard and the deliverables)

| Term | Plain meaning |
| :--- | :--- |
| **Pressure Index (0–100)** | How much a ball could swing the match result, ranked against earlier balls; 80+ = High pressure. |
| **Leverage** | The expected size of the win-probability swing on a ball, given what usually happens in that situation. |
| **Win probability** | The batting side's chance of winning before a ball, from a model trained on earlier seasons only. |
| **WPA (win probability added)** | How much a player's ball changed his team's chance of winning (in percentage points). |
| **Runs Above Expected (RAE)** | Runs scored minus what an average batter would score on the same balls in the same situations. |
| **Runs Saved vs Expected (RSE)** | Runs an average bowler would concede on the same balls minus the runs actually conceded. |
| **Shrinkage** | Pulling small samples toward the average so a few lucky balls can't top a ranking. |
| **80% range** | The range we are 80% sure the true value sits in, from resampling the player's matches. |
| **Consistency** | Share of seasons (with ≥30 High-pressure balls) in which the player was above expected. |
| **Clutch Reliability Score** | 0–100 historical pressure-performance indicator within role; roughly a percentile. Not a forecast. |
| **Backtest** | Score built from earlier seasons only, then checked against the next season's pressure performance. |
| **Too close to call** | Two players whose 80% ranges overlap: the data can't say who is better. |
| **[ASSUMPTION]** | A value the data can't supply and the web couldn't verify here; stated with its reason. |

### B2. Score components and score columns (`step4_scores_*.csv`)

| Name | Meaning |
| :--- | :--- |
| S | Skill under pressure: shrunk runs above expected per ball (batters) or runs saved vs expected per ball (bowlers) on High-pressure balls, recency-weighted |
| I | Match impact: shrunk win probability added per High-pressure ball |
| H | Holds up: shrunk difference between Low- and High-pressure form |
| C | Consistency: share of seasons (at least 30 High balls) above expected, shrunk toward the role mean |
| Z | Weighted sum of standardised components (z-scores) before conversion to 0-100 |
| score | Clutch Reliability Score: 100 x normal CDF of Z / sd(Z), among scorable players of the role |
| score_lo80, score_hi80 | 80% range of the score from resampling the player's matches |
| S_raw, I_raw, H_raw | Components before shrinkage |
| S_lo80, S_hi80 | 80% range of the skill component |
| n_hi_w, n_lo_w | Recency-weighted number of High- and Low-pressure balls |
| hi_qual_n | Number of High-pressure balls (faced or bowled) used for the player |
| seasons_assessed, seasons_positive | Seasons with enough High balls; seasons where the player was above expected |
| rank | Rank within role by score |
| bat_score, bowl_score (all-rounders) | The batting and bowling scores that are averaged 50/50 |
| combined_wpa_per_match | Batting plus bowling win probability added, per match (fraction of 1) |

### B3. Descriptive player metrics (`step3_batting_metrics.csv`, `step3_bowling_metrics.csv`)

These describe a player and are not part of the score unless listed in B2. Prefix `High_` or `Low_` = on High- or Low-pressure balls. Win probability added (WPA) is stored as a fraction of 1 (1.0 = 100 percentage points).

| Column pattern | Meaning |
| :--- | :--- |
| `*_balls`, `*_legal`, `*_deliveries` | Balls faced (batters), legal balls bowled, or all deliveries bowled including wides and no-balls |
| `*_runs` | Runs scored (batters: off the bat) or conceded (bowlers) |
| `*_outs`, `*_wkts` | Times dismissed (batters) or wickets taken (bowlers) |
| `*_sr` | Strike rate: runs per 100 balls faced |
| `*_avg` | Average: runs per dismissal |
| `*_econ` | Economy: runs conceded per over (legal balls) |
| `*_balls_per_out`, `*_balls_per_wkt` | Balls per dismissal or per wicket |
| `*_dot_pct` | Percentage of balls with no run off the bat (batters) or no runs conceded (bowlers) |
| `*_boundary_pct` | Percentage of balls where the bat scored 4 or 6 (batters) or conceded 4 or 6 (bowlers) |
| `*_rae_per100` | Runs Above Expected per 100 balls (batters) |
| `*_rse_per100` | Runs Saved vs Expected per 100 balls (bowlers) |
| `*_wpa_per100`, `*_wpa_total` | Win probability added, per 100 balls and in total |
| `pressure_drop_per100` | Low-pressure minus High-pressure runs above (or saved vs) expected per 100 balls; positive = worse under pressure |
| `High_rae_per100_pace`, `_spin`, `_balls_pace`, `_balls_spin` | High-pressure RAE per 100 against pace and spin, and the balls behind it |
| `High_rae_per100_death`, `_setting`, `_chasing` | High-pressure RAE per 100 in the death overs, when batting first (setting) and when chasing, with `_balls_*` counts |
| `High_rse_per100_vs_lhb`, `_vs_rhb` | High-pressure RSE per 100 against left- and right-hand batters, with `_balls_vs_*` counts |
| `High_rse_per100_death`, `death_econ_all`, `death_legal_all` | High-pressure RSE per 100 in the death overs; death-overs economy and legal balls over all pressure levels |
| `seasons` | Seasons in which the player appears |
| `player_id`, `player_name` | One player, one ID, from the player map (Step 0) |

### B4. Auction table columns (`step5_*.csv`)

| Column | Meaning |
| :--- | :--- |
| tier | Must-Back (lower end of 80% range at or above 50, best gap fit), Value Pick (score 60+, Regular or Emerging price), Hidden Gem (score 60+, smallest samples) |
| price_band, walk_away_cr | Rule-based price band in Rs crore and its top, the walk-away price [ASSUMPTION A6] |
| price_tier | Established, Regular or Emerging, from seasons with 10+ matches [A6] |
| availability | Whether the player is in the auction pool: UNKNOWN [A2], likely retained [A3] or RR squad [A1] |
| risk_tags | Plain-language risks: sample size, short record, age or injury UNKNOWN |
| fills_gaps | RR gap the player's batting or bowling role could fill; derived from role, not from his own phase record |
| fit_weight | 1.5 if the player fills a measured RR gap, else 0.6 [A10] |
| value | score / 100 x fit_weight, the quantity the budget plan maximises [A10] |
| rr_group_per100, league_per100, gap_vs_league_per100 | RR and league runs above (batting) or saved (bowling) per 100 High-pressure balls, and the difference |

## Part C. Shared definitions (from `logs/DEFINITIONS.md`)

| Term | Definition |
| :--- | :--- |
| **Balls faced (batter)** | every delivery except wides. A no-ball counts as a ball faced. |
| **Batter runs** | runs off the bat only. No byes, leg-byes, wides, or no-ball penalty runs. |
| **Legal balls (bowler)** | deliveries that are not wides or no-balls. Overs and economy use legal balls. |
| **Runs conceded (bowler)** | runs off the bat plus wides and no-balls. Byes, leg-byes, and penalty runs are not charged to the bowler. |
| **Bowler's wickets** | bowled, caught, caught and bowled, lbw, stumped, hit wicket. Run-outs and retirements are not the bowler's. |
| **Dismissals (batter)** | charged to the player who was out, who is not always the striker (run-outs). |
| **Phases** | Powerplay = overs 1–6, Middle = overs 7–15, Death = overs 16–20. |
| **Super overs** | left out of all main metrics and reported separately. |
| **IDs** | one player, one ID; one franchise, one ID, from the maps built in Step 0. |

### How the dataset encodes these concepts (confirmed in Step 0)

| Concept | Column(s) and rule |
| :--- | :--- |
| One row | One delivery, wides and no-balls included. Unique key: `match_id`, `innings`, `innings_ball_num` (no duplicates; numbering 1..N in every innings) |
| IPL match | Both teams are among the 10 franchise ids: 1 CSK, 2 MI, 3 RR, 4 PBKS, 5 RCB, 7 DC, 8 KKR, 242 SRH, 3508 GT, 3509 LSG. 367 of 867 matches. No match mixes IPL and non-IPL ids. The rest are excluded from all metrics (D3) |
| Season | No season column. Season = calendar year of the first-ball date (`delivery_ist_time`). IPL runs March to June |
| Clock | `delivery_ist_time` is labelled UTC on every row. 2022-23 values are IST, 2024 onward UTC (add 5h30 for IST). `ts_ist` in the ball table does this |
| Super over | `innings` 3 or 4 (2 IPL matches: 40725\|50359). Left out of the main metrics and reported separately. Innings 1 and 2 hold 87,673 balls, super overs 14 |
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
