# Weather Forecasting Using Machine Learning

A React and FastAPI application that uses a saved LightGBM model to forecast seven daily average temperatures for 33 Indian states and union territories. PostgreSQL stores past weather and forecast runs. The India map shows state-level ML temperatures and Open-Meteo current city conditions.

## Start with Docker Compose

Copy `.env.example` to `.env` and set the database password and admin token. Use the service name `db` in the Compose `DATABASE_URL` and match its credentials to the `POSTGRES_*` values.

```sh
docker compose up --build -d --wait
docker compose exec backend python backend/update_weather.py --days-back 14
curl --fail http://127.0.0.1:8080/api/ready
```

Open the dashboard at [localhost:8080](http://127.0.0.1:8080) and the FastAPI docs at [localhost:8001/docs](http://127.0.0.1:8001/docs). Set `FRONTEND_PORT` or `BACKEND_PORT` in `.env` if a default port is occupied. Compose runs the migration service before the API becomes ready. PostgreSQL is reachable on the Compose network through `db:5432`. The ingestion command fills the database with completed past days. For older dates, run a bounded backfill.

```sh
docker compose exec backend python backend/backfill.py --start-date YYYY-MM-DD --end-date YYYY-MM-DD
```

Open-Meteo past-day values and historical reanalysis are gridded weather data. The statewide dataset uses a representative coordinate for each entry. Ingestion and the source CSV contain 34 entries, including the `Other` placeholder. The model and forecast controls cover the 33 named regions.

## Develop locally

Use Python 3.11, PostgreSQL 16 or later, and Node.js 20 or later. Create a local database and copy `backend/.env.example` to `backend/.env`. Set the local PostgreSQL URL. Run these commands from the repository root.

```sh
python -m pip install -r backend/requirements-dev.txt
python backend/migrate_db.py --apply --allow-host localhost,127.0.0.1
python backend/update_weather.py --days-back 14
python -m uvicorn --app-dir backend app.main:app --reload
```

In a second terminal, run:

```sh
cd frontend
npm ci
npm run dev
```

Vite serves the app on port 5173 and proxies `/api` to port 8000. To load the historical CSV, obtain the dataset with `python fetch_data.py`, then run `python backend/import_data.py`. The CSV stays in local `data/archive_c/`. Rerunning the import preserves existing weather records.

## Forecast and evidence

For the first forecast date **D**, the model uses seven consecutive completed days, **D−8 through D−2**. Calendar features come from **D−1**. Output days run from **D through D+6**. The forecast form defaults to two days after the last available statewide record. The India map uses the newest completed day among supported states and includes only states with a complete matching window.

The v3 model predicts daily average temperature. A separate LightGBM rainfall model supplies calibrated probabilities for eligible horizons. The forecast page requests a labelled research preview of all seven expected daily amounts. The candidate narrowly missed its independent RMSE release target. Highs, lows, humidity, conditions and the legacy precipitation indicators are rule-based estimates. The history page reads stored weather records. The city layer reads current conditions directly from Open-Meteo.

The rainfall evaluation records the source coverage, date partitions, model comparison, per-day errors and API example. [Rainfall evaluation](docs/RAINFALL_EVALUATION.md)

The saved v3 artifact's recorded training-data cutoff is **2026-10-22**. Its archived scores cover dates that overlap training. Under the existing embargo rule, independent evaluation begins with the origin **2026-10-31**. A 30-origin evaluation needs verified target observations through **2026-12-06**.

```sh
python backend/evaluate_deployed_artifact.py --mode independent --test-window 30
```

The evaluator reads PostgreSQL in a read-only transaction. Use `--eval-data` with a verified weather file to control the evaluation dataset. Results go under `results/`. `train_model.py` writes research outputs under `results/experiments/`. `retrain_v3.py` requires a new output directory and writes a separate candidate. Both scripts are outside normal application startup.

## Tests

```sh
python -m pytest backend/tests -q
python scripts/verify_ast_preservation.py
docker compose --env-file .env.example config --quiet
cd frontend
npm ci
npm test
npm run build
```

For the PostgreSQL integration suite, set `WEATHER_TEST_DATABASE_URL` to a disposable localhost PostgreSQL database whose name ends in `_test`, then run `python -m pytest backend/integration -q` from the root. The browser suite needs a migrated database populated with real recent weather, the frontend build, and a Chromium browser. From `frontend/`, run `npx playwright install chromium` and `npm run test:browser`. Set `WEATHER_BROWSER_CHANNEL=chrome` to use an installed Chrome instead. The suite starts its own API and preview servers on ports 58000 and 55173.

## Deploy with Render, Neon and Vercel

Run schema migrations through an authorized direct Neon endpoint. Keep the pooled Neon URL in Render's `DATABASE_URL` for normal traffic and preserve its TLS settings. Ingestion uses the same database and role on the direct Neon hostname with one dedicated connection. This keeps its session advisory lock held across per-state commits. Use a standard Neon connection URL with a single hostname in its authority. Set Render's `ADMIN_TOKEN` and exact `CORS_ORIGINS`. The root [Render Blueprint](render.yaml) builds the backend from the repository root and checks `/ready`.

On the free Render service, leave `ENABLE_INGESTION_SCHEDULER=false`. The in-process scheduler requires a continuously running API. After verifying the database credential rotation and deploying this change, configure the repository secret `WEATHER_INGESTION_ADMIN_TOKEN` to match Render's admin token. Keep `WEATHER_INGESTION_ENABLED` unset or set to `false` while running the [production ingestion workflow](.github/workflows/weather-ingestion.yml) manually on the default branch. It wakes Render via `/ready`, then requests the last seven completed days. Verify the successful log summary and observations in `/weather/Karnataka/recent`. Set `WEATHER_INGESTION_ENABLED` to `true` after verification to run daily at 06:47 India Standard Time. Set it to `false` to pause the daily schedule.

Reruns insert missing observations and keep existing weather values and forecasts. The ingestion response reports new rows in `records_inserted`. Its legacy record counters report completed provider records processed. Partial provider and request failures are visible in Actions. The next daily run covers the previous seven days so it can recover missed records.

On Vercel, set the project root to `frontend`, use the Vite preset, and set `VITE_API_BASE_URL` to the assigned Render API origin. Check the live frontend and API after deployment. See [Neon connection pooling](https://neon.com/docs/connect/connection-pooling) and the [Render Blueprint reference](https://render.com/docs/blueprint-spec).

## Repository layout

- `backend/app/` serves the API, model, ingestion and PostgreSQL access. `backend/migrations/`, `backend/tests/` and `backend/integration/` contain schema and verification code.
- `frontend/src/` contains the six modules and shared UI, hooks, API client and types. `frontend/public/` holds the map data and `frontend/tests/` holds component and browser checks.
- `model/` contains the deployed joblib file, its metadata and archived diagnostic evidence.
- `scripts/` contains verification utilities. `docs/audit/` records point-in-time evidence. `notebooks/`, `screenshot/` and `deliverables/` retain research and submission material.
- Root scripts remain entry points for dataset acquisition and experimental training.

Read the [backend guide](backend/README.md) and [frontend guide](frontend/README.md) for API and development details.
