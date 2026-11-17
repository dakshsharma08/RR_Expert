"""Load the raw dataset exactly as given, after checking its checksum.

load_raw() returns every value as the original string (no type conversion, no NA guessing),
so nothing is silently changed. Typed columns are added by the step scripts, never here.
"""
import gzip, hashlib, io
import pandas as pd
from config import RAW_PATH, RAW_SHA256, RAW_ROWS, RAW_COLS


def raw_bytes() -> bytes:
    b = gzip.open(RAW_PATH, "rb").read()
    h = hashlib.sha256(b).hexdigest()
    if h != RAW_SHA256:
        raise RuntimeError(f"data/raw checksum mismatch: {h} != {RAW_SHA256}. Refusing to continue.")
    return b


def load_raw() -> pd.DataFrame:
    df = pd.read_csv(io.BytesIO(raw_bytes()), dtype=str, keep_default_na=False, na_filter=False)
    if df.shape != (RAW_ROWS, RAW_COLS):
        raise RuntimeError(f"unexpected shape {df.shape}, expected {(RAW_ROWS, RAW_COLS)}")
    df.insert(0, "row_id", range(len(df)))      # 0-based position in the raw file (line = row_id + 2)
    return df
