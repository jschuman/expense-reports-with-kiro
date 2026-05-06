"""Unit tests for line_service.py.

Uses an in-memory SQLite database with a fresh schema per test so each
test is fully isolated.  Follows the same fixture pattern as
test_report_service.py.

Coverage:
- create_line: valid creation, 403 non-owner, 409 locked (Submitted /
  Scheduled for Payment), 404 missing report
- list_lines: owner access, admin access, non-owner non-admin 403, 404
  missing report
- update_line: valid full update, valid partial update, 403 non-owner,
  409 locked, 404 missing report, 404 line not on report
- delete_line: valid deletion, 403 non-owner, 409 locked, 404 missing line

Requirements: 1.2, 2.4, 3.4, 3.6, 3.7, 4.3, 4.4, 4.5, 8.1, 8.2, 8.3
"""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base
from app.models.expense_line import ExpenseLine
from app.models.expense_report import ExpenseReport
from app.models.role import Role
from app.models.user import User
from app.schemas.expense_line import ExpenseLineCreate, ExpenseLineUpdate
from app.services import line_service
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

    # Seed roles
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
    """Seed and return a regular User with username 'alice'."""
    user = User(username="alice", hashed_password=hash_password("pw"), role_id=1)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(user, attribute_names=["role"])
    return user


@pytest.fixture()
def user_b(db_session):
    """Seed and return a second regular User with username 'bob'."""
    user = User(username="bob", hashed_password=hash_password("pw"), role_id=1)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(user, attribute_names=["role"])
    return user


@pytest.fixture()
def admin_user(db_session):
    """Seed and return an Admin User with username 'admin'."""
    user = User(username="admin", hashed_password=hash_password("pw"), role_id=2)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(user, attribute_names=["role"])
    return user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_report(db_session, owner, status: str = "In Progress") -> ExpenseReport:
    """Create and persist an ExpenseReport with the given status."""
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


def _make_line(
    db_session,
    report: ExpenseReport,
    description: str = "Taxi",
    amount: float = 25.00,
    incurred_date: date = date(2026, 4, 1),
) -> ExpenseLine:
    """Create and persist an ExpenseLine on the given report."""
    line = ExpenseLine(
        report_id=report.id,
        description=description,
        amount=amount,
        incurred_date=incurred_date,
    )
    db_session.add(line)
    db_session.commit()
    db_session.refresh(line)
    return line


# ---------------------------------------------------------------------------
# create_line
# ---------------------------------------------------------------------------


def test_create_line_valid_creation_persists_line(db_session, user_a):
    """create_line persists the line and returns it with a populated id.

    Requirements: 1.2, 2.4
    """
    report = _make_report(db_session, user_a)
    data = ExpenseLineCreate(
        description="Taxi to airport",
        amount=45.50,
        incurred_date=date(2026, 4, 10),
    )

    line = line_service.create_line(db_session, report.id, data, user_a)

    assert line.id is not None
    assert line.report_id == report.id
    assert line.description == "Taxi to airport"
    assert line.amount == pytest.approx(45.50)
    assert line.incurred_date == date(2026, 4, 10)

    # Verify it is actually in the database
    persisted = db_session.get(ExpenseLine, line.id)
    assert persisted is not None
    assert persisted.description == "Taxi to airport"


def test_create_line_raises_403_for_non_owner(db_session, user_a, user_b):
    """create_line raises 403 when the caller is not the report owner.

    Requirements: 3.6, 8.3
    """
    report = _make_report(db_session, user_a)
    data = ExpenseLineCreate(
        description="Hotel",
        amount=120.00,
        incurred_date=date(2026, 4, 11),
    )

    with pytest.raises(HTTPException) as exc_info:
        line_service.create_line(db_session, report.id, data, user_b)

    assert exc_info.value.status_code == 403
    # No line should have been created
    count = db_session.query(ExpenseLine).filter_by(report_id=report.id).count()
    assert count == 0


def test_create_line_raises_409_for_submitted_report(db_session, user_a):
    """create_line raises 409 when the report status is 'Submitted'.

    Requirements: 3.7
    """
    report = _make_report(db_session, user_a, status="Submitted")
    data = ExpenseLineCreate(
        description="Lunch",
        amount=15.00,
        incurred_date=date(2026, 4, 12),
    )

    with pytest.raises(HTTPException) as exc_info:
        line_service.create_line(db_session, report.id, data, user_a)

    assert exc_info.value.status_code == 409
    assert "Submitted" in exc_info.value.detail


