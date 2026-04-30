"""Property-based tests for logout and protected endpoint authorization.

Feature: user-roles-and-logout

Properties:
  Property 4: Logout Session Clearing
  Property 5: Protected Endpoint Authorization

Requirements: 4.1, 4.4
"""

import pytest
import httpx
from hypothesis import HealthCheck, given, settings, strategies as st
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base, get_db
from app.main import app
from app.models.role import Role
from app.models.user import User
from app.services.auth_service import hash_password


# ---------------------------------------------------------------------------
# Pre-computed password hash for test users
# ---------------------------------------------------------------------------

# Pre-compute a bcrypt hash once at module load time to avoid expensive hashing in tests.
# bcrypt with 12 rounds takes ~200-400ms per hash. With 100 examples per property test,
# this optimization reduces test execution time significantly.
_TEST_PASSWORD_HASH = hash_password("test_password")


# ---------------------------------------------------------------------------
# Helper functions to create and clean up test clients
# ---------------------------------------------------------------------------


def create_test_client():
    """Create a fresh httpx.AsyncClient backed by an in-memory SQLite DB with roles seeded."""
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
    client = httpx.AsyncClient(transport=transport, base_url="http://test")
    client._test_session_factory = TestSession  # type: ignore[attr-defined]
    client._engine = engine  # type: ignore[attr-defined]
    return client


def cleanup_test_client(client):
    """Clean up test client resources."""
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=client._engine)  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Feature: user-roles-and-logout
# Property 4: Logout Session Clearing
# **Validates: Requirements 4.1**
# ---------------------------------------------------------------------------

# Protected endpoints to verify are inaccessible after logout.
# Each entry is (method, path, optional_json_body).
_PROTECTED_ENDPOINTS = [
    ("GET", "/auth/me", None),
    ("GET", "/reports", None),
    ("POST", "/reports", {"title": "T", "description": "D", "total_amount": 1.0}),
]


@pytest.mark.asyncio
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(
    role_id=st.sampled_from([1, 2]),
)
async def test_property_logout_clears_session(role_id):
    """Property 4: Logout Session Clearing.

    # Feature: user-roles-and-logout, Property 4: Logout Session Clearing

    For any authenticated user session (regardless of role), when the user requests
    POST /auth/logout, the system SHALL clear all session data, and subsequent requests
    to protected endpoints SHALL NOT contain the user_id in the session (evidenced by
    401 responses from all protected endpoints).

    **Validates: Requirements 4.1**
    """
    async_client = create_test_client()

    try:
        # Seed a user with the generated role
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            user = User(
                username="logout_prop_user",
                hashed_password=_TEST_PASSWORD_HASH,
                role_id=role_id,
            )
            session.add(user)
            session.commit()
        finally:
            session.close()

        # Establish a session via login
        login_response = await async_client.post(
            "/auth/login",
            json={"username": "logout_prop_user", "password": "test_password"},
        )
        assert login_response.status_code == 200, (
            f"Login failed for role_id={role_id}: {login_response.text}"
        )

        # Verify session is active — at least one protected endpoint must respond 200
        me_before = await async_client.get("/auth/me")
        assert me_before.status_code == 200, (
            "Session should be active before logout"
        )

        # Perform logout
        logout_response = await async_client.post("/auth/logout")
        assert logout_response.status_code == 200, (
            f"Logout must return 200, got {logout_response.status_code}"
        )
        assert logout_response.json() == {"detail": "Logged out"}, (
            f"Unexpected logout response body: {logout_response.json()}"
        )

        # After logout, ALL protected endpoints must return 401
        for method, path, body in _PROTECTED_ENDPOINTS:
            if method == "GET":
                response = await async_client.get(path)
            else:
                response = await async_client.post(path, json=body)

            assert response.status_code == 401, (
                f"After logout, {method} {path} should return 401, "
                f"got {response.status_code}. Session was not fully cleared."
            )
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


