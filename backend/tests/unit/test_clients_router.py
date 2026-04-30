"""Unit tests for the clients router (GET /clients).

Uses FastAPI TestClient with:
- An in-memory SQLite database (overrides get_db dependency)
- get_current_user overridden to inject a known user (authenticated tests)
  or left as-is to test unauthenticated behaviour

Requirements: 5.1
"""

import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.constants import CLIENTS
from app.db.database import Base, get_db
from app.dependencies import get_current_user
from app.main import app
from app.models.role import Role
from app.models.user import User
from app.services.auth_service import hash_password

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_engine_and_session():
    """Return a fresh in-memory SQLite engine + session factory with roles seeded."""
    import app.models  # noqa: F401 — register all ORM models with Base

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)

    # Seed roles required by the User model's NOT NULL role_id constraint
    session = Session()
    try:
        session.add(Role(id=1, name="User"))
        session.add(Role(id=2, name="Admin"))
        session.commit()
    finally:
        session.close()

    return engine, Session


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def auth_client():
    """TestClient with get_db overridden and get_current_user returning a seeded user.

    Simulates an authenticated request context.
    """
    engine, TestSession = _make_engine_and_session()

    session = TestSession()
    user = User(username="alice", hashed_password=hash_password("pw"), role_id=1)
    session.add(user)
    session.commit()
    session.refresh(user)
    user_id = user.id
    session.close()

    def override_get_db():
        s = TestSession()
        try:
            yield s
        finally:
            s.close()

    def override_get_current_user(
        request: Request,
        db=None,
    ) -> User:
        s = TestSession()
        try:
            return s.get(User, user_id)
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def unauth_client():
    """TestClient with get_db overridden but NO get_current_user override.

    Simulates an unauthenticated request (no session cookie).
    """
    engine, TestSession = _make_engine_and_session()

    def override_get_db():
        s = TestSession()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


# ---------------------------------------------------------------------------
# GET /clients — authenticated
# ---------------------------------------------------------------------------


def test_get_clients_with_valid_session_returns_200(auth_client):
    """GET /clients with a valid session returns 200."""
    response = auth_client.get("/clients")

    assert response.status_code == 200


def test_get_clients_with_valid_session_returns_full_list(auth_client):
    """GET /clients with a valid session returns the full CLIENTS list."""
    response = auth_client.get("/clients")

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert body == CLIENTS


def test_get_clients_response_contains_all_expected_names(auth_client):
    """GET /clients response contains all five expected client names."""
    response = auth_client.get("/clients")

    body = response.json()
    assert "Acme Corp" in body
    assert "Globex Industries" in body
    assert "Initech" in body
    assert "Umbrella Ltd" in body
    assert "Hooli" in body


def test_get_clients_response_is_list_of_strings(auth_client):
    """GET /clients response is a list of strings."""
    response = auth_client.get("/clients")

    body = response.json()
    assert all(isinstance(entry, str) for entry in body)


# ---------------------------------------------------------------------------
# GET /clients — unauthenticated
# ---------------------------------------------------------------------------


def test_get_clients_without_session_returns_401(unauth_client):
    """GET /clients without a valid session cookie returns 401."""
    response = unauth_client.get("/clients")

    assert response.status_code == 401
