import os
import sys
import subprocess
import time
from pathlib import Path

# Paths
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

TEMP_CLUSTER_DIR = os.path.join(os.environ["TEMP"], "disposable_pg_cluster")
DISPOSABLE_PORT = 54329
DISPOSABLE_DB = "weather_forecasting_disposable"
DISPOSABLE_URL = f"postgresql+psycopg://postgres@127.0.0.1:{DISPOSABLE_PORT}/{DISPOSABLE_DB}"
PG_LOG_PATH = os.path.join(os.environ["TEMP"], "disposable_pg_server.log")

# PROHIBITED IDENTITIES - SAFETY SHIELD
PROHIBITED_PORTS = (5432, 5433)
PROHIBITED_DBS = ("weather_forecasting", "weather_forecasting_prod", "production")
ALLOWED_PORT = 54329
ALLOWED_HOSTS = ("127.0.0.1", "localhost")
ALLOWED_DBS = ("weather_forecasting_disposable", "postgres")


def safety_check(port: int, dbname: str, host: str = "127.0.0.1", datadir: str | None = None):
    if port in PROHIBITED_PORTS:
        raise RuntimeError(f"ABORT: Attempted connection to prohibited port {port}!")
    if port != ALLOWED_PORT:
        raise RuntimeError(f"ABORT: Port {port} does not match allowed disposable port {ALLOWED_PORT}!")
    if dbname in PROHIBITED_DBS:
        raise RuntimeError(f"ABORT: Attempted connection to prohibited database '{dbname}'!")
    if dbname not in ALLOWED_DBS:
        raise RuntimeError(f"ABORT: Database '{dbname}' is not an authorized disposable database!")
    if host not in ALLOWED_HOSTS:
        raise RuntimeError(f"ABORT: Host '{host}' is not an authorized local test host!")
    if datadir is not None:
        norm_datadir = os.path.normcase(os.path.abspath(datadir))
        norm_temp = os.path.normcase(os.path.abspath(os.environ["TEMP"]))
        if not norm_datadir.startswith(norm_temp):
            raise RuntimeError(f"ABORT: Server data_directory '{datadir}' is outside TEMP directory '{os.environ['TEMP']}'!")
    print(f"SAFETY CHECK PASSED: Port {port}, DB '{dbname}', Host '{host}' confirmed safe.")


def _read_tail(filepath: str, lines: int = 30) -> str:
    try:
        if not os.path.exists(filepath):
            return "(log file does not exist)"
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
            return "".join(all_lines[-lines:]) if all_lines else "(log file empty)"
    except Exception as exc:
        return f"(failed to read log tail: {exc})"


