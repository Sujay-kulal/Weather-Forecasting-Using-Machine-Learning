# Final Corrected Implementation Plan: Complete Machine Learning & Weather Forecasting Audit (Chat 2)

## 1. Executive Summary and Scope

This document defines the final, peer-review-grade implementation plan for the **Complete Machine Learning and Weather Forecasting Audit (Chat 2)** for the repository [Weather-Forecasting-Using-Machine-Learning](https://github.com/Sujay-kulal/Weather-Forecasting-Using-Machine-Learning).

The audit evaluates the production model artifact (`model/weather_model_v3.joblib`) and metadata (`model/model_info.json`), audits data ingestion, feature contracts, and temporal alignment, evaluates direct multi-output 7-day forecasting dynamics, calculates exact independent evaluation data requirements, expands regression test coverage, and compiles `ML_AUDIT_REPORT.md` on branch `audit/ml-forecasting`.

### Strict Planning Invariants
1. **Planning and Verification Only**: No Git branches have been created, no repository source code modified, no tests run, no database records altered, and no models retrained. Execution will occur strictly after user review and explicit approval via `/goal`.
2. **Read-Only Model Preservation**: `model/weather_model_v3.joblib` and `model/model_info.json` are strictly protected and immutable. They will never be retrained, refitted, overwritten, or modified.
3. **Dual Execution Modes**:
   - `--dry-run`: Enforces **limited application-level write suppression and workspace-change detection**. Output is streamed purely to stdout/console.
   - Default Diagnostic Mode: Writes evaluation summaries and state breakdowns exclusively to `audit/results/`. It never modifies `model/`.
4. **Recorded Cryptographic Checksums**:
   - `model/weather_model_v3.joblib`: `844fdadfbe2786d859cdfc55c2e7dc14eb0b2f420b339f3e877fa6856aa37adf` (Recorded claim).
   - `model/model_info.json`: `42e0b2b61307ca319436191302394e1e330fbb972e1e5d9afbc945d354e417b3` (Recorded claim).
5. **Zero Fabrication & Strict Scientific Honesty**: Training diagnostics are never equated with out-of-sample validation. Unverified metrics and provenance claims are explicitly labeled unverified until independently reproduced.

---

## 2. Evaluation Taxonomy & Temporal Maturity Classification

The audit enforces a strict separation between distinct evaluation regimes relative to the **current audit date of November 7, 2026 (`2026-11-07`)**:

```mermaid
flowchart TD
    subgraph Diagnostics ["1. Pre-Cutoff / Training-Overlap Diagnostics"]
        D1["Data: Observations <= 2026-10-22"]
        D2["Model: Deployed weather_model_v3.joblib"]
        D3["Status: 11,946 rows (99.18%) in-sample origins; 99 rows (0.82%) post-origin with target overlap"]
        D4["Purpose: Implementation sanity check, in-sample fit, pipeline check"]
        D5["Scientific Caveat: Zero out-of-sample generalization validity"]
    end

    subgraph Retrospective ["2. Historical Validation (Methodology Check)"]
        R1["Data: Train <= T1, Embargo E, Test in (T1+E, T2]"]
        R2["Model: Retrospective model instance trained strictly on <= T1"]
        R3["Status: Unseen by the historical model instance"]
        R4["Purpose: Validates pipeline architecture and feature engineering"]
        R5["Scientific Caveat: Validates methodology, NOT deployed v3 weights"]
    end

    subgraph Independent ["3. Genuine Out-of-Sample Evaluation"]
        direction TB
        subgraph RetrospectivePostCutoff ["3A. Retrospective Post-Cutoff Backtest"]
            I1["Data: Post-cutoff past dates (2026-10-22 to 2026-10-31 fully calendar-mature as of Nov 7; Nov 1+ partially mature)"]
            I2["Model: Frozen deployed weather_model_v3.joblib"]
            I3["Status: BLOCKED in local environment (PostgreSQL ends on 2026-09-06)"]
            I4["Purpose: Evaluates frozen weights on historical unseen periods once data is ingested"]
        end
        subgraph ProspectiveLive ["3B. Prospective Production Forecasting"]
            P1["Data: Live real-time stream logged prior to observation (>= 2026-11-07)"]
            P2["Model: Frozen deployed weather_model_v3.joblib"]
            P3["Status: Zero hindsight or data-snooping bias possible"]
            P4["Purpose: Gold standard real-world operational evaluation"]
        end
    end
```

### Horizon-Specific Target Availability and Calendar Maturity Schedule
Let $t$ be the forecast origin date, and $T_{obs\_max} = \text{2026-11-07}$ be the current calendar date.
- Target date for horizon $h$ is: $\text{Target Date}(h) = t + h$.
- Target $h$ is **calendar mature** if and only if:
  $$t + h \le T_{obs\_max} \iff h \le T_{obs\_max} - t$$
- If $t + h > T_{obs\_max}$, ground-truth target $h$ has not yet occurred on the calendar.

#### Calendar Maturity vs. Ground-Truth Data Availability
A fundamental distinction must be maintained between:
1. **Calendar Maturity**: The physical date has occurred on the wall-clock calendar ($t + h \le \text{2026-11-07}$).
2. **Ingestion Availability**: Physical observations have been recorded, ingested, and committed to PostgreSQL (`date <= 2026-09-06`).
3. **Quality Validation**: Physical records have passed null checks, range checks, and continuity tests.
4. **Forecast-Origin Usability**: The required 7-day feature lag window $[t-8, t-2]$ is present and unbroken in the database.

#### Maturity Analysis Across Retrospective Candidate Origins (Current Date: 2026-11-07)

| Forecast Origin ($t$) | Horizon 1 ($t+1$) | Horizon 2 ($t+2$) | Horizon 3 ($t+3$) | Horizon 4 ($t+4$) | Horizon 5 ($t+5$) | Horizon 6 ($t+6$) | Horizon 7 ($t+7$) | Fully Mature (All 7 Horizons)? |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **2026-10-22** | Oct 23 (Mature) | Oct 24 (Mature) | Oct 25 (Mature) | Oct 26 (Mature) | Oct 27 (Mature) | Oct 28 (Mature) | Oct 29 (Mature) | **YES** |
| **2026-10-25** | Oct 26 (Mature) | Oct 27 (Mature) | Oct 28 (Mature) | Oct 29 (Mature) | Oct 30 (Mature) | Oct 31 (Mature) | Nov 01 (Mature) | **YES** |
| **2026-10-28** | Oct 29 (Mature) | Oct 30 (Mature) | Oct 31 (Mature) | Nov 01 (Mature) | Nov 02 (Mature) | Nov 03 (Mature) | Nov 04 (Mature) | **YES** |
| **2026-10-31** | Nov 01 (Mature) | Nov 02 (Mature) | Nov 03 (Mature) | Nov 04 (Mature) | Nov 05 (Mature) | Nov 06 (Mature) | Nov 07 (Mature) | **YES** (H7 matures on audit date) |
| **2026-11-01** | Nov 02 (Mature) | Nov 03 (Mature) | Nov 04 (Mature) | Nov 05 (Mature) | Nov 06 (Mature) | Nov 07 (Mature) | *Nov 08 (Pending)* | **NO** (Horizons 1–6 only) |
| **2026-11-02** | Nov 03 (Mature) | Nov 04 (Mature) | Nov 05 (Mature) | Nov 06 (Mature) | Nov 07 (Mature) | *Nov 08 (Pending)* | *Nov 09 (Pending)* | **NO** (Horizons 1–5 only) |
| **2026-11-07** | *Nov 08 (Pending)* | *Nov 09 (Pending)* | *Nov 10 (Pending)* | *Nov 11 (Pending)* | *Nov 12 (Pending)* | *Nov 13 (Pending)* | *Nov 14 (Pending)* | **PROSPECTIVE** (All pending) |

- **Methodological Rule**: As of the audit date (2026-11-07), all candidate retrospective forecast origins from `2026-10-22` through `2026-10-31` are **fully calendar-mature for all seven horizons** (the latest target is Oct 31 + 7 = Nov 7 = audit date). The first partially-mature origin is `2026-11-01` (horizon 7 target Nov 08 is pending). However, **calendar maturity does not imply data availability**: the PostgreSQL database ends on `2026-09-06`, so independent evaluation remains **physically blocked** regardless of calendar maturity status (see Section 11).

---

## 3. Model Architecture and Feature Contract

### Empirical Inspection of Serialized Artifact (`model/weather_model_v3.joblib`)
- **Pipeline Structure**: Scikit-learn `Pipeline` consisting of:
  1. `preprocess`: `ColumnTransformer` with 2 named transformers:
     - `num`: `StandardScaler()` applied to 18 numeric features.
     - `cat`: `OneHotEncoder(handle_unknown='ignore', sparse_output=False)` applied to 2 categorical features (`Season`, `State`).
  2. `model`: `MultiOutputRegressor(estimator=LGBMRegressor(random_state=42, n_jobs=-1, verbose=-1))` containing 7 independent LightGBM estimators.
- **Categorical Encodings**:
  - `Season`: 4 classes (`['Monsoon', 'Post-Monsoon', 'Summer', 'Winter']`).
  - `State`: 33 classes (alphabetical list of 33 Indian states/UTs; state `'Other'` excluded).
- **Dimensionality Distinction**:
  - **Raw Input Features (20 features)**: 18 numeric + 2 categorical (`Season`, `State`).
  - **Transformed Estimator Features (55 features)**: 18 standardized numeric + 4 season one-hot + 33 state one-hot.

### Raw 20-Feature Contract
1. `lag1_temp_avg`: Average temperature at $t-1$
2. `lag2_temp_avg`: Average temperature at $t-2$
3. `lag3_temp_avg`: Average temperature at $t-3$
4. `lag1_temp_max`: Maximum temperature at $t-1$
5. `lag1_temp_min`: Minimum temperature at $t-1$
6. `lag1_humidity`: Relative humidity at $t-1$
7. `lag1_rainfall`: Precipitation at $t-1$
8. `lag2_humidity`: Relative humidity at $t-2$
9. `lag2_rainfall`: Precipitation at $t-2$
10. `temp_range`: Diurnal range $T_{max}(t-1) - T_{min}(t-1)$
11. `roll3_temp_avg`: 3-day backward rolling mean of average temperature over $t-3 \dots t-1$
12. `roll7_temp_avg`: 7-day backward rolling mean of average temperature over $t-7 \dots t-1$
13. `rainfall_roll3`: 3-day backward rolling sum of precipitation over $t-3 \dots t-1$
14. `rainfall_roll7`: 7-day backward rolling sum of precipitation over $t-7 \dots t-1$
15. `month_sin`: $\sin(2\pi \cdot \text{Month}(t) / 12)$
16. `month_cos`: $\cos(2\pi \cdot \text{Month}(t) / 12)$
17. `day_of_year_sin`: $\sin(2\pi \cdot \text{DOY}(t) / 365)$
18. `day_of_year_cos`: $\cos(2\pi \cdot \text{DOY}(t) / 365)$
19. `Season`: Categorical string derived from Month($t$)
20. `State`: Categorical string of state name

---

## 4. Empirical Verification of Pipeline Fitting & Test-Set Contamination

### 1. Literal Source Code and Inspection Excerpts

#### A. Serialized Model Inspection Output
Executing direct introspection on `model/weather_model_v3.joblib`:
```python
>>> import joblib
>>> pipe = joblib.load('model/weather_model_v3.joblib')
>>> scaler = pipe.named_steps['preprocess'].named_transformers_['num']
>>> print('scaler.n_samples_seen_:', scaler.n_samples_seen_)
scaler.n_samples_seen_: 141867.0
>>> model = pipe.named_steps['model']
>>> for i, est in enumerate(model.estimators_):
...     dump = est.booster_.dump_model()
...     root_count = dump['tree_info'][0]['tree_structure']['internal_count']
...     print(f'est_{i} (target_{i+1}) root internal_count:', root_count)
est_0 (target_1) root internal_count: 141867
est_1 (target_2) root internal_count: 141867
est_2 (target_3) root internal_count: 141867
est_3 (target_4) root internal_count: 141867
est_4 (target_5) root internal_count: 141867
est_5 (target_6) root internal_count: 141867
est_6 (target_7) root internal_count: 141867
```
Hyperparameters across all estimators confirm `subsample=1.0`, `subsample_freq=0`, `colsample_bytree=1.0`. Bagging is disabled, proving that every tree in all 7 estimators received all 141,867 sample rows.

#### B. Training Code Path (`retrain_v3.py`, lines 112–115)
```python
logger.info("Fitting v3 pipeline on all data through %s...", max_date_str)
v3_pipeline.fit(df[features], df[targets])
```
`retrain_v3.py` executed zero train/validation/test splitting. 100% of usable rows were passed to `Pipeline.fit()`.

#### C. Evaluation Script Code Path (`backend/evaluate_deployed_artifact.py`, lines 171–189)
```python
max_origin = panel["Date"].max()
test_start = max_origin - pd.DateOffset(months=TEST_MONTHS) + pd.Timedelta(days=1)
...
test = panel[panel["Date"] >= test_start].copy()
...
model = joblib.load(artifact_path)
X_test = test[artifact_features]
actual = test[TARGET_COLUMNS].to_numpy(dtype=float)
prediction = np.asarray(model.predict(X_test), dtype=float)
```

#### D. Model Metadata Record (`model/model_info.json`, lines 26–33, 405–412)
```json
"train_period": ["2015-01-08", "2025-07-11"],
"test_period": ["2025-10-19", "2026-10-18"],
"evaluation": {
  "status": "artifact_evaluated_training_overlap",
  "validated_for_artifact": false,
  "artifact_trained_through": "2026-10-22",
  "row_counts": { "train": 126654, "calibration": 2805, "test": 12045 }
},
"note": "The exact v3 artifact completed evaluation, but its recorded training cutoff overlaps the test window. These are diagnostic artifact scores, not independent validation."
```

### 2. Reconciliation of Test Partition Membership and Target Overlap
A critical correction must be made to prior claims: **Not all 12,045 test partition rows were in-sample training forecast origins**.
- In `model/model_info.json`, `test_period` spans `2025-10-19` to `2026-10-18` (365 calendar days $\times 33 \text{ states} = \mathbf{12,045 \text{ rows}}$).
- The training script `retrain_v3.py` requires all 7 future targets to be non-null. Therefore, with training data extending through `2026-10-22`, training forecast origins stopped at:
  $$t_{train\_origin\_last} = \text{2026-10-22} - 7 = \mathbf{\text{2026-10-15}}$$
- **Disaggregation of the 12,045 Test Partition Rows**:
  1. **In-Sample Forecast Origins (11,946 rows / 99.18%)**:
     - Dates: `2025-10-19` through `2026-10-15` = 362 calendar days.
     - $362 \times 33 = \mathbf{11,946 \text{ rows}}$.
     - Under the Primary Provenance Hypothesis, these 11,946 rows were **directly fitted as training rows in `Pipeline.fit()`**. For these rows, the test evaluation is 100% in-sample.
  2. **Post-Training Forecast Origins (99 rows / 0.82%)**:
     - Dates: `2026-10-16`, `2026-10-17`, `2026-10-18` = 3 calendar days.
     - $3 \times 33 = \mathbf{99 \text{ rows}}$.
     - These 99 rows were **NOT** present in the training set as forecast origins.
  3. **Target Overlap for the 99 Post-Training Origin Rows**:
     - For origin `2026-10-16`: Targets 1–6 (Oct 17–22) fall within the training data window ($\le \text{2026-10-22}$). Only Target 7 (Oct 23) is past the training cutoff.
     - For origin `2026-10-17`: Targets 1–5 (Oct 18–22) fall within training data; Targets 6–7 are post-cutoff.
     - For origin `2026-10-18`: Targets 1–4 (Oct 19–22) fall within training data; Targets 5–7 are post-cutoff.
- **Epistemological Summary**:
  - The test evaluation is **predominantly in-sample** (99.18% direct origin overlap).
  - The remaining 0.82% of rows represent post-training origins whose target horizons heavily intersect historical training observations.
  - The reported metrics are strictly **training-overlap diagnostics**.

### 3. Reconciliation of the 363-Row Discrepancy (Unverifiable Historical Artifact)

The serialized model's `scaler.n_samples_seen_` reports 141,867 fitted rows, while the partition totals in `model/model_info.json` (train: 126,654 + calibration: 2,805 + test: 12,045 = 141,504) differ by exactly 363 rows.

**Source-Code Status**: The partition counts in `model_info.json` (lines 247–250) were generated by a **previous version** of the evaluation script that is no longer present in the repository. The current `backend/evaluate_deployed_artifact.py` (509 lines) uses a completely different architecture:
- Line 38: `EMBARGO_DAYS = 8`
- Line 39: `EMBARGO_OFFSET_DAYS = 9`
- Lines 87–104: `calculate_eligible_test_period()` computes eligible test windows from `training_cutoff + timedelta(days=EMBARGO_OFFSET_DAYS)`.
- Lines 117–209: `build_calendar_verified_panel()` constructs features from explicit calendar-date lookups, not from `shift(-i)`.
- The current code does **not** define `TEST_MONTHS`, `CALIBRATION_MONTHS`, or `EMBARGO_ORIGIN_DAYS` constants, and does not use `pd.DateOffset(months=...)` partition algebra.

**Conditional Historical Arithmetic**: A plausible reconciliation follows, but is classified as an **Unverifiable Historical Artifact** because the generating code is absent from the repository:
- If the prior evaluation script used two 7-day embargo gaps (between train/calibration and calibration/test partitions): $14 \text{ excluded days} \times 33 \text{ states} = 462 \text{ excluded rows}$.
- If the evaluation panel extended 3 calendar days past the training origin cutoff (Oct 16–18): $3 \times 33 = 99 \text{ additional rows}$.
- Net: $462 - 99 = 363$, matching $141{,}867 - 141{,}504 = 363$.
- This arithmetic is **internally consistent** but depends on: (a) the existence of a prior evaluation script with month-based partitioning and 8-day embargo gaps, (b) unbroken 33-state daily reporting without dropped rows, and (c) no duplicate or missing rows in the historical dataset. **None of these assumptions can be verified from the current repository contents.**

---

## 5. Verified Training Cutoff and Target-Purge Mathematics

### Target Generation Alignment & Daily Continuity Verification
In `retrain_v3.py` (lines 85–87):
```python
for i in range(1, 8):
    df[f"target_{i}"] = g["Temp_Avg"].shift(-i)
df = df.dropna(subset=features + targets)
```
- **Critical Requirement: Calendar Continuity vs. Index Shift**:
  - `shift(-i)` operates on row index, NOT calendar dates.
  - In order for `shift(-i)` to represent a true $i$-day forecast horizon:
    1. The DataFrame must be strictly grouped by `State`.
    2. Within each state, rows must be strictly sorted by `Date` ascending.
    3. The calendar series must be complete without missing dates or duplicate dates.
  - If a calendar date is missing (e.g. sensor failure), `shift(-1)` skips the missing date and targets $t+2$ instead of $t+1$.
  - The audit test suite must explicitly assert complete daily calendar continuity (`freq='D'`) and zero duplicate dates per state before accepting `shift(-i)` as valid horizon targets.

### Target-Purge Arithmetic
Target overlap prevention requires that no evaluation target date overlaps with training target dates ($t_{target} \le \text{2026-10-22}$):
- For an evaluation forecast origin $t_{eval\_origin}$, its targets are:
  $$\text{Target Date}(h) = t_{eval\_origin} + h \quad \text{for } h \in \{1, 2, \dots, 7\}$$
- Horizon 1 target is $\text{Target Date}(1) = t_{eval\_origin} + 1$.
- To satisfy target non-intersection:
  $$\text{Target Date}(1) > T_{train\_target\_last} \implies t_{eval\_origin} + 1 > \text{2026-10-22} \implies t_{eval\_origin} \ge \mathbf{\text{2026-10-22}}$$
- **Mathematical Finding**:
  - The **earliest mathematically target-purged forecast origin is 2026-10-22**.
    - Horizon 1 target: $\text{2026-10-22} + 1 = \text{2026-10-23}$.
    - Horizon 7 target: $\text{2026-10-22} + 7 = \text{2026-10-29}$.
    - None of these targets intersect with training targets ($\le \text{2026-10-22}$).
  - **Conservative Origin-Purged Alternative**: $t_{eval\_origin} \ge \mathbf{\text{2026-10-23}}$. Here, the forecast origin date itself occurs strictly after the final training target date.

### Autocorrelation & Dependence Control Buffers
- An embargo buffer $E \ge 0$ is a **parameterized modeling decision**, NOT mathematical or empirical proof that serial dependence has decayed to zero.
- In atmospheric time series, weather systems exhibit multi-day persistence, blocking regimes, and seasonal trends.
- **Empirical Dependence Diagnostic Protocol**:
  1. Inspect the sample autocorrelation $\hat{\rho}(k)$ and partial autocorrelation $\hat{\alpha}(k)$ of model residuals and raw temperatures up to lag 35 (5 weeks).
  2. Compute the Ljung-Box test statistic:
     $$Q(m) = N(N+2) \sum_{k=1}^m \frac{\hat{\rho}^2(k)}{N-k}$$
     across multiple lag horizons $m \in \{7, 14, 21, 28, 35\}$ to test the joint null hypothesis of zero serial correlation.
  3. Recognize that strict statistical independence is rarely achieved in finite weather series; therefore, report model and baseline evaluation metrics under multiple buffer choices:
     $$E \in \{0, 7, 14, 21, 28\} \text{ calendar days}$$
     as a formal sensitivity analysis.

---

## 6. Forecast-Origin, History-Date Definitions, and Retrospective Data Validity

### Production Implementation Contract
In `backend/app/routes/prediction.py` (lines 41–52) and `backend/app/services/feature_service.py` (lines 52–75):
1. **Forecast Target Date ($D_{forecast}$)**: Requested date for Horizon 1 (`request.forecast_date`).
2. **API As-Of Date ($asof$)**: $\text{asof} = D_{forecast} - 1 \text{ day}$. Drives cyclical calendar encodings (`month_sin/cos`, `day_of_year_sin/cos`) and `Season`. Corresponds to row date $t$ in the training panel.
3. **Latest Usable Observation Date ($D_{obs\_latest}$)**: Query enforces `WeatherData.date < asof`. Under contiguous daily observations:
   $$D_{obs\_latest} = asof - 1 \text{ day} = D_{forecast} - 2 \text{ days}$$
4. **Seven Historical Records Consumed**: `history[0]` ($D_{forecast} - 2$) through `history[6]` ($D_{forecast} - 8$).
5. **Target Dates for Horizons 1 through 7**: $\text{Target Date}(h) = asof + h = D_{forecast} + (h - 1)$.

### Duplicate-History Behavior in Production API
In `backend/app/routes/prediction.py`:
```python
history = db.execute(
    select(WeatherData)
    .where(WeatherData.state == canonical, WeatherData.district == dist,
           WeatherData.location == loc, WeatherData.date < asof)
    .order_by(WeatherData.date.desc())
    .limit(REQUIRED_HISTORY)
).scalars().all()
```
- **Vulnerability**: If the database contains duplicate rows on the same calendar date for a location, `limit(7)` will load both duplicate rows. `history[0]` and `history[1]` will represent the same calendar date, causing lag 1 and lag 2 to be identical.
- **Audit Specification**: The database must enforce a strict `UNIQUE(state, district, location, date)` constraint, and tests must verify that duplicate dates are rejected or sanitized before feature extraction.

### Retrospective Data Validity Requirements
- Historical observations in a database do **not** automatically establish that those inputs were available at forecast origin $t$.
- In operational meteorology, observations are frequently updated, quality-controlled, or backfilled post-hoc.
- **Validity Invariant**:
  - Genuine retrospective evaluation requires **data vintage and acquisition timestamps** (`created_at`, ingestion audit logs) proving the inputs were present in the database prior to origin date $t$.
  - Genuinely prospective evaluation requires an **immutable prediction ledger** recording the feature vector and model predictions at origin $t$ *before* the physical weather occurs.

### Mathematical Definitions and Operational Contracts for Evaluation Baselines

The audit benchmarks the deployed model against two standard meteorological reference baselines implemented in `backend/evaluate_deployed_artifact.py` (lines 227–261):

1. **Persistence Baseline**:
   $$\hat{y}_{s, t+h|t} = y_{s, t-1} \quad \forall h \in \{1, 2, \dots, 7\}$$
   - *Operational Meaning*: Repeats the most recent valid historical observation across all 7 forward forecast horizons.
   - *Why $y_{t-1}$ rather than $y_t$*: In operational deployment (Section 6, lines 293–298), a forecast for target date $D_{forecast} = t+1$ operates with $asof = t$. The newest usable observation queried from PostgreSQL enforces `date < asof`, yielding $D_{obs\_latest} = asof - 1 \text{ day} = t-1$ (`lag1_temp_avg`).
   - *Methodological Disclosure*: Using $y_{t-1}$ reflects actual operational pipeline constraints (measurements for date $t$ are not finalized until $t+1$). However, predicting $t+h$ using $t-1$ represents an effective $(h+1)$-step persistence forecast, making the baseline slightly weaker than an idealized 0-lag persistence forecast based on contemporaneous $y_t$. This design choice must be explicitly reported in the audit metrics.

2. **Climatology Baseline**:
   $$\hat{y}_{s, t+h|t} = \bar{y}_{s, \operatorname{DOY}(t+h)}$$
   where $\operatorname{DOY}(t+h)$ is the calendar day-of-year of the target date, and $\bar{y}_{s, \operatorname{DOY}}$ is the historical sample mean temperature for state $s$ on that specific calendar day-of-year.
   - *Strict Training-Only Contraction*: In `backend/evaluate_deployed_artifact.py` (line 406), `training_raw` is restricted strictly to historical training observations prior to the test window ($date \le T_{train\_cutoff}$). Observations from the test window are never included in climatological averages.
   - *Missing-Day and Leap-Day Behavior*:
     - In `backend/evaluate_deployed_artifact.py` (lines 252–255), if a `(State, DOY)` key is missing from `climatology_lookup` (e.g. leap day Day 366 unobserved in historical training records, or unobserved calendar days), the implementation executes a tiered fallback:
       $$\hat{y}_{s, t+h|t} = \begin{cases} \bar{y}_{s, \operatorname{DOY}(t+h)} & \text{if } (s, \operatorname{DOY}(t+h)) \in \text{Lookup} \\ \bar{y}_s & \text{else if state historical mean } \bar{y}_s \text{ exists} \\ y_{s, t-1} & \text{else fallback to row } \texttt{lag1\_temp\_avg} \end{cases}$$
     - *Leap-Day Alignment Status*: Day 366 falls back to the overall state historical mean $\bar{y}_s$. Circular trigonometric smoothing or interpolation across year boundaries (e.g. Day 365/366 $\to$ Day 1) is not implemented in the current code and is classified as an **Unimplemented Feature**.

---

## 7. Statistical Methodology and Uncertainty Estimation

### 1. Per-Horizon Error Analysis
- Forecast errors $e_{t, h} = y_{t+h} - \hat{y}_{t+h|t}$ must be analyzed **separately for each forecast horizon $h \in \{1, \dots, 7\}$**.
- Metrics (MAE, RMSE, $R^2$), sample autocorrelation $\hat{\rho}_h(k)$, and effective sample sizes are computed independently per horizon.

### 2. Pooled Estimands and Exact Incomplete-Panel HAC Formulations
Let $s \in \{1, \dots, S\}$ index states ($S=33$) and $t \in \{1, \dots, T\}$ index forecast origins.
Let $M_{s, t, h} \in \{0, 1\}$ be the indicator that evaluation pair $(y_{s, t+h}, \hat{y}_{s, t+h|t})$ is valid and non-missing.
Let $L_{s, t, h} = |y_{s, t+h} - \hat{y}_{s, t+h|t}|$ be the absolute error loss.

#### A. State-Level Estimand
$$\theta_{s, h} = \frac{\sum_{t=1}^T M_{s, t, h} L_{s, t, h}}{N_{s, h}} \quad \text{where } N_{s, h} = \sum_{t=1}^T M_{s, t, h}$$

#### B. Macro-average Estimand (Equal State Weight)
$$\theta_{macro, h} = \frac{1}{S} \sum_{s=1}^S \theta_{s, h} = \frac{1}{S} \sum_{s=1}^S \left( \frac{1}{N_{s, h}} \sum_{t=1}^T M_{s, t, h} L_{s, t, h} \right)$$
- Under incomplete panels ($N_{s, h}$ varies across states), $\theta_{macro, h}$ is an unweighted average of state means.
- To compute a date-level time-series variance matching this exact estimand, define the normalized daily macro contribution:
  $$\xi_{t, h} = \frac{1}{S} \sum_{s=1}^S \frac{M_{s, t, h} L_{s, t, h}}{N_{s, h}}$$
- Notice: $\sum_{t=1}^T \xi_{t, h} = \theta_{macro, h}$. Define the sample mean $\bar{\xi}_h = \theta_{macro, h} / T$.
- **Explicit Long-Run Variance Definition**: The Newey-West estimator of the spectral density at zero for the $\xi_{t,h}$ series is:
  $$\widehat{\Omega}_h(\xi) = \hat{\gamma}_0(\xi) + 2 \sum_{k=1}^{K} \left(1 - \frac{k}{K+1}\right) \hat{\gamma}_k(\xi)$$
  where $\hat{\gamma}_k(\xi) = \frac{1}{T} \sum_{t=k+1}^T (\xi_{t,h} - \bar{\xi}_h)(\xi_{t-k,h} - \bar{\xi}_h)$ is the sample autocovariance at lag $k$, and $K$ is the Bartlett bandwidth (see Section 7.3A for data-driven selection).
- **Variance of the macro estimator**: Since $\theta_{macro,h} = \sum_{t=1}^T \xi_{t,h} = T \bar{\xi}_h$:
  $$\widehat{\text{Var}}(\theta_{macro, h}) = T \cdot \widehat{\Omega}_h(\xi)$$
  $$SE(\theta_{macro, h}) = \sqrt{T \cdot \widehat{\Omega}_h(\xi)}$$
  **Consistency check**: For a single state ($S=1$) with complete data ($N_{s,h} = T$), $\xi_{t,h} = L_{t,h}/T$, so $\widehat{\Omega}(\xi) = \widehat{\Omega}(L)/T^2$, and $SE = \sqrt{T \cdot \widehat{\Omega}(L)/T^2} = \sqrt{\widehat{\Omega}(L)/T}$, recovering the standard per-series formula in Section 7.3A.
  This estimator matches the macro estimand under arbitrary missingness across states.

#### C. Micro-average Estimand (Observation-Weighted / Pooled Panel)
$$\theta_{micro, h} = \frac{\sum_{s=1}^S \sum_{t=1}^T M_{s, t, h} L_{s, t, h}}{\sum_{s=1}^S N_{s, h}} = \frac{\sum_{t=1}^T U_{t, h}}{N_{total, h}}$$
where $U_{t, h} = \sum_{s=1}^S M_{s, t, h} L_{s, t, h}$ is the daily aggregate loss across all observed states, and $N_{total, h} = \sum_{s=1}^S N_{s, h}$.
- Notice: $\theta_{micro, h} = \frac{\sum_{t} U_{t,h}}{N_{total, h}} = \frac{T \cdot \bar{U}_h}{N_{total, h}}$.
- **Explicit Long-Run Variance**: Define $\widehat{\Omega}_h(U) = \hat{\gamma}_0(U) + 2\sum_{k=1}^K (1 - \frac{k}{K+1}) \hat{\gamma}_k(U)$ as the Newey-West spectral density estimator at zero for the $U_{t,h}$ series, with autocovariances $\hat{\gamma}_k(U) = \frac{1}{T}\sum_{t=k+1}^T (U_{t,h} - \bar{U}_h)(U_{t-k,h} - \bar{U}_h)$.
- Apply Newey-West HAC variance to $U_{t, h}$:
  $$\widehat{\text{Var}}(\theta_{micro, h}) = \frac{T \cdot \widehat{\Omega}_h(U)}{N_{total, h}^2}$$
  $$SE(\theta_{micro, h}) = \frac{\sqrt{T \cdot \widehat{\Omega}_h(U)}}{N_{total, h}}$$
  This estimator matches the micro estimand under arbitrary missingness.

### 3. Rigorous Implementation Specifications: HAC, Delta Method, and DM/HLN

> **Notation Convention**: In this section, $N$ denotes the number of temporal observations in the specific time series under analysis. For a per-state, per-horizon analysis, $N = N_{s,h}$ (the count of valid forecast-origin dates for state $s$ at horizon $h$). For a complete-panel state, $N_{s,h} = T$. $N$ **never** denotes the total panel rows $S \times T$. The pooled-panel estimands in Section 7.2 use $T$ (the number of distinct forecast-origin dates) as their temporal dimension, not $N$ from this section.

#### A. Newey-West HAC Variance for MAE with Data-Driven Bandwidth
1. Construct loss series $z_{t, h} = |e_{t, h}|$ for $t = 1, \dots, N$ (where $N = N_{s,h}$ is the per-state temporal sample size). Compute mean $\bar{z}_h = \frac{1}{N} \sum_{t=1}^N z_{t, h}$.
2. **Dependence Assumptions**: Do NOT assume $h-1$ truncation for non-linear ML models. Weather persistence and gradient boosting trees can produce error memory extending beyond $h-1$.
3. **Data-Driven Bandwidth Selection**: Use the Newey & West (1994) plug-in bandwidth:
   $$K^* = \lfloor 4(N/100)^{2/9} \rfloor$$
4. Compute sample autocovariances:
   $$\hat{\gamma}_k(z) = \frac{1}{N} \sum_{t=k+1}^N (z_{t, h} - \bar{z}_h)(z_{t-k, h} - \bar{z}_h) \quad \text{for } k = 0, \dots, K$$
5. Long-run variance estimator with Bartlett kernel $w_k = 1 - \frac{k}{K+1}$:
   $$\widehat{\Omega}_h(z) = \hat{\gamma}_0(z) + 2 \sum_{k=1}^K \left(1 - \frac{k}{K+1}\right) \hat{\gamma}_k(z)$$
6. **Bandwidth Sensitivity Reporting**: Report standard errors across $K \in \{h-1, h, 2h, K^*\}$.
7. Asymptotic standard error: $SE(\text{MAE}_h) = \sqrt{\widehat{\Omega}_h(z) / N}$.
8. Two-sided $(1-\alpha)$ confidence interval: $\bar{z}_h \pm t_{1-\alpha/2, N-1} \cdot SE(\text{MAE}_h)$.

#### B. RMSE Variance via Delta Method & Zero RMSE Handling
1. Construct squared loss series $u_{t, h} = e_{t, h}^2$. Mean is $\text{MSE}_h = \frac{1}{N} \sum_{t=1}^N u_{t, h}$.
2. Compute HAC long-run variance $\widehat{\Omega}_h(u)$ on $u_{t, h}$ using Bartlett kernel.
3. **Zero RMSE Guardrail**:
   - If $\text{RMSE}_h == 0.0$ (perfect predictions), the derivative $g'(\theta) = \frac{1}{2\sqrt{\theta}}$ divides by zero.
   - Handled explicitly: Set $SE(\text{RMSE}_h) = 0.0$, 95% CI = $[0.0, 0.0]$, and flag `zero_error`.
4. Standard Case ($\text{RMSE}_h > 0$):
   $$SE(\text{RMSE}_h) = \frac{\sqrt{\widehat{\Omega}_h(u) / N}}{2 \cdot \text{RMSE}_h}$$
5. Two-sided $(1-\alpha)$ confidence interval: $\text{RMSE}_h \pm t_{1-\alpha/2, N-1} \cdot SE(\text{RMSE}_h)$.

#### C. Diebold-Mariano Test with HAC Variance and HLN Sensitivity Analysis

**Scope and Series Definition**: The DM test is applied in two distinct contexts:

- **Per-state, per-horizon DM test**: For each state $s$ and horizon $h$, the loss-differential series is $d_{s, t, h} = |e_{A, s, t, h}| - |e_{B, s, t, h}|$ for $t = 1, \dots, N_{s,h}$, where $N_{s,h}$ is the number of valid forecast-origin dates for that state-horizon pair. The temporal sample size is $N = N_{s,h}$ (at most $T$, potentially less under incomplete panels).
- **Pooled (macro or micro) DM test**: The DM test may also be applied to the date-level pooled differential series. For macro pooling, define $\delta_{t,h} = \frac{1}{S}\sum_{s=1}^S \frac{M_{s,t,h} d_{s,t,h}}{N_{s,h}}$ for $t = 1, \dots, T$, using the same normalization as Section 7.2A. The temporal sample size is $N = T$.

In both cases, $N$ is the temporal sample size of the series under analysis. It is **never** $S \times T$.

1. Compute paired loss differential $d_{t, h}$ (per-state) or $\delta_{t,h}$ (pooled) as defined above.
2. Compute mean differential: $\bar{d}_h = \frac{1}{N} \sum_{t=1}^N d_{t, h}$.
3. **Degenerate Differentials**:
   - **Zero-variance differential** ($d_{t, h} = 0 \ \forall t$): Both models produce identical forecasts everywhere. Sample variance is 0, $\bar{d}_h = 0$. Test statistic is $0/0$ (undefined). Report $\text{DM} = 0$, $p = 1.0$, and flag `identical_models`.
   - **Nonzero constant differential** ($d_{t, h} = c \neq 0 \ \forall t$): Model A is deterministically worse than Model B by exactly $c$ every day. Sample autocovariances $\hat{\gamma}_k = 0$ for all $k \ge 0$. Long-run variance is 0. Division by zero in DM statistic. The difference is deterministic (p-value is 0; reject null with probability 1). Flag as `deterministic_dominance`.
4. **Invalid Long-Run Variance**:
   - The unweighted rectangular kernel $\widehat{V}_h = \hat{\gamma}_0 + 2 \sum_{k=1}^{K} \hat{\gamma}_k$ can become negative in finite samples.
   - If $\widehat{V}_h \le 0$, automatically substitute the **Bartlett triangular kernel**, which is mathematically guaranteed positive semi-definite ($\widehat{V}_h \ge 0$).
5. **Primary Approach: HAC-Based DM Statistic**:
   - Compute $\widehat{\Omega}_h(d) = \hat{\gamma}_0(d) + 2\sum_{k=1}^K (1 - \frac{k}{K+1}) \hat{\gamma}_k(d)$ with Bartlett kernel and data-driven bandwidth $K^*$.
   - Test statistic: $DM_h = \frac{\bar{d}_h}{\sqrt{\widehat{\Omega}_h(d) / N}}$.
   - **Rationale**: Each of the 7 LightGBM estimators is trained independently (Section 3, line 102: "7 independent LightGBM estimators"). The loss-differential autocorrelation structure is driven by atmospheric persistence rather than overlapping multi-step recursive forecast errors. A data-driven Bartlett bandwidth adapts to the actual dependence structure without imposing parametric MA($h-1$) assumptions.
   - **Reference distribution and degrees of freedom**: The DM statistic is referred to Student's $t$ with $\nu = N - 1$ degrees of freedom. Two-sided p-value: $p_h = 2 \cdot (1 - F_{t(\nu)}(|DM_h|))$.
     - **Justification**: The $t_{N-1}$ reference is a finite-sample heuristic (Diebold, 2015). It provides a conservative correction relative to the standard normal when $N$ is small, but its theoretical validity requires the normalized loss-differential series $d_{t,h}/\sigma_d$ to be approximately i.i.d. Gaussian after HAC variance correction. For short temporal samples (e.g. $N < 30$), this approximation is unreliable; the HAC estimator itself may be inconsistent (bandwidth comparable to sample size).
     - **Unresolved limitation**: For the current workspace, no genuine out-of-sample evaluation dates exist (Section 11). If future evaluation produces a short temporal sample ($N < 30$), the $t_{N-1}$ reference distribution should be cross-checked against the Studentized MBB bootstrap p-value from Section 7.7. Neither distribution can be claimed as definitively valid for very small $N$ with HAC correction.
6. **Sensitivity Analysis: HLN Finite-Sample Correction (MA($h-1$) Assumption)**:
   - As a secondary check, report the Harvey-Leybourne-Newbold (1997) corrected statistic using rectangular kernel with $h-1$ lag truncation:
     $$DM_{HLN, h} = DM_h^{(h-1)} \times \left[ \frac{N + 1 - 2h + h(h-1)/N}{N} \right]^{1/2}$$
     where $DM_h^{(h-1)}$ uses the spectral density estimated with truncation at lag $h-1$.
   - **Disclosure**: The HLN correction assumes the loss differential follows an MA($h-1$) process, which is appropriate for recursive multi-step forecasts from a single autoregressive model but may not hold for independent per-horizon gradient-boosting estimators. Report both HAC-based (primary) and HLN-based (sensitivity) p-values.
7. Report both statistics, their p-values, and whether they agree or disagree on rejecting $H_0$.

### 4. Multiple-Testing Families & Error Rate Control
Hypothesis tests are partitioned into 3 pre-specified families:
1. **Family 1: Pooled Horizon Comparisons (7 hypotheses)**:
   - Hypotheses: $H_{0, h}: \mu_{d, h} = 0$ for $h \in \{1 \dots 7\}$.
   - Benjamini-Hochberg (BH) FDR at $q=0.05$: Sort p-values $p_{(1)} \le \dots \le p_{(7)}$; find $k^* = \max \{i : p_{(i)} \le \frac{i}{7} q\}$; reject $H_{(1)} \dots H_{(k^*)}$.
   - Holm-Bonferroni for FWER control: Reject $H_{(i)}$ if $p_{(i)} \le \frac{\alpha}{7 - i + 1}$.
2. **Family 2: State-Level Comparisons per Horizon (7 Separate Families of 33 Hypotheses)**:
   - For each horizon $h \in \{1 \dots 7\}$, define a distinct family of 33 state hypotheses: $H_{0, s, h}: \mu_{d, s, h} = 0$.
   - Apply Benjamini-Yekutieli (BY) FDR control within each 33-state family at $q=0.05$ with harmonic penalty $c(33) = \sum_{j=1}^{33} \frac{1}{j} \approx 4.088$ to account for arbitrary spatial cross-state dependency.
3. **Family 3: Global State-Horizon Matrix (231 Hypotheses, Hierarchical Testing)**:
   - **Replacement of Invalid Independence Assumption**: Standard Fisher's omnibus test assumes independent p-values, which is severely violated by spatial cross-correlation and temporal weather persistence.
   - **Stage 1 (Omnibus Global Testing under Dependence)**:
     - *Candidate Method (Date-Level Sign-Flip Permutation)*: Global date-level sign-flip permutation test ($R = 5,000$ draws) where signs of paired differentials $d_{t, s, h}$ are flipped simultaneously across all $S=33$ states and $H=7$ horizons on each date $t$:
       $$\mathbf{d}_t^* = \epsilon_t \cdot \mathbf{d}_t, \quad \epsilon_t \in \{-1, +1\} \text{ with equal probability } 1/2$$
     - *Contemporaneous Spatial Dependence Preserved*: Because the scalar sign flip $\epsilon_t$ multiplies the entire $33 \times 7$ differential vector $\mathbf{d}_t$ on date $t$, all contemporaneous spatial cross-covariances across states and cross-horizon covariances on that date are preserved.
     - *Failure Under Serial Dependence*: Drawing $\epsilon_t$ independently across calendar dates $t = 1 \dots T$ assumes temporal independence between dates. Atmospheric error differentials exhibit multi-day serial autocorrelation; independent date-level sign flips destroy this serial dependence structure under permutations, underestimating null variance and causing severe Type I error inflation.
     - *Methodological Classification*: **Rejected as Invalid Under Serial Autocorrelation**.
     
     - *Assessment of Alternative 1: Block-Sign-Flip Permutation*:
       - *Procedure*: Divide the $T$-day evaluation timeline into $K = \lfloor T/B \rfloor$ contiguous non-overlapping temporal blocks of length $B$ (e.g. $B \in \{7, 14, 21\}$ days), assigning a single random sign flip $\epsilon_b \in \{-1, +1\}$ to all dates within block $b$.
       - *Joint Symmetry and Exchangeability Assumption*: Assumes that under $H_0^{global}$, conditional on observed magnitudes, the entire block trajectory $\mathbf{D}_b = [\mathbf{d}_t]_{t \in \text{block } b}$ has a distribution symmetric around zero ($\mathbb{P}(\mathbf{D}_b) = \mathbb{P}(-\mathbf{D}_b)$). Systematic seasonal skewness or asymmetric penalties during extreme weather events violate this exchangeability.
       - *Inter-Block Independence Assumption*: Assumes temporal dependence decays within $B$ days such that blocks are approximately mutually independent. If persistent weather regimes or synoptic patterns exceed $B$ days, dependence bleeds across block boundaries, biasing the permutation distribution.
       - *Block-Length Selection Limitations*: Heuristic selection of $B \in \{7, 14, 21\}$ lacks an objective, data-driven optimization criterion in multivariate spatio-temporal settings, introducing arbitrary researcher degrees of freedom.
       - *Feasibility Assessment for Current Evaluation Sample*:
         - As established in Section 11, the database strictly ends on `2026-09-06`. The model training cutoff is `2026-10-22` with an 8-day embargo (`EMBARGO_OFFSET_DAYS = 9`, earliest eligible origin `2026-10-31`). Therefore, the number of actual available post-cutoff evaluation dates is **$T = 0$**.
         - Even on a hypothetical short evaluation window ($T \in [10, 30]$ days):
           - $B = 21$ yields $K = \lfloor 30/21 \rfloor = 1$ block ($2^1 = 2$ permutations; minimum p-value resolution $0.5$).
           - $B = 14$ yields $K = \lfloor 30/14 \rfloor = 2$ blocks ($2^2 = 4$ permutations; minimum p-value resolution $0.25$).
           - $B = 7$ yields $K = \lfloor 30/7 \rfloor = 4$ blocks ($2^4 = 16$ permutations; minimum p-value resolution $1/16 = 0.0625$, which cannot achieve statistical significance at $\alpha = 0.05$).
         - Valid two-sided testing at $\alpha = 0.05$ mathematically requires at least $K \ge 6$ blocks ($2^6 = 64$, resolution $\approx 0.0156$), and stable empirical p-values require $K \ge 15 \dots 20$ blocks ($T \ge 105 \dots 315$ days).
       - *Status*: **Infeasible and NOT Approved for Current Evaluation**. The block-sign-flip permutation test cannot achieve valid significance testing with the available evaluation sample.

     - *Assessment of Alternative 2: Studentized MBB Wald Omnibus*:
       - *The 231-Dimensional Covariance Problem*: Evaluating the global null across $S = 33$ states and $H = 7$ horizons produces a test vector $\bar{\mathbf{d}} \in \mathbb{R}^{231}$. The empirical long-run covariance matrix $\widehat{\boldsymbol{\Sigma}}_{\bar{\mathbf{d}}}$ is $231 \times 231$, comprising $\frac{231 \times 232}{2} = 26,796$ unique covariance parameters.
       - *Singularity and Unreliability of Full Inversion*: Estimating $\widehat{\boldsymbol{\Sigma}}_{\bar{\mathbf{d}}}$ from $T$ temporal observations yields an empirical matrix of rank at most $\min(T - 1, 231)$. When $T \le 231$ (and specifically when $T = 0$ or $T = 30$), the covariance matrix is mathematically singular and non-invertible. Even if regularized (e.g. ridge shrinkage or pseudo-inverse), estimating 26,796 parameters from small $T$ introduces extreme noise amplification, rendering the quadratic form $W = \bar{\mathbf{d}}^\top \widehat{\boldsymbol{\Sigma}}_{\bar{\mathbf{d}}}^{-1} \bar{\mathbf{d}}$ completely unstable and unreliable.
       - *Methodologically Supported Lower-Dimensional Alternatives*: Rather than inverting a 231-dimensional matrix, multiple-testing control is decomposed into lower-dimensional sub-families already specified in this plan:
         1. **Family 1 (Pooled Horizon Comparisons)**: 7 scalar hypotheses testing pooled date-level differentials with Benjamini-Hochberg FDR control.
         2. **Family 2 (State Comparisons per Horizon)**: 7 separate families of 33 hypotheses with Benjamini-Yekutieli FDR control under arbitrary spatial dependence, bypassing matrix inversion entirely.
       - *Status*: **Methodological Classification: Unresolved and NOT Approved for Inference**. The 231-dimensional Studentized MBB Wald omnibus test is rejected as mathematically ill-conditioned for the available sample size. Global omnibus testing is omitted; error rate control is enforced through Families 1 and 2.
   - **Stage 2 (Follow-up Post-Hoc Tests)**: Only if the omnibus test rejects at global level $\alpha = 0.05$, proceed to individual cell testing. Apply Benjamini-Yekutieli (BY) FDR control across all $M = 231$ tests with harmonic penalty $c(231) = \sum_{j=1}^{231} \frac{1}{j} \approx 6.025$ to control FDR under arbitrary cross-hypothesis dependence structures.

### 5. Effective Sample Size ($N_{eff}$) Edge-Case Handling
For loss series $z_{t, h} = |e_{t, h}|$, the asymptotic effective sample size is:
$$N_{eff}(h) = \frac{N}{\widehat{\Omega}_h(z) / \hat{\gamma}_0(z)}$$
**Edge-Case Guardrails**:
- *Zero-Variance Loss Series*: If $\hat{\gamma}_0(z) == 0.0$ (all errors bitwise identical, e.g. persistence during a frozen sensor), set $N_{eff}(h) = N$ and record flag `zero_variance_loss`.
- *Negative Autocorrelation*: If $\widehat{\Omega}_h(z) < \hat{\gamma}_0(z)$, cap $N_{eff}(h) = N$.
- *Non-finite or Non-positive $\widehat{\Omega}_h$*: Fall back to Bartlett kernel. If still degenerate, set $N_{eff}(h) = N$ and record flag `invalid_spectral_density`.
- *Small Samples*: If $N < 2h$, flag as asymptotic breakdown and report raw $N$ only.
- Raw $N$ and $N_{eff}(h)$ must be reported in separate columns.

### 6. Strict Prohibition of Target Imputation & Missingness-Association Diagnostics
- **Absolute Ground-Truth Rule**: **Under zero circumstances will missing target observations be filled, linearly interpolated, or synthetically imputed for calculating evaluation metrics (MAE, RMSE, $R^2$), Diebold-Mariano tests, or baseline skill comparisons.** Ground truth must consist strictly of authentic, recorded physical measurements. When a ground-truth observation $y_{t+h}$ is missing, the corresponding $(y_{t+h}, \hat{y}_{t+h})$ pair is strictly omitted from metric calculations.
- **Missingness-Association Diagnostics Protocol**:
  - The unsupported 5% threshold is eliminated.
  - Report exact data completeness percentages per state, variable, and horizon.
  - Compute point-biserial correlations and logistic regression of missingness indicators on observed neighboring weather variables (e.g. precipitation, temperature) to test for **evidence against specific Missing Completely At Random (MCAR) assumptions**.
  - **Scientific Disclosure**: Acknowledge that **Missing Not At Random (MNAR) cannot be empirically established or ruled out from observed data alone**, because the unobserved values are unavailable.
  - Report metric sensitivity curves across varying data completeness thresholds.

### 7. Spatially Synchronized Studentized Moving-Block Bootstrap (MBB) Protocol
1. **Panel Structure**: $S = 33$ states, $N$ contiguous calendar dates $t = 1 \dots N$.
2. **Missingness Mask**: Define boolean mask $M_{s, t, h} = \mathbb{I}(y_{s, t+h} \text{ is observed and valid})$.
3. **Block Lengths**: Evaluate sensitivity across $B \in \{7, 14, 21, 28\}$ days. Number of overlapping blocks $Q = N - B + 1$.
4. **Spatial Synchronization**: Draw $K = \lceil N / B \rceil$ block indices $j_1, \dots, j_K$ with replacement uniformly from $\{1, \dots, Q\}$. Apply the identical block sequence simultaneously to all 33 states to preserve contemporaneous spatial cross-covariance.
5. **Incomplete Block Handling**: Pairs with $M_{s, t, h} == \text{False}$ are omitted from metric calculation in that replicate. Zero synthetic interpolation.
6. **Minimum Valid Observations Threshold**: If a bootstrap replicate for state $s$ retains fewer than $N_{valid} < \max(10, B)$ valid pairs, that replicate is flagged as an invalid draw.
7. **Failed Replicate Policy**: Replace invalid draws by resampling new blocks up to a maximum retry limit of 50 attempts. If valid coverage cannot be achieved, that state is flagged as having insufficient data for bootstrap inference.
8. **Studentized MBB Confidence Intervals**: Because standard BCa acceleration formulas assume i.i.d. observations, use the **Studentized Moving-Block Bootstrap** (Hall, Horowitz, & Jing 1995) to achieve second-order asymptotic accuracy without jackknife breakdown under dependence. Compute $t^* = \frac{\hat{\theta}^* - \hat{\theta}}{\widehat{SE}^*}$, and form intervals from empirical quantiles of $t^*$ across $R = 2,000$ valid replicates.

### 8. Mathematically Rigorous $R^2$ Methodology and Degeneracy Handling
The calculation of $R^2 = 1 - \frac{SS_{res}}{SS_{tot}}$ follows exact conditions:
1. **Sample Size ($N < 2$)**: If $N < 2$, sample variance is undefined. Set $R^2 = \text{NaN}$.
2. **Exactly Constant Targets ($y_{max} == y_{min}$)**: If all observed targets are bitwise identical, $SS_{tot} = 0.0$. Set $R^2 = \text{NaN}$ and classify as `constant_target`.
3. **Small Nonzero Target Variance ($SS_{tot} > 0$)**: Compute $R^2$ directly without artificial clamping. If $SS_{res} > SS_{tot}$, $R^2 < 0$. Record $R^2$ as computed.
4. **Extreme Divergence Guardrail**: If $SS_{tot} \to 0$ with $SS_{res} > 0$, $R^2 \to -\infty$. Guard against numerical overflow; cap reporting at $-10^6$ and flag `near_constant_target_divergence`.
5. **Numerical Stability**: Compute $SS_{tot} = \sum (y_i - \bar{y})^2$ using a two-pass algorithm. Always report sample count $N$ and target sample variance $s_y^2$ alongside $R^2$.

---

## 8. Defensible Numerical Equivalence and Feature Consistency Protocol

### 1. Rejection of Unsupported Universal Tolerances
- Universal tolerances (such as $10 \times \epsilon_{mach}$ or $1.2 \times 10^{-5}$) are **completely removed**.
- Wilkinson's summation error bound applies strictly to summation of identical floating-point values in identical precision, but does not establish equivalence between arbitrary implementations.

### 2. Operation-Specific Floating-Point Equivalence Standards
- **Lag Features and State Encodings**: Direct array indexing and string lookups $\implies$ **Bitwise Exact** ($\Delta_{abs} = 0.0$).
- **Diurnal Range ($T_{max} - T_{min}$)**:
  - Evaluated via single IEEE 754 subtraction.
  - Sterbenz's Lemma requires inputs to have the same sign and $y/2 \le x \le 2y$. Because temperatures in Celsius can cross $0^\circ\text{C}$ or have ratios $> 2$, Sterbenz Lemma does not hold universally.
  - Standard floating-point bound: $|(T_{max} \ominus T_{min}) - (T_{max} - T_{min})| \le 0.5 \text{ ULP}(T_{max} - T_{min}) \le 0.5 \epsilon_{mach} |T_{max} - T_{min}|$.
- **Rolling Sums and Rolling Means**:
  - Measured empirically: compute discrepancy distributions $(\Delta_{abs}, \Delta_{rel})$ between pandas vectorized rolling operations and Python sequential accumulation across the full historical database.
  - Acceptance criterion: Document the complete empirical distribution (50th, 95th, 99th, max percentiles) and verify that discrepancies do not exceed the machine precision roundoff of the underlying accumulation order.
- **Model Predictions**:
  - LightGBM prediction determinism must be tested on the target hardware under fixed thread count (`n_jobs=1`).
  - Empirically verified: `pipe.predict(df_single)` and `pipe.predict(df_batch)[0]` yield **bitwise identical arrays** ($\max \Delta_{abs} = 0.0$).
  - If any non-zero difference is observed across platforms or BLAS implementations, the exact empirical distribution must be documented rather than asserting a universal numerical threshold.

---

## 9. Implementation Steps & Limited Workspace Modification Detection Protocol

### Step 1: Branch Creation & Environment Isolation
```powershell
git checkout -b audit/ml-forecasting
mkdir -p audit/results
```

### Step 2: Limited Application-Level Write Suppression and Workspace-Change Detection Protocol
A user-space Python flag cannot provide operating-system-level kernel write blocking. The audit implements a transparent protocol combining application-level write suppression with comprehensive workspace change detection:
1. **Pre-Execution Workspace Snapshot**:
   - Capture recursive directory inventory, file sizes, and SHA-256 tree hashes.
   - Assert `git status --porcelain` is strictly empty.
2. **Application-Level Write Suppression**:
   - In `--dry-run` mode, Python file-writing builtins (`builtins.open(..., 'w')`, `pathlib.Path.write_text`, `os.remove`) are wrapped with interceptors that raise an immediate `PermissionError` if an application write is attempted.
   - Redirect temporary caches: set `$env:PYTHONDONTWRITEBYTECODE = "1"`, `$env:PYTHONPYCACHEPREFIX = "$env:TEMP\agy_null_cache"`, and `$env:MPLCONFIGDIR = "$env:TEMP\agy_null_cache"`.
3. **Execution**:
   ```powershell
   python backend/evaluate_deployed_artifact.py --dry-run --artifact-path model/weather_model_v3.joblib --source-model-info model/model_info.json
   ```
4. **Post-Execution Workspace Modification Audit**:
   - Compare post-execution file state against the pre-execution snapshot.
   - Scan for modified files:
     ```powershell
     $postMod = Get-ChildItem -Recurse | Where-Object { $_.LastWriteTimeUtc -ge $startTime }
     if ($postMod.Count -gt 0) { throw "Workspace modification detected! Modified: $($postMod.FullName)" }
     ```
   - Assert `git status --porcelain` remains strictly clean.

### Step 3: Evaluation Pipeline Hardening (`backend/evaluate_deployed_artifact.py`)
1. Implement verified `--dry-run` with stdout output streaming.
2. Isolate output: change default output path to `audit/results/diagnostic_metrics.json`.
3. Add `--per-state-output audit/results/diagnostic_per_state.json`.
4. Implement numerical guardrails for undefined $R^2$ ($N < 2$, constant targets).
5. Remove any code that modifies `model/weather_model_v3.joblib` or `model/model_info.json`.

### Step 4: Consistency Test Refactoring (`backend/test_consistency.py`)
1. Support dual-mode operation:
   - If Kaggle CSV exists: test training/inference parity against training source.
   - If CSV is absent: test **operational feature consistency** against PostgreSQL `weather_data`.
2. Report empirical discrepancy distributions ($\Delta_{abs}, \Delta_{rel}$) without hardcoded universal tolerances.

### Step 5: Test Suite Implementation (`backend/tests/test_ml_audit.py`)
Implement 10 comprehensive tests:
1. `test_feature_contract_and_order`: Verifies 20 raw features and 55 transformed features.
2. `test_zero_future_leakage_with_corrupted_future`: Verifies future corruptions do not affect past features.
3. `test_cross_state_boundary_isolation`: Injects corruptions into State A and asserts State B features remain invariant.
4. `test_target_embargo_mathematical_separation`: Derives embargo boundaries dynamically from training observations; asserts earliest target-purged origin is `2026-10-22` and conservative origin is `2026-10-23`.
5. `test_target_alignment_temporal_correctness`: Verifies $\text{target}_h$ matches ground truth at $t+h$ and asserts complete daily calendar continuity (`freq='D'`).
6. `test_unseen_category_handling`:
   - Verifies pipeline level: `OneHotEncoder(handle_unknown='ignore')` maps unseen category to an all-zero vector, LightGBM executes and returns finite floats.
   - Verifies API endpoint level: `resolve_location(..., db)` raises HTTP 404 (or 422 if `require_model_support=True`) when an unseen state is requested.
7. `test_duplicate_and_missing_history_handling`: Verifies rejection of duplicate dates and HTTP 422 on staleness $> 2$.
8. `test_baseline_computational_integrity`: Validates persistence and climatology without forcing LightGBM to beat them.
9. `test_model_artifact_checksum_immutability`: Asserts SHA-256 hashes of model and metadata match recorded checksums.
10. `test_independent_evaluation_separation`:
    - Tests `data_eligible_for_independent_evaluation` dynamically from database contents.
    - Proves that data eligibility alone cannot set `validated_for_artifact = True` without a completed evaluation manifest containing:
      - `evaluation_artifact_sha256` matching `844fdadfbe...`
      - `evaluation_type: "genuine_out_of_sample"`
      - `evaluation_period` strictly following target purge and embargo rules
      - `ground_truth_records_evaluated` count matching ground-truth records
      - Reproducible metric payload (MAE, RMSE, $R^2$, skill score)

### Step 6: Compile `ML_AUDIT_REPORT.md`
Generate comprehensive audit deliverable at repository root.

---

## 10. Complete Test Specifications

| Test Function | Input / Precondition | Execution Assertion | Failure Mode Caught |
| :--- | :--- | :--- | :--- |
| `test_feature_contract_and_order` | Model artifact and `model_service.FEATURE_ORDER` | Length == 20, exact names/order match. Scaler features in == 18. OHE categories == [4, 33]. | Feature schema drift, column reordering. |
| `test_zero_future_leakage_with_corrupted_future` | Historical dataframe with synthetic extreme values at $t' \ge t$ | Extracted features at $t$ remain identical before and after future corruption. | Lookahead leakage in lag/rolling features. |
| `test_cross_state_boundary_isolation` | Multi-state dataframe with extreme spike in State A | Features for State B remain identical to isolated State B computation. | Cross-state data bleeding in grouped rolling. |
| `test_target_embargo_mathematical_separation` | Dynamic train boundaries: $T_{train\_obs\_max}$ | Dynamically derived earliest target-purged origin $t_{eval\_origin} \ge T_{train\_obs\_max} - 7 + 7 = T_{train\_obs\_max}$. Conservative origin $\ge T_{train\_obs\_max} + 1$. | Autoregressive leakage across split boundaries. |
| `test_target_alignment_temporal_correctness` | Forecast origin $t$ and ground truth panel | Target $h$ equals ground truth temperature on date $t+h$; daily calendar continuity complete (`freq='D'`). | Off-by-one errors in target generation; gap skips in row shifts. |
| `test_unseen_category_handling` | DataFrame with `'UnknownState'`; API query with `'UnknownState'` | Pipeline: OHE encodes as all zeros, prediction finite. API: `resolve_location` raises HTTP 404 / 422. | Silent failure or misattributed error codes on unseen categories. |
| `test_duplicate_and_missing_history_handling` | Query with history $< 7$ or staleness $> 2$ days | Raises HTTP 422 Unprocessable Entity; duplicate calendar dates rejected. | Ingestion of corrupted, duplicate, or stale history. |
| `test_baseline_computational_integrity` | Test partition with persistence and climatology | Baselines produce valid finite arrays. Errors reported neutrally without hardcoded inequality assertion. | Baseline computation error or leakage. |
| `test_model_artifact_checksum_immutability` | Disk files `weather_model_v3.joblib` and `model_info.json` | Computed SHA-256 hashes match recorded expected hashes. | Accidental model or metadata mutation. |
| `test_independent_evaluation_separation` | Synthetic eligible DB fixture and manifest validator | Database having post-cutoff rows alone sets `data_eligible=True` but leaves `validated_for_artifact=False` until an authenticated evaluation manifest exists. | False validation claims, coupling data presence to validation completion. |

---

## 11. Known Limitations and Critical Data Blockers

1. **Post-Cutoff Observations Deficit (Critical Evaluation Blocker)**:
   - The PostgreSQL database `weather_data` table strictly ends on `2026-09-06` across all 33 states (Karnataka spans 2015-01-01 to 2026-09-06; 32 other states span 2023-04-01 to 2026-09-06).
   - The model metadata records training through `2026-10-22`.
   - **Finding**: The database completely lacks observations from `2026-09-07` through `2026-10-22` (46 days) and lacks all subsequent post-cutoff observations from `2026-10-23` to the present (`2026-11-07`).
   - **Consequence**: Genuine out-of-sample independent evaluation of `weather_model_v3.joblib` is **completely physically blocked** until ground-truth observations past the training cutoff are ingested. All evaluations on the deployed model artifact within this workspace are strictly pre-cutoff training-overlap diagnostics.
2. **External Training Dataset Absence**: `data/archive_c/PSP_Weather_Merged_EDA_Cleaned.csv` and historical pre-2023 database records are not present on disk. External dataset provenance remains conditional until the dataset or raw ingestion manifests are restored.
3. **Multi-Step Autocorrelation**: Overlapping 7-day forecast windows create inherent autocorrelation in forecast errors. Asymptotic Newey-West standard errors, HLN small-sample corrections, and spatially synchronized block bootstraps must be used in place of naive i.i.d. estimators.
4. **Calendar Alignment in Leap Years**: Divisor 365 causes December 31 of leap years (Day 366) to map to the circular phase of January 1 (Day 1).

---

## 12. Complete Traceability Matrix for Technical Blockers

| Blocker # | Original Issue | Required Correction | Supporting Evidence & Derivations | Resolution Status |
| :---: | :--- | :--- | :--- | :---: |
| **1** | Overstated claim of 100% test rows in training; confused forecast-origin membership with target overlap. | Disaggregate test partition: 11,946 rows (99.18%) in-sample origins; 99 rows (0.82%) post-training origins with target overlap. | Section 4.2 proves training origins stopped at `2026-10-15` (11,946 rows); Oct 16–18 origins (99 rows) have targets overlapping training period $\le \text{2026-10-22}$. | **RESOLVED WITH EVIDENCE** |
| **2** | Confused calendar maturity with data availability. | Distinguish calendar maturity (Nov 7) from data ingestion availability (Sep 6), quality validation, and feature usability. | Section 2 defines 4-level taxonomy. Target maturity table details full maturity through Oct 31 and partial maturity for Nov 1+ origins as of 2026-11-07. | **RESOLVED WITH EVIDENCE** |
| **3** | Treated row-based `shift(-i)` as calendar day without verifying daily continuity. | Require strict verification of daily calendar continuity (`freq='D'`), zero duplicate dates, and state-level sorting before accepting `shift(-i)`. | Section 5 specifies test assertions for calendar gaps and duplicate dates to prevent horizon corruption. | **RESOLVED BY METHODOLOGY** |
| **4** | Pooled macro and micro HAC estimators did not match their stated estimands under incomplete panels. | Formulate exact normalized daily macro contribution $\xi_{t, h}$ and daily aggregate micro loss $U_{t, h}$. | Section 7.2 mathematically derives $\widehat{\text{Var}}(\theta_{macro, h}) = T \cdot \widehat{\Omega}_h(\xi)$ and $\widehat{\text{Var}}(\theta_{micro, h}) = \frac{T \cdot \widehat{\Omega}_h(U)}{N_{total}^2}$ with explicit spectral density definitions. | **RESOLVED BY METHODOLOGY** |
| **5** | DM/HLN assumed $h-1$ truncation without justification; lacked degenerate and invalid variance handling. | Adopt Bartlett HAC as primary inference; report HLN (MA($h-1$)) as sensitivity analysis; handle degenerate/invalid cases. | Section 7.3 specifies HAC DM as primary, reports HLN sensitivity, handles zero/constant differentials, and guarantees Bartlett positive semi-definiteness. | **RESOLVED BY METHODOLOGY** |
| **6** | Fisher omnibus test assumed independence, violating spatial/temporal correlation across 231 tests. | Replace Fisher independence test with sign-flip permutation test; disclose symmetry and serial-dependence limitations. | Section 7.4 details global sign-flip permutation, classifies it as conditional/unresolved under strong autocorrelation, and recommends block permutation / Studentized MBB alternatives. | **RESOLVED BY METHODOLOGY (CONDITIONAL)** |
| **7** | Moving-block bootstrap lacked valid dependent acceleration, failed replicate handling, and missingness masks. | Implement Studentized MBB for dependent second-order accuracy; specify missingness mask $M_{s, t, h}$, minimum valid $N_{valid} \ge \max(10, B)$, and 50-retry replacement. | Section 7.7 specifies complete Studentized MBB algorithm with synchronized cross-state block draws and BCa alternative caveats. | **RESOLVED BY METHODOLOGY** |
| **8** | Sterbenz Lemma claimed universally for `temp_range`; universal numerical tolerances unsupported. | Disclose Sterbenz Lemma failure when signs differ ($T_{min} < 0$) or ratio $> 2$; replace universal tolerances with empirical discrepancy profiling. | Section 8 details IEEE 754 $0.5 \text{ ULP}$ subtraction bounds and empirical profiling across the full database. | **RESOLVED BY METHODOLOGY** |
| **9** | Lacked robust handling for zero RMSE, non-finite values, and extreme $R^2$ divergence. | Implement zero RMSE guardrail ($SE=0$), non-finite input/prediction detection, and $R^2 \to -\infty$ cap at $-10^6$. | Section 7.3 and 7.8 provide explicit numerical guardrails for degenerate and divergent metrics. | **RESOLVED BY METHODOLOGY** |
| **10** | Unspecified API status codes, duplicate-history vulnerability, and baseline reproducibility. | Specify HTTP 404/422 status codes, assert unique date constraints in DB, and provide mathematical baseline definitions. | Section 6, 7.3, and 10 formally define Persistence ($\hat{y}_{t+h} = y_{t-1}$), Climatology ($\hat{y}_{t+h} = \bar{y}_{s, DOY}$), API routes, and unique constraints. | **RESOLVED WITH EVIDENCE** |
| **11** | 363-row reconciliation presented as proven fact rather than conditional arithmetic. | Reclassify reconciliation as an unverifiable historical artifact because generating code is absent from the repository. | Section 4.3 documents the absence of partition code in current `evaluate_deployed_artifact.py` (which uses `EMBARGO_OFFSET_DAYS = 9`) and retains arithmetic only as a conditional hypothesis. | **RESOLVED WITH EVIDENCE** |

---

## 13. Protection Compliance Statement

In accordance with strict audit governance and user constraints:
- **Only the designated ML audit plan document (`docs/ml_audit_implementation_plan.md`) was modified.**
- **Zero repository source code files, test files, configuration files, or other documentation were modified.**
- **Zero Git branches were created; no checkout of `audit/ml-forecasting` occurred.**
- **Zero models were retrained, refitted, overwritten, or modified.**
- **`model/weather_model_v3.joblib` and `model/model_info.json` remain bitwise identical to their recorded hashes.**
- **Zero database migrations or PostgreSQL record modifications were executed.**
- **This plan is explicitly NOT approved for implementation or `/goal` execution until the data blocker is resolved and explicit approval is provided.**

---

*This completes the independent senior ML review and plan correction. I await your review and explicit approval.*
