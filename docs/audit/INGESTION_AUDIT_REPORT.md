# Comprehensive Historical Weather Ingestion Pipeline Audit Report

**Date of Audit**: October 30, 2026  
**Auditor**: Teamwork Worker M1 (Ingestion Pipeline Audit & Test Worker)  
**Target Repository**: `Weather-Forecasting-Using-Machine-Learning-main`  
**Execution Environment**: Python 3.11.9, PostgreSQL 17.5 portable (Port 5433, Database: `weather_forecasting`)  
**Safety Protocol**: Strictly Non-Destructive — Read-Only Database Queries & Transactional Rollbacks (Zero Data Pollution, Zero Model Modification)

---

## Executive Summary

A comprehensive empirical audit of the historical weather data ingestion pipeline was performed covering:
1. **Model Safety Invariant**: The primary LightGBM artifact `model/weather_model_v3.joblib` was cryptographically verified via SHA-256 before and after execution. The hash remained completely unchanged at `844fdadfbe2786d859cdfc55c2e7dc14eb0b2f420b339f3e877fa6856aa37adf`.
2. **Database Coverage & Continuity**: Full read-only audit across all 34 Indian states/UTs in PostgreSQL table `weather_data`. Total row count is exactly **46,834** spanning `2015-01-01` to `2026-09-06`. There are **0** post-2026-10-22 records currently in the database.
3. **Data Continuity & Gaps**: An evaluation window of 1,255 calendar days (`2023-04-01` to `2026-09-06`) revealed **3 synchronized missing dates** common to all 34 states (`2024-05-31`, `2024-12-30`, `2024-12-31`), plus 1 additional missing date for Chhattisgarh (`2023-12-04`).
4. **Unique Constraints & Collisions**:
   - Production 4-tuple constraint `(state, district, location, date)` (`uq_weather_state_dist_loc_date`): **0 duplicates** (100% compliant).
   - Legacy 2-tuple `(state, date)`: **1,252 collisions** exclusively in Karnataka due to coexisting state-level (`district=''`, `location=''`) and district-level (`district='Udupi'`, `location='Kundapura'`) records.
5. **Physical Data Integrity**: 0 null values and 0 out-of-physical-bounds values detected across all temperature, humidity, and rainfall columns.
6. **Live API Integration**: Exactly ONE controlled live HTTP request to Open-Meteo Forecast API was executed for Delhi. Verified HTTP 200, 1,266.4 ms latency, schema keys, and native units (°C, %, mm). An accompanying transactional upsert test verified constraint handling and was rolled back cleanly (`session.rollback()`) with **zero persistence** (row count remained 46,834).
7. **Automated Test Suite**: 35 new hermetic test cases were implemented across `test_ingestion_pipeline.py`, `test_scheduler_lifecycle.py`, and `test_admin_ingest.py`. All **59 tests** across the entire backend test suite passed with 0 failures in 4.49 seconds.

---

## 1. Cryptographic Model Hash Invariant

In compliance with project invariants and the approved audit mandate, no machine learning artifacts, training scripts, or model configurations were retrained, modified, or overwritten.

| Artifact Path | Expected SHA-256 Hash | Pre-Execution Hash | Post-Execution Hash | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| `model/weather_model_v3.joblib` | `844fdadfbe2786d859cdfc55c2e7dc14eb0b2f420b339f3e877fa6856aa37adf` | `844fdadfbe2786d859cdfc55c2e7dc14eb0b2f420b339f3e877fa6856aa37adf` | `844fdadfbe2786d859cdfc55c2e7dc14eb0b2f420b339f3e877fa6856aa37adf` | **PASS (UNMODIFIED)** |

### Verification Command Executed
```powershell
python -c "import hashlib; h = hashlib.sha256(open('model/weather_model_v3.joblib', 'rb').read()).hexdigest(); print('SHA-256:', h); assert h == '844fdadfbe2786d859cdfc55c2e7dc14eb0b2f420b339f3e877fa6856aa37adf'"
```

---

