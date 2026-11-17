"""Step 1 extras: real example balls across pressure levels (checkpoint), and showcase close matches (dashboard Tab 2).

Outputs: outputs/tables/step1c_example_balls.csv, outputs/tables/step1c_showcase_matches.csv
Selection is deterministic: for each target index value, the 2026 ball closest to it (ties: lowest match_id, ball).
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import pandas as pd
from config import WORK, TABLES, IPL_TEAMS
from loaders import load_balls

b = load_balls()
p = pd.read_parquet(WORK / "pressure_ball.parquet")
m = pd.read_csv(WORK / "matches_ipl.csv")
x = p[~p.reference_only].merge(b[["match_id", "innings", "innings_ball_num", "overid", "over_ball_num", "striker_name", "bowler_name",
                                  "team_runs_before", "wickets_before", "legal_balls_before", "target", "batting_team_id",
                                  "bowling_team_id", "bat_runs", "total_runs", "is_wicket", "dismissal_type", "extras_type"]],
                               on=["match_id", "innings", "innings_ball_num"]).merge(
    m[["match_id", "match_date", "batting_first", "batting_second", "winner", "margin_type", "margin_value", "playoff_label"]], on="match_id")


def describe(r):
    bat, bowl = IPL_TEAMS[str(r.batting_team_id)], IPL_TEAMS[str(r.bowling_team_id)]
    over = f"{int(r.legal_balls_before // 6)}.{int(r.legal_balls_before % 6)}"
    sit = f"{bat} {int(r.team_runs_before)}/{int(r.wickets_before)} after {over} overs"
    if r.innings == 2:
        need = int(r.target - r.team_runs_before); left = int(120 - r.legal_balls_before)
        sit += f", need {need} off {left}"
    out = "WICKET (" + r.dismissal_type + ")" if str(r.is_wicket).lower() == "true" else (f"{int(r.total_runs)} run(s)" + (f" [{r.extras_type}]" if r.extras_type not in ("None", "") else ""))
    return pd.Series({"match": f"{r.batting_first} v {r.batting_second}, {r.match_date}" + (f" ({r.playoff_label})" if isinstance(r.playoff_label, str) else ""),
                      "innings": int(r.innings), "situation_before_ball": sit, "batter": r.striker_name, "bowler": r.bowler_name,
                      "bowling_side": bowl, "what_happened": out, "win_prob_batting_side_before": round(r.wp_before, 3),
                      "leverage_expected_swing": round(r.leverage, 4), "pressure_index": round(r.pi, 1), "bucket": r.pi_bucket,
                      "result": f"{r.winner} won by {int(r.margin_value)} {r.margin_type}" if isinstance(r.winner, str) else "tie/other"})


s26 = x[x.season == 2026].sort_values(["match_id", "innings", "innings_ball_num"])
rows = []
for t in [3, 25, 45, 60, 75, 85, 95, 99.5]:
    i = (s26.pi - t).abs().idxmin()
    rows.append(describe(s26.loc[i]).to_frame().T.assign(target_index=t))
ex = pd.concat(rows, ignore_index=True)
ex.to_csv(TABLES / "step1c_example_balls.csv", index=False)
print(ex[["match", "situation_before_ball", "what_happened", "pressure_index", "bucket", "win_prob_batting_side_before"]].to_string())

# showcase close matches (2023-26, eligible): margin <= 10 runs or <= 2 wickets, or tie; include all RR ones; cap 10
close = m[(m.season >= 2023) & m.wp_eligible_provisional & (((m.margin_type == "runs") & (m.margin_value <= 10)) |
          ((m.margin_type == "wickets") & (m.margin_value <= 2)) | (m.result_category == "TIE_DECIDED_BY_SUPER_OVER"))].copy()
close["has_rr"] = (close.batting_first == "RR") | (close.batting_second == "RR")
close["closeness"] = np.where(close.margin_type == "runs", close.margin_value, close.margin_value * 5).astype(float)
close.loc[close.result_category == "TIE_DECIDED_BY_SUPER_OVER", "closeness"] = -1
pick = pd.concat([close[close.has_rr].sort_values(["closeness", "match_date"]).head(5),
                  close[~close.has_rr].sort_values(["closeness", "match_date"])]).drop_duplicates("match_id")
pick = pd.concat([pick[pick.playoff_label.notna()], pick]).drop_duplicates("match_id").head(8)
pick = pick.sort_values("match_date")
pick[["match_id", "season", "match_date", "batting_first", "batting_second", "winner", "margin_type", "margin_value",
      "result_category", "playoff_label", "has_rr"]].to_csv(TABLES / "step1c_showcase_matches.csv", index=False)
print(pick[["match_id", "match_date", "batting_first", "batting_second", "winner", "margin_type", "margin_value", "playoff_label"]].to_string())
