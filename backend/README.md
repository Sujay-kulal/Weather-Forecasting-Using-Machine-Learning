# Weather Forecasting API — Backend

FastAPI + PostgreSQL backend that serves 7-day average temperature
(`Temp_Avg`) forecasts for 33 Indian states using a LightGBM multi-output
pipeline trained on historical weather data (`model/weather_model_v3.joblib`).

```
Frontend  →  POST /predict {state, forecast_date}
                   ↓
             FastAPI (this backend)
                   ↓
     PostgreSQL: 7 historical records before D-1   (weather_data)
                   ↓
     Feature Builder: exact 20 training features   (app/services/feature_service.py)
                   ↓
     weather_model_v3.joblib → predicted 7-day Temp_Avg
                   ↓
     predictions table + JSON response
```

## 1. PostgreSQL Setup

Install PostgreSQL 16+ and create a database:

```bash
createdb weather_forecasting
```

## 2. Environment Variables

Copy `.env.example` to `.env` and configure:

```ini
DATABASE_URL=postgresql+psycopg://postgres@localhost:5432/weather_forecasting
ADMIN_TOKEN=your_admin_secret_token_here
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
ENABLE_INGESTION_SCHEDULER=false
```

No credentials are hardcoded — for a password-protected server use
`postgresql+psycopg://user:password@host:5432/weather_forecasting`.

## 3. Install Dependencies

```bash
pip install -r requirements.txt
```

For tests, install `pytest` from the development-only requirements file:

```bash
pip install -r requirements-dev.txt
```

## 4. Apply Migrations

Apply SQL migrations before deploying:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/002_prediction_metrics.sql
```

The migration adds nullable `model_version` and `actual_temp` columns and a
model-version uniqueness constraint. Existing prediction rows are not updated;
their new fields remain null initially.

## 5. Import the Dataset (safe to re-run)

```bash
python import_data.py
```

Loads all real rows from `data/archive_c/PSP_Weather_Merged_EDA_Cleaned.csv`
into `weather_data` (weather columns only — power-demand columns are excluded).
Existing rows are skipped, so re-running never duplicates.

### Keep Data Current (Open-Meteo Ingestion)

Because the CSV has a fixed end date, predictions for current/future dates will fail
without updated data. Use the ingestion script to pull latest observations:

```bash
python update_weather.py
```

## 6. Start the API

```bash
uvicorn app.main:app --reload
```

## 7. API Documentation

* Swagger UI: <http://localhost:8000/docs>
* ReDoc: <http://localhost:8000/redoc>

## 8. Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | App + PostgreSQL + model status |
| GET | `/states` | States available in the database |
| GET | `/districts/{state}` | Districts for a state |
| GET | `/locations/{state}/{district}` | Locations within a district |
| GET | `/locations/search?q=&limit=` | Location autocomplete search |
| GET | `/weather/{state}?limit=&offset=` | Historical weather (paginated) |
| GET | `/weather/{state}/recent?days=` | Recent measurements |
| POST | `/weather/lookup` | Weather lookup by location |
| POST | `/predict` | 7-day Temp_Avg forecast |
| GET | `/predictions?limit=&offset=&state=&model_version=` | Filtered prediction history |
| GET | `/model-info` | Model features, periods, metrics, validation status |
| GET | `/forecast/all?date=&day=1..7` | Selected forecast horizon for all model-supported states |
| GET | `/metrics/live` | Rolling 30-day model and persistence MAE |
| POST | `/admin/ingest` | Trigger manual weather ingestion (requires ADMIN_TOKEN) |

## 9. Example `/predict` Request

```bash
curl -X POST http://localhost:8000/predict -H "Content-Type: application/json" \
  -d '{"state": "Karnataka", "forecast_date": "2025-10-06"}'
```

## 10. How a Prediction Works (leakage-free)

The trained model's feature row for date `t` uses measurements at `t-1..t-8`
(`shift(1)`-based lags/rolls) and predicts days `t+1..t+7`. To forecast date **D**
the backend rebuilds that training row with `t = D-1`:

* `lag1/2/3_temp_avg` = Temp_Avg at D-2 / D-3 / D-4
* `lag1_temp_max/min`, `lag1_humidity`, `lag1_rainfall` = values at D-2
* `lag2_humidity`, `lag2_rainfall` = values at D-3
* `temp_range` = (lag1_temp_max − lag1_temp_min)
* `roll3_temp_avg` = mean of D-4..D-2, `roll7_temp_avg` = mean of D-8..D-2
* `rainfall_roll3`, `rainfall_roll7` = rolling rainfall means
* `month_sin/cos`, `day_of_year_sin/cos` = cyclical encoding of D-1
* `Season` = Winter (Dec–Feb), Summer (Mar–May), Monsoon (Jun–Sep), Post-Monsoon (Oct–Nov)
* `State` = requested state (label-encoded inside the saved pipeline)

Only records with `date < D-1` are read — day D's actual weather can never
influence its own prediction. Requests with an unknown state (404), without
7 prior records (422), stale history (422), or an invalid date (422) are
rejected, never answered with fabricated values.

## Project Structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI app, CORS, routers, startup
│   ├── database.py             # SQLAlchemy engine/session (PostgreSQL only)
│   ├── models.py               # ORM models (weather_data, predictions, locations, batches)
│   ├── schemas.py              # Pydantic request/response schemas
│   ├── routes/
│   │   ├── health.py           # GET /health
│   │   ├── weather.py          # GET /states, /weather/*, /districts/*, /locations/*
│   │   ├── prediction.py       # POST /predict, GET /predictions, /model-info, /forecast/all, /metrics/live
│   │   └── admin.py            # POST /admin/ingest
│   └── services/
│       ├── model_service.py    # Loads weather_model_v3.joblib at startup
│       ├── feature_service.py  # Exact training feature engineering
│       ├── metrics_service.py  # Rolling live MAE computation
│       ├── prediction_cache.py # TTL cache for predictions
│       ├── prediction_store.py # Prediction upsert logic
│       ├── resolve_location.py # Location resolution
│       ├── temperature.py      # Temperature rounding utilities
│       └── weather_forecast_service.py  # Daily forecast builder
├── tests/                      # pytest test suite
├── migrations/                 # SQL migration scripts
├── import_data.py              # CSV → PostgreSQL import (idempotent)
├── update_weather.py           # Open-Meteo live ingestion
├── backfill.py                 # Historical data backfill
├── requirements.txt            # Production Python dependencies
├── requirements-dev.txt        # Test dependencies (pytest)
├── .env.example                # Environment variable template
└── README.md                   # This file
```

## Testing

```bash
cd backend
python -m pytest tests/ -v
```
