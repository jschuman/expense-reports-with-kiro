"""Unit tests for the reports router (GET /reports, POST /reports).

Uses FastAPI TestClient with:
- An in-memory SQLite database (overrides get_db dependency)
- get_current_user overridden to inject a known user (authenticated tests)
  or left as-is / removed to test unauthenticated behaviour
"""

from datetime import datetime, timezone

import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base, get_db
from app.dependencies import get_current_user
from app.main import app
from app.models.expense_report import ExpenseReport
from app.models.role import Role
from app.models.user import User
from app.services.auth_service import hash_password

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_engine_and_session():
    """Return a fresh in-memory SQLite engine + session factory with roles seeded."""
    import app.models  # noqa: F401 — register all ORM models with Base

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)

    # Seed roles required by the User model's NOT NULL role_id constraint
    session = Session()
    try:
        session.add(Role(id=1, name="User"))
        session.add(Role(id=2, name="Admin"))
        session.commit()
    finally:
        session.close()

    return engine, Session


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def auth_client():
    """TestClient with get_db overridden and get_current_user returning a seeded User-role user."""
    engine, TestSession = _make_engine_and_session()

    session = TestSession()
    user = User(username="alice", hashed_password=hash_password("pw"), role_id=1)
    session.add(user)
    session.commit()
    session.refresh(user)
    user_id = user.id
    session.close()

    def override_get_db():
        s = TestSession()
        try:
            yield s
        finally:
            s.close()

    def override_get_current_user(request: Request, db=None) -> User:
        s = TestSession()
        try:
            return s.get(User, user_id)
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    with TestClient(app, raise_server_exceptions=True) as c:
        c._test_session_factory = TestSession  # type: ignore[attr-defined]
        c._seeded_user_id = user_id  # type: ignore[attr-defined]
        yield c

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def admin_auth_client():
    """TestClient with get_db overridden and get_current_user returning a seeded Admin-role user."""
    engine, TestSession = _make_engine_and_session()

    session = TestSession()
    admin = User(username="admin", hashed_password=hash_password("pw"), role_id=2)
    session.add(admin)
    session.commit()
    session.refresh(admin)
    admin_id = admin.id
    session.close()

    def override_get_db():
        s = TestSession()
        try:
            yield s
        finally:
            s.close()

    def override_get_current_user(request: Request, db=None) -> User:
        s = TestSession()
        try:
            return s.get(User, admin_id)
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    with TestClient(app, raise_server_exceptions=True) as c:
        c._test_session_factory = TestSession  # type: ignore[attr-defined]
        c._seeded_admin_id = admin_id  # type: ignore[attr-defined]
        yield c

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def unauth_client():
    """TestClient with get_db overridden but NO get_current_user override."""
    engine, TestSession = _make_engine_and_session()

    def override_get_db():
        s = TestSession()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


# ---------------------------------------------------------------------------
# GET /reports — authenticated
# ---------------------------------------------------------------------------


def test_get_reports_returns_200_and_list_for_authenticated_user(auth_client):
    """GET /reports returns 200 and a list of ExpenseReportResponse for the current user."""
    now = datetime.now(timezone.utc)
    session = auth_client._test_session_factory()
    session.add_all([
        ExpenseReport(
            title="Trip A",
            description="Client",
            total_amount=100.0,
            status="Pending",
            owner_id=auth_client._seeded_user_id,
            created_at=now,
            reimbursable_from_client=False,
        ),
        ExpenseReport(
            title="Trip B",
            description="Conference",
            total_amount=200.0,
            status="Pending",
            owner_id=auth_client._seeded_user_id,
            created_at=now,
            reimbursable_from_client=False,
        ),
    ])
    session.commit()
    session.close()

    response = auth_client.get("/reports")

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 2
    for item in body:
        assert "id" in item
        assert "title" in item
        assert "description" in item
        assert "total_amount" in item
        assert "status" in item
        assert "owner_id" in item
        assert "owner_username" in item
        assert "created_at" in item
        assert "reimbursable_from_client" in item
        assert "client" in item
        assert "admin_notes" in item
        assert item["owner_id"] == auth_client._seeded_user_id
        assert "purpose" not in item


def test_get_reports_returns_empty_list_when_user_has_no_reports(auth_client):
    """GET /reports returns 200 and an empty list when the user has no reports."""
    response = auth_client.get("/reports")

    assert response.status_code == 200
    assert response.json() == []


# ---------------------------------------------------------------------------
# GET /reports — unauthenticated
# ---------------------------------------------------------------------------


def test_get_reports_returns_401_when_unauthenticated(unauth_client):
    """GET /reports returns 401 when no valid session cookie is present."""
    response = unauth_client.get("/reports")

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /reports — authenticated, valid payload
# ---------------------------------------------------------------------------


