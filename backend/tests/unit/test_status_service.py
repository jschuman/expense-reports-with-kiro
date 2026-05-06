"""Unit tests for status_service.py.

Uses an in-memory SQLite database with a fresh schema per test so each
test is fully isolated.

Requirements covered: 3.2–3.6, 5.2–5.4, 6.1–6.6, 9.1, 9.2, 11.2
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — register all ORM models with Base
from app.db.database import Base
from app.models.expense_report import ExpenseReport
from app.models.role import Role
from app.models.status_audit_log import StatusAuditLog
from app.models.user import User
from app.services import status_service
from app.services.auth_service import hash_password


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def db_session():
    """Provide a fresh in-memory SQLite session for each test."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Seed roles
    session.add(Role(id=1, name="User"))
    session.add(Role(id=2, name="Admin"))
    session.commit()

    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def owner(db_session):
    """A regular User who owns reports."""
    user = User(username="alice", hashed_password=hash_password("pw"), role_id=1)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(user, attribute_names=["role"])
    return user


@pytest.fixture()
def other_user(db_session):
    """A second regular User who does NOT own the reports."""
    user = User(username="bob", hashed_password=hash_password("pw"), role_id=1)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(user, attribute_names=["role"])
    return user


@pytest.fixture()
def admin_user(db_session):
    """An Admin User."""
    user = User(username="carol", hashed_password=hash_password("pw"), role_id=2)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(user, attribute_names=["role"])
    return user


def _make_report(db_session, owner: User, status: str) -> ExpenseReport:
    """Helper: create and persist an ExpenseReport with the given status."""
    report = ExpenseReport(
        title="Test Report",
        description="Some description",
        status=status,
        owner_id=owner.id,
        created_at=datetime.now(timezone.utc),
        reimbursable_from_client=False,
    )
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)
    return report


def _audit_entries(db_session, report_id: int) -> list[StatusAuditLog]:
    """Return all audit log entries for a given report, ordered by id."""
    return (
        db_session.query(StatusAuditLog)
        .filter(StatusAuditLog.expense_report_id == report_id)
        .order_by(StatusAuditLog.id)
        .all()
    )


# ---------------------------------------------------------------------------
# submit_report — success paths
# ---------------------------------------------------------------------------


class TestSubmitReportSuccess:
    """submit_report transitions to 'Submitted' and writes an audit entry."""

    def test_submit_from_in_progress(self, db_session, owner):
        """submit_report: 'In Progress' → 'Submitted' with one audit entry written.

        Requirements: 3.3, 11.2
        """
        report = _make_report(db_session, owner, "In Progress")
        report_id = report.id

        result = status_service.submit_report(db_session, report_id, owner)

        assert result.status == "Submitted"

        entries = _audit_entries(db_session, report_id)
        assert len(entries) == 1
        assert entries[0].status == "Submitted"
        assert entries[0].expense_report_id == report_id
        # Timestamp must be UTC-aware or naive-UTC
        ts = entries[0].changed_at
        assert isinstance(ts, datetime)

    def test_submit_from_rejected(self, db_session, owner):
        """submit_report: 'Rejected' → 'Submitted' with one audit entry written.

        Requirements: 7.5, 11.2
        """
        report = _make_report(db_session, owner, "Rejected")
        report_id = report.id

        result = status_service.submit_report(db_session, report_id, owner)

        assert result.status == "Submitted"

        entries = _audit_entries(db_session, report_id)
        assert len(entries) == 1
        assert entries[0].status == "Submitted"


# ---------------------------------------------------------------------------
# submit_report — error paths
# ---------------------------------------------------------------------------


class TestSubmitReportErrors:
    """submit_report raises the correct HTTP errors for invalid inputs."""

    def test_submit_raises_404_for_missing_report(self, db_session, owner):
        """submit_report raises 404 when the report does not exist."""
        with pytest.raises(HTTPException) as exc_info:
            status_service.submit_report(db_session, 99999, owner)
        assert exc_info.value.status_code == 404

    def test_submit_raises_403_for_non_owner(self, db_session, owner, other_user):
        """submit_report raises 403 when the caller is not the report owner.

        Requirements: 3.6
        """
        report = _make_report(db_session, owner, "In Progress")

        with pytest.raises(HTTPException) as exc_info:
            status_service.submit_report(db_session, report.id, other_user)

        assert exc_info.value.status_code == 403
        # Report status must be unchanged
        db_session.refresh(report)
        assert report.status == "In Progress"

    def test_submit_raises_409_from_submitted_state(self, db_session, owner):
        """submit_report raises 409 when the report is already 'Submitted'.

        Requirements: 3.5, 9.1
        """
        report = _make_report(db_session, owner, "Submitted")

        with pytest.raises(HTTPException) as exc_info:
            status_service.submit_report(db_session, report.id, owner)

        assert exc_info.value.status_code == 409
        db_session.refresh(report)
        assert report.status == "Submitted"

    def test_submit_raises_409_from_scheduled_for_payment_state(self, db_session, owner):
        """submit_report raises 409 when the report is 'Scheduled for Payment'.

        Requirements: 9.1, 9.2
        """
        report = _make_report(db_session, owner, "Scheduled for Payment")

        with pytest.raises(HTTPException) as exc_info:
            status_service.submit_report(db_session, report.id, owner)

        assert exc_info.value.status_code == 409
        db_session.refresh(report)
        assert report.status == "Scheduled for Payment"

    def test_submit_raises_422_when_title_missing(self, db_session, owner):
        """submit_report raises 422 when the report has no title.

        Requirements: 3.4
        """
        report = ExpenseReport(
            title="",  # empty title
            status="In Progress",
            owner_id=owner.id,
            created_at=datetime.now(timezone.utc),
            reimbursable_from_client=False,
        )
        db_session.add(report)
        db_session.commit()
        db_session.refresh(report)

        with pytest.raises(HTTPException) as exc_info:
            status_service.submit_report(db_session, report.id, owner)

        assert exc_info.value.status_code == 422


