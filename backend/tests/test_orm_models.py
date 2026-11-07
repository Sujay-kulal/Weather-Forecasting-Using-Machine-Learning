"""
Unit and integration tests for SQLAlchemy ORM models and schema constraints.

Verifies:
1. Foreign key RESTRICT on delete for WeatherImportBatch -> WeatherLocationMetadata.
2. Check constraint rejection of negative row counts (row_count >= 0).
3. Check constraint rejection of inverted date windows (end_date >= start_date).
4. Composite uniqueness on WeatherImportBatch location window.
5. Date column typing on WeatherLocationMetadata (imported_start_date, imported_end_date).
6. 4-tuple uniqueness constraint on WeatherData (state, district, location, date).
"""
from datetime import date
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import Base
from app.models import WeatherData, WeatherImportBatch, WeatherLocationMetadata


@pytest.fixture
def orm_session():
    """Create a SQLite engine with foreign keys enabled and all tables created."""
    engine = create_engine("sqlite:///:memory:")

    # SQLite requires PRAGMA foreign_keys = ON to enforce FOREIGN KEY constraints
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    session = Session(engine)
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def test_weather_import_batch_fk_restrict_on_delete(orm_session):
    """Verify that deleting a WeatherLocationMetadata with child batches raises IntegrityError under RESTRICT."""
    meta = WeatherLocationMetadata(
        catalog_source="GeoNames",
        catalog_record_id="123456",
        state="Karnataka",
        district="Udupi",
        location="Kundapura",
    )
    orm_session.add(meta)
    orm_session.commit()

    batch = WeatherImportBatch(
        location_metadata_id=meta.id,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 14),
        row_count=14,
    )
    orm_session.add(batch)
    orm_session.commit()

    # Attempting to delete the parent metadata directly via SQL statement MUST fail
    # because the database enforces FOREIGN KEY ON DELETE RESTRICT
    from sqlalchemy import delete
    with pytest.raises(IntegrityError):
        orm_session.execute(delete(WeatherLocationMetadata).where(WeatherLocationMetadata.id == meta.id))
        orm_session.commit()
    orm_session.rollback()


def test_weather_import_batch_negative_row_count_rejected(orm_session):
    """Verify that ck_wib_row_count_positive rejects row_count < 0."""
    meta = WeatherLocationMetadata(
        catalog_source="GeoNames",
        catalog_record_id="123457",
        state="Karnataka",
    )
    orm_session.add(meta)
    orm_session.commit()

    batch = WeatherImportBatch(
        location_metadata_id=meta.id,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 14),
        row_count=-1,  # Violates ck_wib_row_count_positive
    )
    orm_session.add(batch)
    with pytest.raises(IntegrityError):
        orm_session.commit()
    orm_session.rollback()


def test_weather_import_batch_inverted_dates_rejected(orm_session):
    """Verify that ck_wib_date_range rejects end_date < start_date."""
    meta = WeatherLocationMetadata(
        catalog_source="GeoNames",
        catalog_record_id="123458",
        state="Karnataka",
    )
    orm_session.add(meta)
    orm_session.commit()

    batch = WeatherImportBatch(
        location_metadata_id=meta.id,
        start_date=date(2026, 1, 14),
        end_date=date(2026, 1, 1),  # Inverted dates!
        row_count=0,
    )
    orm_session.add(batch)
    with pytest.raises(IntegrityError):
        orm_session.commit()
    orm_session.rollback()


def test_weather_import_batch_duplicate_window_rejected(orm_session):
    """Verify uq_wib_loc_window rejects identical window for the same location."""
    meta = WeatherLocationMetadata(
        catalog_source="GeoNames",
        catalog_record_id="123459",
        state="Karnataka",
    )
    orm_session.add(meta)
    orm_session.commit()

    batch1 = WeatherImportBatch(
        location_metadata_id=meta.id,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 14),
        row_count=14,
    )
    orm_session.add(batch1)
    orm_session.commit()

    batch2 = WeatherImportBatch(
        location_metadata_id=meta.id,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 14),
        row_count=14,
    )
    orm_session.add(batch2)
    with pytest.raises(IntegrityError):
        orm_session.commit()
    orm_session.rollback()


def test_weather_location_metadata_date_typing(orm_session):
    """Verify that imported_start_date and imported_end_date correctly store date objects."""
    d_start = date(2020, 1, 1)
    d_end = date(2026, 1, 1)
    meta = WeatherLocationMetadata(
        catalog_source="GeoNames",
        catalog_record_id="999999",
        state="Karnataka",
        imported_start_date=d_start,
        imported_end_date=d_end,
    )
    orm_session.add(meta)
    orm_session.commit()

    retrieved = orm_session.get(WeatherLocationMetadata, meta.id)
    assert retrieved is not None
    assert retrieved.imported_start_date == d_start
    assert retrieved.imported_end_date == d_end
    assert isinstance(retrieved.imported_start_date, date)
    assert isinstance(retrieved.imported_end_date, date)


def test_weather_data_composite_unique_constraint(orm_session):
    """Verify uq_weather_state_dist_loc_date allows distinct locations on same date

    but rejects exact duplicate 4-tuples.
    """
    d = date(2026, 1, 15)
    # 1. State-level row (district="", location="")
    r1 = WeatherData(state="Karnataka", district="", location="", date=d,
                     temp_max=30.0, temp_min=20.0, temp_avg=25.0, humidity=60.0, rainfall=0.0)
    # 2. Location-level row (district="Udupi", location="Kundapura") on same date
    r2 = WeatherData(state="Karnataka", district="Udupi", location="Kundapura", date=d,
                     temp_max=32.0, temp_min=22.0, temp_avg=27.0, humidity=75.0, rainfall=1.0)
    orm_session.add_all([r1, r2])
    orm_session.commit()

    assert orm_session.query(WeatherData).count() == 2

    # 3. Duplicate of r2 must fail
    dup = WeatherData(state="Karnataka", district="Udupi", location="Kundapura", date=d,
                      temp_max=32.0, temp_min=22.0, temp_avg=27.0, humidity=75.0, rainfall=1.0)
    orm_session.add(dup)
    with pytest.raises(IntegrityError):
        orm_session.commit()
    orm_session.rollback()
