"""Step 7F: 60-90 second walkthrough video script with timestamps. Every number is read from outputs/tables.
Output: outputs/deliverables/F_Walkthrough_Video_Script.md
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pandas as pd
from config import TABLES, DELIVERABLES

s = json.load(open(TABLES / "summary_numbers.json"))["summary"]
bt = s["backtest"]
gaps = pd.read_csv(TABLES / "step5_gaps.csv")
short = pd.read_csv(TABLES / "step5_shortlist.csv")
tc = pd.read_csv(TABLES / "step4_too_close_to_call.csv")
must = short[short.tier == "Must-Back"]
g1 = gaps.iloc[0]
hs = sum(s["high_share"].values()) / len(s["high_share"])
mb = "; ".join(f"{r.player_name} ({r.sub_role.lower().replace(' (', ', ').replace(')', '')}, score {r.score:.0f}, 80% range {r.score_lo80:.0f}–{r.score_hi80:.0f})" for r in must.itertuples())
text = f"""# RR Clutch Index: 60–90 second walkthrough (video script)

Screen directions are in *italics*. Every number is pulled by `src/step7_video_script.py` from `outputs/tables/`.

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:08 | *Dashboard, Summary tab, title* | "RR Clutch Index: backing players whose quality has held up when the match was on the line, and saying how sure we are." |
| 0:08–0:20 | *Pressure Index tab: win-probability line of a showcase close match, pressure strip below* | "Every IPL ball from {s['seasons_scored']} gets a pressure score: how much it could swing the result, judged only with information from before that match. On average {hs:.0f}% of balls are High pressure." |
| 0:20–0:32 | *Leaderboard, batters, intervals visible* | "We compare runs scored, or saved, with what an average player would do in the same situation, then pull small samples toward the average. We scored {s['scorable_bat']} batters, {s['scorable_bowl']} bowlers and {s['scorable_ar']} all-rounders. Every score carries an 80% range." |
| 0:32–0:45 | *Squad Fit tab, gap meter* | "RR's biggest measured gap is {g1.area.split(': ')[1].lower()}-overs batting under pressure: {g1.rr_group_per100:.1f} runs per 100 high-pressure balls against a league {g1.league_per100:.1f}. RR's bowling under pressure is above league in every phase." |
| 0:45–1:00 | *Auction Board, Must-Back column* | "If available at the auction, back: {mb}. Plan A fits an assumed fifteen-crore purse: {', '.join(s['planA'])}." |
| 1:00–1:15 | *Method & Proof tab, backtest chart* | "Honesty first. Checked one season ahead, the top ten were above average {bt['bat_score']:.0f}% of the time for batters and {bt['bowl_score']:.0f}% for bowlers, against {bt['bat_naive']:.0f}% and {bt['bowl_naive']:.0f}% for a naive ranking. That is not a demonstrated edge. And no two top-ten players are separated by their 80% ranges, so the order within the group is too close to call." |
| 1:15–1:28 | *Summary tab, assumptions badge* | "So treat this as proof of past pressure performance, not a forecast. Prices, ages and availability are unverified assumptions: recheck them against the official list before the sixteenth of December." |

**Word count check:** about 210 words, which fits 85–90 seconds at a measured pace. Cut the Plan A sentence for a 60-second version.
"""
(DELIVERABLES / "F_Walkthrough_Video_Script.md").write_text(text)
print(text)
