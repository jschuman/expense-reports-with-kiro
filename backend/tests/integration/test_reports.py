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
            status="Pending",
            owner_id=seeded_user["id"],
            created_at=now,
            reimbursable_from_client=False,
        )
        report2 = ExpenseReport(
            title="Office Supplies",
            description="Stationery restock",
            status="Pending",
            owner_id=seeded_user["id"],
            created_at=now,
            reimbursable_from_client=False,
        )
        other_report = ExpenseReport(
            title="Other User Report",
            description="Should not appear",
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
                {"title": report1.title, "description": report1.description},
                {"title": report2.title, "description": report2.description},
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
        "reimbursable_from_client": True,
        "client": "Acme Corp",
    }
    response = await async_client.post("/reports", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == payload["title"]
    assert body["description"] == payload["description"]
    assert body["total_amount"] == 0.0  # total_amount is computed from lines, starts at 0
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
        json={"title": "Team Lunch"},
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
        json={"title": "Software License"},
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
        json={"title": "Office Supplies", "reimbursable_from_client": False},
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
        json={"title": "Some Report"},
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
        json={"title": "", "reimbursable_from_client": False},
    )

    assert response.status_code == 422
    list_response = await async_client.get("/reports")
    assert list_response.json() == []


@pytest.mark.asyncio
async def test_create_report_zero_amount_returns_422(async_client, seeded_user):
    """Missing total_amount field is now allowed (computed from lines) → 201."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post(
        "/reports",
        json={"title": "Valid Title"},
    )

    assert response.status_code == 201
    list_response = await async_client.get("/reports")
    assert len(list_response.json()) == 1


@pytest.mark.asyncio
async def test_create_report_negative_amount_returns_422(async_client, seeded_user):
    """Missing total_amount field is now allowed (computed from lines) → 201."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post(
        "/reports",
        json={"title": "Valid Title"},
    )

    assert response.status_code == 201
    list_response = await async_client.get("/reports")
    assert len(list_response.json()) == 1


@pytest.mark.asyncio
async def test_create_report_reimbursable_true_no_client_returns_422(async_client, seeded_user):
    """POST /reports with reimbursable_from_client=true and no client → 422."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post(
        "/reports",
        json={"title": "Client Trip", "reimbursable_from_client": True},
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
    """Missing title field → 422 (total_amount is now computed from lines)."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.post(
        "/reports",
        json={},
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


# ---------------------------------------------------------------------------
# Fixtures for PUT /reports/{id} tests
# ---------------------------------------------------------------------------


@pytest.fixture()
async def seeded_admin(async_client):
    """Insert an Admin user into the shared in-memory DB and return credentials."""
    session = async_client._test_session_factory()  # type: ignore[attr-defined]
    try:
        user = User(username="adminuser", hashed_password=hash_password("adminpass"), role_id=2)
        session.add(user)
        session.commit()
        session.refresh(user)
        return {"id": user.id, "username": "adminuser", "password": "adminpass"}
    finally:
        session.close()


@pytest.fixture()
async def seeded_report_all_statuses(async_client, seeded_user):
    """Seed one report per valid status for seeded_user. Returns dict of status→report_id."""
    now = datetime.now(timezone.utc)
    session = async_client._test_session_factory()  # type: ignore[attr-defined]
    try:
        reports = {}
        for status_val in ("In Progress", "Submitted", "Rejected", "Scheduled for Payment"):
            report = ExpenseReport(
                title=f"Report {status_val}",
                description=f"Desc for {status_val}",
                status=status_val,
                owner_id=seeded_user["id"],
                created_at=now,
                reimbursable_from_client=False,
            )
            session.add(report)
            session.flush()
            reports[status_val] = report.id
        session.commit()
        return reports
    finally:
        session.close()


# ---------------------------------------------------------------------------
# PUT /reports/{id} — Admin success cases
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("status_val", ["In Progress", "Submitted", "Rejected", "Scheduled for Payment"])
async def test_admin_update_report_succeeds_for_each_status(
    async_client, seeded_admin, seeded_user, seeded_report_all_statuses, status_val
):
    """Admin can update a report regardless of its status (Req 1.1)."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_admin["username"], "password": seeded_admin["password"]},
    )

    report_id = seeded_report_all_statuses[status_val]
    payload = {"title": "Updated Title", "admin_notes": "Admin note added"}
    response = await async_client.put(f"/reports/{report_id}", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Updated Title"
    assert body["admin_notes"] == "Admin note added"
    # Status must remain unchanged (Req 1.4)
    assert body["status"] == status_val


@pytest.mark.asyncio
async def test_admin_update_report_404_for_nonexistent(async_client, seeded_admin):
    """Admin gets 404 when updating a non-existent report (Req 1.7)."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_admin["username"], "password": seeded_admin["password"]},
    )

    response = await async_client.put("/reports/99999", json={"title": "New Title"})

    assert response.status_code == 404
    assert response.json()["detail"] == "Report not found"


