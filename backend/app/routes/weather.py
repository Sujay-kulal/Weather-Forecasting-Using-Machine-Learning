"""Weather data endpoints - states, history, recent records. All from PostgreSQL."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import WeatherData
from app.schemas import StatesResponse, WeatherRecord, WeatherResponse

router = APIRouter(prefix="/weather", tags=["weather"])
states_router = APIRouter(tags=["weather"])  # GET /states lives at the root


def _resolve_state(state: str, db: Session) -> str:
    """Normalise the state name to the exact Title-Case form stored in the DB."""
    canonical = state.strip().title()
    exists = db.execute(
        select(func.count()).select_from(WeatherData).where(WeatherData.state == canonical)
    ).scalar_one()
    if not exists:
        raise HTTPException(404, detail=f"Unknown state '{state}'. "
                                        f"Call GET /states for the available names.")
    return canonical


@states_router.get("/states", response_model=StatesResponse)
def list_states(db: Session = Depends(get_db)):
    """Distinct states present in the weather database (not hardcoded)."""
    rows = db.execute(select(WeatherData.state).distinct().order_by(WeatherData.state)).scalars()
    return StatesResponse(states=list(rows))


@router.get("/{state}", response_model=WeatherResponse)
def state_history(state: str,
                  limit: int = Query(100, ge=1, le=1000),
                  offset: int = Query(0, ge=0),
                  db: Session = Depends(get_db)):
    """Historical weather for a state, newest first, paginated."""
    canonical = _resolve_state(state, db)
    rows = db.execute(
        select(WeatherData).where(WeatherData.state == canonical)
        .order_by(WeatherData.date.desc())
        .offset(offset).limit(limit)
    ).scalars().all()
    total = db.execute(
        select(func.count()).select_from(WeatherData).where(WeatherData.state == canonical)
    ).scalar_one()
    return WeatherResponse(
        state=canonical,
        count=total,
        records=[WeatherRecord(date=r.date, state=r.state, temp_max=r.temp_max,
                               temp_min=r.temp_min, temp_avg=r.temp_avg,
                               humidity=r.humidity, rainfall=r.rainfall) for r in rows],
    )


@router.get("/{state}/recent", response_model=WeatherResponse)
def recent(state: str,
           days: int = Query(14, ge=1, le=60),
           db: Session = Depends(get_db)):
    """The most recent `days` measurements - the current weather context."""
    canonical = _resolve_state(state, db)
    rows = db.execute(
        select(WeatherData).where(WeatherData.state == canonical)
        .order_by(WeatherData.date.desc())
        .limit(days)
    ).scalars().all()
    return WeatherResponse(
        state=canonical,
        count=len(rows),
        records=[WeatherRecord(date=r.date, state=r.state, temp_max=r.temp_max,
                               temp_min=r.temp_min, temp_avg=r.temp_avg,
                               humidity=r.humidity, rainfall=r.rainfall)
                 for r in reversed(rows)],  # oldest -> newest for charting
    )
