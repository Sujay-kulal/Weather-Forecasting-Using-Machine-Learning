"""Backward-compatible entry point for evaluation without retraining.

Pass an existing artifact and its source metadata explicitly. This script
never fits or saves a model.
"""
from pathlib import Path
import sys


BACKEND = Path(__file__).resolve().parent / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from evaluate_deployed_artifact import main  # noqa: E402


if __name__ == "__main__":
    main()