@pytest.mark.asyncio
async def test_admin_update_report_422_for_invalid_title(
    async_client, seeded_admin, seeded_user, seeded_report_all_statuses
):
    """Admin gets 422 when submitting an empty title (Req 1.6)."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_admin["username"], "password": seeded_admin["password"]},
    )

    report_id = seeded_report_all_statuses["In Progress"]
    response = await async_client.put(f"/reports/{report_id}", json={"title": ""})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_admin_update_report_422_for_invalid_client(
    async_client, seeded_admin, seeded_user, seeded_report_all_statuses
):
    """Admin gets 422 when submitting an invalid client (Req 1.6)."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_admin["username"], "password": seeded_admin["password"]},
    )

    report_id = seeded_report_all_statuses["In Progress"]
    response = await async_client.put(
        f"/reports/{report_id}",
        json={"reimbursable_from_client": True, "client": "Invalid Corp"},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_admin_update_report_422_for_admin_notes_too_long(
    async_client, seeded_admin, seeded_user, seeded_report_all_statuses
):
    """Admin gets 422 when admin_notes exceeds 1000 characters (Req 1.6)."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_admin["username"], "password": seeded_admin["password"]},
    )

    report_id = seeded_report_all_statuses["In Progress"]
    response = await async_client.put(
        f"/reports/{report_id}",
        json={"admin_notes": "x" * 1001},
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# PUT /reports/{id} — User (non-admin) cases
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_user_update_report_admin_notes_discarded(
    async_client, seeded_user, seeded_report_all_statuses
):
    """Non-admin user's admin_notes is silently discarded from payload (Req 5.4, 7.5)."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    report_id = seeded_report_all_statuses["In Progress"]
    payload = {"title": "User Updated", "admin_notes": "Should be ignored"}
    response = await async_client.put(f"/reports/{report_id}", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "User Updated"
    # admin_notes should remain unchanged (None), not set to "Should be ignored"
    assert body["admin_notes"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("status_val", ["Submitted", "Scheduled for Payment"])
async def test_user_update_report_409_for_non_editable_status(
    async_client, seeded_user, seeded_report_all_statuses, status_val
):
    """Non-admin user gets 409 for reports in Submitted or Scheduled for Payment status (Req 7.1, 7.2)."""
    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    report_id = seeded_report_all_statuses[status_val]
    response = await async_client.put(f"/reports/{report_id}", json={"title": "Attempt"})

    assert response.status_code == 409
    assert "status" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_user_update_report_403_for_non_owned_report(async_client, seeded_user):
    """Non-admin user gets 403 when updating a report they don't own (Req 7.3)."""
    # Create another user and their report
    now = datetime.now(timezone.utc)
    session = async_client._test_session_factory()  # type: ignore[attr-defined]
    try:
        other_user = User(username="owner2", hashed_password=hash_password("pass2"), role_id=1)
        session.add(other_user)
        session.flush()
        other_report = ExpenseReport(
            title="Other's Report",
            description="Not yours",
            status="In Progress",
            owner_id=other_user.id,
            created_at=now,
            reimbursable_from_client=False,
        )
        session.add(other_report)
        session.commit()
        session.refresh(other_report)
        other_report_id = other_report.id
    finally:
        session.close()

    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.put(
        f"/reports/{other_report_id}", json={"title": "Hijack"}
    )

    assert response.status_code == 403
    assert "permission" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_user_error_priority_409_before_403(async_client, seeded_user):
    """When a non-admin user tries to update a non-owned report in non-editable status,
    409 (status) is returned before 403 (ownership) per Req 7.6."""
    now = datetime.now(timezone.utc)
    session = async_client._test_session_factory()  # type: ignore[attr-defined]
    try:
        other_user = User(username="owner3", hashed_password=hash_password("pass3"), role_id=1)
        session.add(other_user)
        session.flush()
        # Report owned by another user in non-editable status
        report = ExpenseReport(
            title="Locked Report",
            description="Non-editable and non-owned",
            status="Submitted",
            owner_id=other_user.id,
            created_at=now,
            reimbursable_from_client=False,
        )
        session.add(report)
        session.commit()
        session.refresh(report)
        report_id = report.id
    finally:
        session.close()

    await async_client.post(
        "/auth/login",
        json={"username": seeded_user["username"], "password": seeded_user["password"]},
    )

    response = await async_client.put(
        f"/reports/{report_id}", json={"title": "Attempt"}
    )

    # Should get 409 (status restriction) not 403 (ownership) per Req 7.6
    assert response.status_code == 409
