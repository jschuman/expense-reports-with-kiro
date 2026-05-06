"""Integration tests for expense line endpoints using httpx.AsyncClient + ASGITransport.

Tests cover:
  POST   /reports/{id}/lines  — create a line
  GET    /reports/{id}/lines  — list lines
  PUT    /reports/{id}/lines/{id}  — update a line
  DELETE /reports/{id}/lines/{id} — delete a line

Requirements: 2.4, 2.5, 2.6, 2.7, 3.4, 3.5, 3.6, 3.7, 4.3, 4.4, 4.5,
              5.1, 7.1–7.9, 8.1, 8.2, 8.3
"""

from datetime import datetime, timezone

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models as _models  # noqa: F401 — register all ORM models with Base
from app.db.database import Base, get_db
from app.main import app
from app.models.expense_report import ExpenseReport
from app.models.role import Role
from app.models.user import User
from app.services.auth_service import hash_password

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

VALID_LINE = {
    "description": "Taxi to airport",
    "amount": 45.50,
    "incurred_date": "2026-04-23",
}


@pytest.fixture()
async def async_client():
    """Yield an httpx.AsyncClient backed by a fresh in-memory SQLite DB."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine)

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
async def owner(async_client):
    """Seed a regular user (owner) and return credentials."""
    session = async_client._test_session_factory()
    try:
        user = User(username="owner", hashed_password=hash_password("ownerpass"), role_id=1)
        session.add(user)
        session.commit()
        session.refresh(user)
        return {"id": user.id, "username": "owner", "password": "ownerpass"}
    finally:
        session.close()


@pytest.fixture()
async def other_user(async_client):
    """Seed a second regular user (non-owner) and return credentials."""
    session = async_client._test_session_factory()
    try:
        user = User(username="other", hashed_password=hash_password("otherpass"), role_id=1)
        session.add(user)
        session.commit()
        session.refresh(user)
        return {"id": user.id, "username": "other", "password": "otherpass"}
    finally:
        session.close()


@pytest.fixture()
async def admin_user(async_client):
    """Seed an admin user and return credentials."""
    session = async_client._test_session_factory()
    try:
        user = User(username="admin", hashed_password=hash_password("adminpass"), role_id=2)
        session.add(user)
        session.commit()
        session.refresh(user)
        return {"id": user.id, "username": "admin", "password": "adminpass"}
    finally:
        session.close()


@pytest.fixture()
async def owner_report(async_client, owner):
    """Seed an 'In Progress' report owned by *owner* and return its id."""
    session = async_client._test_session_factory()
    try:
        report = ExpenseReport(
            title="Q1 Travel",
            description="Client visit",
            status="In Progress",
            owner_id=owner["id"],
            created_at=datetime.now(timezone.utc),
            reimbursable_from_client=False,
        )
        session.add(report)
        session.commit()
        session.refresh(report)
        return report.id
    finally:
        session.close()


@pytest.fixture()
async def submitted_report(async_client, owner):
    """Seed a 'Submitted' report owned by *owner* and return its id."""
    session = async_client._test_session_factory()
    try:
        report = ExpenseReport(
            title="Submitted Report",
            description="Locked",
            status="Submitted",
            owner_id=owner["id"],
            created_at=datetime.now(timezone.utc),
            reimbursable_from_client=False,
        )
        session.add(report)
        session.commit()
        session.refresh(report)
        return report.id
    finally:
        session.close()


@pytest.fixture()
async def scheduled_report(async_client, owner):
    """Seed a 'Scheduled for Payment' report owned by *owner* and return its id."""
    session = async_client._test_session_factory()
    try:
        report = ExpenseReport(
            title="Scheduled Report",
            description="Locked",
            status="Scheduled for Payment",
            owner_id=owner["id"],
            created_at=datetime.now(timezone.utc),
            reimbursable_from_client=False,
        )
        session.add(report)
        session.commit()
        session.refresh(report)
        return report.id
    finally:
        session.close()


async def _login(client, credentials):
    """Helper: log in and return the response."""
    return await client.post(
        "/auth/login",
        json={"username": credentials["username"], "password": credentials["password"]},
    )


async def _create_line(client, report_id, payload=None):
    """Helper: POST a line and return the response."""
    return await client.post(
        f"/reports/{report_id}/lines",
        json=payload or VALID_LINE,
    )


# ---------------------------------------------------------------------------
# POST /reports/{id}/lines
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_line_success_returns_201_and_response_shape(
    async_client, owner, owner_report
):
    """Valid payload → 201 with correct ExpenseLineResponse shape."""
    await _login(async_client, owner)

    response = await _create_line(async_client, owner_report)

    assert response.status_code == 201
    body = response.json()
    assert body["description"] == VALID_LINE["description"]
    assert body["amount"] == VALID_LINE["amount"]
    assert body["incurred_date"] == VALID_LINE["incurred_date"]
    assert body["report_id"] == owner_report
    assert "id" in body


@pytest.mark.asyncio
async def test_create_line_updates_total_amount_on_report(
    async_client, owner, owner_report
):
    """After creating a line, GET /reports shows updated total_amount. (Req 5.1)"""
    await _login(async_client, owner)

    await _create_line(async_client, owner_report, {"description": "Hotel", "amount": 200.0, "incurred_date": "2026-04-01"})
    await _create_line(async_client, owner_report, {"description": "Meals", "amount": 50.0, "incurred_date": "2026-04-02"})

    reports_resp = await async_client.get("/reports")
    assert reports_resp.status_code == 200
    report = next(r for r in reports_resp.json() if r["id"] == owner_report)
    assert report["total_amount"] == pytest.approx(250.0)


@pytest.mark.asyncio
async def test_create_line_unauthenticated_returns_401(async_client, owner_report):
    """POST /reports/{id}/lines without session → 401. (Req 7.9)"""
    response = await _create_line(async_client, owner_report)

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_line_non_owner_returns_403(
    async_client, other_user, owner_report
):
    """Non-owner attempting to create a line → 403. (Req 8.3)"""
    await _login(async_client, other_user)

    response = await _create_line(async_client, owner_report)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_create_line_submitted_report_returns_409(
    async_client, owner, submitted_report
):
    """Creating a line on a Submitted report → 409. (Req 3.7)"""
    await _login(async_client, owner)

    response = await _create_line(async_client, submitted_report)

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_create_line_scheduled_report_returns_409(
    async_client, owner, scheduled_report
):
    """Creating a line on a Scheduled for Payment report → 409. (Req 4.5)"""
    await _login(async_client, owner)

    response = await _create_line(async_client, scheduled_report)

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_create_line_missing_description_returns_422(
    async_client, owner, owner_report
):
    """Missing description → 422. (Req 2.5)"""
    await _login(async_client, owner)

    response = await _create_line(
        async_client, owner_report, {"amount": 10.0, "incurred_date": "2026-04-01"}
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_line_empty_description_returns_422(
    async_client, owner, owner_report
):
    """Empty description → 422. (Req 2.5)"""
    await _login(async_client, owner)

    response = await _create_line(
        async_client, owner_report, {"description": "", "amount": 10.0, "incurred_date": "2026-04-01"}
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_line_zero_amount_returns_422(
    async_client, owner, owner_report
):
    """amount=0 → 422. (Req 2.6)"""
    await _login(async_client, owner)

    response = await _create_line(
        async_client, owner_report, {"description": "Taxi", "amount": 0, "incurred_date": "2026-04-01"}
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_line_negative_amount_returns_422(
    async_client, owner, owner_report
):
    """Negative amount → 422. (Req 2.6)"""
    await _login(async_client, owner)

    response = await _create_line(
        async_client, owner_report, {"description": "Taxi", "amount": -5.0, "incurred_date": "2026-04-01"}
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_line_missing_date_returns_422(
    async_client, owner, owner_report
):
    """Missing incurred_date → 422. (Req 2.7)"""
    await _login(async_client, owner)

    response = await _create_line(
        async_client, owner_report, {"description": "Taxi", "amount": 10.0}
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_line_report_not_found_returns_404(async_client, owner):
    """Report id that doesn't exist → 404. (Req 7.6)"""
    await _login(async_client, owner)

    response = await _create_line(async_client, 99999)

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# GET /reports/{id}/lines
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_lines_owner_returns_200_and_list_shape(
    async_client, owner, owner_report
):
    """Owner can list lines; response is a list with correct shape. (Req 7.2)"""
    await _login(async_client, owner)
    await _create_line(async_client, owner_report)

    response = await async_client.get(f"/reports/{owner_report}/lines")

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 1
    line = body[0]
    assert "id" in line
    assert "report_id" in line
    assert "description" in line
    assert "amount" in line
    assert "incurred_date" in line