# ---------------------------------------------------------------------------
# accept_report — success path
# ---------------------------------------------------------------------------


class TestAcceptReportSuccess:
    """accept_report transitions to 'Scheduled for Payment' and writes an audit entry."""

    def test_accept_from_submitted(self, db_session, owner, admin_user):
        """accept_report: 'Submitted' → 'Scheduled for Payment' with audit entry.

        Requirements: 5.2, 11.2
        """
        report = _make_report(db_session, owner, "Submitted")
        report_id = report.id

        result = status_service.accept_report(db_session, report_id, admin_user)

        assert result.status == "Scheduled for Payment"

        entries = _audit_entries(db_session, report_id)
        assert len(entries) == 1
        assert entries[0].status == "Scheduled for Payment"
        assert entries[0].expense_report_id == report_id


# ---------------------------------------------------------------------------
# accept_report — error paths
# ---------------------------------------------------------------------------


class TestAcceptReportErrors:
    """accept_report raises the correct HTTP errors for invalid inputs."""

    def test_accept_raises_404_for_missing_report(self, db_session, admin_user):
        """accept_report raises 404 when the report does not exist."""
        with pytest.raises(HTTPException) as exc_info:
            status_service.accept_report(db_session, 99999, admin_user)
        assert exc_info.value.status_code == 404

    def test_accept_raises_403_for_non_admin(self, db_session, owner):
        """accept_report raises 403 when the caller is not an Admin.

        Requirements: 5.4
        """
        report = _make_report(db_session, owner, "Submitted")

        with pytest.raises(HTTPException) as exc_info:
            status_service.accept_report(db_session, report.id, owner)

        assert exc_info.value.status_code == 403
        db_session.refresh(report)
        assert report.status == "Submitted"

    def test_accept_raises_409_from_in_progress_state(self, db_session, owner, admin_user):
        """accept_report raises 409 when the report is 'In Progress'.

        Requirements: 5.3, 9.1
        """
        report = _make_report(db_session, owner, "In Progress")

        with pytest.raises(HTTPException) as exc_info:
            status_service.accept_report(db_session, report.id, admin_user)

        assert exc_info.value.status_code == 409
        db_session.refresh(report)
        assert report.status == "In Progress"

    def test_accept_raises_409_from_rejected_state(self, db_session, owner, admin_user):
        """accept_report raises 409 when the report is 'Rejected'.

        Requirements: 9.1, 9.2
        """
        report = _make_report(db_session, owner, "Rejected")

        with pytest.raises(HTTPException) as exc_info:
            status_service.accept_report(db_session, report.id, admin_user)

        assert exc_info.value.status_code == 409

    def test_accept_raises_409_from_scheduled_for_payment_state(self, db_session, owner, admin_user):
        """accept_report raises 409 when the report is already 'Scheduled for Payment'.

        Requirements: 9.1, 9.2
        """
        report = _make_report(db_session, owner, "Scheduled for Payment")

        with pytest.raises(HTTPException) as exc_info:
            status_service.accept_report(db_session, report.id, admin_user)

        assert exc_info.value.status_code == 409


# ---------------------------------------------------------------------------
# reject_report — success path
# ---------------------------------------------------------------------------


class TestRejectReportSuccess:
    """reject_report transitions to 'Rejected', persists admin_notes, and writes an audit entry."""

    def test_reject_from_submitted(self, db_session, owner, admin_user):
        """reject_report: 'Submitted' → 'Rejected' with admin_notes persisted and audit entry.

        Requirements: 6.3, 6.4, 11.2
        """
        report = _make_report(db_session, owner, "Submitted")
        report_id = report.id
        notes = "Missing receipts for hotel stay."

        result = status_service.reject_report(db_session, report_id, notes, admin_user)

        assert result.status == "Rejected"
        assert result.admin_notes == notes

        entries = _audit_entries(db_session, report_id)
        assert len(entries) == 1
        assert entries[0].status == "Rejected"
        assert entries[0].expense_report_id == report_id


