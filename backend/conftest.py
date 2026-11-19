"""Keep pytest collection independent of a configured PostgreSQL instance."""
import os
from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://localhost/weather_test")
