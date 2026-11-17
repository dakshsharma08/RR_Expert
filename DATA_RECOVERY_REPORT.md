# Data recovery report: `ball_by_ball.csv`

## 0. Resolution (two-part upload)

**Status: resolved.** The two-part upload (`ball_by_ball_part_1.csv` + `ball_by_ball_part_2.csv`) passes every check in section 10, with 0 warnings. It is now the active dataset, v2. The full validator output is in `reports/validation_v2_two_part_upload.md`.

**Size and integrity**
- 200,999 data rows and 33 columns, matching your expected total.
- No duplicate rows and no damaged lines.
- All 193,773 intact v1 rows are present, unchanged and in the same order.

**Byte-level proof**
- v2 is the v1 file with only the two damaged lines replaced.
- The replacement bytes are exactly as long as the zero blocks (737,858 and 732,429 bytes). So the blocks had overwritten the data in place, without shifting anything.
- Each recovered stretch begins and ends with exactly the text that survived next to its block.

**What the two blocks really contained (now verified):**

| Block | Rows | Contents |
|---|---:|---|
| 1 | 3,625 | The rest of 23673 BAN v AFG and the start of 25159 NZ v ENG. Plus 15 full T20 internationals: BAN v AFG, IND v WI ×5, NZ v UAE ×3, IND v IRE ×2, SA v AUS ×3, NZ v ENG. Dated 16 Jul – 3 Sep 2023 |
| 2 | 3,601 | The rest of 40736 CSK v SRH and the start of 40752 LSG v RCB. Plus **15 IPL 2025 league matches, ids 40737–40751, dated 26 Apr – 8 May 2025**. RR's three: RR v GT (28 Apr), MI v RR (1 May), RR v KKR (4 May) |

**How the earlier statements held up**
- The size estimate in section 7 was close: about 3,626 and 3,598 rows, against 3,625 and 3,601 actual.
- All 15 absent IPL 2025 league fixtures turned out to be inside Block 2.
- The fixtures I withdrew in section 9 were in fact correct. Withdrawing them was still right, because at the time the data could not verify them.

**What remains, and is not damage**
- **2024:** 3 league games are absent from the source itself, since neither block held any 2024 data. One of them is an RR game.
- **2025:** PBKS v DC appears twice: 40751 stopped after 63 balls, and 43057 is a later full game. RCB v KKR appears once.

Sections 1–11 below describe the state before the two-part upload and are kept as the record.

---

**Status before the two-part upload: not yet validated for analysis. Clutch Index work is paused.**

## 1. Summary

- Two blocks of zero bytes (NUL) sit inside the uploaded files: **737,858 bytes in Part 2** and **732,429 bytes in Part 4**. Each block wipes out roughly 3,600 balls. **Nothing inside either block can be recovered.** Every byte is zero.
- Only the text on either side of each block survives. That gives partial values for 4 balls, which pin the exact edges of each gap.
- **Block 1** is all non-IPL: two T20 internationals are cut short, plus every match stored between them.
- **Block 2** is IPL 2025: CSK v SRH and LSG v RCB are cut short, plus every match stored between them.
- **IPL 2025 in this file is missing 15 league fixtures.** That count is verified against the league format that the data itself confirms. Which fixtures they are can be pinned down only for 2 team pairs. How many of the 15 sit inside Block 2 cannot be proven from this file.
- The two blocks were most likely already in your copy of `ball_by_ball.csv` before you split it. **A fresh copy from the original source is needed.** Re-splitting your current copy will reproduce the damage.
- Nothing has been deleted or edited. The original uploads and the merged file are kept as read-only backups with checksums.
- `scripts/validate_replacement.py` checks any replacement files you upload. It passes 20 of 20 self-tests.

## 2. What is preserved (nothing discarded or modified)

