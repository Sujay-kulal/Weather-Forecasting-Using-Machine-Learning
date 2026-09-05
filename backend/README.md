# Weather Forecasting API — Backend (Phase 2)

FastAPI + PostgreSQL backend that serves next-day average temperature
(`Temp_Avg`) forecasts for 34 Indian states using the Gradient Boosting model
trained in Phase 1 (`model/weather_model.joblib`).

```
Frontend (later)  →  POST /predict {state, forecast_date}
                          ↓
                    FastAPI (this backend)
                          ↓
        PostgreSQL: 7 historical records before D-1   (weather_data)
                          ↓
        Feature Builder: exact 13 training features   (app/services/feature_service.py)
                          ↓
        weather_model.joblib → predicted Temp_Avg
                          ↓
        predictions table + JSON response
```

## 1. PostgreSQL setup

PostgreSQL 17.5 (portable binaries) is installed at `C:\Users\SUJAY\pgsql`
with data directory `C:\Users\SUJAY\pgdata`. Port **5433** is used because
port 5432 is not bindable on this machine (Windows denies the bind).

Start the server (if not running):

```bat
C:\Users\SUJAY\pgsql\bin\pg_ctl.exe -D C:\Users\SUJAY\pgdata -l C:\Users\SUJAY\pgdata\server.log -o "-p 5433" start
```

Create the database (already done):

```bat
C:\Users\SUJAY\pgsql\bin\createdb.exe -U postgres -p 5433 weather_forecasting
```

## 2. Environment variables

Copy `.env.example` to `.env` (already done for this machine):

```ini
DATABASE_URL=postgresql+psycopg://postgres@localhost:5433/weather_forecasting
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

No credentials are hardcoded — for a password-protected server use
`postgresql+psycopg://user:password@host:5432/weather_forecasting`.

## 3. Install dependencies

```bash
pip install -r requirements.txt
```

## 4. Import the dataset (safe to re-run)

```bash
python import_data.py
```

Loads all 31,177 real rows from `data/archive_c/PSP_Weather_Merged_EDA_Cleaned.csv`
into `weather_data` (weather columns only — power-demand columns are excluded).
Existing rows are skipped, so re-running never duplicates.

### Keep Data Current (Open-Meteo Ingestion)

Because the CSV ends at 2025-10-06, predictions for current/future dates will fail.
Use the built-in ingestion script to pull the latest real observations from the Open-Meteo Archive API:

```bash
python update_weather.py
```

This polls missing days up to the current date and inserts them safely. The script checks the latest measurement date for each state and pulls exact missing daily variables (`temperature_2m_max/min/mean`, `relative_humidity_2m_mean`, `precipitation_sum`).

## 5. Start the API

```bash
uvicorn app.main:app --reload
```

## 6. API documentation

* Swagger UI: <http://localhost:8000/docs>
* ReDoc: <http://localhost:8000/redoc>

## 7. Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | App + PostgreSQL + model status |
| GET | `/states` | States available in the database |
| GET | `/weather/{state}?limit=&offset=` | Historical weather (paginated) |
| GET | `/weather/{state}/recent?days=` | Recent measurements |
| POST | `/predict` | Next-day Temp_Avg forecast |
| GET | `/predictions?limit=&offset=` | Prediction history |
| GET | `/model-info` | Model name, target, features, metrics, train/test periods |

## 8. Example `/predict` request

```bash
curl -X POST http://localhost:8000/predict -H "Content-Type: application/json" ^
  -d "{\"state\": \"Karnataka\", \"forecast_date\": \"2025-10-06\"}"
```

## 9. Example response

```json
{
  "state": "Karnataka",
  "forecast_date": "2025-10-06",
  "predicted_temp_avg": 23.68,
  "unit": "deg C",
  "model": "Gradient Boosting",
  "typical_error_mae": 0.876,
  "last_known": { "date": "2025-10-04", "temp_avg": 23.71666666666667 }
}
```

## 10. How a prediction works (and why it is leakage-free)

The trained model's feature row for date `t` uses measurements at `t-1..t-8`
(`shift(1)`-based lags/rolls) and predicts day `t+1`. To forecast date **D**
the backend rebuilds that training row with `t = D-1`:

* `lag1/2/3_temp_avg` = Temp_Avg at D-2 / D-3 / D-4
* `lag1_temp_max/min`, `lag1_humidity`, `lag1_rainfall` = values at D-2
* `roll3_temp_avg` = mean of D-4..D-2, `roll7_temp_avg` = mean of D-8..D-2
* `month_sin/cos`, `Season` = month of D-1 (Winter Dec–Feb, Summer Mar–May,
  Monsoon Jun–Sep, Post-Monsoon Oct–Nov)
* `State` = requested state (one-hot encoded inside the saved pipeline)

Only records with `date < D-1` are read — day D's actual weather can never
influence its own prediction. Requests with an unknown state (404), without
7 prior records (422), stale history (422), or an invalid date (422) are
rejected, never answered with fabricated values.

`backend/test_consistency.py` proves the backend features match
`train_model.py` exactly (max difference < 1e-13, identical predictions) for
sample states/dates.

## Project structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI app, CORS, routers
│   ├── database.py             # SQLAlchemy engine/session (PostgreSQL only)
│   ├── models.py               # weather_data + predictions tables
│   ├── schemas.py              # Pydantic request/response schemas
│   ├── routes/
│   │   ├── health.py           # GET /health
│   │   ├── weather.py          # GET /states, /weather/{state}, .../recent
│   │   └── prediction.py       # POST /predict, GET /predictions, /model-info
│   └── services/
│       ├── model_service.py    # loads weather_model.joblib once at startup
│       └── feature_service.py  # exact training feature engineering
├── import_data.py              # CSV → PostgreSQL import (idempotent)
├── test_consistency.py         # backend-vs-training feature consistency test
├── requirements.txt
├── .env / .env.example
└── README.md
```

## Testing

```bash
python test_consistency.py    # feature consistency vs train_model.py
uvicorn app.main:app --port 8000   # then exercise /docs endpoints
```
