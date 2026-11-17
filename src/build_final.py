"""Final rebuild in the correct order (Step 8). Each step reads only outputs/tables (and the raw file).

1. Notebook E: re-runs the WHOLE pipeline from data/raw (run_all, incl. the payload) and stores the outputs.
2. Dashboard A: injects the payload; then the Node test suite (screenshots + checks).
3. Docs B, C, D and video script F.
4. Step 8 audit (reads the notebook's table hashes, dashboard test report, cold reader), payload re-injected with
   the audit table, dashboard rebuilt and re-tested, then the handover note.
Run: python3 -I src/build_final.py
"""
import subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run(cmd):
    t = time.time()
    print(f"=== {' '.join(cmd)}", flush=True)
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    tail = "\n".join((r.stdout + r.stderr).strip().splitlines()[-4:])
    print(tail, flush=True)
    print(f"=== exit {r.returncode} in {time.time() - t:.0f}s", flush=True)
    if r.returncode != 0:
        sys.exit(f"FAILED: {' '.join(cmd)}")


py = [sys.executable, "-I"]
run(py + ["src/step7_notebook.py"])
run(py + ["src/step7_build_dashboard.py"])
run(["node", "src/tests/test_dashboard.js"])
run(py + ["src/step7_docs.py"])
run(py + ["src/step7_video_script.py"])
run(py + ["src/step8_audit.py"])
run(py + ["src/step7_payload.py"])            # payload now carries the Step 8 audit table
run(py + ["src/step7_build_dashboard.py"])
run(["node", "src/tests/test_dashboard.js"])
run(py + ["src/step8_audit.py"])              # final audit against the final build
run(py + ["src/step8_handover.py"])
print("FINAL BUILD COMPLETE")
