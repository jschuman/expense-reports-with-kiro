"""Integration tests for auth endpoints with role information.

Tests cover:
- POST /auth/login returns role field for User-role users
- POST /auth/login returns role field for Admin-role users
- GET /auth/me returns role field for User-role users
- GET /auth/me returns role field for Admin-role users
- Authentication fails for user without a role (data integrity)

Requirements: 7.1, 7.2, 6.4
"""

import pytest
import httpx
from sqlalchemy import create_engine, text
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
        client._engine = engine  # type: ignore[attr-defined]
        yield client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
async def seeded_user_role_user(async_client):
    """Seed a User-role user and return credentials."""
    session = async_client._test_session_factory()  # type: ignore[attr-defined]
    try:
        user = User(
            username="regularuser",
            hashed_password=hash_password("userpass"),
            role_id=1,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return {"id": user.id, "username": "regularuser", "password": "userpass", "role": "User"}
    finally:
        session.close()


@pytest.fixture()
async def seeded_admin_role_user(async_client):
    """Seed an Admin-role user and return credentials."""
    session = async_client._test_session_factory()  # type: ignore[attr-defined]
    try:
        admin = User(
            username="adminuser",
            hashed_password=hash_password("adminpass"),
            role_id=2,
        )
        session.add(admin)
        session.commit()
        session.refresh(admin)
        return {"id": admin.id, "username": "adminuser", "password": "adminpass", "role": "Admin"}
    finally:
        session.close()


# ---------------------------------------------------------------------------
# POST /auth/login — role field in response
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_returns_role_field_for_user_role(async_client, seeded_user_role_user):
    """POST /auth/login returns role='User' for a User-role user.

    Requirements: 7.1
    """
    response = await async_client.post(
        "/auth/login",
        json={
            "username": seeded_user_role_user["username"],
            "password": seeded_user_role_user["password"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert "role" in body
    assert body["role"] == "User"


@pytest.mark.asyncio
async def test_login_returns_role_field_for_admin_role(async_client, seeded_admin_role_user):
    """POST /auth/login returns role='Admin' for an Admin-role user.

    Requirements: 7.1
    """
    response = await async_client.post(
        "/auth/login",
        json={
            "username": seeded_admin_role_user["username"],
            "password": seeded_admin_role_user["password"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert "role" in body
    assert body["role"] == "Admin"


@pytest.mark.asyncio
async def test_login_response_shape_includes_id_username_role(async_client, seeded_user_role_user):
    """POST /auth/login response contains id, username, and role fields.

    Requirements: 7.1
    """
    response = await async_client.post(
        "/auth/login",
        json={
            "username": seeded_user_role_user["username"],
            "password": seeded_user_role_user["password"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == seeded_user_role_user["id"]
    assert body["username"] == seeded_user_role_user["username"]
    assert body["role"] == seeded_user_role_user["role"]


# ---------------------------------------------------------------------------
# GET /auth/me — role field in response
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_me_returns_role_field_for_user_role(async_client, seeded_user_role_user):
    """GET /auth/me returns role='User' for a User-role user.

    Requirements: 7.2
    """
    await async_client.post(
        "/auth/login",
        json={
            "username": seeded_user_role_user["username"],
            "password": seeded_user_role_user["password"],
        },
    )

    response = await async_client.get("/auth/me")

    assert response.status_code == 200
    body = response.json()
    assert "role" in body
    assert body["role"] == "User"


@pytest.mark.asyncio
async def test_me_returns_role_field_for_admin_role(async_client, seeded_admin_role_user):
    """GET /auth/me returns role='Admin' for an Admin-role user.

    Requirements: 7.2
    """
    await async_client.post(
        "/auth/login",
        json={
            "username": seeded_admin_role_user["username"],
            "password": seeded_admin_role_user["password"],
        },
    )

    response = await async_client.get("/auth/me")

    assert response.status_code == 200
    body = response.json()
    assert "role" in body
    assert body["role"] == "Admin"


@pytest.mark.asyncio
async def test_me_response_shape_includes_id_username_role(async_client, seeded_user_role_user):
    """GET /auth/me response contains id, username, and role fields.

    Requirements: 7.2
    """
    await async_client.post(
        "/auth/login",
        json={
            "username": seeded_user_role_user["username"],
            "password": seeded_user_role_user["password"],
        },
    )

    response = await async_client.get("/auth/me")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == seeded_user_role_user["id"]
    assert body["username"] == seeded_user_role_user["username"]
    assert body["role"] == seeded_user_role_user["role"]


@pytest.mark.asyncio
async def test_me_role_matches_login_role(async_client, seeded_admin_role_user):
    """GET /auth/me returns the same role as POST /auth/login for the same user.

    Requirements: 7.1, 7.2
    """
    login_response = await async_client.post(
        "/auth/login",
        json={
            "username": seeded_admin_role_user["username"],
            "password": seeded_admin_role_user["password"],
        },
    )
    assert login_response.status_code == 200
    login_role = login_response.json()["role"]

    me_response = await async_client.get("/auth/me")
    assert me_response.status_code == 200
    me_role = me_response.json()["role"]

    assert login_role == me_role == "Admin"


# ---------------------------------------------------------------------------
# Authentication fails for user without a role (Requirement 6.4)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_authentication_fails_for_user_without_role(async_client):
    """POST /auth/login returns 401 when the user record has no role assigned.

    SQLite FK enforcement is disabled by default; we simulate a missing role by
    inserting a user row with a role_id that references a non-existent role,
    then attempting to authenticate. The auth service returns None for any user
    whose role cannot be loaded, resulting in a 401 response.

    Requirements: 6.4
    """
    # Bypass FK constraint by inserting directly via raw SQL with FK checks off.
    # This simulates a data-integrity violation (user with no valid role).
    engine = async_client._engine  # type: ignore[attr-defined]
    with engine.connect() as conn:
        conn.execute(
            text(
                "INSERT INTO users (username, hashed_password, role_id) "
                "VALUES (:username, :hashed_password, :role_id)"
            ),
            {
                "username": "noroleuser",
                "hashed_password": hash_password("somepass"),
                "role_id": 999,  # Non-existent role
            },
        )
        conn.commit()

    # Attempt to authenticate — should fail because role_id=999 doesn't exist
    response = await async_client.post(
        "/auth/login",
        json={"username": "noroleuser", "password": "somepass"},
    )

    # The user exists and password is correct, but role_id=999 references a non-existent
    # role. Per Requirement 6.4, the system must reject authentication with 401.
    assert response.status_code == 401
