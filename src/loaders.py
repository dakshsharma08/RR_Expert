"""Typed loaders for the Step 0 tables. Raw string columns stay untouched in the parquet; we only cast keys here."""
import pandas as pd
from config import WORK

INT_KEYS = ["match_id", "innings", "innings_ball_num", "overid", "over_ball_num"]


def load_balls() -> pd.DataFrame:
    b = pd.read_parquet(WORK / "balls_ipl.parquet")
    for c in INT_KEYS:
        b[c] = b[c].astype(int)
    b["batting_order_n"] = pd.to_numeric(b.batting_order, errors="coerce")
    b["target"] = b.target.astype("float")
    b["runs_needed_before"] = b.runs_needed_before.astype("float")
    b["legal_balls_left_before"] = b.legal_balls_left_before.astype("float")
    return b
