#!/usr/bin/env python3
"""
Controlled Live Open-Meteo API Test Script with Transactional Rollback Ingestion Test
Executes exactly ONE controlled live HTTP request for a designated state/UT to verify
network retrieval, HTTP 200, response schema, latency, and units.
Optionally tests PostgreSQL upsert handling with explicit transaction rollback to guarantee zero data pollution.
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, date, timedelta
from typing import Any, Dict, Optional, Tuple

import psycopg
from psycopg.rows import dict_row

# Ensure repository root is on sys.path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

# Authoritative coordinates matching backend/update_weather.py exactly
STATE_COORDS: Dict[str, Tuple[float, float]] = {
    'Andhra Pradesh': (15.9129, 79.7400),
    'Arunachal Pradesh': (28.2180, 94.7278),
    'Assam': (26.2006, 92.9376),
    'Bihar': (25.0961, 85.3131),
    'Chandigarh': (30.7333, 76.7794),
    'Chhattisgarh': (21.2787, 81.8661),
    'Dadra And Nagar Haveli And Daman And Diu': (20.3974, 72.8328),
    'Delhi': (28.7041, 77.1025),
    'Goa': (15.2993, 74.1240),
    'Gujarat': (22.2587, 71.1924),
    'Haryana': (29.0588, 76.0856),
    'Himachal Pradesh': (31.1048, 77.1666),
    'Jammu And Kashmir': (33.7782, 76.5762),
    'Jharkhand': (23.6102, 85.2799),
    'Karnataka': (15.3173, 75.7139),
    'Kerala': (10.8505, 76.2711),
    'Madhya Pradesh': (22.9734, 78.6569),
    'Maharashtra': (19.7515, 75.7139),
    'Manipur': (24.6637, 93.9063),
    'Meghalaya': (25.4670, 91.3662),
    'Mizoram': (23.1645, 92.9376),
    'Nagaland': (26.1584, 94.5624),
    'Odisha': (20.9517, 85.0985),
    'Other': (20.5937, 78.9629),
    'Puducherry': (11.9416, 79.8083),
    'Punjab': (31.1471, 75.3412),
    'Rajasthan': (27.0238, 74.2179),
    'Sikkim': (27.5330, 88.5122),
    'Tamil Nadu': (11.1271, 78.6569),
    'Telangana': (18.1124, 79.0193),
    'Tripura': (23.9408, 91.9882),
    'Uttar Pradesh': (26.8467, 80.9462),
    'Uttarakhand': (30.0668, 79.0193),
    'West Bengal': (22.9868, 87.8550)
}


def resolve_state(state_name: str) -> Tuple[str, Tuple[float, float]]:
    """
    Resolve state name case-insensitively and return (canonical_name, (latitude, longitude)).
    Raises ValueError if state name is unrecognized.
    """
    cleaned = state_name.strip()
    if cleaned in STATE_COORDS:
        return cleaned, STATE_COORDS[cleaned]

    lookup = {k.lower(): (k, v) for k, v in STATE_COORDS.items()}
    if cleaned.lower() in lookup:
        return lookup[cleaned.lower()]

    available = ", ".join(sorted(STATE_COORDS.keys()))
    raise ValueError(f"Unknown state '{state_name}'. Available states/UTs:\n{available}")


def get_db_uri(custom_url: Optional[str] = None) -> str:
    """Resolve database URI with priority: custom_url > DATABASE_URL > default port 5433."""
    if custom_url:
        return custom_url.replace("postgresql+psycopg://", "postgresql://")
    env_url = os.environ.get("DATABASE_URL")
    if env_url:
        return env_url.replace("postgresql+psycopg://", "postgresql://")
    host = os.environ.get("PGHOST", "localhost")
    port = os.environ.get("PGPORT", "5433")
    user = os.environ.get("PGUSER", "postgres")
    password = os.environ.get("PGPASSWORD", "")
    dbname = os.environ.get("PGDATABASE", "weather_forecasting")
    auth = f"{user}:{password}@" if password else f"{user}@"
    return f"postgresql://{auth}{host}:{port}/{dbname}"


def test_live_api_call(
    state: str = "Delhi",
    lat: float = 28.7041,
    lon: float = 77.1025,
    query_date: Optional[date] = None
) -> Dict[str, Any]:
    """
    Execute exactly ONE live HTTP call to Open-Meteo API and validate schema.
    If query_date is provided, queries that specific date.
    If query_date is older than 80 days, uses the historical archive API; otherwise uses forecast API.
    If query_date is None, queries rolling past/forecast days (past_days=1, forecast_days=1).
    """
    daily_params = "temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean"

    if query_date is not None:
        date_str = query_date.isoformat()
        # Historical dates beyond ~80 days are served by archive-api
        if query_date < (date.today() - timedelta(days=80)):
            endpoint = "https://archive-api.open-meteo.com/v1/archive"
        else:
            endpoint = "https://api.open-meteo.com/v1/forecast"
        url = (
            f"{endpoint}?"
            f"latitude={lat}&longitude={lon}&"
            f"start_date={date_str}&end_date={date_str}&"
            f"daily={daily_params}&"
            f"timezone=auto"
        )
    else:
        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}&"
            f"past_days=1&forecast_days=1&"
            f"daily={daily_params}&"
            f"timezone=auto"
        )

    req = urllib.request.Request(url, headers={"User-Agent": "WeatherAuditLiveTest/1.0"})

    start_time = time.perf_counter()
    with urllib.request.urlopen(req, timeout=15) as resp:
        elapsed_sec = time.perf_counter() - start_time
        status_code = resp.status
        headers = dict(resp.getheaders())
        raw_body = resp.read().decode("utf-8")
        data = json.loads(raw_body)

    # 1. Status Code Validation
    assert status_code == 200, f"Expected HTTP 200, received {status_code}"

    # 2. Schema Structure Validation
    assert "daily" in data, "Response missing 'daily' section"
    assert "daily_units" in data, "Response missing 'daily_units' section"
    daily = data["daily"]
    units = data["daily_units"]

    expected_vars = [
        "temperature_2m_max",
        "temperature_2m_min",
        "temperature_2m_mean",
        "precipitation_sum",
        "relative_humidity_2m_mean",
    ]

    assert "time" in daily, "Missing 'time' in daily response"
    for var in expected_vars:
        assert var in daily, f"Missing '{var}' in daily response"
        assert var in units, f"Missing unit for '{var}'"

    # 3. Unit Validation (allow °C or variations like \u00b0C)
    expected_units = {
        "temperature_2m_max": ["°C", "\u00b0C"],
        "temperature_2m_min": ["°C", "\u00b0C"],
        "temperature_2m_mean": ["°C", "\u00b0C"],
        "precipitation_sum": ["mm"],
        "relative_humidity_2m_mean": ["%"],
    }
    unit_mismatches = {}
    for var, allowed in expected_units.items():
        actual_unit = units.get(var)
        if actual_unit not in allowed and actual_unit != "C":
            unit_mismatches[var] = {"expected": allowed, "actual": actual_unit}

    assert not unit_mismatches, f"Unit mismatches: {unit_mismatches}"

    # 4. Array Alignments & Non-Empty Checks
    n_days = len(daily["time"])
    assert n_days >= 1, "Expected at least 1 day in daily arrays"
    for var in expected_vars:
        assert len(daily[var]) == n_days, f"Array length mismatch for {var}"

    # Parse target observation (index 0 corresponds to target_date when specified, or past day when past_days=1)
    obs_idx = 0
    first_obs = {
        "state": state,
        "district": "",
        "location": "",
        "date": daily["time"][obs_idx],
        "temp_max": float(daily["temperature_2m_max"][obs_idx]) if daily["temperature_2m_max"][obs_idx] is not None else None,
        "temp_min": float(daily["temperature_2m_min"][obs_idx]) if daily["temperature_2m_min"][obs_idx] is not None else None,
        "temp_avg": float(daily["temperature_2m_mean"][obs_idx]) if daily["temperature_2m_mean"][obs_idx] is not None else None,
        "humidity": float(daily["relative_humidity_2m_mean"][obs_idx]) if daily["relative_humidity_2m_mean"][obs_idx] is not None else None,
        "rainfall": float(daily["precipitation_sum"][obs_idx]) if daily["precipitation_sum"][obs_idx] is not None else None,
    }

    return {
        "target_state": state,
        "coordinates": (lat, lon),
        "query_date": query_date.isoformat() if query_date else None,
        "request_url": url,
        "status_code": status_code,
        "latency_ms": round(elapsed_sec * 1000, 2),
        "content_length": len(raw_body),
        "units": units,
        "times": daily["time"],
        "observation_count": n_days,
        "parsed_observation": first_obs,
    }


def test_transactional_rollback(db_uri: str, parsed_obs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Test PostgreSQL upsert handling with transaction rollback.
    Verifies the production unique constraint uq_weather_state_dist_loc_date works properly
    and verifies that transaction rollback restores the original database state with ZERO pollution.
    """
    clean_uri = db_uri.replace("postgresql+psycopg://", "postgresql://")
    conn = psycopg.connect(clean_uri, row_factory=dict_row)
    try:
        cur = conn.cursor()

        target_state = parsed_obs["state"]
        target_date = datetime.strptime(parsed_obs["date"], "%Y-%m-%d").date()
        target_dist = parsed_obs["district"]
        target_loc = parsed_obs["location"]

        # 1. Capture baseline state before test
        cur.execute("""
            SELECT * FROM weather_data
            WHERE state = %s AND district = %s AND location = %s AND date = %s;
        """, (target_state, target_dist, target_loc, target_date))
        baseline_row = cur.fetchone()
        existed_prior = baseline_row is not None

        rollback_verified = False
        in_tx_row = None

        try:
            # 2. Execute PostgreSQL UPSERT statement matching backend/update_weather.py exactly
            cur.execute("""
                INSERT INTO weather_data (state, district, location, date, temp_max, temp_min, temp_avg, humidity, rainfall)
                VALUES (%(state)s, %(district)s, %(location)s, %(date)s, %(temp_max)s, %(temp_min)s, %(temp_avg)s, %(humidity)s, %(rainfall)s)
                ON CONFLICT ON CONSTRAINT uq_weather_state_dist_loc_date DO UPDATE SET
                    temp_max = EXCLUDED.temp_max,
                    temp_min = EXCLUDED.temp_min,
                    temp_avg = EXCLUDED.temp_avg,
                    humidity = EXCLUDED.humidity,
                    rainfall = EXCLUDED.rainfall
                RETURNING id, state, district, location, date, temp_max, temp_min, temp_avg, humidity, rainfall;
            """, {
                "state": target_state,
                "district": target_dist,
                "location": target_loc,
                "date": target_date,
                "temp_max": parsed_obs["temp_max"],
                "temp_min": parsed_obs["temp_min"],
                "temp_avg": parsed_obs["temp_avg"],
                "humidity": parsed_obs["humidity"],
                "rainfall": parsed_obs["rainfall"],
            })
            in_tx_row = cur.fetchone()

            # 3. Explicitly ROLLBACK the transaction
            conn.rollback()
        except Exception as e:
            conn.rollback()
            raise RuntimeError(f"Upsert transaction failed: {e}")

        # 4. Verify post-rollback state
        cur.execute("""
            SELECT * FROM weather_data
            WHERE state = %s AND district = %s AND location = %s AND date = %s;
        """, (target_state, target_dist, target_loc, target_date))
        post_rollback_row = cur.fetchone()

        if existed_prior:
            # Must exactly match baseline_row
            rollback_verified = (post_rollback_row == baseline_row)
        else:
            # Must still be None
            rollback_verified = (post_rollback_row is None)

        return {
            "tested_constraint": "uq_weather_state_dist_loc_date",
            "target_date": target_date.isoformat(),
            "existed_prior_to_test": existed_prior,
            "baseline_row": {k: (v.isoformat() if isinstance(v, (date, datetime)) else v) for k, v in baseline_row.items()} if baseline_row else None,
            "upserted_in_transaction": {k: (v.isoformat() if isinstance(v, (date, datetime)) else v) for k, v in in_tx_row.items()} if in_tx_row else None,
            "post_rollback_row": {k: (v.isoformat() if isinstance(v, (date, datetime)) else v) for k, v in post_rollback_row.items()} if post_rollback_row else None,
            "rollback_verified_clean": rollback_verified,
            "historical_data_polluted": not rollback_verified,
        }
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(
        description="Controlled Open-Meteo live API test and optional PostgreSQL transactional rollback validation."
    )
    parser.add_argument(
        "--state",
        type=str,
        default="Delhi",
        help="Target Indian state/UT for live probe (default: Delhi)",
    )
    parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="Specific observation date (YYYY-MM-DD) to query (default: past observation date)",
    )
    parser.add_argument(
        "--skip-db",
        action="store_true",
        help="Skip database connection and rollback test (network & API schema verification only)",
    )
    parser.add_argument(
        "--db-url",
        type=str,
        default=None,
        help="Database connection URL (overrides DATABASE_URL and default port 5433)",
    )
    parser.add_argument(
        "--json-out",
        type=str,
        default=None,
        help="Save output to JSON file",
    )
    args = parser.parse_args()

    # Resolve state name to genuine coordinates
    try:
        canonical_state, coords = resolve_state(args.state)
    except ValueError as val_err:
        print(f"ERROR: {val_err}", file=sys.stderr)
        sys.exit(1)

    # Parse and validate optional --date
    query_date: Optional[date] = None
    if args.date:
        try:
            query_date = datetime.strptime(args.date.strip(), "%Y-%m-%d").date()
        except ValueError:
            print(f"ERROR: Invalid date format '{args.date}'. Expected YYYY-MM-DD.", file=sys.stderr)
            sys.exit(1)

    print("=" * 80)
    print("      CONTROLLED LIVE OPEN-METEO API & TRANSACTION ROLLBACK TEST")
    print("=" * 80)
    print(f"Target State   : {canonical_state} (lat: {coords[0]}, lon: {coords[1]})")
    print(f"Target Date    : {query_date.isoformat() if query_date else 'Rolling Past Day (Default)'}")
    print(f"API Mode       : Single Controlled Probe (Zero bulk calls)")
    print(f"DB Mode        : {'SKIPPED (--skip-db)' if args.skip_db else 'Transaction ROLLBACK (Zero persistence)'}")
    print("-" * 80)

    # Step 1: Live API Test
    print("\n[Step 1/2] Executing Single Live HTTP GET to Open-Meteo API...")
    try:
        api_res = test_live_api_call(
            state=canonical_state,
            lat=coords[0],
            lon=coords[1],
            query_date=query_date,
        )
    except urllib.error.HTTPError as http_err:
        print(f"ERROR: Open-Meteo API HTTP error {http_err.code}: {http_err.reason}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as url_err:
        print(f"ERROR: Network connection failed: {url_err.reason}", file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        print(f"ERROR: Live API test failed: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"  HTTP Status  : {api_res['status_code']} OK")
    print(f"  Latency      : {api_res['latency_ms']} ms")
    print(f"  Payload Size : {api_res['content_length']} bytes")
    print(f"  Units        : {api_res['units']}")
    print(f"  Observations : {api_res['observation_count']} day(s) -> {api_res['times']}")
    print(f"  Parsed Obs   : {api_res['parsed_observation']}")

    # Step 2: Database Rollback Test (Optional based on --skip-db)
    db_res: Optional[Dict[str, Any]] = None
    if args.skip_db:
        print("\n[Step 2/2] Skipped database connection & rollback test (--skip-db specified).")
    else:
        print("\n[Step 2/2] Testing PostgreSQL Upsert on Constraint with Explicit Rollback...")
        db_uri = get_db_uri(custom_url=args.db_url)
        try:
            db_res = test_transactional_rollback(db_uri, api_res["parsed_observation"])
            print(f"  Constraint Tested : {db_res['tested_constraint']}")
            print(f"  Target Date       : {db_res['target_date']}")
            print(f"  Existed Prior     : {db_res['existed_prior_to_test']}")
            print(f"  Upsert in Tx      : ID {db_res['upserted_in_transaction']['id'] if db_res['upserted_in_transaction'] else 'N/A'}")
            print(f"  Post-Rollback Row : {db_res['post_rollback_row']}")
            print(f"  Rollback Verified : {db_res['rollback_verified_clean']} (Historical data polluted: {db_res['historical_data_polluted']})")
        except (psycopg.OperationalError, psycopg.Error) as db_err:
            print(f"ERROR: Database connection failed: {db_err}", file=sys.stderr)
            sys.exit(1)
        except Exception as exc:
            print(f"ERROR: Database rollback test failed: {exc}", file=sys.stderr)
            sys.exit(1)

    print("=" * 80)

    all_passed = api_res["status_code"] == 200 and (args.skip_db or (db_res is not None and db_res["rollback_verified_clean"]))

    full_report = {
        "live_api_test": api_res,
        "database_rollback_test": db_res,
        "skip_db": args.skip_db,
        "all_tests_passed": all_passed,
    }

    if args.json_out:
        with open(args.json_out, "w") as f:
            json.dump(full_report, f, indent=2)
        print(f"\nJSON report written to: {args.json_out}")

    if not all_passed:
        print("ERROR: One or more validation checks failed!", file=sys.stderr)
        sys.exit(1)
    else:
        if args.skip_db:
            print("SUCCESS: Controlled live Open-Meteo API probe and schema validation PASSED (DB skipped).")
        else:
            print("SUCCESS: Controlled live Open-Meteo test & transactional rollback verified clean.")


if __name__ == "__main__":
    main()
