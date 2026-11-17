"""Steps 3-4: player metrics, Clutch Reliability Score, intervals, sensitivity, robustness and backtest.

Implements the FROZEN logs/PREREGISTRATION.md (do not change weights or rules here without a logged deviation).
Outputs (outputs/tables/):
  step3_batting_metrics.csv, step3_bowling_metrics.csv     descriptive High/Low metrics + splits, with sample sizes
  step3_scope.csv                                          everyone in scope with role / scorable status and samples
  step4_scores_batters.csv, step4_scores_bowlers.csv, step4_scores_allrounders.csv
  step4_sensitivity.csv, step4_definition_robustness.csv, step4_close_game_comparison.csv
  step4_backtest_detail.csv, step4_backtest_summary.csv, step4_player_season.csv (season trend per player)
Run: python3 -I src/step34_score.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from config import SEED, TABLES
import player_agg as P

rng = np.random.default_rng(SEED)
MIN_HI_BAT, MIN_HI_BOWL = 100, 60          # pre-registered thresholds (High balls faced / High legal balls)
BT_MIN_BAT, BT_MIN_BOWL, BT_OUT_MIN = 60, 40, 30
SCORED = [2023, 2024, 2025, 2026]


def frames(bucket_col):
    b = P.load_ball_frames(bucket_col)
    b = b[b.season.isin(SCORED)]
    return b, P.bat_balls(b), P.bowl_balls(b)


def descriptive(rows, role):
    """High / Low descriptive metrics for one role."""
    out = []
    for (pid), g in rows.groupby("player_id"):
        rec = {"player_id": pid, "player_name": g.player_name.mode().iat[0]}
        for bk in ["High", "Low"]:
            x = g[g.bucket == bk]
            n = x.balls.sum()
            if role == "bat":
                outs = x.outs.sum()
                rec.update({f"{bk}_balls": n, f"{bk}_runs": x.runs.sum(), f"{bk}_outs": outs,
                            f"{bk}_sr": 100 * x.runs.sum() / n if n else np.nan,
                            f"{bk}_avg": x.runs.sum() / outs if outs else np.nan,
                            f"{bk}_balls_per_out": n / outs if outs else np.nan,
                            f"{bk}_boundary_pct": 100 * (x.fours.sum() + x.sixes.sum()) / n if n else np.nan,
                            f"{bk}_dot_pct": 100 * x.dots.sum() / n if n else np.nan,
                            f"{bk}_rae_per100": 100 * x.rae.sum() / n if n else np.nan,
                            f"{bk}_wpa_per100": 100 * x.wpa.sum() / n if n else np.nan, f"{bk}_wpa_total": x.wpa.sum()})
            else:
                lg = x.legal.sum(); w = x.wkts.sum()
                rec.update({f"{bk}_deliveries": n, f"{bk}_legal": lg, f"{bk}_runs": x.runs.sum(), f"{bk}_wkts": w,
                            f"{bk}_econ": 6 * x.runs.sum() / lg if lg else np.nan,
                            f"{bk}_balls_per_wkt": lg / w if w else np.nan,
                            f"{bk}_dot_pct": 100 * x.dots.sum() / lg if lg else np.nan,
                            f"{bk}_boundary_pct": 100 * x.bdry.sum() / n if n else np.nan,
                            f"{bk}_rse_per100": 100 * x.rae.sum() / n if n else np.nan,
                            f"{bk}_wpa_per100": 100 * x.wpa.sum() / n if n else np.nan, f"{bk}_wpa_total": x.wpa.sum()})
        hi = g[g.bucket == "High"]
        key = "rae_per100" if role == "bat" else "rse_per100"
        rec["pressure_drop_per100"] = rec[f"High_{key}"] - rec[f"Low_{key}"] if rec.get(f"Low_balls", rec.get("Low_deliveries", 0)) else np.nan
        for lab, val in (("pace", "Pace"), ("spin", "Spin")) if role == "bat" else (("vs_lhb", "LHB"), ("vs_rhb", "RHB")):
            s = hi[hi.vs == val]
            rec[f"High_{key}_{lab}"] = 100 * s.rae.sum() / s.balls.sum() if s.balls.sum() else np.nan
            rec[f"High_balls_{lab}"] = s.balls.sum()
        d = hi[hi.phase == "Death"]
        rec[f"High_{key}_death"] = 100 * d.rae.sum() / d.balls.sum() if d.balls.sum() else np.nan
        rec["High_balls_death"] = d.balls.sum()
        if role == "bowl":
            dd = g[g.phase == "Death"]
            rec["death_econ_all"] = 6 * dd.runs.sum() / dd.legal.sum() if dd.legal.sum() else np.nan
            rec["death_legal_all"] = dd.legal.sum()
        if role == "bat":
            for lab, inn in (("setting", 1), ("chasing", 2)):
                s = hi[hi.innings == inn]
                rec[f"High_rae_per100_{lab}"] = 100 * s.rae.sum() / s.balls.sum() if s.balls.sum() else np.nan
                rec[f"High_balls_{lab}"] = s.balls.sum()
        rec["seasons"] = ",".join(str(s) for s in sorted(g.season.unique()))
        out.append(rec)
    return pd.DataFrame(out)


def role_scores(rows, role, last_season, min_hi, weights=None, boot=True):
    """Fit the scorer on scorable players of this role (window = seasons present in rows)."""
    qual_col = "balls" if role == "bat" else "legal"
    hi_n = rows[rows.bucket == "High"].groupby("player_id")[qual_col].sum()
    scorable = hi_n[hi_n >= min_hi].index
    pm = P.player_match_table(rows[rows.player_id.isin(scorable)])
    sc = P.RoleScorer(pm, last_season, weights=weights)
    res = sc.comp.copy()
    if boot:
        res = res.join(sc.bootstrap(rng))
    res["hi_qual_n"] = hi_n.reindex(res.index)
    return res, sc


def topk(series, k=10, ascending=False):
    return set(series.sort_values(ascending=ascending).head(k).index)


if __name__ == "__main__":
    b, bat, bowl = frames("pi_bucket")
    names = pd.concat([bat[["player_id", "player_name"]], bowl[["player_id", "player_name"]]]).groupby("player_id").player_name.agg(lambda x: x.mode().iat[0])
    # ------------------------------------------------ scope: appeared in IPL 2025 or 2026
    all_b = P.load_ball_frames("pi_bucket")
    recent = set(all_b[all_b.season.isin([2025, 2026])][["striker_id", "non_striker_id", "bowler_id"]].astype(str).values.ravel())
    hi_bat = bat[bat.bucket == "High"].groupby("player_id").balls.sum()
    hi_bowl = bowl[bowl.bucket == "High"].groupby("player_id").legal.sum()
    scope = pd.DataFrame(index=sorted(recent))
    scope["player_name"] = names.reindex(scope.index)
    scope["hi_balls_faced"] = hi_bat.reindex(scope.index).fillna(0)
    scope["hi_legal_bowled"] = hi_bowl.reindex(scope.index).fillna(0)
    scope["bat_scorable"] = scope.hi_balls_faced >= MIN_HI_BAT
    scope["bowl_scorable"] = scope.hi_legal_bowled >= MIN_HI_BOWL
    scope["role"] = np.select([scope.bat_scorable & scope.bowl_scorable, scope.bat_scorable, scope.bowl_scorable],
                              ["All-rounder", "Batter", "Bowler"], "Not scorable on IPL data (sample)")
    scope.index.name = "player_id"
    scope.reset_index().to_csv(TABLES / "step3_scope.csv", index=False)

    bat_s, bowl_s = bat[bat.player_id.isin(scope.index)], bowl[bowl.player_id.isin(scope.index)]
    descriptive(bat_s, "bat").to_csv(TABLES / "step3_batting_metrics.csv", index=False)
    descriptive(bowl_s, "bowl").to_csv(TABLES / "step3_bowling_metrics.csv", index=False)

    # ------------------------------------------------ main scores (cut-off: end of IPL 2026, D20)
    sb, scb = role_scores(bat_s, "bat", 2026, MIN_HI_BAT)
    sw, scw = role_scores(bowl_s, "bowl", 2026, MIN_HI_BOWL)
    pd.DataFrame([dict(role=r, component=c, informative=sc.informative[c], prior_mean=sc.prior[c][0], prior_k=sc.prior[c][1],
                       weight=P.WEIGHTS[c], effective_weight=(P.WEIGHTS[c] if sc.informative[c] else 0.0) /
                       sum(P.WEIGHTS[x] for x in P.WEIGHTS if sc.informative[x]))
                  for r, sc in (("bat", scb), ("bowl", scw)) for c in P.WEIGHTS]).to_csv(TABLES / "step4_component_info.csv", index=False)
    for df in (sb, sw):
        df["player_name"] = names.reindex(df.index)
        df["rank"] = df.score.rank(ascending=False, method="min").astype(int)
    sb.sort_values("score", ascending=False).reset_index().to_csv(TABLES / "step4_scores_batters.csv", index=False)
    sw.sort_values("score", ascending=False).reset_index().to_csv(TABLES / "step4_scores_bowlers.csv", index=False)
    ar_ids = sb.index.intersection(sw.index)
    bw = bat_s.groupby("player_id").agg(bat_wpa=("wpa", "sum"), bat_matches=("match_id", "nunique"))
    ow = bowl_s.groupby("player_id").agg(bowl_wpa=("wpa", "sum"), bowl_matches=("match_id", "nunique"))
    ar = pd.DataFrame({"player_name": names.reindex(ar_ids), "bat_score": sb.score.reindex(ar_ids), "bowl_score": sw.score.reindex(ar_ids),
                       "bat_lo80": sb.score_lo80.reindex(ar_ids), "bat_hi80": sb.score_hi80.reindex(ar_ids),
                       "bowl_lo80": sw.score_lo80.reindex(ar_ids), "bowl_hi80": sw.score_hi80.reindex(ar_ids)})
    ar["score"] = 0.5 * ar.bat_score + 0.5 * ar.bowl_score
    ar["score_lo80"] = 0.5 * ar.bat_lo80 + 0.5 * ar.bowl_lo80   # conservative: average of the bounds
    ar["score_hi80"] = 0.5 * ar.bat_hi80 + 0.5 * ar.bowl_hi80
    ar = ar.join(bw).join(ow)
    ar["combined_wpa_per_match"] = (ar.bat_wpa + ar.bowl_wpa) / pd.concat([ar.bat_matches, ar.bowl_matches], axis=1).max(axis=1)
    ar.index.name = "player_id"
    ar.sort_values("score", ascending=False).reset_index().to_csv(TABLES / "step4_scores_allrounders.csv", index=False)

    # ------------------------------------------------ season trend per player (descriptive, High RAE/RSE per 100)
    trend = []
    for role, rows in (("bat", bat_s), ("bowl", bowl_s)):
        hi = rows[rows.bucket == "High"]
        t = hi.groupby(["player_id", "season"]).agg(balls=("balls", "sum"), rae=("rae", "sum"), wpa=("wpa", "sum")).reset_index()
        lg = hi.groupby("season").agg(lb=("balls", "sum"), lr=("rae", "sum")).reset_index()
        t = t.merge(lg, on="season")
        t["per100"] = 100 * t.rae / t.balls
        t["league_per100"] = 100 * t.lr / t.lb
        t["role"] = role
        trend.append(t.drop(columns=["lb", "lr"]))
    pd.concat(trend).to_csv(TABLES / "step4_player_season.csv", index=False)

    # ------------------------------------------------ sensitivity: each weight +-10%, renormalised
    sens = []
    for role, rows, base, mn in (("bat", bat_s, sb, MIN_HI_BAT), ("bowl", bowl_s, sw, MIN_HI_BOWL)):
        top = topk(base.score)
        for c in P.WEIGHTS:
            for d in (-0.10, 0.10):
                w = dict(P.WEIGHTS); w[c] *= (1 + d); tot = sum(w.values()); w = {k: v / tot for k, v in w.items()}
                alt, _ = role_scores(rows, role, 2026, mn, weights=w, boot=False)
                sens.append(dict(role=role, component=c, change=d, top10_overlap_pct=100 * len(top & topk(alt.score)) / 10))
    pd.DataFrame(sens).to_csv(TABLES / "step4_sensitivity.csv", index=False)

    # ------------------------------------------------ robustness across pressure definitions (D25) + close-game comparison (D8)
    rob = []
    variants = {"leverage_only": "pi_lev_bucket", "rule_based": "pi_rule_bucket", "with_close_game": "pi_close_bucket",
                "d18_strict_buckets": "pi_d18strict_bucket", "season_centred": "pi_bucket"}
    alt_scores = {}
    for vname, col in variants.items():
        _, vbat, vbowl = frames(col)
        if vname == "season_centred":   # comparison only: uses each season's league mean (later matches), never the main score
            for fr in (vbat, vbowl):
                mean_pb = fr.groupby("season").rae.sum() / fr.groupby("season").balls.sum()
                fr["rae"] = fr.rae - fr.balls * fr.season.map(mean_pb)
        vbat, vbowl = vbat[vbat.player_id.isin(scope.index)], vbowl[vbowl.player_id.isin(scope.index)]
        vb, _ = role_scores(vbat, "bat", 2026, MIN_HI_BAT, boot=False)
        vw, _ = role_scores(vbowl, "bowl", 2026, MIN_HI_BOWL, boot=False)
        alt_scores[vname] = (vb, vw)
        for role, base, alt in (("bat", sb, vb), ("bowl", sw, vw)):
            common = base.index.intersection(alt.index)
            rob.append(dict(variant=vname, role=role, scorable_main=len(base), scorable_variant=len(alt),
                            top20_overlap_pct=100 * len(topk(base.score, 20) & topk(alt.score, 20)) / 20,
                            spearman_common=float(spearmanr(base.score.reindex(common), alt.score.reindex(common)).correlation)))
    rb = pd.DataFrame(rob)
    rb.to_csv(TABLES / "step4_definition_robustness.csv", index=False)
    cg = []
    for role, base in (("bat", sb), ("bowl", sw)):
        alt = alt_scores["with_close_game"][0 if role == "bat" else 1]
        j = base[["score"]].join(alt[["score"]], rsuffix="_with_close_game", how="outer")
        j["player_name"] = names.reindex(j.index); j["role"] = role
        cg.append(j.reset_index())
    pd.concat(cg).to_csv(TABLES / "step4_close_game_comparison.csv", index=False)

    # ------------------------------------------------ backtest (D6, D16): history 2023..N-1 -> outcome in N
    det = []
    for N in (2024, 2025, 2026):
        hist = [s for s in SCORED if s < N]
        for role, rows_all, mn, base_col in (("bat", bat, BT_MIN_BAT, "sr"), ("bowl", bowl, BT_MIN_BOWL, "econ")):
            h = rows_all[rows_all.season.isin(hist)]
            res, _ = role_scores(h, role, max(hist), mn, boot=False)
            # naive baseline: overall SR (bat) / economy (bowl) over ALL balls in the history window, same entry filter
            if role == "bat":
                hb = h  # pressure-scored balls only include eligible matches; use same balls for fairness
                agg = hb.groupby("player_id").agg(r=("runs", "sum"), n=("balls", "sum"))
                naive = (100 * agg.r / agg.n).reindex(res.index)
                naive_top = topk(naive)
            else:
                agg = h.groupby("player_id").agg(r=("runs", "sum"), n=("legal", "sum"))
                naive = (6 * agg.r / agg.n).reindex(res.index)
                naive_top = topk(naive, ascending=True)
            # outcome in season N
            o = rows_all[(rows_all.season == N) & (rows_all.bucket == "High")]
            ostat = o.groupby("player_id").agg(n=("balls" if role == "bat" else "legal", "sum"), r=("rae", "sum"), d=("balls", "sum"))
            league = o.rae.sum() / o.balls.sum()
            ostat["per_ball"] = ostat.r / ostat.d
            ostat["assessable"] = ostat.n >= BT_OUT_MIN
            ostat["above_avg"] = ostat.per_ball > league
            score_top = topk(res.score)
            for pid in res.index:
                os_ = ostat.reindex([pid]).iloc[0] if pid in ostat.index else None
                det.append(dict(fold=N, role=role, player_id=pid, player_name=names.get(pid, pid), score=res.score[pid],
                                naive=naive.get(pid, np.nan), in_score_top10=pid in score_top, in_naive_top10=pid in naive_top,
                                assessable=bool(os_ is not None and os_.assessable),
                                outcome_per_ball=(os_.per_ball if os_ is not None else np.nan),
                                above_avg=bool(os_ is not None and os_.assessable and os_.above_avg),
                                league_per_ball=league))
    det = pd.DataFrame(det)
    det.to_csv(TABLES / "step4_backtest_detail.csv", index=False)
    summ = []
    for role in ("bat", "bowl"):
        for fold in [2024, 2025, 2026, "pooled"]:
            d = det[det.role == role] if fold == "pooled" else det[(det.role == role) & (det.fold == fold)]
            rec = dict(role=role, fold=fold, qualified=len(d))
            for which in ("score", "naive"):
                t = d[d[f"in_{which}_top10"]]
                a = t[t.assessable]
                rec[f"{which}_top10_assessable"] = len(a)
                rec[f"{which}_hit_rate_excl"] = 100 * a.above_avg.mean() if len(a) else np.nan
                rec[f"{which}_hit_rate_as_miss"] = 100 * t.above_avg.sum() / len(t) if len(t) else np.nan
            a = d[d.assessable]
            rec["spearman_score_outcome"] = float(spearmanr(a.score, a.outcome_per_ball).correlation) if len(a) > 5 else np.nan
            sgn = -1 if role == "bowl" else 1   # naive economy: lower is better
            rec["spearman_naive_outcome"] = float(spearmanr(sgn * a.naive, a.outcome_per_ball).correlation) if len(a) > 5 else np.nan
            rec["assessable_qualified"] = len(a)
            summ.append(rec)
    summ = pd.DataFrame(summ)
    # bootstrap 80% interval of pooled hit-rate difference (resample players within each fold, recompute top 10s)
    for role in ("bat", "bowl"):
        diffs = []
        d0 = det[det.role == role]
        for _ in range(1000):
            hs, hn = [], []
            for fold, d in d0.groupby("fold"):
                smp = d.sample(len(d), replace=True, random_state=int(rng.integers(1e9))).drop_duplicates("player_id")
                st = smp.nlargest(10, "score"); nt = smp.nsmallest(10, "naive") if role == "bowl" else smp.nlargest(10, "naive")
                hs += list(st[st.assessable].above_avg); hn += list(nt[nt.assessable].above_avg)
            if hs and hn:
                diffs.append(100 * (np.mean(hs) - np.mean(hn)))
        m = summ.index[(summ.role == role) & (summ.fold == "pooled")]
        summ.loc[m, "hit_diff_lo80"] = np.percentile(diffs, 10); summ.loc[m, "hit_diff_hi80"] = np.percentile(diffs, 90)
    summ.to_csv(TABLES / "step4_backtest_summary.csv", index=False)
    print(summ.round(2).to_string())
    print(rb.round(2).to_string())
    print(pd.DataFrame(sens).groupby("role").top10_overlap_pct.describe())
    print("scorable:", scope.role.value_counts().to_dict())
