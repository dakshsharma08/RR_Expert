"""Step 7 (B, C, D): build the slide deck, the cheat sheet and the methodology note + data dictionary.

Every number is read from outputs/tables/*.csv, outputs/tables/summary_numbers.json and
outputs/deliverables/dashboard_payload.json (and a few method parameters parsed from logs/*.md).
Nothing is typed in by hand. Numbers are rounded for display only.

Outputs (outputs/deliverables/):
  B_RR_Clutch_Index_Deck.pdf, C_RR_Clutch_Index_Cheat_Sheet.pdf, D_Methodology_and_Limitations.pdf,
  D_Methodology_and_Limitations.md, D_Data_Dictionary.md, previews/*.png

Run: python3 -I src/step7_docs.py     (needs matplotlib, pandas, Node Playwright with Chromium, pdftoppm)
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

# ------------------------------------------------------------------------------------------ colours
PINK, BLUE, GREY, INK, MUTED = "#E4007C", "#254AA5", "#8A94A6", "#1B1F3B", "#5B6275"
for fp in ("Inter-Regular.otf", "Inter-Bold.otf"):
    p = Path("/usr/share/fonts/opentype/inter") / fp
    if p.exists():
        font_manager.fontManager.addfont(str(p))
plt.rcParams.update({"font.family": ["Inter", "DejaVu Sans"], "font.size": 10, "axes.edgecolor": MUTED, "axes.labelcolor": INK,
                     "xtick.color": INK, "ytick.color": INK, "axes.spines.top": False, "axes.spines.right": False})

# ------------------------------------------------------------------------------------------ load data
T = lambda n, **k: pd.read_csv(TABLES / f"{n}.csv", **k)
S = json.loads((TABLES / "summary_numbers.json").read_text())["summary"]
P = json.loads((DELIV / "dashboard_payload.json").read_text())
META, METHOD, SQ, AUC = P["meta"], P["method"], P["squad"], P["auction"]

sb = T("step4_scores_batters", dtype={"player_id": str}).sort_values("rank")
sw = T("step4_scores_bowlers", dtype={"player_id": str}).sort_values("rank")
sa = T("step4_scores_allrounders", dtype={"player_id": str}).sort_values("score", ascending=False)
short = T("step5_shortlist", dtype={"player_id": str})
plans = T("step5_plans", dtype={"player_id": str})
planb = T("step5_plan_b")
gaps = T("step5_gaps")
avoid = T("step5_not_to_chase", dtype={"player_id": str})
contr = T("step5_contrarian", dtype={"player_id": str})
unsung = T("step5_unsung", dtype={"player_id": str})
assum = T("step5_assumptions")
bt = T("step4_backtest_summary")
comp = T("step4_component_info")
sens = T("step4_sensitivity")
rob = T("step4_definition_robustness")
wpe = T("step1a_wp_eval", dtype={"innings": str})
shares = T("step1b_bucket_shares")
ex = T("step1c_example_balls")
offs = T("step2_season_offsets")
bcols = T("step0_ball_columns")
xmeta = T("step5_xi_meta")
TCC = T("step4_too_close_to_call") if (TABLES / "step4_too_close_to_call.csv").exists() else None
LB_AV = {r["id"]: r["avail"] for k in ("bat", "bowl") for r in P["leaderboard"][k]}   # availability string per player id
LB_RISK = {r["id"]: r["risk"] for k in ("bat", "bowl") for r in P["leaderboard"][k]}
LB_NAIVE = {k: {r["id"]: r["naive"] for r in P["leaderboard"][k]} for k in ("bat", "bowl")}

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
    """escape, then **bold** and `code` -> HTML"""
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
def scr(r, p=""):
    return f"{f1(r[p + 'score'] if p else r['score'])} ({rng(r['score_lo80'], r['score_hi80'])})"
def nn(x, fmt=f1, dash="\u2014"):
    return dash if x is None or (isinstance(x, float) and np.isnan(x)) else fmt(x)
def names(lst):
    return ", ".join(lst[:-1]) + " and " + lst[-1] if len(lst) > 1 else lst[0]

def overlaps(a, b):  # a, b = (lo, hi)
    return not (a[1] < b[0] or b[1] < a[0])

def sep_pairs(rows):
    """number of pairs whose 80% ranges do NOT overlap, and total pairs"""
    n, sep = len(rows), 0
    for i in range(n):
        for j in range(i + 1, n):
            sep += not overlaps(rows[i], rows[j])
    return sep, n * (n - 1) // 2

def short_avail(s):
    if not s:
        return "\u2014"
    tag = re.search(r"\[(?:ASSUMPTION )?(A\d+)\]", s)
    tag = f" [{tag.group(1)}]" if tag else ""
    if s.startswith("RR player"):
        return "RR squad" + tag
    if s.startswith("Likely retained"):
        return "Likely retained" + tag
    if s.startswith("In auction pool"):
        return "Pool: UNKNOWN" + tag
    return s

def nat_short(r):
    n = str(r["nationality"])
    if n.startswith("Overseas"):
        return f"Overseas ({r['nationality_evidence']}) [A7]"
    if n.startswith("Indian"):
        return "Indian [A7]"
    return "Nationality UNKNOWN [A7]"

def pb_short(s):
    return str(s).replace("[ASSUMPTION A6]", "[A6]")

def clean_risk(s):
    s = str(s)
    for junk in ("age UNKNOWN", "injury UNKNOWN"):
        s = s.replace(junk, "")
    s = re.sub(r"[;\s]+$", "", re.sub(r";\s*;", ";", s)).strip("; ")
    s = s.replace("sample size (wide interval)", "small sample, wide range").replace("short track record", "short record")
    return s if s else "\u2014"

def gap_short(s):
    if not isinstance(s, str) or not s:
        return None
    return "; ".join(g.replace("Batting under pressure: ", "Batting ").replace("Bowling under pressure: ", "Bowling ") for g in s.split("; "))

# ------------------------------------------------------------------------------------------ derived numbers (all from the files)
# D31/D32: the backtest table may carry *_exp counts, a random-pick base rate and a pre-registered claim. Read whatever is there.
bt = bt.rename(columns={"score_top10_assessable_exp": "score_top10_assessable", "naive_top10_assessable_exp": "naive_top10_assessable"})
HAS_BASE = "base_rate_random_pick" in bt.columns
HAS_CLAIM = "claim" in bt.columns
BTP = bt[bt.fold == "pooled"].set_index("role")
bat_p, bowl_p = BTP.loc["bat"], BTP.loc["bowl"]
if abs(bat_p.score_hit_rate_excl - S["backtest"]["bat_score"]) > 0.05 or abs(bowl_p.naive_hit_rate_excl - S["backtest"]["bowl_naive"]) > 0.05:
    print("WARNING: backtest table and summary_numbers.json disagree (is the pipeline mid-run?)")

def cnt(x):
    """count that may be an expected value (non-integer) after D31"""
    return f"{x:.0f}" if abs(x - round(x)) < 1e-9 else f"{x:.1f}"

def claim_text(r):
    """pre-registered wording; falls back to the PREREGISTRATION rule if the table has no claim column"""
    if HAS_CLAIM and isinstance(r.get("claim"), str) and r["claim"].strip():
        return r["claim"].strip()
    if r["hit_diff_lo80"] > 0:
        return "historical indicator; evidence of persistence"
    return "historical indicator; persistence not demonstrated"

def hit_line(r, role_lab):
    """one hit-rate statement with the naive rate, the 80% interval of the difference and the random-pick base rate"""
    base = f"; random pick {f1(r.base_rate_random_pick)}%" if HAS_BASE and pd.notna(r.base_rate_random_pick) else ""
    return (f"{role_lab}: score {f1(r.score_hit_rate_excl)}% v naive {f1(r.naive_hit_rate_excl)}%{base}; difference {sgn(r.score_hit_rate_excl - r.naive_hit_rate_excl)} points, "
            f"80% interval {rng(r.hit_diff_lo80, r.hit_diff_hi80)} ({'includes 0' if r.hit_diff_lo80 <= 0 <= r.hit_diff_hi80 else ('above 0' if r.hit_diff_lo80 > 0 else 'below 0')})")

CLAIM_BAT, CLAIM_BOWL = claim_text(bat_p), claim_text(bowl_p)
BEAT = bool(bat_p.hit_diff_lo80 > 0 or bowl_p.hit_diff_lo80 > 0)

eff = comp.set_index(["role", "component"])
W_NOM = {c: float(eff.loc[("bat", c), "weight"]) for c in "SIHC"}
W_EFF_R = {role: {c: float(eff.loc[(role, c), "effective_weight"]) for c in "SIHC"} for role in ("bat", "bowl")}
SAME_W = all(abs(W_EFF_R["bat"][c] - W_EFF_R["bowl"][c]) < 1e-6 for c in "SIHC")
CNAME = {"S": "skill under pressure", "I": "match impact", "H": "holds up", "C": "consistency"}
def frac(x):
    """effective weight for display (2 dp; the table value is exact to 3 dp)"""
    return f"{x:.2f}"
NUMW = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "eleven", 12: "twelve"}
def eff_phrase(role=None):
    """e.g. 'skill under pressure 2/3, consistency 1/3'; per role when batters and bowlers differ"""
    def one(w):
        return ", ".join(f"{CNAME[c]} {frac(w[c])}" for c in "SIHC" if w[c] > 0)
    if role or SAME_W:
        return one(W_EFF_R[role or "bat"])
    return f"batters: {one(W_EFF_R['bat'])}; bowlers: {one(W_EFF_R['bowl'])}"
NO_INFO = [c for c in "SIHC" if any(not bool(eff.loc[(r, c), "informative"]) for r in ("bat", "bowl"))]
NO_INFO_TXT = names([CNAME[c] + f" ({c})" for c in NO_INFO]) if NO_INFO else "none"

tier_order = ["Must-Back", "Value Pick", "Hidden Gem"]
short["tier"] = pd.Categorical(short.tier, tier_order, ordered=True)
short = short.sort_values(["tier", "score"], ascending=[True, False]).reset_index(drop=True)
must = short[short.tier == "Must-Back"]
mb_rng = [(r.score_lo80, r.score_hi80) for r in must.itertuples()]
mb_sep, mb_pairs = sep_pairs(mb_rng)

bowl_gaps = gaps[gaps.area.str.startswith("Bowling")]
rr_bowl_above_all = bool((bowl_gaps.gap_vs_league_per100 > 0).all())
top_gaps = list(S["top_gaps"])
PA = plans[plans.plan == "A"]; PB = plans[plans.plan == "B"]
purse = float(PA.purse_assumed_cr.iloc[0])
purse_used_A, purse_used_B = float(PA.mid.sum()), float(PB.mid.sum())
ovs_A = int(PA.overseas.fillna(False).astype(bool).sum()) if "overseas" in PA else 0
slots, ovs_slots = SQ["slots"], SQ["ovs_slots"]
seasons_scored = S["seasons_scored"]
high_min, high_max = shares.D27_High.min() * 100, shares.D27_High.max() * 100
brier_all = wpe[wpe.innings == "all"].set_index("season").brier
brier_1 = wpe[wpe.innings == "1"].brier; brier_2 = wpe[wpe.innings == "2"].brier
coin = float(wpe.coin_flip_brier.iloc[0])

HONESTY = (f"Historical pressure-performance indicator, not a forecast. Its ability to predict IPL 2027 is not established. Backtest, top 10 still above average next season: "
           f"{hit_line(bat_p, 'batters')} ({CLAIM_BAT}); {hit_line(bowl_p, 'bowlers')} ({CLAIM_BOWL}). "
           f"Prices, availability, ages and nationality are assumptions or UNKNOWN: nothing external was VERIFIED.")

HONESTY_SHORT = (f"Historical pressure-performance indicator, not a forecast: its ability to predict IPL 2027 is not established. Backtest, top 10 above average next season: "
                 f"batters {f1(bat_p.score_hit_rate_excl)}% v naive {f1(bat_p.naive_hit_rate_excl)}%"
                 + (f" v random pick {f1(bat_p.base_rate_random_pick)}%" if HAS_BASE else "") + f" (difference {rng(bat_p.hit_diff_lo80, bat_p.hit_diff_hi80)} pts, 80% interval); "
                 f"bowlers {f1(bowl_p.score_hit_rate_excl)}% v naive {f1(bowl_p.naive_hit_rate_excl)}%"
                 + (f" v random pick {f1(bowl_p.base_rate_random_pick)}%" if HAS_BASE else "") + f" ({rng(bowl_p.hit_diff_lo80, bowl_p.hit_diff_hi80)}). Verdicts: batters {CLAIM_BAT}; bowlers {CLAIM_BOWL}. "
                 "Prices, availability, ages and nationality are assumptions or UNKNOWN; nothing external was VERIFIED.")

EXEC = [
    f"We rated {S['scorable_bat']} batters, {S['scorable_bowl']} bowlers and {S['scorable_ar']} all-rounders on how they played when a ball could swing the match (IPL {seasons_scored}, {S['ipl_matches']} matches, {S['ipl_balls']:,} balls).",
    f"Must-Back if they reach the auction pool [ASSUMPTION A2]: {names(S['must_back'])}. "
    + ("Their 80% ranges all overlap, so their order is too close to call." if mb_sep == 0 else "Some of their 80% ranges are clear of the others."),
    f"RR's measured gaps are {names([g.split(': ')[1].lower() + '-overs batting' for g in top_gaps])} under pressure. "
    + ("RR bowling under pressure is above league in every phase." if rr_bowl_above_all else "RR bowling is not above league in every phase."),
    f"Plan A in an assumed Rs {purse:g} cr purse [ASSUMPTION A4]: {names(S['planA'])} (assumed cost Rs {purse_used_A:.1f} cr).",
    f"Honest test (next-season hit rate of the top 10): batters score {f1(bat_p.score_hit_rate_excl)}% v naive {f1(bat_p.naive_hit_rate_excl)}% ({CLAIM_BAT}); bowlers score {f1(bowl_p.score_hit_rate_excl)}% v naive {f1(bowl_p.naive_hit_rate_excl)}% ({CLAIM_BOWL}). Read the score as a record of past pressure play, not a promise.",
]

def squad_fit_text():
    """Direction of Plan A on RR's two measured batting gaps, computed from the payload (the payload's own text is not reused)."""
    out = []
    for g in top_gaps:
        ph = g.split(": ")[1]
        b, a, lg = SQ["before"][ph], SQ["planA"][ph], SQ["league"][ph]
        d_balls = a["bat_balls"] - b["bat_balls"]
        verb = "improves" if a["bat"] > b["bat"] else "does not improve"
        out.append(dict(phase=ph, before=b["bat"], after=a["bat"], league=lg["bat"], d_balls=d_balls, better=a["bat"] > b["bat"], verb=verb,
                        closes=a["bat"] >= lg["bat"]))
    return out
FIT = squad_fit_text()
OPEN_GAP = "".join(f" {f['phase']}-overs batting stays below the league level with Plan A." for f in FIT if not f["closes"])
AUCTION_DATE = next((f["value"] for f in METHOD["facts"] if f["id"] == "F1-002"), "date UNKNOWN")
FORMULA = ("Score = 100 \u00d7 \u03a6( \u03a3 w\u00b7z / sd ), with z = each component standardised among scorable players of the role. Planned weights: "
           + ", ".join(f"{CNAME[c].capitalize() if c == 'S' else CNAME[c].capitalize()} {W_NOM[c]:.2f}" for c in "SIHC") + ". Effective weights after components with no detectable player differences drop out: " + eff_phrase() + ".")

# the payload's own "Backtest:" limitation is replaced by a line built from the current backtest table (pre-registered wording, D31)
LIMITS = [x for x in METHOD["limitations"] if not x.lower().startswith("backtest") and "no detectable player differences" not in x]
LIMITS.append("Components with no detectable between-player differences at these sample sizes carry no weight: " + NO_INFO_TXT + " (D30).")
LIMITS.insert(6 if len(LIMITS) >= 6 else len(LIMITS), f"Backtest: batters {CLAIM_BAT}; bowlers {CLAIM_BOWL}. Intervals of the difference: batters {rng(bat_p.hit_diff_lo80, bat_p.hit_diff_hi80)}, bowlers {rng(bowl_p.hit_diff_lo80, bowl_p.hit_diff_hi80)} points.")

# ------------------------------------------------------------------------------------------ charts
def b64(path):
    return "data:image/png;base64," + base64.b64encode(Path(path).read_bytes()).decode()

TIER_STYLE = {"Must-Back": dict(color=PINK, hatch="", edge="white"),
              "Value Pick": dict(color=BLUE, hatch="///", edge="white"),
              "Hidden Gem": dict(color="#C9CED8", hatch="xx", edge=INK)}

def chart_shortlist(path, figsize, fs=9.5):
    d = short.iloc[::-1].reset_index(drop=True)   # first row on top
    fig, ax = plt.subplots(figsize=figsize, dpi=220)
    for i, r in d.iterrows():
        st = TIER_STYLE[r.tier]
        ax.barh(i, r.score, color=st["color"], hatch=st["hatch"], edgecolor=st["edge"], linewidth=0.0 if not st["hatch"] else 0.6, height=0.62, zorder=2)
        ax.errorbar(r.score, i, xerr=[[r.score - r.score_lo80], [r.score_hi80 - r.score]], fmt="none", ecolor=INK, elinewidth=1.4, capsize=3, zorder=3)
        ax.text(max(r.score_hi80, 100) + 1.5, i, f"{f1(r.score)} ({rng(r.score_lo80, r.score_hi80)})", va="center", fontsize=fs - 1, color=INK)
    ax.set_yticks(range(len(d)))
    ax.set_yticklabels([f"{r.player_name} \u00b7 {r.role.lower()}" for r in d.itertuples()], fontsize=fs)
    ax.set_xlim(0, 100); ax.set_xticks(range(0, 101, 20))
    ax.set_xlabel("Clutch Reliability Score, 0\u2013100 (bar) with 80% range (whisker)", fontsize=fs)
    ax.xaxis.grid(True, color="#E3E6EC", zorder=0); ax.set_axisbelow(True)
    ax.set_xmargin(0)
    ax.legend(handles=[Patch(facecolor=TIER_STYLE[t]["color"], hatch=TIER_STYLE[t]["hatch"], edgecolor=TIER_STYLE[t]["edge"] if t != "Hidden Gem" else INK, label=t) for t in tier_order],
              loc="lower center", bbox_to_anchor=(0.5, 1.0), ncol=3, frameon=False, fontsize=fs - 0.5, handlelength=1.6)
    # widen the canvas on the right for the text labels without moving the 0-100 axis
    ax.set_xlim(0, 100)
    ax.spines["bottom"].set_bounds(0, 100)
    fig.subplots_adjust(left=0.30, right=0.76, top=0.88, bottom=0.21 if figsize[1] < 3 else 0.17)
    fig.savefig(path); plt.close(fig)

def chart_backtest(path, figsize):
    fig, axes = plt.subplots(1, 2, figsize=figsize, dpi=220, sharey=True)
    panels = [("score_hit_rate_excl", "naive_hit_rate_excl", True, "Unassessable players left out"),
              ("score_hit_rate_as_miss", "naive_hit_rate_as_miss", False, "Unassessable players counted as misses")]
    for ax, (cs, cn, with_base, title) in zip(axes, panels):
        for k, role in enumerate(("bat", "bowl")):
            r = BTP.loc[role]
            bars = [(r[cs], PINK, "", "Clutch score top 10"), (r[cn], BLUE, "///", "Naive top 10 (strike rate / economy)")]
            if with_base and HAS_BASE and pd.notna(r.base_rate_random_pick):
                bars.append((r.base_rate_random_pick, "#C9CED8", "xx", "Random pick"))
            off = np.linspace(-0.27, 0.27, 3) if len(bars) == 3 else np.array([-0.2, 0.2])
            for (v, c, h, lab), o in zip(bars, off):
                ax.bar(k + o, v, 0.25 if len(bars) == 3 else 0.36, color=c, hatch=h, edgecolor=INK if c == "#C9CED8" else "white", linewidth=0.5 if c == "#C9CED8" else 0.0, zorder=2, label=lab if k == 0 else None)
                ax.text(k + o, v + 1.5, f"{f1(v)}%", ha="center", fontsize=8.5, fontweight="bold", color=INK)
        ax.set_xticks([0, 1]); ax.set_xticklabels(["Batters", "Bowlers"], fontsize=10)
        ax.set_ylim(0, 100); ax.set_yticks(range(0, 101, 20))
        ax.yaxis.grid(True, color="#E3E6EC", zorder=0); ax.set_axisbelow(True)
        ax.set_title(title, fontsize=9, color=INK, pad=6)
    axes[0].set_ylabel("Top 10 above average next season (%)", fontsize=9.5)
    h, l = axes[0].get_legend_handles_labels()
    fig.legend(h, l, loc="lower center", ncol=3, frameon=False, fontsize=8.5)
    fig.subplots_adjust(left=0.10, right=0.99, top=0.90, bottom=0.20, wspace=0.08)
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
CH["short_deck"] = TMP / "short_deck.png"; chart_shortlist(CH["short_deck"], (6.9, 4.1))
CH["short_cs"] = TMP / "short_cs.png"; chart_shortlist(CH["short_cs"], (7.4, 2.3), fs=8.0)
CH["backtest"] = TMP / "backtest.png"; chart_backtest(CH["backtest"], (6.6, 3.6))
CH["pressure"] = TMP / "pressure.png"; chart_pressure(CH["pressure"], (6.6, 4.1))

# ------------------------------------------------------------------------------------------ shared HTML pieces
def table(headers, rows, cls="tbl", aligns=None, raw=False):
    aligns = aligns or ["l"] * len(headers)
    h = "".join(f"<th class='{a}'>{inline(x)}</th>" for x, a in zip(headers, aligns))
    body = ""
    for r in rows:
        body += "<tr>" + "".join(f"<td class='{a}'>{x if raw else inline(x)}</td>" for x, a in zip(r, aligns)) + "</tr>"
    return f"<table class='{cls}'><thead><tr>{h}</tr></thead><tbody>{body}</tbody></table>"

PLACEHOLDER = "Dashboard URL and QR code: pending, to be added when the public link exists"
def placeholder_box(compact=False):
    return (f"<div class='ph{' ph-c' if compact else ''}'><div class='ph-sq'>QR<br>pending</div>"
            f"<div><b>{esc(PLACEHOLDER)}</b><br><span>No link has been invented and no QR code was generated.</span></div></div>")

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
.tag{{display:inline-block;padding:1px 7px;border-radius:9px;font-size:.82em;font-weight:700;white-space:nowrap}}
.t-mb{{background:var(--pink);color:#fff}} .t-vp{{background:var(--blue);color:#fff}} .t-hg{{background:#C9CED8;color:var(--ink)}}
.ph{{display:flex;gap:12px;align-items:center;border:2px dashed var(--muted);border-radius:8px;padding:10px 14px;background:#FFFBEA}}
.ph-sq{{flex:none;width:62px;height:62px;border:2px dashed var(--muted);display:flex;align-items:center;justify-content:center;text-align:center;font-size:11px;font-weight:700;color:var(--muted);background:#fff}}
.ph span{{color:var(--muted);font-size:.9em}}
"""

