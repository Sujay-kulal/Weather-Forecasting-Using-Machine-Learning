# Weather Forecasting API

FastAPI and PostgreSQL service for seven-day average-temperature forecasts over
33 Indian states and union territories. The saved LightGBM pipeline expects 20
engineered features and returns seven values beginning on the requested date.
District and location fields are reserved for future location-specific training
data; the current model is state-level.

## Setup

1. Start PostgreSQL and create a database.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` and the other local
   configuration values. Never commit the populated `.env`.
3. Install the pinned API/model-serving dependencies with
   `pip install -r requirements.txt`. From the repository root, training and
   plotting scripts can install the additional Matplotlib dependency with
   `pip install -r requirements-training.txt`.
4. Apply the schema migration explicitly for a fresh or existing database:

   ```bash
   python migrate_db.py --apply
   ```

   The migration creates missing tables, adds location fields and indexes, and
   removes the legacy `(state, date)` uniqueness constraint. Normal API startup
   never creates or changes tables. `python migrate_db.py --downgrade` is
   available only when no location-specific records make the old key invalid.
   Non-local database hosts require an explicit `--allow-host <exact-hostname>`
   acknowledgement; the Compose migration is pinned to the internal `db` host.
5. Start the API from this directory. Scheduled ingestion is disabled by
   default; set `ENABLE_INGESTION_SCHEDULER=true` only for one deployment:

   ```bash
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

Open `/docs` for the interactive API documentation.

## Data

Run the migration before `import_data.py`; importing no longer creates or
changes the schema. `import_data.py` imports the bundled CSV. `backfill.py`
and `update_weather.py` retrieve daily data from Open-Meteo
and write to PostgreSQL;
they are mutating operations. Use them only with a database intended for this
project. The data model represents one state-level weather series and should
not be interpreted as city-level observations.

The configured source records and their measurement provenance are not
independently verified by the application. Preserve source and location
metadata when adding any new dataset.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | PostgreSQL connectivity and model availability |
| GET | `/states` | States supported by the model |
| GET | `/weather/{state}` | Paginated state history |
| GET | `/weather/{state}/recent` | Recent measurements |
| GET | `/districts/{state}`, `/locations/{state}/{district}` | Available location filters |
| POST | `/predict` | Seven-day forecast; writes a prediction record |
| GET | `/predictions` | Stored prediction history |
| GET | `/model-info` | Model feature and evaluation metadata |
| GET | `/forecast/all` | First forecast value for each model-supported state |

For a requested forecast date D, the saved model uses measurements through
D−2, matching the model's lagged training-row contract. The frontend defaults
to two days after the latest measurement so that the newest observation is
included. Requests with insufficient or stale history are rejected.

The API loads the model artifact named by `model_path` in `model/model_info.json`.
Training scripts update that path with the artifact they save, preventing the
backend from pairing fresh metadata with an older model file.

Prediction bounds are returned only when model metadata explicitly marks an
interval as calibrated for the current artifact. Historical interval metadata
alone is not an active calibration.

## Evaluation and training

`train_honest_eval.py` (run from the repository root) is evaluation-only. It reads PostgreSQL in a read-only transaction and writes
aggregate metrics, calibration/test dates, and per-target predictions to
`results/`; it does not modify the saved model or `model_info.json`. The
evaluation uses a separate calibration window and an eight-day forecast-origin
gap between temporal partitions, so each prior partition's seven-day target
window ends before the next partition's first forecast origin. Its interval is empirical; it does not claim a
distribution-free guarantee for dependent weather time series.

`retrain_v3.py` explicitly trains and replaces the v3 artifact. It clears
active performance and interval claims until that artifact has been evaluated.
Do not run it as part of ordinary API startup.

The checked-in v3 artifact predates the corrected grouped rolling-window
implementation. It remains available for compatibility, but should be rebuilt
and evaluated before its scores are presented as current.
