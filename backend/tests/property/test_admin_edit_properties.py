"""Property-based tests for admin edit and notes feature.

Feature: admin-edit-and-notes

Properties tested:
  Property 1: Admin update succeeds for any status without changing status
  Property 2: Admin partial update preserves unprovided fields
  Property 3: Admin update rejects invalid input without persisting changes
  Property 4: Non-admin update discards admin_notes from payload
  Property 7: Admin notes round-trip persistence
  Property 8: Non-owner regular user cannot update reports

Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 5.4, 6.2, 6.4, 7.3, 7.5
"""

from datetime import datetime, timezone

import httpx
import pytest
from hypothesis import HealthCheck, given, settings, strategies as st
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.constants import CLIENTS
from app.db.database import Base, get_db
from app.main import app
from app.models.expense_report import ExpenseReport
from app.models.role import Role
from app.models.user import User
from app.services.auth_service import hash_password


# ---------------------------------------------------------------------------
# Pre-computed password hash for test users
# ---------------------------------------------------------------------------

_TEST_PASSWORD_HASH = hash_password("test_password")

# Valid statuses for expense reports
VALID_STATUSES = ["In Progress", "Submitted", "Rejected", "Scheduled for Payment"]


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
    client = httpx.AsyncClient(transport=transport, base_url="http://test")
    client._test_session_factory = TestSession  # type: ignore[attr-defined]
    client._engine = engine  # type: ignore[attr-defined]
    return client


def cleanup_test_client(client):
    """Clean up test client resources."""
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=client._engine)  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Shared strategies
# ---------------------------------------------------------------------------

