# Replacement validation: FAIL

Mode: replace. Inputs: reference Part 1; Part 2 (replacement data/source_parts/Part_2.csv.gz); reference Part 3; Part 4 (replacement data/source_parts/Part_4.csv.gz); reference Part 5

## FAIL
- Part 2 (replacement data/source_parts/Part_2.csv.gz): contains 737,858 NUL (zero) bytes - still damaged.
- Part 2 (replacement data/source_parts/Part_2.csv.gz): 1 rows without exactly 33 fields (file line, fields): [(27127, 38)]
- Part 4 (replacement data/source_parts/Part_4.csv.gz): contains 732,429 NUL (zero) bytes - still damaged.
- Part 4 (replacement data/source_parts/Part_4.csv.gz): 1 rows without exactly 33 fields (file line, fields): [(10504, 21)]
- 2 innings are not numbered 1..N without gaps (match, innings, first, last, count): [(25159, 1, 118, 123, 6), (40752, 2, 22, 117, 96)]
- Window 1 (between match 23673 inns 2 ball 43 and match 25159 inns 1 ball 118): still empty - nothing was recovered for the 737,858 damaged bytes.
- Window 2 (between match 40736 inns 1 ball 44 and match 40752 inns 2 ball 22): still empty - nothing was recovered for the 732,429 damaged bytes.

## WARN
- none

## Checks passed / info
- Intact original rows: 193,773. Found unchanged: 193,773.

## Coverage
```
Matches: 837 before -> 837 after. New: 0. Completed/changed: 0.
IPL seasons (matches total / league; league games per team, 14 = complete):
  2022: 74 -> 74 matches; league 70 -> 70; all teams 14
  2023: 74 -> 74 matches; league 70 -> 70; all teams 14
  2024: 71 -> 71 matches; league 67 -> 67; short: {'RR': 1, 'KKR': 2, 'SRH': 1, 'GT': 2}
  2025: 59 -> 59 matches; league 55 -> 55; short: {'CSK': 3, 'MI': 3, 'RR': 3, 'PBKS': 3, 'RCB': 3, 'DC': 3, 'KKR': 5, 'SRH': 2, 'GT': 3, 'LSG': 2}
  2026: 74 -> 74 matches; league 70 -> 70; all teams 14
  2025 MI v RR league meetings: 0
  2025 DC v KKR league meetings: 0
```