@pytest.mark.asyncio
async def test_list_lines_admin_can_read_any_report(
    async_client, admin_user, owner, owner_report
):
    """Admin can list lines for any report, not just their own. (Req 8.1)"""
    await _login(async_client, owner)
    await _create_line(async_client, owner_report)
    await async_client.post("/auth/logout")

    await _login(async_client, admin_user)
    response = await async_client.get(f"/reports/{owner_report}/lines")

    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_list_lines_empty_list_when_no_lines(
    async_client, owner, owner_report
):
    """Owner with no lines → 200 with empty list. (Req 1.3)"""
    await _login(async_client, owner)

    response = await async_client.get(f"/reports/{owner_report}/lines")

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_list_lines_unauthenticated_returns_401(async_client, owner_report):
    """GET /reports/{id}/lines without session → 401. (Req 7.9)"""
    response = await async_client.get(f"/reports/{owner_report}/lines")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_list_lines_non_owner_non_admin_returns_403(
    async_client, other_user, owner_report
):
    """Non-owner, non-admin user → 403. (Req 8.2)"""
    await _login(async_client, other_user)

    response = await async_client.get(f"/reports/{owner_report}/lines")

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_list_lines_report_not_found_returns_404(async_client, owner):
    """Report id that doesn't exist → 404. (Req 7.6)"""
    await _login(async_client, owner)

    response = await async_client.get("/reports/99999/lines")

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# PUT /reports/{id}/lines/{line_id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_line_success_returns_200_and_updated_fields(
    async_client, owner, owner_report
):
    """Full update → 200 with all updated fields. (Req 3.4)"""
    await _login(async_client, owner)
    create_resp = await _create_line(async_client, owner_report)
    line_id = create_resp.json()["id"]

    update_payload = {
        "description": "Updated description",
        "amount": 99.99,
        "incurred_date": "2026-05-01",
    }
    response = await async_client.put(
        f"/reports/{owner_report}/lines/{line_id}", json=update_payload
    )

    assert response.status_code == 200
    body = response.json()
    assert body["description"] == "Updated description"
    assert body["amount"] == pytest.approx(99.99)
    assert body["incurred_date"] == "2026-05-01"
    assert body["id"] == line_id


