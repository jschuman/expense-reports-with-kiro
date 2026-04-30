"""Unit tests for the auth router (POST /auth/login, POST /auth/logout, GET /auth/me).

Uses FastAPI TestClient with:
- An in-memory SQLite database (overrides get_db dependency)
- A hard-coded SessionMiddleware secret (no env var required)
- A seeded User row for credential tests
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base, get_db
from app.main import app
from app.models.role import Role
from app.models.user import User
from app.services.auth_service import hash_password

# ---------------------------------------------------------------------------
# In-memory DB + dependency override fixtures
#
# StaticPool forces all connections to reuse the same underlying SQLite
# connection, so tables created by create_all() are visible to every session
# — including those opened by the app's overridden get_db dependency.
# ---------------------------------------------------------------------------


@pytest.fixture()
def client():
    """TestClient backed by a fresh in-memory SQLite DB for each test.

    The `get_db` dependency is overridden to yield sessions from the same
    in-memory engine, so seed data written before requests is visible to
    the app.
    """
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

    # Expose the session factory on the client so `seeded_user` can use it
    with TestClient(app, raise_server_exceptions=True) as c:
        c._test_session_factory = TestSession  # type: ignore[attr-defined]
        yield c

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def seeded_user(client):
    """Insert a known User-role user into the shared in-memory DB and return their credentials.

    Depends on `client` so both fixtures share the same SQLAlchemy engine.
    """
    session = client._test_session_factory()  # type: ignore[attr-defined]
    try:
        user = User(username="testuser", hashed_password=hash_password("testpass"), role_id=1)
        session.add(user)
        session.commit()
        session.refresh(user)
        return {"id": user.id, "username": "testuser", "password": "testpass", "role": "User"}
    finally:
        session.close()


@pytest.fixture()
def seeded_admin(client):
    """Insert a known Admin-role user into the shared in-memory DB and return their credentials.

    Depends on `client` so both fixtures share the same SQLAlchemy engine.
    """
    session = client._test_session_factory()  # type: ignore[attr-defined]
    try:
        admin = User(username="adminuser", hashed_password=hash_password("adminpass"), role_id=2)
        session.add(admin)
        session.commit()
        session.refresh(admin)
        return {"id": admin.id, "username": "adminuser", "password": "adminpass", "role": "Admin"}
    finally:
        session.close()


# ---------------------------------------------------------------------------
# POST /auth/login
# ---------------------------------------------------------------------------


def test_login_with_valid_credentials_returns_200_and_user_response(client, seeded_user):
    """Valid credentials → 200 with UserResponse shape and session cookie set."""
    response = client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == seeded_user["id"]
    assert body["username"] == seeded_user["username"]
    assert body["role"] == "User"
    # Session cookie must be present
    assert "session" in client.cookies


def test_login_sets_session_user_id(client, seeded_user):
    """After a successful login the session cookie is set (GET /auth/me returns 200)."""
    client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )
    me_response = client.get("/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["username"] == seeded_user["username"]


def test_login_with_wrong_password_returns_401(client, seeded_user):
    """Wrong password → 401 Unauthorized."""
    response = client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": "wrongpassword"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username or password"


def test_login_with_missing_fields_returns_422(client):
    """Missing required fields → 422 Unprocessable Entity (Pydantic validation)."""
    response = client.post("/auth/login", json={})

    assert response.status_code == 422


def test_login_with_missing_password_returns_422(client):
    """Missing password field → 422."""
    response = client.post("/auth/login", json={"username": "someone"})

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# POST /auth/logout
# ---------------------------------------------------------------------------


def test_logout_clears_session_and_returns_detail(client, seeded_user):
    """Logout clears the session; subsequent GET /auth/me returns 401."""
    # First log in
    client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    # Then log out
    logout_response = client.post("/auth/logout")
    assert logout_response.status_code == 200
    assert logout_response.json() == {"detail": "Logged out"}

    # Session should be cleared — /auth/me must now return 401
    me_response = client.get("/auth/me")
    assert me_response.status_code == 401


def test_logout_without_session_still_returns_200(client):
    """Logout is idempotent — calling it without an active session returns 200."""
    response = client.post("/auth/logout")
    assert response.status_code == 200
    assert response.json() == {"detail": "Logged out"}


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------


def test_me_with_valid_session_returns_user_response(client, seeded_user):
    """GET /auth/me with a valid session returns 200 and UserResponse shape."""
    client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = client.get("/auth/me")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == seeded_user["id"]
    assert body["username"] == seeded_user["username"]
    assert body["role"] == "User"


def test_me_without_session_returns_401(client):
    """GET /auth/me without a session cookie returns 401."""
    response = client.get("/auth/me")

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Role field in login and /me responses (Requirements 7.1, 7.2)
# ---------------------------------------------------------------------------


def test_login_response_includes_role_field_for_user_role(client, seeded_user):
    """POST /auth/login response includes role field with value 'User'.

    Requirements: 7.1
    """
    response = client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert "role" in body
    assert body["role"] == "User"


def test_login_response_includes_role_field_for_admin_role(client, seeded_admin):
    """POST /auth/login response includes role field with value 'Admin'.

    Requirements: 7.1
    """
    response = client.post(
        "/auth/login",
        json={"username": seeded_admin["username"], "password": seeded_admin["password"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert "role" in body
    assert body["role"] == "Admin"


def test_me_response_includes_role_field_for_user_role(client, seeded_user):
    """GET /auth/me response includes role field with value 'User'.

    Requirements: 7.2
    """
    client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = client.get("/auth/me")

    assert response.status_code == 200
    body = response.json()
    assert "role" in body
    assert body["role"] == "User"


def test_me_response_includes_role_field_for_admin_role(client, seeded_admin):
    """GET /auth/me response includes role field with value 'Admin'.

    Requirements: 7.2
    """
    client.post(
        "/auth/login",
        json={"username": seeded_admin["username"], "password": seeded_admin["password"]},
    )

    response = client.get("/auth/me")

    assert response.status_code == 200
    body = response.json()
    assert "role" in body
    assert body["role"] == "Admin"


def test_login_response_shape_includes_all_required_fields(client, seeded_user):
    """POST /auth/login response contains id, username, and role fields.

    Requirements: 7.1
    """
    response = client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert "id" in body
    assert "username" in body
    assert "role" in body


def test_me_response_shape_includes_all_required_fields(client, seeded_user):
    """GET /auth/me response contains id, username, and role fields.

    Requirements: 7.2
    """
    client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = client.get("/auth/me")

    assert response.status_code == 200
    body = response.json()
    assert "id" in body
    assert "username" in body
    assert "role" in body


def test_logout_clears_session_and_me_returns_401(client, seeded_user):
    """POST /auth/logout clears session; GET /auth/me returns 401 afterwards.

    Requirements: 4.1
    """
    # Log in
    client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    # Verify session is active
    me_before = client.get("/auth/me")
    assert me_before.status_code == 200

    # Log out
    logout_response = client.post("/auth/logout")
    assert logout_response.status_code == 200
    assert logout_response.json() == {"detail": "Logged out"}

    # Session must be cleared
    me_after = client.get("/auth/me")
    assert me_after.status_code == 401
