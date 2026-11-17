#!/usr/bin/env python3
"""Validate replacement files for the damaged ball_by_ball.csv parts.

Reference = the untouched originals in data/source_parts/ (checked against data/MANIFEST.sha256).
The candidate dataset is built from what you supply, then checked against the reference.
Nothing in data/source_parts, data/backup or data/ball_by_ball.csv(.gz) is ever written.

Usage (run from the repo root):
  # replace only some parts (others come from the reference originals)
  python3 -I scripts/validate_replacement.py --replace 2=/path/Part_2.csv --replace 4=/path/Part_4.csv
  # all five parts (use this if the clean file was re-split at different row boundaries)
  python3 -I scripts/validate_replacement.py --parts P1.csv P2.csv P3.csv P4.csv P5.csv
  # one complete ball_by_ball.csv
  python3 -I scripts/validate_replacement.py --full /path/ball_by_ball.csv
Options:
  --out PATH      write the validated merged dataset here, only if the verdict is PASS
                  (refuses to overwrite an existing file or anything under data/backup, data/source_parts)
  --report PATH   also write the full report as Markdown
  --reference-dir DIR   use a different reference set (used by the self-tests); skips the manifest check
Input files may be .csv or .csv.gz. Exit code: 0 PASS, 1 FAIL, 2 usage/IO error.

Verdict levels: FAIL = the candidate is not a faithful repair (must be fixed before use);
WARN = allowed, but a person should look (e.g. a value never seen in the intact rows).
"""
import argparse, csv, gzip, hashlib, io, re, sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from teams import IPL, NAME, is_ipl_match  # noqa: E402

csv.field_size_limit(sys.maxsize)   # the damaged lines are ~735 KB long

REF_DIR = ROOT / "data" / "source_parts"
MANIFEST = ROOT / "data" / "MANIFEST.sha256"
PROTECTED = [ROOT / "data" / "backup", ROOT / "data" / "source_parts",
             ROOT / "data" / "ball_by_ball.csv", ROOT / "data" / "ball_by_ball.csv.gz"]

INT_COLS = ["match_id", "innings", "overid", "over_ball_num", "innings_ball_num", "batting_team_id",
            "bowling_team_id", "striker_id", "non_striker_id", "bowler_id", "batting_order", "runs",
            "extras1_runs", "extras_2_runs"]
OPT_INT_COLS = ["dismissal_type_id", "dismissed_player_id"]
BOOL_COLS = ["is_four", "is_six", "is_wicket"]
CAT_COLS = ["batting_type", "bowling_type", "dismissal_type", "extras_type", "pace_or_spin", "stroke",
            "delivery_style", "over_or_around", "on_or_off", "dismissal_type_id"]
