"""Step 7 (B, C, D), Round 1 version: the top 10 batters and top 10 bowlers under pressure, the pressure definition and the method.

Every number is read from outputs/tables/*.csv, outputs/tables/summary_numbers.json and outputs/deliverables/dashboard_payload.json
(plus a few method parameters parsed from logs/*.md). Nothing is typed in by hand. Numbers are rounded for display only.
Round 1 asks only for the top 10 batters and top 10 bowlers under pressure and the method, so no auction or squad content appears.

Outputs (outputs/deliverables/):
  B_RR_Clutch_Index_Deck.pdf (7 slides), C_RR_Clutch_Index_Cheat_Sheet.pdf (1 page), RR_Clutch_Index_Submission.pdf (deck + cheat sheet),
  D_Methodology_and_Limitations.pdf/.md, D_Data_Dictionary.md, previews/*.png

The dashboard link and QR code come from outputs/tables/dashboard_url.txt (one line) if that file exists; otherwise a "pending" box is shown.
Run: python3 -I src/step7_docs.py     (needs matplotlib, pandas, qrcode, pypdf, Node Playwright with Chromium, pdftoppm)
"""
import base64, html, io, json, re, shutil, subprocess, sys, tempfile
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import Patch
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
TABLES, DELIV, LOGS = ROOT / "outputs" / "tables", ROOT / "outputs" / "deliverables", ROOT / "logs"
PREV = DELIV / "previews"
DELIV.mkdir(exist_ok=True); PREV.mkdir(exist_ok=True)
TMP = Path(tempfile.mkdtemp(prefix="step7_docs_"))

# ------------------------------------------------------------------------------------------ colours and fonts
PINK, BLUE, GREY, INK, MUTED = "#E4007C", "#254AA5", "#8A94A6", "#1B1F3B", "#5B6275"
for fp in ("Inter-Regular.otf", "Inter-Bold.otf"):
    p = Path("/usr/share/fonts/opentype/inter") / fp
    if p.exists():
        font_manager.fontManager.addfont(str(p))
plt.rcParams.update({"font.family": ["Inter", "DejaVu Sans"], "font.size": 10, "axes.edgecolor": MUTED, "axes.labelcolor": INK,
                     "xtick.color": INK, "ytick.color": INK, "axes.spines.top": False, "axes.spines.right": False})

# ------------------------------------------------------------------------------------------ load data
T = lambda n, **k: pd.read_csv(TABLES / f"{n}.csv", **k)
SUMJ = json.loads((TABLES / "summary_numbers.json").read_text())
S, TOP = SUMJ["summary"], SUMJ["top10"]
P = json.loads((DELIV / "dashboard_payload.json").read_text())
META, METHOD = P["meta"], P["method"]
BAT, BOWL = TOP["bat"], TOP["bowl"]

sb = T("step4_scores_batters", dtype={"player_id": str}).set_index("player_id")
sw = T("step4_scores_bowlers", dtype={"player_id": str}).set_index("player_id")
sa = T("step4_scores_allrounders", dtype={"player_id": str})
# the summary JSON rounds scores to 3 decimals; use the full-precision score tables so one-decimal display rounds correctly
for _rows, _tab in ((BAT, sb), (BOWL, sw)):
    for _r in _rows:
        _t = _tab.loc[_r["id"]]
        assert abs(_t.score - _r["score"]) < 0.002 and abs(_t.score_lo80 - _r["lo"]) < 0.002 and abs(_t.score_hi80 - _r["hi"]) < 0.002, f"score mismatch for {_r['name']}"
        _r["score"], _r["lo"], _r["hi"] = float(_t.score), float(_t.score_lo80), float(_t.score_hi80)
bt = T("step4_backtest_summary")
comp = T("step4_component_info")
sens = T("step4_sensitivity")
rob = T("step4_definition_robustness")
wpe = T("step1a_wp_eval", dtype={"innings": str})
shares = T("step1b_bucket_shares")
ex = T("step1c_example_balls")
offs = T("step2_season_offsets")
bcols = T("step0_ball_columns")
offc = T("step0_official_meta_check")
TCC = T("step4_too_close_to_call") if (TABLES / "step4_too_close_to_call.csv").exists() else None

# ------------------------------------------------------------------------------------------ method parameters parsed from the logs
PRE = (LOGS / "PREREGISTRATION.md").read_text()
DEC = (LOGS / "DECISIONS.md").read_text()
DEFS = (LOGS / "DEFINITIONS.md").read_text()
rx = lambda pat, txt=PRE, g=1: re.search(pat, txt, re.S).group(g)
PARAM = dict(
    min_bat=rx(r"\*\*Batter:\*\* at least (\d+) High-pressure balls faced"),
    min_bowl=rx(r"\*\*Bowler:\*\* at least (\d+) High-pressure legal balls"),
    high_cut=rx(r"\*\*High is (\d+) or more\*\*"),
    med_cut=rx(r"\*\*Medium is (\d+)[–-]\d+\*\*"),
    recency=rx(r"\*\*Recency weights\*\* by season: ([^\n(]+)").strip(),
    decay=rx(r"decay ([\d.]+) a season"),
    k_floor=rx(r"floored at (\d+) balls"),
    prior_seasons=rx(r"prior strength of (\d+) seasons"),
    boots=rx(r"\((\d[\d,]*) bootstrap draws"),
    min_hi_season=rx(r"seasons \(with ≥ (\d+) High balls\)"),
    sha=rx(r"sha256 = `([0-9a-f]{64})`", DEC),
    bt_min_bat=rx(r"at least (\d+) High balls faced \(batters\)"),
    bt_min_bowl=rx(r"or (\d+) High legal balls \(bowlers\)"),
    bt_min_outcome=rx(r"with at least (\d+) High balls in season N"),
)
SEED = META["seed"]

# ------------------------------------------------------------------------------------------ formatting helpers
def esc(s):
    return html.escape(str(s), quote=True)

def inline(s):
    s = esc(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    return re.sub(r"`(.+?)`", r"<code>\1</code>", s)

f0 = lambda x: f"{x:.0f}"
f1 = lambda x: f"{x:.1f}"
f2 = lambda x: f"{x:.2f}"
f3 = lambda x: f"{x:.3f}"
MINUS = "\u2212"
def sgn(x, d=1):
    return (f"{x:+.{d}f}").replace("-", MINUS)
def neg(x, d=1):
    return f"{x:.{d}f}".replace("-", MINUS)
def rng(lo, hi, d=1):
    return f"{neg(lo, d)}\u2013{neg(hi, d)}"
def scf(x):
    """Clutch Score for display: one decimal, never shown as 100 (capped at 99.9)"""
    return f"{min(round(x, 1), 99.9):.1f}"
def srng(lo, hi):
    return f"{scf(lo)}\u2013{scf(hi)}"
def ivl(lo, hi, d=1):
    return f"{sgn(lo, d)} to {sgn(hi, d)}"
def names(lst):
    lst = list(lst)
    return ", ".join(lst[:-1]) + " and " + lst[-1] if len(lst) > 1 else lst[0]
def pairs_sep(role):
    d = TOP["pairs"][role]
    return d["separated"], d["total"]
def team(t):
    return str(t["team"]).split(" ")[0]
NUMW = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten"}

# ------------------------------------------------------------------------------------------ derived numbers (all from the files)
bt = bt.rename(columns={"score_top10_assessable_exp": "score_top10_assessable", "naive_top10_assessable_exp": "naive_top10_assessable"})
HAS_BASE = "base_rate_random_pick" in bt.columns
HAS_CLAIM = "claim" in bt.columns
BTP = bt[bt.fold == "pooled"].set_index("role")
bat_p, bowl_p = BTP.loc["bat"], BTP.loc["bowl"]
if abs(bat_p.score_hit_rate_excl - S["backtest"]["bat_score"]) > 0.05 or abs(bowl_p.naive_hit_rate_excl - S["backtest"]["bowl_naive"]) > 0.05:
    print("WARNING: backtest table and summary_numbers.json disagree (is the pipeline mid-run?)")

def cnt(x):
    return f"{x:.0f}" if abs(x - round(x)) < 1e-9 else f"{x:.1f}"

def claim_text(r):
    if HAS_CLAIM and isinstance(r.get("claim"), str) and r["claim"].strip():
        return r["claim"].strip()
    return "historical indicator; evidence of persistence" if r["hit_diff_lo80"] > 0 else "historical indicator; persistence not demonstrated"

def hit_line(r, lab):
    base = f"; random pick {f1(r.base_rate_random_pick)}%" if HAS_BASE and pd.notna(r.base_rate_random_pick) else ""
    where = "includes 0" if r.hit_diff_lo80 <= 0 <= r.hit_diff_hi80 else ("above 0" if r.hit_diff_lo80 > 0 else "below 0")
    return (f"{lab}: score {f1(r.score_hit_rate_excl)}% v simple ranking {f1(r.naive_hit_rate_excl)}%{base}; difference "
            f"{sgn(r.score_hit_rate_excl - r.naive_hit_rate_excl)} points, 80% interval {ivl(r.hit_diff_lo80, r.hit_diff_hi80)} ({where})")

CLAIM_BAT, CLAIM_BOWL = claim_text(bat_p), claim_text(bowl_p)
BEAT = bool(bat_p.hit_diff_lo80 > 0 or bowl_p.hit_diff_lo80 > 0)

eff = comp.set_index(["role", "component"])
W_NOM = {c: float(eff.loc[("bat", c), "weight"]) for c in "SIHC"}
W_EFF_R = {role: {c: float(eff.loc[(role, c), "effective_weight"]) for c in "SIHC"} for role in ("bat", "bowl")}
SAME_W = all(abs(W_EFF_R["bat"][c] - W_EFF_R["bowl"][c]) < 1e-6 for c in "SIHC")
CNAME = {"S": "skill under pressure", "I": "match impact", "H": "holds up", "C": "consistency"}
NO_INFO_BY_ROLE = {r: [c for c in "SIHC" if not bool(eff.loc[(r, c), "informative"])] for r in ("bat", "bowl")}
NO_INFO = [c for c in "SIHC" if any(c in v for v in NO_INFO_BY_ROLE.values())]
def noinfo_plain():
    if not NO_INFO:
        return "none"
    if NO_INFO_BY_ROLE["bat"] == NO_INFO_BY_ROLE["bowl"]:
        return names([CNAME[c] for c in NO_INFO])
    parts = []
    for c in NO_INFO:
        rs = [{"bat": "batters", "bowl": "bowlers"}[r] for r in ("bat", "bowl") if c in NO_INFO_BY_ROLE[r]]
        parts.append(f"{CNAME[c]} for {names(rs)} only")
    return names(parts)
NO_INFO_TXT = noinfo_plain()
def eff_phrase(role):
    return ", ".join(f"{CNAME[c]} {W_EFF_R[role][c]:.2f}" for c in "SIHC" if W_EFF_R[role][c] > 0)

DISTINCT = len(set(sb.index) | set(sw.index) | set(sa.player_id.astype(str)))
assert DISTINCT == S["in_scope"] - S["not_scorable"], "distinct scored players differ from in-scope minus not-scorable"
SC_M, SC_B, SPAN_M = S["scored_matches"], S["scored_balls"], S["ipl_matches"]
SEAS = S["seasons_scored"]                                   # "2023-2026"
HS = S["high_share"]
high_min, high_max = min(HS.values()), max(HS.values())
brier_all = wpe[wpe.innings == "all"].set_index("season").brier
brier_1 = wpe[wpe.innings == "1"].brier; brier_2 = wpe[wpe.innings == "2"].brier
coin = float(wpe.coin_flip_brier.iloc[0])
ROB = rob.set_index(["variant", "role"]).top20_overlap_pct
OFF = offc.set_index("check")
N_VENUE_IDS = re.search(r"(\d+) distinct venue ids", offc[offc.check.str.startswith("Venue id")].detail.iloc[0]).group(1)
N_ABS = re.search(r"(\d+) absent", OFF.loc["Official matches absent from the ball data are all 'Match Abandoned'", "detail"]).group(1)
off_pass = int((offc.status == "Pass").sum()); off_n = len(offc)
off_diff = offc[offc.status != "Pass"]

def seasons_above(pid, role):
    r = (sb if role == "bat" else sw).loc[pid]
    return f"{int(r.seasons_positive)} of {int(r.seasons_assessed)}"

SEP_BAT, SEP_BOWL = pairs_sep("bat"), pairs_sep("bowl")
if TCC is not None:
    tc = TCC.set_index("role")
    assert (int(tc.loc["bat", "pairs_separated_by_80pct_ranges"]), int(tc.loc["bat", "top10_pairs"])) == SEP_BAT, "too-close table differs from summary"
    assert (int(tc.loc["bowl", "pairs_separated_by_80pct_ranges"]), int(tc.loc["bowl", "top10_pairs"])) == SEP_BOWL, "too-close table differs from summary"
NONE_SEP = SEP_BAT[0] + SEP_BOWL[0] == 0

HONESTY = ("Historical record of pressure performance, not a forecast. "
           + ("Tested one season ahead, the Clutch Score did not clearly beat simple strike-rate or economy rankings"
               + (f" (for batters it did not beat a random pick either)." if HAS_BASE and bat_p.score_hit_rate_excl <= bat_p.base_rate_random_pick else ".") if not BEAT
              else "Tested one season ahead, the Clutch Score beat a simple ranking in the backtest, but the samples are tiny.")
           + f" Top 10 above average next season: batters {f1(bat_p.score_hit_rate_excl)}% v {f1(bat_p.naive_hit_rate_excl)}% simple ranking"
           + (f" v {f1(bat_p.base_rate_random_pick)}% random pick" if HAS_BASE else "")
           + f"; bowlers {f1(bowl_p.score_hit_rate_excl)}% v {f1(bowl_p.naive_hit_rate_excl)}%" + (f" v {f1(bowl_p.base_rate_random_pick)}%" if HAS_BASE else "")
           + f" (score minus simple ranking: batters {sgn(bat_p.score_hit_rate_excl - bat_p.naive_hit_rate_excl)} pts, 80% interval {ivl(bat_p.hit_diff_lo80, bat_p.hit_diff_hi80)}; "
           f"bowlers {sgn(bowl_p.score_hit_rate_excl - bowl_p.naive_hit_rate_excl)} pts, {ivl(bowl_p.hit_diff_lo80, bowl_p.hit_diff_hi80)}; {CLAIM_BAT}).")

PRESSURE_ONE_LINE = (f"Pressure = how much one ball could swing the match result, lifted for chases, being below par, the death overs, playoffs and collapses, "
                     f"ranked 0\u2013100 against earlier balls only; {PARAM['high_cut']}+ (about the top 20%) is High pressure.")

# ------------------------------------------------------------------------------------------ dashboard link and QR code
URL_FILE = TABLES / "dashboard_url.txt"
DASH_URL = (URL_FILE.read_text().strip().splitlines() or [""])[0].strip() if URL_FILE.exists() else ""
DASH_URL = DASH_URL or None

def qr_uri(url):
    """QR code, error correction M, PNG data URI; shown at 100 px (about 2.6 cm on print)"""
    import qrcode
    from qrcode.constants import ERROR_CORRECT_M
    q = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=10, border=4)
    q.add_data(url); q.make(fit=True)
    buf = io.BytesIO(); q.make_image(fill_color="black", back_color="white").save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode(), q

