# data/raw: the dataset as given (never edited)

- `ball_by_ball_v2.csv.gz` is dataset v2: the validated two-part upload, 200,999 balls, 33 columns. It is read-only.
- Content sha256: `01e2b4379edfbab6a6e456d304cb3c70f554cb312ef93d9588f3f32a82cb396e`. This matches `data/MANIFEST_v2.sha256`, and `src/io_raw.py` checks it on every load.
- Provenance: `DATA_AUDIT.md` and `DATA_RECOVERY_REPORT.md` in the repo root.
