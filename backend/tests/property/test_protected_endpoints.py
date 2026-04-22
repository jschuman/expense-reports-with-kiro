"""Property-based tests for protected endpoint authentication using hypothesis.

Property 3: Unauthenticated requests to protected endpoints are always rejected

Requirements: 1.4
"""

import pytest
import httpx
from hypothesis import given, settings, strategies as st, HealthCheck
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base, get_db
from app.main import app


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
# Property 3: Unauthenticated requests to protected endpoints are always rejected
# **Validates: Requirements 1.4**
# ---------------------------------------------------------------------------


# List of protected endpoints (method, path, optional_body)
PROTECTED_ENDPOINTS = [
    ("GET", "/reports", None),
    ("POST", "/reports", {"title": "Test", "purpose": "Test", "total_amount": 100.0}),
    ("GET", "/auth/me", None),
]


@pytest.mark.asyncio
@settings(max_examples=20, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    endpoint_index=st.integers(min_value=0, max_value=len(PROTECTED_ENDPOINTS) - 1),
)
async def test_property_unauthenticated_requests_always_rejected(endpoint_index):
    """Property 3: Unauthenticated requests to protected endpoints are always rejected.
    
    **Validates: Requirements 1.4**
    
    For any protected endpoint and any request that does not carry a valid session cookie,
    the endpoint SHALL return 401.
    """
    async_client = create_test_client()
    
    try:
        method, path, body = PROTECTED_ENDPOINTS[endpoint_index]

        # Make request without establishing a session
        if method == "GET":
            response = await async_client.get(path)
        elif method == "POST":
            response = await async_client.post(path, json=body)
        else:
            raise ValueError(f"Unsupported method: {method}")

        # Assert 401 for all protected endpoints
        assert response.status_code == 401, (
            f"Expected 401 for unauthenticated {method} {path}, got {response.status_code}"
        )
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)
