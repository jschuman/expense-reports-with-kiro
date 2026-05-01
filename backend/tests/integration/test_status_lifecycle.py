"""Integration tests for status lifecycle endpoints.

Tests cover:
- POST /reports/{id}/submit   (6.6)
- POST /reports/{id}/accept   (6.7)
- POST /reports/{id}/reject   (6.8)
- PUT  /reports/{id}          (6.9)
- DELETE /reports/{id}        (6.10)

Requirements: 2.1, 2.2, 2.4, 2.5, 3.2, 3.3, 3.5, 3.6, 4.1, 4.2,
              5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6,
              7.1, 7.2, 7.5, 7.6, 8.1, 8.2
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
# Shared fixtures
# ---------------------------------------------------------------------------


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


def _seed_report(async_client, owner_id: int, status: str, title: str = "Test Report") -> int:
    """Insert a report directly into the DB and return its id."""
    session = async_client._test_session_factory()
    try:
        report = ExpenseReport(
            title=title,
            description="A description",
            total_amount=100.0,
            status=status,
            owner_id=owner_id,
            created_at=datetime.now(timezone.utc),
            reimbursable_from_client=False,
        )
        session.add(report)
        session.commit()
        session.refresh(report)
        return report.id
    finally:
        session.close()


async def _login(client, credentials: dict) -> None:
    """Log in the given user via the auth endpoint."""
    await client.post(
        "/auth/login",
        json={"username": credentials["username"], "password": credentials["password"]},
    )


# ---------------------------------------------------------------------------
# POST /reports/{id}/submit  (task 6.6)
# Requirements: 3.2, 3.3, 3.5, 3.6, 7.5
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_submit_in_progress_report_returns_200_and_submitted_status(
    async_client, owner
):
    """Owner submits an 'In Progress' report → 200, status becomes 'Submitted'."""
    report_id = _seed_report(async_client, owner["id"], "In Progress")
    await _login(async_client, owner)

    response = await async_client.post(f"/reports/{report_id}/submit")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "Submitted"
    assert body["id"] == report_id


@pytest.mark.asyncio
async def test_submit_rejected_report_returns_200_and_submitted_status(
    async_client, owner
):
    """Owner resubmits a 'Rejected' report → 200, status becomes 'Submitted'."""
    report_id = _seed_report(async_client, owner["id"], "Rejected")
    await _login(async_client, owner)

    response = await async_client.post(f"/reports/{report_id}/submit")

    assert response.status_code == 200
    assert response.json()["status"] == "Submitted"


@pytest.mark.asyncio
async def test_submit_by_non_owner_returns_403(async_client, owner, other_user):
    """Non-owner attempt to submit → 403."""
    report_id = _seed_report(async_client, owner["id"], "In Progress")
    await _login(async_client, other_user)

    response = await async_client.post(f"/reports/{report_id}/submit")

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_submit_already_submitted_report_returns_409(async_client, owner):
    """Submit on a 'Submitted' report → 409."""
    report_id = _seed_report(async_client, owner["id"], "Submitted")
    await _login(async_client, owner)

    response = await async_client.post(f"/reports/{report_id}/submit")

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_submit_scheduled_for_payment_report_returns_409(async_client, owner):
    """Submit on a 'Scheduled for Payment' report → 409."""
    report_id = _seed_report(async_client, owner["id"], "Scheduled for Payment")
    await _login(async_client, owner)

    response = await async_client.post(f"/reports/{report_id}/submit")

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_submit_nonexistent_report_returns_404(async_client, owner):
    """Submit on a non-existent report → 404."""
    await _login(async_client, owner)

    response = await async_client.post("/reports/99999/submit")

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /reports/{id}/accept  (task 6.7)
# Requirements: 5.2, 5.3, 5.4
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_accept_submitted_report_returns_200_and_scheduled_status(
    async_client, owner, admin_user
):
    """Admin accepts a 'Submitted' report → 200, status becomes 'Scheduled for Payment'."""
    report_id = _seed_report(async_client, owner["id"], "Submitted")
    await _login(async_client, admin_user)

    response = await async_client.post(f"/reports/{report_id}/accept")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "Scheduled for Payment"
    assert body["id"] == report_id


@pytest.mark.asyncio
async def test_accept_by_non_admin_returns_403(async_client, owner):
    """Non-admin attempt to accept → 403."""
    report_id = _seed_report(async_client, owner["id"], "Submitted")
    await _login(async_client, owner)

    response = await async_client.post(f"/reports/{report_id}/accept")

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_accept_in_progress_report_returns_409(async_client, owner, admin_user):
    """Admin attempts to accept an 'In Progress' report → 409."""
    report_id = _seed_report(async_client, owner["id"], "In Progress")
    await _login(async_client, admin_user)

    response = await async_client.post(f"/reports/{report_id}/accept")

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_accept_nonexistent_report_returns_404(async_client, admin_user):
    """Accept on a non-existent report → 404."""
    await _login(async_client, admin_user)

    response = await async_client.post("/reports/99999/accept")

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /reports/{id}/reject  (task 6.8)
# Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reject_submitted_report_returns_200_and_rejected_status(
    async_client, owner, admin_user
):
    """Admin rejects a 'Submitted' report with valid admin_notes → 200, status 'Rejected', notes persisted."""
    report_id = _seed_report(async_client, owner["id"], "Submitted")
    await _login(async_client, admin_user)

    response = await async_client.post(
        f"/reports/{report_id}/reject",
        json={"admin_notes": "Missing receipts"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "Rejected"
    assert body["admin_notes"] == "Missing receipts"
    assert body["id"] == report_id


@pytest.mark.asyncio
async def test_reject_by_non_admin_returns_403(async_client, owner):
    """Non-admin attempt to reject → 403."""
    report_id = _seed_report(async_client, owner["id"], "Submitted")
    await _login(async_client, owner)

    response = await async_client.post(
        f"/reports/{report_id}/reject",
        json={"admin_notes": "Some reason"},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_reject_in_progress_report_returns_409(async_client, owner, admin_user):
    """Admin attempts to reject an 'In Progress' report → 409."""
    report_id = _seed_report(async_client, owner["id"], "In Progress")
    await _login(async_client, admin_user)

    response = await async_client.post(
        f"/reports/{report_id}/reject",
        json={"admin_notes": "Some reason"},
    )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_reject_with_empty_admin_notes_returns_422(async_client, owner, admin_user):
    """Reject with empty admin_notes → 422, status unchanged."""
    report_id = _seed_report(async_client, owner["id"], "Submitted")
    await _login(async_client, admin_user)

    response = await async_client.post(
        f"/reports/{report_id}/reject",
        json={"admin_notes": ""},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_reject_with_missing_admin_notes_returns_422(async_client, owner, admin_user):
    """Reject with missing admin_notes field → 422."""
    report_id = _seed_report(async_client, owner["id"], "Submitted")
    await _login(async_client, admin_user)

    response = await async_client.post(
        f"/reports/{report_id}/reject",
        json={},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_reject_nonexistent_report_returns_404(async_client, admin_user):
    """Reject on a non-existent report → 404."""
    await _login(async_client, admin_user)

    response = await async_client.post(
        "/reports/99999/reject",
        json={"admin_notes": "Some reason"},
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# PUT /reports/{id}  (task 6.9)
# Requirements: 2.1, 2.4, 4.1, 7.1, 7.6, 8.1
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_in_progress_report_returns_200(async_client, owner):
    """Owner updates an 'In Progress' report → 200, fields updated."""
    report_id = _seed_report(async_client, owner["id"], "In Progress")
    await _login(async_client, owner)

    response = await async_client.put(
        f"/reports/{report_id}",
        json={"title": "Updated Title", "total_amount": 250.0},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Updated Title"
    assert body["total_amount"] == 250.0


@pytest.mark.asyncio
async def test_update_rejected_report_returns_200(async_client, owner):
    """Owner updates a 'Rejected' report → 200, fields updated."""
    report_id = _seed_report(async_client, owner["id"], "Rejected")
    await _login(async_client, owner)

    response = await async_client.put(
        f"/reports/{report_id}",
        json={"title": "Corrected Title"},
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Corrected Title"


@pytest.mark.asyncio
async def test_update_by_non_owner_returns_403(async_client, owner, other_user):
    """Non-owner attempt to update → 403."""
    report_id = _seed_report(async_client, owner["id"], "In Progress")
    await _login(async_client, other_user)

    response = await async_client.put(
        f"/reports/{report_id}",
        json={"title": "Hijacked"},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_update_submitted_report_returns_409(async_client, owner):
    """Update on a 'Submitted' report → 409."""
    report_id = _seed_report(async_client, owner["id"], "Submitted")
    await _login(async_client, owner)

    response = await async_client.put(
        f"/reports/{report_id}",
        json={"title": "New Title"},
    )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_update_scheduled_for_payment_report_returns_409(async_client, owner):
    """Update on a 'Scheduled for Payment' report → 409."""
    report_id = _seed_report(async_client, owner["id"], "Scheduled for Payment")
    await _login(async_client, owner)

    response = await async_client.put(
        f"/reports/{report_id}",
        json={"title": "New Title"},
    )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_update_with_zero_total_amount_returns_422(async_client, owner):
    """Update with total_amount <= 0 → 422."""
    report_id = _seed_report(async_client, owner["id"], "In Progress")
    await _login(async_client, owner)

    response = await async_client.put(
        f"/reports/{report_id}",
        json={"total_amount": 0},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_update_nonexistent_report_returns_404(async_client, owner):
    """Update on a non-existent report → 404."""
    await _login(async_client, owner)

    response = await async_client.put(
        "/reports/99999",
        json={"title": "New Title"},
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /reports/{id}  (task 6.10)
# Requirements: 2.2, 2.5, 4.2, 7.2, 8.2
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_in_progress_report_returns_204(async_client, owner):
    """Owner deletes an 'In Progress' report → 204."""
    report_id = _seed_report(async_client, owner["id"], "In Progress")
    await _login(async_client, owner)

    response = await async_client.delete(f"/reports/{report_id}")

    assert response.status_code == 204


@pytest.mark.asyncio
async def test_delete_rejected_report_returns_204(async_client, owner):
    """Owner deletes a 'Rejected' report → 204."""
    report_id = _seed_report(async_client, owner["id"], "Rejected")
    await _login(async_client, owner)

    response = await async_client.delete(f"/reports/{report_id}")

    assert response.status_code == 204


@pytest.mark.asyncio
async def test_delete_by_non_owner_returns_403(async_client, owner, other_user):
    """Non-owner attempt to delete → 403."""
    report_id = _seed_report(async_client, owner["id"], "In Progress")
    await _login(async_client, other_user)

    response = await async_client.delete(f"/reports/{report_id}")

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_delete_submitted_report_returns_409(async_client, owner):
    """Delete on a 'Submitted' report → 409."""
    report_id = _seed_report(async_client, owner["id"], "Submitted")
    await _login(async_client, owner)

    response = await async_client.delete(f"/reports/{report_id}")

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_delete_scheduled_for_payment_report_returns_409(async_client, owner):
    """Delete on a 'Scheduled for Payment' report → 409."""
    report_id = _seed_report(async_client, owner["id"], "Scheduled for Payment")
    await _login(async_client, owner)

    response = await async_client.delete(f"/reports/{report_id}")

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_delete_nonexistent_report_returns_404(async_client, owner):
    """Delete on a non-existent report → 404."""
    await _login(async_client, owner)

    response = await async_client.delete("/reports/99999")

    assert response.status_code == 404
