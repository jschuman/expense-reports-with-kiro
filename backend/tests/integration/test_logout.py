"""Integration tests for logout functionality.

Tests cover:
- POST /auth/logout clears session (authenticated user is logged out)
- Protected endpoints return 401 after logout
- Logout is idempotent (can logout twice without error)

Requirements: 4.1, 4.2, 4.3, 4.4
"""

import pytest
import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base, get_db
from app.main import app
from app.models.role import Role
from app.models.user import User
from app.services.auth_service import hash_password


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
async def async_client():
    """Yield an httpx.AsyncClient backed by a fresh in-memory SQLite DB with roles seeded."""
    import app.models as _models  # noqa: F401 — register all ORM models with Base

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine)

    # Seed roles required by the User model's NOT NULL role_id constraint
    session = TestSession()
    try:
        session.add(Role(id=1, name="User"))
        session.add(Role(id=2, name="Admin"))
        session.commit()
    finally:
        session.close()

    def override_get_db():
        s = TestSession()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_get_db

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        client._test_session_factory = TestSession  # type: ignore[attr-defined]
        yield client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
async def seeded_user(async_client):
    """Insert a User-role user into the shared in-memory DB and return credentials."""
    session = async_client._test_session_factory()  # type: ignore[attr-defined]
    try:
        user = User(
            username="logoutuser",
            hashed_password=hash_password("logoutpass"),
            role_id=1,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return {"id": user.id, "username": "logoutuser", "password": "logoutpass"}
    finally:
        session.close()


# ---------------------------------------------------------------------------
# POST /auth/logout — session clearing
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_logout_returns_200_with_success_message(async_client, seeded_user):
    """POST /auth/logout returns 200 with a success detail message.

    Requirements: 4.3
    """
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post("/auth/logout")

    assert response.status_code == 200
    assert response.json() == {"detail": "Logged out"}


@pytest.mark.asyncio
async def test_logout_clears_session_so_me_returns_401(async_client, seeded_user):
    """POST /auth/logout clears the session; GET /auth/me returns 401 afterwards.

    Requirements: 4.1, 4.2
    """
    # Establish a session
    login_response = await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )
    assert login_response.status_code == 200

    # Confirm session is active
    me_before = await async_client.get("/auth/me")
    assert me_before.status_code == 200

    # Logout
    logout_response = await async_client.post("/auth/logout")
    assert logout_response.status_code == 200

    # Session must be cleared — /auth/me should now return 401
    me_after = await async_client.get("/auth/me")
    assert me_after.status_code == 401


@pytest.mark.asyncio
async def test_logout_clears_session_so_reports_returns_401(async_client, seeded_user):
    """POST /auth/logout clears the session; GET /reports returns 401 afterwards.

    Requirements: 4.1, 4.4
    """
    # Establish a session
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    # Confirm reports endpoint is accessible
    reports_before = await async_client.get("/reports")
    assert reports_before.status_code == 200

    # Logout
    await async_client.post("/auth/logout")

    # Protected endpoint must now reject the request
    reports_after = await async_client.get("/reports")
    assert reports_after.status_code == 401


# ---------------------------------------------------------------------------
# POST /auth/logout — protected endpoints return 401 after logout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_me_returns_401_after_logout(async_client, seeded_user):
    """GET /auth/me returns 401 after the user has logged out.

    Requirements: 4.4
    """
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )
    await async_client.post("/auth/logout")

    response = await async_client.get("/auth/me")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_reports_returns_401_after_logout(async_client, seeded_user):
    """GET /reports returns 401 after the user has logged out.

    Requirements: 4.4
    """
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )
    await async_client.post("/auth/logout")

    response = await async_client.get("/reports")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_report_returns_401_after_logout(async_client, seeded_user):
    """POST /reports returns 401 after the user has logged out.

    Requirements: 4.4
    """
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )
    await async_client.post("/auth/logout")

    response = await async_client.post(
        "/reports",
        json={"title": "Test", "description": "Test", "total_amount": 100.0},
    )

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /auth/logout — idempotency
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_logout_is_idempotent_second_logout_returns_200(async_client, seeded_user):
    """POST /auth/logout twice returns 200 both times (idempotent operation).

    Requirements: 4.3
    """
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    first_logout = await async_client.post("/auth/logout")
    assert first_logout.status_code == 200

    second_logout = await async_client.post("/auth/logout")
    assert second_logout.status_code == 200
    assert second_logout.json() == {"detail": "Logged out"}


@pytest.mark.asyncio
async def test_logout_without_session_returns_200(async_client):
    """POST /auth/logout without an active session returns 200 (idempotent).

    Logout of a non-existent session is a no-op and must not raise an error.

    Requirements: 4.3
    """
    response = await async_client.post("/auth/logout")

    assert response.status_code == 200
    assert response.json() == {"detail": "Logged out"}


@pytest.mark.asyncio
async def test_protected_endpoints_remain_401_after_double_logout(async_client, seeded_user):
    """Protected endpoints return 401 after logging out twice.

    Requirements: 4.3, 4.4
    """
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    await async_client.post("/auth/logout")
    await async_client.post("/auth/logout")

    me_response = await async_client.get("/auth/me")
    assert me_response.status_code == 401

    reports_response = await async_client.get("/reports")
    assert reports_response.status_code == 401


@pytest.mark.asyncio
async def test_user_can_login_again_after_logout(async_client, seeded_user):
    """After logout, the user can log in again and access protected endpoints.

    Requirements: 4.1, 4.2
    """
    # First login
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    # Logout
    await async_client.post("/auth/logout")

    # Verify session is cleared
    me_after_logout = await async_client.get("/auth/me")
    assert me_after_logout.status_code == 401

    # Login again
    second_login = await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )
    assert second_login.status_code == 200

    # Session is active again
    me_after_relogin = await async_client.get("/auth/me")
    assert me_after_relogin.status_code == 200
    assert me_after_relogin.json()["username"] == seeded_user["username"]