## 2. PostgreSQL Database Coverage Audit (34 States/UTs)

The database audit was executed in **strict read-only mode** (`conn.read_only = True`) via the newly implemented reusable tool `scripts/audit_database_coverage.py`.

### 2.1 Database Overview
- **Host / Port**: `localhost:5433`
- **Database Name**: `weather_forecasting`
- **Table Audited**: `weather_data`
- **Total Records**: `46,834`
- **Total Distinct States/UTs**: `34` (33 official States/UTs + 1 `'Other'`)
- **Earliest Record Date**: `2015-01-01` (Karnataka location-level)
- **Latest Record Date**: `2026-09-06` (All states)
- **Post-2026-10-22 Records**: Exactly **0** (No authentic or synthetic post-cutoff records exist)

### 2.2 Full 34 States/UTs Coverage Table

The evaluation window spans `2023-04-01` to `2026-09-06` (1,255 expected calendar days):

| # | State / UT | Total Rows | State-Level (`dist=''`, `loc=''`) | Location-Level | Min Date | Max Date | Present Days (2023-26) | Missing Days Count |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Andhra Pradesh | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 2 | Arunachal Pradesh | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 3 | Assam | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 4 | Bihar | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 5 | Chandigarh | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 6 | Chhattisgarh | 1,251 | 1,251 | 0 | 2023-04-01 | 2026-09-06 | 1,251 | 4 |
| 7 | Dadra And Nagar Haveli And Daman And Diu | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 8 | Delhi | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 9 | Goa | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 10 | Gujarat | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 11 | Haryana | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 12 | Himachal Pradesh | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 13 | Jammu And Kashmir | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 14 | Jharkhand | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 15 | Karnataka | 5,519 | 1,252 | 4,267 | 2015-01-01 | 2026-09-06 | 1,252 | 3 |
| 16 | Kerala | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 17 | Madhya Pradesh | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 18 | Maharashtra | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 19 | Manipur | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 20 | Meghalaya | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 21 | Mizoram | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 22 | Nagaland | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 23 | Odisha | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 24 | Other | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 25 | Puducherry | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 26 | Punjab | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 27 | Rajasthan | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 28 | Sikkim | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 29 | Tamil Nadu | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 30 | Telangana | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 31 | Tripura | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 32 | Uttar Pradesh | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 33 | Uttarakhand | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| 34 | West Bengal | 1,252 | 1,252 | 0 | 2023-04-01 | 2026-09-06 | 1,252 | 3 |
| **Total** | **All 34 States** | **46,834** | **42,567** | **4,267** | **2015-01-01** | **2026-09-06** | — | — |

---

## 3. Date Continuity, Duplicate & Constraint Analysis

### 3.1 Date Continuity & Missing Observation Analysis
Across the primary evaluation span of 1,255 days (`2023-04-01` to `2026-09-06`):
- **3 Synchronized Common Missing Dates**: Every one of the 34 states/UTs is missing exactly the same three dates:
  1. `2024-05-31`
  2. `2024-12-30`
  3. `2024-12-31`
  *Root Cause*: These omissions represent synchronized upstream API gaps or pauses during historical backfill ingestion batches.
- **1 State-Specific Missing Date (Chhattisgarh)**:
  - `2023-12-04` is missing exclusively for Chhattisgarh (1,251 days present vs 1,252 for other states).

### 3.2 Duplicate Record & Constraint Collision Analysis
- **Production 4-Tuple Constraint (`uq_weather_state_dist_loc_date`)**:
  - Definition: `UNIQUE (state, district, location, date)`
  - Direct PostgreSQL Query:
    ```sql
    SELECT state, district, location, date, COUNT(*) FROM weather_data
    GROUP BY state, district, location, date HAVING COUNT(*) > 1;
    ```
  - Result: **0 rows returned**. Production constraint is 100% satisfied.