RE_INT, RE_OPT_INT = re.compile(r"\d+"), re.compile(r"\d*")
RE_SPEED = re.compile(r"-?\d+(\.\d+)?")
RE_TS = re.compile(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC")


# ----------------------------------------------------------------------------- reading
def read_bytes(path):
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(p)
    b = p.read_bytes()
    return gzip.decompress(b) if b[:2] == b"\x1f\x8b" else b


class Source:
    """One input file: header, rows (values), raw lines (exact text) and file-level findings."""

    def __init__(self, label, data: bytes):
        self.label, self.findings = label, []      # findings: (level, message)
        self.nul = data.count(b"\x00")
        self.crlf = b"\r\n" in data
        self.ends_nl = data.endswith(b"\n")
        try:
            text = data.decode("ascii")
            self.non_ascii = 0
        except UnicodeDecodeError:
            text = data.decode("utf-8", errors="replace")
            self.non_ascii = sum(1 for ch in text if ord(ch) > 127)
        self.ctrl = len(re.findall(r"[^\t\n\r\x20-\x7e\u0080-￿]", text)) - self.nul
        self.quoted = '"' in text
        rows = list(csv.reader(io.StringIO(text, newline="")))
        self.header, self.rows = (rows[0] if rows else []), rows[1:]
        raw = text.replace("\r\n", "\n").split("\n")
        if raw and raw[-1] == "":
            raw.pop()
        # raw text per row is only meaningful when no quoting is used (then 1 line == 1 row)
        self.raw = raw[1:] if not self.quoted and len(raw) - 1 == len(self.rows) else None


def load_reference(ref_dir, check_manifest):
    parts = []
    if check_manifest:
        want = {}
        for line in MANIFEST.read_text().splitlines():
            if line and not line.startswith("#"):
                h, n, _gz, path = line.split()
                want[path] = (h, int(n))
    for i in range(1, 6):
        f = Path(ref_dir) / f"Part_{i}.csv.gz"
        b = read_bytes(f)
        if check_manifest:
            h, n = want[f"data/source_parts/Part_{i}.csv.gz"]
            if hashlib.sha256(b).hexdigest() != h or len(b) != n:
                raise SystemExit(f"FAIL: reference backup {f} does not match MANIFEST.sha256 - it was altered.")
        parts.append(Source(f"reference Part {i}", b))
    return parts


# ----------------------------------------------------------------------------- helpers
def is_damaged(row):
    return len(row) != 33 or any("\x00" in c for c in row)


def key(row):
    return (int(row[0]), int(row[1]), int(row[4]))


def fmt_key(k):
    return f"match {k[0]} inns {k[1]} ball {k[2]}"


def build_reference_model(ref_parts):
    """Intact reference rows in order, plus one 'window' per damaged line."""
    header = ref_parts[0].header
    seq = []                                   # (kind, values, raw) kind in {"row","damaged"}
    for p in ref_parts:
        for j, r in enumerate(p.rows):
            seq.append(("damaged" if is_damaged(r) else "row", r, p.raw[j] if p.raw else ",".join(r)))
    intact = [(r, raw) for kind, r, raw in seq if kind == "row"]
    windows = []
    for idx, (kind, r, raw) in enumerate(seq):
        if kind != "damaged":
            continue
        prev = next(seq[k] for k in range(idx - 1, -1, -1) if seq[k][0] == "row")
        nxt = next(seq[k] for k in range(idx + 1, len(seq)) if seq[k][0] == "row")
        prefix = raw.split("\x00", 1)[0]
        suffix = raw.rsplit("\x00", 1)[1]
        windows.append(dict(after=key(prev[1]), before=key(nxt[1]), prefix=prefix, suffix=suffix,
                            nul_bytes=raw.count("\x00")))
    return header, intact, windows


# ----------------------------------------------------------------------------- validation
def validate(sources, ref_parts, mode):
    F, W, I = [], [], []                        # FAIL, WARN, INFO messages
    header, ref_intact, windows = build_reference_model(ref_parts)

    # ---- 1. file-level checks
    for s in sources:
        tag = s.label
        if s.nul:
            F.append(f"{tag}: contains {s.nul:,} NUL (zero) bytes - still damaged.")
        if s.ctrl > 0:
            F.append(f"{tag}: contains {s.ctrl} other control characters.")
        if s.non_ascii:
            W.append(f"{tag}: contains {s.non_ascii} non-ASCII characters (originals are pure ASCII).")
        if s.crlf:
            W.append(f"{tag}: uses CRLF line endings (originals use LF). Values are compared after normalising.")
        if not s.ends_nl:
            W.append(f"{tag}: last line has no trailing newline.")
        if s.quoted:
            W.append(f"{tag}: uses quote characters (originals never do); byte-level comparison falls back to value-level.")
        if s.header != header:
            F.append(f"{tag}: header differs from the original 33-column header. Got {len(s.header)} columns: {s.header[:5]}...")
        blank = sum(1 for r in s.rows if not r)
        if blank:
            F.append(f"{tag}: {blank} blank lines.")
        embedded = sum(1 for r in s.rows if r == header)
        if embedded:
            F.append(f"{tag}: {embedded} repeated header rows inside the data.")
        bad_width = [(j + 2, len(r)) for j, r in enumerate(s.rows) if r and r != header and len(r) != 33]
        if bad_width:
            F.append(f"{tag}: {len(bad_width)} rows without exactly 33 fields (file line, fields): {bad_width[:5]}")

    # ---- 2. assemble candidate (exclude blank/header/bad-width rows; already FAILed above)
    cand = []                                   # (values, raw, label, file_line)
    for s in sources:
        for j, r in enumerate(s.rows):
            if r and r != header and len(r) == 33:
                cand.append((r, s.raw[j] if s.raw else None, s.label, j + 2))

    # ---- 3. field-level typing (structural => FAIL)
    type_err = []
    for r, _raw, lab, ln in cand:
        rec = dict(zip(header, r))
        probs = [c for c in INT_COLS if not RE_INT.fullmatch(rec[c])]
        probs += [c for c in OPT_INT_COLS if not RE_OPT_INT.fullmatch(rec[c])]
        probs += [c for c in BOOL_COLS if rec[c] not in ("true", "false")]
        if not RE_SPEED.fullmatch(rec["bowl_speed"]):
            probs.append("bowl_speed")
        if not RE_TS.fullmatch(rec["delivery_ist_time"]):
            probs.append("delivery_ist_time")
        if not probs and rec["innings"] not in ("1", "2", "3", "4"):
            probs.append("innings")
        if probs:
            type_err.append((lab, ln, probs))
    if type_err:
        F.append(f"{len(type_err)} rows have badly typed fields (source, line, columns): {type_err[:5]}")
        return F, W, I, None                     # cannot key the rows safely

    # ---- 4. ordering, contiguity, uniqueness
    keys = [key(r) for r, *_ in cand]
    dup = [k for k, n in Counter(keys).items() if n > 1]
    if dup:
        F.append(f"{len(dup)} duplicate (match_id, innings, innings_ball_num) keys, e.g. {[fmt_key(k) for k in dup[:3]]}")
    dec = [i for i in range(1, len(keys)) if keys[i][0] < keys[i - 1][0]]
    if dec:
        F.append(f"match_id decreases at {len(dec)} places (file must be sorted by match_id), "
                 f"first at {cand[dec[0]][2]} line {cand[dec[0]][3]}")
    seen, blocks = set(), 0
    for i, k in enumerate(keys):
        if i == 0 or k[0] != keys[i - 1][0]:
            blocks += 1
            if k[0] in seen:
                F.append(f"match {k[0]} appears in more than one separate block.")
            seen.add(k[0])
    by_inn = defaultdict(list)
    for k in keys:
        by_inn[(k[0], k[1])].append(k[2])
    gaps = [(m, i, b[0], b[-1], len(b)) for (m, i), b in by_inn.items()
            if b != list(range(1, len(b) + 1))]
    if gaps:
        F.append(f"{len(gaps)} innings are not numbered 1..N without gaps (match, innings, first, last, count): {gaps[:6]}")
    inn_back = sorted({m for i, (m, inn, _) in enumerate(keys) if i and keys[i - 1][0] == m and inn < keys[i - 1][1]})
    if inn_back:
        F.append(f"{len(inn_back)} matches where innings go backwards in file order: {inn_back[:5]}")

    # ---- 5. compare with the intact reference rows
    pos = {}
    for i, k in enumerate(keys):
        pos.setdefault(k, i)
    missing, changed, fmt_only, order_bad, last = [], [], 0, 0, -1
    for r, raw in ref_intact:
        k = key(r)
        i = pos.get(k)
        if i is None:
            missing.append(k)
            continue
        cr, craw = cand[i][0], cand[i][1]
        if cr != r:
            diff = [h for h, a, b in zip(header, r, cr) if a != b]
            changed.append((k, diff))
        elif craw is not None and craw != raw:
            fmt_only += 1
        elif craw is None:
            fmt_only += 1
        if i < last:
            order_bad += 1
        last = max(last, i)
    I.append(f"Intact original rows: {len(ref_intact):,}. Found unchanged: {len(ref_intact) - len(missing) - len(changed):,}.")
    if missing:
        F.append(f"{len(missing):,} original rows are missing from the candidate, e.g. {[fmt_key(k) for k in missing[:3]]}")
    if changed:
        F.append(f"{len(changed):,} original rows have different values, e.g. "
                 f"{[(fmt_key(k), cols) for k, cols in changed[:3]]}")
    if fmt_only:
        W.append(f"{fmt_only:,} original rows have identical values but different text formatting (quoting/line endings).")
    if order_bad:
        F.append(f"{order_bad:,} original rows appear in a different order.")

    # seam hint: problems right at part boundaries usually mean the clean file was re-split differently
    if mode == "replace" and (missing or dup):
        W.append("Missing/duplicate rows in --replace mode usually mean the clean file was split at different "
                 "row boundaries. Re-run with all five parts (--parts) or the single full file (--full).")

    # ---- 6. new rows must sit inside the damaged windows and match the surviving fragments
    ref_keys = {key(r) for r, _ in ref_intact}
    new_idx = [i for i, k in enumerate(keys) if k not in ref_keys]
    win_of = {}
    for w_no, w in enumerate(windows, 1):
        a, b = pos.get(w["after"]), pos.get(w["before"])
        label = f"Window {w_no} (between {fmt_key(w['after'])} and {fmt_key(w['before'])})"
        if a is None or b is None or b <= a:
            F.append(f"{label}: boundary rows not found in order, cannot check the filled gap.")
            continue
        inside = list(range(a + 1, b))
        for i in inside:
            win_of[i] = w_no
        if not inside:
            F.append(f"{label}: still empty - nothing was recovered for the {w['nul_bytes']:,} damaged bytes.")
            continue
        first_raw = cand[inside[0]][1] if cand[inside[0]][1] is not None else ",".join(cand[inside[0]][0])
        last_raw = cand[inside[-1]][1] if cand[inside[-1]][1] is not None else ",".join(cand[inside[-1]][0])
        ok_p, ok_s = first_raw.startswith(w["prefix"]), last_raw.endswith(w["suffix"])
        if not ok_p:
            F.append(f"{label}: first recovered row does not start with the surviving fragment "
                     f"'{w['prefix'][:60]}...'. Got '{first_raw[:60]}...'")
        if not ok_s:
            F.append(f"{label}: last recovered row does not end with the surviving fragment "
                     f"'...{w['suffix'][-50:]}'. Got '...{last_raw[-50:]}'")
        if ok_p and ok_s:
            I.append(f"{label}: filled with {len(inside):,} rows; both surviving fragments match exactly.")
    outside = [i for i in new_idx if i not in win_of]
    if outside:
        F.append(f"{len(outside):,} new rows lie OUTSIDE the damaged windows (this is a different export, not a repair), "
                 f"e.g. {[fmt_key(keys[i]) for i in outside[:3]]}")

    # ---- 7. semantic rules that hold on 100% of intact rows -> WARN for new rows
    vocab = {c: {r[header.index(c)] for r, _ in ref_intact} for c in CAT_COLS}
    rules = {
        "is_wicket=true <=> dismissal_type non-empty": lambda d: (d["is_wicket"] == "true") == (d["dismissal_type"] != ""),
        "dismissal_type non-empty <=> dismissal_type_id non-empty": lambda d: (d["dismissal_type"] != "") == (d["dismissal_type_id"] != ""),
        "is_four=true => runs == 4": lambda d: d["is_four"] != "true" or d["runs"] == "4",
        "is_six=true => runs == 6": lambda d: d["is_six"] != "true" or d["runs"] == "6",
        "batting team != bowling team": lambda d: d["batting_team_id"] != d["bowling_team_id"],
        "player names non-empty": lambda d: all(d[c] for c in ("striker_name", "non_striker_name", "bowler_name")),
    }
    rule_hits, new_vals = Counter(), defaultdict(Counter)
    for i in new_idx:
        d = dict(zip(header, cand[i][0]))
        for name, fn in rules.items():
            if not fn(d):
                rule_hits[name] += 1
        for c in CAT_COLS:
            if d[c] not in vocab[c]:
                new_vals[c][d[c]] += 1
    for name, n in rule_hits.items():
        W.append(f"{n} new rows break a rule that holds on every intact row: {name}")
    for c, vals in new_vals.items():
        W.append(f"New rows use values of '{c}' never seen in intact rows: {dict(vals.most_common(5))}")
    one_team = defaultdict(set)
    for r, *_ in cand:
        one_team[(r[0], r[1])].add((r[5], r[6]))
    multi = [k for k, v in one_team.items() if len(v) > 1]
    if multi:
        F.append(f"{len(multi)} innings have more than one batting/bowling team pair, e.g. {multi[:3]}")

    return F, W, I, (header, cand, keys, new_idx, windows)


# ----------------------------------------------------------------------------- coverage report
def coverage(model, ref_parts):
    header, cand, keys, new_idx, windows = model
    lines = []
    ref_rows = [r for p in ref_parts for r in p.rows if not is_damaged(r)]

    def matches(rows):
        m = {}
        for r in rows:
            e = m.setdefault(r[0], dict(teams=set(), ts=r[32], balls=0, inns=Counter()))
            e["teams"].update((r[5], r[6]))
            e["ts"] = min(e["ts"], r[32])
            e["balls"] += 1
            e["inns"][r[1]] += 1
        return m

    before, after = matches(ref_rows), matches([c[0] for c in cand])
    new_matches = sorted(set(after) - set(before), key=int)
    grown = sorted([m for m in before if m in after and after[m]["balls"] != before[m]["balls"]], key=int)
    lines.append(f"Matches: {len(before)} before -> {len(after)} after. New: {len(new_matches)}. Completed/changed: {len(grown)}.")
    for m in grown:
        lines.append(f"  completed {m} {'v'.join(NAME.get(t, t) for t in sorted(after[m]['teams']))}: "
                     f"balls {before[m]['balls']} -> {after[m]['balls']} (by innings {dict(after[m]['inns'])})")
    for m in new_matches:
        e = after[m]
        lines.append(f"  new {m} {e['ts'][:10]} {' v '.join(NAME.get(t, t) for t in sorted(e['teams']))}: "
                     f"{e['balls']} balls{'  [IPL]' if is_ipl_match(e['teams']) else ''}")

    def ipl_table(ms):
        seasons = defaultdict(list)
        for mid, e in ms.items():
            if is_ipl_match(e["teams"]):
                seasons[e["ts"][:4]].append((e["ts"], tuple(sorted(e["teams"]))))
        out = {}
        for s, lst in sorted(seasons.items()):
            lst.sort()
            league = lst[:-4]
            per = Counter(t for _, tm in league for t in tm)
            out[s] = (len(lst), len(league), {IPL[t]: per.get(t, 0) for t in sorted(IPL, key=int)},
                      Counter(tm for _, tm in league))
        return out

    tb, ta = ipl_table(before), ipl_table(after)
    lines.append("IPL seasons (matches total / league; league games per team, 14 = complete):")
    for s in sorted(ta):
        nb = tb.get(s, (0, 0, {}, {}))
        short = {t: 14 - n for t, n in ta[s][2].items() if n != 14}
        lines.append(f"  {s}: {nb[0]} -> {ta[s][0]} matches; league {nb[1]} -> {ta[s][1]}; "
                     f"{'all teams 14' if not short else 'short: ' + str(short)}")
    if "2025" in ta:
        pc = ta["2025"][3]
        for a, b in (("2", "3"), ("7", "8")):
            lines.append(f"  2025 {IPL[a]} v {IPL[b]} league meetings: {pc.get(tuple(sorted((a, b))), 0)}")
    return lines


# ----------------------------------------------------------------------------- main
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--replace", action="append", metavar="N=FILE")
    g.add_argument("--parts", nargs=5, metavar="FILE")
    g.add_argument("--full", metavar="FILE")
    ap.add_argument("--out")
    ap.add_argument("--report")
    ap.add_argument("--reference-dir")
    a = ap.parse_args(argv)

    try:
        ref = load_reference(a.reference_dir or REF_DIR, check_manifest=a.reference_dir is None)
        if a.full:
            mode, sources = "full", [Source(f"full file {a.full}", read_bytes(a.full))]
        elif a.parts:
            mode, sources = "parts", [Source(f"Part {i} ({p})", read_bytes(p)) for i, p in enumerate(a.parts, 1)]
        else:
            mode, repl = "replace", {}
            for spec in a.replace:
                n, _, path = spec.partition("=")
                if n not in {"1", "2", "3", "4", "5"} or not path:
                    raise ValueError(f"--replace expects N=FILE with N in 1..5, got {spec!r}")
                repl[int(n)] = path
            sources = [Source(f"Part {i} (replacement {repl[i]})", read_bytes(repl[i])) if i in repl else ref[i - 1]
                       for i in range(1, 6)]
    except (OSError, ValueError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    F, W, I, model = validate(sources, ref, mode)
    verdict = "FAIL" if F else "PASS"
    out = [f"# Replacement validation: {verdict}", "", f"Mode: {mode}. Inputs: " + "; ".join(s.label for s in sources), ""]
    out += ["## FAIL"] + [f"- {m}" for m in F] + ([] if F else ["- none"]) + [""]
    out += ["## WARN"] + [f"- {m}" for m in W] + ([] if W else ["- none"]) + [""]
    out += ["## Checks passed / info"] + [f"- {m}" for m in I] + [""]
    if model:
        out += ["## Coverage", "```"] + coverage(model, ref) + ["```", ""]
    text = "\n".join(out)
    print(text)
    if a.report:
        Path(a.report).write_text(text)

    if a.out:
        dest = Path(a.out).resolve()
        if verdict != "PASS":
            print(f"Not writing {dest}: verdict is FAIL.")
        elif dest.exists() or any(dest == p.resolve() or p.resolve() in dest.parents for p in PROTECTED):
            print(f"Not writing {dest}: it exists or is a protected backup path.")
        else:
            header, cand = model[0], model[1]
            with dest.open("w", newline="") as f:
                w = csv.writer(f, lineterminator="\n")
                f.write(",".join(header) + "\n")
                for r, raw, *_ in cand:
                    if raw is not None:
                        f.write(raw + "\n")       # exact original text
                    else:
                        w.writerow(r)             # quoted input: re-serialise values
            print(f"Wrote validated dataset: {dest} (sha256 {hashlib.sha256(dest.read_bytes()).hexdigest()})")
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
