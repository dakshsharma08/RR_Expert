"""Single entry point for the combined ball_by_ball.csv.

load_raw()   -> every well-formed row, all values kept as the original strings.
load()       -> same rows with analysis-typed helper columns added (originals untouched).
The 2 corrupted lines (NUL-byte blocks inside Parts 2 and 4) cannot be parsed into
33 fields; they are returned separately by corrupted_rows() and never silently dropped.
"""
import csv, gzip, sys
from pathlib import Path
import pandas as pd

csv.field_size_limit(sys.maxsize)
_D = Path(__file__).resolve().parent.parent / "data"
DATA = _D / "ball_by_ball.csv"          # rebuilt by merge_parts.py (gitignored)
DATA_GZ = _D / "ball_by_ball.csv.gz"    # committed, byte-identical once decompressed

def _open():
    return open(DATA, newline="", encoding="utf-8") if DATA.exists() else \
           gzip.open(DATA_GZ, "rt", newline="", encoding="utf-8")

def _split():
    good, bad = [], []
    with _open() as f:
        r = csv.reader(f); hdr = next(r)
        for line_no, row in enumerate(r, start=2):
            (good if len(row) == 33 and "\x00" not in "".join(row) else bad).append((line_no, row))
    return hdr, good, bad

def load_raw():
    hdr, good, _ = _split()
    df = pd.DataFrame([r for _, r in good], columns=hdr, dtype=str)
    df.insert(0, "file_line", [n for n, _ in good])
    return df

def corrupted_rows():
    _, _, bad = _split()
    return [(n, [c.replace("\x00", "") for c in r]) for n, r in bad]

def load():
    df = load_raw()
    for c in ["match_id","innings","overid","over_ball_num","innings_ball_num","batting_team_id",
              "bowling_team_id","striker_id","non_striker_id","bowler_id","batting_order","runs",
              "extras1_runs","extras_2_runs"]:
        df["n_" + c] = pd.to_numeric(df[c], errors="coerce")
    df["n_bowl_speed"] = pd.to_numeric(df["bowl_speed"], errors="coerce")
    for c in ["is_four","is_six","is_wicket"]:
        df["b_" + c] = df[c].str.lower().eq("true")
    df["ts"] = pd.to_datetime(df["delivery_ist_time"].str.replace(" UTC", "", regex=False), errors="coerce")
    return df