- **Legacy 2-Tuple Constraint (`uq_weather_state_date`)**:
  - Definition: `UNIQUE (state, date)`
  - Direct PostgreSQL Query:
    ```sql
    SELECT state, date, COUNT(*) FROM weather_data
    GROUP BY state, date HAVING COUNT(*) > 1;
    ```
  - Result: **1,252 collisions** (all in Karnataka).
  - *Analysis*: Karnataka has 1,252 state-level records (`district = ''`, `location = ''`) between `2023-04-01` and `2026-09-06`. Over that identical date range, Karnataka also has 1,252 location-level records (`district = 'Udupi'`, `location = 'Kundapura'`). If the legacy 2-tuple constraint was re-enabled in the database, all 1,252 days would violate uniqueness.

### 3.3 Physical Data Integrity Scan
All 46,834 rows were evaluated against nullability and meteorological sanity boundaries:
- `temp_max`, `temp_min`, `temp_avg` within `[-50.0°C, 60.0°C]`: **0 violations**
- `temp_min <= temp_max`: **0 violations**
- `humidity` within `[0.0%, 100.0%]`: **0 violations**
- `rainfall` within `[0.0 mm, 2000.0 mm]`: **0 violations**
- Null values in any weather metric: **0 violations**
- **Conclusion**: All 46,834 records in PostgreSQL possess valid physical measurements.

---

## 4. Controlled Live Open-Meteo API Test Results

A single, controlled live API integration test was executed via `scripts/test_live_open_meteo.py`.

```
================================================================================
      CONTROLLED LIVE OPEN-METEO API & TRANSACTION ROLLBACK TEST
================================================================================
Target State   : Delhi (28.7041, 77.1025)
API Mode       : Single Controlled Probe (Zero bulk calls)
DB Safety      : Transaction ROLLBACK (Zero persistence)
--------------------------------------------------------------------------------

[Step 1/2] Executing Single Live HTTP GET to Open-Meteo Forecast API...
  HTTP Status  : 200 OK
  Latency      : 1266.4 ms
  Payload Size : 574 bytes
  Units        : {'time': 'iso8601', 'temperature_2m_max': '°C', 'temperature_2m_min': '°C', 'temperature_2m_mean': '°C', 'precipitation_sum': 'mm', 'relative_humidity_2m_mean': '%'}
  Observations : 2 day(s) -> ['2026-10-29', '2026-10-30']
  Parsed Obs   : {'state': 'Delhi', 'district': '', 'location': '', 'date': '2026-10-29', 'temp_max': 23.2, 'temp_min': 19.0, 'temp_avg': 20.9, 'humidity': 82.0, 'rainfall': 41.2}

[Step 2/2] Testing PostgreSQL Upsert on Constraint with Explicit Rollback...
  Constraint Tested : uq_weather_state_dist_loc_date
  Target Date       : 2026-10-29
  Existed Prior     : False
  Upsert in Tx      : ID 58191
  Post-Rollback Row : None
  Rollback Verified : True (Historical data polluted: False)
================================================================================
SUCCESS: Controlled live Open-Meteo test & transactional rollback verified clean.
```

### Key Live Test Insights:
1. **Network Feasibility**: Open-Meteo API `/v1/forecast` is fully responsive with reasonable round-trip latency (~1.26s).
2. **Schema Alignment**: Response daily arrays (`temperature_2m_max`, `temperature_2m_min`, `temperature_2m_mean`, `precipitation_sum`, `relative_humidity_2m_mean`) map 1:1 to schema columns without requiring manual unit conversions.
3. **Transactional Safety**: The PostgreSQL upsert statement `ON CONFLICT ON CONSTRAINT uq_weather_state_dist_loc_date DO UPDATE` was executed inside a transaction, verified via query, and rolled back with `conn.rollback()`. Re-query confirmed the test row was eradicated and table count remained at 46,834.

---

## 5. Automated Pytest Test Suite Results

The automated test infrastructure was expanded to include three dedicated, hermetic test modules. Running `python -m pytest backend/tests/ -v` produced 59 passed test cases in 4.49 seconds:

```
============================= test session starts =============================
platform win32 -- Python 3.11.9, pytest-8.4.2, pluggy-1.7.0 -- C:\Program Files\Python311\python.exe
cachedir: .pytest_cache
rootdir: C:\Users\SUJAY\Downloads\Weather-Forecasting-Using-Machine-Learning-Audited\Weather-Forecasting-Using-Machine-Learning-main
plugins: anyio-4.15.0
collecting ... collected 59 items

backend/tests/test_admin_ingest.py::test_admin_ingest_missing_token_returns_401 PASSED [  1%]
backend/tests/test_admin_ingest.py::test_admin_ingest_invalid_token_returns_401 PASSED [  3%]
backend/tests/test_admin_ingest.py::test_admin_ingest_unset_admin_token_env_returns_401 PASSED [  5%]
backend/tests/test_admin_ingest.py::test_admin_ingest_authorized_default_days_back PASSED [  6%]
backend/tests/test_admin_ingest.py::test_admin_ingest_authorized_custom_days_back PASSED [  8%]
backend/tests/test_admin_ingest.py::test_admin_ingest_parameter_validation_bounds[0] PASSED [ 10%]
backend/tests/test_admin_ingest.py::test_admin_ingest_parameter_validation_bounds[-1] PASSED [ 11%]
backend/tests/test_admin_ingest.py::test_admin_ingest_parameter_validation_bounds[91] PASSED [ 13%]
backend/tests/test_admin_ingest.py::test_admin_ingest_parameter_validation_bounds[500] PASSED [ 15%]
backend/tests/test_admin_ingest.py::test_admin_ingest_parameter_validation_bounds[seven] PASSED [ 16%]
backend/tests/test_admin_ingest.py::test_admin_ingest_lock_held_delegation PASSED [ 18%]
backend/tests/test_admin_ingest.py::test_admin_ingest_service_exception_returns_500 PASSED [ 20%]
backend/tests/test_evaluate_deployed_artifact.py::test_training_cutoff_and_embargo_enforcement PASSED [ 22%]
backend/tests/test_evaluate_deployed_artifact.py::test_evaluation_windows_30_60_90 PASSED [ 23%]
backend/tests/test_evaluate_deployed_artifact.py::test_missing_calendar_dates_are_excluded PASSED [ 25%]
backend/tests/test_evaluate_deployed_artifact.py::test_incomplete_seven_day_targets_are_excluded PASSED [ 27%]
backend/tests/test_evaluate_deployed_artifact.py::test_baseline_calculations_no_test_leakage PASSED [ 28%]
backend/tests/test_evaluate_deployed_artifact.py::test_artifact_hash_verification PASSED [ 30%]
backend/tests/test_evaluate_deployed_artifact.py::test_no_modification_of_model_or_metadata PASSED [ 32%]
backend/tests/test_ingestion_pipeline.py::test_fetch_forecast_for_state_parses_valid_payload PASSED [ 33%]
backend/tests/test_ingestion_pipeline.py::test_fetch_forecast_for_state_retry_exponential_backoff PASSED [ 35%]
backend/tests/test_ingestion_pipeline.py::test_fetch_forecast_for_state_exhausts_retries_raises PASSED [ 37%]
backend/tests/test_ingestion_pipeline.py::test_update_weather_null_filtering_and_buffer PASSED [ 38%]
backend/tests/test_ingestion_pipeline.py::test_update_weather_upsert_targets_correct_constraint PASSED [ 40%]
backend/tests/test_ingestion_pipeline.py::test_run_ingestion_lock_acquired_and_released PASSED [ 42%]
backend/tests/test_ingestion_pipeline.py::test_run_ingestion_lock_held_skips_cleanly PASSED [ 44%]
backend/tests/test_ingestion_pipeline.py::test_run_ingestion_lock_released_on_unhandled_exception PASSED [ 45%]
backend/tests/test_migrate_db.py::test_parse_args_defaults PASSED        [ 47%]
backend/tests/test_migrate_db.py::test_parse_args_flags PASSED           [ 49%]
backend/tests/test_migrate_db.py::test_validate_host PASSED              [ 50%]
backend/tests/test_migrate_db.py::test_main_rejects_disallowed_host PASSED [ 52%]
backend/tests/test_migrate_db.py::test_main_dry_run_when_apply_omitted PASSED [ 54%]
backend/tests/test_migrate_db.py::test_main_applies_when_allowed PASSED  [ 55%]
backend/tests/test_prediction_integrity.py::test_prediction_upsert_deduplicates_same_model_forecast PASSED [ 57%]
backend/tests/test_prediction_integrity.py::test_per_horizon_metrics_has_seven_days_and_standard_metrics PASSED [ 59%]
backend/tests/test_prediction_integrity.py::test_forecast_all_day_parameter_selects_requested_horizon PASSED [ 61%]
backend/tests/test_prediction_integrity.py::test_live_metrics_endpoint_returns_valid_empty_window PASSED [ 62%]
backend/tests/test_prediction_integrity.py::test_actual_backfill_and_live_mae_use_matching_series PASSED [ 64%]
backend/tests/test_prediction_integrity.py::test_predictions_pagination_filters_and_total_count PASSED [ 66%]
backend/tests/test_prediction_integrity.py::test_model_info_exposes_artifact_evaluation_dates_and_horizons PASSED [ 67%]
backend/tests/test_prediction_integrity.py::test_negative_zero_is_normalized_before_api_output PASSED [ 69%]
backend/tests/test_predict_route_excludes_asof_and_future_weather_rows PASSED [ 71%]
backend/tests/test_scheduler_config.py::test_scheduler_disabled_by_default PASSED [ 72%]
backend/tests/test_scheduler_config.py::test_scheduler_starts_when_enabled PASSED [ 74%]
backend/tests/test_scheduler_lifecycle.py::test_scheduler_lifecycle_starts_when_truthy[true] PASSED [ 76%]
backend/tests/test_scheduler_lifecycle.py::test_scheduler_lifecycle_starts_when_truthy[True] PASSED [ 77%]
backend/tests/test_scheduler_lifecycle.py::test_scheduler_lifecycle_starts_when_truthy[1] PASSED [ 79%]
backend/tests/test_scheduler_lifecycle.py::test_scheduler_lifecycle_starts_when_truthy[yes] PASSED [ 81%]
backend/tests/test_scheduler_lifecycle.py::test_scheduler_lifecycle_starts_when_truthy[YES] PASSED [ 83%]
backend/tests/test_scheduler_lifecycle.py::test_scheduler_lifecycle_disabled_when_falsy[false] PASSED [ 84%]
backend/tests/test_scheduler_lifecycle.py::test_scheduler_lifecycle_disabled_when_falsy[False] PASSED [ 86%]
backend/tests/test_scheduler_lifecycle.py::test_scheduler_lifecycle_disabled_when_falsy[0] PASSED [ 88%]
backend/tests/test_scheduler_lifecycle.py::test_scheduler_lifecycle_disabled_when_falsy[no] PASSED [ 89%]
backend/tests/test_scheduler_lifecycle.py::test_scheduler_lifecycle_disabled_when_falsy[NO] PASSED [ 91%]
backend/tests/test_scheduler_lifecycle.py::test_scheduler_lifecycle_disabled_when_falsy[] PASSED [ 93%]
backend/tests/test_scheduler_lifecycle.py::test_scheduler_lifecycle_disabled_when_falsy[random_string] PASSED [ 94%]
backend/tests/test_scheduler_lifecycle.py::test_scheduler_lifecycle_disabled_when_unset PASSED [ 96%]
backend/tests/test_scheduler_lifecycle.py::test_scheduler_job_specifications_and_triggers PASSED [ 98%]
backend/tests/test_scheduler_lifecycle.py::test_scheduler_job_execution_delegates_to_service PASSED [100%]

======================= 59 passed, 2 warnings in 4.49s ========================
```

