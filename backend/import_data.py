"""
Import the real weather dataset into PostgreSQL.

Source : data/archive_c/PSP_Weather_Merged_EDA_Cleaned.csv  (never modified)
Target : weather_data table (only weather columns - power-demand columns excluded)

Safe to run multiple times: existing (state, date) rows are skipped,
duplicates inside the CSV are dropped, nothing is fabricated.

Usage (from backend/):
    python import_data.py
"""
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

# Make `app` importable when run from the backend folder
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.database import SessionLocal, engine, init_db  # noqa: E402
from app.models import WeatherData  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = PROJECT_ROOT / "data" / "archive_c" / "PSP_Weather_Merged_EDA_Cleaned.csv"


def import_weather_dataframe(df: pd.DataFrame, session) -> tuple[int, int]:
    """Import cleaned weather dataframe into the database session, skipping existing statewide rows.

    Returns (added_count, skipped_count).
    """
    table = WeatherData.__table__
    dialect = session.get_bind().dialect.name
    insert = {"postgresql": pg_insert, "sqlite": sqlite_insert}[dialect]
    rows = df.to_dict(orient="records")
    added = 0
    for index in range(0, len(rows), 1000):
        batch = [dict(row, district="", location="") for row in rows[index : index + 1000]]
        statement = insert(table).values(batch).on_conflict_do_nothing(
            index_elements=["state", "district", "location", "date"],
        ).returning(table.c.id)
        added += len(session.scalars(statement).all())
    session.commit()
    return added, len(rows) - added


def main():
    load_dotenv(Path(__file__).resolve().parent / ".env")

    # Auto-fetch dataset from Kaggle if not present
    if not CSV_PATH.exists():
        print("[0/5] Dataset not found locally. Fetching from Kaggle ...")
        sys.path.insert(0, str(PROJECT_ROOT))
        from fetch_data import download_dataset
        download_dataset()

    if not CSV_PATH.exists():
        sys.exit(f"FATAL: dataset not found at {CSV_PATH}")

    print(f"[1/5] Reading {CSV_PATH.name} ...")
    df = pd.read_csv(CSV_PATH, usecols=["Date", "State", "Temp_Max", "Temp_Min",
                                        "Temp_Avg", "Humidity", "Rainfall"])
    print(f"      raw rows: {len(df)}")

    print("[2/5] Cleaning ...")
    df = df.rename(columns={"Date": "date", "State": "state", "Temp_Max": "temp_max",
                            "Temp_Min": "temp_min", "Temp_Avg": "temp_avg",
                            "Humidity": "humidity", "Rainfall": "rainfall"})
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date
    num_cols = ["temp_max", "temp_min", "temp_avg", "humidity", "rainfall"]
    for c in num_cols:  # explicit numeric conversion
        df[c] = pd.to_numeric(df[c], errors="coerce")
    before = len(df)
    df["state"] = df["state"].str.strip().str.title()  # match model's Title-Case states
    df = df.dropna(subset=["state", "date"] + num_cols)
    df = df[(df["state"] != "") & np.isfinite(df[num_cols].to_numpy()).all(axis=1)]
    df = df.drop_duplicates().drop_duplicates(subset=["state", "date"], keep=False)
    print(f"      dropped {before - len(df)} rows (missing values / duplicates)")
    print(f"      clean rows: {len(df)}, states: {df['state'].nunique()}, "
          f"dates: {df['date'].min()} -> {df['date'].max()}")

    print("[3/5] Creating tables (if missing) ...")
    init_db()

    print("[4/5] Importing into PostgreSQL (skipping existing rows) ...")
    t0 = time.time()
    session = SessionLocal()
    try:
        added, skipped = import_weather_dataframe(df, session)
    finally:
        session.close()

    total = pd.read_sql("SELECT COUNT(*) AS n FROM weather_data", engine)["n"][0]
    print(f"[5/5] Done in {time.time() - t0:.1f}s | imported: {added} | skipped: {skipped} "
          f"| total in weather_data: {total}")


if __name__ == "__main__":
    main()
