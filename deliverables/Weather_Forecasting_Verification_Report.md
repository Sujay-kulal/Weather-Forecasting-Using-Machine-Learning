# Verification Report — Weather Forecasting Using Machine Learning

Verification date: 6 September 2026  
Scope: repository files and non-mutating local checks. Application source, model, dataset and deployment configuration were not changed.

## A. Project architecture

The implemented application follows this request path:

`React + Vite frontend → FastAPI API → PostgreSQL weather_data → feature_service → saved scikit-learn pipeline → predictions table → JSON response → frontend`

The frontend calls the API through `frontend/src/services/api.ts`. FastAPI creates the SQLAlchemy tables at startup, loads `model/weather_model.joblib` once, and routes requests to health, weather and prediction modules. `POST /predict` reads seven historical weather records before the model's as-of date, builds the training-compatible feature row, predicts, then writes an audit record to `predictions`.

## B. ML algorithm

- Selected and saved model: `Gradient Boosting` (`GradientBoostingRegressor` from scikit-learn).
- Saved artifact: `model/weather_model.joblib`.
- Target: next-day `Temp_Avg` in degrees Celsius.
- Candidate models evaluated by `train_model.py`: Linear Regression, Decision Tree, Random Forest, Gradient Boosting, and a naive persistence reference.
- Selection rule: lowest test RMSE among trained models.
- Split: chronological, first 80% of dates for training and remaining 20% for test. Metadata records train period `2023-04-08` to `2025-04-06`, and test period `2025-04-07` to `2025-10-05`.
- Stored Gradient Boosting test metrics: MAE `0.8760 °C`, RMSE `1.1854 °C`, R² `0.9694`.

## C. Dataset

The model reads `data/archive_c/PSP_Weather_Merged_EDA_Cleaned.csv`. The archive README calls it the primary integrated Weather-Driven Indian Power Demand Dataset and identifies Vaibhav Porwal as author under CC BY 4.0. The application deliberately selects only weather columns; power-demand columns are excluded.

| Check | Verified result |
|---|---:|
| Source rows | 31,177 |
| State labels | 34 |
| Date range | 2023-04-01 to 2025-10-06 |
| Rows per state | 916 to 917 |
| Required weather columns with missing values | 0 |
| Duplicate `(State, Date)` pairs | 0 |
| Exact duplicate rows | 0 |
| Seasons present | Winter, Summer, Monsoon, Post-Monsoon |

Required modelling columns: `Date`, `State`, `Temp_Max`, `Temp_Min`, `Temp_Avg`, `Humidity`, `Rainfall`, `Month`, `Season`.

Training selects these columns, parses `Date`, drops missing rows, then sorts by state and date. The database importer coerces dates and numeric fields, removes missing rows and duplicate `(state, date)` pairs, trims/title-cases state names, and skips keys that already exist in PostgreSQL.

## D. Exact model features

The saved metadata and backend use the same 13 features in this order:

1. `lag1_temp_avg`
2. `lag2_temp_avg`
3. `lag3_temp_avg`
4. `lag1_temp_max`
5. `lag1_temp_min`
6. `lag1_humidity`
7. `lag1_rainfall`
8. `roll3_temp_avg`
9. `roll7_temp_avg`
10. `month_sin`
11. `month_cos`
12. `Season`
13. `State`

Numeric features are standardised. `Season` and `State` are one-hot encoded with unknown categories ignored. For forecast date D, the backend forms the training row for D−1 using records D−2 through D−8, so day D data cannot leak into the prediction. It requires seven historical records and refuses stale history beyond two days.

## E. API endpoints

| Method | Endpoint | Verified implementation |
|---|---|---|
| GET | `/health` | App, PostgreSQL and loaded-model status |
| GET | `/states` | Distinct database states |
| GET | `/weather/{state}?limit=&offset=` | Paginated historical records, newest first |
| GET | `/weather/{state}/recent?days=` | Recent records, oldest first for charts |
| POST | `/predict` | Validates state/history, predicts next-day `Temp_Avg`, stores audit record |
| GET | `/predictions?limit=&offset=` | Prediction audit history |
| GET | `/model-info` | Saved model metadata, features, metrics and periods |

`POST /predict` accepts `state` and ISO `forecast_date`. Unknown states return 404. Missing or stale history returns 422. Prediction failures return 500 without fabricated values. Pydantic types validate dates and numeric query bounds.

## F. Frontend pages and features

The React single-page application exposes four tabbed pages:

- **Forecast:** choose a state and forecast date, submit `POST /predict`, view the result, typical MAE, latest known measurement and a 30-day context chart.
- **Weather History:** choose a state, view paginated PostgreSQL records in a table and max/average/minimum temperature chart, then load older data.
- **Model Performance:** view selected model, train/test periods, MAE/RMSE/R², all candidate metrics and grouped input features.
- **Prediction History:** load stored predictions, choose page size, filter loaded rows by state and load more.

The header polls `/health` every 30 seconds and displays online, degraded or offline state. Charts use Recharts. The frontend has no mock data path.

## G. PostgreSQL structure

| Table | Purpose | Key integrity rules |
|---|---|---|
| `weather_data` | One daily weather measurement per state | Primary key `id`; unique `(state, date)`; indexed `state` and `date`; non-null weather fields |
| `predictions` | Audit record for each `POST /predict` response | Primary key `id`; unique `(state, forecast_date, created_at)`; indexed `state` and `forecast_date`; server timestamp |

There is no foreign-key relationship declared between the two models. `weather_data` supplies inputs to forecasting; `predictions` stores the generated temperature and timestamp. PostgreSQL is mandatory: `database.py` rejects SQLite URLs and declares no SQLite fallback.

## H. Testing and validation results

| Check | Status | Evidence / result |
|---|---|---|
| Saved model loading | **PASS** | `model_service` loaded the pipeline; model `Gradient Boosting`; 13 features |
| Metadata/artifact agreement | **PASS** | `model_info.json` and `weather_model.joblib` loaded together successfully |
| Dataset null check | **PASS** | 0 nulls in all nine required modelling columns |
| Dataset duplicate check | **PASS** | 0 duplicate `(State, Date)` pairs and 0 exact duplicate rows |
| Dataset date check | **PASS** | Dates parsed; range verified as 2023-04-01 to 2025-10-06 |
| Frontend TypeScript + production build | **PASS** | `tsc --noEmit` and `vite build` completed. Vite emitted a >500 kB chunk-size warning. |
| PostgreSQL-only guard | **PASS** | Source rejects `sqlite` connection strings; no fallback exists |
| Secret/config scan | **PASS** | No hard-coded credential assignment found outside local `.env` and excluded logs; credentials were not displayed |
| Current backend health endpoint | **FAIL** | The configured local database URL uses port 5433; no listener was available there, so the API could not start/connect during this verification |
| Current database connection | **FAIL** | `check_connection()` returned `False` against the configured URL |
| Feature consistency test | **WARNING** | `backend/test_consistency.py` could not complete because it requires the unavailable configured database |
| Forecast generation | **WARNING** | Not executed in this verification because it needs reachable PostgreSQL and writes a prediction audit row |
| API integration endpoints | **WARNING** | Runtime integration calls were not revalidated because the configured backend was unavailable. Endpoint code was inspected. |
| Runtime date/limit validation | **WARNING** | Pydantic/FastAPI validation is implemented in source, but no current database-backed API run was possible |

No test result has been inferred from historic `uvicorn.log` entries.

## I. Deployment architecture

Only a local/development configuration is confirmed:

- Frontend: Vite development server on port 5173 by configuration.
- Backend: Uvicorn/FastAPI; documentation says port 8000.
- Database: PostgreSQL via `DATABASE_URL`; repository README documents local PostgreSQL 17.5 on port 5433.
- Cross-origin requests: `CORS_ORIGINS` controls an allow-list; default local origins include ports 3000 and 5173.
- Frontend base URL: `VITE_API_BASE_URL`, defaulting to `http://localhost:8000`.

No `vercel.json`, `render.yaml`, Dockerfile, Docker Compose file, GitHub Actions workflow, Neon connection string, or production service configuration was found. The Git remote points to GitHub, but a production hosting topology cannot be verified.

## J. Information not verified

- A deployed Vercel, Render, Neon or equivalent production environment.
- Production environment variable values, public URLs and production CORS origins.
- A current reachable PostgreSQL database at the repository's configured local URL.
- Live end-to-end health, forecast, API and feature-consistency execution under the current local configuration.
- A direct upstream download URL for the archive_c modelling CSV. The repository documents dataset name, author and license but not a direct acquisition link.
- Real-time forecasting. The code forecasts a requested next-day date from stored historical measurements; `update_weather.py` is a manually-run Open-Meteo Archive ingestion script.

## Source files inspected

`train_model.py`; `model/model_info.json`; `results/model_comparison.csv`; all backend application, routing, service, schema, importer, updater and consistency-test files; all frontend TypeScript source, configuration and README files; `data/archive_c/README.md`; source CSV metadata and records; root notebooks were identified but do not define the deployed application path.