@pytest.mark.asyncio
async def test_update_line_updates_total_amount_on_report(
    async_client, owner, owner_report
):
    """After updating a line's amount, GET /reports shows updated total_amount. (Req 5.1)"""
    await _login(async_client, owner)
    create_resp = await _create_line(async_client, owner_report, {"description": "Hotel", "amount": 100.0, "incurred_date": "2026-04-01"})
    line_id = create_resp.json()["id"]

    await async_client.put(
        f"/reports/{owner_report}/lines/{line_id}",
        json={"amount": 150.0},
    )

    reports_resp = await async_client.get("/reports")
    report = next(r for r in reports_resp.json() if r["id"] == owner_report)
    assert report["total_amount"] == pytest.approx(150.0)


@pytest.mark.asyncio
async def test_update_line_partial_update_only_changes_provided_fields(
    async_client, owner, owner_report
):
    """Partial update (only description) → unchanged fields retain original values. (Req 3.4)"""
    await _login(async_client, owner)
    create_resp = await _create_line(async_client, owner_report)
    line_id = create_resp.json()["id"]
    original_amount = create_resp.json()["amount"]
    original_date = create_resp.json()["incurred_date"]

    response = await async_client.put(
        f"/reports/{owner_report}/lines/{line_id}",
        json={"description": "Partial update only"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["description"] == "Partial update only"
    assert body["amount"] == pytest.approx(original_amount)
    assert body["incurred_date"] == original_date


@pytest.mark.asyncio
async def test_update_line_unauthenticated_returns_401(
    async_client, owner, owner_report
):
    """PUT without session → 401. (Req 7.9)"""
    await _login(async_client, owner)
    create_resp = await _create_line(async_client, owner_report)
    line_id = create_resp.json()["id"]
    await async_client.post("/auth/logout")

    response = await async_client.put(
        f"/reports/{owner_report}/lines/{line_id}",
        json={"description": "Should fail"},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_update_line_non_owner_returns_403(
    async_client, owner, other_user, owner_report
):
    """Non-owner attempting to update a line → 403. (Req 3.6)"""
    await _login(async_client, owner)
    create_resp = await _create_line(async_client, owner_report)
    line_id = create_resp.json()["id"]
    await async_client.post("/auth/logout")

    await _login(async_client, other_user)
    response = await async_client.put(
        f"/reports/{owner_report}/lines/{line_id}",
        json={"description": "Hacked"},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_update_line_locked_status_returns_409(
    async_client, owner, submitted_report
):
    """Updating a line on a Submitted report → 409. (Req 3.7)"""
    # Directly seed a line on the submitted report via DB
    session = async_client._test_session_factory()
    try:
        from app.models.expense_line import ExpenseLine
        from datetime import date
        line = ExpenseLine(
            report_id=submitted_report,
            description="Existing line",
            amount=50.0,
            incurred_date=date(2026, 4, 1),
        )
        session.add(line)
        session.commit()
        session.refresh(line)
        line_id = line.id
    finally:
        session.close()

    await _login(async_client, owner)
    response = await async_client.put(
        f"/reports/{submitted_report}/lines/{line_id}",
        json={"description": "Updated"},
    )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_update_line_all_none_payload_returns_422(
    async_client, owner, owner_report
):
    """All-None update payload → 422 (model_validator rejects it). (Req 3.5)"""
    await _login(async_client, owner)
    create_resp = await _create_line(async_client, owner_report)
    line_id = create_resp.json()["id"]

    response = await async_client.put(
        f"/reports/{owner_report}/lines/{line_id}",
        json={"description": None, "amount": None, "incurred_date": None},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_update_line_report_not_found_returns_404(async_client, owner):
    """Report id that doesn't exist → 404. (Req 7.6)"""
    await _login(async_client, owner)

    response = await async_client.put(
        "/reports/99999/lines/1",
        json={"description": "Nope"},
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_line_line_not_found_returns_404(
    async_client, owner, owner_report
):
    """Line id that doesn't exist → 404. (Req 7.7)"""
    await _login(async_client, owner)

    response = await async_client.put(
        f"/reports/{owner_report}/lines/99999",
        json={"description": "Nope"},
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_line_belongs_to_different_report_returns_404(
    async_client, owner, owner_report
):
    """Line that belongs to a different report → 404. (Req 7.7)"""
    session = async_client._test_session_factory()
    try:
        # Create a second report
        other_report = ExpenseReport(
            title="Other Report",
            description="Other",
            status="In Progress",
            owner_id=owner["id"],
            created_at=datetime.now(timezone.utc),
            reimbursable_from_client=False,
        )
        session.add(other_report)
        session.commit()
        session.refresh(other_report)
        other_report_id = other_report.id
    finally:
        session.close()

    await _login(async_client, owner)
    # Create a line on the second report
    create_resp = await _create_line(async_client, other_report_id)
    line_id = create_resp.json()["id"]

    # Try to update it via the first report's URL
    response = await async_client.put(
        f"/reports/{owner_report}/lines/{line_id}",
        json={"description": "Wrong report"},
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /reports/{id}/lines/{line_id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_line_success_returns_204(
    async_client, owner, owner_report
):
    """Valid delete → 204 No Content. (Req 4.3)"""
    await _login(async_client, owner)
    create_resp = await _create_line(async_client, owner_report)
    line_id = create_resp.json()["id"]

    response = await async_client.delete(f"/reports/{owner_report}/lines/{line_id}")

    assert response.status_code == 204
    assert response.content == b""


@pytest.mark.asyncio
async def test_delete_line_line_absent_after_deletion(
    async_client, owner, owner_report
):
    """After delete, line no longer appears in GET /reports/{id}/lines. (Req 4.3)"""
    await _login(async_client, owner)
    create_resp = await _create_line(async_client, owner_report)
    line_id = create_resp.json()["id"]

    await async_client.delete(f"/reports/{owner_report}/lines/{line_id}")

    list_resp = await async_client.get(f"/reports/{owner_report}/lines")
    assert list_resp.status_code == 200
    ids = [line["id"] for line in list_resp.json()]
    assert line_id not in ids


@pytest.mark.asyncio
async def test_delete_line_updates_total_amount_on_report(
    async_client, owner, owner_report
):
    """After deleting a line, GET /reports shows updated total_amount. (Req 5.1)"""
    await _login(async_client, owner)
    create_resp = await _create_line(async_client, owner_report, {"description": "Hotel", "amount": 100.0, "incurred_date": "2026-04-01"})
    line_id = create_resp.json()["id"]

    await async_client.delete(f"/reports/{owner_report}/lines/{line_id}")

    reports_resp = await async_client.get("/reports")
    report = next(r for r in reports_resp.json() if r["id"] == owner_report)
    assert report["total_amount"] == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_delete_line_unauthenticated_returns_401(
    async_client, owner, owner_report
):
    """DELETE without session → 401. (Req 7.9)"""
    await _login(async_client, owner)
    create_resp = await _create_line(async_client, owner_report)
    line_id = create_resp.json()["id"]
    await async_client.post("/auth/logout")

    response = await async_client.delete(f"/reports/{owner_report}/lines/{line_id}")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_delete_line_non_owner_returns_403(
    async_client, owner, other_user, owner_report
):
    """Non-owner attempting to delete a line → 403. (Req 4.4)"""
    await _login(async_client, owner)
    create_resp = await _create_line(async_client, owner_report)
    line_id = create_resp.json()["id"]
    await async_client.post("/auth/logout")

    await _login(async_client, other_user)
    response = await async_client.delete(f"/reports/{owner_report}/lines/{line_id}")

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_delete_line_locked_status_returns_409(
    async_client, owner, submitted_report
):
    """Deleting a line on a Submitted report → 409. (Req 4.5)"""
    session = async_client._test_session_factory()
    try:
        from app.models.expense_line import ExpenseLine
        from datetime import date
        line = ExpenseLine(
            report_id=submitted_report,
            description="Existing line",
            amount=50.0,
            incurred_date=date(2026, 4, 1),
        )
        session.add(line)
        session.commit()
        session.refresh(line)
        line_id = line.id
    finally:
        session.close()

    await _login(async_client, owner)
    response = await async_client.delete(f"/reports/{submitted_report}/lines/{line_id}")

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_delete_line_not_found_returns_404(
    async_client, owner, owner_report
):
    """Line id that doesn't exist → 404. (Req 7.7)"""
    await _login(async_client, owner)

    response = await async_client.delete(f"/reports/{owner_report}/lines/99999")

    assert response.status_code == 404
