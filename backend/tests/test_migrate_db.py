from unittest.mock import MagicMock
from sqlalchemy import create_engine
from migrate_db import parse_args, validate_host, main


def test_parse_args_defaults():
    args = parse_args([])
    assert args.apply is False
    assert args.allow_host == []


def test_parse_args_flags():
    args = parse_args(["--apply", "--allow-host", "db", "--allow-host", "localhost,127.0.0.1"])
    assert args.apply is True
    assert args.allow_host == ["db", "localhost,127.0.0.1"]


def test_validate_host():
    assert validate_host("db", ["db"]) is True
    assert validate_host("DB", ["db"]) is True
    assert validate_host("localhost", ["db", "localhost"]) is True
    assert validate_host("prod.database.internal", ["db", "localhost"]) is False
    assert validate_host("db", []) is True  # no restriction if allow_host not passed


def test_main_rejects_disallowed_host():
    mock_engine = MagicMock()
    mock_engine.url.host = "unauthorized-remote-host"
    code = main(["--apply", "--allow-host", "db"], target_engine=mock_engine)
    assert code == 1


def test_main_dry_run_when_apply_omitted():
    mock_engine = MagicMock()
    mock_engine.url.host = "db"
    code = main(["--allow-host", "db"], target_engine=mock_engine)
    assert code == 0
    # Engine begin should not have been called in dry run mode
    mock_engine.begin.assert_not_called()


def test_main_applies_when_allowed():
    mock_engine = MagicMock()
    mock_engine.url.host = "db"
    code = main(["--apply", "--allow-host", "db"], target_engine=mock_engine)
    assert code == 0
    mock_engine.begin.assert_called_once()