# ------------------------------------------------------------------------------------------ B: the deck
def slide(n, kicker, headline, body, sowhat, total=7):
    return f"""<section class="slide"><div class="bar"></div>
<header><div class="kick">{n} / {total} &middot; {esc(kicker)}</div><h1>{inline(headline)}</h1></header>
<main>{body}</main>
<div class="sowhat"><b>So what for RR:</b> {inline(sowhat)}</div>
<footer><span>RR Clutch Index &middot; SupeRR Selector Season 2 &middot; data to {esc(META['last_match'])} &middot; build {esc(META['build'])}</span><span>Historical indicator, not a forecast (D15)</span></footer></section>"""

DECK_CSS = BASE_CSS + """
@page{size:1280px 720px;margin:0}
.slide{width:1280px;height:720px;position:relative;overflow:hidden;page-break-after:always;break-after:page;padding:30px 44px 0 44px;background:#fff}
.slide:last-child{page-break-after:auto;break-after:auto}
.bar{position:absolute;left:0;top:0;width:100%;height:8px;background:linear-gradient(90deg,var(--pink) 0 70%,var(--blue) 70% 100%)}
.kick{color:var(--pink);font-weight:700;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin-top:6px}
h1{font-size:27px;line-height:1.18;margin:4px 0 12px 0;font-weight:800;max-width:1190px}
main{height:508px;position:relative;font-size:14px;line-height:1.35}
.sowhat{position:absolute;left:44px;right:44px;bottom:42px;background:var(--pinkt);border-left:6px solid var(--pink);padding:8px 14px;font-size:14px;line-height:1.3;border-radius:0 6px 6px 0}
footer{position:absolute;left:44px;right:44px;bottom:12px;display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted)}
.cols{display:flex;gap:26px}.col{flex:1;min-width:0}
h2{font-size:14.5px;font-weight:800;margin:0 0 6px 0;color:var(--ink)}
.small{font-size:11.5px;color:var(--muted);line-height:1.3}
ol.ex{padding-left:24px;font-size:17px;line-height:1.35}ol.ex li{margin-bottom:12px}
.card{border:1.5px solid var(--line);border-radius:8px;padding:12px 14px;margin-bottom:12px;background:#fff}
.card.mb{border-left:6px solid var(--pink)}
.card .nm{font-size:18px;font-weight:800}.card .sc{font-size:14.5px;color:var(--ink)}.card .small{font-size:12.5px}
.step{display:flex;gap:10px;align-items:flex-start;margin-bottom:7px}
.step .num{flex:none;width:24px;height:24px;border-radius:50%;background:var(--ink);color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;margin-top:1px}
.step div{font-size:13px;line-height:1.3}
.formula{background:var(--tint);border-radius:6px;padding:7px 10px;font-size:12.5px;line-height:1.35;margin-bottom:8px}
.tbl{font-size:12.5px}.tbl td,.tbl th{padding:3px 6px}
.dense{font-size:12.5px}.dense td,.dense th{padding:2.5px 5px}
img.chart{display:block;width:100%;height:auto}
.neg{color:#B00020;font-weight:700}.pos{color:#0B6B3A;font-weight:700}
ul.lim{padding-left:17px;font-size:12px;line-height:1.28}ul.lim li{margin-bottom:3.5px}
.ph{padding:7px 12px}
"""

