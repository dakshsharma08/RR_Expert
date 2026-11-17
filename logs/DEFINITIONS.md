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

## B. How the dataset encodes these (PROVISIONAL until Step 0 confirms)

Step 0 (Data Auditor) confirms or corrects every line marked *(to confirm)*, then replaces this section with the final mapping.

| Concept | Column(s) and rule |
|---|---|
| One row | One delivery. Unique key: `match_id`, `innings`, `innings_ball_num` |
| IPL match | Both teams are among the 10 franchise ids: 1 CSK, 2 MI, 3 RR, 4 PBKS, 5 RCB, 7 DC, 8 KKR, 242 SRH, 3508 GT, 3509 LSG. Every other match is non-IPL and is excluded from all metrics (user instruction, D3) |
| Season | Calendar year of the match date. IPL runs March–June |
| Super over | `innings` 3 or 4. Left out of the main metrics and reported separately |
| Phase | From `overid`: 1–6 Powerplay, 7–15 Middle, 16–20 Death |
| Batter runs | `runs` *(to confirm: runs off the bat only)* |
| Extras on a ball | `extras1_runs` *(to confirm)*. `extras_2_runs` is non-zero on 36 balls: **meaning undecoded** |
| Extras type | `extras_type`: None, wide, Overstep (= no-ball *(to confirm)*), legbyes, byes, Penalty, **other (254 balls, undecoded)** |
| Wicket | `is_wicket` = true exactly when `dismissal_type` is non-empty (holds on every row) |
| Bowler's wickets | `dismissal_type` in Bowled, Caught (includes caught and bowled), LBW, Stump, Hit Wicket. **Not** the bowler's: RunOut, Retire Out, Obstracting/Obstructing the field |
| Player dismissed | `dismissed_player_id` *(13 rows disagree with `dismissal_type`: resolve in Step 0)* |
| Batting hand, pace/spin, bowling type | `batting_type` (RHB/LHB), `pace_or_spin`, `bowling_type`, recorded on every ball. Used as data (C2) once Step 0 confirms each player has one consistent value |
| Bowling speed | `bowl_speed` is **not used**: 0 means missing on ~26% of IPL balls |

## C. Scope rules from the approved decisions

- **Counted stat:** an exact count or ratio taken from the data, never altered (Golden Rule 1).
- **Model estimate:** an output of a model, such as win probability or expected runs. It is always labelled, and shown with its method and an 80% interval where it is ranked (C1).
- **Seasons:** 2022 is training data only. Pressure Index, WPA and player pressure metrics cover 2023–2026 (D10).
- **Earlier data only:** every historical ball is judged only with information from matches before its own (D4, D11, D18).
- **Close-game boost:** never part of the main score; it is reported only as a separate comparison (D8).
- **What the score means:** the Clutch Reliability Score is a historical pressure-performance indicator. Its ability to predict IPL 2027 is not established (D15).

## D. Metric glossary

One line per metric, added as each metric is introduced. Format: **Name**: plain-language meaning (step, owner).

*(none yet)*
