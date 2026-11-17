"""Step 1A: win-probability models, chronological and out of sample (D4, D10, D13, D14, D18, D19).

Inputs : data/work/balls_ipl.parquet, data/work/matches_ipl.csv (Step 0), data/work/wp_eligibility.csv (Step 0 gate)
Outputs: data/work/wp_models.pkl              {season: WPModel trained on seasons < season}, plus 2022 reference models
         data/work/wp_ball.parquet            wp_before for every live ball of eligible matches (2023-26 main; 2022 reference)
         data/work/par_by_match.csv           prior-only season scoring level (par) used for each match
         outputs/tables/step1a_wp_eval.csv    Brier / log loss per season & innings, with match-bootstrap 80% intervals
         outputs/tables/step1a_calibration.csv  calibration bins per season with match-bootstrap 80% intervals
         outputs/tables/step1a_coefficients.csv
         outputs/tables/step1a_gbm_comparison.csv  (comparison only; switching rule D19)
Run: python3 -I src/step1a_winprob.py
"""
import pickle, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from loaders import load_balls
from config import SEED, WORK, TABLES
import wp_model as W

PAR_K = 10            # prior strength (matches) of previous season's mean in the in-season par blend (D11)
REF2022_MIN_PRIOR = 20  # D18: a 2022 match is scored for the reference only if >= 20 eligible earlier 2022 matches exist
rng = np.random.default_rng(SEED)

balls = load_balls()
matches = pd.read_csv(WORK / "matches_ipl.csv")
elig = pd.read_csv(WORK / "wp_eligibility.csv")          # match_id, wp_eligible, label_y_batting_first, reason
matches = matches.merge(elig, on="match_id", how="left", validate="1:1")
matches["first_ball_ts"] = matches.match_date + " " + matches.first_ball_recorded   # orders matches within a season

# ------------------------------------------------------------------ par (prior-only season scoring level)
m = matches.sort_values(["season", "first_ball_ts", "match_id"]).reset_index(drop=True)
m["inn1_complete"] = ((m.inns1_legal_balls >= 120) | (m.inns1_wickets >= 10)) & ~m.suspected_reduced_overs_dls.astype(bool) & m.wp_eligible.astype(bool)
pars = []
for s, g in m.groupby("season", sort=True):
    prev = m[(m.season == s - 1) & m.inn1_complete]["inns1_runs"]
    prev_mean = prev.mean() if len(prev) else np.nan
    done = []
    for r in g.itertuples():
        cur = np.array(done, dtype=float)
        if np.isnan(prev_mean):                       # 2022: no earlier season -> earlier 2022 matches only
            par = cur.mean() if len(cur) >= 5 else np.nan
            src = f"earlier {len(cur)} matches of {s}" if len(cur) >= 5 else "undefined (<5 earlier matches, no prior season)"
        else:
            par = (cur.sum() + PAR_K * prev_mean) / (len(cur) + PAR_K)
            src = f"blend: {len(cur)} earlier {s} matches + prior {s-1} mean (k={PAR_K})"
        pars.append(dict(match_id=r.match_id, season=s, par=par, par_source=src))
        if r.inn1_complete:
            done.append(r.inns1_runs)
par = pd.DataFrame(pars)
par.to_csv(WORK / "par_by_match.csv", index=False)

# ------------------------------------------------------------------ states for every main-innings ball
b = balls[(~balls.is_super_over) & balls.innings.astype(int).isin([1, 2])].copy()
b = b.merge(matches[["match_id", "wp_eligible", "label_y_batting_first", "batting_first_id", "first_ball_ts"]], on="match_id")
b = b.merge(par[["match_id", "par"]], on="match_id")
b["state_innings"] = b.innings.astype(int)
st = pd.DataFrame({"innings": b.state_innings, "runs": b.team_runs_before, "wkts": b.wickets_before,
                   "balls_left": 120 - b.legal_balls_before, "target": b.target.fillna(0), "par": b.par})
bf = b.batting_team_id.astype(str) == b.batting_first_id.astype(str)
b["y"] = np.where(b.label_y_batting_first == 0.5, 0.5, np.where(bf, b.label_y_batting_first, 1 - b.label_y_batting_first))
for c in st.columns:
    b["st_" + c] = st[c].values
STATE = lambda df: df[[c for c in df.columns if c.startswith("st_")]].rename(columns=lambda c: c[3:])

usable = b.wp_eligible.astype(bool) & b.par.notna()
models, preds, evals, cals, coefs, gbm_rows = {}, [], [], [], [], []


def brier_ci(df):
    """ball-level Brier with match-bootstrap 80% interval (1,000 resamples of matches)."""
    g = df.groupby("match_id").apply(lambda x: pd.Series({"se": ((x.p - x.y) ** 2).sum(), "n": len(x),
                                                            "ll": -(x.y * np.log(np.clip(x.p, 1e-6, 1)) + (1 - x.y) * np.log(np.clip(1 - x.p, 1e-6, 1))).sum()}),
                                     include_groups=False)
    se, n, ll = g.se.values, g.n.values, g.ll.values
    idx = rng.integers(0, len(g), size=(1000, len(g)))
    bs = se[idx].sum(1) / n[idx].sum(1)
    return se.sum() / n.sum(), np.percentile(bs, 10), np.percentile(bs, 90), ll.sum() / n.sum(), len(g), int(n.sum())


