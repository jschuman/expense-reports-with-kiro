"""Property-based tests for role-based access control using hypothesis.

Feature: user-roles-and-logout

Properties:
  Property 2: Admin Report Visibility
  Property 3: User Report Filtering

Requirements: 2.1, 2.2, 2.3, 3.1, 5.3
"""

from datetime import datetime, timezone

import httpx
import pytest
from hypothesis import HealthCheck, given, settings, strategies as st
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
# Pre-computed password hash for test users
# ---------------------------------------------------------------------------

# Pre-compute a bcrypt hash once at module load time to avoid expensive hashing in tests.
# bcrypt with 12 rounds takes ~200-400ms per hash. With 100 examples per property test,
# this optimization reduces test execution time from ~5 minutes to ~30 seconds.
_TEST_PASSWORD_HASH = hash_password("test_password")


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

    # Seed roles
    session = TestSession()
    try:
        user_role = Role(id=1, name="User")
        admin_role = Role(id=2, name="Admin")
        session.add(user_role)
        session.add(admin_role)
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
    client = httpx.AsyncClient(transport=transport, base_url="http://test")
    client._test_session_factory = TestSession  # type: ignore[attr-defined]
    client._engine = engine  # type: ignore[attr-defined]
    return client


def cleanup_test_client(client):
    """Clean up test client resources."""
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=client._engine)  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Feature: user-roles-and-logout
# Property 2: Admin Report Visibility
# **Validates: Requirements 2.1, 2.2, 2.3**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    num_users=st.integers(min_value=2, max_value=10),
    reports_per_user=st.integers(min_value=1, max_value=5),
)
async def test_property_admin_sees_all_reports_with_owner_info(num_users, reports_per_user):
    """Property 2: Admin Report Visibility.

    # Feature: user-roles-and-logout, Property 2: Admin Report Visibility

    For any database state containing expense reports from multiple users, when an
    authenticated user with Admin role requests expense reports, the system SHALL return
    all expense reports in the database, and each returned report SHALL include the
    owner_username field.

    **Validates: Requirements 2.1, 2.2, 2.3**
    """
    async_client = create_test_client()
    now = datetime.now(timezone.utc)

    try:
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        users = []
        total_reports = 0

        try:
            # Create admin user
            admin = User(
                username="admin_user",
                hashed_password=_TEST_PASSWORD_HASH,
                role_id=2,  # Admin role
            )
            session.add(admin)
            session.flush()

            # Create regular users with reports
            for i in range(num_users):
                user = User(
                    username=f"user_{i}",
                    hashed_password=_TEST_PASSWORD_HASH,
                    role_id=1,  # User role
                )
                session.add(user)
                session.flush()

                for j in range(reports_per_user):
                    report = ExpenseReport(
                        title=f"Report {j} for user {i}",
                        description=f"Description {j}",
                        total_amount=100.0 + j,
                        status="Pending",
                        owner_id=user.id,
                        created_at=now,
                        reimbursable_from_client=False,
                    )
                    session.add(report)
                    total_reports += 1

                session.commit()
                session.refresh(user)
                users.append({"id": user.id, "username": user.username})
        finally:
            session.close()

        # Login as admin
        login_response = await async_client.post(
            "/auth/login",
            json={"username": "admin_user", "password": "test_password"},
        )
        assert login_response.status_code == 200

        # Get reports as admin
        response = await async_client.get("/reports")
        assert response.status_code == 200

        reports = response.json()

        # Admin should see ALL reports from ALL users
        assert len(reports) == total_reports, (
            f"Admin should see {total_reports} reports, got {len(reports)}"
        )

        # Each report should include owner_username field
        for report in reports:
            assert "owner_username" in report, (
                f"Report {report['id']} missing owner_username field"
            )
            assert report["owner_username"] is not None, (
                f"Report {report['id']} has null owner_username"
            )
            # Verify owner_username matches one of the created users
            assert any(
                report["owner_username"] == user["username"] for user in users
            ), f"Report owner_username '{report['owner_username']}' not in created users"

        # Verify reports from all users are present
        owner_ids_in_reports = {r["owner_id"] for r in reports}
        expected_owner_ids = {u["id"] for u in users}
        assert owner_ids_in_reports == expected_owner_ids, (
            f"Admin should see reports from all users. Expected {expected_owner_ids}, got {owner_ids_in_reports}"
        )
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


# ---------------------------------------------------------------------------
# Feature: user-roles-and-logout
# Property 3: User Report Filtering
# **Validates: Requirements 3.1, 5.3**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    num_other_users=st.integers(min_value=1, max_value=10),
    own_reports=st.integers(min_value=0, max_value=10),
    other_reports=st.integers(min_value=1, max_value=10),
)
async def test_property_user_sees_only_own_reports(num_other_users, own_reports, other_reports):
    """Property 3: User Report Filtering.

    # Feature: user-roles-and-logout, Property 3: User Report Filtering

    For any authenticated user with User role and any database state containing expense
    reports, when that user requests expense reports, the system SHALL return only
    reports where owner_id matches the authenticated user's id, and SHALL NOT return any
    reports with different owner_ids.

    **Validates: Requirements 3.1, 5.3**
    """
    async_client = create_test_client()
    now = datetime.now(timezone.utc)

    try:
        session = async_client._test_session_factory()  # type: ignore[attr-defined]

        try:
            # Create the test user (User role)
            test_user = User(
                username="test_user",
                hashed_password=_TEST_PASSWORD_HASH,
                role_id=1,  # User role
            )
            session.add(test_user)
            session.flush()

            # Create reports for test user
            for i in range(own_reports):
                report = ExpenseReport(
                    title=f"Test User Report {i}",
                    description=f"Own report {i}",
                    total_amount=100.0 + i,
                    status="Pending",
                    owner_id=test_user.id,
                    created_at=now,
                    reimbursable_from_client=False,
                )
                session.add(report)

            # Create other users with reports
            for i in range(num_other_users):
                other_user = User(
                    username=f"other_user_{i}",
                    hashed_password=_TEST_PASSWORD_HASH,
                    role_id=1,  # User role
                )
                session.add(other_user)
                session.flush()

                for j in range(other_reports):
                    report = ExpenseReport(
                        title=f"Other User {i} Report {j}",
                        description=f"Other report {j}",
                        total_amount=200.0 + j,
                        status="Pending",
                        owner_id=other_user.id,
                        created_at=now,
                        reimbursable_from_client=False,
                    )
                    session.add(report)

            session.commit()
            session.refresh(test_user)
            test_user_id = test_user.id
        finally:
            session.close()

        # Login as test user
        login_response = await async_client.post(
            "/auth/login",
            json={"username": "test_user", "password": "test_password"},
        )
        assert login_response.status_code == 200

        # Get reports as test user
        response = await async_client.get("/reports")
        assert response.status_code == 200

        reports = response.json()

        # User should see ONLY their own reports
        assert len(reports) == own_reports, (
            f"User should see {own_reports} reports, got {len(reports)}"
        )

        # All returned reports must belong to the test user
        for report in reports:
            assert report["owner_id"] == test_user_id, (
                f"User received report {report['id']} with owner_id {report['owner_id']}, "
                f"expected {test_user_id}"
            )

        # Verify no reports from other users are present
        if own_reports > 0:
            owner_ids_in_reports = {r["owner_id"] for r in reports}
            assert owner_ids_in_reports == {test_user_id}, (
                f"User should only see their own reports. Got owner_ids: {owner_ids_in_reports}"
            )
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)
