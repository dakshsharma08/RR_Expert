"""Step 0 gate finalisation (supervisor): win-probability eligibility and labels, cross-checks with the facts.

Output: data/work/wp_eligibility.csv: match_id, wp_eligible, label_y_batting_first (1 / 0 / 0.5 tie), reason
Rule: eligible = the Data Auditor's wp_eligible_provisional (normal derived result or super-over tie) AND not
reported as no-result / abandoned / DLS / reduced-overs by the Facts Researcher (all such reports are already
inside the auditor's ineligible set; asserted below).
Run: python3 -I src/step0_finalize.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import pandas as pd
from config import WORK, FACTS_WORK

m = pd.read_csv(WORK / "matches_ipl.csv")
facts = pd.read_csv(FACTS_WORK / "results_verification.csv").dropna(subset=["match_id"])
facts["match_id"] = facts.match_id.astype(int)
bad_cats = facts[facts.category.str.contains("NR|abandoned|DLS|reduced", case=False, regex=True)].match_id
inel = set(m.loc[~m.wp_eligible_provisional, "match_id"])
assert set(bad_cats) <= inel, f"facts-reported interrupted matches not flagged by data: {set(bad_cats) - inel}"
po_facts = set(facts[facts.category.str.contains("playoff", case=False)].match_id)
po_data = set(m.loc[m.is_playoff, "match_id"])
assert po_facts == po_data, f"playoff mismatch: facts-only {po_facts - po_data}, data-only {po_data - po_facts}"

lab = np.where(m.result_category == "TIE_DECIDED_BY_SUPER_OVER", 0.5,
               np.where(m.winner_id == m.batting_first_id, 1.0, np.where(m.winner_id == m.batting_second_id, 0.0, np.nan)))
out = pd.DataFrame({"match_id": m.match_id, "wp_eligible": m.wp_eligible_provisional.astype(bool),
                    "label_y_batting_first": lab,
                    "reason": np.where(m.wp_eligible_provisional, "normal result (or tie = 0.5)", m.wp_ineligible_reason)})
assert out.loc[out.wp_eligible, "label_y_batting_first"].notna().all()
out.to_csv(WORK / "wp_eligibility.csv", index=False)
print("eligible:", int(out.wp_eligible.sum()), "of", len(out), "| by season:",
      out.merge(m[["match_id", "season"]]).groupby("season").wp_eligible.sum().to_dict())
print("facts-reported interrupted matches all inside data-flagged set:", sorted(bad_cats))
print("playoff ids agree with facts:", sorted(po_data))