for s in [2023, 2024, 2025, 2026]:
    train = b[usable & (b.season < s)]
    mdl = W.fit(STATE(train).assign(y=train.y.values), label=f"trained_on_<{s}")
    models[s] = mdl
    coefs.append(W.coefficients(mdl).assign(scores_season=s))
    test = b[usable & (b.season == s)].copy()
    test["p"] = mdl.predict(STATE(test))
    preds.append(test[["match_id", "innings", "innings_ball_num", "season"]].assign(wp_before=test.p.values, wp_model=f"lr_<{s}", reference_only=False))
    live = test[(test.st_balls_left > 0) & (test.st_wkts < 10)]
    for inn, part in [("all", live), ("1", live[live.st_innings == 1]), ("2", live[live.st_innings == 2])]:
        br, lo, hi, ll, nm, nb = brier_ci(part)
        evals.append(dict(season=s, innings=inn, train_matches=train.match_id.nunique(), train_seasons=f"2022-{s-1}",
                          test_matches=nm, test_balls=nb, brier=br, brier_lo80=lo, brier_hi80=hi, log_loss=ll,
                          coin_flip_brier=0.25, base_rate_brier_oracle=float(((part.y - part.y.mean()) ** 2).mean())))
    # calibration (10 equal-width bins) with match-bootstrap intervals
    live = live.assign(bin=np.clip((live.p * 10).astype(int), 0, 9))
    mids = live.match_id.unique()
    boot = []
    for _ in range(300):
        pick = rng.choice(mids, size=len(mids), replace=True)
        cnt = pd.Series(pick).value_counts()
        w = live.match_id.map(cnt).fillna(0)
        boot.append(live.assign(w=w).groupby("bin").apply(lambda x: np.average(x.y, weights=x.w) if x.w.sum() > 0 else np.nan, include_groups=False))
    boot = pd.concat(boot, axis=1)
    agg = live.groupby("bin").agg(pred_mean=("p", "mean"), obs_rate=("y", "mean"), balls=("p", "size"), matches=("match_id", "nunique"))
    agg["obs_lo80"] = boot.quantile(0.10, axis=1); agg["obs_hi80"] = boot.quantile(0.90, axis=1)
    cals.append(agg.reset_index().assign(season=s))
    # GBM comparison (D19): reported only; switch from season s only if GBM beat LR on all earlier folds
    for inn, cols in ((1, W.INN1_FEATURES), (2, W.INN2_FEATURES)):
        tr = train[(train.st_innings == inn) & (train.st_balls_left > 0) & (train.st_wkts < 10)]
        if inn == 2:
            tr = tr[tr.st_target - tr.st_runs > 0]
        tr = tr[tr.y != 0.5]
        te = live[live.st_innings == inn]
        g = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.05, max_leaf_nodes=15, random_state=SEED)
        g.fit(W.features(STATE(tr))[cols], tr.y.astype(int))
        pg = g.predict_proba(W.features(STATE(te))[cols])[:, 1]
        gbm_rows.append(dict(season=s, innings=inn, brier_lr=float(((te.p - te.y) ** 2).mean()),
                             brier_gbm=float(((pg - te.y) ** 2).mean()), test_balls=len(te)))

gbm = pd.DataFrame(gbm_rows)
fold = gbm.groupby("season").apply(lambda x: (x.brier_gbm * x.test_balls).sum() / x.test_balls.sum() < (x.brier_lr * x.test_balls).sum() / x.test_balls.sum(), include_groups=False)
gbm["gbm_better_this_fold"] = gbm.season.map(fold)
gbm["switch_allowed_from_this_season"] = gbm.season.map(lambda s: bool(len([x for x in fold.index if x < s]) and all(fold[x] for x in fold.index if x < s)))
gbm.to_csv(TABLES / "step1a_gbm_comparison.csv", index=False)

# ------------------------------------------------------------------ 2022 reference scores (D18): expanding window within 2022
m22 = matches[(matches.season == 2022)].sort_values(["first_ball_ts", "match_id"])
elig22 = [x for x in m22.match_id if bool(m22.set_index("match_id").wp_eligible[x])]
ref_cov = []
for j, mid in enumerate(m22.match_id):
    prior = [x for x in m22.match_id[:j] if x in elig22]
    test = b[(b.match_id == mid) & b.par.notna()]
    if len(prior) < REF2022_MIN_PRIOR or not bool(m22.set_index("match_id").wp_eligible[mid]) or test.empty:
        ref_cov.append(dict(match_id=mid, scored=False, prior_matches=len(prior)))
        continue
    tr = b[b.match_id.isin(prior) & b.par.notna()]
    mdl = W.fit(STATE(tr).assign(y=tr.y.values), label=f"ref2022_before_{mid}")
    models[("ref2022", int(mid))] = mdl
    p = mdl.predict(STATE(test))
    preds.append(test[["match_id", "innings", "innings_ball_num", "season"]].assign(wp_before=p, wp_model=f"ref2022_before_{mid}", reference_only=True))
    ref_cov.append(dict(match_id=mid, scored=True, prior_matches=len(prior)))
ref_cov = pd.DataFrame(ref_cov)
ref_cov.to_csv(TABLES / "step1a_ref2022_coverage.csv", index=False)

wp = pd.concat(preds, ignore_index=True)
wp.to_parquet(WORK / "wp_ball.parquet", index=False)
with open(WORK / "wp_models.pkl", "wb") as fh:
    pickle.dump(models, fh)
pd.DataFrame(evals).to_csv(TABLES / "step1a_wp_eval.csv", index=False)
pd.concat(cals).to_csv(TABLES / "step1a_calibration.csv", index=False)
pd.concat(coefs).to_csv(TABLES / "step1a_coefficients.csv", index=False)
print(pd.DataFrame(evals).round(4).to_string())
print(gbm.round(4).to_string())
print("2022 reference coverage:", int(ref_cov.scored.sum()), "of", len(ref_cov), "matches scored")
print("wp rows:", len(wp), "| main:", int((~wp.reference_only).sum()), "| reference:", int(wp.reference_only.sum()))
