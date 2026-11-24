# Weather Forecasting Using Machine Learning

> **VTU Final-Year B.E. Project — Department of Computer Science and Engineering**  
> Moodlakatte Institute of Technology, Kundapura (MITK) · Visvesvaraya Technological University, Belagavi

A production-ready, full-stack weather forecasting application that uses a saved **LightGBM** model to deliver **seven-day daily temperature predictions** for all 33 Indian states and union territories. A second LightGBM model provides calibrated **rainfall probability** forecasts as a research preview. Live weather data is sourced from **Open-Meteo** and stored in **PostgreSQL**.

---

## 1. Problem Statement

Traditional numerical weather prediction (NWP) systems require supercomputer infrastructure and domain expertise beyond the reach of regional deployments. This project demonstrates that a machine learning pipeline — trained on publicly available historical reanalysis data — can produce competitive multi-day temperature forecasts for Indian states with low computational overhead, making ML-based forecasting accessible as a deployable web application.

---

## 2. Project Objectives

1. Build a reproducible LightGBM pipeline that predicts daily average temperature for 7 consecutive forecast days per state.
2. Provide a research-preview rainfall probability model with honest calibration and published evaluation evidence.
3. Deliver a production-grade FastAPI + React application with PostgreSQL persistence, automated ingestion, and deployment-ready Docker and cloud configuration.
4. Maintain academic honesty: all metrics are computed from code-traceable data with explicit training/evaluation partitions.

---

## 3. Key Features

| Feature | Details |
|---|---|
| **7-day temperature forecast** | LightGBM v3 model, 20 features, 33 Indian states/UTs |
| **India weather map** | Interactive Leaflet map — ML forecast per state + current Open-Meteo conditions |
| **Rainfall research preview** | Calibrated probability (days 1–6) · Experimental amounts behind opt-in toggle |
| **Weather history** | Stored statewide records with district/location filters and date range selection |
| **Prediction history** | Paginated, filterable archive of all forecast runs |
| **Model performance dashboard** | Live diagnostic metrics, training-overlap evaluation, model metadata |
| **Admin data ingestion** | Token-secured endpoint, idempotent upserts, scheduler-ready |

---

## 4. System Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  React 18 Frontend (Vite + TypeScript)                         │
│  Six pages: Forecast · Map · History · Predictions ·           │
│             ML Dashboard · Model Performance                   │
└───────────────────────────┬────────────────────────────────────┘
                            │  REST (HTTP /api)
┌───────────────────────────▼────────────────────────────────────┐
│  FastAPI Backend                                               │
│  Routes: /forecast · /weather · /predictions ·                 │
│          /model-info · /admin/ingest · /health · /ready        │
│  Services: model_service · feature_service · rainfall          │
│            ingestion_service · prediction_store                │
└──────────┬───────────────────────────┬─────────────────────────┘
           │  SQLAlchemy (psycopg)     │  HTTP
