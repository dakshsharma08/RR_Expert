"""Run the whole RR Clutch Index pipeline from the raw file, in order (fixed seed 2027 in every step).

python3 -I src/run_all.py            # everything from Step 0
Steps: 0 audit -> 0 keys/finalise/team map -> 1A win prob -> 1B pressure -> 1C examples -> 2 expected runs
       -> 3-4 metrics & score & backtest -> 5 auction lens -> 7 dashboard payload.
Facts consolidation (logs/FACTS.md) is re-run too; it reads the saved evidence files and does no web access.
"""
import runpy, sys, time
from pathlib import Path

SRC = Path(__file__).resolve().parent
STEPS = ["step0_match_keys.py", "step0_audit.py", "step0_finalize.py", "step0_team_map.py", "facts_consolidate.py",
         "step1a_winprob.py", "step1b_pressure.py", "step1c_examples.py", "step2_expected.py",
         "step34_score.py", "step5_auction.py", "step7_payload.py"]

def main(start=None):
    """Run the steps in order, starting at `start` (a script name) or from the beginning."""
    start = start or STEPS[0]
    assert start in STEPS, f"unknown step {start}"
    go = False
    for s in STEPS:
        go = go or s == start
        if not go or not (SRC / s).exists():
            continue
        t = time.time()
        print(f"=== {s}", flush=True)
        runpy.run_path(str(SRC / s), run_name="__main__")
        print(f"=== {s} done in {time.time() - t:.0f}s", flush=True)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].endswith(".py") else None)