# ---------------------------------------------------------------------------
# reject_report — error paths
# ---------------------------------------------------------------------------


class TestRejectReportErrors:
    """reject_report raises the correct HTTP errors for invalid inputs."""

    def test_reject_raises_404_for_missing_report(self, db_session, admin_user):
        """reject_report raises 404 when the report does not exist."""
        with pytest.raises(HTTPException) as exc_info:
            status_service.reject_report(db_session, 99999, "notes", admin_user)
        assert exc_info.value.status_code == 404

    def test_reject_raises_403_for_non_admin(self, db_session, owner):
        """reject_report raises 403 when the caller is not an Admin.

        Requirements: 6.6
        """
        report = _make_report(db_session, owner, "Submitted")

        with pytest.raises(HTTPException) as exc_info:
            status_service.reject_report(db_session, report.id, "some notes", owner)

        assert exc_info.value.status_code == 403
        db_session.refresh(report)
        assert report.status == "Submitted"

    def test_reject_raises_409_from_in_progress_state(self, db_session, owner, admin_user):
        """reject_report raises 409 when the report is 'In Progress'.

        Requirements: 6.5, 9.1
        """
        report = _make_report(db_session, owner, "In Progress")

        with pytest.raises(HTTPException) as exc_info:
            status_service.reject_report(db_session, report.id, "notes", admin_user)

        assert exc_info.value.status_code == 409
        db_session.refresh(report)
        assert report.status == "In Progress"

    def test_reject_raises_409_from_rejected_state(self, db_session, owner, admin_user):
        """reject_report raises 409 when the report is already 'Rejected'.

        Requirements: 9.1, 9.2
        """
        report = _make_report(db_session, owner, "Rejected")

        with pytest.raises(HTTPException) as exc_info:
            status_service.reject_report(db_session, report.id, "notes", admin_user)

        assert exc_info.value.status_code == 409

    def test_reject_raises_409_from_scheduled_for_payment_state(self, db_session, owner, admin_user):
        """reject_report raises 409 when the report is 'Scheduled for Payment'.

        Requirements: 9.1, 9.2
        """
        report = _make_report(db_session, owner, "Scheduled for Payment")

        with pytest.raises(HTTPException) as exc_info:
            status_service.reject_report(db_session, report.id, "notes", admin_user)

        assert exc_info.value.status_code == 409

    def test_reject_does_not_persist_admin_notes_on_failure(self, db_session, owner, admin_user):
        """reject_report does not persist admin_notes when the transition is invalid.

        Requirements: 6.5
        """
        report = _make_report(db_session, owner, "In Progress")
        original_notes = report.admin_notes

        with pytest.raises(HTTPException):
            status_service.reject_report(db_session, report.id, "should not be saved", admin_user)

        db_session.refresh(report)
        assert report.admin_notes == original_notes


# ---------------------------------------------------------------------------
# Audit log — no spurious entries on failure
# ---------------------------------------------------------------------------


class TestAuditLogOnFailure:
    """No audit entries should be written when a transition fails."""

    def test_no_audit_entry_written_on_403(self, db_session, owner, other_user):
        """A failed submit (403) must not write any audit log entry."""
        report = _make_report(db_session, owner, "In Progress")

        with pytest.raises(HTTPException):
            status_service.submit_report(db_session, report.id, other_user)

        entries = _audit_entries(db_session, report.id)
        assert len(entries) == 0

    def test_no_audit_entry_written_on_409(self, db_session, owner):
        """A failed submit (409) must not write any audit log entry."""
        report = _make_report(db_session, owner, "Submitted")

        with pytest.raises(HTTPException):
            status_service.submit_report(db_session, report.id, owner)

        entries = _audit_entries(db_session, report.id)
        assert len(entries) == 0

    def test_no_audit_entry_written_on_accept_403(self, db_session, owner):
        """A failed accept (403) must not write any audit log entry."""
        report = _make_report(db_session, owner, "Submitted")

        with pytest.raises(HTTPException):
            status_service.accept_report(db_session, report.id, owner)

        entries = _audit_entries(db_session, report.id)
        assert len(entries) == 0

    def test_no_audit_entry_written_on_reject_403(self, db_session, owner):
        """A failed reject (403) must not write any audit log entry."""
        report = _make_report(db_session, owner, "Submitted")

        with pytest.raises(HTTPException):
            status_service.reject_report(db_session, report.id, "notes", owner)

        entries = _audit_entries(db_session, report.id)
        assert len(entries) == 0
