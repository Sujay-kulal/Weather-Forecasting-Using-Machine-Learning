"""Weather data endpoints - states, history, recent records. All from PostgreSQL."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import WeatherData
from app.schemas import StatesResponse, DistrictsResponse, LocationsResponse, WeatherRecord, WeatherResponse
from app.services.resolve_location import resolve_location
from app.services.model_service import model_info

router = APIRouter(prefix="/weather", tags=["weather"])
states_router = APIRouter(tags=["weather"])  # GET /states lives at the root



@states_router.get("/states", response_model=StatesResponse)
def list_states(response: Response, db: Session = Depends(get_db)):
    """Distinct states present in the weather database."""
    response.headers["Cache-Control"] = "public, max-age=300"
    rows = list(db.scalars(select(WeatherData.state).distinct().order_by(WeatherData.state)))
    model_states = list(db.scalars(
        select(WeatherData.state)
        .where(WeatherData.state.in_(model_info["states"]), WeatherData.district == "", WeatherData.location == "")
        .distinct().order_by(WeatherData.state)
    ))
    return StatesResponse(states=rows, model_states=model_states)

@states_router.get("/districts/{state}", response_model=DistrictsResponse)
def list_districts(state: str, db: Session = Depends(get_db)):
    """Distinct districts present in the weather database for a given state."""
    canonical_state = state.strip().title()
    rows = db.execute(
        select(WeatherData.district).distinct()
        .where(WeatherData.state == canonical_state, WeatherData.district != "")
        .order_by(WeatherData.district)
    ).scalars()
    return DistrictsResponse(districts=list(rows))

@states_router.get("/locations/{state}/{district}", response_model=LocationsResponse)
def list_locations(state: str, district: str, db: Session = Depends(get_db)):
    """Distinct locations present in the weather database for a given state and district."""
    canonical_state = state.strip().title()
    dist = district.strip()
    rows = db.execute(
        select(WeatherData.location).distinct()
        .where(WeatherData.state == canonical_state, WeatherData.district == dist, WeatherData.location != "")
        .order_by(WeatherData.location)
    ).scalars()
    return LocationsResponse(locations=list(rows))


@router.get("/{state}", response_model=WeatherResponse)
def state_history(state: str,
                  limit: int = Query(100, ge=1, le=1000),
                  offset: int = Query(0, ge=0),
                  start_date: date | None = None,
                  end_date: date | None = None,
                  db: Session = Depends(get_db)):
    """Historical weather for a state, newest first, paginated."""
    return _history(db, state, "", "", limit, offset, start_date, end_date)


@router.get("/{state}/recent", response_model=WeatherResponse)
def recent(state: str,
           days: int = Query(14, ge=1, le=60),
           db: Session = Depends(get_db)):
    """The most recent `days` measurements - the current weather context."""
    canonical, _, _ = resolve_location(state, "", "", db)
    rows = db.execute(
        select(WeatherData)
        .where(WeatherData.state == canonical, WeatherData.district == "", WeatherData.location == "")
        .order_by(WeatherData.date.desc())
        .limit(days)
    ).scalars().all()

    return WeatherResponse(
        state=canonical,
        district="",
        location="",
        count=len(rows),
        records=[WeatherRecord(date=r.date, state=r.state, district=r.district, location=r.location,
                               temp_max=r.temp_max, temp_min=r.temp_min, temp_avg=r.temp_avg,
                               humidity=r.humidity, rainfall=r.rainfall)
                 for r in reversed(rows)],
    )

@router.get("/{state}/{district}/{location}", response_model=WeatherResponse)
def location_history(state: str, district: str, location: str,
                     limit: int = Query(100, ge=1, le=1000),
                     offset: int = Query(0, ge=0),
                     start_date: date | None = None,
                     end_date: date | None = None,
                     db: Session = Depends(get_db)):
    """Historical weather for a location, newest first, paginated."""
    return _history(db, state, district, location, limit, offset, start_date, end_date)


@router.get("/{state}/{district}", response_model=WeatherResponse)
def district_history(state: str, district: str,
                     limit: int = Query(100, ge=1, le=1000),
                     offset: int = Query(0, ge=0),
                     start_date: date | None = None,
                     end_date: date | None = None,
                     db: Session = Depends(get_db)):
    """Historical weather for a district-wide series."""
    return _history(db, state, district, "", limit, offset, start_date, end_date)


def _history(db, state, district, location, limit, offset, start_date, end_date):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(422, detail="Start date must be on or before the end date.")
    canonical, dist, loc = resolve_location(state, district, location, db)
    filters = [WeatherData.state == canonical, WeatherData.district == dist, WeatherData.location == loc]
    if start_date:
        filters.append(WeatherData.date >= start_date)
    if end_date:
        filters.append(WeatherData.date <= end_date)
    rows = db.execute(
        select(WeatherData)
        .where(*filters)
        .order_by(WeatherData.date.desc())
        .offset(offset).limit(limit)
    ).scalars().all()

    total = db.execute(
        select(func.count()).select_from(WeatherData)
        .where(*filters)
    ).scalar_one()

    return WeatherResponse(
        state=canonical,
        district=dist,
        location=loc,
        count=total,
        records=[WeatherRecord(date=r.date, state=r.state, district=r.district, location=r.location,
                               temp_max=r.temp_max, temp_min=r.temp_min, temp_avg=r.temp_avg,
                               humidity=r.humidity, rainfall=r.rainfall) for r in rows],
    )

@router.get("/{state}/{district}/{location}/recent", response_model=WeatherResponse)
def location_recent(state: str, district: str, location: str,
                    days: int = Query(14, ge=1, le=60),
                    db: Session = Depends(get_db)):
    """The most recent `days` measurements for a location."""
    canonical, dist, loc = resolve_location(state, district, location, db)
    rows = db.execute(
        select(WeatherData)
        .where(WeatherData.state == canonical, WeatherData.district == dist, WeatherData.location == loc)
        .order_by(WeatherData.date.desc())
        .limit(days)
    ).scalars().all()

    return WeatherResponse(
        state=canonical,
        district=dist,
        location=loc,
        count=len(rows),
        records=[WeatherRecord(date=r.date, state=r.state, district=r.district, location=r.location,
                               temp_max=r.temp_max, temp_min=r.temp_min, temp_avg=r.temp_avg,
                               humidity=r.humidity, rainfall=r.rainfall)
                 for r in reversed(rows)],
    )
