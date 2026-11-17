# Data audit — `ball_by_ball.csv`

> **Status: validated. v2 is the active dataset.** It rebuilds the original file from your two-part upload: 200,999 balls, 33 columns, no damage. The earlier five-part upload (v1) had two blocks of zero bytes; v2 fills both holes exactly. The history is in `DATA_RECOVERY_REPORT.md`.

## 1. Active dataset (v2)

`scripts/merge_parts.py` joins `ball_by_ball_part_1.csv` and then `ball_by_ball_part_2.csv`, byte for byte. It keeps one header and changes no values.

| Part | Data rows | 33-field rows | Damaged rows | Null bytes |
|---|---:|---:|---:|---:|
| 1 | 100,500 | 100,500 | 0 | 0 |
| 2 | 100,499 | 100,499 | 0 | 0 |
| **Merged** | **200,999** | **200,999** | **0** | **0** |

Checks, all passed:
- **Row count:** 200,999, which is the sum of the two parts and the total you expected.
- **Columns:** exactly 33. The header appears once, and is byte-identical to the original upload's header.
- **Order:** rows run Part 1 then Part 2, in their original order, row by row.
- **Seam:** it continues ball for ball, from match 32135 innings 2 ball 35 to ball 36.
- **Duplicates:** none, either as identical rows or as the same `(match_id, innings, innings_ball_num)`.
- **Gaps:** none. In all 1,724 innings, balls are numbered 1..N.
- **Sorting:** the file is sorted by `match_id`, and each match is one unbroken block.
- **Characters:** no NUL, control, non-ASCII, quote or carriage-return characters.

**Compared with v1** (`scripts/validate_replacement.py`, report in `reports/validation_v2_two_part_upload.md`), the verdict is **PASS** with 0 warnings:
- All 193,773 intact v1 rows are present, unchanged and in the same order.
- The 7,226 new rows (3,625 + 3,601) sit only inside the two damaged gaps. They begin and end with exactly the text that survived on either side of each block.
- At the byte level, v2 is v1 with only the two damaged lines replaced. The replacement bytes are exactly as long as the zero blocks (737,858 and 732,429 bytes), and the two files are the same size (41,071,837 bytes).

Fingerprints: the merged file's sha256 is `01e2b437…f554cb312ef93d9588f3f32a82cb396e`. Checksums of the sources and the committed `data/ball_by_ball_v2.csv.gz` are in `data/MANIFEST_v2.sha256`.

## 2. Files

| Path | Role |
|---|---|
| `data/ball_by_ball_v2.csv.gz` | **Active dataset**, read-only. `scripts/load.py` reads it, or reads the rebuilt `data/ball_by_ball_v2.csv` if present |
| `data/source_parts_v2/Part_1..2.csv.gz` | Your two-part upload, unchanged, read-only |
| `data/source_parts/Part_1..5.csv.gz` | The original five-part upload, with damage, read-only |
| `data/backup/ball_by_ball.merged_v1.csv.gz` | The v1 merged file, with damage, read-only |
| `data/ball_by_ball.csv.gz` | The v1 merged file, kept but no longer used |

## 3. Coverage

- 867 matches, from 2022-01-23 to 2026-11-01, with 200,999 balls.
- **IPL: 367 matches and 87,687 balls**, with 341 batters and 260 bowlers. Matches by season:

  | 2022 | 2023 | 2024 | 2025 | 2026 |
  |---:|---:|---:|---:|---:|
  | 74 | 74 | 71 | 74 | 74 |

- **IPL league format, confirmed by the data:** in 2022, 2023 and 2026, each team plays 14 league games and there are 4 playoffs.
- **2024 has 67 league games.** GT and KKR are 2 short, RR and SRH 1 short, and GT never meets KKR. These games are absent from the source itself; neither damaged block contained any 2024 data.
- **2025 has 70 league games.**
  - PBKS v DC appears twice: 40751 (8 May) stopped after 63 balls of innings 1, and 43057 (24 May) is a full game.
  - RCB v KKR appears once. The only unused id in the 2025 range, 40761, was never in the source.
  - Every other team has 14 league games, **RR included**.
- The other 500 matches are T20 internationals and the Emerging/A-team Asia Cups (2024, 2025).
- Team names are inferred from each team id's regular players (`scripts/teams.py`). The IPL ids are 1 CSK, 2 MI, **3 RR**, 4 PBKS, 5 RCB, 7 DC, 8 KKR, 242 SRH, 3508 GT, 3509 LSG. No match mixes IPL and non-IPL teams.

## 4. Quirks to respect in analysis

These come from the source. Every value is kept exactly as it is.

- **`bowl_speed`:**
  - 0 means the speed was not recorded. That's 38.7% of all balls and 25.9% of IPL balls.
  - One row has -1 (match 14108).
- **Times:**
  - `delivery_ist_time` is labelled "UTC". 2022–23 values are actually IST (night games start at 19:30); 2024 onwards they are actually UTC (night games start at 14:00).
  - 4 matches have 00:00:00 placeholder times, on 42 balls in total.
  - In 9 matches, the time steps backwards once.
- **Innings:** `innings` 3 and 4 are super overs. 6 matches have them, including 40725 DC v RR in IPL 2025.
- **Short matches:** rain-affected and no-result games are real, not damage. Examples: 20226 and 50136, and in 2025, 40737, 40748 and 40751.
- **Dismissals:**
  - `dismissal_type` uses two spellings: "Obstracting the field" (2 balls) and "Obstructing the field" (1 ball).
  - `dismissal_type` and `dismissed_player_id` disagree on 13 rows.
- **Extras:**
  - `extras1_runs` holds the extras on a ball. `extras_2_runs` is non-zero on only 36 balls.
  - `extras_type` and `extras1_runs` disagree on 2 rows.
- **Players:** 1 row has the same player as striker and non-striker (match 37086).
