"""Unit tests for report_service.py.

Uses an in-memory SQLite database with a fresh schema per test so each
test is fully isolated.
"""

from datetime import date, datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base
from app.models.expense_line import ExpenseLine
from app.models.expense_report import ExpenseReport
from app.models.role import Role
from app.models.user import User
from app.schemas.expense_report import ExpenseReportCreate
from app.services import report_service
from app.services.auth_service import hash_password

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def db_session():
    """Provide a fresh in-memory SQLite session for each test."""
    import app.models  # noqa: F401 — register all ORM models with Base

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    # Seed roles for tests
    user_role = Role(id=1, name="User")
    admin_role = Role(id=2, name="Admin")
    session.add(user_role)
    session.add(admin_role)
    session.commit()
    
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def user_a(db_session):
    """Seed and return a User with username 'alice'."""
    user = User(username="alice", hashed_password=hash_password("pw"), role_id=1)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def user_b(db_session):
    """Seed and return a second User with username 'bob'."""
    user = User(username="bob", hashed_password=hash_password("pw"), role_id=1)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


# ---------------------------------------------------------------------------
# get_all_reports
# ---------------------------------------------------------------------------


def test_get_all_reports_returns_all_reports_in_database(db_session, user_a, user_b):
    """get_all_reports returns all expense reports regardless of owner."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    r1 = ExpenseReport(
        title="Alice Report 1",
        description="Travel",
        status="Pending",
        owner_id=user_a.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    r2 = ExpenseReport(
        title="Alice Report 2",
        description="Meals",
        status="Pending",
        owner_id=user_a.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    r3 = ExpenseReport(
        title="Bob Report 1",
        description="Supplies",
        status="Pending",
        owner_id=user_b.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    db_session.add_all([r1, r2, r3])
    db_session.commit()

    results = report_service.get_all_reports(db_session)

    assert len(results) == 3
    titles = {r.title for r in results}
    assert titles == {"Alice Report 1", "Alice Report 2", "Bob Report 1"}


def test_get_all_reports_returns_empty_list_when_no_reports(db_session):
    """get_all_reports returns an empty list when there are no reports in the database."""
    results = report_service.get_all_reports(db_session)

    assert results == []


def test_get_all_reports_orders_by_id_ascending(db_session, user_a):
    """get_all_reports returns reports ordered by id in ascending order."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    r1 = ExpenseReport(
        title="Report C",
        status="Pending",
        owner_id=user_a.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    r2 = ExpenseReport(
        title="Report A",
        status="Pending",
        owner_id=user_a.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    r3 = ExpenseReport(
        title="Report B",
        status="Pending",
        owner_id=user_a.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    db_session.add_all([r1, r2, r3])
    db_session.commit()

    results = report_service.get_all_reports(db_session)

    # Results should be ordered by id (which is insertion order in this case)
    assert len(results) == 3
    assert results[0].id < results[1].id < results[2].id
    assert [r.title for r in results] == ["Report C", "Report A", "Report B"]


def test_get_all_reports_eagerly_loads_owner_relationship(db_session, user_a):
    """get_all_reports eagerly loads the owner relationship so owner.username is accessible."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    r1 = ExpenseReport(
        title="Eager Load Test",
        status="Pending",
        owner_id=user_a.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    db_session.add(r1)
    db_session.commit()

    results = report_service.get_all_reports(db_session)

    assert len(results) == 1
    # owner relationship must be loaded — no lazy-load exception
    assert results[0].owner is not None
    assert results[0].owner.username == "alice"


# ---------------------------------------------------------------------------
# get_reports_for_user
# ---------------------------------------------------------------------------


def test_get_reports_for_user_returns_only_that_users_reports(db_session, user_a, user_b):
    """get_reports_for_user returns only reports whose owner_id matches user_id."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    r1 = ExpenseReport(
        title="Alice Report 1",
        description="Travel",
        status="Pending",
        owner_id=user_a.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    r2 = ExpenseReport(
        title="Alice Report 2",
        description="Meals",
        status="Pending",
        owner_id=user_a.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    r3 = ExpenseReport(
        title="Bob Report 1",
        description="Supplies",
        status="Pending",
        owner_id=user_b.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    db_session.add_all([r1, r2, r3])
    db_session.commit()

    results = report_service.get_reports_for_user(db_session, user_a.id)

    assert len(results) == 2
    owner_ids = {r.owner_id for r in results}
    assert owner_ids == {user_a.id}
    titles = {r.title for r in results}
    assert titles == {"Alice Report 1", "Alice Report 2"}


def test_get_reports_for_user_returns_empty_list_when_no_reports(db_session, user_a):
    """get_reports_for_user returns an empty list when the user has no reports."""
    results = report_service.get_reports_for_user(db_session, user_a.id)

    assert results == []


# ---------------------------------------------------------------------------
# create_report
# ---------------------------------------------------------------------------


def test_create_report_persists_with_in_progress_status_and_correct_owner(db_session, user_a):
    """create_report saves a record with status='In Progress' and the given owner_id."""
    data = ExpenseReportCreate(title="Q1 Travel")

    report = report_service.create_report(db_session, user_a.id, data)

    assert report.id is not None
    assert report.status == "In Progress"
    assert report.owner_id == user_a.id

    persisted = db_session.get(ExpenseReport, report.id)
    assert persisted is not None
    assert persisted.status == "In Progress"
    assert persisted.owner_id == user_a.id


def test_create_report_stores_fields_exactly_as_provided(db_session, user_a):
    """create_report stores title and description without modification."""
    data = ExpenseReportCreate(
        title="Conference Expenses",
        description="Annual tech conference",
    )

    report = report_service.create_report(db_session, user_a.id, data)

    assert report.title == "Conference Expenses"
    assert report.description == "Annual tech conference"


def test_create_report_sets_created_at_to_utc_datetime(db_session, user_a):
    """create_report sets created_at to a UTC datetime on creation."""
    before = datetime.now(timezone.utc)
    data = ExpenseReportCreate(title="Lunch")

    report = report_service.create_report(db_session, user_a.id, data)

    after = datetime.now(timezone.utc)
    # created_at should be between before and after
    # SQLite stores without timezone info, so compare naive
    created_naive = report.created_at.replace(tzinfo=None) if report.created_at.tzinfo else report.created_at
    before_naive = before.replace(tzinfo=None)
    after_naive = after.replace(tzinfo=None)
    assert before_naive <= created_naive <= after_naive


def test_create_report_admin_notes_is_none(db_session, user_a):
    """create_report always sets admin_notes to None — it is not user-settable."""
    data = ExpenseReportCreate(title="Misc")

    report = report_service.create_report(db_session, user_a.id, data)

    assert report.admin_notes is None


def test_create_report_reimbursable_defaults_to_false(db_session, user_a):
    """create_report stores reimbursable_from_client=False when not provided."""
    data = ExpenseReportCreate(title="Misc")

    report = report_service.create_report(db_session, user_a.id, data)

    assert report.reimbursable_from_client is False


def test_create_report_stores_reimbursable_and_client(db_session, user_a):
    """create_report persists reimbursable_from_client and client correctly."""
    data = ExpenseReportCreate(
        title="Client Trip",
        reimbursable_from_client=True,
        client="Acme Corp",
    )

    report = report_service.create_report(db_session, user_a.id, data)

    assert report.reimbursable_from_client is True
    assert report.client == "Acme Corp"


def test_create_report_purpose_field_does_not_exist(db_session, user_a):
    """The old 'purpose' field must not exist on the returned ORM object."""
    data = ExpenseReportCreate(title="Misc")

    report = report_service.create_report(db_session, user_a.id, data)

    assert not hasattr(report, "purpose")


def test_create_report_owner_username_accessible(db_session, user_a):
    """create_report eagerly loads the owner relationship so owner.username is accessible."""
    data = ExpenseReportCreate(title="Owner Check")

    report = report_service.create_report(db_session, user_a.id, data)

    # owner relationship must be loaded — no lazy-load exception
    assert report.owner is not None
    assert report.owner.username == "alice"


def test_get_reports_for_user_owner_username_accessible(db_session, user_a):
    """get_reports_for_user eagerly loads owner so owner.username is accessible."""
    data = ExpenseReportCreate(title="Eager Load Test")
    report_service.create_report(db_session, user_a.id, data)

    results = report_service.get_reports_for_user(db_session, user_a.id)

    assert len(results) == 1
    # owner relationship must be loaded — no lazy-load exception
    assert results[0].owner is not None
    assert results[0].owner.username == "alice"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_report(db_session, owner, status: str):
    """Create and persist an ExpenseReport with the given status."""
    from datetime import datetime, timezone

    report = ExpenseReport(
        title="Test Report",
        description="A test",
        status=status,
        owner_id=owner.id,
        created_at=datetime.now(timezone.utc),
        reimbursable_from_client=False,
    )
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)
    return report


# ---------------------------------------------------------------------------
# create_report — audit log
# ---------------------------------------------------------------------------


def test_create_report_writes_one_audit_entry(db_session, user_a):
    """create_report writes exactly one StatusAuditLog entry with status 'In Progress'."""
    from app.models.status_audit_log import StatusAuditLog

    data = ExpenseReportCreate(title="Audit Test")

    report = report_service.create_report(db_session, user_a.id, data)

    entries = (
        db_session.query(StatusAuditLog)
        .filter(StatusAuditLog.expense_report_id == report.id)
        .all()
    )
    assert len(entries) == 1
    assert entries[0].status == "In Progress"
    assert entries[0].expense_report_id == report.id
    assert entries[0].changed_at is not None


# ---------------------------------------------------------------------------
# update_report
# ---------------------------------------------------------------------------


def test_update_report_success_in_progress(db_session, user_a):
    """update_report applies changes when report is 'In Progress'."""
    from app.schemas.expense_report import ExpenseReportUpdate

    report = _make_report(db_session, user_a, "In Progress")

    data = ExpenseReportUpdate(title="Updated Title")
    updated = report_service.update_report(db_session, report.id, data, user_a)

    assert updated.title == "Updated Title"
    assert updated.status == "In Progress"


def test_update_report_success_rejected(db_session, user_a):
    """update_report applies changes when report is 'Rejected'."""
    from app.schemas.expense_report import ExpenseReportUpdate

    report = _make_report(db_session, user_a, "Rejected")

    data = ExpenseReportUpdate(title="Fixed Title")
    updated = report_service.update_report(db_session, report.id, data, user_a)

    assert updated.title == "Fixed Title"
    assert updated.status == "Rejected"


def test_update_report_raises_403_for_non_owner(db_session, user_a, user_b):
    """update_report raises 403 when the caller is not the report owner."""
    from fastapi import HTTPException

    from app.schemas.expense_report import ExpenseReportUpdate

    report = _make_report(db_session, user_a, "In Progress")

    data = ExpenseReportUpdate(title="Hacked")
    with pytest.raises(HTTPException) as exc_info:
        report_service.update_report(db_session, report.id, data, user_b)

    assert exc_info.value.status_code == 403


def test_update_report_raises_409_for_submitted(db_session, user_a):
    """update_report raises 409 when report is 'Submitted'."""
    from fastapi import HTTPException

    from app.schemas.expense_report import ExpenseReportUpdate

    report = _make_report(db_session, user_a, "Submitted")

    data = ExpenseReportUpdate(title="Attempt")
    with pytest.raises(HTTPException) as exc_info:
        report_service.update_report(db_session, report.id, data, user_a)

    assert exc_info.value.status_code == 409


def test_update_report_raises_409_for_scheduled_for_payment(db_session, user_a):
    """update_report raises 409 when report is 'Scheduled for Payment'."""
    from fastapi import HTTPException

    from app.schemas.expense_report import ExpenseReportUpdate

    report = _make_report(db_session, user_a, "Scheduled for Payment")

    data = ExpenseReportUpdate(title="Attempt")
    with pytest.raises(HTTPException) as exc_info:
        report_service.update_report(db_session, report.id, data, user_a)

    assert exc_info.value.status_code == 409


def test_update_report_only_applies_provided_fields(db_session, user_a):
    """update_report does not overwrite fields that are not included in the update."""
    from app.schemas.expense_report import ExpenseReportUpdate

    report = _make_report(db_session, user_a, "In Progress")

    data = ExpenseReportUpdate(title="New Title Only")
    updated = report_service.update_report(db_session, report.id, data, user_a)

    assert updated.title == "New Title Only"


def test_update_report_raises_404_for_missing_report(db_session, user_a):
    """update_report raises 404 when the report does not exist."""
    from fastapi import HTTPException

    from app.schemas.expense_report import ExpenseReportUpdate

    data = ExpenseReportUpdate(title="Ghost")
    with pytest.raises(HTTPException) as exc_info:
        report_service.update_report(db_session, 99999, data, user_a)

    assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# delete_report
# ---------------------------------------------------------------------------


def test_delete_report_success_in_progress(db_session, user_a):
    """delete_report removes the report when it is 'In Progress'."""
    report = _make_report(db_session, user_a, "In Progress")
    report_id = report.id

    report_service.delete_report(db_session, report_id, user_a)

    assert db_session.get(ExpenseReport, report_id) is None


def test_delete_report_success_rejected(db_session, user_a):
    """delete_report removes the report when it is 'Rejected'."""
    report = _make_report(db_session, user_a, "Rejected")
    report_id = report.id

    report_service.delete_report(db_session, report_id, user_a)

    assert db_session.get(ExpenseReport, report_id) is None


def test_delete_report_raises_403_for_non_owner(db_session, user_a, user_b):
    """delete_report raises 403 when the caller is not the report owner."""
    from fastapi import HTTPException

    report = _make_report(db_session, user_a, "In Progress")

    with pytest.raises(HTTPException) as exc_info:
        report_service.delete_report(db_session, report.id, user_b)

    assert exc_info.value.status_code == 403
    # Report must still exist
    assert db_session.get(ExpenseReport, report.id) is not None


def test_delete_report_raises_409_for_submitted(db_session, user_a):
    """delete_report raises 409 when report is 'Submitted'."""
    from fastapi import HTTPException

    report = _make_report(db_session, user_a, "Submitted")

    with pytest.raises(HTTPException) as exc_info:
        report_service.delete_report(db_session, report.id, user_a)

    assert exc_info.value.status_code == 409
    assert db_session.get(ExpenseReport, report.id) is not None


def test_delete_report_raises_409_for_scheduled_for_payment(db_session, user_a):
    """delete_report raises 409 when report is 'Scheduled for Payment'."""
    from fastapi import HTTPException

    report = _make_report(db_session, user_a, "Scheduled for Payment")

    with pytest.raises(HTTPException) as exc_info:
        report_service.delete_report(db_session, report.id, user_a)

    assert exc_info.value.status_code == 409
    assert db_session.get(ExpenseReport, report.id) is not None


def test_delete_report_raises_404_for_missing_report(db_session, user_a):
    """delete_report raises 404 when the report does not exist."""
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        report_service.delete_report(db_session, 99999, user_a)

    assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# _compute_total
# ---------------------------------------------------------------------------


def test_compute_total_returns_correct_sum_with_multiple_lines(db_session, user_a):
    """_compute_total returns the sum of all line amounts for the given report.

    Requirements: 5.1
    """
    report = _make_report(db_session, user_a, "In Progress")

    line1 = ExpenseLine(
        report_id=report.id,
        description="Taxi",
        amount=25.50,
        incurred_date=date(2026, 4, 1),
    )
    line2 = ExpenseLine(
        report_id=report.id,
        description="Lunch",
        amount=14.75,
        incurred_date=date(2026, 4, 2),
    )
    line3 = ExpenseLine(
        report_id=report.id,
        description="Hotel",
        amount=120.00,
        incurred_date=date(2026, 4, 3),
    )
    db_session.add_all([line1, line2, line3])
    db_session.commit()

    total = report_service._compute_total(db_session, report.id)

    assert total == pytest.approx(25.50 + 14.75 + 120.00)


def test_compute_total_returns_zero_when_report_has_no_lines(db_session, user_a):
    """_compute_total returns 0.0 when the report has zero expense lines.

    Requirements: 5.3
    """
    report = _make_report(db_session, user_a, "In Progress")

    total = report_service._compute_total(db_session, report.id)

    assert total == 0.0


# ---------------------------------------------------------------------------
# admin_update_report
# ---------------------------------------------------------------------------


def test_admin_update_report_success_in_progress(db_session, user_a):
    """admin_update_report applies changes when report is 'In Progress'.

    Requirements: 1.1, 1.4
    """
    from app.schemas.expense_report import AdminExpenseReportUpdate

    report = _make_report(db_session, user_a, "In Progress")

    data = AdminExpenseReportUpdate(title="Admin Updated")
    updated = report_service.admin_update_report(db_session, report.id, data)

    assert updated.title == "Admin Updated"
    assert updated.status == "In Progress"


def test_admin_update_report_success_submitted(db_session, user_a):
    """admin_update_report applies changes when report is 'Submitted'.

    Requirements: 1.1, 1.4
    """
    from app.schemas.expense_report import AdminExpenseReportUpdate

    report = _make_report(db_session, user_a, "Submitted")

    data = AdminExpenseReportUpdate(title="Admin Fixed")
    updated = report_service.admin_update_report(db_session, report.id, data)

    assert updated.title == "Admin Fixed"
    assert updated.status == "Submitted"


def test_admin_update_report_success_rejected(db_session, user_a):
    """admin_update_report applies changes when report is 'Rejected'.

    Requirements: 1.1, 1.4
    """
    from app.schemas.expense_report import AdminExpenseReportUpdate

    report = _make_report(db_session, user_a, "Rejected")

    data = AdminExpenseReportUpdate(title="Admin Corrected")
    updated = report_service.admin_update_report(db_session, report.id, data)

    assert updated.title == "Admin Corrected"
    assert updated.status == "Rejected"


def test_admin_update_report_success_scheduled_for_payment(db_session, user_a):
    """admin_update_report applies changes when report is 'Scheduled for Payment'.

    Requirements: 1.1, 1.4
    """
    from app.schemas.expense_report import AdminExpenseReportUpdate

    report = _make_report(db_session, user_a, "Scheduled for Payment")

    data = AdminExpenseReportUpdate(description="Updated by admin")
    updated = report_service.admin_update_report(db_session, report.id, data)

    assert updated.description == "Updated by admin"
    assert updated.status == "Scheduled for Payment"


def test_admin_update_report_does_not_change_status(db_session, user_a):
    """admin_update_report never changes the report's status.

    Requirements: 1.4
    """
    from app.schemas.expense_report import AdminExpenseReportUpdate

    report = _make_report(db_session, user_a, "Submitted")
    original_status = report.status

    data = AdminExpenseReportUpdate(title="New Title", description="New Desc")
    updated = report_service.admin_update_report(db_session, report.id, data)

    assert updated.status == original_status


def test_admin_update_report_partial_update_preserves_unprovided_fields(db_session, user_a):
    """admin_update_report only applies provided fields; unprovided fields keep their values.

    Requirements: 1.3, 6.4
    """
    from app.schemas.expense_report import AdminExpenseReportUpdate

    report = ExpenseReport(
        title="Original Title",
        description="Original Description",
        status="In Progress",
        owner_id=user_a.id,
        created_at=datetime.now(timezone.utc),
        reimbursable_from_client=True,
        client="Acme Corp",
        admin_notes="Original notes",
    )
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)

    # Only update title — all other fields should be preserved
    data = AdminExpenseReportUpdate(title="Updated Title")
    updated = report_service.admin_update_report(db_session, report.id, data)

    assert updated.title == "Updated Title"
    assert updated.description == "Original Description"
    assert updated.reimbursable_from_client is True
    assert updated.client == "Acme Corp"
    assert updated.admin_notes == "Original notes"


def test_admin_update_report_raises_404_for_nonexistent_report(db_session):
    """admin_update_report raises 404 when the report does not exist.

    Requirements: 1.7
    """
    from fastapi import HTTPException

    from app.schemas.expense_report import AdminExpenseReportUpdate

    data = AdminExpenseReportUpdate(title="Ghost")
    with pytest.raises(HTTPException) as exc_info:
        report_service.admin_update_report(db_session, 99999, data)

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Report not found"


def test_admin_update_report_updates_admin_notes(db_session, user_a):
    """admin_update_report persists admin_notes when provided.

    Requirements: 6.2
    """
    from app.schemas.expense_report import AdminExpenseReportUpdate

    report = _make_report(db_session, user_a, "Submitted")

    data = AdminExpenseReportUpdate(admin_notes="Please fix the amounts")
    updated = report_service.admin_update_report(db_session, report.id, data)

    assert updated.admin_notes == "Please fix the amounts"


def test_admin_update_report_clears_admin_notes_with_empty_string(db_session, user_a):
    """admin_update_report stores empty string when admin_notes is explicitly set to ''.

    Requirements: 6.3
    """
    from app.schemas.expense_report import AdminExpenseReportUpdate

    report = ExpenseReport(
        title="Report With Notes",
        status="In Progress",
        owner_id=user_a.id,
        created_at=datetime.now(timezone.utc),
        reimbursable_from_client=False,
        admin_notes="Some existing notes",
    )
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)

    data = AdminExpenseReportUpdate(admin_notes="")
    updated = report_service.admin_update_report(db_session, report.id, data)

    assert updated.admin_notes == ""


def test_admin_update_report_admin_notes_only_without_other_fields(db_session, user_a):
    """admin_update_report allows updating only admin_notes without modifying other fields.

    Requirements: 6.4
    """
    from app.schemas.expense_report import AdminExpenseReportUpdate

    report = ExpenseReport(
        title="Keep This Title",
        description="Keep This Description",
        status="Submitted",
        owner_id=user_a.id,
        created_at=datetime.now(timezone.utc),
        reimbursable_from_client=False,
    )
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)

    data = AdminExpenseReportUpdate(admin_notes="Admin feedback only")
    updated = report_service.admin_update_report(db_session, report.id, data)

    assert updated.admin_notes == "Admin feedback only"
    assert updated.title == "Keep This Title"
    assert updated.description == "Keep This Description"
    assert updated.reimbursable_from_client is False
