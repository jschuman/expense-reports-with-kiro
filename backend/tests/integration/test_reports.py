"""Integration tests for reports endpoints using httpx.AsyncClient with ASGITransport.

Tests cover:
- GET  /reports  success: seeded user + reports → 200, array shape, only owner's reports
- GET  /reports  unauthenticated → 401
- POST /reports  success: valid payload → 201, response shape, status=="Pending", owner_id matches
- POST /reports  empty title → 422
- POST /reports  non-positive amount (total_amount=0, total_amount=-5) → 422
- POST /reports  missing fields → 422
- POST /reports  reimbursable=true, no client → 422
- POST /reports  invalid client string → 422
- POST /reports  reimbursable=false, no client → 201

Requirements: 1.1, 2.1, 3.1, 3.2, 3.4, 4.1, 5.3, 5.6, 7.1
"""

from datetime import datetime, timezone

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base, get_db
from app.main import app
from app.models.expense_report import ExpenseReport
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
        user = User(username="reportuser", hashed_password=hash_password("reportpass"), role_id=1)
        session.add(user)
        session.commit()
        session.refresh(user)
        return {"id": user.id, "username": "reportuser", "password": "reportpass"}
    finally:
        session.close()


@pytest.fixture()
async def seeded_reports(async_client, seeded_user):
    """Seed two reports for seeded_user and one for a second user."""
    now = datetime.now(timezone.utc)
    session = async_client._test_session_factory()  # type: ignore[attr-defined]
    try:
        other_user = User(username="otheruser", hashed_password=hash_password("otherpass"), role_id=1)
        session.add(other_user)
        session.flush()

        report1 = ExpenseReport(
            title="Q1 Travel",
            description="Client visit",
            total_amount=450.00,
            status="Pending",
            owner_id=seeded_user["id"],
            created_at=now,
            reimbursable_from_client=False,
        )
        report2 = ExpenseReport(
            title="Office Supplies",
            description="Stationery restock",
            total_amount=75.50,
            status="Pending",
            owner_id=seeded_user["id"],
            created_at=now,
            reimbursable_from_client=False,
        )
        other_report = ExpenseReport(
            title="Other User Report",
            description="Should not appear",
            total_amount=999.99,
            status="Pending",
            owner_id=other_user.id,
            created_at=now,
            reimbursable_from_client=False,
        )
        session.add_all([report1, report2, other_report])
        session.commit()
        session.refresh(report1)
        session.refresh(report2)

        return {
            "user": seeded_user,
            "reports": [
                {"title": report1.title, "description": report1.description, "total_amount": report1.total_amount},
                {"title": report2.title, "description": report2.description, "total_amount": report2.total_amount},
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
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.get("/reports")

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 2
    for report in body:
        assert report["owner_id"] == seeded_user["id"]
        assert "id" in report
        assert "title" in report
        assert "description" in report
        assert "total_amount" in report
        assert "status" in report
        assert "owner_username" in report
        assert "created_at" in report
        assert "reimbursable_from_client" in report
        assert "client" in report
        assert "admin_notes" in report
        assert "purpose" not in report


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
    titles = {r["title"] for r in response.json()}
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
# POST /reports — success cases
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_report_success_returns_201_and_response_shape(
    async_client, seeded_user
):
    """Valid payload → 201, correct ExpenseReportResponse shape including all new fields."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    payload = {
        "title": "Conference Trip",
        "description": "Annual tech conference",
        "total_amount": 1200.00,
        "reimbursable_from_client": True,
        "client": "Acme Corp",
    }
    response = await async_client.post("/reports", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == payload["title"]
    assert body["description"] == payload["description"]
    assert body["total_amount"] == payload["total_amount"]
    assert body["status"] == "In Progress"
    assert body["owner_id"] == seeded_user["id"]
    assert body["owner_username"] == seeded_user["username"]
    assert "created_at" in body
    assert body["reimbursable_from_client"] is True
    assert body["client"] == "Acme Corp"
    assert body["admin_notes"] is None
    assert "id" in body
    assert "purpose" not in body


@pytest.mark.asyncio
async def test_create_report_status_is_in_progress(async_client, seeded_user):
    """Newly created report always has status == 'In Progress'."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post(
        "/reports",
        json={"title": "Team Lunch", "total_amount": 250.00},
    )

    assert response.status_code == 201
    assert response.json()["status"] == "In Progress"


@pytest.mark.asyncio
async def test_create_report_owner_id_matches_authenticated_user(async_client, seeded_user):
    """Created report's owner_id must equal the authenticated user's id."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post(
        "/reports",
        json={"title": "Software License", "total_amount": 99.99},
    )

    assert response.status_code == 201
    assert response.json()["owner_id"] == seeded_user["id"]


@pytest.mark.asyncio
async def test_create_report_reimbursable_false_no_client_returns_201(async_client, seeded_user):
    """POST /reports with reimbursable_from_client=false and no client → 201."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post(
        "/reports",
        json={"title": "Office Supplies", "total_amount": 30.0, "reimbursable_from_client": False},
    )

    assert response.status_code == 201
    assert response.json()["client"] is None


# ---------------------------------------------------------------------------
# POST /reports — validation failures (422)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_report_unauthenticated_returns_401(async_client):
    """POST /reports without a session cookie → 401."""
    response = await async_client.post(
        "/reports",
        json={"title": "Some Report", "total_amount": 100.00},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_report_empty_title_returns_422(async_client, seeded_user):
    """Empty title → 422, no record created."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post(
        "/reports",
        json={"title": "", "total_amount": 100.00},
    )

    assert response.status_code == 422
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
        json={"title": "Valid Title", "total_amount": 0},
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
        json={"title": "Valid Title", "total_amount": -5},
    )

    assert response.status_code == 422
    list_response = await async_client.get("/reports")
    assert list_response.json() == []


@pytest.mark.asyncio
async def test_create_report_reimbursable_true_no_client_returns_422(async_client, seeded_user):
    """POST /reports with reimbursable_from_client=true and no client → 422."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post(
        "/reports",
        json={"title": "Client Trip", "total_amount": 500.0, "reimbursable_from_client": True},
    )

    assert response.status_code == 422
    list_response = await async_client.get("/reports")
    assert list_response.json() == []


@pytest.mark.asyncio
async def test_create_report_invalid_client_returns_422(async_client, seeded_user):
    """POST /reports with a client string not in CLIENTS → 422."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post(
        "/reports",
        json={
            "title": "Client Trip",
            "total_amount": 500.0,
            "reimbursable_from_client": True,
            "client": "Unknown Corp",
        },
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
        json={"total_amount": 100.00},
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
        json={"title": "Valid Title"},
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