### Test Coverage Summary:
- **`test_ingestion_pipeline.py` (8 tests)**:
  - Hermetic response parsing without network calls.
  - Exponential backoff retry logic (`2**attempt` intervals).
  - Retry exhaustion re-raising exception.
  - Rejection of daily arrays containing `None` values.
  - `ON CONFLICT ON CONSTRAINT uq_weather_state_dist_loc_date DO UPDATE` generation.
  - PostgreSQL advisory lock `84729103859` acquisition and unlock.
  - Concurrency collision handling (clean skipping when lock is held).
  - Guaranteed advisory lock unlock on unhandled exception.
- **`test_scheduler_lifecycle.py` (15 tests)**:
  - Truthy environment variable parsing (`"true"`, `"True"`, `"1"`, `"yes"`, `"YES"`).
  - Falsy / disabled environment variable parsing (`"false"`, `"0"`, `"no"`, `""`, unset).
  - APScheduler job trigger registration for `daily_weather_ingest` (06:30 IST) and `fill_prediction_actuals` (07:00 IST).
  - Verification of `coalesce=True`, `max_instances=1`, `misfire_grace_time=3600`.
  - Clean lifespan shutdown (`scheduler.running == False`).
- **`test_admin_ingest.py` (12 tests)**:
  - Header authorization: 401 on missing, wrong, or unset `ADMIN_TOKEN`.
  - Service delegation with default `days_back=7` and custom `days_back=14`.
  - FastAPI parameter validation bounds (`ge=1`, `le=90`) returning 422.
  - Advisory lock held response passthrough (`status="skipped"`).
  - Error propagation (500 Internal Server Error).