PLACEHOLDER = "Dashboard URL and QR code: pending, to be added when the public link exists"
def dash_box():
    if DASH_URL:
        uri, _ = qr_uri(DASH_URL)
        return (f"<div class='ph-real'><img src='{uri}' width='100' height='100' alt='QR code for the dashboard'>"
                f"<div><b>Scan to open the interactive dashboard</b><br><a class='url' href='{esc(DASH_URL)}'>{esc(DASH_URL)}</a></div></div>")
    return (f"<div class='ph'><div class='ph-sq'>QR<br>pending</div><div><b>{esc(PLACEHOLDER)}</b><br>"
            f"<span>No link has been invented and no QR code was generated.</span></div></div>")

# ------------------------------------------------------------------------------------------ charts
def b64(path):
    return "data:image/png;base64," + base64.b64encode(Path(path).read_bytes()).decode()

def chart_top10(path, rows, role, figsize, fs=9.5):
    d = rows[::-1]
    color, hatch, edge = (PINK, "", "white") if role == "bat" else (BLUE, "///", "white")
    fig, ax = plt.subplots(figsize=figsize, dpi=220)
    for i, r in enumerate(d):
        ax.barh(i, r["score"], color=color, hatch=hatch, edgecolor=edge, linewidth=0.0, height=0.62, zorder=2)
        ax.errorbar(r["score"], i, xerr=[[r["score"] - r["lo"]], [r["hi"] - r["score"]]], fmt="none", ecolor=INK, elinewidth=1.4, capsize=3, zorder=3)
        ax.text(101.5, i, f"{scf(r['score'])} ({srng(r['lo'], r['hi'])})", va="center", fontsize=fs - 1, color=INK)
    ax.set_yticks(range(len(d)))
    ax.set_yticklabels([f"{r['rank']}. {r['name']} ({team(r)})" for r in d], fontsize=fs)
    ax.set_xlim(0, 100); ax.set_xticks(range(0, 101, 20))
    ax.set_xlabel("Clutch Score, 0\u2013100 (bar) with 80% range (whisker)", fontsize=fs)
    ax.xaxis.grid(True, color="#E3E6EC", zorder=0); ax.set_axisbelow(True)
    ax.spines["bottom"].set_bounds(0, 100)
    fig.subplots_adjust(left=0.36, right=0.77, top=0.98, bottom=0.14)
    fig.savefig(path); plt.close(fig)

def chart_backtest(path, figsize):
    fig, axes = plt.subplots(1, 2, figsize=figsize, dpi=220, sharey=True)
    panels = [("score_hit_rate_excl", "naive_hit_rate_excl", True, "Unassessable players left out"),
              ("score_hit_rate_as_miss", "naive_hit_rate_as_miss", False, "Unassessable players counted as misses")]
    for ax, (cs, cn, with_base, title) in zip(axes, panels):
        for k, role in enumerate(("bat", "bowl")):
            r = BTP.loc[role]
            bars = [(r[cs], PINK, "", "Clutch Score top 10"), (r[cn], BLUE, "///", "Simple-ranking top 10 (strike rate / economy)")]
            if with_base and HAS_BASE and pd.notna(r.base_rate_random_pick):
                bars.append((r.base_rate_random_pick, "#C9CED8", "xx", "Random pick"))
            off = np.linspace(-0.27, 0.27, 3) if len(bars) == 3 else np.array([-0.2, 0.2])
            for (v, c, h, lab), o in zip(bars, off):
                ax.bar(k + o, v, 0.25 if len(bars) == 3 else 0.36, color=c, hatch=h, edgecolor=INK if c == "#C9CED8" else "white", linewidth=0.5 if c == "#C9CED8" else 0.0, zorder=2, label=lab if k == 0 else None)
                ax.text(k + o, v + 1.5, f"{f1(v)}%", ha="center", fontsize=8.5, fontweight="bold", color=INK)
        ax.set_xticks([0, 1])
        if with_base:
            ax.set_xticklabels([f"{lab}\nscore minus simple:\n{sgn(BTP.loc[rl].score_hit_rate_excl - BTP.loc[rl].naive_hit_rate_excl)} pts (80% interval\n{ivl(BTP.loc[rl].hit_diff_lo80, BTP.loc[rl].hit_diff_hi80)})" for rl, lab in (("bat", "Batters"), ("bowl", "Bowlers"))], fontsize=7.8)
        else:
            ax.set_xticklabels(["Batters", "Bowlers"], fontsize=9)
        ax.set_ylim(0, 100); ax.set_yticks(range(0, 101, 20))
        ax.yaxis.grid(True, color="#E3E6EC", zorder=0); ax.set_axisbelow(True)
        ax.set_title(title, fontsize=9, color=INK, pad=6)
    axes[0].set_ylabel("Top 10 above average next season (%)", fontsize=9.5)
    h, l = axes[0].get_legend_handles_labels()
    fig.legend(h, l, loc="lower center", ncol=3, frameon=False, fontsize=8.5)
    fig.subplots_adjust(left=0.10, right=0.99, top=0.90, bottom=0.33, wspace=0.08)
    fig.savefig(path); plt.close(fig)

def chart_pressure(path, figsize):
    d = ex.iloc[::-1].reset_index(drop=True)
    cols = {"Low": ("#C9CED8", "", INK), "Medium": (BLUE, "///", "white"), "High": (PINK, "", "white")}
    fig, ax = plt.subplots(figsize=figsize, dpi=220)
    for i, r in d.iterrows():
        c, h, e = cols[r.bucket]
        ax.barh(i, r.pressure_index, color=c, hatch=h, edgecolor=e, linewidth=0.0 if e == "white" else 0.6, height=0.62, zorder=2)
        ax.text(r.pressure_index + 1.2, i, f"{r.pressure_index:.1f} {r.bucket}", va="center", fontsize=8.5, color=INK, fontweight="bold" if r.bucket == "High" else "normal")
    ax.set_yticks(range(len(d)))
    ax.set_yticklabels([f"{r.batter} v {r.bowler}\n{r.situation_before_ball}" for r in d.itertuples()], fontsize=7.6)
    ax.axvline(float(PARAM["med_cut"]), color=MUTED, lw=0.9, ls="--", zorder=1); ax.axvline(float(PARAM["high_cut"]), color=MUTED, lw=0.9, ls="--", zorder=1)
    ax.set_xlim(0, 100); ax.set_xticks(range(0, 101, 20))
    ax.set_xlabel(f"Pressure Index, 0\u2013100 ({PARAM['high_cut']}+ = High, {PARAM['med_cut']}\u2013{PARAM['high_cut']} = Medium)", fontsize=9)
    ax.xaxis.grid(True, color="#E3E6EC", zorder=0); ax.set_axisbelow(True)
    ax.spines["bottom"].set_bounds(0, 100)
    fig.subplots_adjust(left=0.43, right=0.86, top=0.98, bottom=0.14)
    fig.savefig(path); plt.close(fig)

