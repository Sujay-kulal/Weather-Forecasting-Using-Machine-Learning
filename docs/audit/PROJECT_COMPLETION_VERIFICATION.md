# Weather forecasting project verification

**COMPLETE LOCALLY, EXTERNAL VERIFICATION PENDING**

Verification date: 2026-11-19, India Standard Time

## Baseline and source selection

The attached ZIP was compared against the initially clean workspace by file path and content. The workspace contained the same v3 model, equivalent JSON metadata, additional submission files and existing repository cleanup. Commit `93c7b184a1f00ce7d6fd34b066d1997b74da7f8f` existed locally. GitHub's commit API reported it missing, and live branch references showed both `main` and `cleanup/repository-structure-optimization` at `737d01c288a2ae49cbc36288a03d73c64a74e74e`. The release branch is `codex/weather-project-completion`, based on `93c7b18`.

The baseline backend run against a clean PostgreSQL database returned **196 passed and 2 failed**. Both failures came from feature consistency checks assuming that a connectable database had the weather schema and source records. The frontend baseline ran **61 passed, 0 failed**. Its TypeScript and Vite build and Compose configuration checks passed. The published GitHub workflow failed backend collection with five errors because its environment lacked the HTTP client required by Starlette. [GitHub Actions run](https://github.com/Sujay-kulal/Weather-Forecasting-Using-Machine-Learning/actions/runs/43370226570)

## Corrections

- **ML contract.** The service checks the artifact hash before deserializing it and verifies fitted input column order, state categories and seven regressors. Each forecast validates finite input and output values. All statewide inference paths use the same feature validation and cache, keyed by feature values so a same-date data correction takes effect.
- **Temporal experiments.** Training and diagnostic evaluation use per-state calendar windows with T+1 through T+7 targets. Cross-validation groups all regions by origin date and leaves an eight-day buffer. Invalid measurements and conflicting duplicates are excluded. Both training commands write separate experimental output.
- **PostgreSQL and API.** Recent ingestion and archive backfill validate complete days, resolve duplicates, isolate per-state failures and persist idempotently. CSV imports report inserted and skipped rows from PostgreSQL. Prediction replay preserves the forecast issued before the target day. The live metric uses the same D−2 baseline as inference. Weather history supports exact statewide, district-wide or location series and date filters. Prediction history applies filters and pagination on the server.
- **Frontend.** The forecast defaults to D = latest completed record + 2 days. Forecast summaries label the rule-based weather estimates, and timeline views align results and stored weather by date. Performance and overview show the API's diagnostic status and values. The map uses current Open-Meteo precipitation and issues one statewide forecast request for each horizon change. Browser checks exercised mobile menu focus, keyboard day selection, prediction details and the six modules.
- **Delivery.** Compose has configurable loopback ports and a working IPv4 frontend probe. The backend readiness probe checks the model and schema. An idempotent migration runs before the application. The packaged Render Blueprint uses the backend Dockerfile and the repository root context. CI installs the required test HTTP client and includes a real PostgreSQL service test. The repository retains the public copy of the map and removes its byte-identical, unused duplicate.

## Artifact and source data

| File | SHA-256 before and after |
| --- | --- |
| `model/weather_model_v3.joblib` | `844fdadfbe2786d859cdfc55c2e7dc14eb0b2f420b339f3e877fa6856aa37adf` |
| `model/model_info.json` | `c2ade771333f4f8f5746040910303e320dea86684d270d5059f4b8ca51263e2f` |
| `model/evaluation_results_v3.json` | `b53e3250a41b7d06dcd69118d115fc9191f8f83d1e5d8820144d16b5dc75e7b5` |

The ZIP's metadata has the same parsed JSON as the workspace and uses different line endings. The release package uses the verified workspace bytes. The fitted pipeline contains 18 numerical features, `Season`, `State`, and seven LightGBM estimators. The model and metadata agree on 33 named regions. The ingestion table includes `Other` as the 34th entry.

The available Kaggle CSV contained 31,177 records from 2023-04-01 through 2025-10-06, 34 entries, zero duplicate state/date keys and zero missing values across the five weather columns. The archived artifact provenance describes a larger Open-Meteo training panel through 2026-10-22. The strict PostgreSQL-versus-CSV feature check matched all 20 values for Karnataka, Delhi, Kerala and Rajasthan to within `1e-12`, with identical predictions.

### Training-overlap diagnostic run

The existing artifact was applied to the genuine local CSV for origins 2025-08-23 through 2025-09-21. That yielded 30 origins, 33 states, 990 complete state/origin samples and 6,930 temperature comparisons. These dates fall within the recorded artifact training period.

| Method | MAE (°C) | RMSE (°C) | R² |
| --- | ---: | ---: | ---: |
| LightGBM v3 | 0.8065 | 1.0876 | 0.9363 |
| Persistence | 0.9612 | 1.2575 | 0.9149 |
| Climatology | 0.9853 | 1.3234 | 0.9057 |

```sh
python backend/evaluate_deployed_artifact.py --database-free --eval-data data/archive_c/PSP_Weather_Merged_EDA_Cleaned.csv --mode diagnostic --custom-test-start 2025-08-23 --test-window 30
```

The independent procedure returned `insufficient_post_cutoff_data`. The origin window runs from 2026-10-31 through 2026-11-29 and requires seven-day outcomes through 2026-12-06. The disposable database had records through 2026-11-18. The evaluator emitted a coverage report with zero independent metrics.

## Final verification

| Check and command | Verified result |
| --- | --- |
| `python -m pytest backend/tests backend/integration -q` | **207 passed, 0 failed**. Five tests used real PostgreSQL for migrations, storage, advisory locking, retrospective replay or import counters. |
| `python backend/tests/test_consistency.py --require-database` | **4 matched, 0 failed** using the saved model, real CSV and PostgreSQL. |
| `python scripts/verify_ast_preservation.py` | Preserved the 81 unique reference test functions. Zero missing or weakened. |
| `python -m compileall -q backend scripts fetch_data.py fetch_karnataka_dataset.py train_model.py retrain_v3.py train_honest_eval.py` | Exit 0. |
| `npm ci` and `npm run build` | Locked dependencies installed. TypeScript and Vite 6.4.6 build passed. |
| `npm test` | **61 passed, 0 failed**. Component and API client tests. |
| `npm run test:browser` | **2 passed, 0 failed**. Desktop Chrome and a mobile viewport used the built frontend, Uvicorn, the model and real PostgreSQL. |
| `docker compose --env-file .env.example config --quiet` | Exit 0. |
| `docker compose -p weather-completion-check --env-file .env.example up --build -d --wait` | Migration exited 0. PostgreSQL 16, API and Nginx were healthy. The isolated host ports were 58001 and 58080 because 8001 was occupied. |
| `npm audit` and `python -m pip_audit --strict --no-deps --disable-pip -r <container-runtime-pins>` | Zero npm advisories. No known vulnerabilities in the installed application runtime packages from the backend container. |
| `git diff --check` and tracked-file secret search | Exit 0 for whitespace validation. Matches in example URLs and test fixtures used placeholders. |

Live Open-Meteo ingestion wrote 476 past-day records across 34 entries to disposable PostgreSQL. The archive backfill produced 408 stored records over 12 days, and a separate real-day replay inserted one row on its first run and zero on its second. The Compose HTTP smoke returned 401 without the admin token, wrote 272 records with the token, served a Karnataka forecast beginning 2026-11-20 with seven finite values, and returned one matching stored prediction. Its map response covered 33 regions. The real location search and lookup returned current Open-Meteo weather for Bengaluru.

## External verification

The Render health URL referenced by the repository timed out. The new local commits require a GitHub Actions run and checks against an authorized Render, Neon and Vercel deployment. The independent 30-origin model evaluation is pending the complete post-cutoff weather observations.

## Files changed since local baseline

Status uses Git notation. M means modified, A means added and D means removed. The removed GeoJSON file matched the retained public copy by SHA-256. Historical evidence, notebooks, screenshots and academic deliverables are retained.

```text
M	.dockerignore
M	.env.example
M	.github/workflows/ci.yml
M	.gitignore
M	.planning/codebase/CONCERNS.md
M	.planning/codebase/INTEGRATIONS.md
M	.planning/codebase/STRUCTURE.md
M	README.md
M	backend/.env.example
M	backend/Dockerfile
M	backend/README.md
M	backend/app/database.py
A	backend/app/database_url.py
M	backend/app/routes/admin.py
M	backend/app/routes/health.py
M	backend/app/routes/prediction.py
M	backend/app/routes/weather.py
M	backend/app/schemas.py
M	backend/app/services/feature_service.py
M	backend/app/services/ingestion_service.py
M	backend/app/services/location_weather_service.py
M	backend/app/services/metrics_service.py
M	backend/app/services/model_service.py
M	backend/app/services/prediction_cache.py
M	backend/app/services/prediction_store.py
M	backend/backfill.py
M	backend/conftest.py
M	backend/evaluate_deployed_artifact.py
M	backend/import_data.py
A	backend/integration/test_postgresql.py
M	backend/migrate_db.py
M	backend/requirements-dev.txt
M	backend/requirements.txt
M	backend/tests/test_consistency.py
A	backend/tests/test_release_contract.py
M	backend/update_weather.py
M	docker-compose.yml
A	docs/audit/PROJECT_COMPLETION_VERIFICATION.md
M	frontend/README.md
M	frontend/package-lock.json
M	frontend/package.json
A	frontend/playwright.config.ts
M	frontend/src/App.tsx
D	frontend/src/assets/india_states.geojson
M	frontend/src/components/IndiaMap.tsx
M	frontend/src/pages/ForecastPage.tsx
M	frontend/src/pages/IndiaMapPage.tsx
M	frontend/src/pages/MLDashboardPage.tsx
M	frontend/src/pages/ModelPerformancePage.tsx
M	frontend/src/pages/PredictionHistoryPage.tsx
M	frontend/src/pages/WeatherHistoryPage.tsx
M	frontend/src/services/api.ts
M	frontend/src/services/cityWeather.ts
M	frontend/src/styles.css
M	frontend/src/types/api.ts
A	frontend/tests/browser/weather.spec.ts
M	frontend/tests/mocks/apiFixtures.ts
M	frontend/tests/tier1_features.test.tsx
M	frontend/tests/tier3_cross_feature.test.tsx
M	frontend/tests/tier4_real_world.test.tsx
M	frontend/vite.config.ts
A	render.yaml
M	retrain_v3.py
M	train_model.py
```