| File | What it is | Content sha256 |
|---|---|---|
| `data/source_parts/Part_1..5.csv.gz` | Your 5 uploads, compressed. They decompress to the exact uploaded bytes, NUL blocks included | see `data/MANIFEST.sha256` |
| `data/backup/ball_by_ball.merged_v1.csv.gz` | The current merged dataset: 193,775 data rows, with both damaged lines in place | `b708b2d9…22b9…` (full value in the manifest) |
| `data/MANIFEST.sha256` | Checksums of all six files above | — |

- All six files and the manifest are read-only.
- The validator checks the five source parts against the manifest before every run. It refuses to run if a backup has changed.
- The damaged lines stay in the merged file exactly as they are. `scripts/load.py` keeps them aside, in `corrupted_rows()`, rather than parsing them as balls.

## 3. Exact location of the damage

| | Block 1 | Block 2 |
|---|---|---|
| File | Part 2 | Part 4 |
| Zero bytes in the part file, as [start, end) | [5,523,031, 6,260,889) | [2,135,559, 2,867,988) |
| Zero bytes in the merged file, as [start, end) | [13,690,612, 14,428,470) | [27,381,224, 28,113,653) |
| Length | 737,858 bytes | 732,429 bytes |
| Line holding the damage, part file | line 27,127 (data row 27,126) | line 10,504 (data row 10,503) |
| Same line, merged file | line 67,127 (data row 67,126) | line 130,504 (data row 130,503) |
| That line's bytes in the merged file | [13,690,457, 14,428,542) | [27,381,097, 28,113,678) |
| Readable text before the block / after it | 155 bytes / 71 bytes | 127 bytes / 24 bytes |
| Last intact row before the block | 23673, inns 2, ball 43 (2023-07-14 20:00:52) | 40736, inns 1, ball 44 (2025-04-25 14:40:59) |
| First intact row after the block | 25159, inns 1, ball 118 (2023-09-02 00:06:43) | 40752, inns 2, ball 22 (2025-05-27 16:29:41) |

The rest of the file was scanned the same way:

- There are no other NUL bytes and no other control or non-ASCII characters.
- Every other row has exactly 33 fields.
- The file is sorted by `match_id`, and every match sits in one unbroken block.
- In 1,662 of the 1,664 innings, balls are numbered 1..N without gaps. The only 2 exceptions are 25159 inns 1 and 40752 inns 2, both on the edge of a block.
- There are no duplicate balls.
- Each part joins the next one ball for ball.

## 4. What survives around each block

Both damaged lines begin with the start of one row and end with the tail of a different row. The file has two ordering rules: rows are sorted by `match_id`, and each innings is numbered 1..N. The intact data follows both rules everywhere, so each fragment can be placed exactly.

| Fragment | Ball it belongs to | Known values | Lost values |
|---|---|---|---|
| Text before Block 1 | 23673, Bangladesh v Afghanistan, inns 2, over 8.1, ball 44 | Fields 1–29: Shakib Al Hasan (striker) v Rashid Khan, 0 runs, no boundary, no wicket, no extras, Spin, 92.4, Square Cut | `delivery_style`, `over_or_around`, `on_or_off`, time |
| Text after Block 1 | 25159, New Zealand v England, inns 1, ball 117 (the ball before 118) | Leg-byes, 1 extra run, Pace, 147, Flick, Straight, Over, On-side, 2023-09-02 00:05:47 | Fields 1–23: players, runs, wicket flags, ball numbers |
| Text before Block 2 | 40736, CSK v SRH, inns 1, over 8.2, ball 45 | Ravindra Jadeja (striker) v Kamindu Mendis, 0 runs, no four, no six, not a wicket (`fal…` can only be `false`) | Fields 21–33 |
| Text after Block 2 | 40752, LSG v RCB, inns 2, ball 21 | Time 2025-05-27 16:28:46 | Fields 1–32 |

These fragments are not complete rows, so they stay inside the damaged lines and are not added as data. The validator uses them to prove that a replacement fills the exact hole.

## 5. What is missing: verified from the data