def run_integration():
    safety_check(DISPOSABLE_PORT, DISPOSABLE_DB, "127.0.0.1")
    
    print("\n================================================================================")
    print("STEP 0: Starting isolated disposable PostgreSQL server on port 54329...")
    print("================================================================================")
    
    proc = None
    pg_log_file = None
    
    try:
        pg_log_file = open(PG_LOG_PATH, "w+", encoding="utf-8")
        cmd = ["C:\\Users\\SUJAY\\pgsql\\bin\\postgres.exe", "-D", TEMP_CLUSTER_DIR, "-p", str(DISPOSABLE_PORT)]
        proc = subprocess.Popen(cmd, stdout=pg_log_file, stderr=subprocess.STDOUT)
        print(f"Launched postgres server (PID: {proc.pid}), stdout/stderr redirected to {PG_LOG_PATH}")

        import psycopg
        import sqlalchemy as sa
        from sqlalchemy import text
        
        # Wait for server ready with diagnostic polling and preserved exception
        server_ready = False
        last_startup_exception = None
        for i in range(20):
            poll_code = proc.poll()
            if poll_code is not None:
                log_tail = _read_tail(PG_LOG_PATH, 30)
                raise RuntimeError(f"PostgreSQL server process terminated prematurely with exit code {poll_code}!\nServer log tail:\n{log_tail}")
            try:
                with psycopg.connect(f"host=127.0.0.1 port={DISPOSABLE_PORT} user=postgres dbname=postgres", connect_timeout=2) as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT inet_server_port(), current_database(), setting FROM pg_settings WHERE name = 'data_directory';")
                        p, d, datadir = cur.fetchone()
                        safety_check(p, d, "127.0.0.1", datadir)
                        if p != DISPOSABLE_PORT:
                            raise RuntimeError(f"Expected port {DISPOSABLE_PORT}, got {p}!")
                        print(f"PostgreSQL server confirmed listening on port {p}, default db: '{d}', datadir: '{datadir}'")
                        server_ready = True
                        break
            except Exception as e:
                last_startup_exception = e
                time.sleep(1)
        
        if not server_ready:
            log_tail = _read_tail(PG_LOG_PATH, 30)
            raise RuntimeError(
                f"PostgreSQL server failed to start within timeout.\n"
                f"Last connection exception: {type(last_startup_exception).__name__}: {last_startup_exception}\n"
                f"Server log tail:\n{log_tail}"
            )
        
        # Drop and create disposable database with PRE-DESTRUCTIVE verification
        with psycopg.connect(f"host=127.0.0.1 port={DISPOSABLE_PORT} user=postgres dbname=postgres", autocommit=True) as conn:
            with conn.cursor() as cur:
                # Live server identity verification BEFORE any destructive operation
                cur.execute("SELECT inet_server_port(), current_database(), setting FROM pg_settings WHERE name = 'data_directory';")
                live_port, live_db, live_datadir = cur.fetchone()
                safety_check(live_port, live_db, "127.0.0.1", live_datadir)
                if live_port != DISPOSABLE_PORT or live_db != "postgres":
                    raise RuntimeError("Live server identity mismatch before DROP/CREATE!")

                cur.execute(f"DROP DATABASE IF EXISTS {DISPOSABLE_DB};")
                cur.execute(f"CREATE DATABASE {DISPOSABLE_DB};")
                print(f"Database '{DISPOSABLE_DB}' created freshly on port {DISPOSABLE_PORT}.")

        # Positive verification on the disposable database
        with psycopg.connect(f"host=127.0.0.1 port={DISPOSABLE_PORT} user=postgres dbname={DISPOSABLE_DB}") as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT inet_server_port(), current_database(), setting FROM pg_settings WHERE name = 'data_directory';")
                active_port, active_db, active_datadir = cur.fetchone()
                safety_check(active_port, active_db, "127.0.0.1", active_datadir)
                if active_port != DISPOSABLE_PORT or active_db != DISPOSABLE_DB:
                    raise RuntimeError("Verification failed: Not connected to disposable target!")
                print(f"POSITIVELY VERIFIED: current_database()='{active_db}', port={active_port}, datadir='{active_datadir}'")

        # Set environment variable for backend imports
        os.environ["DATABASE_URL"] = DISPOSABLE_URL
        target_engine = sa.create_engine(DISPOSABLE_URL, pool_pre_ping=True)
        safety_check(target_engine.url.port, target_engine.url.database, target_engine.url.host)

        print("\n================================================================================")
        print("TEST 1: Initial schema setup & initial migration execution")
        print("================================================================================")
        # Create pre-migration tables
        with target_engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE weather_data (
                    id SERIAL PRIMARY KEY,
                    state VARCHAR(100) NOT NULL,
                    date DATE NOT NULL,
                    temp_max DOUBLE PRECISION,
                    temp_min DOUBLE PRECISION,
                    temp_avg DOUBLE PRECISION,
                    rainfall DOUBLE PRECISION,
                    humidity DOUBLE PRECISION,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT uq_weather_state_date UNIQUE (state, date)
                );
            """))
            conn.execute(text("""
                CREATE TABLE predictions (
                    id SERIAL PRIMARY KEY,
                    state VARCHAR(100) NOT NULL,
                    forecast_date DATE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    predicted_temp_day1 DOUBLE PRECISION,
                    predicted_temp_day2 DOUBLE PRECISION,
                    predicted_temp_day3 DOUBLE PRECISION,
                    predicted_temp_day4 DOUBLE PRECISION,
                    predicted_temp_day5 DOUBLE PRECISION,
                    predicted_temp_day6 DOUBLE PRECISION,
                    predicted_temp_day7 DOUBLE PRECISION,
                    CONSTRAINT uq_prediction_run UNIQUE (state, forecast_date, created_at)
                );
            """))
            print("Pre-migration tables created (with legacy uq_weather_state_date constraint).")

        import migrate_db
        exit_code = migrate_db.main(argv=["--apply", "--allow-host", "127.0.0.1"], target_engine=target_engine)
        assert exit_code == 0, f"Initial migration failed with exit code {exit_code}"
        
        # Verify columns & constraints
        with target_engine.connect() as conn:
            cols = [r[0] for r in conn.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'weather_data'"
            )).fetchall()]
            assert "district" in cols and "location" in cols, f"Columns missing: {cols}"
            
            c_names = [r[0] for r in conn.execute(text(
                "SELECT conname FROM pg_constraint WHERE conrelid = 'weather_data'::regclass"
            )).fetchall()]
            assert "uq_weather_state_dist_loc_date" in c_names, f"Constraint missing: {c_names}"
            assert "uq_weather_state_date" not in c_names, "Legacy constraint was not dropped!"
        print("TEST 1 PASSED: Initial migration succeeded, added district/location, updated constraints.")

        print("\n================================================================================")
        print("TEST 2: Migration rerun safety & idempotency")
        print("================================================================================")
        exit_code_rerun = migrate_db.main(argv=["--apply", "--allow-host", "127.0.0.1"], target_engine=target_engine)
        assert exit_code_rerun == 0, f"Migration rerun failed with code {exit_code_rerun}"
        print("TEST 2 PASSED: Migration rerun executed idempotently with zero errors (DEF-01 verified on real PG).")

        print("\n================================================================================")
        print("TEST 3: Duplicate constraint handling")
        print("================================================================================")
        with target_engine.connect() as conn:
            exists = migrate_db._constraint_exists(conn, "uq_weather_state_dist_loc_date")
            assert exists is True, "Constraint check returned False for existing constraint!"
            non_exists = migrate_db._constraint_exists(conn, "non_existent_constraint")
            assert non_exists is False, "Constraint check returned True for non-existent constraint!"
        print("TEST 3 PASSED: _constraint_exists catalog check properly detects constraint states.")

        print("\n================================================================================")
        print("TEST 4: Savepoint rollback, duplicate handling & genuine failure visibility")
        print("================================================================================")
        with target_engine.begin() as conn:
            # Simulate a nested savepoint that fails with duplicate constraint
            try:
                with conn.begin_nested():
                    conn.execute(text("ALTER TABLE weather_data ADD CONSTRAINT uq_weather_state_dist_loc_date UNIQUE (state, district, location, date);"))
            except Exception as e:
                print(f"Expected duplicate constraint exception caught in savepoint: {type(e).__name__}")
                assert migrate_db._is_duplicate_constraint_error(e) is True, "Duplicate constraint not recognized by _is_duplicate_constraint_error!"
            # Ensure outer transaction can still execute statements
            res = conn.execute(text("SELECT count(*) FROM weather_data;")).scalar()
            assert res == 0, f"Expected 0 rows, got {res}"

        # Verify genuine (non-duplicate) migration failures are NOT swallowed and remain visible
        genuine_failure_caught = False
        try:
            with target_engine.begin() as conn:
                try:
                    with conn.begin_nested():
                        conn.execute(text("ALTER TABLE weather_data ADD CONSTRAINT invalid_syntax_failure;"))
                except Exception as e:
                    if not migrate_db._is_duplicate_constraint_error(e):
                        raise
        except Exception as exc:
            genuine_failure_caught = True
            print(f"Genuine migration failure properly surfaced and re-raised: {type(exc).__name__}")
        assert genuine_failure_caught is True, "Genuine failure was silently swallowed!"
        print("TEST 4 PASSED: Savepoint rollback handled duplicate constraint, outer transaction preserved, and genuine failures remain visible.")

        print("\n================================================================================")
        print("TEST 5: Correct composite uniqueness constraint catalog definition")
        print("================================================================================")
        with target_engine.connect() as conn:
            c_def = conn.execute(text(
                "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c "
                "JOIN pg_class t ON c.conrelid = t.oid "
                "WHERE t.relname = 'weather_data' AND c.conname = 'uq_weather_state_dist_loc_date';"
            )).scalar()
            print(f"Catalog definition: {c_def}")
            assert "UNIQUE (state, district, location, date)" in c_def
        print("TEST 5 PASSED: pg_constraint confirmed composite unique key on (state, district, location, date).")

        print("\n================================================================================")
        print("TEST 6: Multiple districts for same state & date allowed (DEF-02 verification)")
        print("================================================================================")
        with target_engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO weather_data (state, district, location, date, temp_max, temp_min, temp_avg, rainfall, humidity)
                VALUES 
                  ('Punjab', 'Ludhiana', '', '2026-10-01', 32.0, 20.0, 26.0, 0.0, 60.0),
                  ('Punjab', 'Amritsar', '', '2026-10-01', 31.0, 19.0, 25.0, 0.0, 65.0);
            """))
            rows = conn.execute(text("SELECT district, temp_max FROM weather_data WHERE state = 'Punjab' ORDER BY district;")).fetchall()
            print(f"Inserted multi-district rows: {rows}")
            assert len(rows) == 2, f"Expected 2 rows, found {len(rows)}"
            assert rows[0][0] == "Amritsar" and rows[1][0] == "Ludhiana"
        print("TEST 6 PASSED: Distinct districts for same state and date successfully inserted without conflict.")

        print("\n================================================================================")
        print("TEST 7: Rejection of duplicate composite-key records")
        print("================================================================================")
        duplicate_raised = False
        try:
            with target_engine.begin() as conn:
                conn.execute(text("""
                    INSERT INTO weather_data (state, district, location, date, temp_max, temp_min, temp_avg, rainfall, humidity)
                    VALUES ('Punjab', 'Ludhiana', '', '2026-10-01', 33.0, 21.0, 27.0, 0.0, 58.0);
                """))
        except sa.exc.IntegrityError as exc:
            duplicate_raised = True
            print(f"PostgreSQL integrity error caught as expected:\n  {exc.orig}")
        assert duplicate_raised, "Failed: PostgreSQL allowed duplicate composite key record!"
        print("TEST 7 PASSED: PostgreSQL strictly rejected duplicate composite-key record.")

        print("\n================================================================================")
        print("TEST 8: Real FastAPI application lifespan startup against migrated PostgreSQL database")
        print("================================================================================")
        from contextlib import asynccontextmanager
        import logging
        from fastapi.testclient import TestClient
        import app.main
        from app.database import engine as app_engine, check_connection

        # Verify app_engine connection arguments
        safety_check(app_engine.url.port, app_engine.url.database, app_engine.url.host)
        assert app_engine.url.port == DISPOSABLE_PORT, f"app_engine port {app_engine.url.port} != {DISPOSABLE_PORT}"
        assert app_engine.url.database == DISPOSABLE_DB, f"app_engine db '{app_engine.url.database}' != '{DISPOSABLE_DB}'"

        # Explicit tracking of lifespan execution states
        lifespan_state = {
            "startup_entered": False,
            "startup_completed": False,
            "shutdown_entered": False,
            "shutdown_completed": False,
            "startup_exception": None,
            "shutdown_exception": None,
        }

        captured_logs = []
        class LogCaptureHandler(logging.Handler):
            def emit(self, record):
                captured_logs.append(self.format(record))

        log_handler = LogCaptureHandler()
        main_logger = logging.getLogger("main")
        main_logger.addHandler(log_handler)

        original_lifespan = app.main.app.router.lifespan_context

        @asynccontextmanager
        async def tracked_lifespan(app_inst):
            lifespan_state["startup_entered"] = True
            try:
                async with original_lifespan(app_inst) as maybe_state:
                    lifespan_state["startup_completed"] = True
                    yield maybe_state
                    lifespan_state["shutdown_entered"] = True
            except Exception as exc:
                if not lifespan_state["startup_completed"]:
                    lifespan_state["startup_exception"] = exc
                else:
                    lifespan_state["shutdown_exception"] = exc
                raise
            finally:
                lifespan_state["shutdown_completed"] = True

        app.main.app.router.lifespan_context = tracked_lifespan

        try:
            # 1. Assert pre-startup state
            assert getattr(app.main.app.state, "pipeline", None) is None, "app.state.pipeline should be None before lifespan startup!"

            # 2. Context-managed TestClient execution (executes lifespan startup on enter, shutdown on exit)
            with TestClient(app.main.app) as client:
                # Lifespan startup assertions
                assert lifespan_state["startup_entered"] is True, "Lifespan startup was not entered!"
                assert lifespan_state["startup_completed"] is True, "Lifespan startup did not complete!"
                assert lifespan_state["startup_exception"] is None, f"Startup raised exception: {lifespan_state['startup_exception']}"

                # Assert live database connection succeeded during startup
                assert check_connection() is True, "check_connection() returned False on live disposable DB!"

                # Assert startup log evidence verbatim
                startup_log_text = "\n".join(captured_logs)
                assert "PostgreSQL connection OK, tables ready" in startup_log_text, "Startup log missing DB ready confirmation!"
                assert "Trained model loaded: LightGBM" in startup_log_text, "Startup log missing model loaded confirmation!"
                print("LIFESPAN STARTUP EVIDENCE CONFIRMED:")
                print("  - Connection verified against disposable PostgreSQL (port 54329)")
                print("  - Tables ready & initialized")
                print("  - Trained model pipeline bound to app.state")

                # Assert app.state populated
                assert app.main.app.state.pipeline is not None, "app.state.pipeline was not populated by lifespan!"
                assert app.main.app.state.model_name == "LightGBM", f"Unexpected model_name: {app.main.app.state.model_name}"
                assert len(app.main.app.state.model_info["features"]) == 20, f"Expected 20 features, got {len(app.main.app.state.model_info['features'])}"

                # Health endpoint assertion (HTTP 200, connected status)
                health_resp = client.get("/health")
                print(f"/health response [{health_resp.status_code}]: {health_resp.json()}")
                assert health_resp.status_code == 200, f"Expected 200, got {health_resp.status_code}"
                health_data = health_resp.json()
                assert health_data["status"] == "healthy", f"Expected 'healthy', got {health_data['status']}"
                assert health_data["database"] == "connected", f"Expected 'connected', got {health_data['database']}"
                assert health_data["model_loaded"] is True, "Expected model_loaded == True"

                # Model info endpoint assertion (HTTP 200, all 20 features)
                EXPECTED_FEATURES = [
                    "lag1_temp_avg", "lag2_temp_avg", "lag3_temp_avg", "lag1_temp_max", "lag1_temp_min",
                    "lag1_humidity", "lag1_rainfall", "lag2_humidity", "lag2_rainfall", "temp_range",
                    "roll3_temp_avg", "roll7_temp_avg", "rainfall_roll3", "rainfall_roll7",
                    "month_sin", "month_cos", "day_of_year_sin", "day_of_year_cos", "Season", "State"
                ]
                model_resp = client.get("/model-info")
                print(f"/model-info response [{model_resp.status_code}]: features={len(model_resp.json().get('features', []))}")
                assert model_resp.status_code == 200, f"Expected 200, got {model_resp.status_code}"
                features = model_resp.json().get("features", [])
                assert len(features) == 20, f"Expected 20 features, got {len(features)}"
                assert features == EXPECTED_FEATURES, f"Features mismatch: {set(EXPECTED_FEATURES) ^ set(features)}"

            # 3. Post-context shutdown assertions
            assert lifespan_state["shutdown_entered"] is True, "Lifespan shutdown was not entered on context exit!"
            assert lifespan_state["shutdown_completed"] is True, "Lifespan shutdown did not complete cleanly!"
            assert lifespan_state["shutdown_exception"] is None, f"Shutdown raised exception: {lifespan_state['shutdown_exception']}"
            print("LIFESPAN SHUTDOWN EVIDENCE CONFIRMED:")
            print("  - Context exit successfully triggered lifespan shutdown generator")
            print("  - Lifespan cleanup completed cleanly with zero exceptions")

            print("TEST 8 PASSED: FastAPI lifespan startup, health check, model-info, and shutdown verified with explicit proof.")
        finally:
            app.main.app.router.lifespan_context = original_lifespan
            main_logger.removeHandler(log_handler)

        print("\n================================================================================")
        print("TEST 9: Ingestion pipeline upsert integration against live PostgreSQL")
        print("================================================================================")
        import update_weather
        from app.database import SessionLocal
        from unittest.mock import patch
        
        fixture_payload = {
            "daily": {
                "time": ["2026-10-05"],
                "temperature_2m_max": [35.5],
                "temperature_2m_min": [22.0],
                "temperature_2m_mean": [28.75],
                "precipitation_sum": [1.5],
                "relative_humidity_2m_mean": [55.0]
            }
        }
        
        db_session = SessionLocal()
        try:
            with patch.dict(update_weather.STATE_COORDS, {"Karnataka": (15.3173, 75.7139)}, clear=True), \
                 patch("update_weather.fetch_forecast_for_state", return_value=fixture_payload):
                summary = update_weather.update_weather(days_back=1, session=db_session)
                print(f"Ingestion upsert 1 summary: {summary}")
                assert summary["status"] == "success"
                assert summary["records_upserted"] == 1
                
            # Verify row in DB
            with target_engine.connect() as conn:
                row = conn.execute(text("SELECT state, date, temp_max, temp_avg FROM weather_data WHERE state = 'Karnataka' AND date = '2026-10-05';")).fetchone()
                print(f"Database row: {row}")
                assert row is not None
                assert row[2] == 35.5
                assert row[3] == 28.75
                
            # Re-run upsert with changed temperature to test ON CONFLICT DO UPDATE
            fixture_payload["daily"]["temperature_2m_max"] = [36.0]
            with patch.dict(update_weather.STATE_COORDS, {"Karnataka": (15.3173, 75.7139)}, clear=True), \
                 patch("update_weather.fetch_forecast_for_state", return_value=fixture_payload):
                summary2 = update_weather.update_weather(days_back=1, session=db_session)
                print(f"Ingestion upsert 2 (update) summary: {summary2}")
                assert summary2["status"] == "success"
                assert summary2["records_upserted"] == 1
                
            with target_engine.connect() as conn:
                row2 = conn.execute(text("SELECT temp_max FROM weather_data WHERE state = 'Karnataka' AND date = '2026-10-05';")).fetchone()
                print(f"Updated database row: {row2}")
                assert row2[0] == 36.0
                
            print("TEST 9 PASSED: Real PostgreSQL upsert and conflict update verified.")
        finally:
            db_session.close()

        print("\n================================================================================")
        print("ALL 9 DISPOSABLE POSTGRESQL INTEGRATION TESTS PASSED WITH 100% SUCCESS!")
        print("================================================================================")
        
    finally:
        print("\nCleaning up disposable PostgreSQL server process...")
        if proc is not None:
            try:
                proc.terminate()
                proc.wait(timeout=5)
                print("Disposable PostgreSQL server cleanly terminated.")
            except subprocess.TimeoutExpired:
                print("Server termination timed out; sending SIGKILL...")
                proc.kill()
                proc.wait(timeout=5)
                print("Disposable PostgreSQL server killed.")
            except Exception as e:
                print(f"Error during server shutdown: {e}")
        if pg_log_file is not None and not pg_log_file.closed:
            pg_log_file.close()


if __name__ == "__main__":
    run_integration()
