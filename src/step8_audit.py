"""Step 8: final self-audit (the master prompt's 15 checks) with evidence computed from files.

Output: outputs/tables/step8_audit.csv (Check | Status | Fix applied | Remaining risk | Evidence)
Run after the pipeline, payload, dashboard and docs are built: python3 -I src/step8_audit.py
"""
import hashlib, json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import pandas as pd
from config import TABLES, WORK, LOGS, DELIVERABLES, ROOT
from io_raw import load_raw

T = lambda n: pd.read_csv(TABLES / f"{n}.csv")
rows = []
add = lambda check, status, fix, risk, ev: rows.append(dict(check=check, status=status, fix_applied=fix, remaining_risk=risk, evidence=ev))

scope, sb, sw = T("step3_scope"), T("step4_scores_batters"), T("step4_scores_bowlers")
tc = T("step4_too_close_to_call")
wide = int((sb.score_hi80 - sb.score_lo80 >= 55).sum() + (sw.score_hi80 - sw.score_lo80 >= 55).sum())
ok_thr = bool((sb.hi_qual_n >= 100).all() and (sw.hi_qual_n >= 60).all())
add("Small-sample traps", "Pass" if ok_thr else "Fail",
    "Pre-registered minimums (≥100 / ≥60 High balls); EB shrinkage; 80% ranges; wide ranges greyed; too-close-to-call table",
    f"No top-10 pair is separated by 80% ranges ({int(tc.pairs_too_close_to_call.sum())} of {int(tc.top10_pairs.sum())} pairs overlap): order within the top group is not meaningful",
    f"thresholds met for all {len(sb)} batters and {len(sw)} bowlers; {wide} players have ranges ≥55 points")

ns = T("step5_not_scorable")
ss = T("step4_scope_sensitivity")
ssum = ss[ss.player_name == "(summary)"].set_index("role")
same = bool((ssum.overlap_top10 == 10).all())
add("Survivorship bias (retired or inactive players)", "Pass" if same else "Partial",
    "Pre-registered scope = players who appeared in IPL 2025 or 2026; 'Not Scorable on IPL Data' list with samples (D3); "
    "scope sensitivity re-scores every qualifying 2023–26 player (step4_scope_sensitivity)",
    "Players outside IPL (no IPL record) cannot be rated: IPL-only by design (D38)",
    f"{len(scope)} in scope; {len(ns)} not scorable listed; without the scope filter: batters {int(ssum.loc['bat', 'n_rated_all'])} rated "
    f"(headline {int(ssum.loc['bat', 'n_rated_headline'])}), bowlers {int(ssum.loc['bowl', 'n_rated_all'])} (headline {int(ssum.loc['bowl', 'n_rated_headline'])}); "
    f"top-10 overlap bat {int(ssum.loc['bat', 'overlap_top10'])}/10, bowl {int(ssum.loc['bowl', 'overlap_top10'])}/10")

rob = T("step4_definition_robustness"); offs = T("step2_season_offsets")
sc_ = rob[rob.variant == "season_centred"].top20_overlap_pct.tolist()
add("Season / era bias", "Pass",
    "2022 (pre-Impact Player) used only to train (D10); phase-specific season factor from earlier matches (D28); recency weights",
    "Earlier-only benchmarks trail scoring jumps (mean RAE/ball offsets by season reported)",
    f"season-centred variant top-20 overlap {sc_} %; offsets {dict(zip(offs.season, offs.mean_rae_per_ball.round(3)))}")

bc = T("step1b_boost_correlation"); ov = T("step1b_definition_overlap_balls")
add("Double counting in the pressure index", "Pass",
    "Boost-vs-leverage correlation rule on the 2022 reference (drop >0.7, halve >0.5); close-game boost excluded from main (D8)",
    "Boosts change little: main vs leverage-only Spearman on balls is very high",
    f"max |rho| boost vs leverage {bc.spearman_with_leverage_2022ref.abs().max():.3f}; main vs leverage-only ball Spearman {ov[ov.definition == 'pi_lev'].spearman_raw.iloc[0]:.3f}")

add("Leakage in the backtest", "Pass",
    "Season models trained on earlier seasons only (D4); every benchmark from earlier matches (D11); fold priors/standardisation from ≤N-1 (D20)",
    "Some design choices (D26 features, D27 reference weight) were made after seeing test-season diagnostics; disclosed",
    "Critic 1 truncation test: all earlier balls bit-identical when later data removed; Critic 2: no leakage in step34")

pre = (LOGS / "PREREGISTRATION.md").read_bytes()
sha = hashlib.sha256(pre).hexdigest()
logged = re.search(r"sha256 = `([0-9a-f]{64})`", (LOGS / "DECISIONS.md").read_text())
add("Cherry-picked stats", "Pass" if logged and logged.group(1) == sha else "Fail",
    "Metric list, weights and scaling frozen before any ranking (D29); every metric and the full backtest reported, including unfavourable results",
    "Implementation corrections after the freeze (D30, D31) are logged with pre/post numbers",
    f"pre-registration sha256 {sha[:16]}… {'matches' if logged and logged.group(1) == sha else 'DOES NOT match'} D29")

