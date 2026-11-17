"""Shared configuration for every step of the RR Clutch Index pipeline.

All paths are relative to the repo root. The random seed is fixed so every step can be re-run exactly.
"""
from pathlib import Path
import importlib.util

ROOT = Path(__file__).resolve().parent.parent
SEED = 2027

RAW_PATH = ROOT / "data" / "raw" / "ball_by_ball_v2.csv.gz"
RAW_SHA256 = "01e2b4379edfbab6a6e456d304cb3c70f554cb312ef93d9588f3f32a82cb396e"   # decompressed content
RAW_ROWS, RAW_COLS = 200_999, 33

WORK = ROOT / "data" / "work"
FACTS_WORK = WORK / "facts"
TABLES = ROOT / "outputs" / "tables"
FIGURES = ROOT / "outputs" / "figures"
DELIVERABLES = ROOT / "outputs" / "deliverables"
LOGS = ROOT / "logs"

# Team-id -> franchise name, inferred from each id's regular players (see scripts/teams.py).
# The Facts Researcher verifies these names in Step 0; the verified names go into data/work/team_map.csv.
_spec = importlib.util.spec_from_file_location("teams", ROOT / "scripts" / "teams.py")
_teams = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_teams)
IPL_TEAMS = dict(_teams.IPL)          # {"3": "RR", ...}
OTHER_TEAMS = dict(_teams.OTHER)

PHASES = {"Powerplay": range(1, 7), "Middle": range(7, 16), "Death": range(16, 21)}   # Part 5
SUPER_OVER_INNINGS = {"3", "4"}                                                         # Part 5 / Step 0
IPL_SEASONS = [2022, 2023, 2024, 2025, 2026]
TRAINING_ONLY_SEASONS = [2022]          # D10
SCORED_SEASONS = [2023, 2024, 2025, 2026]  # D10
IMPACT_PLAYER_FROM = 2023               # Step 0 flag


def phase_of(over: int) -> str:
    for name, rng in PHASES.items():
        if over in rng:
            return name
    return "Other"
