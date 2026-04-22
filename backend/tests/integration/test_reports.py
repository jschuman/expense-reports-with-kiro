"""Integration tests for reports endpoints using httpx.AsyncClient with ASGITransport.

Tests cover:
- GET  /reports  success: seeded user + reports → 200, array shape, only owner's reports
- GET  /reports  unauthenticated → 401
- POST /reports  success: valid payload → 201, response shape, status=="Pending", owner_id matches
- POST /reports  empty title → 422
- POST /reports  non-positive amount (total_amount=0, total_amount=-5) → 422
- POST /reports  missing fields → 422

Requirements: 2.1, 3.2, 3.4, 3.5
"""

import pytest
import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base, get_db
from app.main import app
from app.models.expense_report import ExpenseReport
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
        user = User(username="reportuser", hashed_password=hash_password("reportpass"))
        session.add(user)
        session.commit()
        session.refresh(user)
        return {"id": user.id, "username": "reportuser", "password": "reportpass"}
    finally:
        session.close()


@pytest.fixture()
async def authenticated_client(async_client, seeded_user):
    """Return an async_client that already has a valid session cookie."""
    response = await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )
    assert response.status_code == 200
    return async_client, seeded_user


@pytest.fixture()
async def seeded_reports(async_client, seeded_user):
    """Seed two reports for seeded_user and one report for a second user.

    Returns a dict with the owner's user info and their report data so tests
    can assert isolation (the second user's report must NOT appear in the
    owner's GET /reports response).
    """
    session = async_client._test_session_factory()  # type: ignore[attr-defined]
    try:
        # Second user — reports must NOT appear in seeded_user's list
        other_user = User(username="otheruser", hashed_password=hash_password("otherpass"))
        session.add(other_user)
        session.flush()

        report1 = ExpenseReport(
            title="Q1 Travel",
            purpose="Client visit",
            total_amount=450.00,
            status="Pending",
            owner_id=seeded_user["id"],
        )
        report2 = ExpenseReport(
            title="Office Supplies",
            purpose="Stationery restock",
            total_amount=75.50,
            status="Pending",
            owner_id=seeded_user["id"],
        )
        other_report = ExpenseReport(
            title="Other User Report",
            purpose="Should not appear",
            total_amount=999.99,
            status="Pending",
            owner_id=other_user.id,
        )
        session.add_all([report1, report2, other_report])
        session.commit()
        session.refresh(report1)
        session.refresh(report2)

        return {
            "user": seeded_user,
            "reports": [
                {"title": report1.title, "purpose": report1.purpose, "total_amount": report1.total_amount},
                {"title": report2.title, "purpose": report2.purpose, "total_amount": report2.total_amount},
            ],
        }
    finally:
        session.close()


# ---------------------------------------------------------------------------
# GET /reports
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_reports_success_returns_200_and_array(
    async_client, seeded_user, seeded_reports
):
    """Authenticated user with reports → 200, correct array shape, only owner's reports."""
    # Authenticate
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.get("/reports")

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    # Exactly the two reports seeded for this user — not the other user's report
    assert len(body) == 2
    for report in body:
        assert report["owner_id"] == seeded_user["id"]
        assert "id" in report
        assert "title" in report
        assert "purpose" in report
        assert "total_amount" in report
        assert "status" in report


@pytest.mark.asyncio
async def test_get_reports_returns_only_owner_reports(
    async_client, seeded_user, seeded_reports
):
    """GET /reports must not leak another user's reports."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.get("/reports")

    assert response.status_code == 200
    body = response.json()
    titles = {r["title"] for r in body}
    assert "Other User Report" not in titles


@pytest.mark.asyncio
async def test_get_reports_unauthenticated_returns_401(async_client):
    """GET /reports without a session cookie → 401."""
    response = await async_client.get("/reports")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_reports_empty_list_when_no_reports(async_client, seeded_user):
    """Authenticated user with no reports → 200 with empty array."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.get("/reports")

    assert response.status_code == 200
    assert response.json() == []


# ---------------------------------------------------------------------------
# POST /reports
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_report_success_returns_201_and_response_shape(
    async_client, seeded_user
):
    """Valid payload → 201, correct ExpenseReportResponse shape."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    payload = {"title": "Conference Trip", "purpose": "Annual tech conference", "total_amount": 1200.00}
    response = await async_client.post("/reports", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == payload["title"]
    assert body["purpose"] == payload["purpose"]
    assert body["total_amount"] == payload["total_amount"]
    assert body["status"] == "Pending"
    assert body["owner_id"] == seeded_user["id"]
    assert "id" in body


@pytest.mark.asyncio
async def test_create_report_status_is_pending(async_client, seeded_user):
    """Newly created report always has status == 'Pending'."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post(
        "/reports",
        json={"title": "Team Lunch", "purpose": "Quarterly team event", "total_amount": 250.00},
    )

    assert response.status_code == 201
    assert response.json()["status"] == "Pending"


@pytest.mark.asyncio
async def test_create_report_owner_id_matches_authenticated_user(async_client, seeded_user):
    """Created report's owner_id must equal the authenticated user's id."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post(
        "/reports",
        json={"title": "Software License", "purpose": "Annual subscription", "total_amount": 99.99},
    )

    assert response.status_code == 201
    assert response.json()["owner_id"] == seeded_user["id"]


@pytest.mark.asyncio
async def test_create_report_unauthenticated_returns_401(async_client):
    """POST /reports without a session cookie → 401."""
    response = await async_client.post(
        "/reports",
        json={"title": "Some Report", "purpose": "Some purpose", "total_amount": 100.00},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_report_empty_title_returns_422(async_client, seeded_user):
    """Empty title → 422 Unprocessable Entity, no record created."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post(
        "/reports",
        json={"title": "", "purpose": "Valid purpose", "total_amount": 100.00},
    )

    assert response.status_code == 422

    # Confirm no report was persisted
    list_response = await async_client.get("/reports")
    assert list_response.json() == []


@pytest.mark.asyncio
async def test_create_report_zero_amount_returns_422(async_client, seeded_user):
    """total_amount=0 → 422, no record created."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post(
        "/reports",
        json={"title": "Valid Title", "purpose": "Valid purpose", "total_amount": 0},
    )

    assert response.status_code == 422

    list_response = await async_client.get("/reports")
    assert list_response.json() == []


@pytest.mark.asyncio
async def test_create_report_negative_amount_returns_422(async_client, seeded_user):
    """total_amount=-5 → 422, no record created."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post(
        "/reports",
        json={"title": "Valid Title", "purpose": "Valid purpose", "total_amount": -5},
    )

    assert response.status_code == 422

    list_response = await async_client.get("/reports")
    assert list_response.json() == []


@pytest.mark.asyncio
async def test_create_report_missing_title_returns_422(async_client, seeded_user):
    """Missing title field → 422."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post(
        "/reports",
        json={"purpose": "Valid purpose", "total_amount": 100.00},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_report_missing_purpose_returns_422(async_client, seeded_user):
    """Missing purpose field → 422."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post(
        "/reports",
        json={"title": "Valid Title", "total_amount": 100.00},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_report_missing_amount_returns_422(async_client, seeded_user):
    """Missing total_amount field → 422."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post(
        "/reports",
        json={"title": "Valid Title", "purpose": "Valid purpose"},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_report_empty_body_returns_422(async_client, seeded_user):
    """Completely empty body → 422."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post("/reports", json={})

    assert response.status_code == 422
