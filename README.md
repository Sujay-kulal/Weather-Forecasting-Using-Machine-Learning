# Weather Forecasting Using Machine Learning

ML temperature forecasting for Indian states/UTs using a LightGBM model trained on historical weather data. The map can also display live weather observations for Indian cities; those city readings are not ML forecasts.

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
- `backend`: FastAPI with LightGBM model on `127.0.0.1:8000`; ingestion scheduling is disabled by default and must be explicitly enabled
- `frontend`: Nginx serving the React SPA and proxying `/api/` to backend on `127.0.0.1:8080`

### 3. Populate the Database (Initial Backfill)

When starting with a fresh database volume, populate historical weather data from 2015 to the latest available date by running `backfill.py` inside the backend container:

```bash
docker compose exec backend python backend/backfill.py
```

This ingests historical weather records for all states with retries, delay throttling, and idempotent upserts.

### Geographic scope

The trained model and bundled historical dataset are state/UT-level. District and location fields are reserved for future datasets; city-level ML forecasting requires city-level historical training data and a retrained model. Do not present the live city-weather layer as a city forecast.

### 4. Health Check

Verify that the system is running:

```bash
curl http://localhost:8080/api/health
```

## Current model contract

- The saved model is a LightGBM multi-output pipeline that returns seven
  consecutive `Temp_Avg` values, beginning on the requested forecast date.
- It consumes 20 engineered features built from state-level weather history.
  District and location-level ML forecasts are not supported by the current
  training data.
- The forecast page defaults to two days after the latest observation so the
  model's existing lag alignment can include that observation.
- The current v3 artifact's stored evaluation and interval metadata are marked
  historical and unvalidated for that artifact. Prediction interval bounds
  are not returned until a calibration is explicitly validated for the current
  artifact.

## Evaluation

`train_honest_eval.py` reads PostgreSQL in a read-only transaction and writes aggregate metrics plus
per-target held-out predictions under `results/`. It uses date-based training,
calibration, and test windows separated by an eight-day forecast-origin gap for the seven-day target
and does not replace the served model or update its metadata.

`retrain_v3.py` is a separate, explicit training operation. It replaces the
v3 model artifact and clears active metrics and interval claims until the new
artifact is evaluated. Do not run it as part of ordinary setup.

For backend setup, API behavior, and data ingestion details, see
[`backend/README.md`](backend/README.md). For the frontend, see
[`frontend/README.md`](frontend/README.md).
