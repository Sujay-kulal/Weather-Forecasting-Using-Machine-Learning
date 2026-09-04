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

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import select

# Make `app` importable when run from the backend folder
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models import WeatherData  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = PROJECT_ROOT / "data" / "archive_c" / "PSP_Weather_Merged_EDA_Cleaned.csv"


def main():
    load_dotenv(Path(__file__).resolve().parent / ".env")

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
    df = df.dropna(subset=["date"] + num_cols)
    df = df.drop_duplicates(subset=["state", "date"])
    df["state"] = df["state"].str.strip().str.title()  # match model's Title-Case states
    print(f"      dropped {before - len(df)} rows (missing values / duplicates)")
    print(f"      clean rows: {len(df)}, states: {df['state'].nunique()}, "
          f"dates: {df['date'].min()} -> {df['date'].max()}")

    print("[3/5] Creating tables (if missing) ...")
    Base.metadata.create_all(bind=engine)

    print("[4/5] Importing into PostgreSQL (skipping existing rows) ...")
    t0 = time.time()
    session = SessionLocal()
    try:
        existing = set(session.execute(select(WeatherData.state, WeatherData.date)).all())
        print(f"      rows already in database: {len(existing)}")

        added, skipped, buffer = 0, 0, []
        for row in df.itertuples(index=False):
            if (row.state, row.date) in existing:
                skipped += 1
                continue
            buffer.append(WeatherData(date=row.date, state=row.state,
                                      temp_max=row.temp_max, temp_min=row.temp_min,
                                      temp_avg=row.temp_avg, humidity=row.humidity,
                                      rainfall=row.rainfall))
            added += 1
            if len(buffer) >= 5000:  # batch commit with progress
                session.add_all(buffer)
                session.commit()
                print(f"      ... {added} imported")
                buffer = []
        if buffer:
            session.add_all(buffer)
            session.commit()
    finally:
        session.close()

    total = pd.read_sql("SELECT COUNT(*) AS n FROM weather_data", engine)["n"][0]
    print(f"[5/5] Done in {time.time() - t0:.1f}s | imported: {added} | skipped: {skipped} "
          f"| total in weather_data: {total}")


if __name__ == "__main__":
    main()
