# Weather Forecasting API — Backend (Phase 2)

FastAPI + PostgreSQL backend that serves seven-day average temperature
(`Temp_Avg`) forecasts using the saved multi-output model configured by
`model/model_info.json` (currently identified there as LightGBM). The model
metadata defines 20 input features: 18 numeric features plus `Season` and
`State`.

```
React frontend  →  POST /predict {state, forecast_date}
                         ↓
                   FastAPI backend
                         ↓
       PostgreSQL: 7 records strictly before D-1
                         ↓
       Feature builder: 20 ordered model inputs
                         ↓
       Configured saved multi-output model
                         ↓
       Seven daily Temp_Avg forecast values
                         ↓
       predictions audit record + JSON response
```

## 1. PostgreSQL setup

PostgreSQL 17.5 (portable binaries) is installed at `C:\Users\SUJAY\pgsql`
with data directory `C:\Users\SUJAY\pgdata`. Port **5433** is used because
port 5432 is not bindable on this machine (Windows denies the bind).

Start the server (if not running):

```bat
C:\Users\SUJAY\pgsql\bin\pg_ctl.exe -D C:\Users\SUJAY\pgdata -l C:\Users\SUJAY\pgdata\server.log -o "-p 5433" start
```

Create the database (standard database name is `weather_db`):

```bat
C:\Users\SUJAY\pgsql\bin\createdb.exe -U postgres -p 5432 weather_db
```

## 2. Environment variables

Copy `.env.example` to `.env`:

```ini
DATABASE_URL=postgresql+psycopg://postgres:your_password@localhost:5432/weather_db
ADMIN_TOKEN=your_admin_secret_token_here
ENABLE_INGESTION_SCHEDULER=false
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:8080
```

No credentials are hardcoded — for a password-protected server use
`postgresql+psycopg://user:password@host:5432/weather_db`.

## 3. Install dependencies

```bash
pip install -r requirements.txt
```

For tests, install `pytest` from the development-only requirements file:

```bash
pip install -r requirements-dev.txt
```

## 4. Prediction metrics migration

Apply the additive SQL migration before deploying the updated API:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/002_prediction_metrics.sql
```

The migration adds nullable `model_version` and `actual_temp` columns and a
model-version uniqueness constraint. Existing prediction rows are not updated;
their new fields remain null initially. The scheduled job may fill `actual_temp`
when matching historical weather becomes available; historical model versions
and duplicate records remain unchanged.

## 5. Import the dataset (safe to re-run)

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

## 6. Start the API

```bash
uvicorn app.main:app --reload
```

## 7. API documentation

* Swagger UI: <http://localhost:8000/docs>
* ReDoc: <http://localhost:8000/redoc>

## 8. Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | App + PostgreSQL + model status |
| GET | `/states` | States available in the database |
| GET | `/weather/{state}?limit=&offset=` | Historical weather (paginated) |
| GET | `/weather/{state}/recent?days=` | Recent measurements |
| POST | `/predict` | Seven-day Temp_Avg forecast |
| GET | `/predictions?limit=&offset=&state=&model_version=` | Filtered prediction history with total count |
| GET | `/model-info` | Model features, train/calibration/test periods, per-horizon metrics, validation status |
| GET | `/forecast/all?date=&day=1..7` | Selected forecast horizon for each model-supported state |
| GET | `/metrics/live` | Rolling 30-day model and persistence MAE on matched actuals |

## 9. Example `/predict` request

```bash
curl -X POST http://localhost:8000/predict -H "Content-Type: application/json" ^
  -d "{\"state\": \"Karnataka\", \"forecast_date\": \"2025-10-06\"}"
```

## 10. Response shape

A successful `/predict` response includes the requested state and forecast date,
`predicted_temp_avg` as a seven-value array in degrees Celsius, the model name,
the artifact-valid typical MAE when available, and the latest historical
measurement used. Exact values depend on the selected location, date, database
history, and loaded model artifact.

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
│       ├── model_service.py    # loads the artifact configured by model/model_info.json once at startup
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
