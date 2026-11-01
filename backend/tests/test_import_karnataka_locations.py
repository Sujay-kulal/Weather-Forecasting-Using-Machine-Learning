"""
Unit tests for Karnataka locations and weather archive import script (import_karnataka_locations.py).

Verifies:
1. sys.path bootstrapping and clean module importation.
2. Date window generation (14-day chunking).
3. Dry-run execution boundary (apply=False returns summary with zero database writes).
4. Budget and date range validation guards.
5. Custom session factory injection for isolated execution.
"""
from datetime import date
from unittest.mock import MagicMock, patch
import pytest

from import_karnataka_locations import (
    DEFAULT_DAILY_BUDGET,
    DEFAULT_HOURLY_BUDGET,
    WINDOW_DAYS,
    _date_windows,
    run_import_stage,
)


def test_import_karnataka_locations_import_bootstrap():
    """Verify that import_karnataka_locations imports cleanly and defines core constants."""
    import import_karnataka_locations as mod
    assert hasattr(mod, "run_import_stage")
    assert hasattr(mod, "_date_windows")
    assert mod.DEFAULT_DAILY_BUDGET == 9_000
    assert mod.WINDOW_DAYS == 14


def test_date_windows_chunking():
    """Verify _date_windows generates non-overlapping chunks with maximum size of WINDOW_DAYS."""
    start = date(2026, 1, 1)
    end = date(2026, 1, 31)

    windows = list(_date_windows(start, end))
    # 31 days divided into 14-day windows: 14 + 14 + 3 = 3 windows
    assert len(windows) == 3

    assert windows[0] == (date(2026, 1, 1), date(2026, 1, 14))
    assert windows[1] == (date(2026, 1, 15), date(2026, 1, 28))
    assert windows[2] == (date(2026, 1, 29), date(2026, 1, 31))

    # Verify windows span all days continuously without gaps
    for i in range(len(windows) - 1):
        assert (windows[i + 1][0] - windows[i][1]).days == 1


def test_date_windows_single_day():
    """Verify _date_windows handles start == end."""
    d = date(2026, 5, 1)
    windows = list(_date_windows(d, d))
    assert len(windows) == 1
    assert windows[0] == (d, d)


def test_run_import_stage_dry_run_boundary():
    """Verify run_import_stage in dry-run mode (apply=False) computes plan without DB writes."""
    dummy_locations = [
        {"record_id": 1, "name": "Kundapura", "latitude": 13.6, "longitude": 74.6},
        {"record_id": 2, "name": "Udupi", "latitude": 13.3, "longitude": 74.7},
    ]

    with patch("import_karnataka_locations._download_geonames_catalog", return_value=(dummy_locations, [])):
        summary = run_import_stage(
            apply=False,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 28),
            daily_budget=5000,
            hourly_budget=2000,
        )

        assert summary["applied"] is False
        assert summary["locations"] == 2
        assert summary["date_windows"] == 2  # 28 days = 2 * 14-day windows
        assert summary["estimated_total_api_units"] == 4  # 2 locations * 2 windows
        assert summary["daily_api_unit_budget"] == 5000
        assert summary["hourly_api_unit_budget"] == 2000
        assert summary["start_date"] == "2026-01-01"
        assert summary["end_date"] == "2026-01-28"


def test_run_import_stage_validation_guards():
    """Verify validation errors on invalid budgets or inverted dates."""
    # 1. Invalid daily budget (< 1 or > DEFAULT_DAILY_BUDGET)
    with pytest.raises(ValueError, match="daily_budget must be between 1 and 9000"):
        run_import_stage(apply=False, daily_budget=0)

    with pytest.raises(ValueError, match="daily_budget must be between 1 and 9000"):
        run_import_stage(apply=False, daily_budget=10_000)

    # 2. Invalid hourly budget
    with pytest.raises(ValueError, match="hourly_budget must be between 1 and 3000"):
        run_import_stage(apply=False, hourly_budget=-1)

    # 3. start_date after end_date
    with pytest.raises(ValueError, match="is after latest archive date"):
        run_import_stage(
            apply=False,
            start_date=date(2026, 2, 1),
            end_date=date(2026, 1, 1),
        )


def test_session_factory_injection():
    """Verify custom session_factory injection is accepted and called when apply=True."""
    mock_session = MagicMock()
    mock_factory = MagicMock(return_value=mock_session)
    mock_session.__enter__.return_value = mock_session

    dummy_locations = [{"record_id": "1", "name": "Loc1", "latitude": 12.0, "longitude": 75.0, "district": "Udupi"}]

    with patch("import_karnataka_locations._download_geonames_catalog", return_value=(dummy_locations, [])), \
         patch("import_karnataka_locations._add_location_metadata", return_value={"1": 101}), \
         patch("import_karnataka_locations._fetch_archive", return_value=[{"daily": {}}]), \
         patch("import_karnataka_locations._save_location_window", return_value=14):

        # Mock execute returning empty completed_ids
        mock_session.execute.return_value.scalars.return_value.all.return_value = []

        summary = run_import_stage(
            apply=True,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 14),
            session_factory=mock_factory,
        )

        mock_factory.assert_called_once()
        assert summary["applied"] is True
        assert summary["weather_rows_upserted_this_stage"] == 14