CH = {}
CH["bat"] = TMP / "bat.png"; chart_top10(CH["bat"], BAT, "bat", (6.3, 4.3), fs=9)
CH["bowl"] = TMP / "bowl.png"; chart_top10(CH["bowl"], BOWL, "bowl", (6.3, 4.3), fs=9)
CH["backtest"] = TMP / "backtest.png"; chart_backtest(CH["backtest"], (6.6, 3.7))
CH["pressure"] = TMP / "pressure.png"; chart_pressure(CH["pressure"], (6.6, 4.0))

# ------------------------------------------------------------------------------------------ shared HTML pieces
def table(headers, rows, cls="tbl", aligns=None, raw=False):
    aligns = aligns or ["l"] * len(headers)
    h = "".join(f"<th class='{a}'>{inline(x)}</th>" for x, a in zip(headers, aligns))
    body = ""
    for r in rows:
        body += "<tr>" + "".join(f"<td class='{a}'>{x if raw else inline(x)}</td>" for x, a in zip(r, aligns)) + "</tr>"
    return f"<table class='{cls}'><thead><tr>{h}</tr></thead><tbody>{body}</tbody></table>"

FONT = "font-family:'Inter','Helvetica Neue',Arial,sans-serif;"
BASE_CSS = f"""
:root{{--pink:{PINK};--blue:{BLUE};--ink:{INK};--muted:{MUTED};--line:#DDE1E9;--tint:#F5F6FA;--pinkt:#FCE6F2;--bluet:#E8EDF9}}
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{background:#fff;color:var(--ink);{FONT}-webkit-print-color-adjust:exact;print-color-adjust:exact}}
b{{font-weight:700}} code{{font-family:'DejaVu Sans Mono',monospace;font-size:.88em;background:var(--tint);padding:0 3px;border-radius:3px}}
table{{border-collapse:collapse;width:100%}}
th{{text-align:left;font-weight:700;color:var(--ink);border-bottom:2px solid var(--ink);padding:4px 6px;vertical-align:bottom}}
td{{border-bottom:1px solid var(--line);padding:4px 6px;vertical-align:top}}
th.r,td.r{{text-align:right;font-variant-numeric:tabular-nums}} th.c,td.c{{text-align:center}}
.ph{{display:flex;gap:12px;align-items:center;border:2px dashed var(--muted);border-radius:8px;padding:10px 14px;background:#FFFBEA}}
.ph-sq{{flex:none;width:62px;height:62px;border:2px dashed var(--muted);display:flex;align-items:center;justify-content:center;text-align:center;font-size:11px;font-weight:700;color:var(--muted);background:#fff}}
.ph span{{color:var(--muted);font-size:.9em}}
.ph-real{{display:flex;gap:12px;align-items:center;border:2px solid var(--blue);border-radius:8px;padding:6px 12px;background:#fff}}
.ph-real img{{flex:none;width:100px;height:100px;image-rendering:pixelated}}
.ph-real .url{{font-size:.9em;color:var(--blue);word-break:break-all}}
"""

# ------------------------------------------------------------------------------------------ B: the deck
def slide(n, kicker, headline, body, takeaway, total=7):
    return f"""<section class="slide"><div class="bar"></div>
<header><div class="kick">{n} / {total} &middot; {esc(kicker)}</div><h1>{inline(headline)}</h1></header>
<main>{body}</main>
<div class="sowhat"><b>Takeaway:</b> {inline(takeaway)}</div>
<footer><span>RR Clutch Index &middot; SupeRR Selector Season 2, Round 1 &middot; IPL {esc(SEAS)}, data to {esc(META['last_match'])} &middot; build {esc(META['build'])}</span><span>Independent submission &middot; historical record, not a forecast</span></footer></section>"""

DECK_CSS = BASE_CSS + """
@page{size:1280px 720px;margin:0}
.slide{width:1280px;height:720px;position:relative;overflow:hidden;page-break-after:always;break-after:page;padding:30px 44px 0 44px;background:#fff}
.slide:last-child{page-break-after:auto;break-after:auto}
.bar{position:absolute;left:0;top:0;width:100%;height:8px;background:linear-gradient(90deg,var(--pink) 0 70%,var(--blue) 70% 100%)}
.kick{color:var(--pink);font-weight:700;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin-top:6px}
h1{font-size:26px;line-height:1.18;margin:4px 0 10px 0;font-weight:800;max-width:1190px}
main{height:512px;position:relative;font-size:14px;line-height:1.35}
.sowhat{position:absolute;left:44px;right:44px;bottom:36px;background:var(--pinkt);border-left:6px solid var(--pink);padding:8px 14px;font-size:14px;line-height:1.3;border-radius:0 6px 6px 0}
footer{position:absolute;left:44px;right:44px;bottom:12px;display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted)}
.cols{display:flex;gap:26px}.col{flex:1;min-width:0}
h2{font-size:14.5px;font-weight:800;margin:0 0 6px 0;color:var(--ink)}
.small{font-size:11.5px;color:var(--muted);line-height:1.3}
.step{display:flex;gap:10px;align-items:flex-start;margin-bottom:9px}
.step .num{flex:none;width:26px;height:26px;border-radius:50%;background:var(--ink);color:#fff;font-weight:800;font-size:12.5px;display:flex;align-items:center;justify-content:center;margin-top:1px}
.step div{font-size:13.5px;line-height:1.32}
.box{background:var(--tint);border-radius:6px;padding:8px 11px;font-size:12.5px;line-height:1.33}
.tbl{font-size:13.5px}.tbl td,.tbl th{padding:4px 6px}
.dense{font-size:13px}.dense td,.dense th{padding:3px 5px}
img.chart{display:block;width:100%;height:auto}
ul.lim{padding-left:17px;font-size:13.5px;line-height:1.32}ul.lim li{margin-bottom:5px}
.howto{background:#EAF0FF;border-left:6px solid var(--blue);border-radius:0 6px 6px 0;padding:6px 12px;font-size:12px;line-height:1.3}
.howto ul{padding-left:16px;margin-top:3px}.howto li{margin-bottom:2px}
.ph{padding:7px 12px}
"""

def top10_rows(rows, role):
    out = []
    for r in rows:
        out.append([str(r["rank"]), f"<b>{esc(r['name'])}</b> <span class='small'>{esc(team(r))}</span>", f"<b>{scf(r['score'])}</b> ({srng(r['lo'], r['hi'])})"])
    return out

