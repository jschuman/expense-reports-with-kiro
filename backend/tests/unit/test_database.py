"""Unit tests for the get_db database session dependency."""

from unittest.mock import MagicMock, patch

import app.db.database as db_module
from app.db.database import get_db


def test_get_db_yields_session():
    """get_db should yield the session object created by SessionLocal."""
    mock_session = MagicMock()

    with patch.object(db_module, "SessionLocal", return_value=mock_session):
        gen = get_db()
        session = next(gen)

    assert session is mock_session


def test_get_db_closes_session_after_use():
    """get_db should call close() on the session exactly once after the generator is exhausted."""
    mock_session = MagicMock()

    with patch.object(db_module, "SessionLocal", return_value=mock_session):
        gen = get_db()
        next(gen)

        try:
            next(gen)
        except StopIteration:
            pass

    mock_session.close.assert_called_once()