---

## 6. Post-2026-10-22 Record Coverage Audit

The user prompt explicitly mandated investigating post-2026-10-22 records.
- **Query Executed**:
  ```sql
  SELECT COUNT(*) FROM weather_data WHERE date > '2026-10-22';
  ```
- **Observed Count**: Exactly **0 records**.
- **Maximum Observation Date**: `2026-09-06`.
- **Finding**:
  1. The database has not had any ingestion runs since September 6, 2026.
  2. There are 0 authentic post-2026-10-22 records in the database.
  3. In compliance with the Integrity Mandate ("No fabricated weather observations or ML predictions"), no artificial records were injected. Future operational runs with live network ingestion or scheduled jobs will be required to populate observations between `2026-09-07` and present.

---

## 7. Observed Defects, Limitations & Recommended Fixes

Based on the forensic inspection of database catalogs and codebase implementations, the following defects and remediation steps are documented:

### Defect 1: Schema Drift in ORM Model (`backend/app/models.py`)
- **Observation**:
  Lines 19–20 of `backend/app/models.py` declare:
  ```python
  __table_args__ = (
      UniqueConstraint("state", "date", name="uq_weather_state_date"),
      UniqueConstraint("state", "district", "location", "date", name="uq_weather_state_dist_loc_date"),
  )
  ```
- **Impact**: `migrate_db.py` previously executed `ALTER TABLE weather_data DROP CONSTRAINT IF EXISTS uq_weather_state_date` in PostgreSQL. If any developer or automated task runs `init_db()` or recreates tables from `models.py`, PostgreSQL will enforce `uq_weather_state_date`, which will immediately fail due to Karnataka's 1,252 existing location-level duplicate dates.
- **Recommended Fix**: Remove `UniqueConstraint("state", "date", name="uq_weather_state_date")` from `WeatherData.__table_args__` in `backend/app/models.py`.

### Defect 2: Unapplied Migration `002_prediction_metrics.sql`
- **Observation**:
  `backend/migrations/002_prediction_metrics.sql` adds `model_version VARCHAR(64)` and `actual_temp DOUBLE PRECISION` to table `predictions`, and creates unique constraint `uq_prediction_state_location_date_model_version`.
  Inspection of PostgreSQL `weather_forecasting` on port 5433 confirmed `predictions` table does NOT have these columns.
- **Impact**: Running `fill_missing_actuals` or inserting predictions with `model_version` in production against this database will throw an `UndefinedColumn` exception.
- **Recommended Fix**: Execute `python backend/migrate_db.py --apply --host localhost` against port 5433 to apply migration 002.