def deck_html():
    sl = []
    # ---- 1 the answer
    def mini(rows, role, title):
        return f"<div class='col'><h2>{title}</h2>{table(['#', 'Player (2026 team)', 'Clutch Score (80% range)'], top10_rows(rows, role), 'tbl dense', ['r', 'l', 'r'], raw=True)}</div>"
    howsure = (f"How sure we are: no two players inside a list are clearly apart ({SEP_BAT[0]} of {SEP_BAT[1]} batter pairs and {SEP_BOWL[0]} of {SEP_BOWL[1]} bowler pairs have separate 80% ranges), so read each list as a group of ten, not a strict order. "
               f"Tested one season ahead, the score did not clearly beat simple rankings: a record of past pressure performance, not a forecast.") if NONE_SEP else \
              (f"How sure we are: {SEP_BAT[0]} of {SEP_BAT[1]} batter pairs and {SEP_BOWL[0]} of {SEP_BOWL[1]} bowler pairs have separate 80% ranges; the rest are too close to call. A record of past pressure performance, not a forecast.")
    body = (f"<div class='cols' style='gap:30px'>{mini(BAT, 'bat', 'Top 10 batters under pressure')}{mini(BOWL, 'bowl', 'Top 10 bowlers under pressure')}</div>"
            f"<div class='cols' style='margin-top:8px;align-items:stretch'>"
            f"<div class='col' style='flex:1.3'><div class='box'><b>How we define pressure.</b> {esc(PRESSURE_ONE_LINE)}</div>"
            f"<div class='box' style='margin-top:6px'><b>How we judge it.</b> Runs above (batters) or saved (bowlers) versus an average player in the same situation, plus match impact, holding up and consistency. The Clutch Score (short for Clutch Reliability Score) puts this on 0&ndash;100 within role.</div></div>"
            f"<div class='col' style='flex:1.1'><div class='box' style='height:100%'>{esc(howsure)}</div></div>"
            f"<div class='col' style='flex:1'>{dash_box()}</div></div>")
    sl.append(slide(1, "The answer", f"The top 10 batters and top 10 bowlers under pressure, IPL {SEAS}, with how sure we are.", body,
                    ("Read each list as a group of ten: the order inside it is not established." if NONE_SEP else "Where 80% ranges overlap, the data cannot separate the players.")))
    # ---- 2 how we define pressure
    steps = [
        f"Win chance: a simple model gives the batting side a chance of winning before every ball, trained only on earlier seasons (IPL {S['training_only']} is used only for training).",
        "Leverage: how much that win chance could swing on this ball. A ball in a tight finish has high leverage; one in a lost cause has little.",
        "Context boosts: small lifts for chases, being below par, the death overs, playoffs and collapses.",
        f"Pressure Index 0\u2013100: each ball is ranked against earlier balls only. {PARAM['high_cut']}+ (about the top 20%) is High, {PARAM['med_cut']}\u2013{PARAM['high_cut']} is Medium, below {PARAM['med_cut']} is Low.",
    ]
    stp = "".join(f"<div class='step'><div class='num'>{i + 1}</div><div>{esc(x)}</div></div>" for i, x in enumerate(steps))
    seas_rows = [[str(int(r.season)), f"{r.D27_High * 100:.1f}%", f"{r.D27_Medium * 100:.1f}%", f"{r.D27_Low * 100:.1f}%", f"{int(r.balls):,}"] for r in shares.itertuples()]
    hi_ex = ex[ex.bucket == "High"].iloc[-1]
    body = (f"<div class='cols'><div class='col' style='flex:0.95'><h2>Four steps, in plain words</h2>{stp}"
            f"<h2 style='margin-top:6px'>How many balls are High pressure?</h2>"
            + table(["Season", "High", "Medium", "Low", "Balls rated"], seas_rows, "tbl dense", ["l", "r", "r", "r", "r"])
            + f"<p class='small' style='margin-top:4px'>Each ball is judged only with information from before its match. {SC_M} matches and {SC_B:,} balls are rated ({SEAS}).</p></div>"
            f"<div class='col' style='flex:1.05'><h2>Eight real balls, from Low to High</h2><img class='chart' src='{b64(CH['pressure'])}'>"
            f"<p class='small'><b>Worked example:</b> {esc(hi_ex.batter)} v {esc(hi_ex.bowler)}, {esc(hi_ex.match)}. {esc(hi_ex.situation_before_ball)}. The batting side's win chance was {hi_ex.win_prob_batting_side_before * 100:.1f}%, one ball could swing it by about {hi_ex.leverage_expected_swing * 100:.1f} points, so the Pressure Index is {hi_ex.pressure_index:.1f}: High.</p></div></div>")
    sl.append(slide(2, "How we define pressure", f"A ball is High pressure when it can swing the match: {f0(high_min)}\u2013{f0(high_max)}% of balls each season.", body,
                    f"Pressure is measured ball by ball from what could happen next, not from the scoreboard alone, and only with information available before the match."))
    # ---- 3 how we judge performance
    meaning = {"S": "**Skill:** runs scored above (batters) or saved (bowlers) versus an average player in exactly the same situation",
               "I": "**Impact:** win probability added (WPA), how much the player moved his team's chance of winning",
               "H": "**Holds up:** High-pressure level minus the player's own Low-pressure level",
               "C": "**Consistency:** share of seasons in which he was above expected under pressure"}
    if SAME_W:
        wrows = [[meaning[c], f"{W_NOM[c]:.2f}", f"**{W_EFF_R['bat'][c]:.2f}**"] for c in "SIHC"]
        whead, wal = ["Part of the score", "Planned weight", "Weight at work"], ["l", "r", "r"]
    else:
        wrows = [[meaning[c], f"{W_NOM[c]:.2f}", f"**{W_EFF_R['bat'][c]:.2f}**", f"**{W_EFF_R['bowl'][c]:.2f}**"] for c in "SIHC"]
        whead, wal = ["Part of the score", "Planned weight", "At work: batters", "At work: bowlers"], ["l", "r", "r", "r"]
    body = (f"<div class='cols'><div class='col' style='flex:1.2'><h2>Four parts, with fixed weights</h2>{table(whead, wrows, 'tbl', wal)}"
            f"<p class='small' style='margin-top:6px'>The weights were fixed before any ranking was seen, so they cannot be tuned to flatter a player. \u201cAt work\u201d is what actually drives the ranking: a part that could not tell players apart at these sample sizes drops out and its weight moves to the others. Dropped: {esc(NO_INFO_TXT)}.</p></div>"
            f"<div class='col' style='flex:1'><h2>Making the score fair</h2><ul class='lim' style='font-size:14.5px'>"
            f"<li><b>Small samples are pulled toward average</b> (shrinkage), so 30 lucky balls cannot top a list.</li>"
            f"<li><b>Recent seasons count more:</b> {esc(PARAM['recency'])}.</li>"
            f"<li><b>Each part is put on a common scale</b>, blended with the weights, and turned into a 0&ndash;100 Clutch Score within role (batters against batters, bowlers against bowlers).</li>"
            f"<li><b>80% range:</b> we resample the player's matches {esc(PARAM['boots'])} times; the range is where we are 80% sure the true score sits.</li>"
            f"<li><b>Who is rated:</b> {esc(TOP['eligibility'])} That gives {S['scorable_bat']} batters and {S['scorable_bowl']} bowlers ({DISTINCT} distinct players; {S['not_scorable']} of {S['in_scope']} players in scope had too few High-pressure balls).</li>"
            f"<li><b>Top 10:</b> the 10 highest Clutch Scores in each role.</li></ul></div></div>")
    sl.append(slide(3, "How we judge performance under pressure", "We compare each player with an average player in the same situation, then check he holds up and repeats it.", body,
                    f"What drives the ranking is skill under pressure plus consistency, with match impact and holding up where they carry information ({eff_phrase('bat')} for batters; {eff_phrase('bowl')} for bowlers)."))
    # ---- 4 / 5 top 10 pages
    def top_slide(n, rows, role, chart, who, kick):
        edge = TOP["edge"][role]
        if role == "bat":
            hdr, al = ["#", "Batter", "High balls", "SR", "Runs above exp. /100", "Seasons above exp."], ["r", "l", "r", "r", "r", "r"]
            trs = [[str(r["rank"]), esc(r["name"]), str(r["stats"]["balls"]), f1(r["stats"]["sr"]), sgn(r["stats"]["above_per100"], 0), seasons_above(r["id"], role)] for r in rows]
        else:
            hdr, al = ["#", "Bowler", "High balls", "Econ", "Wkts", "Runs saved /100", "Seasons above exp."], ["r", "l", "r", "r", "r", "r", "r"]
            trs = [[str(r["rank"]), esc(r["name"]), str(r["stats"]["balls"]), f2(r["stats"]["econ"]), str(r["stats"]["wkts"]), sgn(r["stats"]["saved_per100"], 0), seasons_above(r["id"], role)] for r in rows]
        sep = SEP_BAT if role == "bat" else SEP_BOWL
        edge_txt = (f"Next in line: {edge['next_name']} ({scf(edge['next_score'])}, 80% range {srng(edge['next_lo'], edge['next_hi'])}) "
                    + ("overlaps the 10th-ranked player's range, so the data cannot separate them." if edge["overlaps_10th"] else "is clear of the 10th-ranked player."))
        body = (f"<div class='cols'><div class='col' style='flex:0.95'><img class='chart' src='{b64(chart)}'>"
                f"<p class='small'>Bars: Clutch Score 0&ndash;100 within role. Whiskers: 80% range. Team in brackets is the player's 2026 team. {sep[0]} of {sep[1]} pairs have separate ranges.</p></div>"
                f"<div class='col' style='flex:1.05'><h2>The evidence behind each score (High-pressure balls, {SEAS})</h2>{table(hdr, trs, 'tbl dense', al, raw=True)}"
                f"<p class='small' style='margin-top:5px'>High balls = High-pressure balls {'faced' if role == 'bat' else 'bowled'}. "
                + ("SR = strike rate. Runs above exp. /100 = runs per 100 balls above an average batter in the same situations. " if role == "bat" else "Econ = economy (runs per over). Runs saved /100 = runs per 100 balls saved against an average bowler in the same situations. ")
                + f"Seasons above exp. = seasons assessed in which he beat expected.</p>"
                f"<div class='box' style='margin-top:6px'>{esc(edge_txt)}</div></div></div>")
        return slide(n, kick, f"Top 10 {who} under pressure: {rows[0]['name']} leads, but the ranges overlap.", body,
                     (f"The top 10 are a group of ten, not a strict order. " if sep[0] == 0 else f"Only {sep[0]} of {sep[1]} pairs are clearly apart. ") + f"The thinnest samples are {min(r['stats']['balls'] for r in rows)} High-pressure balls, so wide ranges are a warning, not noise to ignore.")
    sl.append(top_slide(4, BAT, "bat", CH["bat"], "batters", "Top 10 batters"))
    sl.append(top_slide(5, BOWL, "bowl", CH["bowl"], "bowlers", "Top 10 bowlers"))
    # ---- 6 how sure are we
    rb = {"leverage_only": "Leverage only (no boosts)", "rule_based": "Rule-based pressure (situations, not swing)", "with_close_game": "Add a close-game boost (hindsight)",
          "d18_strict_buckets": "Pressure scale from earlier seasons only", "season_centred": "Season average removed"}
    rb_rows = [[rb[v], f"{ROB[(v, 'bat')]:.0f}%", f"{ROB[(v, 'bowl')]:.0f}%"] for v in rb if (v, "bat") in ROB.index]
    chk = [f"**{off_pass} of {off_n} checks pass** against the organisers' official match list: all {SPAN_M} of our matches are in it, with the same season and date; playoffs, super overs and no-result matches agree; the {N_ABS} official matches with no balls were all abandoned."]
    why_diff = {"Winner agrees (no result = no winner)": "all are rain-affected matches the ball data alone could not settle; every one is already left out of the win-chance model",
                "Reduced-overs (DLS) matches agree": "our flag is wider than the official one, and every flagged match is left out of the win-chance model (the safe direction)"}
    for r in off_diff.itertuples():
        chk.append(f"Reported, not hidden: {r.check} \u2014 {r.detail}: {why_diff.get(r.check, 'see step0_official_meta_check.csv')}.")
    body = (f"<div class='cols'><div class='col' style='flex:0.95'><h2>Tested one season ahead: did the top 10 stay above average?</h2><img class='chart' src='{b64(CH['backtest'])}'>"
            f"<p class='small'>Pooled 2024\u201326. {esc(hit_line(bat_p, 'Batters'))}. {esc(hit_line(bowl_p, 'Bowlers'))}. Verdict: {esc(CLAIM_BAT)}. Only {cnt(bat_p.score_top10_assessable)} batter and {cnt(bowl_p.score_top10_assessable)} bowler player-seasons could be assessed, so every rate is noisy.</p></div>"
            f"<div class='col' style='flex:1.05'><h2>Inside each top 10</h2><p class='small' style='color:var(--ink);font-size:12.5px'>{SEP_BAT[0]} of {SEP_BAT[1]} batter pairs and {SEP_BOWL[0]} of {SEP_BOWL[1]} bowler pairs have clearly separate 80% ranges.</p>"
            f"<h2 style='margin-top:6px'>Different definitions of pressure: share of the top 20 kept</h2>{table(['Definition', 'Batters', 'Bowlers'], rb_rows, 'tbl dense', ['l', 'r', 'r'])}"
            f"<h2 style='margin-top:6px'>Win-chance forecast and data checks</h2><ul class='lim' style='font-size:11.5px;line-height:1.25'>"
            f"<li>Forecast error (Brier score; 0 is perfect, {coin:.2f} is a coin flip): second innings {f3(brier_2.min())}\u2013{f3(brier_2.max())}, clearly better than a coin flip; first innings {f3(brier_1.min())}\u2013{f3(brier_1.max())}, barely.</li>"
            + "".join(f"<li>{inline(x)}</li>" for x in chk) + "</ul></div></div>")
    sl.append(slide(6, "How sure are we", "Read each list as a group: it describes the past and was not shown to predict next season.", body,
                    "Trust the group, not the order: the rule-based pressure definition keeps only "
                    f"{ROB[('rule_based', 'bat')]:.0f}% of the batter and {ROB[('rule_based', 'bowl')]:.0f}% of the bowler top 20, so the names depend on how pressure is defined."))
    # ---- 7 limits and next steps
    lim = [
        f"**IPL only.** T20I and A-team matches in the data are left out, so every player is measured against the same opposition level and playing conditions.",
        f"**No venue adjustment.** Venue names could not be looked up (source sites were blocked). The organisers' venue ids ({N_VENUE_IDS} venues) arrived after the method was frozen, so they are not used.",
        f"**First-innings win chances are weak** (error {f3(brier_1.min())}\u2013{f3(brier_1.max())} against {coin:.2f} for a coin flip); second-innings ones are informative. The {SEAS.split(chr(8211))[0]} forecast learned from one season only.",
        "**No fielding:** catches, run-outs and wicketkeeping are not in the data.",
        f"**Some parts of the score could not tell players apart** ({NO_INFO_TXT}) and carry no weight.",
        "**Small samples:** the thinnest top-10 players have 63 to 120 High-pressure balls; ranges are wide.",
        f"**Not a forecast:** {CLAIM_BAT}; one-season-ahead hit rates did not clearly beat simple rankings.",
    ]
    lim[5] = f"**Small samples:** the thinnest top-10 players have {min(r['stats']['balls'] for r in BAT + BOWL)} High-pressure balls, so ranges are wide."
    nxt = ["Use the organisers' venue ids for a home-ground adjustment.",
           "Extend to T20I with a level-of-opposition adjustment.",
           f"Add more seasons (the {SEAS.split(chr(8211))[0]} forecast learned from one)."]
    body = (f"<div class='cols'><div class='col' style='flex:1.15'><h2>Limits, in plain words</h2><ul class='lim'>" + "".join(f"<li>{inline(x)}</li>" for x in lim) + "</ul></div>"
            f"<div class='col' style='flex:0.85'><div class='howto'><b>How to use this score</b><ul>" + "".join(f"<li>{inline(x)}</li>" for x in META["how_to_use"]) + "</ul></div>"
            f"<h2 style='margin-top:8px'>Next steps</h2><ul class='lim'>" + "".join(f"<li>{inline(x)}</li>" for x in nxt) + f"</ul><div style='margin-top:6px'>{dash_box()}</div></div></div>")
    sl.append(slide(7, "Limits and next steps", "The Clutch Score is a careful record of IPL pressure performance, with known limits.", body,
                    "Use it to see who has delivered when the match was on the line and how sure we are, not to predict next season."))
    return f"<!doctype html><html><head><meta charset='utf-8'><title>RR Clutch Index deck</title><style>{DECK_CSS}</style></head><body>{''.join(sl)}</body></html>"

