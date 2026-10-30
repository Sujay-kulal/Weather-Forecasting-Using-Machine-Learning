#!/usr/bin/env python3
"""
Reusable Database Coverage, Continuity & Integrity Audit Script
Audits PostgreSQL `weather_data` across all 34 Indian states/UTs.
Enforces read-only execution to protect historical data integrity.
"""

import argparse
import json
import os
import sys
from datetime import date, timedelta
from typing import Any, Dict, List

import psycopg
from psycopg.rows import dict_row


def get_default_connection_uri() -> str:
    """Resolve database URI with priority: CLI arg > DATABASE_URL > default port 5433."""
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


def run_database_audit(connection_uri: str) -> Dict[str, Any]:
    """Execute comprehensive read-only audit across 34 states/UTs."""
    clean_uri = connection_uri.replace("postgresql+psycopg://", "postgresql://")
    
    # Establish connection with read-only constraint
    conn = psycopg.connect(clean_uri, row_factory=dict_row)
    conn.read_only = True
    cur = conn.cursor()

    report: Dict[str, Any] = {
        "metadata": {
            "connection_target": clean_uri.split("@")[-1],  # redact password/user
            "audit_timestamp": date.today().isoformat(),
            "execution_mode": "READ_ONLY",
        }
    }

    # 1. Overall table summary
    cur.execute("""
        SELECT 
            COUNT(*) AS total_rows,
            COUNT(DISTINCT state) AS distinct_states,
            MIN(date) AS min_date,
            MAX(date) AS max_date
        FROM weather_data;
    """)
    overall = cur.fetchone()
    report["overall_summary"] = {
        "total_rows": overall["total_rows"],
        "distinct_states": overall["distinct_states"],
        "min_date": overall["min_date"].isoformat() if overall["min_date"] else None,
        "max_date": overall["max_date"].isoformat() if overall["max_date"] else None,
    }

    # 2. Post-2026-10-22 check (authenticity invariant)
    cur.execute("""
        SELECT COUNT(*) AS post_cutoff_count,
               MIN(date) AS min_post_cutoff_date,
               MAX(date) AS max_post_cutoff_date
        FROM weather_data 
        WHERE date > '2026-10-22';
    """)
    post_cutoff = cur.fetchone()
    report["post_cutoff_audit"] = {
        "cutoff_date": "2026-10-22",
        "post_cutoff_records": post_cutoff["post_cutoff_count"],
        "min_post_cutoff_date": post_cutoff["min_post_cutoff_date"].isoformat() if post_cutoff["min_post_cutoff_date"] else None,
        "max_post_cutoff_date": post_cutoff["max_post_cutoff_date"].isoformat() if post_cutoff["max_post_cutoff_date"] else None,
        "authentic_post_records_exist": post_cutoff["post_cutoff_count"] > 0,
    }

    # 3. Uniqueness and collision analysis
    # Constraint 1: (state, district, location, date) - Production Unique Constraint
    cur.execute("""
        SELECT state, district, location, date, COUNT(*) as c
        FROM weather_data
        GROUP BY state, district, location, date
        HAVING COUNT(*) > 1;
    """)
    uq_4tuple_violations = cur.fetchall()

    # Constraint 2: (state, date) - Legacy / Colliding constraint
    cur.execute("""
        SELECT state, date, COUNT(*) as c
        FROM weather_data
        GROUP BY state, date
        HAVING COUNT(*) > 1;
    """)
    uq_2tuple_collisions = cur.fetchall()

    report["uniqueness_audit"] = {
        "production_constraint_4tuple": {
            "columns": ["state", "district", "location", "date"],
            "violation_count": len(uq_4tuple_violations),
            "is_unique": len(uq_4tuple_violations) == 0,
        },
        "legacy_constraint_2tuple": {
            "columns": ["state", "date"],
            "collision_count": len(uq_2tuple_collisions),
            "colliding_states": sorted(list(set(r["state"] for r in uq_2tuple_collisions))),
            "is_unique": len(uq_2tuple_collisions) == 0,
            "explanation": "State-level and district/location-level records share the same calendar dates."
        }
    }

    # 4. Invalid and null values audit
    cur.execute("""
        SELECT 
            COUNT(CASE WHEN temp_max IS NULL THEN 1 END) AS null_temp_max,
            COUNT(CASE WHEN temp_min IS NULL THEN 1 END) AS null_temp_min,
            COUNT(CASE WHEN temp_avg IS NULL THEN 1 END) AS null_temp_avg,
            COUNT(CASE WHEN humidity IS NULL THEN 1 END) AS null_humidity,
            COUNT(CASE WHEN rainfall IS NULL THEN 1 END) AS null_rainfall,
            COUNT(CASE WHEN temp_max < -50.0 OR temp_max > 60.0 THEN 1 END) AS oob_temp_max,
            COUNT(CASE WHEN temp_min < -50.0 OR temp_min > 60.0 THEN 1 END) AS oob_temp_min,
            COUNT(CASE WHEN temp_avg < -50.0 OR temp_avg > 60.0 THEN 1 END) AS oob_temp_avg,
            COUNT(CASE WHEN temp_min > temp_max THEN 1 END) AS inverted_temp_min_max,
            COUNT(CASE WHEN humidity < 0.0 OR humidity > 100.0 THEN 1 END) AS oob_humidity,
            COUNT(CASE WHEN rainfall < 0.0 OR rainfall > 2000.0 THEN 1 END) AS oob_rainfall
        FROM weather_data;
    """)
    invalid_scan = cur.fetchone()
    total_invalid = sum(invalid_scan.values())
    report["data_integrity_audit"] = {
        "metrics_checked": list(invalid_scan.keys()),
        "invalid_counts": invalid_scan,
        "total_violations": total_invalid,
        "all_values_physically_valid": total_invalid == 0,
    }

    # 5. Per-State coverage & continuity audit (2023-04-01 to 2026-09-06)
    start_eval = date(2023, 4, 1)
    end_eval = date(2026, 9, 6)
    expected_days = (end_eval - start_eval).days + 1  # 1255 days

    cur.execute("""
        SELECT 
            state,
            COUNT(*) AS total_records,
            COUNT(CASE WHEN district = '' AND location = '' THEN 1 END) AS state_level_records,
            COUNT(CASE WHEN district != '' OR location != '' THEN 1 END) AS location_level_records,
            MIN(date) AS min_date,
            MAX(date) AS max_date
        FROM weather_data
        GROUP BY state
        ORDER BY state;
    """)
    state_rows = cur.fetchall()

    states_coverage = []
    missing_dates_by_state = {}

    for row in state_rows:
        state_name = row["state"]
        
        # Query distinct state-level dates
        cur.execute("""
            SELECT date FROM weather_data 
            WHERE state = %s AND district = '' AND location = ''
            ORDER BY date;
        """, (state_name,))
        state_dates = set(r["date"] for r in cur.fetchall())

        missing = [
            (start_eval + timedelta(days=i)).isoformat()
            for i in range(expected_days)
            if (start_eval + timedelta(days=i)) not in state_dates
        ]
        missing_dates_by_state[state_name] = missing

        states_coverage.append({
            "state": state_name,
            "total_records": row["total_records"],
            "state_level_records": row["state_level_records"],
            "location_level_records": row["location_level_records"],
            "min_date": row["min_date"].isoformat() if row["min_date"] else None,
            "max_date": row["max_date"].isoformat() if row["max_date"] else None,
            "evaluation_expected_days": expected_days,
            "evaluation_present_days": len(state_dates),
            "missing_dates_count": len(missing),
            "missing_dates": missing,
        })

    report["states_coverage"] = states_coverage

    # Common missing dates across all 34 states
    all_missing_sets = [set(missing_dates_by_state[s["state"]]) for s in states_coverage]
    common_missing = sorted(list(set.intersection(*all_missing_sets))) if all_missing_sets else []
    report["common_missing_dates"] = {
        "dates": common_missing,
        "count": len(common_missing),
        "explanation": "Missing calendar dates common to all 34 states/UTs due to synchronized API omission or collection pause."
    }

    # 6. Karnataka detailed breakdown
    cur.execute("""
        SELECT district, location, COUNT(*) as records, MIN(date) as min_date, MAX(date) as max_date
        FROM weather_data
        WHERE state = 'Karnataka'
        GROUP BY district, location
        ORDER BY district, location;
    """)
    ka_breakdown = cur.fetchall()
    report["karnataka_drilldown"] = [
        {
            "district": r["district"] or "[State-Level / Empty]",
            "location": r["location"] or "[State-Level / Empty]",
            "records": r["records"],
            "min_date": r["min_date"].isoformat(),
            "max_date": r["max_date"].isoformat(),
        }
        for r in ka_breakdown
    ]

    conn.close()
    return report


