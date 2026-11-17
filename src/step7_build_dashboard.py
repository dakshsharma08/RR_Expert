"""Step 7: build the single-file offline dashboard.

Reads outputs/deliverables/dashboard_payload.json, injects it into
src/dashboard/template.html at the /*__PAYLOAD__*/ marker, and writes
outputs/deliverables/RR_Clutch_Index_Dashboard.html. No numbers are typed here.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / "outputs" / "deliverables" / "dashboard_payload.json"
TEMPLATE = ROOT / "src" / "dashboard" / "template.html"
OUT = ROOT / "outputs" / "deliverables" / "RR_Clutch_Index_Dashboard.html"
MARKER = "/*__PAYLOAD__*/{}"


def main() -> int:
    payload = json.loads(PAYLOAD.read_text(encoding="utf-8"))
    tpl = TEMPLATE.read_text(encoding="utf-8")
    if tpl.count(MARKER) != 1:
        print(f"ERROR: expected exactly one {MARKER!r} marker in the template", file=sys.stderr)
        return 1
    blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    # keep the JSON safe inside a <script> element
    blob = blob.replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    html = tpl.replace(MARKER, blob)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    size = OUT.stat().st_size
    print(f"Wrote {OUT} ({size:,} bytes = {size / 1e6:.2f} MB)")
    if size >= 5 * 1024 * 1024:
        print("ERROR: file is 5 MB or larger", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