# ------------------------------------------------------------------------------------------ C: the cheat sheet
CS_CSS = BASE_CSS + """
@page{size:A4;margin:0}
.page{width:794px;height:1123px;padding:26px 30px 18px 30px;position:relative;overflow:hidden;font-size:10.4px;line-height:1.3}
.top{border-bottom:3px solid var(--pink);padding-bottom:6px;margin-bottom:7px}
.top .k{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--pink);font-weight:700}
.top h1{font-size:17px;line-height:1.15;margin-top:2px}
.honest{background:#FFF4D6;border:1.5px solid #E0B100;border-radius:6px;padding:5px 8px;font-size:9.6px;line-height:1.28;margin-bottom:5px}
h2{font-size:11.5px;font-weight:800;margin:6px 0 3px 0}
.tbl{font-size:9.6px}.tbl td,.tbl th{padding:2px 4px}
.box{background:var(--tint);border-radius:5px;padding:5px 8px;font-size:9.6px;line-height:1.3}
.howto{background:#EAF0FF;border-left:5px solid var(--blue);border-radius:0 5px 5px 0;padding:4px 8px;font-size:9.6px;line-height:1.28}
.howto ul{padding-left:13px}
.row{display:flex;gap:10px;align-items:stretch}.row>div{min-width:0}
.ph-real{padding:5px 8px;gap:8px;font-size:9px}.ph-real img{width:100px;height:100px}
.ph{padding:6px 8px;font-size:9px}
.small{font-size:9px;color:var(--muted);line-height:1.28}
.foot{margin-top:5px;font-size:8.3px;color:var(--muted);line-height:1.25}
"""

def cheat_html():
    def tbl(rows, role):
        if role == "bat":
            hdr, al = ["#", "Batter", "Team", "Clutch Score (80% range)", "High balls", "SR", "Runs above exp. /100", "Seasons above"], ["r", "l", "l", "r", "r", "r", "r", "r"]
            trs = [[str(r["rank"]), f"<b>{esc(r['name'])}</b>", esc(team(r)), f"<b>{scf(r['score'])}</b> ({srng(r['lo'], r['hi'])})", str(r["stats"]["balls"]), f1(r["stats"]["sr"]), sgn(r["stats"]["above_per100"], 0), seasons_above(r["id"], role)] for r in rows]
        else:
            hdr, al = ["#", "Bowler", "Team", "Clutch Score (80% range)", "High balls", "Econ", "Runs saved /100", "Seasons above"], ["r", "l", "l", "r", "r", "r", "r", "r"]
            trs = [[str(r["rank"]), f"<b>{esc(r['name'])}</b>", esc(team(r)), f"<b>{scf(r['score'])}</b> ({srng(r['lo'], r['hi'])})", str(r["stats"]["balls"]), f2(r["stats"]["econ"]), sgn(r["stats"]["saved_per100"], 0), seasons_above(r["id"], role)] for r in rows]
        return table(hdr, trs, "tbl", al, raw=True)
    howto = "".join(f"<li>{inline(x)}</li>" for x in META["how_to_use"])
    eb, ew = TOP["edge"]["bat"], TOP["edge"]["bowl"]
    return f"""<!doctype html><html><head><meta charset='utf-8'><title>RR Clutch Index cheat sheet</title><style>{CS_CSS}</style></head><body><div class="page">
<div class="top"><div class="k">RR Clutch Index &middot; SupeRR Selector Season 2, Round 1 &middot; IPL {esc(SEAS)}, data to {esc(META['last_match'])}</div>
<h1>Top 10 batters and top 10 bowlers under pressure: read each list as a group of ten.</h1></div>
<div class="honest"><b>Honesty line.</b> {esc(HONESTY)}</div>
<h2>Top 10 batters (Clutch Score 0&ndash;100 within role; 80% range = we are 80% sure the true value sits inside)</h2>
{tbl(BAT, 'bat')}
<h2>Top 10 bowlers</h2>
{tbl(BOWL, 'bowl')}
<p class='small' style='margin-top:3px'>Team = 2026 team. High balls = High-pressure balls faced or bowled. SR = strike rate; Econ = economy (runs per over); runs above expected or saved per 100 balls are measured against an average player in the same situation. Seasons above = seasons assessed in which he beat expected. {SEP_BAT[0]} of {SEP_BAT[1]} batter pairs and {SEP_BOWL[0]} of {SEP_BOWL[1]} bowler pairs have separate 80% ranges, so overlapping ranges are too close to call. Next in line: {esc(eb['next_name'])} ({scf(eb['next_score'])}, {srng(eb['next_lo'], eb['next_hi'])}) among batters and {esc(ew['next_name'])} ({scf(ew['next_score'])}, {srng(ew['next_lo'], ew['next_hi'])}) among bowlers; both overlap the 10th-ranked player.</p>
<div class="row" style="margin-top:5px"><div style="flex:1.2"><div class="box"><b>How we define pressure.</b> {esc(PRESSURE_ONE_LINE)} Each ball starts from a win-chance model trained on earlier seasons only; leverage is how much that chance could swing on the ball.</div>
<div class="box" style="margin-top:4px"><b>How we judge performance under pressure.</b> The Clutch Score (short for Clutch Reliability Score) compares each player with an average player in the same situation on High-pressure balls, then adds match impact, holding up against his own Low-pressure level and consistency across seasons. Small samples are pulled toward average and recent seasons count more. Weights at work: batters {esc(eff_phrase('bat'))}; bowlers {esc(eff_phrase('bowl'))}. {esc(TOP['eligibility'])}</div></div>
<div style="flex:1">{dash_box()}</div></div>
<h2>How to use this score</h2><div class="howto"><ul>{howto}</ul></div>
<div class="foot">IPL only (T20I and A-team matches left out so every player faces the same level and conditions). No venue adjustment (names not available when the method was frozen). No fielding data. First-innings win chances are weak. A rule-based pressure definition keeps only {ROB[('rule_based', 'bat')]:.0f}% of the batter and {ROB[('rule_based', 'bowl')]:.0f}% of the bowler top 20. Our {SPAN_M} IPL matches ({SC_M} rated, {SEAS}; 2022 used only for training) all match the organisers' official match list. Independent submission, not an official Rajasthan Royals product. Build {esc(META['build'])}.</div>
</div></body></html>"""

# ------------------------------------------------------------------------------------------ D: methodology note + data dictionary (one block model, two renderers)
class Doc:
    def __init__(self):
        self.b = []
    def h1(self, t): self.b.append(("h1", t))
    def h2(self, t): self.b.append(("h2", t))
    def h3(self, t): self.b.append(("h3", t))
    def p(self, t): self.b.append(("p", t))
    def ul(self, items): self.b.append(("ul", items))
    def ol(self, items): self.b.append(("ol", items))
    def table(self, headers, rows, aligns=None): self.b.append(("table", headers, rows, aligns))
    def note(self, t): self.b.append(("note", t))
    def pagebreak(self): self.b.append(("pb",))
    def extend(self, other): self.b.extend(other.b)

    def md(self):
        out = []
        for blk in self.b:
            k = blk[0]
            if k == "h1": out.append(f"# {blk[1]}\n")
            elif k == "h2": out.append(f"## {blk[1]}\n")
            elif k == "h3": out.append(f"### {blk[1]}\n")
            elif k == "p": out.append(blk[1] + "\n")
            elif k == "ul": out.append("\n".join(f"- {x}" for x in blk[1]) + "\n")
            elif k == "ol": out.append("\n".join(f"{i + 1}. {x}" for i, x in enumerate(blk[1])) + "\n")
            elif k == "note": out.append("> " + blk[1] + "\n")
            elif k == "table":
                _, hd, rows, al = blk
                al = al or ["l"] * len(hd)
                sep = " | ".join({"l": ":---", "r": "---:", "c": ":---:"}[a] for a in al)
                cell = lambda x: str(x).replace("|", "\\|").replace("\n", " ")
                out.append("| " + " | ".join(hd) + " |\n| " + sep + " |\n" + "\n".join("| " + " | ".join(cell(c) for c in r) + " |" for r in rows) + "\n")
        return "\n".join(out)

    def html_body(self):
        out = []
        for blk in self.b:
            k = blk[0]
            if k in ("h1", "h2", "h3"): out.append(f"<{k}>{inline(blk[1])}</{k}>")
            elif k == "p": out.append(f"<p>{inline(blk[1])}</p>")
            elif k == "ul": out.append("<ul>" + "".join(f"<li>{inline(x)}</li>" for x in blk[1]) + "</ul>")
            elif k == "ol": out.append("<ol>" + "".join(f"<li>{inline(x)}</li>" for x in blk[1]) + "</ol>")
            elif k == "note": out.append(f"<div class='note'>{inline(blk[1])}</div>")
            elif k == "pb": out.append("<div class='pb'></div>")
            elif k == "table": out.append(table(blk[1], blk[2], "tbl", blk[3]))
        return "\n".join(out)

