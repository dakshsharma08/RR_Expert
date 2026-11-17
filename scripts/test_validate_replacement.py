#!/usr/bin/env python3
"""Self-tests for validate_replacement.py.

Builds SYNTHETIC repair files in a temporary directory (never in data/): the real intact rows plus
made-up rows that fill the two damaged windows and match the surviving fragments. The made-up rows
exist only to exercise the validator; they are not cricket data and are deleted afterwards.

Run: TMPDIR=<scratch dir> python3 -I scripts/test_validate_replacement.py
"""
import contextlib, csv, gzip, io, shutil, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import validate_replacement as V  # noqa: E402

REF = ROOT / "data" / "source_parts"


def run(*argv):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = V.main(list(argv))
    return code, buf.getvalue()


def ref_lines(i):
    return gzip.open(REF / f"Part_{i}.csv.gz", "rt", newline="").read().split("\n")[:-1]


def clone(row, **kw):
    f = row.split(",")
    idx = {"match_id": 0, "innings": 1, "ball": 4, "bat": 5, "bowl": 6, "ts": 32}
    for k, v in kw.items():
        f[idx[k]] = str(v)
    return ",".join(f)


def synthetic_parts():
    """Original parts with each damaged line replaced by synthetic rows that fill the window."""
    parts = [ref_lines(i) for i in range(1, 6)]
    header = parts[0][0]
    out = []
    for i, lines in enumerate(parts, 1):
        new = []
        for ln in lines:
            if "\x00" not in ln:
                new.append(ln)
                continue
            prefix, suffix = ln.split("\x00", 1)[0], ln.rsplit("\x00", 1)[1]
            if i == 2:      # 23673 inns2 ball44.. ; new match 24000 ; 25159 inns1 balls 1..117
                b44 = prefix + ",Leg Break,Over,Off-side,2023-07-14 20:01:30 UTC"
                new.append(b44)
                new += [clone(b44, ball=b) for b in range(45, 61)]
                new += [clone(b44, match_id=24000, innings=n, ball=b, bat=bt, bowl=bw)
                        for n, bt, bw in ((1, 21, 78), (2, 78, 21)) for b in range(1, 31)]
                nxt = next(x for x in parts[1] if x.startswith("25159,1,"))
                new += [clone(nxt, ball=b) for b in range(1, 117)]
                head = clone(nxt, ball=117).split(",")[:23]
                new.append(",".join(head) + ",l" + suffix)
            else:           # 40736 inns1 ball45.. + inns2 ; new IPL match 40737 MI v RR ; 40752 inns1 + inns2 1..21
                b45 = prefix + "se,,,,None,0,0,Spin,90.1,Push,Arm ball,Over,Off-side,2025-04-25 14:41:30 UTC"
                new.append(b45)
                new += [clone(b45, ball=b) for b in range(46, 61)]
                new += [clone(b45, innings=2, ball=b, bat=242, bowl=1) for b in range(1, 31)]
                new += [clone(b45, match_id=40737, innings=n, ball=b, bat=bt, bowl=bw)
                        for n, bt, bw in ((1, 2, 3), (2, 3, 2)) for b in range(1, 31)]
                nxt = next(x for x in parts[3] if x.startswith("40752,2,"))
                new += [clone(nxt, innings=1, ball=b, bat=3509, bowl=5) for b in range(1, 21)]
                new += [clone(nxt, ball=b) for b in range(1, 21)]
                new.append(clone(nxt, ball=21, ts=suffix.lstrip(",")))
        out.append(new)
    return header, out


def write(path, lines, nl="\n"):
    Path(path).write_text(nl.join(lines) + nl, newline="")
    return str(path)


