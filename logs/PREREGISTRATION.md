# PRE-REGISTRATION: Clutch Reliability Score (D5, D6, D16)

**Status: DRAFT. Written 2026-11-17, before any player-level performance metric, ranking or backtest result was computed.**

This becomes FROZEN at gate P, after Step 2. At that point only sample-size pass counts may be added, and the file's sha256 is logged in DECISIONS.md. After the freeze, nothing below changes because of results. Any later change must be logged as a deviation, with its reason, and its effect reported both ways.

## 1. Data and scope
- **Matches:** IPL only. Super overs are excluded from all metrics.
- **Seasons:** scored seasons are 2023–2026. 2022 is for training only (D10).
- **Pressure:** every per-ball value (win probability, leverage, expected runs, opposition strength, the pressure scale) uses information from before that ball's match only (D4, D11, D18).
- **Players in scope:** players who appeared in IPL 2025 or IPL 2026 (Step 3 default). Retired or inactive players are not scored.
- **Roles:** a role is assigned from usage in 2023–2026.
  - **Batter:** at least 100 High-pressure balls faced.
  - **Bowler:** at least 60 High-pressure legal balls bowled.
  - **All-rounder:** passes both thresholds.
  - Players below a threshold are listed "Not scorable on IPL data (sample)" with their counts (D3).

## 2. Pressure buckets (Step 1B, D18)
- The 0–100 Pressure Index is the percentile of a ball's raw pressure against an earlier-season reference distribution. **High is 80 or more** (the top 20% of the earlier reference), **Medium is 50–80** and **Low is below 50**.
- **Main index:** leverage × (1 + context boosts), where the boosts pass the double-counting rule in Step 1B. **There is no close-game boost** (D8).

## 3. Metric list (frozen at gate P)
All of these are computed on High-pressure balls unless stated otherwise.

**Batters:**
- strike rate
- average
- balls per dismissal
- boundary %
- dot %
- Runs Above Expected (RAE) per 100 balls
- WPA per 100 balls
- pressure drop: RAE per 100 in High minus Low
- RAE vs pace and vs spin
- death-overs RAE per 100
- chasing vs setting RAE per 100

**Bowlers:**
- economy
- balls per wicket
- dot %
- boundary % conceded
- death economy
- Runs Saved vs Expected (RSE) per 100 balls
- WPA per 100 balls
- pressure drop: RSE per 100 in High minus Low
- RSE vs left-handed and vs right-handed batters

These metrics are descriptive. Only the components in section 4 enter the score.

## 4. Score components and weights (frozen; not tuned on any backtest season, D6)

| Component | Batters | Bowlers | Weight | Why |
|---|---|---|---|---|
| S: Skill under pressure | RAE per ball, High | RSE per ball, High | **0.40** | The fairest like-for-like measure (Step 2) |
| I: Match impact under pressure | WPA per ball, High (batting) | WPA per ball, High (bowling; sign: good for the bowling side) | **0.25** | Counts wickets and timing, which runs alone miss |
| H: Holds up | −(RAE per ball Low − RAE per ball High) | −(RSE per ball Low − RSE per ball High) | **0.15** | Penalises players who drop off under pressure |
| C: Consistency | share of seasons (with ≥ 30 High balls) where RAE/RSE per ball in High > 0 | same | **0.20** | "Reliable" means repeatable |

**How each component is prepared:**
- **Shrinkage:** S, I and H are Empirical-Bayes shrunk per player. The posterior mean is (n·x̄ + k·μ) / (n + k), where n is the recency-weighted number of High balls, μ is the mean among scorable players in the role, and k = σ²_within / σ²_between. The variances are estimated from the scorable players by the method of moments, and k is floored at 30 balls.
- **Consistency:** C is shrunk as a beta-binomial toward the role mean, with a prior strength of 2 seasons.
- **Recency weights** by season: 2026 = 1.00, 2025 = 0.75, 2024 = 0.56, 2023 = 0.42 (decay 0.75 a season).

**The score:**
- Z = Σ w·z(component). Each z is standardised among scorable players of the role.
- **Clutch Reliability Score = 100·Φ(Z / sd(Z))**, which is roughly a percentile within the role.
- **All-rounders:** the score is 0.5 × batting score + 0.5 × bowling score. Combined impact = batting WPA + bowling WPA, as totals per match, weighted equally.
- **80% interval:** resample the player's matches (1,000 bootstrap draws, seed 2027), recompute S, I, H and C, then take the 10th–90th percentile of the score.
- "Too close to call" applies when two players' 80% intervals overlap.

## 5. Sensitivity
Change each weight by ±10% (renormalised so the weights sum to 1). Report the top-10 overlap % with the main ranking, for batters and bowlers separately.

Also report the player top-20 overlap across the three pressure definitions (main, leverage-only, rule-based), computed with this frozen score (D25). Report the with-close-game-boost comparison too, kept separate (D8).

## 6. Backtest protocol (D6, D16): run only after this file is frozen
- **Folds:** N = 2024, 2025, 2026.
- **History used for each fold:** the score is built from seasons 2023..N-1 only. The win-probability models, benchmarks, shrinkage priors and z-standardisation are all fitted on seasons up to N-1.
- **Weights:** exactly as in section 4.
- **Fold entry:** at least 60 High balls faced (batters) or 40 High legal balls (bowlers) in the history window.
- **Outcome in season N:** RAE per ball in High (batters) or RSE per ball in High (bowlers), with at least 30 High balls in season N. "Above average" means above the mean of that metric across all players' High balls in season N.
- **Hit rate:** the share of the fold's top 10 who are above average in N. It is reported two ways: excluding players who couldn't be assessed, and counting them as misses.
- **Naive baseline:** the top 10 by overall strike rate (batters) or overall economy (bowlers), over the same window and with the same entry filter.
- **Also reported:**
  - the Spearman correlation between score and outcome among assessable players, per fold and pooled;
  - a bootstrap 80% interval for the hit-rate difference (score minus baseline), resampling players.
- **Pass criterion:** none is needed to publish. The result is reported honestly whatever it is (D15). Claims are worded by evidence:
  - "Historical indicator; evidence of persistence" only if the pooled score hit rate is above the baseline, **and** the 80% interval of the difference is above 0.
  - Otherwise: "historical indicator; persistence not demonstrated".