D_CSS = BASE_CSS + """
@page{size:A4;margin:16mm 15mm 16mm 15mm}
body{font-size:10.4px;line-height:1.42}
h1{font-size:21px;line-height:1.2;margin:0 0 4px 0;border-bottom:3px solid var(--pink);padding-bottom:5px}
h2{font-size:14px;margin:14px 0 4px 0;color:var(--blue);break-after:avoid}
h3{font-size:11.5px;margin:9px 0 3px 0;break-after:avoid}
p{margin:3px 0 5px 0}ul,ol{margin:2px 0 6px 18px}li{margin-bottom:2px}
.tbl{font-size:9.2px;margin:4px 0 8px 0}.tbl td,.tbl th{padding:2.5px 4px}
tr{break-inside:avoid}thead{display:table-header-group}
.note{background:#FFF4D6;border:1.5px solid #E0B100;border-radius:6px;padding:6px 9px;margin:6px 0;break-inside:avoid}
.pb{break-after:page}
"""

def build_method():
    d = Doc()
    d.h1("RR Clutch Index: Methodology and Limitations")
    d.p(f"Brief: {META['brief']} "
        f"Data: {SPAN_M} IPL matches ({S['ipl_matches_span']}), {S['ipl_balls']:,} balls, to {META['last_match']}. Rated: {SC_M} matches and {SC_B:,} balls in {SEAS}; {S['training_only']} is used only to train the win-chance model. Build {META['build']}, seed {SEED}. Raw data sha256 {META['data_sha256']}.")
    d.note("**Read this first.** " + HONESTY)
    d.h2("1. The answer")
    d.p(f"{TOP['read']} Team is the player's 2026 team. {TOP['eligibility']}")
    for title, rows, role in (("Top 10 batters", BAT, "bat"), ("Top 10 bowlers", BOWL, "bowl")):
        d.h3(title)
        if role == "bat":
            hd, al = ["#", "Player", "Team", "Role", "Clutch Score (80% range)", "High balls", "SR", "Runs above exp. /100", "Seasons above", "Why"], ["r", "l", "l", "l", "r", "r", "r", "r", "r", "l"]
            tr = [[r["rank"], r["name"], team(r), r["sub_role"], f"{scf(r['score'])} ({srng(r['lo'], r['hi'])})", r["stats"]["balls"], f1(r["stats"]["sr"]), sgn(r["stats"]["above_per100"], 1), seasons_above(r["id"], role), r["why"]] for r in rows]
        else:
            hd, al = ["#", "Player", "Team", "Role", "Clutch Score (80% range)", "High balls", "Econ", "Runs saved /100", "Seasons above", "Why"], ["r", "l", "l", "l", "r", "r", "r", "r", "r", "l"]
            tr = [[r["rank"], r["name"], team(r), r["sub_role"], f"{scf(r['score'])} ({srng(r['lo'], r['hi'])})", r["stats"]["balls"], f2(r["stats"]["econ"]), sgn(r["stats"]["saved_per100"], 1), seasons_above(r["id"], role), r["why"]] for r in rows]
        d.table(hd, tr, al)
    eb, ew = TOP["edge"]["bat"], TOP["edge"]["bowl"]
    d.p(f"Next in line: {eb['next_name']} among batters ({scf(eb['next_score'])}, 80% range {srng(eb['next_lo'], eb['next_hi'])}) and {ew['next_name']} among bowlers ({scf(ew['next_score'])}, {srng(ew['next_lo'], ew['next_hi'])}). "
        f"{'Both overlap the 10th-ranked player, so the data cannot separate them.' if eb['overlaps_10th'] and ew['overlaps_10th'] else ''} "
        f"Top-10 pairs separated by their 80% ranges: batters {SEP_BAT[0]} of {SEP_BAT[1]}; bowlers {SEP_BOWL[0]} of {SEP_BOWL[1]} (`step4_too_close_to_call.csv`).")
    d.h2("2. How we define pressure")
    d.p(f"The Clutch Reliability Score (Clutch Score, 0 to 100, roughly a percentile within a role) is a **historical pressure-performance indicator**: it describes how a player did when a ball could swing the match. It is not a forecast (D15). The method has six steps.")
    d.ol(METHOD["flow"])
    d.p(f"A simple logistic win-chance model, one per season, is trained only on earlier seasons and scored out of sample (D4, D13, D26). **Leverage** is the expected size of the win-probability swing on a ball. The Pressure Index is leverage with small context boosts, ranked 0 to 100 against earlier balls only (D18, D27). "
        f"High is {PARAM['high_cut']} or more (about the top 20%), Medium {PARAM['med_cut']} to {PARAM['high_cut']}, Low below {PARAM['med_cut']}. Formula: `{P['pressure']['formula']}`.")
    boosts = P["pressure"].get("boosts", [])
    if boosts:
        d.table(["Boost", "Correlation with leverage (2022 reference)", "Initial weight", "Final weight", "Action"],
                [[b["boost"], f"{b['spearman_with_leverage_2022ref']:+.2f}".replace("-", MINUS), b["initial_weight"], b["final_weight"], b["action"]] for b in boosts], ["l", "r", "r", "r", "l"])
    sr_ = [[str(int(r.season)), f"{r.D27_High * 100:.1f}%", f"{r.D27_Medium * 100:.1f}%", f"{r.D27_Low * 100:.1f}%", f"{r.D18strict_High * 100:.1f}%", f"{int(r.balls):,}"] for r in shares.itertuples()]
    d.table(["Season", "High (main, D27)", "Medium", "Low", "High (strict D18, comparison)", "Balls"], sr_, ["l", "r", "r", "r", "r", "r"])
    d.h3("Win-chance forecast quality")
    d.p(f"Brier score: lower is better; a coin flip scores {coin:.2f}. Calibration by probability bin is in `outputs/tables/step1a_calibration.csv`.")
    wr = [[r.season, {"all": "All", "1": "1st", "2": "2nd"}[r.innings], r.train_seasons, int(r.train_matches), int(r.test_matches), f"{r.brier:.3f}", rng(r.brier_lo80, r.brier_hi80, 3), f"{r.log_loss:.3f}"] for r in wpe.itertuples()]
    d.table(["Season", "Innings", "Trained on", "Train matches", "Test matches", "Brier", "Brier 80% range", "Log loss"], wr, ["l", "l", "l", "r", "r", "r", "r", "r"])
    d.p(f"Second-innings forecasts beat a coin flip clearly; first-innings forecasts have little skill beyond the base rate (Brier {f3(brier_1.min())} to {f3(brier_1.max())}). The {SEAS.split(chr(8211))[0]} forecast learned from one season only. A gradient-boosting model was tried and was worse in every fold, so it was not adopted (D19).")
    d.h2("3. How we judge performance under pressure")
    d.p(f"On High-pressure balls each player is compared with an average player in exactly the same situation (**Runs Above Expected**, RAE, for batters; **Runs Saved vs Expected**, RSE, for bowlers), and four parts are blended with weights frozen before any ranking existed (pre-registration sha256 {PARAM['sha']}, D29; never tuned on the backtest, D6, D16).")
    d.p("Score = 100 \u00d7 \u03a6( \u03a3 w\u00b7z / sd ), with z = each part standardised among rated players of the role.")
    meaning = {"S": "Skill under pressure: RAE (batters) or RSE (bowlers) per ball in High pressure",
               "I": "Match impact: win probability added (WPA) per ball in High pressure",
               "H": "Holds up: Low-pressure level minus High-pressure level, sign set so that dropping off is penalised",
               "C": "Consistency: share of seasons (at least " + PARAM["min_hi_season"] + " High balls) in which the player was above expected"}
    wr = []
    for r in comp.itertuples():
        inf = bool(r.informative)
        wr.append([{"bat": "Batters", "bowl": "Bowlers"}[r.role], f"**{r.component}**: {meaning[r.component]}", f"{r.weight:.2f}", "yes" if inf else "no: no detectable difference between players",
                   f"{r.prior_mean:.4f}", f"{r.prior_k:.4g}" if inf else "n/a", f"**{r.effective_weight:.3f}**"])
    d.table(["Role", "Part", "Planned weight", "Informative?", "Prior mean", "Prior spread (S, I, H: between-player variance; C: prior strength in seasons)", "Effective weight"], wr, ["l", "l", "r", "l", "r", "r", "r"])
    d.p(f"A part with no detectable between-player differences at these sample sizes carries no weight and its weight moves to the others (D30): {NO_INFO_TXT}. Effective weights: batters {eff_phrase('bat')}; bowlers {eff_phrase('bowl')}.")
    d.p(f"Each part is shrunk toward the role average (Empirical Bayes using each player's own sampling variance and a Kish effective sample size, D31; shrinkage strength floored at {PARAM['k_floor']} balls; consistency uses a prior strength of {PARAM['prior_seasons']} seasons). "
        f"Recent seasons count more: {PARAM['recency']} (decay {PARAM['decay']} a season). 80% range: {PARAM['boots']} bootstrap draws over the player's matches, seed {SEED}, 10th to 90th percentile. All-rounders: 0.5 x batting score + 0.5 x bowling score.")
    d.h3("Why not a simple average?")
    d.ul(METHOD["why_not_average"])
    d.h3("Who is rated")
    d.p(f"{TOP['eligibility']} All-rounders need both thresholds. {S['in_scope']} players were in scope (appeared in IPL 2025 or 2026): {S['scorable_bat']} batters and {S['scorable_bowl']} bowlers are rated ({S['scorable_ar']} all-rounders are scored on both; {DISTINCT} distinct players) and {S['not_scorable']} are listed as Not Scorable on IPL data because their High-pressure sample is too small.")
    d.h2("4. Did the score predict next season? (backtest)")
    d.p(f"Folds 2024, 2025, 2026. For fold N the score is rebuilt from seasons 2023 to N-1 only. The outcome is High-pressure runs above expected (batters) or runs saved (bowlers) per ball in season N, needing at least {PARAM['bt_min_outcome']} High balls; \"above average\" is relative to all players that season. "
        f"Entry needs at least {PARAM['bt_min_bat']} High balls faced or {PARAM['bt_min_bowl']} High legal balls bowled in the history window. Naive baseline: top 10 by overall strike rate (batters) or economy (bowlers).")
    br = []
    for r in bt.itertuples():
        pooled = r.fold == "pooled"
        row = [{"bat": "Batters", "bowl": "Bowlers"}[r.role], f"**{r.fold}**" if pooled else str(r.fold), int(r.qualified), int(r.assessable_qualified),
               f"{cnt(r.score_top10_assessable)} / {cnt(r.naive_top10_assessable)}", f"{r.score_hit_rate_excl:.1f}% / {r.naive_hit_rate_excl:.1f}%"]
        if HAS_BASE:
            row.append(f"{r.base_rate_random_pick:.1f}%" if pd.notna(r.base_rate_random_pick) else "\u2014")
        row += [f"{r.score_hit_rate_as_miss:.1f}% / {r.naive_hit_rate_as_miss:.1f}%", f"{sgn(r.spearman_score_outcome, 2)} / {sgn(r.spearman_naive_outcome, 2)}", ivl(r.hit_diff_lo80, r.hit_diff_hi80) if pooled else "\u2014"]
        if HAS_CLAIM:
            row.append(claim_text(r._asdict()) if pooled else "\u2014")
        br.append(row)
    bh = ["Role", "Fold", "Qualified", "Assessable", "Top-10 assessable (score / naive)", "Hit rate excl. unassessable (score / naive)"] + (["Random-pick hit rate"] if HAS_BASE else []) \
        + ["Hit rate, unassessable = miss (score / naive)", "Rank correlation (score / naive)", "Difference, 80% interval (pts)"] + (["Pre-registered claim"] if HAS_CLAIM else [])
    d.table(bh, br, ["l", "l"] + ["r"] * (len(bh) - 2 - (1 if HAS_CLAIM else 0)) + (["l"] if HAS_CLAIM else []))
    d.p(f"**Result.** {hit_line(bat_p, 'Batters')}: **{CLAIM_BAT}**. {hit_line(bowl_p, 'Bowlers')}: **{CLAIM_BOWL}**. Rank correlation with next-season outcome: batters {sgn(bat_p.spearman_score_outcome, 2)} (naive {sgn(bat_p.spearman_naive_outcome, 2)}), bowlers {sgn(bowl_p.spearman_score_outcome, 2)} (naive {sgn(bowl_p.spearman_naive_outcome, 2)}). "
        "The random-pick hit rate is the share of all assessable players who were above average next season: what picking at random would score.")
    d.p(f"**Caution.** Only {cnt(bat_p.score_top10_assessable)} batter and {cnt(bowl_p.score_top10_assessable)} bowler player-seasons in the top 10 could be assessed across the three folds, so every hit rate is very noisy. The result is published as it came out; no weight or metric was changed after seeing it.")
    d.h2("5. Sensitivity and robustness")
    wsens = sens[sens.component.isin(list("SIHC"))]
    sp = wsens.pivot_table(index=["role", "component"], columns="change", values="top10_overlap_pct").reset_index()
    sp["o"] = sp.component.map({c: i for i, c in enumerate("SIHC")}); sp = sp.sort_values(["role", "o"], ascending=[False, True]).drop(columns="o")
    d.table(["Role", "Weight changed", *[f"{sgn(c * 100, 0)}%" for c in sp.columns[2:]]], [[{"bat": "Batters", "bowl": "Bowlers"}[r.role], r.component] + [f"{r[c]:.0f}%" for c in sp.columns[2:]] for _, r in sp.iterrows()], ["l", "l", "r", "r"])
    d.p(f"Each planned weight moved by plus or minus 10% (others renormalised): the top-10 overlap with the main ranking is shown above (top-10 overlap across all weighting variants never drops below {sens.top10_overlap_pct.min():.0f}%).")
    osens = sens[~sens.component.isin(list("SIHC"))]
    if len(osens):
        scen = {"skill_only": "Only skill under pressure (S)", "consistency_only": "Only consistency (C)", "equal_weights": "All informative parts equal"}
        d.table(["Role", "Alternative weighting", "Top-10 overlap with main"], [[{"bat": "Batters", "bowl": "Bowlers"}[r.role], scen.get(r.component, r.component), f"{r.top10_overlap_pct:.0f}%"] for r in osens.itertuples()], ["l", "l", "r"])
    if TCC is not None:
        d.table(["Role", "Top-10 pairs", "Pairs separated by 80% ranges", "Pairs too close to call"], [[{"bat": "Batters", "bowl": "Bowlers"}.get(r.role, r.role), int(r.top10_pairs), int(r.pairs_separated_by_80pct_ranges), int(r.pairs_too_close_to_call)] for r in TCC.itertuples()], ["l", "r", "r", "r"])
    vmeaning = {"leverage_only": "Pressure = leverage only, no context boosts", "rule_based": "Pressure from rules (chase, death, etc.) instead of leverage",
                "with_close_game": "Adds the hindsight close-game boost (comparison only, D8)", "d18_strict_buckets": "Pressure scale from earlier seasons only (strict D18, comparison)",
                "season_centred": "Season-average RAE/RSE removed (comparison only, uses later matches)"}
    d.table(["Variant", "Role", "Rated (main)", "Rated (variant)", "Top-20 overlap", "Rank correlation"],
            [[vmeaning.get(r.variant, r.variant), {"bat": "Batters", "bowl": "Bowlers"}[r.role], int(r.scorable_main), int(r.scorable_variant), f"{r.top20_overlap_pct:.0f}%", f"{r.spearman_common:.2f}"] for r in rob.itertuples()], ["l", "l", "r", "r", "r", "r"])
    low = rob[rob.top20_overlap_pct < 60]
    d.p("Top-20 overlap is the share of the main top 20 that is also in the variant's top 20. "
        + ("Below 60%: " + "; ".join(f"{vmeaning.get(r.variant, r.variant).lower()} ({'batters' if r.role == 'bat' else 'bowlers'} {r.top20_overlap_pct:.0f}%)" for r in low.itertuples()) + ". The rule-based and strict-D18 variants count situations or use fewer High balls, so different players pass the sample rules; read the lists with that in mind." if len(low) else ""))
    d.h3("Season level: expected runs trail scoring jumps")
    d.table(["Season", "Balls", "Mean runs above expected per ball", "Actual runs per ball", "Expected runs per ball"],
            [[str(int(r.season)), f"{int(r.balls):,}", f"{r.mean_rae_per_ball:+.3f}".replace("-", MINUS), f"{r.actual_rpb:.3f}", f"{r.expected_rpb:.3f}"] for r in offs.itertuples()], ["l", "r", "r", "r", "r"])
    d.p("Expected runs come from earlier matches only and trail scoring jumps (D28). Season-centred check (comparison only): top-20 overlap with the main list is " + " and ".join(f"{r.top20_overlap_pct:.0f}% for {'batters' if r.role == 'bat' else 'bowlers'}" for r in rob[rob.variant == "season_centred"].itertuples()) + ".")
    d.h2("6. Data and the official cross-check")
    d.ul([f"Scope: IPL only. {SPAN_M} matches ({S['ipl_matches_span']}), {S['ipl_balls']:,} balls; {S['wp_eligible']} matches are eligible for win probability (no-result, abandoned, DLS or reduced-overs matches are left out of pressure and WPA but stay in descriptive totals). {SC_M} matches and {SC_B:,} balls are rated ({SEAS}).",
          f"Every drop, merge, filter or fix is logged: {len(METHOD['data_notes'])} entries in `logs/DATA_NOTES.md`. Super overs are excluded from all metrics.",
          f"The organisers' official match file was checked against our {SPAN_M} matches: {off_pass} of {off_n} checks pass, and two differ, as listed below. The {N_ABS} official matches with no balls in our data were all abandoned."])
    d.table(["Check", "Status", "Detail"], [[r.check, r.status, r.detail] for r in offc.itertuples()], ["l", "l", "l"])
    d.h3("Why IPL only")
    d.p("T20I and A-team matches appear in the dataset but are left out of every metric: a player is then measured against the same opposition level and the same playing conditions as every other player, which is what a fair pressure comparison needs.")
    d.h2("7. Limitations, stated plainly")
    lim = [
        "IPL only: T20I and A-team matches are left out so every player faces the same opposition level and conditions (D38).",
        f"No venue adjustment: venue names could not be looked up (source sites blocked); the organisers' venue ids ({N_VENUE_IDS} venues) arrived after the method was frozen, so they are not used.",
        f"First-innings win probabilities have little skill beyond the base rate (Brier {f3(brier_1.min())} to {f3(brier_1.max())}); second-innings ones are informative.",
        f"The {SEAS.split(chr(8211))[0]} forecast learned from one season ({S['training_only']}) only.",
        "Expected runs from earlier matches trail scoring jumps: mean RAE per ball " + ", ".join(f"{r.mean_rae_per_ball:+.2f} ({int(r.season)})" for r in offs.itertuples() if int(r.season) >= 2023) + "; the season-centred check leaves the top 20 unchanged.",
        f"Parts of the score with no detectable player differences carry no weight: {NO_INFO_TXT} (D30).",
        f"Top-10 rankings are too close to call: {SEP_BAT[0] + SEP_BOWL[0]} of {SEP_BAT[1] + SEP_BOWL[1]} top-10 pairs are separated by their 80% ranges.",
        f"Backtest: batters {CLAIM_BAT}; bowlers {CLAIM_BOWL}. Intervals of the difference: batters {ivl(bat_p.hit_diff_lo80, bat_p.hit_diff_hi80)}, bowlers {ivl(bowl_p.hit_diff_lo80, bowl_p.hit_diff_hi80)} points.",
        f"A rule-based definition of pressure keeps only {ROB[('rule_based', 'bat')]:.0f}% of the batter and {ROB[('rule_based', 'bowl')]:.0f}% of the bowler top 20, so the names depend on how pressure is defined.",
        "Fielding is not in the data; wicketkeeper and captaincy are not identifiable.",
    ]
    d.ol(lim)
    d.h2("8. Next steps")
    d.ul(["Use the organisers' venue ids for a home-ground adjustment.", "Extend to T20I with a level-of-opposition adjustment.",
          f"Add more seasons (the {SEAS.split(chr(8211))[0]} forecast learned from one)."])
    d.p("Every number in this note is read from `outputs/tables/*.csv`, `outputs/tables/summary_numbers.json` and `outputs/deliverables/dashboard_payload.json` by `src/step7_docs.py`. Independent submission, not an official Rajasthan Royals product.")
    return d

