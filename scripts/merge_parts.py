"""Rebuild ball_by_ball.csv from its five sequential parts, byte-for-byte.

Usage: python3 -I scripts/merge_parts.py P1 P2 P3 P4 P5 OUT

* Header kept once (Part 1's); Parts 2-5 headers must match it exactly and are dropped.
* Every data line of every part is copied verbatim, in order (no parsing, typing,
  trimming, re-quoting or re-encoding), so the merged file is the parts glued together.
* Validation re-reads parts and merged file with a CSV parser and checks counts,
  column count, order, embedded headers, duplicates, and corruption (NUL bytes).
"""
import csv, hashlib, sys
from collections import Counter
from pathlib import Path

csv.field_size_limit(sys.maxsize)
parts, out = [Path(p) for p in sys.argv[1:6]], Path(sys.argv[6])

# ---------- merge ----------
header = None
with out.open("wb") as fo:
    for i, p in enumerate(parts, 1):
        lines = p.read_bytes().splitlines(keepends=True)
        if header is None:
            header = lines[0]; fo.write(header)
        elif lines[0].rstrip(b"\r\n") != header.rstrip(b"\r\n"):
            sys.exit(f"Part {i}: header mismatch")
        body = lines[1:]
        if body and not body[-1].endswith(b"\n"):
            body[-1] += b"\n"
        fo.writelines(body)

# ---------- validate ----------
def read(path):
    with open(path, newline="", encoding="utf-8") as f:
        r = csv.reader(f); return next(r), list(r)

hdr0, per_part = None, []
print(f"{'part':<6}{'data rows':>10}{'33-field':>10}{'malformed':>10}{'NUL bytes':>11}")
for i, p in enumerate(parts, 1):
    hdr, rows = read(p); hdr0 = hdr0 or hdr
    assert hdr == hdr0 and len(hdr) == 33
    bad = [r for r in rows if len(r) != 33 or "\x00" in ",".join(r)]
    per_part.append(rows)
    print(f"P{i:<5}{len(rows):>10,}{len(rows)-len(bad):>10,}{len(bad):>10}{p.read_bytes().count(b'\x00'):>11,}")

mhdr, mrows = read(out)
seq = [r for rows in per_part for r in rows]
exp = len(seq)
print(f"\nSum of part data rows        : {exp:,}")
print(f"Merged data rows             : {len(mrows):,}")
print(f"Merged header columns        : {len(mhdr)}")
print(f"Header rows inside data      : {sum(r == mhdr for r in mrows)}")
print(f"Same rows, same order as P1..P5: {mrows == seq}")
print(f"Merged bytes == sum(parts) - 4 repeated headers: "
      f"{out.stat().st_size == sum(p.stat().st_size for p in parts) - 4*len(header)}")
assert len(mhdr) == 33 and len(mrows) == exp and mrows == seq

good = [r for r in mrows if len(r) == 33 and "\x00" not in ",".join(r)]
bad_idx = [k + 2 for k, r in enumerate(mrows) if not (len(r) == 33 and "\x00" not in ",".join(r))]
print(f"Well-formed 33-field rows    : {len(good):,}")
print(f"Corrupted rows (file line #) : {bad_idx}")
full = Counter(tuple(r) for r in good)
print(f"Exact duplicate rows         : {sum(c-1 for c in full.values() if c > 1)}")
key = Counter((r[0], r[1], r[4]) for r in good)
print(f"Duplicate (match_id, innings, innings_ball_num): {sum(c-1 for c in key.values() if c > 1)}")
for i in range(4):
    a, b = per_part[i][-1], per_part[i+1][0]
    print(f"Seam P{i+1}->P{i+2}: last=({a[0]},inn {a[1]},ball {a[4]})  next=({b[0]},inn {b[1]},ball {b[4]})")
print("merged sha256:", hashlib.sha256(out.read_bytes()).hexdigest())