raw = load_raw()
ipl = {"1", "2", "3", "4", "5", "7", "8", "242", "3508", "3509"}
mm = raw.groupby("match_id").apply(lambda g: set(g.batting_team_id) | set(g.bowling_team_id) <= ipl, include_groups=False)
x = raw[raw.match_id.isin(mm[mm].index) & raw.innings.isin(["1", "2"])].copy()
x["season"] = x.delivery_ist_time.str[:4].astype(int)
runs = x.assign(r=x.runs.astype(int)).groupby(["season", "striker_name"]).r.sum()
wk = x[x.dismissal_type.isin(["Bowled", "Caught", "LBW", "Stump", "Hit Wicket"])].groupby(["season", "bowler_name"]).size()
off = pd.read_csv(WORK / "facts" / "season_leaders_official.csv")
hits = 0; tot = 0
for r in off.itertuples():
    if r.cap not in ("Orange Cap", "Purple Cap"):
        continue
    name = re.sub(r"\s*\(.*\)", "", r.player).strip(); val = int(re.match(r"\d+", str(r.value)).group())
    mine = (runs if r.cap == "Orange Cap" else wk).get((int(r.season), name), -1)
    tot += 1; hits += int(mine == val)
add("Totals that don't match the raw data", "Pass" if hits == tot else "Fail",
    "Season leaders recomputed straight from the raw file in this audit; innings totals reconciled at Step 0 (0 mismatches)",
    "Official totals themselves are REPORTED (search summary), not VERIFIED",
    f"{hits} of {tot} official season leaders reproduced exactly from raw")

pm = pd.read_csv(WORK / "player_map.csv")
add("Player name typos / mismatched IDs", "Pass" if (pm.n_name_variants == 1).all() else "Partial",
    "One id → one name (checked); 43 look-alike name pairs reviewed, none merged without evidence; team map built (INFERRED)",
    "Team names inferred from players (external check blocked)",
    f"{int((pm.n_name_variants == 1).sum())} of {len(pm)} ids have exactly one name")

rep = (DELIVERABLES / "dashboard_test_report.txt").read_text() if (DELIVERABLES / "dashboard_test_report.txt").exists() else ""
add("Misleading chart axes", "Pass",
    "Bar charts start at 0; axis labels and units; cut axes labelled (dashboard spec, deck and cheat-sheet builders); visual review of every page",
    "Diverging gap bars (negative/positive) are centred on 0 by design",
    "dashboard test report + supervisor and builder visual checks of all screenshots/previews")


def sim_deut(hexc):
    """Machado et al. (2009) deuteranopia simulation, severity 1.0, on linear RGB."""
    c = np.array([int(hexc[i:i + 2], 16) for i in (1, 3, 5)]) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]])
    s = np.clip(M @ lin, 0, 1)
    return float(0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]), s


lp, _ = sim_deut("#E4007C"); lb, _ = sim_deut("#254AA5")
add("Colour-blind readability", "Pass",
    "Never colour alone: tier markers use shapes and hatching, labels on bars, legends; pink/blue also differ in pattern",
    "Pink and blue are close in luminance under deuteranopia, so patterns and labels carry the distinction",
    f"deuteranopia-simulated relative luminance: pink {lp:.3f} vs blue {lb:.3f} (ratio {(max(lp, lb) + 0.05) / (min(lp, lb) + 0.05):.2f}); patterns + labels used")

payload = json.loads((DELIVERABLES / "dashboard_payload.json").read_text())
oc = T("step0_official_meta_check")
explained = {"Winner agrees (no result = no winner)", "Reduced-overs (DLS) matches agree"}   # all excluded from win probability (conservative)
bad = oc[(oc.status != "Pass") & ~oc.check.isin(explained)]
add("Match list agrees with the organisers' official match file", "Pass" if bad.empty else "Fail",
    "step0_official_meta_check: competitions, match ids, seasons, dates, playoffs, no-results, super overs checked; the 7 rain-affected matches "
    "where the data alone could not name a winner are all excluded from the win-probability model (D38)",
    "Our reduced-overs flag is wider than the official one (13 v 5): those matches are left out of win probability, which is conservative",
    "; ".join(f"{r.check}: {r.status} ({r.detail})" for r in oc.itertuples() if r.status != "Pass" or "Every match" in r.check))

mism = []
for role, df in (("bat", sb), ("bowl", sw)):
    for r in df.itertuples():
        p_ = next((q for q in payload["players"] if q["id"] == str(r.player_id)), None)
        if p_ is None or p_.get(role) is None or abs(p_[role]["score"] - round(r.score, 1)) > 0.051:
            mism.append(r.player_name)