┌──────────▼──────────┐  ┌────────────▼─────────────────────────┐
│  PostgreSQL 16+      │  │  Open-Meteo API (free, no key)        │
│  weather_data        │  │  Current conditions · Historical data │
│  predictions         │  └──────────────────────────────────────┘
│  prediction_metrics  │
└─────────────────────┘
```

---

## 5. Technology Stack

| Layer | Technology |
|---|---|
| **ML** | Python 3.11 · LightGBM · scikit-learn · joblib · pandas · NumPy |
| **Backend** | FastAPI · SQLAlchemy · psycopg (v3) · Uvicorn |
| **Frontend** | React 18 · TypeScript · Vite · Recharts · React-Leaflet |
| **Database** | PostgreSQL 16+ (Neon serverless in production) |
| **Deployment** | Docker · Docker Compose · Render (backend) · Vercel (frontend) · Neon (DB) |
| **CI/CD** | GitHub Actions (CI + daily weather ingestion workflow) |
| **Testing** | pytest · Playwright |
| **Data source** | Open-Meteo · PSP Weather CSV (Kaggle) |

---

## 6. Machine Learning Methodology

### Temperature Model (LightGBM v3)

The v3 model predicts daily average temperature for each of 7 forecast horizons simultaneously using a multi-output LightGBM pipeline.

**Feature set (20 features):**

| Category | Features |
|---|---|
| Temperature lags | `lag1_temp_avg`, `lag2_temp_avg`, `lag3_temp_avg`, `lag1_temp_max`, `lag1_temp_min` |
| Climate lags | `lag1_humidity`, `lag2_humidity`, `lag1_rainfall`, `lag2_rainfall` |
| Derived | `temp_range`, `roll3_temp_avg`, `roll7_temp_avg`, `roll3_humidity`, `roll7_humidity` |
| Calendar | `month`, `day_of_year`, `season` (cyclically encoded) |
| Geographic | `state` (categorical), `latitude`, `longitude` |

**Training data:** Open-Meteo historical reanalysis, cutoff **2026-10-22**  
**Training partition:** per-state calendar windows, 8-day buffer before evaluation

### Rainfall Model (Research Preview)

A second LightGBM model provides calibrated binary probabilities for >0.1 mm rainfall per horizon. Rainfall amounts are withheld by default because RMSE gain (+0.083 mm, 0.85%) missed the pre-registered 1% independent release threshold. See [`docs/RAINFALL_EVALUATION.md`](docs/RAINFALL_EVALUATION.md) for full methodology.

---

## 7. Model Evaluation Results

> **Validation status: Partial.** The training-overlap diagnostic below is included for transparency. Independent post-cutoff evaluation requires weather observations through 2026-12-06 (pending).

### Training-Overlap Diagnostic (informational only)

Evaluation on the PSP historical CSV, origins 2025-08-23 to 2025-09-21 — these dates fall **within** the recorded training period.

| Model | MAE (°C) | RMSE (°C) | R² |
|---|---:|---:|---:|
| **LightGBM v3** | **0.8065** | **1.0876** | **0.9363** |
| Persistence baseline | 0.9612 | 1.2575 | 0.9149 |
| Climatology baseline | 0.9853 | 1.3234 | 0.9057 |

> [!IMPORTANT]
> These scores overlap the training period and are **not** independent held-out results. Run `python backend/evaluate_deployed_artifact.py --mode independent --test-window 30` once post-cutoff observations are available to obtain unbiased evaluation results.

**Model artifact SHA-256:**

| File | SHA-256 |
|---|---|
| `model/weather_model_v3.joblib` | `844fdadfbe2786d859cdfc55c2e7dc14eb0b2f420b339f3e877fa6856aa37adf` |
| `model/rainfall_v1.json.gz` | `21d153092d466d6ebac6058dd5a6f37f6ff84c423af6d441ebfa32641c153ed7` |

---

## 8. Application Screenshots

| Forecast Page | India Map |
|:---:|:---:|
| ![Forecast](screenshot/01_forecast.png) | ![India Map](screenshot/02_india_map.png) |

| ML Dashboard | Model Performance |
|:---:|:---:|
| ![ML Project](screenshot/03_ml_project.png) | ![Metrics](screenshot/05_model_metrics.png) |

| Weather History | Prediction History |
|:---:|:---:|
| ![History](screenshot/04_weather_history.png) | ![Predictions](screenshot/06_predictions.png) |

---

## 9. Installation and Setup

### Option A: Docker Compose (Recommended)

```sh
# Clone the repository
git clone https://github.com/Sujay-kulal/Weather-Forecasting-Using-Machine-Learning.git
cd Weather-Forecasting-Using-Machine-Learning

# Configure environment
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD and ADMIN_TOKEN

# Start all services (database, backend, frontend via nginx)
docker compose up --build -d --wait

# Populate with recent weather data (last 14 days)
docker compose exec backend python backend/update_weather.py --days-back 14

