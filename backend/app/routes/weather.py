"""Weather data endpoints - states, history, recent records. All from PostgreSQL."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import WeatherData
from app.schemas import StatesResponse, DistrictsResponse, LocationsResponse, WeatherRecord, WeatherResponse

router = APIRouter(prefix="/weather", tags=["weather"])
states_router = APIRouter(tags=["weather"])  # GET /states lives at the root


def _resolve_location(state: str, district: str, location: str, db: Session):
    """Validate that the exact state/district/location combination exists."""
    canonical_state = state.strip().title()
    dist = district.strip()
    loc = location.strip()

    exists = db.execute(
        select(func.count()).select_from(WeatherData).where(
            WeatherData.state == canonical_state,
            WeatherData.district == dist,
            WeatherData.location == loc
        )
    ).scalar_one()

    if not exists:
        if dist == "" and loc == "":
            raise HTTPException(404, detail=f"Unknown state '{state}'. Call GET /states for the available names.")
        elif loc == "":
            raise HTTPException(404, detail=f"Unknown district '{district}' in state '{state}'.")
        else:
            raise HTTPException(404, detail=f"Unknown location '{location}' in district '{district}', state '{state}'.")

    return canonical_state, dist, loc


@states_router.get("/states", response_model=StatesResponse)
def list_states(db: Session = Depends(get_db)):
    """Distinct states present in the weather database."""
    rows = db.execute(select(WeatherData.state).distinct().order_by(WeatherData.state)).scalars()
    return StatesResponse(states=list(rows))

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
                  db: Session = Depends(get_db)):
    """Historical weather for a state, newest first, paginated."""
    canonical, _, _ = _resolve_location(state, "", "", db)
    rows = db.execute(
        select(WeatherData)
        .where(WeatherData.state == canonical, WeatherData.district == "", WeatherData.location == "")
        .order_by(WeatherData.date.desc())
        .offset(offset).limit(limit)
    ).scalars().all()

    total = db.execute(
        select(func.count()).select_from(WeatherData)
        .where(WeatherData.state == canonical, WeatherData.district == "", WeatherData.location == "")
    ).scalar_one()

    return WeatherResponse(
        state=canonical,
        district="",
        location="",
        count=total,
        records=[WeatherRecord(date=r.date, state=r.state, district=r.district, location=r.location,
                               temp_max=r.temp_max, temp_min=r.temp_min, temp_avg=r.temp_avg,
                               humidity=r.humidity, rainfall=r.rainfall) for r in rows],
    )


@router.get("/{state}/recent", response_model=WeatherResponse)
def recent(state: str,
           days: int = Query(14, ge=1, le=60),
           db: Session = Depends(get_db)):
    """The most recent `days` measurements - the current weather context."""
    canonical, _, _ = _resolve_location(state, "", "", db)
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
                     db: Session = Depends(get_db)):
    """Historical weather for a location, newest first, paginated."""
    canonical, dist, loc = _resolve_location(state, district, location, db)
    rows = db.execute(
        select(WeatherData)
        .where(WeatherData.state == canonical, WeatherData.district == dist, WeatherData.location == loc)
        .order_by(WeatherData.date.desc())
        .offset(offset).limit(limit)
    ).scalars().all()

    total = db.execute(
        select(func.count()).select_from(WeatherData)
        .where(WeatherData.state == canonical, WeatherData.district == dist, WeatherData.location == loc)
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
    canonical, dist, loc = _resolve_location(state, district, location, db)
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
