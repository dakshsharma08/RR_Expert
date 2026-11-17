# DATA NOTES

Every drop, merge, filter, fix or obstacle is logged here (Golden Rule 3). The raw dataset is never edited.

## Before Step 0: provenance

| Issue | Rows affected | Action taken | Why |
|---|---|---|---|
| The first five-part upload had two blocks of zero bytes (in Parts 2 and 4) | 2 damaged lines, covering about 7,226 balls | Not used. Kept read-only in `data/source_parts/` and `data/backup/` | Damaged. See `DATA_RECOVERY_REPORT.md` |
| Replaced by the two-part upload (v2) | 200,999 rows | v2 adopted after `scripts/validate_replacement.py` passed with 0 warnings. `data/raw/ball_by_ball_v2.csv.gz` is a checksum-verified copy | All intact v1 rows unchanged, and the gaps filled exactly. See `DATA_AUDIT.md` |

## Step 0: Data Audit

*(Written by the Data Auditor in Step 0.)*