def deck_html():
    sl = []
    # ---- 1 executive summary
    cards = ""
    for r in must.itertuples():
        cards += (f"<div class='card mb'><div class='nm'>{esc(r.player_name)} <span class='tag t-mb'>Must-Back</span></div>"
                  f"<div class='sc'>{esc(r.sub_role)} &middot; score <b>{f1(r.score)}</b> (80% range {rng(r.score_lo80, r.score_hi80)})</div>"
                  f"<div class='small'>Price band {esc(r.price_band)} &middot; {esc(nat_short(r._asdict()))}<br>Availability: pool membership UNKNOWN [A2]</div></div>")
    body = (f"<div class='cols'><div class='col' style='flex:1.25'><h2>Five lines for selectors</h2><ol class='ex'>"
            + "".join(f"<li>{inline(l)}</li>" for l in EXEC) + "</ol></div>"
            f"<div class='col' style='flex:1'><h2>Back these three first</h2>{cards}"
            f"<div class='small'>The three ranges overlap in every pair: {'too close to call' if mb_sep == 0 else 'see slide 5'}. Wide range = less sure.</div></div></div>")
    sl.append(slide(1, "Executive summary",
                    f"RR Clutch Index: back {names(list(must.player_name))} first, and treat the score as a record, not a forecast.", body,
                    f"Pursue these three only if they reach the auction pool; every price and availability here is an assumption to recheck before the auction ({AUCTION_DATE}, REPORTED only, F1-002)."))
    # ---- 2 method
    steps = "".join(f"<div class='step'><div class='num'>{i + 1}</div><div>{inline(s)}</div></div>" for i, s in enumerate(METHOD["flow"]))
    meaning = {"S": "Skill under pressure: runs above (batters) or saved (bowlers) versus an average player in the same spot",
               "I": "Match impact: win probability added by the player",
               "H": "Holds up: High-pressure form minus Low-pressure form",
               "C": "Consistency: share of seasons above expected"}
    if SAME_W:
        wrows = [[f"**{c}** {meaning[c]}", f"{W_NOM[c]:.2f}", f"**{frac(W_EFF_R['bat'][c]) if W_EFF_R['bat'][c] else '0'}**"] for c in "SIHC"]
        whead, wal = ["Component", "Planned weight", "Effective weight"], ["l", "r", "r"]
    else:
        wrows = [[f"**{c}** {meaning[c]}", f"{W_NOM[c]:.2f}", *[f"**{frac(W_EFF_R[r][c]) if W_EFF_R[r][c] else '0'}**" for r in ("bat", "bowl")]] for c in "SIHC"]
        whead, wal = ["Component", "Planned weight", "Effective, batters", "Effective, bowlers"], ["l", "r", "r", "r"]
    inf_txt = NO_INFO_TXT
    body = (f"<div class='cols'><div class='col' style='flex:1.05'><h2>Six steps, in plain words</h2>{steps}"
            f"<h2 style='margin-top:10px'>Why not a simple average?</h2><ul class='lim' style='font-size:12.5px'>"
            + "".join(f"<li>{inline(x)}</li>" for x in METHOD["why_not_average"]) + "</ul></div>"
            f"<div class='col' style='flex:1'><h2>The score</h2><div class='formula'>{inline(FORMULA)}</div>"
            + table(whead, wrows, "tbl", wal)
            + f"<p class='small' style='margin-top:6px'>Effective weights are the weights actually at work. Components with no detectable difference between players at these sample sizes carry no information (D30): {esc(inf_txt)}. {'Batters and bowlers get the same weights. ' if SAME_W else ''}Pre-registration frozen before any ranking: sha256 {esc(PARAM['sha'][:12])}&hellip; (D29).</p>"
            f"<p class='small' style='margin-top:6px'>Sample rules: batters need {PARAM['min_bat']}+ High-pressure balls faced, bowlers {PARAM['min_bowl']}+ legal balls bowled. Others are shown as Not Scorable ({S['not_scorable']} of {S['in_scope']} players in scope).</p></div></div>")
    sl.append(slide(2, "Method",
                    f"Six steps turn {S['ipl_balls']:,} balls into one score per player, then test it honestly.", body,
                    f"What actually drives the ranking is the effective weights ({eff_phrase()}); the planned weights were fixed before any ranking existed, so they cannot be tuned to flatter a player."))
    # ---- 3 pressure index
    seas_rows = []
    for r in shares.itertuples():
        s = str(r.season)
        seas_rows.append([s, f"{r.D27_High * 100:.1f}%", f3(brier_all[int(s)]),
                          f3(wpe[(wpe.season == int(s)) & (wpe.innings == '1')].brier.iloc[0]), f3(wpe[(wpe.season == int(s)) & (wpe.innings == '2')].brier.iloc[0])])
    hi_ex = ex[ex.bucket == "High"].iloc[-1]
    body = (f"<div class='cols'><div class='col' style='flex:0.92'><h2>What it measures</h2><ul class='lim' style='font-size:13px'>"
            + "".join(f"<li>{inline(x)}</li>" for x in P["pressure"]["explain"]) + "</ul>"
            f"<div class='formula' style='margin-top:6px'>{inline(P['pressure']['formula'])}</div>"
            f"<h2 style='margin-top:6px'>Share of High-pressure balls, and how good the win-probability model is</h2>"
            + table(["Season", "High-pressure share", "Brier, all", "1st innings", "2nd innings"], seas_rows, "tbl dense", ["l", "r", "r", "r", "r"])
            + f"<p class='small' style='margin-top:4px'>Brier score: lower is better; a coin flip scores {coin:.2f}. Second-innings models ({f3(brier_2.min())}\u2013{f3(brier_2.max())}) beat a coin flip clearly; first-innings models ({f3(brier_1.min())}\u2013{f3(brier_1.max())}) barely do. The 2023 model learned from one season only. Each ball is judged only with information from before its match.</p></div>"
            f"<div class='col' style='flex:1.08'><h2>Eight real balls, from Low to High</h2><img class='chart' src='{b64(CH['pressure'])}'>"
            f"<p class='small'>Example: {esc(hi_ex.batter)} v {esc(hi_ex.bowler)}, {esc(hi_ex.match)}: {esc(hi_ex.situation_before_ball)}. Win probability {hi_ex.win_prob_batting_side_before * 100:.1f}% for the batting side; Pressure Index {hi_ex.pressure_index:.1f}.</p></div></div>")
    sl.append(slide(3, "Pressure Index",
                    f"A ball is High pressure when it can swing the match: {f0(high_min)}\u2013{f0(high_max)}% of balls each season.", body,
                    f"RR should judge players on the {PARAM['high_cut']}+ balls, where a single over moves the result, and read first-innings pressure labels with more caution than chase labels."))
    # ---- 4 leaderboard
    def lb(df, role, n=10):
        rows = []
        for r in df.head(n).itertuples():
            nv = LB_NAIVE[role].get(r.player_id)
            nvs = "\u2014" if nv is None else (f1(nv) if role == "bat" else f2(nv))
            rows.append([str(int(r.rank)), esc(r.player_name), f"<b>{f1(r.score)}</b> ({rng(r.score_lo80, r.score_hi80)})", f0(r.hi_qual_n), nvs, esc(short_avail(LB_AV.get(r.player_id, "")))])
        return rows
    bsep = sep_pairs([(r.score_lo80, r.score_hi80) for r in sb.head(10).itertuples()]); wsep = sep_pairs([(r.score_lo80, r.score_hi80) for r in sw.head(10).itertuples()])
    if TCC is not None:   # cross-check against the pipeline's own table
        tc = TCC.set_index("role")
        assert (int(tc.loc["bat", "pairs_separated_by_80pct_ranges"]), int(tc.loc["bat", "top10_pairs"])) == bsep and (int(tc.loc["bowl", "pairs_separated_by_80pct_ranges"]), int(tc.loc["bowl", "top10_pairs"])) == wsep, "too-close-to-call table differs from my count"
    ar_txt = "; ".join(f"{esc(r.player_name)} {f1(r.score)} ({rng(r.score_lo80, r.score_hi80)})" for r in sa.head(3).itertuples())
    hdr_b = ["#", "Batter", "Score (80% range)", "High balls", "SR*", "Availability"]; hdr_w = ["#", "Bowler", "Score (80% range)", "High balls", "Econ*", "Availability"]
    al = ["r", "l", "r", "r", "r", "l"]
    body = (f"<div class='cols'><div class='col'><h2>Top 10 batters (of {S['scorable_bat']})</h2>{table(hdr_b, lb(sb, 'bat'), 'tbl dense', al, raw=True)}</div>"
            f"<div class='col'><h2>Top 10 bowlers (of {S['scorable_bowl']})</h2>{table(hdr_w, lb(sw, 'bowl'), 'tbl dense', al, raw=True)}</div></div>"
            f"<p class='small' style='margin-top:8px'>All-rounders (top 3 of {S['scorable_ar']}): {ar_txt}.<br>"
            f"Top-10 pairs with clearly separate 80% ranges: batters {bsep[0]} of {bsep[1]}; bowlers {wsep[0]} of {wsep[1]}. Every other pair is too close to call.<br>"
            f"* Strike rate (batters) or economy (bowlers) over High- and Low-pressure balls, shown for comparison. Availability tags: A1 RR squad (RR decides retention), A2 pool membership UNKNOWN, A3 likely retained = assumption (each team's six most-involved players).</p>")
    sl.append(slide(4, "Leaderboard",
                    f"{sb.iloc[0].player_name} and {sw.iloc[0].player_name} lead their lists, but {'no two of the top 10 are clearly apart' if bsep[0] + wsep[0] == 0 else 'most ranges are wide and overlap'}.", body,
                    "Use the board to build a long list, not a strict order: " + ("no top-10 pair has separate ranges, so every order within the top 10 is too close to call" if bsep[0] + wsep[0] == 0 else "only pairs with separate ranges are really ranked") + ", and several of the top names are RR already or likely to be retained."))
    # ---- 5 shortlist
    rows = []
    for r in short.itertuples():
        t = {"Must-Back": "t-mb", "Value Pick": "t-vp", "Hidden Gem": "t-hg"}[r.tier]
        g = gap_short(r.fills_gaps)
        rows.append([f"<b>{esc(r.player_name)}</b> <span class='small'>{esc(r.sub_role)}, {esc(nat_short(r._asdict()).replace(' [A7]', ''))}</span>",
                     f"<span style='white-space:nowrap'>{esc(pb_short(r.price_band))}</span>", esc(clean_risk(r.risk_tags)), esc(g) if g else "<span class='small'>No measured gap</span>"])
    body = (f"<div class='cols'><div class='col' style='flex:0.98'><img class='chart' src='{b64(CH['short_deck'])}'>"
            f"<p class='small' style='margin-top:2px'>Tiers: Must-Back = lower end of range at or above 50, best gap fit. Value Pick = score 60+ at a Regular or Emerging price. Hidden Gem = score 60+, smallest samples. All of them: age and injury UNKNOWN [A8]; pool membership UNKNOWN [A2]; nationality inferred [A7]; walk-away price = top of the price band [A6].</p></div>"
            f"<div class='col' style='flex:1.1'>{table(['Player', 'Price band', 'Main risk', 'Gap it fills'], rows, 'tbl dense', ['l', 'l', 'l', 'l'], raw=True)}</div></div>")
    sl.append(slide(5, "Shortlist",
                    f"{NUMW[len(short)].capitalize()} names to chase, in three tiers; {names(list(must.player_name))} come first.", body,
                    (lambda t: f"{t.player_name} has the tightest range of the three ({rng(t.score_lo80, t.score_hi80)}), so he is the safest pay-up case; the others have wider ranges, so hold to the walk-away prices.")(must.assign(w=must.score_hi80 - must.score_lo80).sort_values("w").iloc[0])))
    # ---- 6 squad fit
    def trow(label, key):
        b, a, pb_, lg = SQ["before"], SQ["planA"], SQ["planB"], SQ["league"]
        out = []
        for ph in ["Powerplay", "Middle", "Death"]:
            out.append([f"{label} {ph.lower()}", neg(b[ph][key]), neg(a[ph][key]), neg(pb_[ph][key]), neg(lg[ph][key]), f"{b[ph][key + '_balls']} \u2192 {a[ph][key + '_balls']}"])
        return out
    fit_rows = trow("Batting", "bat") + trow("Bowling", "bowl")
    for r in fit_rows:   # highlight the two measured batting gaps
        r[0] = f"<b>{r[0]}</b>" if any(r[0].lower().endswith(g.split(': ')[1].lower()) and r[0].startswith("Batting") for g in top_gaps) else r[0]
    mid_fit = [f for f in FIT]
    fit_sentences = " ".join(
        f"{f['phase']}-overs batting {f['verb']}: {neg(f['before'])} \u2192 {neg(f['after'])} per 100 (league {neg(f['league'])}), with {f['d_balls']} added High-pressure balls."
        for f in mid_fit)
    pa_names = names(list(PA.player_name)); pb_names = names(list(PB.player_name))
    pbr = planb.iloc[0]
    body = (f"<div class='cols'><div class='col' style='flex:1.25'><h2>RR under pressure: runs above (batting) or saved (bowling) per 100 High-pressure balls, 2025\u201326</h2>"
            + table(["Phase", "RR now", "With Plan A", "With Plan B", "League", "RR balls: now \u2192 Plan A"], fit_rows, "tbl dense", ["l", "r", "r", "r", "r", "r"], raw=True)
            + f"<p class='small' style='margin-top:4px'>RR now = RR's IPL 2026 group [A1]. Plan A or B = that group plus the picks. League = all players. Higher is better. {esc(fit_sentences)}</p></div>"
            f"<div class='col' style='flex:1'><h2>The two budget plans (assumed Rs {purse:g} cr [A4], {slots} slots, up to {ovs_slots} overseas [A5])</h2>"
            f"<div class='card' style='border-left:6px solid var(--pink)'><b>Plan A</b> (assumed cost Rs {purse_used_A:.1f} cr): {esc(pa_names)}.</div>"
            f"<div class='card' style='border-left:6px solid var(--blue)'><b>Plan B</b> (assumed cost Rs {purse_used_B:.1f} cr): {esc(pb_names)}.<br><span class='small'>Switch rule: if {esc(pbr.if_player)} goes past Rs {pbr.goes_past_cr:g} cr, take {esc(pbr.switch_to)}; RR loses {esc(str(pbr.rr_loses))}.</span></div>"
            f"<p class='small'>Prices are rule-based bands, not market data [A6]. The \"gap it fills\" tag comes from a player's batting role, not from his own record in that phase, so it is not proof he fixes the gap. Sample XI and bowling plan: dashboard (placeholder below).</p>"
            f"{placeholder_box(True)}</div></div>")
    worse = [f for f in FIT if not f["better"]]
    sw_text = (f"Plan A lifts death-overs batting but does not fix middle-overs batting on the numbers above, so the middle-overs gap is still open."
               if worse and any(f["better"] for f in FIT) else (("Plan A improves both measured batting gaps" + ("" if all(f["closes"] for f in FIT) else ", but not all the way to the league level") + ", on only a few added High-pressure balls, so treat it as a direction, not proof.") if not worse else "Plan A improves neither measured batting gap."))
    sl.append(slide(6, "Squad fit",
                    ("Squad fit: RR's measured weakness is middle-overs batting under pressure, and Plan A does not clearly fix it." if any(not f["better"] and f["phase"] == "Middle" for f in FIT)
                     else "Squad fit: Plan A lifts both of RR's measured batting gaps, but only on small added samples."),
                    body, sw_text + (" Treat bowling as a strength to protect, not the place to spend." if rr_bowl_above_all else "")))
    # ---- 7 risks and limits
    lim = "".join(f"<li>{inline(x)}</li>" for x in LIMITS)
    nfacts = pd.Series([f["status"] for f in METHOD["facts"]]).value_counts()
    ver = int(sum(v for k, v in nfacts.items() if k.startswith("VERIFIED")))
    body = (f"<div class='cols'><div class='col' style='flex:0.95'><h2>Backtest: did the top 10 stay above average next season?</h2><img class='chart' src='{b64(CH['backtest'])}'>"
            f"<p class='small'>Pooled 2024\u201326 folds. {esc(hit_line(bat_p, 'Batters'))} ({esc(CLAIM_BAT)}). {esc(hit_line(bowl_p, 'Bowlers'))} ({esc(CLAIM_BOWL)}). Only {cnt(bat_p.score_top10_assessable)} batter and {cnt(bowl_p.score_top10_assessable)} bowler player-seasons in the score's top 10 could be assessed (expected counts under random tie-breaks, D31), so every rate is noisy.</p></div>"
            f"<div class='col' style='flex:1.05'><h2>Limits, in plain words</h2><ul class='lim'>{lim}</ul>"
            f"<p class='small'>External facts: {ver} VERIFIED of {len(METHOD['facts'])} ({'; '.join(f'{v} {k}' for k, v in nfacts.items())}). Full detail: Methodology and Limitations note.</p>{placeholder_box(True)}</div></div>")
    sl.append(slide(7, "Risks and limits",
                    "The score describes the past: " + ("it did not clearly beat a naive ranking at predicting next season." if not BEAT else "it beat a naive ranking in the backtest, but the samples are tiny."), body,
                    "Use the score to shortlist and to question prices, never as a forecast" + ("; for bowlers, check overall economy next to the score before bidding." if bowl_p.spearman_naive_outcome > bowl_p.spearman_score_outcome else ".")))
    return f"<!doctype html><html><head><meta charset='utf-8'><title>RR Clutch Index deck</title><style>{DECK_CSS}</style></head><body>{''.join(sl)}</body></html>"

