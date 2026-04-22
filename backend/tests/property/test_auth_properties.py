"""Property-based tests for authentication using hypothesis.

Property 1: Valid credentials always establish a session
Property 2: Invalid credentials never establish a session

Requirements: 1.1, 1.2, 1.3
"""

import pytest
import httpx
from hypothesis import given, settings, strategies as st, HealthCheck
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base, get_db
from app.main import app
from app.models.user import User
from app.services.auth_service import hash_password


# ---------------------------------------------------------------------------
# Helper function to create test client
# ---------------------------------------------------------------------------


def create_test_client():
    """Create a fresh httpx.AsyncClient backed by an in-memory SQLite DB."""
    import app.models as _models  # noqa: F401

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
    client = httpx.AsyncClient(transport=transport, base_url="http://test")
    client._test_session_factory = TestSession  # type: ignore[attr-defined]
    client._engine = engine  # type: ignore[attr-defined]
    return client


def cleanup_test_client(client):
    """Clean up test client resources."""
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=client._engine)  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Property 1: Valid credentials always establish a session
# **Validates: Requirements 1.1, 1.2**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=20, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    username=st.text(
        alphabet=st.characters(min_codepoint=33, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
        min_size=1,
        max_size=50,
    ),
    password=st.text(
        alphabet=st.characters(min_codepoint=33, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
        min_size=1,
        max_size=50,
    ),
)
async def test_property_valid_credentials_always_establish_session(username, password):
    """Property 1: Valid credentials always establish a session.
    
    **Validates: Requirements 1.1, 1.2**
    
    For any user record in the database, submitting that user's correct username
    and password to POST /auth/login SHALL return 200 and set a valid session cookie.
    """
    async_client = create_test_client()
    
    try:
        # Seed user with hashed password
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            user = User(username=username, hashed_password=hash_password(password))
            session.add(user)
            session.commit()
            session.refresh(user)
            user_id = user.id
        finally:
            session.close()

        # Attempt login with correct credentials
        response = await async_client.post(
            "/auth/login",
            json={"username": username, "password": password},
        )

        # Assert 200 and session cookie set
        assert response.status_code == 200, f"Expected 200 for valid credentials, got {response.status_code}"
        body = response.json()
        assert body["id"] == user_id
        assert body["username"] == username
        # Session cookie must be present
        assert "session" in response.cookies or "session" in response.headers.get("set-cookie", "")
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


# ---------------------------------------------------------------------------
# Property 2: Invalid credentials never establish a session
# **Validates: Requirements 1.3**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=20, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    username=st.text(
        alphabet=st.characters(min_codepoint=33, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
        min_size=1,
        max_size=50,
    ),
    correct_password=st.text(
        alphabet=st.characters(min_codepoint=33, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
        min_size=1,
        max_size=50,
    ),
    wrong_password=st.text(
        alphabet=st.characters(min_codepoint=33, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
        min_size=1,
        max_size=50,
    ),
)
async def test_property_invalid_credentials_never_establish_session(
    username, correct_password, wrong_password
):
    """Property 2: Invalid credentials never establish a session.
    
    **Validates: Requirements 1.3**
    
    For any combination of username and password where the password does not match
    the stored hash for that username (or the username does not exist), POST /auth/login
    SHALL return 401 and SHALL NOT set a session cookie.
    """
    # Filter out cases where passwords accidentally match
    if correct_password == wrong_password:
        return

    async_client = create_test_client()
    
    try:
        # Seed user with correct password
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            user = User(username=username, hashed_password=hash_password(correct_password))
            session.add(user)
            session.commit()
        finally:
            session.close()

        # Attempt login with wrong password
        response = await async_client.post(
            "/auth/login",
            json={"username": username, "password": wrong_password},
        )

        # Assert 401 and no session cookie
        assert response.status_code == 401, f"Expected 401 for invalid credentials, got {response.status_code}"
        assert response.json()["detail"] == "Invalid username or password"
        # No session cookie should be set
        assert "session" not in response.cookies
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)