def build_dictionary():
    d = Doc()
    d.h1("RR Clutch Index: Data Dictionary")
    d.p("Part A lists every column of the ball table. Part B lists every metric. Part C gives the shared definitions the numbers rely on. Sources: `outputs/tables/step0_ball_columns.csv`, `dashboard_payload.json` (glossary), `logs/DEFINITIONS.md`.")
    d.p("Note: the `step5_*` tables in `outputs/tables/` are not used in Round 1 deliverables.")
    d.h2("Part A. Ball table columns")
    d.p(f"{len(bcols)} columns: {int((bcols.kind == 'raw column').sum())} raw columns (unchanged from the source) and {int((bcols.kind == 'derived').sum())} derived columns. One row = one delivery (wides and no-balls included).")
    d.table(["Column", "Kind", "Meaning", "Rule"], [[f"`{r.column}`", r.kind.replace(" column", ""), r.meaning, r.rule] for r in bcols.itertuples()], ["l", "l", "l", "l"])
    d.h2("Part B. Metrics")
    d.h3("B1. Glossary (shown in the dashboard and the deliverables)")
    d.table(["Term", "Plain meaning"], [[f"**{g['term']}**", g["meaning"]] for g in P["glossary"]], ["l", "l"])
    d.h3("B2. Score components and score columns (`step4_scores_*.csv`)")
    comps = [["S", "Skill under pressure: shrunk runs above expected per ball (batters) or runs saved vs expected per ball (bowlers) on High-pressure balls, recency-weighted"],
             ["I", "Match impact: shrunk win probability added per High-pressure ball"],
             ["H", "Holds up: shrunk difference between Low- and High-pressure form"],
             ["C", "Consistency: share of seasons (at least " + PARAM["min_hi_season"] + " High balls) above expected, shrunk toward the role mean"],
             ["Z", "Weighted sum of standardised components (z-scores) before conversion to 0-100"],
             ["score", "Clutch Reliability Score: 100 x normal CDF of Z / sd(Z), among rated players of the role"],
             ["score_lo80, score_hi80", "80% range of the score from resampling the player's matches"],
             ["S_raw, I_raw, H_raw", "Components before shrinkage"], ["S_lo80, S_hi80", "80% range of the skill component"],
             ["n_hi_w, n_lo_w, n_eff_hi", "Recency-weighted number of High- and Low-pressure balls; Kish effective number of High balls"], ["hi_qual_n", "Number of High-pressure balls (faced or bowled) used for the player"],
             ["seasons_assessed, seasons_positive", "Seasons with enough High balls; seasons where the player was above expected"],
             ["rank", "Rank within role by score"], ["bat_score, bowl_score (all-rounders)", "The batting and bowling scores that are averaged 50/50"],
             ["combined_wpa_per_match", "Batting plus bowling win probability added, per match (fraction of 1)"]]
    d.table(["Name", "Meaning"], comps, ["l", "l"])
    d.h3("B3. Descriptive player metrics (`step3_batting_metrics.csv`, `step3_bowling_metrics.csv`)")
    d.p("These describe a player and are not part of the score unless listed in B2. Prefix `High_` or `Low_` = on High- or Low-pressure balls. Win probability added (WPA) is stored as a fraction of 1 (1.0 = 100 percentage points).")
    mt = [["`*_balls`, `*_legal`, `*_deliveries`", "Balls faced (batters), legal balls bowled, or all deliveries bowled including wides and no-balls"],
          ["`*_runs`", "Runs scored (batters: off the bat) or conceded (bowlers)"], ["`*_outs`, `*_wkts`", "Times dismissed (batters) or wickets taken (bowlers)"],
          ["`*_sr`", "Strike rate: runs per 100 balls faced"], ["`*_avg`", "Average: runs per dismissal"], ["`*_econ`", "Economy: runs conceded per over (legal balls)"],
          ["`*_balls_per_out`, `*_balls_per_wkt`", "Balls per dismissal or per wicket"], ["`*_dot_pct`", "Percentage of balls with no run off the bat (batters) or no runs conceded (bowlers)"],
          ["`*_boundary_pct`", "Percentage of balls where the bat scored 4 or 6 (batters) or conceded 4 or 6 (bowlers)"],
          ["`*_rae_per100`", "Runs Above Expected per 100 balls (batters)"], ["`*_rse_per100`", "Runs Saved vs Expected per 100 balls (bowlers)"],
          ["`*_wpa_per100`, `*_wpa_total`", "Win probability added, per 100 balls and in total"], ["`pressure_drop_per100`", "Low-pressure minus High-pressure runs above (or saved vs) expected per 100 balls; positive = worse under pressure"],
          ["`High_rae_per100_pace`, `_spin`, `_balls_pace`, `_balls_spin`", "High-pressure RAE per 100 against pace and spin, and the balls behind it"],
          ["`High_rae_per100_death`, `_setting`, `_chasing`", "High-pressure RAE per 100 in the death overs, when batting first (setting) and when chasing, with `_balls_*` counts"],
          ["`High_rse_per100_vs_lhb`, `_vs_rhb`", "High-pressure RSE per 100 against left- and right-hand batters, with `_balls_vs_*` counts"],
          ["`High_rse_per100_death`, `death_econ_all`, `death_legal_all`", "High-pressure RSE per 100 in the death overs; death-overs economy and legal balls over all pressure levels"],
          ["`seasons`", "Seasons in which the player appears"], ["`player_id`, `player_name`", "One player, one ID, from the player map (Step 0)"]]
    d.table(["Column pattern", "Meaning"], mt, ["l", "l"])
    d.h3("B4. Top-10 summary fields (`summary_numbers.json` > `top10`)")
    d.table(["Field", "Meaning"], [["rank, name, team", "Rank within role by Clutch Score; the player's 2026 team"], ["score, lo, hi", "Clutch Score and its 80% range"],
            ["stats", "High-pressure balls, runs, strike rate or economy, dismissals or wickets, runs above expected (or saved) per 100 balls, win probability added per 100 balls"],
            ["why", "One-sentence plain-language reason built from the stats"], ["edge", "The next-ranked player (#11) and whether his 80% range overlaps the 10th-ranked player's"],
            ["pairs", "Top-10 pairs and how many are separated by their 80% ranges"]], ["l", "l"])
    d.h2("Part C. Shared definitions (from `logs/DEFINITIONS.md`)")
    secA = DEFS.split("## B.")[0]
    items = re.findall(r"^- \*\*(.+?):\*\* (.+)$", secA, re.M)
    d.table(["Term", "Definition"], [[f"**{k}**", v] for k, v in items], ["l", "l"])
    secB = DEFS.split("## B.")[1].split("## C.")[0]
    rows = []
    for line in secB.splitlines():
        if line.startswith("|") and not line.startswith("|---") and not line.startswith("| Concept"):
            cells = [c.strip() for c in line.strip().strip("|").split(" | ")]
            if len(cells) == 2:
                rows.append(cells)
    d.h3("How the dataset encodes these concepts (confirmed in Step 0)")
    d.table(["Concept", "Column(s) and rule"], rows, ["l", "l"])
    return d

