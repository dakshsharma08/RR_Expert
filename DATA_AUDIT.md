# Data audit — `ball_by_ball.csv` (rebuilt from Parts 1–5)

> **Status: not yet validated for analysis.** Parts 2 and 4 contain damage. See `DATA_RECOVERY_REPORT.md`. Clutch Index work is paused until a replacement passes `scripts/validate_replacement.py`.

## 1. Merge and validation

`scripts/merge_parts.py` glues Part 1 → Part 5 together byte for byte. It keeps one header and changes no values.

| Part | Data rows | Clean 33-field rows | Damaged rows | Null bytes |
|---|---:|---:|---:|---:|
| 1 | 40,000 | 40,000 | 0 | 0 |
| 2 | 40,000 | 39,999 | 1 | 737,858 |
| 3 | 40,000 | 40,000 | 0 | 0 |
| 4 | 40,000 | 39,999 | 1 | 732,429 |
| 5 | 33,775 | 33,775 | 0 | 0 |
| **Merged** | **193,775** | **193,773** | **2** | 1,470,287 |

Checks:
- All 5 parts are included, and the row total equals the sum of the parts.
- There are 33 columns, and the header appears once. No header rows are left inside the data.
- Rows match Part 1 → Part 5 in their original order, row by row.
- There are 0 exact duplicate rows and 0 duplicate `(match_id, innings, innings_ball_num)` keys.
- Each seam continues ball for ball: 17737 b122→b123, 30070 b70→b71, 40038 b64→b65, 48017 b13→b14.
- Merged sha256: `b708b2d9…6513e9a473c92e2e19efe440fb1a7de93526`. The committed `data/ball_by_ball.csv.gz` decompresses to exactly this file.
- The upload hashes match the files as received, so the damage was already in the source files.

## 2. Damage: two blocks of null bytes

> **Superseded.** For exact byte offsets, rows, matches, what can and cannot be verified, and corrections, see `DATA_RECOVERY_REPORT.md`.

In brief:
- Part 2 holds 737,858 zero bytes, and Part 4 holds 732,429.
- In each, one line is damaged: merged file lines 67127 and 130504. These lines are kept as they are, and the loader leaves them out of the analysis frame.
- **Block 1** cuts short 23673 BAN v AFG and 25159 NZ v ENG. It also covers every match whose id falls between those two. None are IPL.
- **Block 2** cuts short 40736 CSK v SRH and 40752 LSG v RCB. It also covers every match whose id falls between those two.
- IPL 2025 in this file is missing 15 league fixtures. That count is verified against the league format.
- How many of the 15 are inside Block 2, and which fixtures they are, cannot be determined from this file. The one exception: MI v RR and DC v KKR each have at least one absent fixture.
- My earlier date windows and named fixtures were inferences. They are withdrawn (recovery report, section 9).

## 3. Coverage

- 837 matches, from 2022-01-23 to 2026-11-01. 193,773 usable balls.
- **IPL: 352 matches, 84,086 balls.** Per season: 2022 = 74, 2023 = 74, 2024 = 71, 2025 = 59, 2026 = 74. There are 339 IPL batters and 258 IPL bowlers.
- The rest is T20 internationals and the Emerging/A-team Asia Cup (2024, 2025).
- Team names are inferred from regular players (`scripts/teams.py`). The IPL ids are 1 CSK, 2 MI, **3 RR**, 4 PBKS, 5 RCB, 7 DC, 8 KKR, 242 SRH, 3508 GT, 3509 LSG. No match mixes IPL and non-IPL teams.

## 4. Quirks to respect in analysis

- `bowl_speed = 0` means the speed was not recorded: 38.5% of all balls and 25.6% of IPL balls.
- `delivery_ist_time` is labelled "UTC", but 2022–23 values are real IST (night games start at 19:30), while 2024+ values are real UTC (night games start at 14:00). Two matches have 00:00:00 placeholder times.
- `innings` 3 and 4 are super overs. There are 6 matches with them, including 40725 DC v RR, IPL 2025.
- `dismissal_type` has two spellings, "Obstracting the field" and "Obstructing the field". The original values are kept as is.
- `extras1_runs` holds the extras on the ball. `extras_2_runs` is non-zero on only 36 balls.
- Legitimately short IPL matches (rain or no result), such as 20226 and 50136, are real and are not damage.
