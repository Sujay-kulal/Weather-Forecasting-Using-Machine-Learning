"""Persistence helpers for idempotent prediction audit records."""
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models import Prediction


PREDICTION_KEY = ("state", "district", "location", "forecast_date", "model_version")
PREDICTION_CONSTRAINT = "uq_prediction_state_location_date_model_version"


def upsert_prediction(
    db: Session,
    *,
    state: str,
    district: str,
    location: str,
    forecast_date,
    predicted_temp_avg: list[float],
    model_version: str,
) -> None:
    """Insert one prediction or refresh its output on a repeated model run."""
    values = {
        "state": state,
        "district": district,
        "location": location,
        "forecast_date": forecast_date,
        "predicted_temp_avg": predicted_temp_avg,
        "model_version": model_version,
    }
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        statement = pg_insert(Prediction).values(**values)
        statement = statement.on_conflict_do_update(
            constraint=PREDICTION_CONSTRAINT,
            set_={"predicted_temp_avg": statement.excluded.predicted_temp_avg},
        )
    elif dialect == "sqlite":
        statement = sqlite_insert(Prediction).values(**values)
        statement = statement.on_conflict_do_update(
            index_elements=[getattr(Prediction, column) for column in PREDICTION_KEY],
            set_={"predicted_temp_avg": statement.excluded.predicted_temp_avg},
        )
    else:
        raise RuntimeError(f"Unsupported prediction-store dialect: {dialect}")
    db.execute(statement)
    db.commit()