def print_console_summary(report: Dict[str, Any]):
    """Format and print an executive-ready ASCII summary table to stdout."""
    print("=" * 80)
    print("           HISTORICAL WEATHER DATABASE AUDIT REPORT")
    print("=" * 80)
    meta = report["metadata"]
    print(f"Target Host/DB : {meta['connection_target']}")
    print(f"Execution Mode : {meta['execution_mode']} (Zero Mutations)")
    print(f"Audit Date     : {meta['audit_timestamp']}")
    print("-" * 80)

    ov = report["overall_summary"]
    print(f"Total Rows in `weather_data` : {ov['total_rows']:,}")
    print(f"Distinct States/UTs          : {ov['distinct_states']}")
    print(f"Overall Date Range           : {ov['min_date']} to {ov['max_date']}")
    print("-" * 80)

    post = report["post_cutoff_audit"]
    print(f"Post-2026-10-22 Records      : {post['post_cutoff_records']} (Cutoff: {post['cutoff_date']})")
    print(f"Authentic Post Records Exist : {post['authentic_post_records_exist']}")
    print("-" * 80)

    uniq = report["uniqueness_audit"]
    prod_u = uniq["production_constraint_4tuple"]
    legacy_u = uniq["legacy_constraint_2tuple"]
    print(f"Unique Constraint (state, district, loc, date) Violations : {prod_u['violation_count']} (PASS: {prod_u['is_unique']})")
    print(f"Collisions on (state, date)                               : {legacy_u['collision_count']} (Affects: {', '.join(legacy_u['colliding_states'])})")
    print("-" * 80)

    integ = report["data_integrity_audit"]
    print(f"Null / Out-of-Bounds Violations : {integ['total_violations']} (Physical Validity: {integ['all_values_physically_valid']})")
    print("-" * 80)

    common = report["common_missing_dates"]
    print(f"Common Missing Dates (All States) : {len(common['dates'])} -> {', '.join(common['dates'])}")
    print("=" * 80)

    print("\nPER-STATE OBSERVATION SUMMARY TABLE (34 States/UTs):")
    print(f"{'State/UT':<25} | {'Total':<7} | {'State-Lvl':<9} | {'Loc-Lvl':<7} | {'Min Date':<10} | {'Max Date':<10} | {'Missing':<7}")
    print("-" * 86)
    for st in report["states_coverage"]:
        print(f"{st['state']:<25} | {st['total_records']:<7} | {st['state_level_records']:<9} | {st['location_level_records']:<7} | {st['min_date']:<10} | {st['max_date']:<10} | {st['missing_dates_count']:<7}")
    print("-" * 86)

    print("\nKARNATAKA GRANULARITY BREAKDOWN:")
    for ka in report["karnataka_drilldown"]:
        print(f"  - District: {ka['district']}, Location: {ka['location']} -> {ka['records']:,} rows ({ka['min_date']} to {ka['max_date']})")
    print("=" * 80)


def main():
    parser = argparse.ArgumentParser(description="Audit PostgreSQL weather data coverage, continuity, and integrity.")
    parser.add_argument("--db-url", type=str, default=None, help="Database URI (defaults to DATABASE_URL or port 5433).")
    parser.add_argument("--json-out", type=str, default=None, help="File path to save JSON audit report.")
    args = parser.parse_args()

    db_uri = args.db_url or get_default_connection_uri()
    try:
        report = run_database_audit(db_uri)
    except Exception as e:
        print(f"ERROR: Database audit failed: {e}", file=sys.stderr)
        sys.exit(1)

    print_console_summary(report)

    if args.json_out:
        with open(args.json_out, "w") as f:
            json.dump(report, f, indent=2)
        print(f"\nJSON report written to: {args.json_out}")


if __name__ == "__main__":
    main()
