<!-- Verbatim copy of Part 5 of the RR Clutch Index Master Prompt, as provided by the user. Do not edit. -->
PART 5 — SHARED DEFINITIONS

Write these to logs/DEFINITIONS.md before any analysis and point every sub-agent to the file. These are the places where ball-by-ball work most often goes quietly wrong, and where two sub-agents can produce numbers that don't match.

- Balls faced (batter): every delivery except wides. A no-ball counts as a ball faced.
- Batter runs: runs off the bat only. No byes, leg-byes, wides, or no-ball penalty runs.
- Legal balls (bowler): deliveries that are not wides or no-balls. Overs and economy use legal balls.
- Runs conceded (bowler): runs off the bat plus wides and no-balls. Byes, leg-byes, and penalty runs are not charged to the bowler.
- Bowler's wickets: bowled, caught, caught and bowled, lbw, stumped, hit wicket. Run-outs and retirements are not the bowler's.
- Dismissals (batter): charged to the player who was out, who is not always the striker (run-outs).
- Phases: Powerplay = overs 1–6, Middle = overs 7–15, Death = overs 16–20.
- Super overs: left out of all main metrics and reported separately.
- IDs: one player, one ID; one franchise, one ID, from the maps built in Step 0.

Add every new metric to this file, with its one-line plain-language meaning, the moment it is introduced. The file becomes the glossary.
