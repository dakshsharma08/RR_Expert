"""Win-probability model: simple logistic regression (D13), one per innings, fitted on earlier matches only (D4).

A *state* is the situation before a ball (or after a hypothetical outcome). It is a DataFrame with:
  innings (1/2), runs (team score), wkts (wickets fallen), balls_left (legal balls left of 120),
  target (innings 2 only), par (season scoring level: prior-only mean first-innings total).
P(batting side wins) is returned. Deterministic end states are handled exactly:
  - innings 2: runs >= target -> 1; out of balls or wickets with runs == target-1 -> 0.5 (tie); otherwise 0.
  - innings 1 at its end (no balls or no wickets left) -> 1 - P_chase(start of innings 2, target = runs + 1).
"""
from dataclasses import dataclass
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

INN1_FEATURES = ["runs_vs_par", "balls_left", "wkts_in_hand", "wk_x_balls"]   # D26: separate par feature removed
INN2_FEATURES = ["runs_needed", "balls_left", "wkts_in_hand", "req_rate", "wk_x_balls", "log_needed"]


def features(state: pd.DataFrame) -> pd.DataFrame:
    f = pd.DataFrame(index=state.index)
    bl = state["balls_left"].astype(float)
    wih = 10.0 - state["wkts"].astype(float)
    f["balls_left"] = bl
    f["wkts_in_hand"] = wih
    f["wk_x_balls"] = wih * bl / 120.0
    f["par"] = state["par"].astype(float)
    # innings 1: score relative to a straight-line par path (par * balls bowled / 120)
    f["runs_vs_par"] = state["runs"].astype(float) - state["par"].astype(float) * (120.0 - bl) / 120.0
    # innings 2
    need = (state["target"].astype(float) - state["runs"].astype(float)).clip(lower=0)
    f["runs_needed"] = need
    f["req_rate"] = (need * 6.0 / bl.clip(lower=1)).clip(upper=36.0)
    f["log_needed"] = np.log1p(need)
    return f


@dataclass
class WPModel:
    inn1: tuple   # (scaler, lr)
    inn2: tuple
    trained_on: str

    def _p(self, part, X):
        sc, lr = part
        return lr.predict_proba(sc.transform(np.asarray(X, dtype=float)))[:, 1]

    def predict(self, state: pd.DataFrame) -> np.ndarray:
        state = state.reset_index(drop=True)
        out = np.full(len(state), np.nan)
        f = features(state)
        inn = state["innings"].astype(int).values
        bl = state["balls_left"].values
        wk = state["wkts"].values
        # ---- innings 2
        i2 = inn == 2
        need = (state["target"] - state["runs"]).values
        won = i2 & (need <= 0)
        ended = i2 & ~won & ((bl <= 0) | (wk >= 10))
        out[won] = 1.0
        out[ended] = np.where(need[ended] == 1, 0.5, 0.0)
        live2 = i2 & ~won & ~ended
        if live2.any():
            out[live2] = self._p(self.inn2, f.loc[live2, INN2_FEATURES])
        # ---- innings 1
        i1 = inn == 1
        end1 = i1 & ((bl <= 0) | (wk >= 10))
        live1 = i1 & ~end1
        if live1.any():
            out[live1] = self._p(self.inn1, f.loc[live1, INN1_FEATURES])
        if end1.any():
            s2 = pd.DataFrame({"innings": 2, "runs": 0, "wkts": 0, "balls_left": 120,
                               "target": state.loc[end1, "runs"].values + 1, "par": state.loc[end1, "par"].values})
            out[end1] = 1.0 - self.predict(s2)
        return out


def _fit_part(X, y, w):
    sc = StandardScaler().fit(X)
    lr = LogisticRegression(C=1.0, max_iter=2000).fit(sc.transform(X), y, sample_weight=w)
    return sc, lr


def fit(train: pd.DataFrame, label: str = "trained") -> WPModel:
    """train: one row per (live) ball state with columns of a state + 'y' (1 win, 0 loss, 0.5 tie).
    A tie is entered as two half-weight rows (one win, one loss)."""
    parts = {}
    for inn, cols in ((1, INN1_FEATURES), (2, INN2_FEATURES)):
        t = train[train["innings"].astype(int) == inn]
        if inn == 2:
            t = t[(t["target"] - t["runs"] > 0) & (t["balls_left"] > 0) & (t["wkts"] < 10)]
        else:
            t = t[(t["balls_left"] > 0) & (t["wkts"] < 10)]
        f = features(t)[cols]
        y = t["y"].values
        tie = y == 0.5
        X = pd.concat([f[~tie], f[tie], f[tie]])
        yy = np.concatenate([y[~tie], np.ones(tie.sum()), np.zeros(tie.sum())]).astype(int)
        ww = np.concatenate([np.ones((~tie).sum()), np.full(tie.sum(), 0.5), np.full(tie.sum(), 0.5)])
        parts[inn] = _fit_part(X.values, yy, ww)
    return WPModel(parts[1], parts[2], label)


def coefficients(m: WPModel) -> pd.DataFrame:
    rows = []
    for inn, cols, part in ((1, INN1_FEATURES, m.inn1), (2, INN2_FEATURES, m.inn2)):
        sc, lr = part
        for c, b, mu, sd in zip(cols, lr.coef_[0], sc.mean_, sc.scale_):
            rows.append(dict(model=m.trained_on, innings=inn, feature=c, coef_std=b, mean=mu, sd=sd))
        rows.append(dict(model=m.trained_on, innings=inn, feature="intercept", coef_std=lr.intercept_[0], mean=np.nan, sd=np.nan))
    return pd.DataFrame(rows)