**Block 1: no IPL data.**
- **23673, Bangladesh v Afghanistan:** inns 2 is cut off from ball 44 onward. The number of lost balls is unknown.
- **25159, New Zealand v England:** inns 1 balls 1–116 are gone entirely, and ball 117 is partly gone.
- **Every match whose `match_id` falls between 23673 and 25159.** No such ids survive in the file.
- **No IPL 2022, 2023 or 2026 game is hidden here.** Those seasons are complete in the file (see below).

**Block 2: IPL 2025.**
- **40736, CSK v SRH:** inns 1 is cut off from ball 45 onward, and no inns 2 survives.
- **40752, LSG v RCB:** all of inns 1 and inns 2 balls 1–20 are gone, and ball 21 is partly gone.
- **Every match whose `match_id` falls between 40736 and 40752.** No such ids survive in the file.

**IPL completeness, checked against the league format.** The data confirms the format: in 2022, 2023 and 2026, each season has 70 league games plus 4 playoffs. Every team plays exactly 14 league games, every pair of teams meets once or twice, and every team meets exactly 5 opponents twice.

| Season | Matches in file | League games | Teams short of 14 |
|---|---:|---:|---|
| 2022 | 74 | 70 | none: complete |
| 2023 | 74 | 70 | none: complete |
| 2024 | 71 | 67 | GT 2, KKR 2, RR 1, SRH 1. GT and KKR never meet |
| **2025** | **59** | **55** | **KKR 5; CSK, MI, RR, PBKS, RCB, DC, GT 3 each; SRH, LSG 2 each** |
| 2026 | 74 | 70 | none: complete |

What this proves for 2025:
- **15 league fixtures are absent.** The shortfalls add up to 30 team-games, which is 15 fixtures.
- **MI v RR and DC v KKR each have at least one absent fixture.** These pairs never meet in the 2025 data, and every pair meets at least once in each complete season.
- **RR has 11 of its 14 league games in the file.** One of the 3 absent games is against MI. The other two cannot be identified.

## 6. What cannot be determined from this dataset

- **Which 15 fixtures are absent in 2025.**
  - 35,360 different sets of fixtures fit the format rules the data confirms.
  - A stricter rule (two groups of five teams) would narrow this to 6 sets. But only 2022 follows that rule in this data, not 2023 or 2026, so I did not rely on it.
- **How many of the 15 are inside Block 2, and how many were never in the source.**
  - A match washed out without a ball produces no rows, so it can be absent with no damage at all.
  - 2024 shows the source does omit fixtures: 3 league games are absent, nowhere near either block.
- **The dates of the missing matches.**
  - `match_id` order is not date order in this file. Ids are out of date sequence by up to 386 days. For example, 36209 is dated 2025-09-12 but sits among 2024 ids.
  - So the ids on either side of a block do not bound the dates inside it.
- **Whether the 3 absent 2024 fixtures are in a block.**
  - The 2024 IPL ids run from 30,056 to 31,292, far from both blocks.
  - But because ids are not chronological, this cannot be ruled out completely. A clean copy settles it.

## 7. Capacity estimate (an estimate, not a verification)

Average bytes per row and per match come from intact matches of the same kind.

| | Block 1 (2023 T20Is) | Block 2 (IPL 2025) |
|---|---|---|
| Zero bytes | 737,858 | 732,429 |
| Bytes per row (range across matches) | 203.5 (197.8–210.0) | 203.6 (198.6–209.3) |
| Rows the block could hold | ~3,626 (3,514–3,731) | ~3,598 (3,500–3,688) |
| Average full matches that fit | ~15.4 | ~15.0, including the lost parts of 40736 and 40752 |

Block 2 holds about as many bytes as 15 average IPL 2025 matches, minus the missing parts of 40736 and 40752. That fits most of the 15 absent fixtures being inside it. It does not prove it.

## 8. How the damage most likely happened (evidence only)

