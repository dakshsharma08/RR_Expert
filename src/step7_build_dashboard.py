"""Step 7: build the single-file offline dashboard.

Reads outputs/deliverables/dashboard_payload.json, injects it into
src/dashboard/template.html at the /*__PAYLOAD__*/{} marker, inlines the
fonts from src/dashboard/fonts/ as base64 @font-face rules at /*__FONTS__*/,
and writes outputs/deliverables/RR_Clutch_Index_Dashboard.html.
No numbers are typed here.

Optional: --public-url URL sets meta.public_url (shown in the footer).
"""
import argparse
import base64
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / "outputs" / "deliverables" / "dashboard_payload.json"
TEMPLATE = ROOT / "src" / "dashboard" / "template.html"
FONT_DIR = ROOT / "src" / "dashboard" / "fonts"
OUT = ROOT / "outputs" / "deliverables" / "RR_Clutch_Index_Dashboard.html"
MARKER = "/*__PAYLOAD__*/{}"
FONT_MARKER = "/*__FONTS__*/"
# (family, weight, file)
FONTS = [
    ("Plus Jakarta Sans", w, f"plus-jakarta-sans-latin-{w}-normal.woff2") for w in (400, 500, 600, 700, 800)
] + [("Space Grotesk", w, f"space-grotesk-latin-{w}-normal.woff2") for w in (500, 700)]


def font_css() -> str:
    rules = []
    for fam, w, fn in FONTS:
        data = base64.b64encode((FONT_DIR / fn).read_bytes()).decode("ascii")
        rules.append(
            f'@font-face{{font-family:"{fam}";font-style:normal;font-weight:{w};font-display:swap;'
            f'src:url(data:font/woff2;base64,{data}) format("woff2")}}'
        )
    return "\n".join(rules)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--public-url", default=None)
    args = ap.parse_args()
    payload = json.loads(PAYLOAD.read_text(encoding="utf-8"))
    if args.public_url:
        payload.setdefault("meta", {})["public_url"] = args.public_url
    tpl = TEMPLATE.read_text(encoding="utf-8")
    for m in (MARKER, FONT_MARKER):
        if tpl.count(m) != 1:
            print(f"ERROR: expected exactly one {m!r} marker in the template", file=sys.stderr)
            return 1
    blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    # keep the JSON safe inside a <script> element
    blob = blob.replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    html = tpl.replace(FONT_MARKER, font_css()).replace(MARKER, blob)
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
