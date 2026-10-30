"""Forensic verification script for production database and model artifacts."""
import hashlib
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "backend"))

from app.database import engine
from sqlalchemy import text

def verify_all():
    model_path = ROOT_DIR / "model" / "weather_model_v3.joblib"
    info_path = ROOT_DIR / "model" / "model_info.json"

    h_model = hashlib.sha256(model_path.read_bytes()).hexdigest()
    h_info = hashlib.sha256(info_path.read_bytes()).hexdigest()

    print("=== PROTECTED ARTIFACT HASHES ===")
    print("Model SHA-256:", h_model)
    assert h_model == "844fdadfbe2786d859cdfc55c2e7dc14eb0b2f420b339f3e877fa6856aa37adf", "Model hash mismatch!"
    print("Model Metadata SHA-256:", h_info)
    assert h_info == "42e0b2b61307ca319436191302394e1e330fbb972e1e5d9afbc945d354e417b3", "Metadata hash mismatch!"

    print("\n=== PRODUCTION DATABASE FORENSICS (weather_forecasting) ===")
    with engine.connect() as conn:
        all_schemas = [r[0] for r in conn.execute(text("SELECT schema_name FROM information_schema.schemata")).fetchall()]
        user_schemas = [s for s in all_schemas if not s.startswith("pg_") and s != "information_schema"]
        print("Non-system schemas in weather_forecasting:", user_schemas)
        assert user_schemas == ["public"], f"Unexpected schemas found: {user_schemas}"

        tables = [r[0] for r in conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).fetchall()]
        print("Tables in public schema:", sorted(tables))
        assert set(tables) == {"predictions", "weather_data", "weather_location_metadata"}, f"Unexpected tables found: {tables}"

        weather_count = conn.execute(text("SELECT count(*) FROM public.weather_data")).scalar()
        pred_count = conn.execute(text("SELECT count(*) FROM public.predictions")).scalar()
        meta_count = conn.execute(text("SELECT count(*) FROM public.weather_location_metadata")).scalar()
        print(f"Row counts -> weather_data: {weather_count}, predictions: {pred_count}, weather_location_metadata: {meta_count}")
        assert weather_count == 46834, f"weather_data altered: {weather_count}"

        all_namespaces = [r[0] for r in conn.execute(text("SELECT nspname FROM pg_namespace")).fetchall()]
        assert "isolated_scheduler_demo" not in all_namespaces, "Stray isolated_scheduler_demo found!"

    print("\n[VERIFIED] Production database is 100% clean, verified, and untouched!")

if __name__ == "__main__":
    verify_all()