def test_create_line_raises_409_for_scheduled_for_payment_report(db_session, user_a):
    """create_line raises 409 when the report status is 'Scheduled for Payment'.

    Requirements: 3.7
    """
    report = _make_report(db_session, user_a, status="Scheduled for Payment")
    data = ExpenseLineCreate(
        description="Supplies",
        amount=30.00,
        incurred_date=date(2026, 4, 13),
    )

    with pytest.raises(HTTPException) as exc_info:
        line_service.create_line(db_session, report.id, data, user_a)

    assert exc_info.value.status_code == 409
    assert "Scheduled for Payment" in exc_info.value.detail


def test_create_line_raises_404_for_missing_report(db_session, user_a):
    """create_line raises 404 when the report does not exist.

    Requirements: 1.2
    """
    data = ExpenseLineCreate(
        description="Ghost line",
        amount=10.00,
        incurred_date=date(2026, 4, 14),
    )

    with pytest.raises(HTTPException) as exc_info:
        line_service.create_line(db_session, 99999, data, user_a)

    assert exc_info.value.status_code == 404


def test_create_line_allowed_for_rejected_report(db_session, user_a):
    """create_line succeeds when the report status is 'Rejected'.

    Requirements: 2.4
    """
    report = _make_report(db_session, user_a, status="Rejected")
    data = ExpenseLineCreate(
        description="Corrected expense",
        amount=50.00,
        incurred_date=date(2026, 4, 15),
    )

    line = line_service.create_line(db_session, report.id, data, user_a)

    assert line.id is not None
    assert line.report_id == report.id


# ---------------------------------------------------------------------------
# list_lines
# ---------------------------------------------------------------------------


def test_list_lines_owner_receives_lines(db_session, user_a):
    """list_lines returns all lines for the report when called by the owner.

    Requirements: 8.1
    """
    report = _make_report(db_session, user_a)
    line1 = _make_line(db_session, report, description="Taxi", amount=20.00)
    line2 = _make_line(db_session, report, description="Hotel", amount=100.00)

    result = line_service.list_lines(db_session, report.id, user_a)

    assert len(result) == 2
    ids = {l.id for l in result}
    assert ids == {line1.id, line2.id}


def test_list_lines_admin_receives_lines_for_any_report(db_session, user_a, admin_user):
    """list_lines returns lines when called by an Admin, regardless of ownership.

    Requirements: 8.1
    """
    report = _make_report(db_session, user_a)
    _make_line(db_session, report, description="Taxi", amount=20.00)

    result = line_service.list_lines(db_session, report.id, admin_user)

    assert len(result) == 1
    assert result[0].description == "Taxi"


def test_list_lines_non_owner_non_admin_receives_403(db_session, user_a, user_b):
    """list_lines raises 403 for a User who is not the owner and not Admin.

    Requirements: 8.2
    """
    report = _make_report(db_session, user_a)
    _make_line(db_session, report)

    with pytest.raises(HTTPException) as exc_info:
        line_service.list_lines(db_session, report.id, user_b)

    assert exc_info.value.status_code == 403


def test_list_lines_raises_404_for_missing_report(db_session, user_a):
    """list_lines raises 404 when the report does not exist."""
    with pytest.raises(HTTPException) as exc_info:
        line_service.list_lines(db_session, 99999, user_a)

    assert exc_info.value.status_code == 404


def test_list_lines_returns_empty_list_when_no_lines(db_session, user_a):
    """list_lines returns an empty list when the report has no lines."""
    report = _make_report(db_session, user_a)

    result = line_service.list_lines(db_session, report.id, user_a)

    assert result == []


def test_list_lines_ordered_by_id_ascending(db_session, user_a):
    """list_lines returns lines ordered by id in ascending order."""
    report = _make_report(db_session, user_a)
    line1 = _make_line(db_session, report, description="First", amount=10.00)
    line2 = _make_line(db_session, report, description="Second", amount=20.00)
    line3 = _make_line(db_session, report, description="Third", amount=30.00)

    result = line_service.list_lines(db_session, report.id, user_a)

    assert [l.id for l in result] == [line1.id, line2.id, line3.id]


