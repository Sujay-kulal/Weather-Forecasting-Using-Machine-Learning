"""Keep pytest collection independent of a configured PostgreSQL instance."""
import os


os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://localhost/weather_test")