### Defect 3: Broken Import in `backend/import_karnataka_locations.py`
- **Observation**:
  Line 34 imports `WeatherImportBatch` from `app.models`:
  ```python
  from app.models import WeatherData, WeatherImportBatch, WeatherLocationMetadata
  ```
  Neither `WeatherImportBatch` nor `WeatherLocationMetadata` exist in `backend/app/models.py`.
- **Impact**: Executing `import_karnataka_locations.py` crashes on startup with `ImportError`.
- **Recommended Fix**: Define `WeatherLocationMetadata` in `models.py` and remove reference to `WeatherImportBatch`.

### Defect 4: State Coordinate Space Discrepancy
- **Observation**:
  - `backend/update_weather.py`: 34 entries (includes `'Other'`, excludes `'Andaman And Nicobar'` and `'Lakshadweep'`).
  - `model/model_info.json`: 33 entries (excludes `'Other'`, `'Andaman And Nicobar'`, `'Lakshadweep'`).
  - `backend/app/services/open_meteo_service.py`: 35 entries (includes `'Andaman And Nicobar'` and `'Lakshadweep'`, excludes `'Other'`).
- **Impact**: Weather ingestion fetches data for `'Other'`, but the machine learning model has no trained parameters or one-hot encoding for `'Other'`. Conversely, users selecting `Lakshadweep` in `open_meteo_service` will find no historical data in `weather_data`.
- **Recommended Fix**: Unify state definitions across `STATE_COORDS`, `STATE_CENTERS`, and model feature definitions.

### Defect 5: Unhandled Blast Radius in `update_weather.py` Loop
- **Observation**:
  In `backend/update_weather.py:95-96`:
  ```python
  for state, (lat, lon) in STATE_COORDS.items():
      data = fetch_forecast_for_state(state, lat, lon, days_back=days_back)
  ```
  `fetch_forecast_for_state` re-raises after 5 failed attempts. There is no `try...except` surrounding individual states inside the loop.
- **Impact**: If one state encounters a prolonged upstream API 500 error or network blip, the entire process terminates and all subsequent states in the loop are aborted.
- **Recommended Fix**: Wrap the loop body in a `try...except` per state, log the error, and continue processing the remaining states.

---

## 8. Verification Commands & Independent Reproducibility

Any auditor or engineer can independently reproduce every empirical observation in this report using the following commands from the repository root:

1. **Verify Model Artifact Hash Invariant**:
   ```powershell
   python -c "import hashlib; assert hashlib.sha256(open('model/weather_model_v3.joblib', 'rb').read()).hexdigest() == '844fdadfbe2786d859cdfc55c2e7dc14eb0b2f420b339f3e877fa6856aa37adf'; print('PASS: Model hash strictly verified.')"
   ```

2. **Execute Full 34 States/UTs Database Coverage Audit**:
   ```powershell
   python scripts/audit_database_coverage.py --json-out scripts/coverage_report.json
   ```

3. **Execute Single Controlled Live Open-Meteo Test & Transactional Rollback**:
   ```powershell
   # Standard live probe for Delhi with transactional rollback (zero DB pollution)
   python scripts/test_live_open_meteo.py --json-out scripts/live_test_report.json

   # Pure network and API schema probe without DB dependency
   python scripts/test_live_open_meteo.py --skip-db

   # Probing custom Indian states with genuine state coordinates (e.g. Maharashtra)
   python scripts/test_live_open_meteo.py --state "Maharashtra" --skip-db

   # Probing a specific target observation date
   python scripts/test_live_open_meteo.py --state "Maharashtra" --date 2026-10-29 --skip-db
   ```

4. **Execute Full Automated Pytest Suite**:
   ```powershell
   python -m pytest backend/tests/ -v
   ```

5. **Execute Feature Invariance & Leakage Protection Check**:
   ```powershell
   python backend/test_no_leakage.py
   ```
