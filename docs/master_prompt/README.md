# RR Clutch Index master prompt

**Authoritative source: `MASTER_PROMPT.md`.** It is a byte-for-byte copy of the user's original file, `rr-clutch-index-master-prompt.md` (sha256 `8f258add01b8b3ddc48bd2a9b84a7e0585949a415ce23e1abd72cfb927fff20a`, 31,146 bytes, 387 lines). If any other file disagrees with it, `MASTER_PROMPT.md` wins.

## Per-part files (exact slices of `MASTER_PROMPT.md`)

These exist so that a sub-agent can be given only the part it needs. Each file is an exact slice of the original, with only a final newline added. Rejoining the slices with the original `---` separators reproduces `MASTER_PROMPT.md` exactly; this was checked by script.

| Part | File | Contents |
|---|---|---|
| Title + 1 | `part_1_mission.md` | Title, layout line, the mission |
| 2 | `part_2_how_you_work.md` | Supervisor role, three lenses, settings, team, briefing, folder, gate, one set of numbers, critic, cold reader, parallel work |
| 3 | `part_3_golden_rules.md` | Golden rules 1–7 |
| 4 | `part_4_before_you_start.md` | Up to 3 questions; plan in 10 lines or fewer |
| 5 | `part_5_shared_definitions.md` | 9 shared definitions |
| 6 | `part_6_steps.md` | Steps 0–8 |
| 7 | `part_7_dashboard.md` | Dashboard spec (deliverable A) |
| 8 | `part_8_output_style.md` | Output style |

## Reconciliation with the earlier pasted Parts 1–6

The pasted versions are kept in `superseded_pasted_versions/` as a record only. They were compared with the original word for word, ignoring Markdown formatting.

- **Parts 1–5:** no differences in wording.
- **Part 6:** identical up to the point where the paste was cut off. The paste stopped partway through Step 7 deliverable B, so it was missing:
  - B's final sentences: "Ask me for the dashboard's public URL. If I don't have one yet, leave a clearly marked placeholder; do not invent a link."
  - Deliverables C–F.
  - All of Step 8.
- **Parts 7–8:** these were never pasted. They come only from the original file.

## Section checklist

| Part / Step | Present | Key requirements |
|---|---|---|
| Part 1 Mission | ✓ | Brief, word for word. Readers: selectors (2 minutes) and analysts (deep). Each page: headline → proof → recommendation. Winning = which players, why, at what price, how sure |
| Part 2 How you work | ✓ | Supervisor owns plan, definitions and numbers. Three lenses. Every sub-agent on Sonnet, at high effort. 12 roles. Self-contained briefs. Shared folder: `data/raw`, `data/work`, `outputs/tables`, `outputs/deliverables`, `src`, `logs/` (5 files). A 4-check gate on every work package. One set of numbers. Critic after Steps 1, 4, 5, each deliverable, and final, for 2 rounds; anything still open becomes a named risk. Cold reader. Parallel work |
| Part 3 Golden rules | ✓ | 1 Data truth · 2 External facts VERIFIED/[ASSUMPTION] · 3 No silent changes · 4 Checkpoints (≤10 lines, wait for GO) · 5 Plain language · 6 Honesty over hype · 7 "So what" |
| Part 4 Before you start | ✓ | Up to 3 essential questions, plus a plan in ≤10 lines (packages, what runs in parallel, critic points) |
| Part 5 Shared definitions | ✓ | Balls faced · batter runs · legal balls · runs conceded · bowler's wickets · dismissals · phases · super overs · IDs. Every new metric is added as it is introduced |
| Step 0 Data audit | ✓ | 10 checks: coverage and last date (flag if before end of IPL 2026) · nulls, duplicates, IDs, season labels · player ID map · team ID map · super overs · no-result, abandoned, DLS · extras · playoffs · Impact Player era · outside sanity check. Output: Data Notes table |
| Step 1 Pressure index | ✓ | A: win-probability model (simple, no leakage, Brier score, calibration). B: leverage core, 5 context boosts, correlation check, with and without close-game, Low/Med/High buckets, WPA. Robustness: 2 alternative definitions, top-20 overlap (≥60% or explain). At least 5 example balls |
| Step 2 Fair comparison | ✓ | Adjust for venue, season, opposition, batting position and phase. Runs Above Expected; Runs Saved vs Expected |
| Step 3 Metrics | ✓ | Scope (latest 2 seasons) and minimum samples. 11 batter metrics, 9 bowler metrics. All-rounder weighting. Splits treated as external facts. Reliability: consistency, Empirical Bayes shrinkage, 80% intervals, recency weighting |
| Step 4 Clutch score | ✓ | Formula and weights. "Why not a simple average" in 3 lines. ±10% sensitivity. Backtest over ≥3 seasons with no leakage. Hit rate vs naive baseline, reported honestly |
| Step 5 Auction lens | ✓ | Availability · RR squad gaps · shortlist of 8–10 in 3 tiers · budget optimiser (Plan A/B) · XI + Impact Player + bench · 2 contrarian picks · unsung hero · 3–5 not to chase |
| Step 6 Story | ✓ | Name and thesis · 5-line executive summary · headline → proof → recommendation · glossary |
| Step 7 Deliverables | ✓ | A dashboard · B 6–7 slide PDF (URL placeholder, never an invented link) · C 1-page cheat sheet · D method and limitations note + data dictionary · E notebook · F 60–90 s video script. One at a time, each with a checkpoint |
| Step 8 Final audit | ✓ | 15-item audit table · final critic across all deliverables · audit + findings + uncertainties · handover |
| Part 7 Dashboard | ✓ | Three depths, plus a Simple ⇄ Detailed switch · one offline HTML file under 5 MB · hand-built charts · pre-aggregated data · build order (5) · look and feel (9 rules) · global controls · Tabs 1–7 + player profile card · testing (6 checks) + checkpoint outputs |
| Part 8 Output style | ✓ | Short sentences · tables over paragraphs · sensible rounding (SR to 1 decimal, economy to 2) · uncertainty shown |