@pytest.mark.asyncio
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(
    role_id=st.sampled_from([1, 2]),
)
async def test_property_logout_is_idempotent(role_id):
    """Property 4 (idempotency): Logout clears session and repeated logouts are safe.

    # Feature: user-roles-and-logout, Property 4: Logout Session Clearing

    For any authenticated user session, calling POST /auth/logout multiple times SHALL
    always return 200 and SHALL NOT cause errors. The session SHALL remain cleared after
    each subsequent logout call.

    **Validates: Requirements 4.1**
    """
    async_client = create_test_client()

    try:
        # Seed a user with the generated role
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            user = User(
                username="idempotent_logout_user",
                hashed_password=_TEST_PASSWORD_HASH,
                role_id=role_id,
            )
            session.add(user)
            session.commit()
        finally:
            session.close()

        # Establish a session
        login_response = await async_client.post(
            "/auth/login",
            json={"username": "idempotent_logout_user", "password": "test_password"},
        )
        assert login_response.status_code == 200

        # First logout
        first_logout = await async_client.post("/auth/logout")
        assert first_logout.status_code == 200, (
            f"First logout must return 200, got {first_logout.status_code}"
        )

        # Second logout (no active session) — must still return 200
        second_logout = await async_client.post("/auth/logout")
        assert second_logout.status_code == 200, (
            f"Second logout must return 200 (idempotent), got {second_logout.status_code}"
        )

        # Session must still be cleared after double logout
        me_response = await async_client.get("/auth/me")
        assert me_response.status_code == 401, (
            "Session must remain cleared after double logout"
        )
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


# ---------------------------------------------------------------------------
# Feature: user-roles-and-logout
# Property 5: Protected Endpoint Authorization
# **Validates: Requirements 4.4**
# ---------------------------------------------------------------------------

# All protected endpoints in the application.
# Each entry is (method, path, optional_json_body).
_ALL_PROTECTED_ENDPOINTS = [
    ("GET", "/auth/me", None),
    ("GET", "/reports", None),
    ("POST", "/reports", {"title": "T", "description": "D", "total_amount": 1.0}),
]


@pytest.mark.asyncio
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(
    endpoint_index=st.integers(min_value=0, max_value=len(_ALL_PROTECTED_ENDPOINTS) - 1),
)
async def test_property_invalidated_session_rejected_by_protected_endpoints(endpoint_index):
    """Property 5: Protected Endpoint Authorization.

    # Feature: user-roles-and-logout, Property 5: Protected Endpoint Authorization

    For any protected endpoint and any request with an invalidated or missing session
    (i.e., after logout), the system SHALL return a 401 Unauthorized response and SHALL
    NOT execute the endpoint logic.

    This property tests that the authorization check is enforced consistently across
    all protected endpoints after a session has been invalidated via logout.

    **Validates: Requirements 4.4**
    """
    async_client = create_test_client()
    method, path, body = _ALL_PROTECTED_ENDPOINTS[endpoint_index]

    try:
        # Seed a user
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            user = User(
                username="auth_check_user",
                hashed_password=_TEST_PASSWORD_HASH,
                role_id=1,
            )
            session.add(user)
            session.commit()
        finally:
            session.close()

        # Establish a session
        login_response = await async_client.post(
            "/auth/login",
            json={"username": "auth_check_user", "password": "test_password"},
        )
        assert login_response.status_code == 200

        # Invalidate the session via logout
        logout_response = await async_client.post("/auth/logout")
        assert logout_response.status_code == 200

        # The protected endpoint must reject the invalidated session with 401
        if method == "GET":
            response = await async_client.get(path)
        else:
            response = await async_client.post(path, json=body)

        assert response.status_code == 401, (
            f"Protected endpoint {method} {path} must return 401 after logout, "
            f"got {response.status_code}. Invalidated session was not rejected."
        )
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


@pytest.mark.asyncio
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(
    endpoint_index=st.integers(min_value=0, max_value=len(_ALL_PROTECTED_ENDPOINTS) - 1),
)
async def test_property_missing_session_rejected_by_protected_endpoints(endpoint_index):
    """Property 5 (missing session): Protected endpoints reject requests with no session.

    # Feature: user-roles-and-logout, Property 5: Protected Endpoint Authorization

    For any protected endpoint and any request that carries no session cookie at all,
    the system SHALL return a 401 Unauthorized response.

    This complements the invalidated-session variant by testing the case where no
    session was ever established (e.g., a fresh client with no cookies).

    **Validates: Requirements 4.4**
    """
    async_client = create_test_client()
    method, path, body = _ALL_PROTECTED_ENDPOINTS[endpoint_index]

    try:
        # Make request without ever logging in — no session cookie present
        if method == "GET":
            response = await async_client.get(path)
        else:
            response = await async_client.post(path, json=body)

        assert response.status_code == 401, (
            f"Protected endpoint {method} {path} must return 401 with no session, "
            f"got {response.status_code}."
        )
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)