# Verify
curl --fail http://127.0.0.1:8080/api/ready
```

Open the dashboard at [localhost:8080](http://127.0.0.1:8080) and FastAPI docs at [localhost:8001/docs](http://127.0.0.1:8001/docs).

### Option B: Local Development

**Prerequisites:** Python 3.11+, PostgreSQL 16+, Node.js 20+

```sh
# Backend
python -m pip install -r backend/requirements-dev.txt
python backend/migrate_db.py --apply --allow-host localhost,127.0.0.1
python backend/update_weather.py --days-back 14
python -m uvicorn --app-dir backend app.main:app --reload
```

```sh
# Frontend (new terminal)
cd frontend
npm ci
npm run dev
```

Vite serves the app on port 5173 and proxies `/api` to port 8000.

**Load historical CSV data (optional):**
```sh
python fetch_data.py        # downloads PSP dataset from Kaggle
python backend/import_data.py
```

**Backfill older dates:**
```sh
docker compose exec backend python backend/backfill.py --start-date YYYY-MM-DD --end-date YYYY-MM-DD
```

---

## 10. Testing Instructions and Verified Results

### Backend Unit Tests

```sh
python -m pytest backend/tests -q
```

**Verified baseline: 207 passed, 0 failed** (196 unit + 11 integration)

### PostgreSQL Integration Tests

Requires a disposable PostgreSQL database with a name ending in `_test`:

```sh
set WEATHER_TEST_DATABASE_URL=postgresql+psycopg://user:pass@localhost/weather_test
python -m pytest backend/integration -q
```

### AST and Test Preservation Audit

```sh
python scripts/verify_ast_preservation.py
```

Verifies 81 unique reference test functions are preserved and unweakened.

### Frontend Tests

```sh
cd frontend
npm ci
npm test         # 61 component and API client tests
npm run build    # TypeScript check + Vite production build
```

**Verified baseline: 61 passed, 0 failed**

### Browser End-to-End Tests

```sh
cd frontend
npx playwright install chromium
npm run test:browser    # requires built frontend + live database
```

**Verified baseline: 2 passed, 0 failed** (desktop + mobile viewport)

### Docker Compose Configuration Validation

```sh
docker compose --env-file .env.example config --quiet
```

### Prediction Smoke Test

```sh
curl -X POST http://localhost:8001/forecast \
  -H "Content-Type: application/json" \
  -d '{"state": "Karnataka", "start_date": "YYYY-MM-DD"}'
```

---

## 11. Live Application and API

| Service | URL |
|---|---|
| **Frontend** | [https://weather-forecasting-using-machine-learning.vercel.app](https://weather-forecasting-using-machine-learning.vercel.app) |
| **Backend API** | Render deployment — see `render.yaml` |
| **API Documentation** | `/docs` on the backend service |

> [!NOTE]
> The Render free tier sleeps after inactivity. The `/ready` endpoint wakes the service. GitHub Actions runs a daily ingestion workflow at 06:47 IST.

---

## 12. Repository Structure

```
Weather-Forecasting-Using-Machine-Learning/
├── .github/
│   └── workflows/
│       ├── ci.yml                        # CI: backend tests + frontend build
│       └── weather-ingestion.yml         # Daily Open-Meteo ingestion
├── backend/
│   ├── app/                              # FastAPI application
│   │   ├── routes/                       # API route handlers
│   │   └── services/                     # Business logic and ML inference
│   ├── migrations/                       # PostgreSQL schema migrations
│   ├── tests/                            # Unit test suite (pytest)
│   ├── integration/                      # PostgreSQL integration tests
│   ├── Dockerfile
│   ├── requirements.txt
│   └── requirements-dev.txt
├── frontend/
│   ├── src/
│   │   ├── pages/                        # Six application pages
│   │   ├── components/                   # Shared UI components
│   │   ├── services/                     # API client
│   │   └── types/                        # TypeScript types
│   ├── tests/                            # Component + browser tests
│   └── public/                           # Map GeoJSON and static assets
├── model/
│   ├── weather_model_v3.joblib           # Deployed temperature LightGBM model
│   ├── model_info.json                   # Feature list, metadata
│   ├── rainfall_v1.json.gz               # Rainfall model artifact
│   ├── rainfall_v1_info.json             # Rainfall evaluation metadata
│   └── evaluation_results_v3.json        # Independent evaluation status
├── docs/
│   ├── RAINFALL_EVALUATION.md            # Rainfall methodology and evidence
│   ├── TEST_INFRA.md                     # Test infrastructure documentation
│   └── audit/                            # Point-in-time audit reports
├── scripts/
│   ├── verify_ast_preservation.py        # Test preservation auditor
│   └── verify_disposable_pg_integration.py
├── screenshot/                           # Application UI screenshots
├── .env.example                          # Environment variable template
├── .gitignore
├── .dockerignore
├── docker-compose.yml
├── render.yaml                           # Render Blueprint
├── requirements-training.txt             # Dependencies for model training
├── fetch_data.py                         # Kaggle dataset downloader
├── fetch_karnataka_dataset.py            # Karnataka-specific data fetcher
├── train_model.py                        # Model training script
└── retrain_v3.py                         # v3 retraining script
```

---

## 13. Deployment: Render + Neon + Vercel

```sh
# Schema migration (run once via direct Neon connection)
python backend/migrate_db.py --apply --allow-host <neon-direct-host>

