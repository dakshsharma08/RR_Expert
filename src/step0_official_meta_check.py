"""Step 0 (addendum, 17 Nov): cross-check our IPL match table against the organisers' match metadata.

Inputs (read-only, checksum-verified): data/raw/meta/{matches,competitions,teams}.csv, sent by the
organisers with the Round 1 clarification. Nothing in the pipeline is changed by this script; it only
reports agreement or disagreement, so every downstream number stays as frozen.
Output: outputs/tables/step0_official_meta_check.csv (one row per check) and
        outputs/tables/step0_official_meta_mismatches.csv (one row per disagreeing match, if any).
"""
import hashlib
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import ROOT, TABLES  # noqa: E402

META = ROOT / "data" / "raw" / "meta"
SHA = {
    "matches.csv": "bb100ab84b8b9a15160c1f2315cf675210131a30e779ec5079fd5403dcf56eef",
    "competitions.csv": "507ceb7189f972d4e4f299ddcfc97f3c3247af1913f6291106f161fa8353fd9b",
    "teams.csv": "a65e5922a9b3bf49247b24fc9471782e700efb31f8dcc5042923238b87c50a5d",
}
for f, h in SHA.items():
    got = hashlib.sha256((META / f).read_bytes()).hexdigest()
    if got != h:
        sys.exit(f"checksum mismatch for {f}: {got}")

comp = pd.read_csv(META / "competitions.csv")
meta = pd.read_csv(META / "matches.csv")
ipl_comp = comp[comp.comp_name.str.match(r"^IPL \d{4}$")].copy()
ipl_comp["season"] = ipl_comp.season.astype(int)
off = meta.merge(ipl_comp[["comp_id", "season"]], on="comp_id")
ours = pd.read_csv(ROOT / "data" / "work" / "matches_ipl.csv")

rows = []
def check(name, ok, detail):
    rows.append({"check": name, "status": "Pass" if ok else "Differs", "detail": detail})

# 1. competitions: exactly one IPL competition per season 2022-2026
check("One IPL competition per season 2022-2026",
      sorted(ipl_comp.season) == [2022, 2023, 2024, 2025, 2026],
      "comp_ids " + ", ".join(f"{r.season}:{r.comp_id}" for r in ipl_comp.sort_values("season").itertuples()))

# 2. every match in our table is an official IPL match of the same season
m = ours[["match_id", "season", "match_date", "winner_id", "is_playoff", "super_over",
          "suspected_reduced_overs_dls", "suspected_no_result_or_abandoned"]].merge(
    off[["match_id", "season", "match_date", "stage", "win_team_id", "result", "venue_id",
         "first_inn_revised_overs", "second_inn_revised_overs", "revised_target"]],
    on="match_id", how="outer", suffixes=("", "_off"), indicator=True)
only_ours = m[m._merge == "left_only"]
only_off = m[m._merge == "right_only"]
check("Every match in our IPL table is in the official IPL list", len(only_ours) == 0,
      f"{len(only_ours)} of {len(ours)} not found")
both = m[m._merge == "both"].copy()
check("Season agrees", (both.season == both.season_off).all(), f"{(both.season != both.season_off).sum()} differ")
check("Date agrees", (both.match_date == both.match_date_off).all(), f"{(both.match_date != both.match_date_off).sum()} differ")

# 3. official matches missing from ours must be ones with no ball data (abandoned without a ball)
abandoned_words = only_off.result.fillna("").str.contains("Abandon", case=False)
check("Official matches absent from the ball data are all 'Match Abandoned'", abandoned_words.all(),
      f"{len(only_off)} absent: " + "; ".join(f"{r.match_id} ({r.season_off:.0f}, {r.result})" for r in only_off.itertuples()))

# 4. winners
w_ours = both.winner_id.fillna(-1).astype(int)
w_off = both.win_team_id.fillna(-1).astype(int)
nores = both.result.fillna("").str.contains("No Result|Abandon", case=False)
w_off = w_off.where(~nores, -1)
dif_w = both[(w_ours != w_off)]
check("Winner agrees (no result = no winner)", len(dif_w) == 0, f"{len(dif_w)} of {len(both)} differ")

# 5. playoffs
po_off = both.stage.ne("League")
dif_po = both[both.is_playoff.astype(bool) != po_off]
check("Playoff flag agrees with official stage", len(dif_po) == 0,
      f"{int(po_off.sum())} official playoff matches; {len(dif_po)} differ")

# 6. rain-reduced matches (official revised overs/target) vs our suspected-reduced flag
red_off = both[["first_inn_revised_overs", "second_inn_revised_overs", "revised_target"]].notna().any(axis=1)
red_ours = both.suspected_reduced_overs_dls.astype(bool)
dif_red = both[red_off != red_ours]
check("Reduced-overs (DLS) matches agree", len(dif_red) == 0,
      f"official {int(red_off.sum())}, ours {int(red_ours.sum())}; {len(dif_red)} differ")

# 7. no-result matches
nr_ours = both.suspected_no_result_or_abandoned.astype(bool)
dif_nr = both[nores != nr_ours]
check("No-result matches agree", len(dif_nr) == 0, f"official {int(nores.sum())}, ours {int(nr_ours.sum())}; {len(dif_nr)} differ")

# 8. super overs
so_off = both.result.fillna("").str.contains("Super Over|Super over|Tied", case=True)
dif_so = both[so_off != both.super_over.astype(bool)]
check("Super-over matches agree", len(dif_so) == 0, f"official {int(so_off.sum())}, ours {int(both.super_over.astype(bool).sum())}; {len(dif_so)} differ")

# 9. venues: official file gives a venue id (no names); report coverage only (not used: see D38)
check("Venue id present for every match (ids only, no names)", both.venue_id.notna().all(),
      f"{both.venue_id.nunique()} distinct venue ids, all in {', '.join(off.venue_country.dropna().unique())}")

out = pd.DataFrame(rows)
out.to_csv(TABLES / "step0_official_meta_check.csv", index=False)
mis = []
for label, d in [("winner", dif_w), ("playoff", dif_po), ("reduced_overs", dif_red), ("no_result", dif_nr),
                 ("super_over", dif_so), ("only_in_ours", only_ours), ("only_official", only_off)]:
    for r in d.itertuples():
        mis.append({"type": label, "match_id": r.match_id, "season": r.season if pd.notna(r.season) else r.season_off,
                    "official_result": r.result, "official_stage": r.stage})
pd.DataFrame(mis, columns=["type", "match_id", "season", "official_result", "official_stage"]).to_csv(
    TABLES / "step0_official_meta_mismatches.csv", index=False)
print(out.to_string(index=False))
print(f"{len(mis)} mismatch rows -> outputs/tables/step0_official_meta_mismatches.csv")
