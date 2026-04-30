"""Integration tests for GET /clients using httpx.AsyncClient with ASGITransport.

Tests cover:
- GET /clients  authenticated → 200, list of strings matching CLIENTS
- GET /clients  unauthenticated → 401

Requirements: 5.1
"""

import pytest
import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.constants import CLIENTS
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
    """Yield an httpx.AsyncClient backed by a fresh in-memory SQLite DB."""
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
        user = User(username="clientsuser", hashed_password=hash_password("clientspass"), role_id=1)
        session.add(user)
        session.commit()
        session.refresh(user)
        return {"id": user.id, "username": "clientsuser", "password": "clientspass"}
    finally:
        session.close()


# ---------------------------------------------------------------------------
# GET /clients — authenticated
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_clients_authenticated_returns_200(async_client, seeded_user):
    """Authenticated request to GET /clients returns 200."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.get("/clients")

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_clients_authenticated_returns_list_of_strings(async_client, seeded_user):
    """Authenticated request to GET /clients returns a list of strings."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.get("/clients")

    body = response.json()
    assert isinstance(body, list)
    assert all(isinstance(entry, str) for entry in body)


@pytest.mark.asyncio
async def test_get_clients_authenticated_response_matches_clients_constant(
    async_client, seeded_user
):
    """Authenticated request to GET /clients returns the full CLIENTS list."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.get("/clients")

    assert response.json() == CLIENTS


# ---------------------------------------------------------------------------
# GET /clients — unauthenticated
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_clients_unauthenticated_returns_401(async_client):
    """GET /clients without a session cookie returns 401."""
    response = await async_client.get("/clients")

    assert response.status_code == 401
