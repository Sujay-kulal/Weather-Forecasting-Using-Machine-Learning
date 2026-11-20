# Seven-day rainfall evaluation

The forecast page displays seven daily expected rainfall amounts as a research preview. Direct LightGBM regression earned the lowest validation RMSE. On the independent test it improved RMSE by 0.083 mm (0.85%) over state-and-month climatology. That gain missed the pre-test 1% release criterion. A paired 14-day block bootstrap gives an approximate 95% interval of −0.120 to +0.285 mm for the gain. Calibrated probabilities of more than 0.1 mm qualified for publication on days 1–6.

## Historical observations

A repeatable-read, read-only PostgreSQL transaction selected completed statewide records with empty district and location on the fixed dates below. It returned 41,777 unique state-days for all 33 states and union territories in the temperature metadata, April 1, 2023 through November 10, 2026. All seven required fields were present and finite. The check found zero duplicate state-dates, negative rainfall values, out-of-range humidities or inconsistent temperature measurements. Measured ranges were 0–334.4 mm rainfall, 6.67–100% humidity and −42.7 to 46.5 °C across daily extrema.

The calendar was missing 1,783 state-days, 54 per jurisdiction except Chhattisgarh with 55. The panel skipped windows missing an input or target day. Of the available observations, 16,565 (39.65%) had zero precipitation. The 25,212 positive amounts had quartiles of 0.80, 3.55 and 10.50 mm, with a 95th percentile of 30.80 mm.

The project's historical loaders use a cleaned weather and power-demand CSV and Open-Meteo. PostgreSQL stores weather values under state labels without per-row provider or station identifiers. Those values are the ground truth for this study. Spatial representativeness and station-level forecast performance were outside its measurement scope. Per-state counts, dates, ranges and a digest of the ordered query result are in the [metadata](../model/rainfall_v1_info.json).

## Dates and features

For the first displayed forecast date D, the origin is D−1. The shared training and serving function reads historical measurements from D−8 through D−2. Targets use the exact observed dates D through D+6. Partition construction confines the entire history and all seven targets to a single period.

| Purpose | Eligible observations | Actual target dates | Distinct origins | State-origin examples |
|---|---|---|---:|---:|
| Estimator fitting | 2023-04-01 – 2024-12-31 | 2023-04-09 – 2024-12-29 | 611 | 20,149 |
| Probability calibration | 2025-01-01 – 2025-04-30 | 2025-01-09 – 2025-04-30 | 106 | 3,498 |
| Candidate selection | 2025-05-01 – 2025-10-31 | 2025-05-09 – 2025-10-31 | 170 | 5,610 |
| Independent test | 2025-11-01 – 2026-11-10 | 2025-11-09 – 2026-09-06 | 296 | 9,768 |

The last complete test origin was August 30, 2026. The subsequent gap and short October–November run could supply recent features for inference but could not supply both a seven-day history and seven observed targets for scoring.

The ordered inputs are `rain_lag1`, `rain_lag2`, `rain_lag3`, `rain_lag7`, `rain_sum3`, `rain_sum7`, `wet_count7`, `dry_streak7`, `humidity_lag1`, `humidity_lag2`, `temp_avg_lag1`, `temp_range_lag1`, `day_sin`, `day_cos`, `state_code`. Lags are relative to the origin. Dry streaks stop at seven days. Wet means strictly more than 0.1 mm. The annual sine and cosine describe seasonality and the state code is categorical. Rolling means would rescale the corresponding fixed-window sums. Both candidates used this same feature set, selected before scoring.

## Candidate selection

Seven direct Tweedie LightGBM regressors predicted nonnegative daily amounts. The alternative used a binary LightGBM classifier and a positive-mean Gamma LightGBM regressor per horizon. A Gamma log link allowed the model to estimate conditional arithmetic mean rainfall directly. Its expected amount combined the wet conditional mean and the training dry/trace mean, weighted by the isotonic-calibrated probabilities of the respective classes. Calibration used a separate chronological period. Each model used 140 trees, a learning rate of 0.04 and seed 42.

| Validation candidate | MAE (mm) | RMSE (mm) |
|---|---:|---:|
| Direct regression | 6.667 | **11.654** |
| Two-stage expected amount | **6.602** | 11.693 |
| Seasonal climatology | 7.161 | 12.145 |

RMSE was the primary selection measure for expected amount. The winning estimators and calibrators were serialized before constructing the test panel. The selected bundle retains the separate seven occurrence classifiers. A repeat run on the same database snapshot reproduced the serialized artifact byte for byte and every reported validation and test metric.

## Independent test results

Each horizon had 9,768 state-origin pairs. In total there were 68,376 forecasts, of which 46.61% verified wet. Occurrence decisions use a probability threshold of 0.5. The seasonal baseline uses state and target-month mean rainfall and wet frequency estimated from training observations. Persistence carries forward the last available rainfall at D−2 and its wet/dry flag.

| Forecast | MAE (mm) | RMSE (mm) | Occurrence Brier |
|---|---:|---:|---:|
| Direct regression + calibrated classifier | **3.827** | **9.629** | **0.126** |
| Seasonal climatology | 4.163 | 9.711 | 0.135 |
| Persistence | 4.451 | 13.174 | 0.197 |
| Always dry | 4.035 | 11.977 | 0.466 |

