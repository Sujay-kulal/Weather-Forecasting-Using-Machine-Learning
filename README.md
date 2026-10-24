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

### 2. Start the Stack

Start all containers in detached mode:

```bash
docker compose up --build -d
```

Services started:
- `db`: PostgreSQL 16 on `127.0.0.1:5432`
- `backend`: FastAPI with LightGBM model and APScheduler on `127.0.0.1:8000`
- `frontend`: Nginx serving the React SPA and proxying `/api/` to backend on port `8080`

### 3. Populate the Database (Initial Backfill)

When starting with a fresh database volume, populate historical weather data from 2015 to the latest available date by running `backfill.py` inside the backend container:

```bash
docker compose exec backend python backfill.py
```

This ingests historical weather records for all states with retries, delay throttling, and idempotent upserts.

### Geographic scope

The trained model and bundled historical dataset are state/UT-level. District and location fields are reserved for future datasets; city-level ML forecasting requires city-level historical training data and a retrained model. Do not present the live city-weather layer as a city forecast.

### 4. Health Check

Verify that the system is running:

```bash
curl http://localhost:8080/api/health
```
