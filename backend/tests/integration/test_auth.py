"""Integration tests for auth endpoints using httpx.AsyncClient with ASGITransport.

Tests cover:
- POST /auth/login  success (200, cookie set, UserResponse shape)
- POST /auth/login  wrong password (401, no session cookie)
- POST /auth/login  missing fields (422)
- POST /auth/logout success (200, session cleared)
- GET  /auth/me     with valid session (200, correct user shape)
- GET  /auth/me     without session (401)

Requirements: 1.1, 1.2, 1.3, 1.4
"""

import pytest
import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base, get_db
from app.main import app
from app.models.user import User
from app.services.auth_service import hash_password

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
async def async_client():
    """Yield an httpx.AsyncClient backed by a fresh in-memory SQLite DB.

    The ``get_db`` dependency is overridden so every request uses the same
    in-memory engine as the seed step, keeping data visible across calls.
    StaticPool ensures all connections share the same underlying SQLite
    connection so tables created by ``create_all`` are always visible.
    """
    import app.models as _models  # noqa: F401 — register all ORM models with Base

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine)

    def override_get_db():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        client._test_session_factory = TestSession  # type: ignore[attr-defined]
        yield client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
async def seeded_user(async_client):
    """Insert a known user into the shared in-memory DB and return credentials."""
    session = async_client._test_session_factory()  # type: ignore[attr-defined]
    try:
        user = User(username="integuser", hashed_password=hash_password("integpass"))
        session.add(user)
        session.commit()
        session.refresh(user)
        return {"id": user.id, "username": "integuser", "password": "integpass"}
    finally:
        session.close()


# ---------------------------------------------------------------------------
# POST /auth/login
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_success_returns_200_and_user_response(async_client, seeded_user):
    """Valid credentials → 200, UserResponse shape, session cookie set."""
    response = await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == seeded_user["id"]
    assert body["username"] == seeded_user["username"]
    # Session cookie must be present in the response
    assert "session" in response.cookies or "session" in response.headers.get(
        "set-cookie", ""
    )


@pytest.mark.asyncio
async def test_login_wrong_password_returns_401(async_client, seeded_user):
    """Wrong password → 401, no session cookie set."""
    response = await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": "wrongpassword"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username or password"
    # No session cookie should be set on failed login
    assert "session" not in response.cookies


@pytest.mark.asyncio
async def test_login_missing_fields_returns_422(async_client):
    """Missing required fields → 422 Unprocessable Entity."""
    response = await async_client.post("/auth/login", json={})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login_missing_password_returns_422(async_client):
    """Missing password field → 422."""
    response = await async_client.post("/auth/login", json={"username": "someone"})

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# POST /auth/logout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_logout_clears_session(async_client, seeded_user):
    """Login, then logout → 200; subsequent GET /auth/me returns 401."""
    # Establish a session
    login_response = await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )
    assert login_response.status_code == 200

    # Logout
    logout_response = await async_client.post("/auth/logout")
    assert logout_response.status_code == 200
    assert logout_response.json() == {"detail": "Logged out"}

    # Session must be cleared — /auth/me should now return 401
    me_response = await async_client.get("/auth/me")
    assert me_response.status_code == 401


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_me_with_valid_session_returns_200_and_user(async_client, seeded_user):
    """GET /auth/me after login → 200 with correct UserResponse shape."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.get("/auth/me")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == seeded_user["id"]
    assert body["username"] == seeded_user["username"]


@pytest.mark.asyncio
async def test_me_without_session_returns_401(async_client):
    """GET /auth/me without a session cookie → 401."""
    response = await async_client.get("/auth/me")

    assert response.status_code == 401
