"""Step 7F: 60-90 second walkthrough video script with timestamps. Every number is read from outputs/tables.
Round 1 brief (D38): the top 10 batters and top 10 bowlers under pressure, and the method. No auction advice.
Output: outputs/deliverables/F_Walkthrough_Video_Script.md
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import TABLES, DELIVERABLES

j = json.load(open(TABLES / "summary_numbers.json"))
s, t10 = j["summary"], j["top10"]
bt = s["backtest"]
hs = sum(s["high_share"].values()) / len(s["high_share"])
b1, w1 = t10["bat"][0], t10["bowl"][0]
bat3 = ", ".join(x["name"] for x in t10["bat"][:3])
bowl3 = ", ".join(x["name"] for x in t10["bowl"][:3])
eb, ew = t10["edge"]["bat"], t10["edge"]["bowl"]
text = f"""# RR Clutch Index: 60–90 second walkthrough (video script)

Screen directions are in *italics*. Every number is pulled by `src/step7_video_script.py` from `outputs/tables/`.

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:08 | *Dashboard, Summary tab: the two top-10 lists* | "Who performs best when the match is on the line? Here are our top ten batters and top ten bowlers under pressure, from IPL {s['seasons_scored']}." |
| 0:08–0:22 | *Pressure Index tab: win-probability line of a close match, pressure strip below* | "We define pressure ball by ball. A win-probability model, trained only on earlier seasons, tells us how much each ball could swing the result. Chases, being below par, the death overs, playoffs and collapses add a little more. About {hs:.0f}% of balls count as High pressure." |
| 0:22–0:36 | *Method & Proof tab: the four components* | "On those balls we compare each player with an average player in exactly the same situation: runs above or saved, win probability added, how well he holds up against his own low-pressure level, and consistency across seasons. Small samples are pulled toward average, and every score has an 80% range." |
| 0:36–0:50 | *Summary: top-10 batters card, then bowlers card* | "The batters are led by {bat3}; the bowlers by {bowl3}. {b1['name']} scores {b1['score']:.1f} and {w1['name']} {w1['score']:.1f} on the 0-to-100 scale within their role." |
| 0:50–1:05 | *Leaderboard with ranges visible* | "How sure are we? Inside each top ten the 80% ranges overlap, so treat each list as a group, not a strict order. Number eleven, {eb['next_name']} among batters and {ew['next_name']} among bowlers, is too close to call with number ten." |
| 1:05–1:20 | *Method & Proof: backtest chart* | "And honestly: checked one season ahead, the score did not beat a simple strike-rate or economy ranking: {bt['bat_score']:.0f}% against {bt['bat_naive']:.0f}% for batters, {bt['bowl_score']:.0f}% against {bt['bowl_naive']:.0f}% for bowlers. So this is a record of who delivered under pressure, which is exactly the question, not a forecast." |

**Word count check:** about 220 words, which fits 85–90 seconds at a measured pace. Cut the second sentence of the 0:22 line for a 60-second version.
"""
(DELIVERABLES / "F_Walkthrough_Video_Script.md").write_text(text)
print(text)