# ------------------------------------------------------------------------------------------ C: the cheat sheet
CS_CSS = BASE_CSS + """
@page{size:A4;margin:0}
.page{width:794px;height:1123px;padding:26px 30px 18px 30px;position:relative;overflow:hidden;font-size:10.4px;line-height:1.3}
.top{border-bottom:3px solid var(--pink);padding-bottom:6px;margin-bottom:7px}
.top .k{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--pink);font-weight:700}
.top h1{font-size:17px;line-height:1.15;margin-top:2px}
.honest{background:#FFF4D6;border:1.5px solid #E0B100;border-radius:6px;padding:5px 8px;font-size:9.6px;line-height:1.28;margin-bottom:5px}
h2{font-size:11.5px;font-weight:800;margin:7px 0 3px 0}
.tbl{font-size:9.2px}.tbl td,.tbl th{padding:1.8px 4px}
img.chart{display:block;width:100%;height:auto;margin-top:2px}
.sw{background:var(--pinkt);border-left:5px solid var(--pink);padding:4px 8px;margin:4px 0;font-size:10px;border-radius:0 5px 5px 0}
.two{display:flex;gap:12px}.two>div{flex:1;min-width:0}
.foot{margin-top:5px;font-size:8.3px;color:var(--muted);line-height:1.25}
.small{font-size:9px;color:var(--muted);line-height:1.28}
"""

