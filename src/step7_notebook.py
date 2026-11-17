"""Step 7E: build and EXECUTE the reproducible notebook (outputs/deliverables/E_RR_Clutch_Index_Notebook.ipynb).

The notebook calls the same src/ scripts as the pipeline (one code path), so it regenerates every final table
from the raw data with the fixed seed, then shows the key results. Run: python3 -I src/step7_notebook.py
"""
import sys
from pathlib import Path
import nbformat as nbf
from nbclient import NotebookClient

ROOT = Path(__file__).resolve().parent.parent
nb = nbf.v4.new_notebook()
md, code = nbf.v4.new_markdown_cell, nbf.v4.new_code_cell
nb.cells = [
    md("# RR Clutch Index: reproducible notebook\n\n"
       "This notebook regenerates every final table in `outputs/tables/` from the raw ball-by-ball file. "
       "It runs the same scripts as the pipeline (`src/`), with fixed random seed **2027**.\n\n"
       "- **Raw data:** `data/raw/ball_by_ball_v2.csv.gz`. Its checksum is verified before anything runs.\n"
       "- **Method rules:** `logs/PREREGISTRATION.md` (frozen) and `logs/DECISIONS.md`.\n"
       "- **What the score is:** a *historical pressure-performance indicator*. Its ability to predict IPL 2027 is not established (D15).\n\n"
       "Runtime is about 3–4 minutes."),
    code("import sys, os, json, runpy\nfrom pathlib import Path\nROOT = Path.cwd()\nwhile not (ROOT / 'src' / 'config.py').exists():\n    ROOT = ROOT.parent\n"
         "os.chdir(ROOT); sys.path.insert(0, str(ROOT / 'src'))\nimport pandas as pd\npd.set_option('display.width', 200); pd.set_option('display.max_columns', 30)\n"
         "from config import SEED, RAW_SHA256\nprint('repo:', ROOT, '| seed:', SEED)"),
    md("## 1. Verify the raw data\nThe loader refuses to run if the checksum or shape differs from the validated v2 dataset."),
    code("from io_raw import load_raw\nraw = load_raw()\nprint(raw.shape, 'sha256 OK:', RAW_SHA256[:16], '...')"),
    md("## 2. Run the whole pipeline\nThe steps run in order: Step 0 audit → win probability → pressure → expected runs → metrics and score → auction lens → payload.\n"
       "Facts are re-read from saved evidence files. There is no web access."),
    code("import run_all, time\nt0 = time.time()\nrun_all.main()\nprint(f'pipeline finished in {time.time() - t0:.0f}s')"),
    md("## 3. Independent sanity check: official season leaders, recomputed from raw\n"
       "Part 5 definitions: batter runs are runs off the bat; bowler wickets exclude run-outs; super overs are excluded."),
    code("ipl = {'1','2','3','4','5','7','8','242','3508','3509'}\n"
         "m = raw.groupby('match_id').apply(lambda g: set(g.batting_team_id) | set(g.bowling_team_id) <= ipl, include_groups=False)\n"
         "x = raw[raw.match_id.isin(m[m].index) & raw.innings.isin(['1','2'])].copy()\nx['season'] = x.delivery_ist_time.str[:4]\n"
         "runs = x.assign(r=x.runs.astype(int)).groupby(['season','striker_name']).r.sum()\n"
         "wk = x[x.dismissal_type.isin(['Bowled','Caught','LBW','Stump','Hit Wicket'])].groupby(['season','bowler_name']).size()\n"
         "pd.DataFrame({'top_run_scorer': runs.groupby(level=0).idxmax().str[1], 'runs': runs.groupby(level=0).max(),\n"
         "              'top_wicket_taker': wk.groupby(level=0).idxmax().str[1], 'wickets': wk.groupby(level=0).max()})"),
    md("## 4. Win-probability model: out-of-sample accuracy by season\nBrier score: lower is better; a coin flip scores 0.25. Each season is scored by a model trained only on earlier seasons."),
    code("T = lambda n: pd.read_csv(ROOT / 'outputs' / 'tables' / f'{n}.csv')\nT('step1a_wp_eval').round(3)"),
    md("## 5. Pressure Index: share of balls by level, and example balls"),
    code("display(T('step1b_bucket_shares').round(3)); T('step1c_example_balls')[['match','situation_before_ball','what_happened','pressure_index','bucket']]"),
    md("## 6. Clutch Reliability Score: top 10 per role, with 80% ranges"),
    code("for r in ['batters','bowlers']:\n    d = T(f'step4_scores_{r}')\n    display(d[['player_name','score','score_lo80','score_hi80','hi_qual_n','seasons_assessed']].head(10).round(1))\n"
         "T('step4_too_close_to_call')"),
    md("## 7. Backtest: does the score persist into the next season?\n"
       "The score is built from seasons before N and checked in season N. It is compared with a naive ranking and with a random pick."),
    code("T('step4_backtest_summary')[['role','fold','score_hit_rate_excl','naive_hit_rate_excl','base_rate_random_pick','hit_diff_lo80','hit_diff_hi80','claim']].round(1)"),
    md("## 8. Robustness and sensitivity"),
    code("display(T('step4_definition_robustness').round(2)); T('step4_sensitivity').groupby(['role','component']).top10_overlap_pct.min().unstack(0)"),
    md("## 9. Auction lens: RR gaps, conditional shortlist and Plan A\n"
       "Every external fact (availability, price, purse, age) is an **[ASSUMPTION]** or UNKNOWN. See `step5_assumptions`."),
    code("display(T('step5_gaps').round(2)); display(T('step5_shortlist')[['tier','player_name','role','sub_role','score','score_lo80','score_hi80','price_band','fills_gaps']].round(1))\n"
         "display(T('step5_plans')[['plan','player_name','price_band']]); T('step5_assumptions')"),
    md("## 10. Reproducibility check\nRe-running gives identical tables: the script is deterministic, with seed 2027. The checksums of the key outputs are printed below."),
    code("import hashlib\nfor f in ['step4_scores_batters','step4_scores_bowlers','step4_backtest_summary','step5_shortlist']:\n"
         "    print(f, hashlib.sha256((ROOT/'outputs'/'tables'/f'{f}.csv').read_bytes()).hexdigest()[:16])"),
]
out = ROOT / "outputs" / "deliverables" / "E_RR_Clutch_Index_Notebook.ipynb"
NotebookClient(nb, timeout=1800, kernel_name="python3", resources={"metadata": {"path": str(ROOT)}}).execute()
nbf.write(nb, out)
assert any("pipeline finished in" in "".join(o.get("text", "") for o in c.get("outputs", [])) for c in nb.cells if c.cell_type == "code"), "pipeline cell did not run"
errs = [c for c in nb.cells if c.cell_type == "code" and any(o.get("output_type") == "error" for o in c.get("outputs", []))]
print("notebook written:", out, "| code cells:", sum(c.cell_type == "code" for c in nb.cells), "| cells with errors:", len(errs))
