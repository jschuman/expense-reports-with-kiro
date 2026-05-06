"""Integration tests for role-based report access using httpx.AsyncClient.

Tests cover end-to-end scenarios for the GET /reports endpoint:
- Admin login → GET /reports → receives all reports from all users
- User login → GET /reports → receives only own reports
- Reports include owner_username for admin users
- User cannot see other users' reports

Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 5.2, 5.3
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
    """Yield an httpx.AsyncClient backed by a fresh in-memory SQLite DB with roles seeded."""
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
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        client._test_session_factory = TestSession  # type: ignore[attr-defined]
        yield client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
async def seeded_users(async_client):
    """Seed an admin user, two regular users, and reports for each regular user.

    Returns a dict with credentials and report metadata.
    """
    now = datetime.now(timezone.utc)
    session = async_client._test_session_factory()  # type: ignore[attr-defined]
    try:
        admin = User(
            username="admin",
            hashed_password=hash_password("adminpass"),
            role_id=2,
        )
        user1 = User(
            username="user1",
            hashed_password=hash_password("user1pass"),
            role_id=1,
        )
        user2 = User(
            username="user2",
            hashed_password=hash_password("user2pass"),
            role_id=1,
        )
        session.add_all([admin, user1, user2])
        session.flush()

        report1 = ExpenseReport(
            title="User1 Report A",
            description="Travel",
            status="Pending",
            owner_id=user1.id,
            created_at=now,
            reimbursable_from_client=False,
        )
        report2 = ExpenseReport(
            title="User1 Report B",
            description="Meals",
            status="Pending",
            owner_id=user1.id,
            created_at=now,
            reimbursable_from_client=False,
        )
        report3 = ExpenseReport(
            title="User2 Report A",
            description="Supplies",
            status="Pending",
            owner_id=user2.id,
            created_at=now,
            reimbursable_from_client=False,
        )
        session.add_all([report1, report2, report3])
        session.commit()

        return {
            "admin": {"id": admin.id, "username": "admin", "password": "adminpass"},
            "user1": {"id": user1.id, "username": "user1", "password": "user1pass"},
            "user2": {"id": user2.id, "username": "user2", "password": "user2pass"},
            "total_reports": 3,
            "user1_report_count": 2,
            "user2_report_count": 1,
        }
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Admin role: GET /reports
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_login_then_get_reports_returns_all_reports(async_client, seeded_users):
    """Admin login → GET /reports → receives all reports from all users.

    Requirements: 2.1
    """
    login_response = await async_client.post(
        "/auth/login",
        json={
            "username": seeded_users["admin"]["username"],
            "password": seeded_users["admin"]["password"],
        },
    )
    assert login_response.status_code == 200

    response = await async_client.get("/reports")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == seeded_users["total_reports"]


@pytest.mark.asyncio
async def test_admin_get_reports_includes_owner_username(async_client, seeded_users):
    """Admin GET /reports includes owner_username for every report.

    Requirements: 2.2, 2.3
    """
    await async_client.post(
        "/auth/login",
        json={
            "username": seeded_users["admin"]["username"],
            "password": seeded_users["admin"]["password"],
        },
    )

    response = await async_client.get("/reports")

    assert response.status_code == 200
    body = response.json()
    for report in body:
        assert "owner_username" in report
        assert report["owner_username"] is not None
        assert report["owner_username"] in {"user1", "user2"}


@pytest.mark.asyncio
async def test_admin_get_reports_shows_reports_from_all_users(async_client, seeded_users):
    """Admin GET /reports returns reports from every user in the system.

    Requirements: 2.1, 2.3
    """
    await async_client.post(
        "/auth/login",
        json={
            "username": seeded_users["admin"]["username"],
            "password": seeded_users["admin"]["password"],
        },
    )

    response = await async_client.get("/reports")

    assert response.status_code == 200
    body = response.json()
    owner_usernames = {r["owner_username"] for r in body}
    assert "user1" in owner_usernames
    assert "user2" in owner_usernames


@pytest.mark.asyncio
async def test_admin_get_reports_returns_correct_report_titles(async_client, seeded_users):
    """Admin GET /reports returns all expected report titles.

    Requirements: 2.1
    """
    await async_client.post(
        "/auth/login",
        json={
            "username": seeded_users["admin"]["username"],
            "password": seeded_users["admin"]["password"],
        },
    )

    response = await async_client.get("/reports")

    assert response.status_code == 200
    titles = {r["title"] for r in response.json()}
    assert titles == {"User1 Report A", "User1 Report B", "User2 Report A"}


# ---------------------------------------------------------------------------
# User role: GET /reports
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_user_login_then_get_reports_returns_only_own_reports(async_client, seeded_users):
    """User login → GET /reports → receives only own reports.

    Requirements: 3.1, 5.2
    """
    await async_client.post(
        "/auth/login",
        json={
            "username": seeded_users["user1"]["username"],
            "password": seeded_users["user1"]["password"],
        },
    )

    response = await async_client.get("/reports")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == seeded_users["user1_report_count"]
    for report in body:
        assert report["owner_id"] == seeded_users["user1"]["id"]


@pytest.mark.asyncio
async def test_user_cannot_see_other_users_reports(async_client, seeded_users):
    """User GET /reports must not include reports from other users.

    Requirements: 3.2, 3.3, 5.3
    """
    await async_client.post(
        "/auth/login",
        json={
            "username": seeded_users["user1"]["username"],
            "password": seeded_users["user1"]["password"],
        },
    )

    response = await async_client.get("/reports")

    assert response.status_code == 200
    body = response.json()
    owner_ids = {r["owner_id"] for r in body}
    # Must only contain user1's id — user2's reports must not appear
    assert seeded_users["user2"]["id"] not in owner_ids
    assert owner_ids == {seeded_users["user1"]["id"]}


@pytest.mark.asyncio
async def test_user2_get_reports_returns_only_user2_reports(async_client, seeded_users):
    """User2 GET /reports returns only user2's reports, not user1's.

    Requirements: 3.1, 3.2
    """
    await async_client.post(
        "/auth/login",
        json={
            "username": seeded_users["user2"]["username"],
            "password": seeded_users["user2"]["password"],
        },
    )

    response = await async_client.get("/reports")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == seeded_users["user2_report_count"]
    for report in body:
        assert report["owner_id"] == seeded_users["user2"]["id"]
    titles = {r["title"] for r in body}
    assert "User1 Report A" not in titles
    assert "User1 Report B" not in titles


@pytest.mark.asyncio
async def test_user_get_reports_response_shape(async_client, seeded_users):
    """User GET /reports returns correct ExpenseReportResponse shape.

    Requirements: 3.1
    """
    await async_client.post(
        "/auth/login",
        json={
            "username": seeded_users["user1"]["username"],
            "password": seeded_users["user1"]["password"],
        },
    )

    response = await async_client.get("/reports")

    assert response.status_code == 200
    body = response.json()
    assert len(body) > 0
    for report in body:
        assert "id" in report
        assert "title" in report
        assert "description" in report
        assert "total_amount" in report
        assert "status" in report
        assert "owner_id" in report
        assert "owner_username" in report
        assert "created_at" in report
        assert "reimbursable_from_client" in report
        assert "client" in report
        assert "admin_notes" in report


@pytest.mark.asyncio
async def test_unauthenticated_get_reports_returns_401(async_client):
    """GET /reports without a session cookie → 401.

    Requirements: 5.2
    """
    response = await async_client.get("/reports")

    assert response.status_code == 401