def main():
    tmp = Path(tempfile.mkdtemp(prefix="validator_tests_"))
    results = []

    def check(name, cond, detail=""):
        results.append((name, cond))
        print(f"{'ok  ' if cond else 'FAIL'} {name}" + ("" if cond else f"\n{detail[:3000]}"))

    try:
        header, parts = synthetic_parts()
        assert all(pl[0] == header for pl in parts)          # each part keeps its own header line
        p = [write(tmp / f"syn_p{i}.csv", parts[i - 1]) for i in range(1, 6)]
        body = [ln for pl in parts for ln in pl[1:]]
        full = write(tmp / "syn_full.csv", [header] + body)

        code, out = run("--replace", f"2={REF/'Part_2.csv.gz'}", "--replace", f"4={REF/'Part_4.csv.gz'}")
        check("damaged originals are rejected", code == 1 and "still damaged" in out and "still empty" in out, out)

        code, out = run("--full", full)
        check("synthetic full repair passes", code == 0 and "both surviving fragments match exactly" in out, out)
        check("coverage lists new IPL match and completed matches",
              "new 40737" in out and "[IPL]" in out and "completed 40736" in out and "completed 25159" in out
              and "2025 MI v RR league meetings: 1" in out, out)

        code, out = run("--replace", f"2={p[1]}", "--replace", f"4={p[3]}")
        check("replacing only Parts 2 and 4 (same boundaries) passes", code == 0, out)

        # re-split into 40,000-row parts: boundaries shift
        rs = [body[k:k + 40000] for k in range(0, len(body), 40000)]
        rsp = [write(tmp / f"resplit_{i}.csv", [header] + chunk) for i, chunk in enumerate(rs, 1)]
        if len(rsp) == 5:
            code, out = run("--replace", f"2={rsp[1]}", "--replace", f"4={rsp[3]}")
            check("re-split parts used with old neighbours are rejected with a hint",
                  code == 1 and "different row boundaries" in out, out)
            code, out = run("--parts", *rsp)
            check("all five re-split parts pass", code == 0, out)
        else:
            check(f"re-split produced 5 parts (got {len(rsp)})", False)

        tam = list(body)
        k = next(i for i, ln in enumerate(tam) if ln.startswith("30070,1,") and ",0,false,false,false," in ln)
        tam[k] = tam[k].replace(",0,false,false,false,", ",1,false,false,false,", 1)
        code, out = run("--full", write(tmp / "tamper.csv", [header] + tam))
        check("changed value in an intact row fails", code == 1 and "have different values" in out, out)

        code, out = run("--full", write(tmp / "drop.csv", [header] + body[:5000] + body[5001:]))
        check("dropped intact row fails", code == 1 and "missing from the candidate" in out, out)

        code, out = run("--full", write(tmp / "dup.csv", [header] + body[:5000] + [body[4999]] + body[5000:]))
        check("duplicated row fails", code == 1 and "duplicate" in out, out)

        code, out = run("--full", write(tmp / "hdr.csv", [header.replace("runs", "run", 1)] + body))
        check("altered header fails", code == 1 and "header differs" in out, out)

        extra = body + [clone(body[-1], match_id=99999, innings=1, ball=1)]
        code, out = run("--full", write(tmp / "extra.csv", [header] + extra))
        check("row outside the damaged windows fails", code == 1 and "OUTSIDE the damaged windows" in out, out)

        frag = [ln.replace("Square Cut,Leg Break,Over", "Pull shot,Leg Break,Over")
                if ln.startswith("23673,2,8,1,44,") else ln for ln in body]
        code, out = run("--full", write(tmp / "frag.csv", [header] + frag))
        check("recovered row not matching the surviving fragment fails",
              code == 1 and "does not start with the surviving fragment" in out, out)

        nul = list(body)
        nul[next(i for i, ln in enumerate(nul) if ln.startswith("24000,1,"))] += "\x00"
        code, out = run("--full", write(tmp / "nul.csv", [header] + nul))
        check("NUL byte in a recovered row fails", code == 1 and "NUL" in out, out)

        q = io.StringIO()
        w = csv.writer(q, quoting=csv.QUOTE_ALL, lineterminator="\n")
        for ln in [header] + body:
            w.writerow(ln.split(","))
        (tmp / "quoted.csv").write_text(q.getvalue())
        code, out = run("--full", str(tmp / "quoted.csv"))
        check("fully quoted export passes with a formatting WARN", code == 0 and "quote characters" in out, out)

        code, out = run("--full", write(tmp / "crlf.csv", [header] + body, nl="\r\n"))
        check("CRLF export passes with a line-ending WARN", code == 0 and "CRLF" in out, out)

        gz = tmp / "syn_full.csv.gz"
        gz.write_bytes(gzip.compress(Path(full).read_bytes()))
        code, out = run("--full", str(gz))
        check("gzipped input is accepted", code == 0, out)

        dest = tmp / "out.csv"
        code, out = run("--full", full, "--out", str(dest))
        check("--out writes the merged file on PASS", code == 0 and dest.exists()
              and dest.read_text() == Path(full).read_text(), out)
        code, out = run("--full", full, "--out", str(dest))
        check("--out refuses to overwrite an existing file", "Not writing" in out, out)
        code, out = run("--full", full, "--out", str(ROOT / "data" / "backup" / "x.csv"))
        check("--out refuses protected backup paths", "Not writing" in out
              and not (ROOT / "data" / "backup" / "x.csv").exists(), out)
        dest2 = tmp / "out_fail.csv"
        code, out = run("--full", str(tmp / "tamper.csv"), "--out", str(dest2))
        check("--out writes nothing on FAIL", code == 1 and not dest2.exists(), out)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    bad = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} tests passed")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