# ---------------------------------------------------------------------------
# update_line
# ---------------------------------------------------------------------------


def test_update_line_valid_full_update(db_session, user_a):
    """update_line applies all provided fields and returns the updated line.

    Requirements: 3.4
    """
    report = _make_report(db_session, user_a)
    line = _make_line(
        db_session, report, description="Old desc", amount=10.00,
        incurred_date=date(2026, 1, 1),
    )
    data = ExpenseLineUpdate(
        description="New desc",
        amount=99.99,
        incurred_date=date(2026, 6, 15),
    )

    updated = line_service.update_line(db_session, report.id, line.id, data, user_a)

    assert updated.description == "New desc"
    assert updated.amount == pytest.approx(99.99)
    assert updated.incurred_date == date(2026, 6, 15)


def test_update_line_valid_partial_update_only_changes_provided_fields(db_session, user_a):
    """update_line only modifies fields that are explicitly provided.

    Requirements: 3.4
    """
    report = _make_report(db_session, user_a)
    line = _make_line(
        db_session, report, description="Original", amount=50.00,
        incurred_date=date(2026, 3, 10),
    )
    data = ExpenseLineUpdate(description="Updated description")

    updated = line_service.update_line(db_session, report.id, line.id, data, user_a)

    assert updated.description == "Updated description"
    # Unchanged fields retain original values
    assert updated.amount == pytest.approx(50.00)
    assert updated.incurred_date == date(2026, 3, 10)


def test_update_line_partial_update_amount_only(db_session, user_a):
    """update_line with only amount provided leaves description and date unchanged."""
    report = _make_report(db_session, user_a)
    line = _make_line(
        db_session, report, description="Taxi", amount=20.00,
        incurred_date=date(2026, 2, 5),
    )
    data = ExpenseLineUpdate(amount=35.00)

    updated = line_service.update_line(db_session, report.id, line.id, data, user_a)

    assert updated.amount == pytest.approx(35.00)
    assert updated.description == "Taxi"
    assert updated.incurred_date == date(2026, 2, 5)


def test_update_line_raises_403_for_non_owner(db_session, user_a, user_b):
    """update_line raises 403 when the caller is not the report owner.

    Requirements: 3.6, 8.3
    """
    report = _make_report(db_session, user_a)
    line = _make_line(db_session, report, description="Original", amount=10.00)
    data = ExpenseLineUpdate(description="Hacked")

    with pytest.raises(HTTPException) as exc_info:
        line_service.update_line(db_session, report.id, line.id, data, user_b)

    assert exc_info.value.status_code == 403
    # Line must be unchanged
    db_session.refresh(line)
    assert line.description == "Original"


def test_update_line_raises_409_for_submitted_report(db_session, user_a):
    """update_line raises 409 when the report status is 'Submitted'.

    Requirements: 3.7
    """
    report = _make_report(db_session, user_a, status="Submitted")
    line = _make_line(db_session, report, description="Locked", amount=10.00)
    data = ExpenseLineUpdate(description="Attempt")

    with pytest.raises(HTTPException) as exc_info:
        line_service.update_line(db_session, report.id, line.id, data, user_a)

    assert exc_info.value.status_code == 409
    assert "Submitted" in exc_info.value.detail


def test_update_line_raises_409_for_scheduled_for_payment_report(db_session, user_a):
    """update_line raises 409 when the report status is 'Scheduled for Payment'.

    Requirements: 3.7
    """
    report = _make_report(db_session, user_a, status="Scheduled for Payment")
    line = _make_line(db_session, report, description="Locked", amount=10.00)
    data = ExpenseLineUpdate(amount=99.00)

    with pytest.raises(HTTPException) as exc_info:
        line_service.update_line(db_session, report.id, line.id, data, user_a)

    assert exc_info.value.status_code == 409


def test_update_line_raises_404_for_missing_report(db_session, user_a):
    """update_line raises 404 when the report does not exist."""
    data = ExpenseLineUpdate(description="Ghost")

    with pytest.raises(HTTPException) as exc_info:
        line_service.update_line(db_session, 99999, 1, data, user_a)

    assert exc_info.value.status_code == 404


