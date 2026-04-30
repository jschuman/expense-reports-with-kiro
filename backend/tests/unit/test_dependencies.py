"""Unit tests for the get_current_user FastAPI dependency.

Tests use unittest.mock to isolate the dependency from the real database
and session infrastructure.
"""

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.dependencies import get_current_admin, get_current_user
from app.models.user import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_request(session_data: dict) -> MagicMock:
    """Return a mock Request whose .session attribute behaves like a dict."""
    request = MagicMock()
    request.session = session_data
    return request


def _make_db(user: "User | None") -> MagicMock:
    """Return a mock Session whose .get() returns *user*."""
    db = MagicMock()
    db.get.return_value = user
    return db


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_get_current_user_returns_user_for_valid_session():
    """A request with a valid user_id in the session returns the User object."""
    expected_user = User(id=1, username="alice", hashed_password="hashed")
    request = _make_request({"user_id": 1})
    db = _make_db(expected_user)

    result = get_current_user(request=request, db=db)

    assert result is expected_user
    db.get.assert_called_once_with(User, 1)


def test_get_current_user_raises_401_when_session_missing_user_id():
    """A request with no user_id key in the session raises HTTPException 401."""
    request = _make_request({})  # empty session — no user_id key
    db = _make_db(None)

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(request=request, db=db)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Not authenticated"
    # DB should never be queried when user_id is absent
    db.get.assert_not_called()


def test_get_current_user_raises_401_when_user_not_found_in_db():
    """A session with a user_id that has no matching DB row raises HTTPException 401."""
    request = _make_request({"user_id": 999})  # id that doesn't exist
    db = _make_db(None)  # db.get returns None → user not found

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(request=request, db=db)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Not authenticated"
    db.get.assert_called_once_with(User, 999)


# ---------------------------------------------------------------------------
# get_current_admin — role-based access control
# ---------------------------------------------------------------------------


def _make_user_with_role(role_name: str) -> MagicMock:
    """Return a mock User whose role.name equals *role_name*."""
    user = MagicMock(spec=User)
    user.role = MagicMock()
    user.role.name = role_name
    return user


class TestGetCurrentAdmin:
    """Tests for the get_current_admin dependency.

    Requirements: 5.4, 6.6
    """

    def test_admin_user_passes_through(self):
        """A user with role.name == 'Admin' is returned unchanged."""
        admin_user = _make_user_with_role("Admin")
        result = get_current_admin(current_user=admin_user)
        assert result is admin_user

    def test_non_admin_user_raises_403(self):
        """A user with role.name == 'User' raises HTTPException 403."""
        regular_user = _make_user_with_role("User")
        with pytest.raises(HTTPException) as exc_info:
            get_current_admin(current_user=regular_user)
        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "Admin role required"

    def test_user_with_no_role_raises_403(self):
        """A user whose role attribute is None raises HTTPException 403."""
        user = MagicMock(spec=User)
        user.role = None
        with pytest.raises(HTTPException) as exc_info:
            get_current_admin(current_user=user)
        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "Admin role required"

    def test_user_with_unknown_role_raises_403(self):
        """Any role name other than 'Admin' is rejected."""
        user = _make_user_with_role("Manager")
        with pytest.raises(HTTPException) as exc_info:
            get_current_admin(current_user=user)
        assert exc_info.value.status_code == 403

    def test_admin_role_is_case_sensitive(self):
        """'admin' (lowercase) must not be treated as the Admin role."""
        user = _make_user_with_role("admin")
        with pytest.raises(HTTPException) as exc_info:
            get_current_admin(current_user=user)
        assert exc_info.value.status_code == 403
