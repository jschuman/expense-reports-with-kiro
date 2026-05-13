"""Integration tests for GET /reports/{report_id}/status-history endpoint.

Tests cover:
- GET /reports/{id}/status-history returns 200 with correct JSON shape for report owner
- GET /reports/{id}/status-history returns 200 for admin user (non-owner)
- GET /reports/{id}/status-history returns 401 for unauthenticated request
- GET /reports/{id}/status-history returns 403 for authenticated non-owner non-admin user
- GET /reports/{id}/status-history returns 404 for non-existent report ID
- GET /reports/{id}/status-history returns empty array for report with no audit entries
- GET /reports/{id}/status-history returns entries in chronological order

Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
"""

from datetime import datetime, timezone, timedelta

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
from app.models.status_audit_log import StatusAuditLog
from app.models.user import User
from app.services.auth_service import hash_password

# ---------------------------------------------------------------------------
# Fixtures
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
    """Seed a second regular user (non-owner, non-admin) and return credentials."""
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


def _seed_report(async_client, owner_id: int, status: str = "In Progress") -> int:
    """Insert a report directly into the DB and return its id."""
    session = async_client._test_session_factory()
    try:
        report = ExpenseReport(
            title="Test Report",
            description="A description",
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


def _seed_audit_entries(async_client, report_id: int, entries: list[dict]) -> list[int]:
    """Insert audit log entries for a report. Each entry is a dict with 'status' and 'changed_at'."""
    session = async_client._test_session_factory()
    try:
        ids = []
        for entry in entries:
            audit = StatusAuditLog(
                expense_report_id=report_id,
                status=entry["status"],
                changed_at=entry["changed_at"],
            )
            session.add(audit)
            session.flush()
            ids.append(audit.id)
        session.commit()
        return ids
    finally:
        session.close()


async def _login(client, credentials: dict) -> None:
    """Log in the given user via the auth endpoint."""
    await client.post(
        "/auth/login",
        json={"username": credentials["username"], "password": credentials["password"]},
    )


# ---------------------------------------------------------------------------
# GET /reports/{id}/status-history — success cases
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_status_history_owner_returns_200_with_correct_shape(
    async_client, owner
):
    """Report owner gets 200 with correct JSON array shape."""
    report_id = _seed_report(async_client, owner["id"])
    now = datetime.now(timezone.utc)
    _seed_audit_entries(async_client, report_id, [
        {"status": "In Progress", "changed_at": now},
        {"status": "Submitted", "changed_at": now + timedelta(hours=1)},
    ])
    await _login(async_client, owner)

    response = await async_client.get(f"/reports/{report_id}/status-history")

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 2
    for entry in body:
        assert "id" in entry
        assert "expense_report_id" in entry
        assert entry["expense_report_id"] == report_id
        assert "status" in entry
        assert "changed_at" in entry
        assert isinstance(entry["id"], int)
        assert isinstance(entry["status"], str)
        assert isinstance(entry["changed_at"], str)


@pytest.mark.asyncio
async def test_status_history_admin_non_owner_returns_200(
    async_client, owner, admin_user
):
    """Admin user (non-owner) gets 200 with all entries."""
    report_id = _seed_report(async_client, owner["id"])
    now = datetime.now(timezone.utc)
    _seed_audit_entries(async_client, report_id, [
        {"status": "In Progress", "changed_at": now},
        {"status": "Submitted", "changed_at": now + timedelta(hours=1)},
    ])
    await _login(async_client, admin_user)

    response = await async_client.get(f"/reports/{report_id}/status-history")

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 2


# ---------------------------------------------------------------------------
# GET /reports/{id}/status-history — error cases
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_status_history_unauthenticated_returns_401(async_client, owner):
    """Unauthenticated request returns 401."""
    report_id = _seed_report(async_client, owner["id"])

    response = await async_client.get(f"/reports/{report_id}/status-history")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_status_history_non_owner_non_admin_returns_403(
    async_client, owner, other_user
):
    """Authenticated non-owner non-admin user gets 403."""
    report_id = _seed_report(async_client, owner["id"])
    _seed_audit_entries(async_client, report_id, [
        {"status": "In Progress", "changed_at": datetime.now(timezone.utc)},
    ])
    await _login(async_client, other_user)

    response = await async_client.get(f"/reports/{report_id}/status-history")

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_status_history_nonexistent_report_returns_404(async_client, owner):
    """Request for non-existent report ID returns 404."""
    await _login(async_client, owner)

    response = await async_client.get("/reports/99999/status-history")

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# GET /reports/{id}/status-history — edge cases
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_status_history_empty_array_for_no_entries(async_client, owner):
    """Report with no audit entries returns empty array."""
    report_id = _seed_report(async_client, owner["id"])
    await _login(async_client, owner)

    response = await async_client.get(f"/reports/{report_id}/status-history")

    assert response.status_code == 200
    body = response.json()
    assert body == []


@pytest.mark.asyncio
async def test_status_history_entries_in_chronological_order(async_client, owner):
    """Entries are returned ordered by changed_at from earliest to latest."""
    report_id = _seed_report(async_client, owner["id"])
    base_time = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

    # Insert in reverse chronological order to verify the endpoint sorts correctly
    _seed_audit_entries(async_client, report_id, [
        {"status": "Scheduled for Payment", "changed_at": base_time + timedelta(hours=3)},
        {"status": "In Progress", "changed_at": base_time},
        {"status": "Submitted", "changed_at": base_time + timedelta(hours=1)},
    ])
    await _login(async_client, owner)

    response = await async_client.get(f"/reports/{report_id}/status-history")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 3
    assert body[0]["status"] == "In Progress"
    assert body[1]["status"] == "Submitted"
    assert body[2]["status"] == "Scheduled for Payment"

    # Verify changed_at values are in non-decreasing order
    timestamps = [entry["changed_at"] for entry in body]
    assert timestamps == sorted(timestamps)