| Day | MAE (mm) | RMSE (mm) | Wet (%) | Precision | Recall | F1 | Brier | Publish probability |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 3.493 | 9.366 | 45.81 | .815 | .855 | .835 | .114 | Yes |
| 2 | 3.706 | 9.570 | 46.07 | .811 | .835 | .823 | .121 | Yes |
| 3 | 3.800 | 9.634 | 46.32 | .818 | .819 | .819 | .125 | Yes |
| 4 | 3.871 | 9.628 | 46.62 | .815 | .807 | .811 | .128 | Yes |
| 5 | 3.931 | 9.704 | 46.88 | .810 | .805 | .807 | .130 | Yes |
| 6 | 3.982 | 9.733 | 47.16 | .794 | .825 | .809 | .131 | Yes |
| 7 | 4.005 | 9.762 | 47.43 | .841 | .767 | .802 | .132 | Withheld |

Pooled precision was 0.814, recall 0.816 and F1 0.815. Ten-bin expected calibration error was 0.047. Each horizon needed Brier below seasonal climatology and expected calibration error ≤0.08 on both validation and test. Day 7 missed the validation Brier requirement (0.1122 versus 0.1108). Reliability-bin counts, mean predicted probabilities and observed frequencies are included for each horizon and baseline in the metadata.

| Observed amount | Forecasts | MAE (mm) | RMSE (mm) |
|---|---:|---:|---:|
| Dry or trace, ≤0.1 mm | 36,503 | 1.145 | 2.180 |
| Wet, >0.1 mm | 31,873 | 6.898 | 13.909 |
| Heavy, ≥25 mm | 2,537 | 30.925 | 43.890 |

Heavy is a study threshold. Counts include repeated verification dates at different lead times. Consecutive origins share observations, and states can share weather systems. The bootstrap resampled 22 time blocks jointly across horizons and states. Its interval includes zero. The short history, incomplete seasonal coverage, source changes and substantially larger heavy-rain errors limit generalization. This is a retrospective test against stored measurements. The API example below illustrates serving, independently of the test scores.

## Artifact and API

The bundle contains native LightGBM model strings and isotonic breakpoints in compressed JSON. The loader checks its SHA-256, feature and target order, estimator feature names, state mapping and evaluation metadata. Its SHA-256 is `21d153092d466d6ebac6058dd5a6f37f6ff84c423af6d441ebfa32641c153ed7`. [Rainfall artifact](../model/rainfall_v1.json.gz) · [Model metadata and metrics](../model/rainfall_v1_info.json)

A standard `POST /predict` returns `amount_withheld` with a null `ml_rainfall_mm` and eligible `ml_rain_probability` values in [0, 1]. The forecast page requests `preview_rainfall_candidate: true` and labels the resulting `research_preview`. Both paths keep the same dates and temperature predictions. The legacy `rainfall`, `rain_probability`, conditions and advisories remain rule-based. A failed artifact load or inference returns a distinct rainfall status and null ML fields. Shared insufficient history still produces the existing HTTP 422 error.

A real request for Karnataka starting November 12, 2026 returned 0.4342 mm and probability 0.1451 for day 1. Day 7 returned 1.4585 mm with a null probability. The API ran both saved models over a disposable PostgreSQL copy of the real observations. Its prediction audit write went to that copy. [Full request and seven-day response](rainfall_prediction_example.json)

## Reproduction and verification

With the repository's Python dependencies installed, set `DATABASE_URL` to a PostgreSQL database containing the source records (or use `backend/.env`). The training command below requires a new output directory. Compare the snapshot digest before comparing artifacts.

```sh
python backend/train_rainfall.py --output results/rainfall_repeat
```

Verification covered input rejection, duplicate dates, gaps, state identity, past-only feature parity, calendar targets, partition boundaries, calibration, output bounds, artifact corruption and both rainfall failure paths through FastAPI. The fixture contains 25 actual statewide Karnataka records from the read-only snapshot. PostgreSQL integration tests and browser forecast-history writes ran in a disposable database.

| Check | Result |
|---|---|
| Backend unit and PostgreSQL integration suites | 224 passed |
| Temperature consistency with PostgreSQL required | 4 of 4 state/date cases matched the training reference predictions |
| Frontend component and API tests | 61 passed |
| TypeScript and Vite production build | Passed |
| Playwright desktop and mobile | 4 passed, covering the real forecast flow and rainfall failure rendering on both viewports |

The temperature artifact matched SHA-256 `844fdadfbe2786d859cdfc55c2e7dc14eb0b2f420b339f3e877fa6856aa37adf`. The rainfall results concern only the separate rainfall artifact.

## Changed files

| Area | Repository paths |
|---|---|
| Training and inference | `backend/train_rainfall.py`, `backend/app/services/rainfall.py` |
| Models and evidence | `model/rainfall_v1.json.gz`, `model/rainfall_v1_info.json` |
| Forecast API | `backend/app/routes/prediction.py`, `backend/app/schemas.py`, `backend/app/services/weather_forecast_service.py` |
| Forecast page and client | `frontend/src/pages/ForecastPage.tsx`, `frontend/src/services/api.ts`, `frontend/src/types/api.ts` |
| Tests and fixture | `backend/tests/test_rainfall.py`, `backend/tests/fixtures/rainfall_karnataka.csv`, `backend/integration/test_postgresql.py`, `frontend/tests/browser/weather.spec.ts` |
| Documentation | `README.md`, `docs/RAINFALL_EVALUATION.md`, `docs/rainfall_prediction_example.json` |