# ------------------------------------------------------------------------------------------ write everything
BANNED = re.compile(r"auction|Must-Back|walk-away|price band|Plan A|purse|retain|IPL 2027|Value Pick|Hidden Gem", re.I)

def render(jobs):
    jf = TMP / "jobs.json"; jf.write_text(json.dumps(jobs))
    r = subprocess.run(["node", str(ROOT / "src" / "step7_render.js"), str(jf)], capture_output=True, text=True)
    print(r.stdout.strip())
    if r.returncode:
        print(r.stderr); sys.exit(1)

def previews(pdf, stem, dpi=70):
    for old in PREV.glob(f"{stem}_p*.png"):
        old.unlink()
    subprocess.run(["pdftoppm", "-png", "-r", str(dpi), str(pdf), str(PREV / f"{stem}_p")], check=True)
    for f in sorted(PREV.glob(f"{stem}_p*.png")):
        m = re.search(r"_p-?0*(\d+)\.png$", f.name)
        f.rename(PREV / f"{stem}_p{m.group(1)}.png")

def pages(pdf):
    out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
    return int(re.search(r"Pages:\s+(\d+)", out).group(1))

def main():
    deck = TMP / "deck.html"; deck.write_text(deck_html())
    cs = TMP / "cheat.html"; cs.write_text(cheat_html())
    method, dic = build_method(), build_dictionary()
    (DELIV / "D_Methodology_and_Limitations.md").write_text(method.md())
    (DELIV / "D_Data_Dictionary.md").write_text(dic.md())
    full = Doc(); full.extend(method); full.pagebreak(); full.extend(dic)
    dh = TMP / "method.html"
    dh.write_text(f"<!doctype html><html><head><meta charset='utf-8'><title>RR Clutch Index methodology</title><style>{D_CSS}</style></head><body>{full.html_body()}</body></html>")
    outs = {"B": DELIV / "B_RR_Clutch_Index_Deck.pdf", "C": DELIV / "C_RR_Clutch_Index_Cheat_Sheet.pdf", "D": DELIV / "D_Methodology_and_Limitations.pdf"}
    render([{"html": str(deck), "pdf": str(outs["B"]), "kind": "deck"}, {"html": str(cs), "pdf": str(outs["C"]), "kind": "a4"},
            {"html": str(dh), "pdf": str(outs["D"]), "kind": "a4flow"}])
    for k, stem in (("B", "B_deck"), ("C", "C_cheat_sheet"), ("D", "D_methodology")):
        previews(outs[k], stem, 80 if k == "B" else 100)
        print(f"{outs[k].name}: {pages(outs[k])} page(s)")
    # one combined submission PDF: the 7 deck slides, then the cheat sheet as the last page (mixed page sizes)
    from pypdf import PdfWriter
    sub = DELIV / "RR_Clutch_Index_Submission.pdf"
    w = PdfWriter()
    for k in ("B", "C"):
        w.append(str(outs[k]))
    w.add_metadata({"/Title": "RR Clutch Index: deck and cheat sheet"})
    with open(sub, "wb") as fh:
        w.write(fh)
    n = pages(sub)
    assert pages(outs["B"]) == 7 and pages(outs["C"]) == 1 and n == 8, f"unexpected page counts: deck {pages(outs['B'])}, cheat {pages(outs['C'])}, combined {n}"
    for old in PREV.glob("Submission_p*.png"):
        old.unlink()
    subprocess.run(["pdftoppm", "-png", "-r", "100", "-f", str(n), "-l", str(n), str(sub), str(PREV / "Submission_last")], check=True)
    for f in PREV.glob("Submission_last*.png"):
        f.rename(PREV / f"Submission_p{n}.png")
    print(f"{sub.name}: {n} page(s)")
    # Round 1 content check: no auction or squad wording anywhere in the PDFs or Markdown
    bad = []
    for f in list(outs.values()) + [sub]:
        txt = subprocess.run(["pdftotext", str(f), "-"], capture_output=True, text=True).stdout
        bad += [(f.name, m.group(0)) for m in BANNED.finditer(txt)]
    for f in (DELIV / "D_Methodology_and_Limitations.md", DELIV / "D_Data_Dictionary.md"):
        bad += [(f.name, m.group(0)) for m in BANNED.finditer(f.read_text())]
    assert not bad, f"auction or squad wording found: {bad[:10]}"
    print("Round 1 wording check: none of the banned auction/squad terms appear in any PDF or Markdown file")
    if DASH_URL:
        from PIL import Image
        uri, q = qr_uri(DASH_URL)
        im = Image.open(io.BytesIO(base64.b64decode(uri.split(",", 1)[1]))).convert("L")
        m = q.get_matrix(); bs = im.width // len(m)
        ok = all((im.getpixel((x * bs + bs // 2, y * bs + bs // 2)) < 128) == bool(m[y][x]) for y in range(len(m)) for x in range(len(m)))
        print(f"QR check: {len(m)}x{len(m)} modules, error correction M, pixels match matrix: {ok}; URL {DASH_URL}")
    shutil.rmtree(TMP, ignore_errors=True)

if __name__ == "__main__":
    main()
