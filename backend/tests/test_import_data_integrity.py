from datetime import date
from pathlib import Path
import sys
import pandas as pd
import pytest
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import Base
from app.models import WeatherData
from import_data import import_weather_dataframe


@pytest.fixture
def test_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()


def test_existing_statewide_records_prevent_duplicate_statewide_imports(test_db):
    """Verify that an existing statewide record (district='', location='') causes the incoming row to be skipped."""
    d = date(2025, 6, 1)
    test_db.add(WeatherData(
        date=d,
        state="Karnataka",
        district="",
        location="",
        temp_max=32.0,
        temp_min=22.0,
        temp_avg=27.0,
        humidity=65.0,
        rainfall=0.0,
    ))
    test_db.commit()

    # Attempt to import duplicate statewide row
    df = pd.DataFrame([{
        "date": d,
        "state": "Karnataka",
        "temp_max": 33.0,
        "temp_min": 23.0,
        "temp_avg": 28.0,
        "humidity": 66.0,
        "rainfall": 1.0,
    }])

    added, skipped = import_weather_dataframe(df, test_db)
    assert skipped == 1
    assert added == 0

    # Verify still exactly 1 record in database with original value
    records = test_db.execute(select(WeatherData).where(WeatherData.state == "Karnataka")).scalars().all()
    assert len(records) == 1
    assert records[0].temp_avg == 27.0


def test_existing_district_records_do_not_prevent_statewide_imports(test_db):
    """Verify that an existing district record does NOT prevent a statewide record on the same date from being imported."""
    d = date(2025, 6, 1)
    test_db.add(WeatherData(
        date=d,
        state="Karnataka",
        district="Bengaluru Urban",
        location="",
        temp_max=30.0,
        temp_min=20.0,
        temp_avg=25.0,
        humidity=60.0,
        rainfall=0.0,
    ))
    test_db.commit()

    # Import statewide row for the same state and date
    df = pd.DataFrame([{
        "date": d,
        "state": "Karnataka",
        "temp_max": 32.0,
        "temp_min": 22.0,
        "temp_avg": 27.0,
        "humidity": 65.0,
        "rainfall": 0.0,
    }])

    added, skipped = import_weather_dataframe(df, test_db)
    assert added == 1
    assert skipped == 0

    # Verify both records coexist in database
    records = test_db.execute(
        select(WeatherData).where(WeatherData.state == "Karnataka", WeatherData.date == d)
    ).scalars().all()
    assert len(records) == 2
    statewide = [r for r in records if r.district == "" and r.location == ""]
    district_level = [r for r in records if r.district == "Bengaluru Urban"]
    assert len(statewide) == 1
    assert len(district_level) == 1
    assert statewide[0].temp_avg == 27.0


def test_existing_location_records_do_not_prevent_statewide_imports(test_db):
    """Verify that an existing specific location record does NOT prevent a statewide record from being imported."""
    d = date(2025, 6, 1)
    test_db.add(WeatherData(
        date=d,
        state="Karnataka",
        district="Bengaluru Urban",
        location="Whitefield",
        temp_max=29.0,
        temp_min=19.0,
        temp_avg=24.0,
        humidity=62.0,
        rainfall=2.0,
    ))
    test_db.commit()

    # Import statewide row
    df = pd.DataFrame([{
        "date": d,
        "state": "Karnataka",
        "temp_max": 32.0,
        "temp_min": 22.0,
        "temp_avg": 27.0,
        "humidity": 65.0,
        "rainfall": 0.0,
    }])

    added, skipped = import_weather_dataframe(df, test_db)
    assert added == 1
    assert skipped == 0

    records = test_db.execute(
        select(WeatherData).where(WeatherData.state == "Karnataka", WeatherData.date == d)
    ).scalars().all()
    assert len(records) == 2
    statewide = [r for r in records if r.district == "" and r.location == ""]
    assert len(statewide) == 1
    assert statewide[0].temp_avg == 27.0


def test_imported_records_always_use_empty_district_and_location(test_db):
    """Verify that imported statewide records always have district='' and location=''."""
    df = pd.DataFrame([
        {
            "date": date(2025, 6, 1),
            "state": "Maharashtra",
            "temp_max": 35.0,
            "temp_min": 25.0,
            "temp_avg": 30.0,
            "humidity": 70.0,
            "rainfall": 5.0,
        },
        {
            "date": date(2025, 6, 2),
            "state": "Maharashtra",
            "temp_max": 34.0,
            "temp_min": 24.0,
            "temp_avg": 29.0,
            "humidity": 72.0,
            "rainfall": 2.0,
        },
    ])

    added, skipped = import_weather_dataframe(df, test_db)
    assert added == 2
    assert skipped == 0

    records = test_db.execute(select(WeatherData).where(WeatherData.state == "Maharashtra")).scalars().all()
    assert len(records) == 2
    for r in records:
        assert r.district == ""
        assert r.location == ""


def test_repeated_imports_do_not_create_duplicates(test_db):
    """Verify that running the import multiple times is strictly idempotent."""
    df = pd.DataFrame([
        {
            "date": date(2025, 6, 1),
            "state": "Kerala",
            "temp_max": 30.0,
            "temp_min": 22.0,
            "temp_avg": 26.0,
            "humidity": 80.0,
            "rainfall": 15.0,
        },
        {
            "date": date(2025, 6, 2),
            "state": "Kerala",
            "temp_max": 29.0,
            "temp_min": 21.0,
            "temp_avg": 25.0,
            "humidity": 85.0,
            "rainfall": 20.0,
        },
    ])

    # First run: 2 added, 0 skipped
    added1, skipped1 = import_weather_dataframe(df, test_db)
    assert added1 == 2
    assert skipped1 == 0

    # Second run: 0 added, 2 skipped
    added2, skipped2 = import_weather_dataframe(df, test_db)
    assert added2 == 0
    assert skipped2 == 2

    # Verify total count in DB remains 2
    total = test_db.scalar(select(func.count()).select_from(WeatherData).where(WeatherData.state == "Kerala"))
    assert total == 2
