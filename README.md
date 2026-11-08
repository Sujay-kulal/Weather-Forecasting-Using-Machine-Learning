# Weather Forecasting Using Machine Learning

ML-powered 7-day average temperature forecasting for 33 Indian states/UTs using a LightGBM multi-output model trained on historical weather data (2015–present). Features a React frontend with interactive India map, historical weather charts, and prediction history.

---

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────────────┐
│  React/TypeScript   │     │  FastAPI Backend                 │
│  Vite + Leaflet     │────▶│  LightGBM v3 Pipeline            │
│  Vercel (prod)      │ API │  PostgreSQL (Neon prod)           │
│  :8080 (Docker)     │     │  Render (prod) / :8000 (dev)     │
└─────────────────────┘     └──────────────────────────────────┘
```

- **Model**: LightGBM multi-output pipeline (`model/weather_model_v3.joblib`) — 20 engineered features, 7-day Temp_Avg forecast
- **Backend**: FastAPI + SQLAlchemy 2.0 + psycopg (v3) + APScheduler
- **Frontend**: React 18 + TypeScript + Vite + Leaflet maps + Recharts
- **Database**: PostgreSQL (Neon on production, local/Docker for development)
- **Deployment**: Docker Compose (local), Render (backend), Vercel (frontend)

> The India Map page also displays live Open-Meteo city weather observations; those are **not** ML forecasts.

---

## Getting Started with Docker

### 1. Environment Setup

Copy `.env.example` to `.env` and fill in your passwords and secrets:

```bash
cp .env.example .env
```

Ensure all required variables (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `ADMIN_TOKEN`) are set.

The Compose stack runs a one-shot migration service after PostgreSQL is ready
and before the API starts. Normal API startup does not create or alter tables.

### 2. Start the Stack

Start all containers in detached mode:

```bash
docker compose up --build -d
```

Services started:
- `db`: PostgreSQL 16 on `127.0.0.1:5432`
- `migrate`: one-shot schema migration against the Compose database
- `backend`: FastAPI with LightGBM model on port `8000` (mapped to `127.0.0.1:8001` on host)
- `frontend`: Nginx serving the React SPA and proxying `/api/` to backend on `127.0.0.1:8080`

### 3. Populate the Database (Initial Backfill)

When starting with a fresh database volume, populate historical weather data from 2015 to the latest available date by running `backfill.py` inside the backend container:

```bash
docker compose exec backend python backend/backfill.py
```

This ingests historical weather records for all states with retries, delay throttling, and idempotent upserts.

### 4. Health Check

Verify that the system is running:

```bash
curl http://localhost:8080/api/health
```

---

## Model Contract

- The saved model is a LightGBM multi-output pipeline that returns seven
  consecutive `Temp_Avg` values, beginning on the requested forecast date.
- It consumes 20 engineered features built from state-level weather history.
  District and location-level ML forecasts are not supported by the current
  training data.
- The forecast page defaults to one day after the latest observation. The
  `/forecast/all` map endpoint defaults to two days after the latest
  observation to ensure the model's lag alignment includes that observation.
- The current v3 artifact's stored evaluation and interval metadata are marked
  historical and unvalidated for that artifact. Prediction interval bounds
  are not returned until a calibration is explicitly validated for the current
  artifact.

### Geographic Scope

The trained model and bundled historical dataset are state/UT-level. District and location fields are reserved for future datasets; city-level ML forecasting requires city-level historical training data and a retrained model. Do not present the live city-weather layer as a city forecast.

---

## Evaluation

`train_honest_eval.py` reads PostgreSQL in a read-only transaction and writes aggregate metrics plus
per-target held-out predictions under `results/`. It uses date-based training,
calibration, and test windows separated by an eight-day forecast-origin gap for the seven-day target
and does not replace the served model or update its metadata.

`retrain_v3.py` is a separate, explicit training operation. It replaces the
v3 model artifact and clears active metrics and interval claims until the new
artifact is evaluated. Do not run it as part of ordinary setup.

---

## Project Structure

```
├── backend/                 # FastAPI application
│   ├── app/
│   │   ├── main.py          # FastAPI app, CORS, routers, startup
│   │   ├── database.py      # SQLAlchemy engine/session (PostgreSQL only)
│   │   ├── models.py        # ORM models (weather_data, predictions, etc.)
│   │   ├── schemas.py       # Pydantic request/response schemas
│   │   ├── routes/          # API route handlers
│   │   └── services/        # Business logic (features, model, caching)
│   ├── tests/               # Backend test suite
│   ├── migrations/          # SQL migration scripts
│   ├── import_data.py       # CSV → PostgreSQL import (idempotent)
│   ├── update_weather.py    # Open-Meteo live ingestion
│   ├── backfill.py          # Historical data backfill
│   └── requirements.txt     # Python dependencies
├── frontend/                # React SPA
│   ├── src/
│   │   ├── pages/           # Forecast, History, Map, etc.
│   │   ├── components/      # Reusable UI components
│   │   ├── services/        # API client
│   │   └── types/           # TypeScript type definitions
│   └── package.json
├── model/                   # Trained model artifacts
│   ├── weather_model_v3.joblib
│   └── model_info.json      # Model metadata, features, metrics
├── docs/                    # Project documentation
│   └── audit/               # Audit and review reports
├── deliverables/            # Presentation and submission materials
├── scripts/                 # Utility and diagnostic scripts
├── docker-compose.yml       # Local development stack
├── Dockerfile               # Backend container
└── README.md                # This file
```

---

## Further Documentation

- Backend setup, API endpoints, and data ingestion: [`backend/README.md`](backend/README.md)
- Frontend development and pages: [`frontend/README.md`](frontend/README.md)