_valid_title_st = st.text(
    alphabet=st.characters(min_codepoint=33, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
    min_size=1,
    max_size=255,
)

_valid_description_st = st.one_of(
    st.none(),
    st.text(
        alphabet=st.characters(min_codepoint=32, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
        min_size=1,
        max_size=500,
    ),
)

_valid_admin_notes_st = st.one_of(
    st.none(),
    st.text(
        alphabet=st.characters(min_codepoint=32, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
        min_size=1,
        max_size=1000,
    ),
)

_valid_client_st = st.sampled_from(CLIENTS)

_valid_status_st = st.sampled_from(VALID_STATUSES)


# ---------------------------------------------------------------------------
# Property 1: Admin update succeeds for any status without changing status
# Feature: admin-edit-and-notes, Property 1: Admin update succeeds for any status without changing status
# **Validates: Requirements 1.1, 1.4**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=25, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    report_status=_valid_status_st,
    new_title=_valid_title_st,
)
async def test_property_admin_update_succeeds_for_any_status(report_status, new_title):
    """Property 1: Admin update succeeds for any status without changing status.

    Feature: admin-edit-and-notes, Property 1: Admin update succeeds for any status without changing status

    For any expense report in any valid status (In Progress, Submitted, Rejected,
    Scheduled for Payment), when an Admin submits a valid update, the update SHALL
    succeed and the report's status SHALL remain unchanged.

    **Validates: Requirements 1.1, 1.4**
    """
    async_client = create_test_client()
    now = datetime.now(timezone.utc)

    try:
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            # Create admin user
            admin = User(username="admin_user", hashed_password=_TEST_PASSWORD_HASH, role_id=2)
            session.add(admin)
            # Create a regular user to own the report
            owner = User(username="report_owner", hashed_password=_TEST_PASSWORD_HASH, role_id=1)
            session.add(owner)
            session.flush()

            # Create a report with the given status
            report = ExpenseReport(
                title="Original Title",
                description="Original Description",
                status=report_status,
                owner_id=owner.id,
                created_at=now,
                reimbursable_from_client=False,
                admin_notes=None,
            )
            session.add(report)
            session.commit()
            session.refresh(report)
            report_id = report.id
        finally:
            session.close()

        # Login as admin
        login_resp = await async_client.post(
            "/auth/login",
            json={"username": "admin_user", "password": "test_password"},
        )
        assert login_resp.status_code == 200

        # Perform update
        update_resp = await async_client.put(
            f"/reports/{report_id}",
            json={"title": new_title},
        )
        assert update_resp.status_code == 200, (
            f"Expected 200 for admin update on status '{report_status}', "
            f"got {update_resp.status_code}: {update_resp.text}"
        )

        # Verify status unchanged
        updated_report = update_resp.json()
        assert updated_report["status"] == report_status, (
            f"Status changed from '{report_status}' to '{updated_report['status']}' after admin update"
        )
        # Verify the title was actually updated
        assert updated_report["title"] == new_title
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


# ---------------------------------------------------------------------------
# Property 2: Admin partial update preserves unprovided fields
# Feature: admin-edit-and-notes, Property 2: Admin partial update preserves unprovided fields
# **Validates: Requirements 1.3, 6.4**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=25, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    original_title=_valid_title_st,
    original_description=st.text(
        alphabet=st.characters(min_codepoint=32, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
        min_size=1,
        max_size=200,
    ),
    original_client=_valid_client_st,
    original_admin_notes=st.text(
        alphabet=st.characters(min_codepoint=32, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
        min_size=1,
        max_size=500,
    ),
    update_title=st.one_of(st.none(), _valid_title_st),
    update_admin_notes=st.one_of(
        st.none(),
        st.text(
            alphabet=st.characters(min_codepoint=32, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
            min_size=1,
            max_size=500,
        ),
    ),
)
async def test_property_admin_partial_update_preserves_unprovided_fields(
    original_title, original_description, original_client, original_admin_notes,
    update_title, update_admin_notes,
):
    """Property 2: Admin partial update preserves unprovided fields.

    Feature: admin-edit-and-notes, Property 2: Admin partial update preserves unprovided fields

    For any expense report and any admin update payload where some fields are omitted
    (None), the omitted fields SHALL retain their original values after the update is
    applied. Only explicitly provided fields SHALL be modified.

    **Validates: Requirements 1.3, 6.4**
    """
    async_client = create_test_client()
    now = datetime.now(timezone.utc)

    try:
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            admin = User(username="admin_user", hashed_password=_TEST_PASSWORD_HASH, role_id=2)
            session.add(admin)
            owner = User(username="report_owner", hashed_password=_TEST_PASSWORD_HASH, role_id=1)
            session.add(owner)
            session.flush()

            report = ExpenseReport(
                title=original_title,
                description=original_description,
                status="In Progress",
                owner_id=owner.id,
                created_at=now,
                reimbursable_from_client=True,
                client=original_client,
                admin_notes=original_admin_notes,
            )
            session.add(report)
            session.commit()
            session.refresh(report)
            report_id = report.id
        finally:
            session.close()

        # Login as admin
        login_resp = await async_client.post(
            "/auth/login",
            json={"username": "admin_user", "password": "test_password"},
        )
        assert login_resp.status_code == 200

        # Build partial update payload (only include non-None fields)
        payload = {}
        if update_title is not None:
            payload["title"] = update_title
        if update_admin_notes is not None:
            payload["admin_notes"] = update_admin_notes

        # If payload is empty, just send an empty object (no fields updated)
        update_resp = await async_client.put(
            f"/reports/{report_id}",
            json=payload,
        )
        assert update_resp.status_code == 200, (
            f"Expected 200, got {update_resp.status_code}: {update_resp.text}"
        )

        updated = update_resp.json()

        # Fields that were provided should be updated
        if update_title is not None:
            assert updated["title"] == update_title
        else:
            assert updated["title"] == original_title

        if update_admin_notes is not None:
            assert updated["admin_notes"] == update_admin_notes
        else:
            assert updated["admin_notes"] == original_admin_notes

        # Fields that were never in the payload should be preserved
        assert updated["description"] == original_description
        assert updated["reimbursable_from_client"] is True
        assert updated["client"] == original_client
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


# ---------------------------------------------------------------------------
# Property 3: Admin update rejects invalid input without persisting changes
# Feature: admin-edit-and-notes, Property 3: Admin update rejects invalid input without persisting changes
# **Validates: Requirements 1.5, 1.6**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=25, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    invalid_case=st.sampled_from(["empty_title", "long_title", "invalid_client"]),
)
async def test_property_admin_update_rejects_invalid_input(invalid_case):
    """Property 3: Admin update rejects invalid input without persisting changes.

    Feature: admin-edit-and-notes, Property 3: Admin update rejects invalid input without persisting changes

    For any admin update payload containing invalid field values (title empty or > 255
    characters, client not in CLIENTS list when reimbursable_from_client is true), the
    service SHALL return a validation error and the report SHALL remain unchanged in
    the database.

    **Validates: Requirements 1.5, 1.6**
    """
    async_client = create_test_client()
    now = datetime.now(timezone.utc)

    try:
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            admin = User(username="admin_user", hashed_password=_TEST_PASSWORD_HASH, role_id=2)
            session.add(admin)
            owner = User(username="report_owner", hashed_password=_TEST_PASSWORD_HASH, role_id=1)
            session.add(owner)
            session.flush()

            report = ExpenseReport(
                title="Original Title",
                description="Original Description",
                status="Submitted",
                owner_id=owner.id,
                created_at=now,
                reimbursable_from_client=False,
                admin_notes="Original Notes",
            )
            session.add(report)
            session.commit()
            session.refresh(report)
            report_id = report.id
        finally:
            session.close()

        # Login as admin
        login_resp = await async_client.post(
            "/auth/login",
            json={"username": "admin_user", "password": "test_password"},
        )
        assert login_resp.status_code == 200

        # Build invalid payload based on the case
        if invalid_case == "empty_title":
            payload = {"title": ""}
        elif invalid_case == "long_title":
            payload = {"title": "x" * 256}
        elif invalid_case == "invalid_client":
            payload = {"reimbursable_from_client": True, "client": "NonExistentCorp"}
        else:
            raise ValueError(f"Unknown invalid_case: {invalid_case}")

        update_resp = await async_client.put(
            f"/reports/{report_id}",
            json=payload,
        )
        assert update_resp.status_code == 422, (
            f"Expected 422 for invalid case '{invalid_case}', "
            f"got {update_resp.status_code}: {update_resp.text}"
        )

        # Verify the report is unchanged by fetching it
        get_resp = await async_client.get("/reports")
        assert get_resp.status_code == 200

        reports = get_resp.json()
        matching = [r for r in reports if r["id"] == report_id]
        assert len(matching) == 1

        unchanged = matching[0]
        assert unchanged["title"] == "Original Title"
        assert unchanged["description"] == "Original Description"
        assert unchanged["admin_notes"] == "Original Notes"
        assert unchanged["reimbursable_from_client"] is False
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


# ---------------------------------------------------------------------------
# Property 4: Non-admin update discards admin_notes from payload
# Feature: admin-edit-and-notes, Property 4: Non-admin update discards admin_notes from payload
# **Validates: Requirements 5.4, 7.5**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=25, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    new_title=_valid_title_st,
    submitted_admin_notes=st.text(
        alphabet=st.characters(min_codepoint=32, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
        min_size=1,
        max_size=500,
    ),
)
async def test_property_non_admin_update_discards_admin_notes(new_title, submitted_admin_notes):
    """Property 4: Non-admin update discards admin_notes from payload.

    Feature: admin-edit-and-notes, Property 4: Non-admin update discards admin_notes from payload

    For any update request from a User with User_Role that includes an admin_notes
    value, the service SHALL discard the admin_notes value and preserve the existing
    admin_notes on the report. All other valid fields in the payload SHALL be processed
    normally.

    **Validates: Requirements 5.4, 7.5**
    """
    async_client = create_test_client()
    now = datetime.now(timezone.utc)

    try:
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            # Create regular user who owns the report
            regular_user = User(username="regular_user", hashed_password=_TEST_PASSWORD_HASH, role_id=1)
            session.add(regular_user)
            session.flush()

            # Create a report owned by the regular user in editable status
            report = ExpenseReport(
                title="Original Title",
                description="Original Description",
                status="In Progress",
                owner_id=regular_user.id,
                created_at=now,
                reimbursable_from_client=False,
                admin_notes="Existing Admin Notes",
            )
            session.add(report)
            session.commit()
            session.refresh(report)
            report_id = report.id
        finally:
            session.close()

        # Login as regular user
        login_resp = await async_client.post(
            "/auth/login",
            json={"username": "regular_user", "password": "test_password"},
        )
        assert login_resp.status_code == 200

        # Submit update with admin_notes (should be discarded)
        payload = {
            "title": new_title,
            "admin_notes": submitted_admin_notes,
        }
        update_resp = await async_client.put(
            f"/reports/{report_id}",
            json=payload,
        )
        assert update_resp.status_code == 200, (
            f"Expected 200, got {update_resp.status_code}: {update_resp.text}"
        )

        updated = update_resp.json()

        # admin_notes should be preserved (not changed to submitted value)
        assert updated["admin_notes"] == "Existing Admin Notes", (
            f"admin_notes should be preserved as 'Existing Admin Notes', "
            f"got '{updated['admin_notes']}'"
        )

        # Other fields should be updated normally
        assert updated["title"] == new_title
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


# ---------------------------------------------------------------------------
# Property 7: Admin notes round-trip persistence
# Feature: admin-edit-and-notes, Property 7: Admin notes round-trip persistence
# **Validates: Requirements 6.2**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=25, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    admin_notes_value=st.text(
        alphabet=st.characters(min_codepoint=32, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
        min_size=1,
        max_size=1000,
    ),
)
async def test_property_admin_notes_round_trip_persistence(admin_notes_value):
    """Property 7: Admin notes round-trip persistence.

    Feature: admin-edit-and-notes, Property 7: Admin notes round-trip persistence

    For any valid admin_notes string (≤ 1000 characters), when an Admin updates a
    report's admin_notes field and the report is subsequently retrieved, the returned
    admin_notes value SHALL equal the value that was submitted.

    **Validates: Requirements 6.2**
    """
    async_client = create_test_client()
    now = datetime.now(timezone.utc)

    try:
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            admin = User(username="admin_user", hashed_password=_TEST_PASSWORD_HASH, role_id=2)
            session.add(admin)
            owner = User(username="report_owner", hashed_password=_TEST_PASSWORD_HASH, role_id=1)
            session.add(owner)
            session.flush()

            report = ExpenseReport(
                title="Test Report",
                description="Test Description",
                status="In Progress",
                owner_id=owner.id,
                created_at=now,
                reimbursable_from_client=False,
                admin_notes=None,
            )
            session.add(report)
            session.commit()
            session.refresh(report)
            report_id = report.id
        finally:
            session.close()

        # Login as admin
        login_resp = await async_client.post(
            "/auth/login",
            json={"username": "admin_user", "password": "test_password"},
        )
        assert login_resp.status_code == 200

        # Update admin_notes
        update_resp = await async_client.put(
            f"/reports/{report_id}",
            json={"admin_notes": admin_notes_value},
        )
        assert update_resp.status_code == 200, (
            f"Expected 200, got {update_resp.status_code}: {update_resp.text}"
        )

        # Verify the update response contains the correct value
        updated = update_resp.json()
        assert updated["admin_notes"] == admin_notes_value, (
            f"PUT response admin_notes mismatch: sent '{admin_notes_value}', "
            f"got '{updated['admin_notes']}'"
        )

        # Retrieve the report and verify round-trip
        get_resp = await async_client.get("/reports")
        assert get_resp.status_code == 200

        reports = get_resp.json()
        matching = [r for r in reports if r["id"] == report_id]
        assert len(matching) == 1

        retrieved = matching[0]
        assert retrieved["admin_notes"] == admin_notes_value, (
            f"GET round-trip admin_notes mismatch: sent '{admin_notes_value}', "
            f"got '{retrieved['admin_notes']}'"
        )
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


# ---------------------------------------------------------------------------
# Property 8: Non-owner regular user cannot update reports
# Feature: admin-edit-and-notes, Property 8: Non-owner regular user cannot update reports
# **Validates: Requirements 7.3**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=25, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    report_status=st.sampled_from(["In Progress", "Rejected"]),
    new_title=_valid_title_st,
)
async def test_property_non_owner_regular_user_cannot_update(report_status, new_title):
    """Property 8: Non-owner regular user cannot update reports.

    Feature: admin-edit-and-notes, Property 8: Non-owner regular user cannot update reports

    For any expense report not owned by the requesting User_Role user, an update
    attempt SHALL return a 403 Forbidden response regardless of the report's status
    (when the report is in an editable status).

    **Validates: Requirements 7.3**
    """
    async_client = create_test_client()
    now = datetime.now(timezone.utc)

    try:
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            # Create the report owner
            owner = User(username="report_owner", hashed_password=_TEST_PASSWORD_HASH, role_id=1)
            session.add(owner)
            # Create a different regular user who will attempt the update
            non_owner = User(username="non_owner_user", hashed_password=_TEST_PASSWORD_HASH, role_id=1)
            session.add(non_owner)
            session.flush()

            # Create a report owned by 'owner' in an editable status
            report = ExpenseReport(
                title="Owner's Report",
                description="Description",
                status=report_status,
                owner_id=owner.id,
                created_at=now,
                reimbursable_from_client=False,
                admin_notes=None,
            )
            session.add(report)
            session.commit()
            session.refresh(report)
            report_id = report.id
        finally:
            session.close()

        # Login as non-owner
        login_resp = await async_client.post(
            "/auth/login",
            json={"username": "non_owner_user", "password": "test_password"},
        )
        assert login_resp.status_code == 200

        # Attempt to update the report (should be forbidden)
        update_resp = await async_client.put(
            f"/reports/{report_id}",
            json={"title": new_title},
        )
        assert update_resp.status_code == 403, (
            f"Expected 403 for non-owner update on status '{report_status}', "
            f"got {update_resp.status_code}: {update_resp.text}"
        )

        # Verify the report is unchanged
        await async_client.post("/auth/logout")
        login_resp2 = await async_client.post(
            "/auth/login",
            json={"username": "report_owner", "password": "test_password"},
        )
        assert login_resp2.status_code == 200

        get_resp = await async_client.get("/reports")
        assert get_resp.status_code == 200

        reports = get_resp.json()
        matching = [r for r in reports if r["id"] == report_id]
        assert len(matching) == 1
        assert matching[0]["title"] == "Owner's Report", (
            f"Report title should be unchanged, got '{matching[0]['title']}'"
        )
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)
