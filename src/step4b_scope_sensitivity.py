"""Step 4b (Round 1 addendum, D38): does the pre-registered player scope change the top 10s?

The frozen scope rates players who appeared in IPL 2025 or 2026 (current players). Round 1 asks for the top 10
batters and bowlers under pressure, so this check re-scores with NO scope filter (every player with enough
High-pressure balls in IPL 2023-26, including those whose last season was 2023 or 2024) using the same frozen
method, weights and thresholds (no bootstrap), and reports who would enter each top 10.
This is a disclosed sensitivity only; the headline lists keep the pre-registered scope.
Output: outputs/tables/step4_scope_sensitivity.csv
"""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import TABLES  # noqa: E402
import step34_score as S  # noqa: E402

b, bat, bowl = S.frames("pi_bucket")
names = pd.concat([bat[["player_id", "player_name"]], bowl[["player_id", "player_name"]]]).groupby("player_id").player_name.agg(lambda x: x.mode().iat[0])
last = int(b.season.max())
rows = []
for role, frame, thr, main in (("bat", bat, S.MIN_HI_BAT, "step4_scores_batters"), ("bowl", bowl, S.MIN_HI_BOWL, "step4_scores_bowlers")):
    res, _ = S.role_scores(frame, role, last, thr, boot=False)
    res = res.join(names.rename("player_name"))
    res = res.sort_values("score", ascending=False)
    head = pd.read_csv(TABLES / f"{main}.csv", dtype={"player_id": str}).sort_values("score", ascending=False)
    main_top = list(head.player_name.head(10))
    all_top = list(res.player_name.head(10))
    last_season = frame.groupby("player_id").season.max()
    for i, (pid, r) in enumerate(res.head(10).iterrows(), 1):
        rows.append(dict(role=role, rank_all_players=i, player_name=r.player_name, score_all_players=round(float(r.score), 2),
                         last_ipl_season=int(last_season.get(pid, 0)), in_headline_top10=r.player_name in main_top))
    rows.append(dict(role=role, rank_all_players=None, player_name="(summary)", score_all_players=None, last_ipl_season=None,
                     in_headline_top10=None, n_rated_all=int(len(res)), n_rated_headline=int(len(head)),
                     overlap_top10=len(set(main_top) & set(all_top)),
                     entering=" | ".join(n for n in all_top if n not in main_top), leaving=" | ".join(n for n in main_top if n not in all_top)))
out = pd.DataFrame(rows)
out.to_csv(TABLES / "step4_scope_sensitivity.csv", index=False)
print(out.to_string(index=False))