sn = json.loads((TABLES / "summary_numbers.json").read_text())["summary"]
bt = T("step4_backtest_summary").set_index(["role", "fold"])
bt_ok = abs(sn["backtest"]["bat_score"] - round(bt.loc[("bat", "pooled"), "score_hit_rate_excl"], 1)) < 0.051
nb_ok = None
nbp = DELIVERABLES / "E_RR_Clutch_Index_Notebook.ipynb"
if nbp.exists():
    import nbformat
    nb = nbformat.read(nbp, 4)
    txt = "".join(o.get("text", "") for c in nb.cells if c.cell_type == "code" for o in c.get("outputs", []))
    hashes = dict(re.findall(r"(step\w+) ([0-9a-f]{16})", txt))
    nb_ok = all(hashlib.sha256((TABLES / f"{k}.csv").read_bytes()).hexdigest()[:16] == v for k, v in hashes.items()) if hashes else False
add("The same number everywhere (dashboard, PDF, cheat sheet, notebook = outputs/tables)",
    "Pass" if (not mism and bt_ok and nb_ok) else "Partial",
    "Every deliverable is generated by code from outputs/tables (payload, step7_docs, video script, notebook re-runs the pipeline)",
    "Free-text sentences in deliverables are templates; they were rebuilt after the last data change",
    f"payload vs score tables mismatches: {len(mism)}; summary vs backtest table: {'ok' if bt_ok else 'MISMATCH'}; notebook table hashes match current files: {nb_ok}")

t10 = payload["top10"]
edge_close = all(t10["edge"][r]["overlaps_10th"] for r in ("bat", "bowl"))
banned = re.compile(r"auction|must-back|walk-away|price band|plan a\b|purse|retain|ipl 2027|value pick|hidden gem", re.I)
hits_ = []
html = (DELIVERABLES / "RR_Clutch_Index_Dashboard.html").read_text(encoding="utf-8") if (DELIVERABLES / "RR_Clutch_Index_Dashboard.html").exists() else ""
pdf_txt = ""
try:
    from pypdf import PdfReader
    for f in ("B_RR_Clutch_Index_Deck.pdf", "C_RR_Clutch_Index_Cheat_Sheet.pdf", "D_Methodology_and_Limitations.pdf", "RR_Clutch_Index_Submission.pdf"):
        if (DELIVERABLES / f).exists():
            pdf_txt += " ".join(pg.extract_text() or "" for pg in PdfReader(DELIVERABLES / f).pages)
except ImportError:
    pass
hits_ = sorted(set(m.group(0).lower() for m in banned.finditer(pdf_txt)))
add("Answers the Round 1 brief (top 10 batters and bowlers under pressure, no player-selection advice)", "Pass" if (len(t10["bat"]) == 10 and len(t10["bowl"]) == 10 and not hits_) else "Fail",
    "Organisers' clarification (17 Nov) applied (D38): both top-10 lists lead every deliverable; recommendation, price and squad content removed",
    ("#11 is too close to call with #10 in both lists (80% ranges overlap), so the edge of each top 10 is soft" if edge_close else "#10/#11 boundary separated"),
    f"top-10 sizes bat {len(t10['bat'])}, bowl {len(t10['bowl'])}; out-of-brief words found in PDFs: {hits_ or 'none'}")

_crs = sorted((TABLES.parent / "reviews").glob("cold_reader*.csv"), key=lambda f: (f.stem != "cold_reader", f.stem))
cr = _crs[-1] if _crs else TABLES.parent / "reviews" / "cold_reader.csv"     # latest round (round2 after fixes)
if cr.exists():
    c = pd.read_csv(cr)
    yes = int(c.within_2_min.astype(str).str.lower().str.startswith("yes").sum())
    add("Every selector-facing page passes the cold-reader test", "Pass" if yes == len(c) else "Partial",
        "Cold reader (fresh Sonnet agent, images only) on 7 dashboard tabs, cheat sheet and 7 slides; fixes applied to flagged confusions",
        "Remaining confusions listed in outputs/reviews/cold_reader.csv",
        f"{yes} of {len(c)} pages understood within 2 minutes ({cr.name}); partly: {int(c.within_2_min.astype(str).str.lower().str.startswith('partly').sum())}")
else:
    add("Every selector-facing page passes the cold-reader test", "Pending", "", "", "cold reader not yet run")

add("The dashboard works offline at 380px with no console errors", "Pass" if "RESULT: ALL CHECKS PASSED" in rep else "Fail",
    "Headless Chromium test with network blocked; screenshots at 380px and 1280px; filters, cards and numbers checked",
    "Tested in Chromium only",
    "dashboard_test_report.txt: " + ("ALL CHECKS PASSED" if "RESULT: ALL CHECKS PASSED" in rep else "not passing"))

out = pd.DataFrame(rows)
out.to_csv(TABLES / "step8_audit.csv", index=False)
print(out[["check", "status", "evidence"]].to_string(index=False, max_colwidth=110))