# Render environment variables required:
#   DATABASE_URL  — Neon pooled connection URL
#   ADMIN_TOKEN   — matches WEATHER_INGESTION_ADMIN_TOKEN GitHub secret
#   CORS_ORIGINS  — Vercel frontend URL

# Vercel environment variable:
#   VITE_API_BASE_URL — Render backend URL
```

See [Neon connection pooling](https://neon.com/docs/connect/connection-pooling) and the [Render Blueprint reference](https://render.com/docs/blueprint-spec) for details.

---

## 14. Project Limitations

| Limitation | Detail |
|---|---|
| **Independent validation pending** | Post-cutoff (>2026-10-30) results require observations through 2026-12-06 |
| **Training-overlap diagnostic** | Published scores overlap training dates — treat as upper-bound estimates |
| **Rainfall amounts withheld** | RMSE gain (0.85%) missed the pre-registered 1% threshold; shown as research preview only |
| **Statewide representative coordinates** | Model uses one lat/lon per state — station-level accuracy is out of scope |
| **Free-tier cold starts** | Render free tier sleeps after inactivity; first request may take ~30 s |
| **Calendar features only** | Model uses lag/roll features and calendar seasonality — no NWP assimilation |

---

## 15. Team Members and Project Guide

| Role | Name |
|---|---|
| **Project Guide** | *(Name of your faculty guide)* |
| **Developer** | Sujay Kulal |
| **Institution** | Moodlakatte Institute of Technology, Kundapura (MITK) |
| **Department** | Computer Science and Engineering |
| **University** | Visvesvaraya Technological University (VTU), Belagavi |
| **Academic Year** | 2025–2026 |

---

## 16. Data Sources and References

| Source | Use |
|---|---|
| **Open-Meteo** (open-meteo.com) | Current conditions, daily reanalysis, historical weather API |
| **PSP Weather CSV** (Kaggle) | Historical statewide weather for model training and evaluation |
| **GeoJSON India states** | Interactive map boundaries |

### Key References

- Chen, T., & Guestrin, C. (2016). XGBoost: A scalable tree boosting system. *KDD 2016*.
- Ke, G. et al. (2017). LightGBM: A highly efficient gradient boosting decision tree. *NeurIPS 2017*.
- Hastie, T., Tibshirani, R., & Friedman, J. (2009). *The Elements of Statistical Learning*. Springer.
- Open-Meteo documentation: https://open-meteo.com/en/docs
- FastAPI documentation: https://fastapi.tiangolo.com
- React documentation: https://react.dev

---

*For backend API and local development details, see [`backend/README.md`](backend/README.md). For frontend architecture, see [`frontend/README.md`](frontend/README.md).*
