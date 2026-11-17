# Data audit — `ball_by_ball.csv` (rebuilt from Parts 1–5)

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

In Parts 2 and 4, a block of about 735 KB of null bytes replaces about 3,600 balls each. The damaged line in each part (file lines 67127 and 130504) is the start of one row joined to the end of a different row. Neither can be read as a 33-field record. `scripts/load.py` keeps both lines aside in `corrupted_rows()` and leaves them out of the analysis frame.

The file is sorted by `match_id`, so the loss can be located exactly:

| Gap | Matches with partial data | Matches lost entirely | Relevance |
|---|---|---|---|
| Part 2 | 23673 BAN v AFG (2023-07-14): inns 2 stops at ball 43. 25159 ENG v NZ (2023-09-02): inns 1 balls 1–117 missing | Every match between them (mid-July to end of Aug 2023 T20Is) | Not IPL |
| Part 4 | 40736 CSK v SRH (2025-04-25): only 44 balls of inns 1. 40752 RCB v LSG (2025-05-27): all of inns 1 and inns 2 balls 1–21 missing | **IPL 2025 match ids 40737–40751 (15 matches)** | **IPL 2025 has 59 matches here, not about 73** |

The IPL 2025 gap covers fixtures from 26 Apr to the 8 May suspension. This is inferred from the public fixture list, not from the data. It likely includes RR v GT (28 Apr), RR v MI (1 May) and KKR v RR (4 May).

**A clean copy of Parts 2 and 4 would restore this data.** Without one, every IPL 2025 figure is short by about 20%.

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