def cheat_html():
    rows = []
    for r in short.itertuples():
        t = {"Must-Back": "t-mb", "Value Pick": "t-vp", "Hidden Gem": "t-hg"}[r.tier]
        g = gap_short(r.fills_gaps)
        rows.append([f"<span class='tag {t}'>{r.tier}</span>", f"<b>{esc(r.player_name)}</b><br><span class='small'>{esc(r.sub_role)}{', ' + esc(nat_short(r._asdict()).replace(' [A7]', '')) if str(r.nationality).startswith('Overseas') else ''}</span>",
                     f"<b>{f1(r.score)}</b><br><span class='small'>{rng(r.score_lo80, r.score_hi80)}</span>", f"{esc(pb_short(r.price_band))}",
                     esc(clean_risk(r.risk_tags)), esc(g) if g else "<span class='small'>None measured</span>"])
    pbr = planb.iloc[0]
    av = avoid
    av_txt = "; ".join(f"{esc(r.player_name)} {f1(r.score)} ({rng(r.score_lo80, r.score_hi80)})" for r in av.itertuples())
    ct_txt = "; ".join(f"{esc(r.player_name)} {f1(r.score)} ({rng(r.score_lo80, r.score_hi80)})" for r in contr.itertuples())
    bowl_note = "RR bowling is above league in all three High-pressure phases, so bowlers fill no measured gap; they add quality and depth." if rr_bowl_above_all else ""
    fit_note = " ".join(f"{f['phase']} batting: RR {neg(f['before'])} \u2192 {neg(f['after'])} with Plan A (league {neg(f['league'])})." for f in FIT)
    return f"""<!doctype html><html><head><meta charset='utf-8'><title>RR Clutch Index cheat sheet</title><style>{CS_CSS}</style></head><body><div class="page">
<div class="top"><div class="k">RR Clutch Index &middot; IPL 2027 auction cheat sheet &middot; data to {esc(META['last_match'])}</div>
<h1>Back {esc(names(list(must.player_name)))} first; chase the other {NUMW[len(short) - len(must)]} only at or below walk-away price.</h1></div>
<div class="honest"><b>Honesty line.</b> {esc(HONESTY_SHORT)}</div>
<h2>Top picks by tier (score 0&ndash;100 within role, with 80% range; ranges that overlap are too close to call)</h2>
{table(['Tier', 'Player', 'Score, 80% range', 'Price band', 'Risk', 'Gap it fills'], rows, 'tbl', ['l', 'l', 'r', 'l', 'l', 'l'], raw=True)}
<p class='small' style='margin-top:3px'>All {NUMW[len(short)]}: age and injury UNKNOWN [A8]; whether they reach the auction pool is UNKNOWN [A2]. Pursue only if they are on the official list. {esc(bowl_note)}</p>
<h2>One chart: the shortlist with its uncertainty</h2>
<img class="chart" src="{b64(CH['short_cs'])}">
<div class="sw"><b>So what for RR:</b> the ranges are wide{" and the Must-Back ranges overlap" if mb_sep == 0 else ""}, so use the score to build a shortlist and set walk-away prices, not to rank them to the decimal.</div>
<div class="two"><div><h2>Budget plans (assumed Rs {purse:g} cr [A4], {slots} slots)</h2>
<p><b>Plan A</b> (assumed Rs {purse_used_A:.1f} cr): {esc(names(list(PA.player_name)))}.<br><b>Plan B</b> (assumed Rs {purse_used_B:.1f} cr): {esc(names(list(PB.player_name)))}.<br>
<span class='small'>Switch rule: if {esc(pbr.if_player)} goes past Rs {pbr.goes_past_cr:g} cr, take {esc(pbr.switch_to)}; RR loses {esc(str(pbr.rr_loses))}. {esc(fit_note)}{esc(OPEN_GAP)}</span></p></div>
<div><h2>Do not chase</h2><p class='small' style='color:var(--ink)'><b>Lowest scores in the assumed pool [A2, A3]:</b> {av_txt}.<br><b>Popular but low score:</b> {ct_txt}.</p></div></div>
{placeholder_box(True)}
<div class="foot"><b>How to read it.</b> Score = how well a player did on balls that could swing the match (Pressure Index {PARAM['high_cut']}+), IPL {esc(seasons_scored)}, against an average player in the same spot, pulled toward average for small samples. Effective weights: {esc(eff_phrase())}. 80% range = where we are 80% sure the true value sits. Price bands are rule-based assumptions [A6], not market data; walk-away = top of band. Purse, slots and overseas limit are assumptions [A4, A5]. Nationality (shown for overseas players only) is inferred from the data [A7]. None of the external facts could be VERIFIED (network blocked): recheck before the auction. Source: outputs/tables/*.csv; build {esc(META['build'])}.</div>
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
    d.p(f"Submission to Rajasthan Royals' SupeRR Selector Season 2. Data: {S['ipl_matches']} IPL matches, {S['ipl_balls']:,} balls, to {META['last_match']} (build {META['build']}, seed {SEED}). Raw data sha256 {META['data_sha256']}.")
    d.note("**Read this first.** " + HONESTY)
    d.h2("1. What the score is, in one paragraph")
    d.p(f"The Clutch Reliability Score (0 to 100, roughly a percentile within a role) measures how well a player performed on the balls that could swing a match, IPL {seasons_scored}. "
        f"It is a **historical pressure-performance indicator**. Its ability to predict IPL 2027 performance is **not established** (D15). We rated {S['scorable_bat']} batters, {S['scorable_bowl']} bowlers and {S['scorable_ar']} all-rounders. "
        f"{S['not_scorable']} of the {S['in_scope']} players in scope had too little High-pressure data and are listed separately as Not Scorable on IPL data. IPL {S['training_only']} is used only for training the win-probability model (D10).")
    d.h2("2. The six steps, in plain words")
    d.ol([x for x in METHOD["flow"]])
    d.p(f"Samples: a batter needs at least {PARAM['min_bat']} High-pressure balls faced, a bowler at least {PARAM['min_bowl']} legal balls bowled in High pressure; an all-rounder needs both. "
        f"High pressure means a Pressure Index of {PARAM['high_cut']} or more; Medium is {PARAM['med_cut']} to {PARAM['high_cut']}; Low is below {PARAM['med_cut']}.")
    d.h2("3. The formula and the weights")
    d.p(FORMULA)
    d.p(f"Each component is shrunk toward the role average (Empirical Bayes using each player's own sampling variance and a Kish effective sample size, D31; shrinkage strength floored at {PARAM['k_floor']} balls; consistency uses a prior strength of {PARAM['prior_seasons']} seasons). Recent seasons count more: {PARAM['recency']} (decay {PARAM['decay']} a season). "
        f"Intervals: {PARAM['boots']} bootstrap draws over the player's matches, seed {SEED}; the 80% range is the 10th to 90th percentile. All-rounders: 0.5 x batting score + 0.5 x bowling score.")
    meaning = {"S": "Skill under pressure (runs above expected for batters, runs saved vs expected for bowlers, per ball in High pressure)",
               "I": "Match impact (win probability added per ball in High pressure)",
               "H": "Holds up (Low-pressure form minus High-pressure form, sign set so that dropping off is penalised)",
               "C": "Consistency (share of seasons with enough High balls where the player was above expected)"}
    wr = []
    for r in comp.itertuples():
        inf = bool(r.informative)
        wr.append([{"bat": "Batters", "bowl": "Bowlers"}[r.role], f"**{r.component}**: {meaning[r.component]}", f"{r.weight:.2f}",
                   "yes" if inf else "no: no detectable difference between players (weight moved to the other components)", f"{r.prior_mean:.4f}", f"{r.prior_k:.4g}" if inf else "n/a (no between-player spread)", f"**{r.effective_weight:.3f}**"])
    d.table(["Role", "Component", "Planned weight", "Informative?", "Prior mean", "Prior spread (S, I, H: between-player variance; C: prior strength in seasons)", "Effective weight"], wr, ["l", "l", "r", "l", "r", "r", "r"])
    d.p(f"**What this means.** Components with no detectable between-player differences at these sample sizes: {NO_INFO_TXT} (D30). With nothing to separate players, every player is shrunk to the mean and the component's z-score is set to 0. "
        f"The effective weights are therefore {eff_phrase()}. The planned weights were frozen before any player number existed (pre-registration sha256 {PARAM['sha']}, D29) and were never tuned on the backtest (D6, D16).")
    d.h2("4. Why not a simple average?")
    d.ul(METHOD["why_not_average"])
    d.h2("5. Win-probability model and Pressure Index quality")
    d.p("One simple logistic model per season, trained only on earlier seasons and scored out of sample (D4, D13, D26). Brier score: lower is better. A coin flip scores "
        f"{coin:.2f}. Calibration by probability bin is in `outputs/tables/step1a_calibration.csv`.")
    wr = [[r.season, {"all": "All", "1": "1st", "2": "2nd"}[r.innings], r.train_seasons, int(r.train_matches), int(r.test_matches), f"{r.brier:.3f}", rng(r.brier_lo80, r.brier_hi80, 3), f"{r.log_loss:.3f}"] for r in wpe.itertuples()]
    d.table(["Season", "Innings", "Trained on", "Train matches", "Test matches", "Brier", "Brier 80% range", "Log loss"], wr, ["l", "l", "l", "r", "r", "r", "r", "r"])
    d.p(f"Second-innings models beat a coin flip clearly; first-innings models have little skill beyond the base rate (Brier {f3(brier_1.min())} to {f3(brier_1.max())}). The 2023 model learned from one season only. "
        "A gradient-boosting model was tried and was worse in every fold, so it was not adopted (D19).")
    sr_ = [[str(int(r.season)), f"{r.D27_High * 100:.1f}%", f"{r.D27_Medium * 100:.1f}%", f"{r.D27_Low * 100:.1f}%", f"{r.D18strict_High * 100:.1f}%", f"{int(r.balls):,}"] for r in shares.itertuples()]
    d.table(["Season", "High (main, D27)", "Medium", "Low", "High (strict D18, comparison)", "Balls"], sr_, ["l", "r", "r", "r", "r", "r"])
    d.h2("6. Backtest: did the score predict next season?")
    d.p(f"Folds 2024, 2025, 2026. For fold N the score is rebuilt from seasons 2023 to N-1 only. The outcome is High-pressure runs above expected (batters) or runs saved (bowlers) per ball in season N, needing at least {PARAM['bt_min_outcome']} High balls; \"above average\" is relative to all players that season. "
        f"Entry needs at least {PARAM['bt_min_bat']} High balls faced or {PARAM['bt_min_bowl']} High legal balls bowled in the history window. Naive baseline: top 10 by overall strike rate (batters) or economy (bowlers).")
    br = []
    for r in bt.itertuples():
        pooled = r.fold == "pooled"
        base = (f"{r.base_rate_random_pick:.1f}%" if pd.notna(r.base_rate_random_pick) else "\u2014") if HAS_BASE else None
        row = [{"bat": "Batters", "bowl": "Bowlers"}[r.role], f"**{r.fold}**" if pooled else str(r.fold), int(r.qualified), int(r.assessable_qualified),
               f"{cnt(r.score_top10_assessable)} / {cnt(r.naive_top10_assessable)}", f"{r.score_hit_rate_excl:.1f}% / {r.naive_hit_rate_excl:.1f}%"]
        if HAS_BASE:
            row.append(base)
        row += [f"{r.score_hit_rate_as_miss:.1f}% / {r.naive_hit_rate_as_miss:.1f}%", f"{sgn(r.spearman_score_outcome, 2)} / {sgn(r.spearman_naive_outcome, 2)}",
                rng(r.hit_diff_lo80, r.hit_diff_hi80) if pooled else "\u2014"]
        if HAS_CLAIM:
            row.append(claim_text(r._asdict()) if pooled else "\u2014")
        br.append(row)
    bh = ["Role", "Fold", "Qualified", "Assessable", "Top-10 assessable (score / naive)", "Hit rate excl. unassessable (score / naive)"] + (["Random-pick hit rate"] if HAS_BASE else []) \
        + ["Hit rate, unassessable = miss (score / naive)", "Rank correlation (score / naive)", "Difference, 80% range (pts)"] + (["Pre-registered claim"] if HAS_CLAIM else [])
    d.table(bh, br, ["l", "l"] + ["r"] * (len(bh) - 2 - (1 if HAS_CLAIM else 0)) + (["l"] if HAS_CLAIM else []))
    d.p(f"**Result.** {hit_line(bat_p, 'Batters')}: **{CLAIM_BAT}**. {hit_line(bowl_p, 'Bowlers')}: **{CLAIM_BOWL}**. "
        f"Rank correlation with next-season outcome: batters {sgn(bat_p.spearman_score_outcome, 2)} (naive {sgn(bat_p.spearman_naive_outcome, 2)}), bowlers {sgn(bowl_p.spearman_score_outcome, 2)} (naive {sgn(bowl_p.spearman_naive_outcome, 2)}).")
    d.p("The random-pick hit rate is the share of all assessable players who were above average next season: it is what picking at random would score." if HAS_BASE else "")
    d.p(f"**Caution.** Only {cnt(bat_p.score_top10_assessable)} batter and {cnt(bowl_p.score_top10_assessable)} bowler player-seasons in the score's top 10 could be assessed across the three folds, so every hit rate is very noisy. "
        "Counting players who could not be assessed as misses lowers every rate (see the table). The result is published as it came out; no weight or metric was changed after seeing it. Earlier runs are kept for the record in `step4_backtest_summary_prefix_bug.csv` (D30) and `step4_backtest_summary_v1_preD31.csv` (before the D31 corrections).")
    d.h2("7. Sensitivity: do the weights matter?")
    wsens = sens[sens.component.isin(list("SIHC"))]
    sp = wsens.pivot_table(index=["role", "component"], columns="change", values="top10_overlap_pct").reset_index()
    sp["o"] = sp.component.map({c: i for i, c in enumerate("SIHC")}); sp = sp.sort_values(["role", "o"], ascending=[False, True]).drop(columns="o")
    sr_ = [[{"bat": "Batters", "bowl": "Bowlers"}[r.role], r.component] + [f"{r[c]:.0f}%" for c in sp.columns[2:]] for _, r in sp.iterrows()]
    d.table(["Role", "Weight changed", *[f"{sgn(c * 100, 0)}%" for c in sp.columns[2:]]], sr_, ["l", "l", "r", "r"])
    d.p(f"Each planned weight moved by plus or minus 10% (others renormalised): the top-10 overlap with the main ranking never drops below {wsens.top10_overlap_pct.min():.0f}%. "
        "If some components carry no information (section 3), changing their weights cannot change the ranking.")
    osens = sens[~sens.component.isin(list("SIHC"))]
    if len(osens):
        d.p("Alternative weightings (D31): " + "; ".join(sorted(osens.component.unique())) + ".")
        scen = {"skill_only": "Only skill under pressure (S)", "consistency_only": "Only consistency (C)", "equal_weights": "All informative components equal"}
        d.table(["Role", "Alternative weighting", "Top-10 overlap with main"], [[{"bat": "Batters", "bowl": "Bowlers"}[r.role], scen.get(r.component, r.component), f"{r.top10_overlap_pct:.0f}%"] for r in osens.itertuples()], ["l", "l", "r"])
    if TCC is not None:
        d.p("Top-10 pairs separated by their 80% ranges (`step4_too_close_to_call.csv`); every other pair is too close to call.")
        d.table(["Role", "Top-10 pairs", "Pairs separated by 80% ranges", "Pairs too close to call"], [[{"bat": "Batters", "bowl": "Bowlers"}.get(r.role, r.role), int(r.top10_pairs), int(r.pairs_separated_by_80pct_ranges), int(r.pairs_too_close_to_call)] for r in TCC.itertuples()], ["l", "r", "r", "r"])
    d.h2("8. Robustness: other definitions of pressure")
    vmeaning = {"leverage_only": "Pressure = leverage only, no context boosts", "rule_based": "Pressure from rules (chase, death, etc.) instead of leverage",
                "with_close_game": "Adds the hindsight close-game boost (comparison only, D8)", "d18_strict_buckets": "Pressure scale from earlier seasons only (strict D18, comparison)",
                "season_centred": "Season-average RAE/RSE removed (comparison only, uses later matches)"}
    rr_ = [[vmeaning.get(r.variant, r.variant), {"bat": "Batters", "bowl": "Bowlers"}[r.role], int(r.scorable_main), int(r.scorable_variant), f"{r.top20_overlap_pct:.0f}%", f"{r.spearman_common:.2f}"] for r in rob.itertuples()]
    d.table(["Variant", "Role", "Scorable (main)", "Scorable (variant)", "Top-20 overlap", "Rank correlation"], rr_, ["l", "l", "r", "r", "r", "r"])
    low = rob[rob.top20_overlap_pct < 60]
    d.p("Top-20 overlap is the share of the main top 20 that is also in the variant's top 20. "
        + ("Below 60%: " + "; ".join(f"{vmeaning.get(r.variant, r.variant).lower()} ({'batters' if r.role == 'bat' else 'bowlers'} {r.top20_overlap_pct:.0f}%)" for r in low.itertuples()) + ". The rule-based and strict-D18 variants count situations or use fewer High balls, so different players pass the sample rules; the shortlist should be read with that in mind." if len(low) else ""))
    d.h2("9. Season level: expected runs trail scoring jumps")
    orow = [[str(int(r.season)), f"{int(r.balls):,}", f"{r.mean_rae_per_ball:+.3f}".replace("-", MINUS), f"{r.actual_rpb:.3f}", f"{r.expected_rpb:.3f}"] for r in offs.itertuples()]
    d.table(["Season", "Balls", "Mean runs above expected per ball", "Actual runs per ball", "Expected runs per ball"], orow, ["l", "r", "r", "r", "r"])
    d.p("Expected runs come from earlier matches only and trail scoring jumps (D28). Season-centred check (comparison only): top-20 overlap with the main list is " + " and ".join(f"{r.top20_overlap_pct:.0f}% for {'batters' if r.role == 'bat' else 'bowlers'}" for r in rob[rob.variant == "season_centred"].itertuples()) + ".")
    d.h2("10. Limitations, stated plainly")
    d.ol(LIMITS)
    d.h2("11. External facts and assumptions")
    st = pd.Series([f["status"] for f in METHOD["facts"]]).value_counts()
    d.p(f"Under Golden Rule 2 every external fact is either VERIFIED or tagged. **None could be verified**: the network policy blocked the sources (D23). Ledger of {len(METHOD['facts'])} facts: " + ", ".join(f"{v} {k}" for k, v in st.items()) + ". Full ledger: `logs/FACTS.md`. Recheck before the auction (D2).")
    d.table(["ID", "Item", "Value used", "Reason"], [[r.id, r.item, r.value_used, r.reason] for r in assum.itertuples()], ["l", "l", "l", "l"])
    d.h2("12. Data handling")
    d.ul([f"Scope: IPL only. {S['ipl_matches']} matches, {S['ipl_balls']:,} balls; {S['wp_eligible']} matches eligible for win probability (no-result, abandoned, DLS or reduced-overs matches excluded from pressure and WPA, still in descriptive totals).",
          f"Players: {S['in_scope']} in scope (appeared in IPL 2025 or 2026); {S['scorable_bat']} batters, {S['scorable_bowl']} bowlers and {S['scorable_ar']} all-rounders scorable; {S['not_scorable']} not scorable.",
          f"Every drop, merge, filter or fix is logged: {len(METHOD['data_notes'])} entries in `logs/DATA_NOTES.md`. Super overs are excluded from all metrics. Venues are UNKNOWN for all matches (D23).",
          "Every number in this note is read from `outputs/tables/*.csv`, `outputs/tables/summary_numbers.json` and `outputs/deliverables/dashboard_payload.json` by `src/step7_docs.py`."])
    return d

def build_dictionary():
    d = Doc()
    d.h1("RR Clutch Index: Data Dictionary")
    d.p("Part A lists every column of the ball table. Part B lists every metric. Part C gives the shared definitions the numbers rely on. Sources: `outputs/tables/step0_ball_columns.csv`, `dashboard_payload.json` (glossary), `logs/DEFINITIONS.md`.")
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
             ["score", "Clutch Reliability Score: 100 x normal CDF of Z / sd(Z), among scorable players of the role"],
             ["score_lo80, score_hi80", "80% range of the score from resampling the player's matches"],
             ["S_raw, I_raw, H_raw", "Components before shrinkage"], ["S_lo80, S_hi80", "80% range of the skill component"],
             ["n_hi_w, n_lo_w", "Recency-weighted number of High- and Low-pressure balls"], ["hi_qual_n", "Number of High-pressure balls (faced or bowled) used for the player"],
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
    d.h3("B4. Auction table columns (`step5_*.csv`)")
    at = [["tier", "Must-Back (lower end of 80% range at or above 50, best gap fit), Value Pick (score 60+, Regular or Emerging price), Hidden Gem (score 60+, smallest samples)"],
          ["price_band, walk_away_cr", "Rule-based price band in Rs crore and its top, the walk-away price [ASSUMPTION A6]"], ["price_tier", "Established, Regular or Emerging, from seasons with 10+ matches [A6]"],
          ["availability", "Whether the player is in the auction pool: UNKNOWN [A2], likely retained [A3] or RR squad [A1]"], ["risk_tags", "Plain-language risks: sample size, short record, age or injury UNKNOWN"],
          ["fills_gaps", "RR gap the player's batting or bowling role could fill; derived from role, not from his own phase record"], ["fit_weight", "1.5 if the player fills a measured RR gap, else 0.6 [A10]"],
          ["value", "score / 100 x fit_weight, the quantity the budget plan maximises [A10]"], ["rr_group_per100, league_per100, gap_vs_league_per100", "RR and league runs above (batting) or saved (bowling) per 100 High-pressure balls, and the difference"]]
    d.table(["Column", "Meaning"], at, ["l", "l"])
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
def render(jobs):
    jf = TMP / "jobs.json"; jf.write_text(json.dumps(jobs))
    r = subprocess.run(["node", str(ROOT / "src" / "step7_render.js"), str(jf)], capture_output=True, text=True)
    print(r.stdout.strip());
    if r.returncode:
        print(r.stderr); sys.exit(1)

def previews(pdf, stem, dpi=70):
    for old in PREV.glob(f"{stem}_p*.png"):
        old.unlink()
    subprocess.run(["pdftoppm", "-png", "-r", str(dpi), str(pdf), str(PREV / f"{stem}_p")], check=True)
    # normalise names to <stem>_p1.png
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
    shutil.rmtree(TMP, ignore_errors=True)

if __name__ == "__main__":
    main()