- **The files arrived intact.** The upload hashes match the files received, so the zero blocks were in your files before upload.
- **The blocks were most likely in `ball_by_ball.csv` before it was split.**
  - Parts 1–4 each hold exactly 40,000 data lines.
  - Parts 2 and 4 reach 40,000 only by counting the damaged line as one row.
  - If an intact file had been split first, each part would have held 40,000 separate rows. Zeroing about 3,600 of them afterwards would leave roughly 36,400 lines, not 40,000.
  - Parts 2 and 4 are also each about 720 KB larger than Parts 1 and 3, which is the size of the block. That is what you get when a file that already contains the block is split by line count.
- **The bytes don't show what caused the damage.** Neither block lines up with any standard disk or download chunk size (512 B, 4 KB, 64 KB, 1 MB).

**What to do:** get a fresh copy of `ball_by_ball.csv` from wherever it originally came from (re-download or re-export). Then validate it as in section 10.

## 9. Corrections to my earlier summary

1. **Withdrawn: date windows.** "Mid-July to end of Aug 2023" and "26 Apr to 8 May 2025" assumed that `match_id` follows date order. It doesn't.
2. **Restated: "15 IPL 2025 matches lost to damage."** The verified fact is that 15 league fixtures are absent. How many of them were lost to the damage is not verified.
3. **Withdrawn: named fixtures.** "RR v GT, RR v MI, KKR v RR" came from the public fixture list, not from this data. The data supports only MI v RR and DC v KKR.

## 10. Validating a replacement

```bash
# only the two repaired parts (they must keep the original row boundaries)
python3 -I scripts/validate_replacement.py --replace 2=Part_2.csv --replace 4=Part_4.csv --report validation.md
# a fresh full file (recommended), or all five re-split parts
python3 -I scripts/validate_replacement.py --full ball_by_ball.csv --out data/ball_by_ball.v2.csv
python3 -I scripts/validate_replacement.py --parts P1.csv P2.csv P3.csv P4.csv P5.csv
```

**PASS requires all of these:**
- The source backups still match the manifest.
- There are no NUL or control bytes.
- The header is exactly the original 33 columns.
- Every row has exactly 33 fields, with valid integers, true/false values, speeds and times.
- Rows are sorted by `match_id`, each match is one block, and every innings is numbered 1..N with no duplicates.
- **All 193,773 intact rows are present, unchanged and in the same order.**
- New rows fall only inside the two damaged gaps.
- Each gap starts and ends with rows that match the surviving fragments exactly.

**WARN, which a person should check but which doesn't fail the file:**
- Different formatting, such as quotes or CRLF line endings, while the values are identical.
- Values never seen in the intact rows.
- New rows that break a rule which holds on every intact row. For example, `is_wicket=true` must come with a `dismissal_type`.

**What the report lists:**
- Every new or completed match.
- IPL season counts, before and after.
- Whether every 2025 team now has 14 league games.

**Rules for `--out`:**
- It writes only on PASS.
- It never overwrites an existing file.
- It never writes into `data/backup` or `data/source_parts`.

The active dataset changes to v2 only after you confirm.

**Self-tests:** `scripts/test_validate_replacement.py` (20/20 pass). The tests build synthetic repair files in a temporary folder and delete them afterwards. They check that correct repairs pass, in each input form, and that each tampering case fails: a changed value, a dropped row, a duplicate, a changed header, rows outside the gaps, a fragment mismatch, and NUL bytes.

## 11. Quirks in the source data (not damage, kept as they are)

- `bowl_speed = -1`: 1 row (match 14108).
- Striker is the same player as non-striker: 1 row (37086).
- `extras_type` and `extras1_runs` disagree: 2 rows (36097, 37099).
- `dismissal_type` and `dismissed_player_id` disagree: 13 rows. In 12, a player is named with no dismissal; 1 "Retire Out" has no player.
- The time goes backwards once within each of 8 matches.
- Times are labelled UTC but are really IST for 2022–23.
- `innings` 3 and 4 are super overs.
