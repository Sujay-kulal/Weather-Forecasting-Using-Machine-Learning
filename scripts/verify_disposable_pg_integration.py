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

# PROHIBITED IDENTITIES - SAFETY SHIELD
PROHIBITED_PORTS = (5432, 5433)
PROHIBITED_DBS = ("weather_forecasting", "weather_forecasting_prod", "production")

def safety_check(port: int, dbname: str):
    if port in PROHIBITED_PORTS:
        raise RuntimeError(f"ABORT: Attempted connection to prohibited port {port}!")
    if dbname in PROHIBITED_DBS:
        raise RuntimeError(f"ABORT: Attempted connection to prohibited database {dbname}!")
    print(f"SAFETY CHECK PASSED: Port {port} and DB '{dbname}' are safe for disposable testing.")

def run_integration():
    safety_check(DISPOSABLE_PORT, DISPOSABLE_DB)
    
    print("\n================================================================================")
    print("STEP 0: Starting isolated disposable PostgreSQL server on port 54329...")
    print("================================================================================")
    cmd = ["C:\\Users\\SUJAY\\pgsql\\bin\\postgres.exe", "-D", TEMP_CLUSTER_DIR, "-p", str(DISPOSABLE_PORT)]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    print(f"Launched postgres server (PID: {proc.pid})")
    
    try:
        import psycopg
        import sqlalchemy as sa
        from sqlalchemy import text
        
        # Wait for server ready
        server_ready = False
        for i in range(15):
            time.sleep(1)
            try:
                with psycopg.connect(f"host=127.0.0.1 port={DISPOSABLE_PORT} user=postgres dbname=postgres", connect_timeout=2) as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT inet_server_port(), current_database(), version();")
                        p, d, v = cur.fetchone()
                        if p != DISPOSABLE_PORT:
                            raise RuntimeError(f"Expected port {DISPOSABLE_PORT}, got {p}!")
                        print(f"PostgreSQL server confirmed listening on port {p}, default db: {d}")
                        server_ready = True
                        break
            except Exception as e:
                pass
        
        if not server_ready:
            raise RuntimeError("PostgreSQL server failed to start within timeout.")
        
        # Drop and create disposable database
        with psycopg.connect(f"host=127.0.0.1 port={DISPOSABLE_PORT} user=postgres dbname=postgres", autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(f"DROP DATABASE IF EXISTS {DISPOSABLE_DB};")
                cur.execute(f"CREATE DATABASE {DISPOSABLE_DB};")
                print(f"Database '{DISPOSABLE_DB}' created freshly on port {DISPOSABLE_PORT}.")

        # Positive verification on the disposable database
        with psycopg.connect(f"host=127.0.0.1 port={DISPOSABLE_PORT} user=postgres dbname={DISPOSABLE_DB}") as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT inet_server_port(), current_database();")
                active_port, active_db = cur.fetchone()
                safety_check(active_port, active_db)
                if active_port != DISPOSABLE_PORT or active_db != DISPOSABLE_DB:
                    raise RuntimeError("Verification failed: Not connected to disposable target!")
                print(f"POSITIVELY VERIFIED: current_database()='{active_db}', port={active_port}")

        # Set environment variable for backend imports
        os.environ["DATABASE_URL"] = DISPOSABLE_URL
        target_engine = sa.create_engine(DISPOSABLE_URL, pool_pre_ping=True)

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
        print("TEST 8: Real FastAPI application startup against migrated PostgreSQL database")
        print("================================================================================")
        # Import app and TestClient
        from fastapi.testclient import TestClient
        import app.main
        from app.database import check_connection
        
        # Verify DB check
        conn_ok = check_connection()
        assert conn_ok is True, "check_connection() returned False on live migrated database!"
        
        client = TestClient(app.main.app)
        
        # Health endpoint
        health_resp = client.get("/health")
        print(f"/health response [{health_resp.status_code}]: {health_resp.json()}")
        assert health_resp.status_code == 200
        assert health_resp.json()["status"] == "healthy"
        assert health_resp.json()["database"] == "connected"
        assert health_resp.json()["model_loaded"] is True
        
        # Model info endpoint
        model_resp = client.get("/model-info")
        print(f"/model-info response [{model_resp.status_code}]: features={len(model_resp.json().get('features', []))}")
        assert model_resp.status_code == 200
        assert len(model_resp.json()["features"]) == 20
        print("TEST 8 PASSED: FastAPI application cleanly started and served /health and /model-info.")

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
        try:
            proc.terminate()
            proc.wait(timeout=5)
            print("Disposable PostgreSQL server cleanly terminated.")
        except Exception as e:
            print(f"Error during server shutdown: {e}")

if __name__ == "__main__":
    run_integration()