def test_post_reports_with_valid_payload_returns_201_and_response_shape(auth_client):
    """POST /reports with a valid payload returns 201 and correct ExpenseReportResponse."""
    payload = {
        "title": "Q1 Travel",
        "description": "Client visit",
        "total_amount": 450.00,
    }

    response = auth_client.post("/reports", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Q1 Travel"
    assert body["description"] == "Client visit"
    assert body["total_amount"] == pytest.approx(450.00)
    assert body["status"] == "Pending"
    assert body["owner_id"] == auth_client._seeded_user_id
    assert body["owner_username"] == "alice"
    assert "created_at" in body
    assert body["reimbursable_from_client"] is False
    assert body["client"] is None
    assert body["admin_notes"] is None
    assert "id" in body
    assert "purpose" not in body


def test_post_reports_status_is_always_pending(auth_client):
    """POST /reports always creates a report with status='Pending'."""
    payload = {"title": "Meals", "total_amount": 75.50}

    response = auth_client.post("/reports", json=payload)

    assert response.status_code == 201
    assert response.json()["status"] == "Pending"


def test_post_reports_with_reimbursable_true_and_valid_client_returns_201(auth_client):
    """POST /reports with reimbursable_from_client=true and a valid client returns 201."""
    payload = {
        "title": "Client Trip",
        "total_amount": 500.0,
        "reimbursable_from_client": True,
        "client": "Acme Corp",
    }

    response = auth_client.post("/reports", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["reimbursable_from_client"] is True
    assert body["client"] == "Acme Corp"


def test_post_reports_with_reimbursable_true_and_no_client_returns_422(auth_client):
    """POST /reports with reimbursable_from_client=true and no client returns 422."""
    payload = {
        "title": "Client Trip",
        "total_amount": 500.0,
        "reimbursable_from_client": True,
    }

    response = auth_client.post("/reports", json=payload)

    assert response.status_code == 422


def test_post_reports_with_invalid_client_returns_422(auth_client):
    """POST /reports with a client string not in CLIENTS returns 422."""
    payload = {
        "title": "Client Trip",
        "total_amount": 500.0,
        "reimbursable_from_client": True,
        "client": "Unknown Corp",
    }

    response = auth_client.post("/reports", json=payload)

    assert response.status_code == 422


def test_post_reports_with_reimbursable_false_and_no_client_returns_201(auth_client):
    """POST /reports with reimbursable_from_client=false and no client returns 201."""
    payload = {
        "title": "Office Supplies",
        "total_amount": 30.0,
        "reimbursable_from_client": False,
    }

    response = auth_client.post("/reports", json=payload)

    assert response.status_code == 201
    assert response.json()["client"] is None


# ---------------------------------------------------------------------------
# POST /reports — authenticated, invalid payloads (422)
# ---------------------------------------------------------------------------


def test_post_reports_with_empty_title_returns_422(auth_client):
    """POST /reports with an empty title returns 422."""
    payload = {"title": "", "total_amount": 100.0}

    response = auth_client.post("/reports", json=payload)

    assert response.status_code == 422


def test_post_reports_with_zero_total_amount_returns_422(auth_client):
    """POST /reports with total_amount=0 returns 422."""
    payload = {"title": "Valid Title", "total_amount": 0}

    response = auth_client.post("/reports", json=payload)

    assert response.status_code == 422


def test_post_reports_with_negative_total_amount_returns_422(auth_client):
    """POST /reports with a negative total_amount returns 422."""
    payload = {"title": "Valid Title", "total_amount": -10.0}

    response = auth_client.post("/reports", json=payload)

    assert response.status_code == 422


def test_post_reports_with_missing_fields_returns_422(auth_client):
    """POST /reports with missing required fields returns 422."""
    response = auth_client.post("/reports", json={})

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# POST /reports — unauthenticated
# ---------------------------------------------------------------------------


def test_post_reports_returns_401_when_unauthenticated(unauth_client):
    """POST /reports returns 401 when no valid session cookie is present."""
    payload = {"title": "Q1 Travel", "total_amount": 450.0}

    response = unauth_client.post("/reports", json=payload)

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /reports — role-based branching (Admin vs User)
# ---------------------------------------------------------------------------


def test_get_reports_admin_role_returns_all_reports(admin_auth_client):
    """GET /reports with Admin role returns all reports from all users.

    Requirements: 2.1, 5.1, 5.2
    """
    now = datetime.now(timezone.utc)
    session = admin_auth_client._test_session_factory()

    # Create a second user (User role) with reports
    other_user = User(username="bob", hashed_password=hash_password("pw"), role_id=1)
    session.add(other_user)
    session.flush()

    session.add_all([
        ExpenseReport(
            title="Admin Own Report",
            total_amount=100.0,
            status="Pending",
            owner_id=admin_auth_client._seeded_admin_id,
            created_at=now,
            reimbursable_from_client=False,
        ),
        ExpenseReport(
            title="Bob Report",
            total_amount=200.0,
            status="Pending",
            owner_id=other_user.id,
            created_at=now,
            reimbursable_from_client=False,
        ),
    ])
    session.commit()
    session.close()

    response = admin_auth_client.get("/reports")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    titles = {r["title"] for r in body}
    assert titles == {"Admin Own Report", "Bob Report"}


def test_get_reports_admin_role_includes_owner_username(admin_auth_client):
    """GET /reports with Admin role includes owner_username for each report.

    Requirements: 2.2
    """
    now = datetime.now(timezone.utc)
    session = admin_auth_client._test_session_factory()

    other_user = User(username="carol", hashed_password=hash_password("pw"), role_id=1)
    session.add(other_user)
    session.flush()

    session.add(
        ExpenseReport(
            title="Carol Report",
            total_amount=150.0,
            status="Pending",
            owner_id=other_user.id,
            created_at=now,
            reimbursable_from_client=False,
        )
    )
    session.commit()
    session.close()

    response = admin_auth_client.get("/reports")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["owner_username"] == "carol"


def test_get_reports_user_role_returns_only_own_reports(auth_client):
    """GET /reports with User role returns only reports owned by the authenticated user.

    Requirements: 3.1, 5.2, 5.3
    """
    now = datetime.now(timezone.utc)
    session = auth_client._test_session_factory()

    # Create a second user with their own report
    other_user = User(username="dave", hashed_password=hash_password("pw"), role_id=1)
    session.add(other_user)
    session.flush()

    session.add_all([
        ExpenseReport(
            title="Alice Report",
            total_amount=100.0,
            status="Pending",
            owner_id=auth_client._seeded_user_id,
            created_at=now,
            reimbursable_from_client=False,
        ),
        ExpenseReport(
            title="Dave Report",
            total_amount=200.0,
            status="Pending",
            owner_id=other_user.id,
            created_at=now,
            reimbursable_from_client=False,
        ),
    ])
    session.commit()
    session.close()

    response = auth_client.get("/reports")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["title"] == "Alice Report"
    assert body[0]["owner_id"] == auth_client._seeded_user_id


def test_get_reports_user_role_does_not_return_other_users_reports(auth_client):
    """GET /reports with User role must not include reports from other users.

    Requirements: 3.1, 5.3
    """
    now = datetime.now(timezone.utc)
    session = auth_client._test_session_factory()

    other_user = User(username="eve", hashed_password=hash_password("pw"), role_id=1)
    session.add(other_user)
    session.flush()

    session.add(
        ExpenseReport(
            title="Eve Secret Report",
            total_amount=999.0,
            status="Pending",
            owner_id=other_user.id,
            created_at=now,
            reimbursable_from_client=False,
        )
    )
    session.commit()
    session.close()

    response = auth_client.get("/reports")

    assert response.status_code == 200
    body = response.json()
    # User has no own reports — must not see Eve's report
    assert body == []


def test_get_reports_admin_role_returns_empty_list_when_no_reports(admin_auth_client):
    """GET /reports with Admin role returns empty list when no reports exist.

    Requirements: 2.1
    """
    response = admin_auth_client.get("/reports")

    assert response.status_code == 200
    assert response.json() == []


def test_get_reports_role_branching_calls_correct_service_for_admin(admin_auth_client):
    """GET /reports with Admin role calls get_all_reports (not get_reports_for_user).

    Verifies the branching logic by checking that reports from other users are visible.
    Requirements: 5.1, 5.2
    """
    now = datetime.now(timezone.utc)
    session = admin_auth_client._test_session_factory()

    # Create a user with a report — admin should see it
    other_user = User(username="frank", hashed_password=hash_password("pw"), role_id=1)
    session.add(other_user)
    session.flush()

    session.add(
        ExpenseReport(
            title="Frank Report",
            total_amount=300.0,
            status="Pending",
            owner_id=other_user.id,
            created_at=now,
            reimbursable_from_client=False,
        )
    )
    session.commit()
    session.close()

    response = admin_auth_client.get("/reports")

    assert response.status_code == 200
    body = response.json()
    # Admin sees Frank's report even though admin doesn't own it
    assert len(body) == 1
    assert body[0]["title"] == "Frank Report"
    assert body[0]["owner_username"] == "frank"
