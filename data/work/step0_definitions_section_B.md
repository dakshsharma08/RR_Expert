## B. How the dataset encodes these (confirmed by Step 0; proposed replacement)

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