def test_update_line_raises_404_for_line_not_belonging_to_report(db_session, user_a):
    """update_line raises 404 when the line exists but belongs to a different report.

    Requirements: 3.4
    """
    report_a = _make_report(db_session, user_a)
    report_b = _make_report(db_session, user_a)
    line_on_b = _make_line(db_session, report_b, description="On B", amount=10.00)
    data = ExpenseLineUpdate(description="Attempt cross-report update")

    with pytest.raises(HTTPException) as exc_info:
        line_service.update_line(db_session, report_a.id, line_on_b.id, data, user_a)

    assert exc_info.value.status_code == 404


def test_update_line_raises_404_for_nonexistent_line(db_session, user_a):
    """update_line raises 404 when the line id does not exist at all."""
    report = _make_report(db_session, user_a)
    data = ExpenseLineUpdate(description="Ghost line")

    with pytest.raises(HTTPException) as exc_info:
        line_service.update_line(db_session, report.id, 99999, data, user_a)

    assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# delete_line
# ---------------------------------------------------------------------------


def test_delete_line_valid_deletion_removes_line(db_session, user_a):
    """delete_line permanently removes the line from the database.

    Requirements: 4.3
    """
    report = _make_report(db_session, user_a)
    line = _make_line(db_session, report, description="To delete", amount=10.00)
    line_id = line.id

    line_service.delete_line(db_session, report.id, line_id, user_a)

    assert db_session.get(ExpenseLine, line_id) is None


def test_delete_line_raises_403_for_non_owner(db_session, user_a, user_b):
    """delete_line raises 403 when the caller is not the report owner.

    Requirements: 4.4, 8.3
    """
    report = _make_report(db_session, user_a)
    line = _make_line(db_session, report, description="Protected", amount=10.00)

    with pytest.raises(HTTPException) as exc_info:
        line_service.delete_line(db_session, report.id, line.id, user_b)

    assert exc_info.value.status_code == 403
    # Line must still exist
    assert db_session.get(ExpenseLine, line.id) is not None


def test_delete_line_raises_409_for_submitted_report(db_session, user_a):
    """delete_line raises 409 when the report status is 'Submitted'.

    Requirements: 4.5
    """
    report = _make_report(db_session, user_a, status="Submitted")
    line = _make_line(db_session, report, description="Locked", amount=10.00)

    with pytest.raises(HTTPException) as exc_info:
        line_service.delete_line(db_session, report.id, line.id, user_a)

    assert exc_info.value.status_code == 409
    assert "Submitted" in exc_info.value.detail
    assert db_session.get(ExpenseLine, line.id) is not None


def test_delete_line_raises_409_for_scheduled_for_payment_report(db_session, user_a):
    """delete_line raises 409 when the report status is 'Scheduled for Payment'.

    Requirements: 4.5
    """
    report = _make_report(db_session, user_a, status="Scheduled for Payment")
    line = _make_line(db_session, report, description="Locked", amount=10.00)

    with pytest.raises(HTTPException) as exc_info:
        line_service.delete_line(db_session, report.id, line.id, user_a)

    assert exc_info.value.status_code == 409
    assert db_session.get(ExpenseLine, line.id) is not None


def test_delete_line_raises_404_for_missing_line(db_session, user_a):
    """delete_line raises 404 when the line does not exist.

    Requirements: 4.3
    """
    report = _make_report(db_session, user_a)

    with pytest.raises(HTTPException) as exc_info:
        line_service.delete_line(db_session, report.id, 99999, user_a)

    assert exc_info.value.status_code == 404


def test_delete_line_raises_404_for_line_on_different_report(db_session, user_a):
    """delete_line raises 404 when the line belongs to a different report."""
    report_a = _make_report(db_session, user_a)
    report_b = _make_report(db_session, user_a)
    line_on_b = _make_line(db_session, report_b, description="On B", amount=10.00)

    with pytest.raises(HTTPException) as exc_info:
        line_service.delete_line(db_session, report_a.id, line_on_b.id, user_a)

    assert exc_info.value.status_code == 404
    # Line on report B must still exist
    assert db_session.get(ExpenseLine, line_on_b.id) is not None


def test_delete_line_raises_404_for_missing_report(db_session, user_a):
    """delete_line raises 404 when the report does not exist."""
    with pytest.raises(HTTPException) as exc_info:
        line_service.delete_line(db_session, 99999, 1, user_a)

    assert exc_info.value.status_code == 404
