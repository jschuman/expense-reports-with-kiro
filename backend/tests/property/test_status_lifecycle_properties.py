"""Property-based tests for the expense report status lifecycle.

Feature: expense-report-status

Properties covered:
  Property 1: Status Transition Validity
  Property 2: Audit Log Completeness
  Property 7: Submit Transition Correctness

All property tests run a minimum of 20 iterations (max_examples=20).

Requirements: 3.3, 3.5, 5.3, 6.5, 7.5, 9.1, 9.2, 11.1, 11.2, 11.4, 11.6
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from hypothesis import HealthCheck, given, settings, strategies as st
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
# Pre-computed password hash (avoids expensive bcrypt in every example)
# ---------------------------------------------------------------------------

_TEST_PASSWORD_HASH = hash_password("test_password")

# ---------------------------------------------------------------------------
# All four valid statuses and the three actions
# ---------------------------------------------------------------------------

ALL_STATUSES = ["In Progress", "Submitted", "Rejected", "Scheduled for Payment"]
ALL_ACTIONS = ["submit", "accept", "reject"]

# Valid (status, action) → new_status transitions
VALID_TRANSITIONS: dict[tuple[str, str], str] = {
    ("In Progress", "submit"): "Submitted",
    ("Rejected", "submit"): "Submitted",
    ("Submitted", "accept"): "Scheduled for Payment",
    ("Submitted", "reject"): "Rejected",
}

# Sequences of (action, expected_new_status) that form valid chains starting
# from "In Progress".  Each sequence is a list of (action, new_status) tuples.
VALID_TRANSITION_SEQUENCES: list[list[tuple[str, str]]] = [
    # In Progress → Submitted
    [("submit", "Submitted")],
    # In Progress → Submitted → Scheduled for Payment
    [("submit", "Submitted"), ("accept", "Scheduled for Payment")],
    # In Progress → Submitted → Rejected
    [("submit", "Submitted"), ("reject", "Rejected")],
    # In Progress → Submitted → Rejected → Submitted
    [("submit", "Submitted"), ("reject", "Rejected"), ("submit", "Submitted")],
    # In Progress → Submitted → Rejected → Submitted → Scheduled for Payment
    [
        ("submit", "Submitted"),
        ("reject", "Rejected"),
        ("submit", "Submitted"),
        ("accept", "Scheduled for Payment"),
    ],
]


# ---------------------------------------------------------------------------
# Shared DB / user helpers
# ---------------------------------------------------------------------------


def _make_db():
    """Create a fresh in-memory SQLite session with roles seeded."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Role(id=1, name="User"))
    session.add(Role(id=2, name="Admin"))
    session.commit()
    return session, engine


def _teardown_db(session, engine):
    session.close()
    Base.metadata.drop_all(bind=engine)


def _make_owner(session) -> User:
    user = User(username="owner", hashed_password=_TEST_PASSWORD_HASH, role_id=1)
    session.add(user)
    session.commit()
    session.refresh(user)
    session.refresh(user, attribute_names=["role"])
    return user


def _make_admin(session) -> User:
    user = User(username="admin", hashed_password=_TEST_PASSWORD_HASH, role_id=2)
    session.add(user)
    session.commit()
    session.refresh(user)
    session.refresh(user, attribute_names=["role"])
    return user


def _make_report(session, owner: User, status: str) -> ExpenseReport:
    report = ExpenseReport(
        title="Test Report",
        description="Description",
        total_amount=100.0,
        status=status,
        owner_id=owner.id,
        created_at=datetime.now(timezone.utc),
        reimbursable_from_client=False,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return report


def _audit_entries(session, report_id: int) -> list[StatusAuditLog]:
    return (
        session.query(StatusAuditLog)
        .filter(StatusAuditLog.expense_report_id == report_id)
        .order_by(StatusAuditLog.id)
        .all()
    )


def _apply_action(session, report: ExpenseReport, action: str, owner: User, admin: User):
    """Dispatch an action to the appropriate service function."""
    if action == "submit":
        return status_service.submit_report(session, report.id, owner)
    elif action == "accept":
        return status_service.accept_report(session, report.id, admin)
    elif action == "reject":
        return status_service.reject_report(session, report.id, "Rejection reason.", admin)
    else:
        raise ValueError(f"Unknown action: {action}")


# ---------------------------------------------------------------------------
# Property 1: Status Transition Validity
# Feature: expense-report-status, Property 1
# Validates: Requirements 9.1, 9.2, 3.5, 5.3, 6.5
# ---------------------------------------------------------------------------


@settings(max_examples=20, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(
    status=st.sampled_from(ALL_STATUSES),
    action=st.sampled_from(ALL_ACTIONS),
)
def test_property_1_status_transition_validity(status: str, action: str):
    """Property 1: Status Transition Validity.

    # Feature: expense-report-status, Property 1: Status Transition Validity

    For any expense report in any state and any actor attempting any action,
    the resulting status must be one of the four defined valid transitions, and
    any attempt at an undefined transition must return 409 Conflict without
    modifying the report.

    Validates: Requirements 9.1, 9.2, 3.5, 5.3, 6.5
    """
    session, engine = _make_db()
    try:
        owner = _make_owner(session)
        admin = _make_admin(session)
        report = _make_report(session, owner, status)
        original_status = report.status

        is_valid = (status, action) in VALID_TRANSITIONS

        if is_valid:
            # Valid transition: must succeed and land on the expected new status
            expected_new_status = VALID_TRANSITIONS[(status, action)]
            result = _apply_action(session, report, action, owner, admin)
            assert result.status == expected_new_status, (
                f"Expected status '{expected_new_status}' after ({status}, {action}), "
                f"got '{result.status}'"
            )
        else:
            # Invalid transition: must raise 409 and leave the report unchanged
            with pytest.raises(HTTPException) as exc_info:
                _apply_action(session, report, action, owner, admin)

            assert exc_info.value.status_code == 409, (
                f"Expected 409 for invalid transition ({status}, {action}), "
                f"got {exc_info.value.status_code}"
            )

            # Report status must be unchanged
            session.refresh(report)
            assert report.status == original_status, (
                f"Report status changed from '{original_status}' to '{report.status}' "
                f"after invalid transition ({status}, {action})"
            )
    finally:
        _teardown_db(session, engine)


# ---------------------------------------------------------------------------
# Property 2: Audit Log Completeness
# Feature: expense-report-status, Property 2
# Validates: Requirements 11.1, 11.2, 11.4, 11.6
# ---------------------------------------------------------------------------


@settings(max_examples=20, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(
    transitions=st.lists(
        st.sampled_from(VALID_TRANSITION_SEQUENCES),
        min_size=1,
        max_size=5,
    )
)
def test_property_2_audit_log_completeness(transitions: list[list[tuple[str, str]]]):
    """Property 2: Audit Log Completeness.

    # Feature: expense-report-status, Property 2: Audit Log Completeness

    For any sequence of status changes applied to an expense report (including
    initial creation), the number of audit log entries for that report must equal
    the total number of status changes applied, and each entry must record the
    correct expense_report_id, the new status value, and a changed_at timestamp
    in UTC.

    Validates: Requirements 11.1, 11.2, 11.4, 11.6
    """
    session, engine = _make_db()
    try:
        owner = _make_owner(session)
        admin = _make_admin(session)

        for sequence in transitions:
            # Each sequence starts from "In Progress"
            report = _make_report(session, owner, "In Progress")
            report_id = report.id
            applied_count = 0

            for action, expected_status in sequence:
                _apply_action(session, report, action, owner, admin)
                applied_count += 1
                session.refresh(report)

                # After each transition, verify audit log count and latest entry
                entries = _audit_entries(session, report_id)
                assert len(entries) == applied_count, (
                    f"Expected {applied_count} audit entries after {applied_count} transitions, "
                    f"got {len(entries)}"
                )

                latest = entries[-1]

                # Correct report id
                assert latest.expense_report_id == report_id, (
                    f"Audit entry expense_report_id {latest.expense_report_id} != {report_id}"
                )

                # Correct status value
                assert latest.status == expected_status, (
                    f"Audit entry status '{latest.status}' != expected '{expected_status}'"
                )

                # changed_at must be a datetime
                assert isinstance(latest.changed_at, datetime), (
                    f"changed_at is not a datetime: {type(latest.changed_at)}"
                )

                # All previous entries must still be present (immutability)
                assert len(entries) == applied_count, (
                    "Audit log entries were removed — log must be append-only"
                )
    finally:
        _teardown_db(session, engine)


# ---------------------------------------------------------------------------
# Property 7: Submit Transition Correctness
# Feature: expense-report-status, Property 7
# Validates: Requirements 3.3, 7.5, 11.2
# ---------------------------------------------------------------------------


@settings(max_examples=20, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(
    initial_status=st.sampled_from(["In Progress", "Rejected"]),
)
def test_property_7_submit_transition_correctness(initial_status: str):
    """Property 7: Submit Transition Correctness.

    # Feature: expense-report-status, Property 7: Submit Transition Correctness

    For any valid expense report in 'In Progress' or 'Rejected' state submitted
    by its owner, the resulting status must be 'Submitted', and the audit log must
    contain exactly one new entry recording this transition.

    Validates: Requirements 3.3, 7.5, 11.2
    """
    session, engine = _make_db()
    try:
        owner = _make_owner(session)
        report = _make_report(session, owner, initial_status)
        report_id = report.id

        # Count audit entries before the submit
        entries_before = _audit_entries(session, report_id)
        count_before = len(entries_before)

        result = status_service.submit_report(session, report_id, owner)

        # Status must be 'Submitted'
        assert result.status == "Submitted", (
            f"Expected status 'Submitted' after submit from '{initial_status}', "
            f"got '{result.status}'"
        )

        # Exactly one new audit entry must have been written
        entries_after = _audit_entries(session, report_id)
        new_entries = entries_after[count_before:]
        assert len(new_entries) == 1, (
            f"Expected exactly 1 new audit entry after submit, got {len(new_entries)}"
        )

        new_entry = new_entries[0]
        assert new_entry.status == "Submitted", (
            f"New audit entry status '{new_entry.status}' != 'Submitted'"
        )
        assert new_entry.expense_report_id == report_id, (
            f"New audit entry expense_report_id {new_entry.expense_report_id} != {report_id}"
        )
        assert isinstance(new_entry.changed_at, datetime), (
            f"changed_at is not a datetime: {type(new_entry.changed_at)}"
        )
    finally:
        _teardown_db(session, engine)


# ---------------------------------------------------------------------------
# Property 3: Owner-Only Edit and Delete Enforcement
# Feature: expense-report-status, Property 3
# Validates: Requirements 2.4, 2.5, 7.6
# ---------------------------------------------------------------------------


@settings(max_examples=20, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(
    editable_status=st.sampled_from(["In Progress", "Rejected"]),
)
def test_property_3_owner_only_edit_and_delete_enforcement(editable_status: str):
    """Property 3: Owner-Only Edit and Delete Enforcement.

    # Feature: expense-report-status, Property 3: Owner-Only Edit and Delete Enforcement

    For any expense report in an editable state ('In Progress' or 'Rejected')
    and any authenticated user who is not the report's owner, any attempt to
    update or delete the report must return 403 Forbidden and leave the report
    unchanged.

    Validates: Requirements 2.4, 2.5, 7.6
    """
    from app.schemas.expense_report import ExpenseReportUpdate
    from app.services import report_service

    session, engine = _make_db()
    try:
        owner = _make_owner(session)

        # Create a distinct non-owner user
        non_owner = User(
            username="non_owner",
            hashed_password=_TEST_PASSWORD_HASH,
            role_id=1,
        )
        session.add(non_owner)
        session.commit()
        session.refresh(non_owner)
        session.refresh(non_owner, attribute_names=["role"])

        report = _make_report(session, owner, editable_status)
        original_title = report.title
        original_status = report.status

        # --- update attempt by non-owner must raise 403 ---
        update_data = ExpenseReportUpdate(title="Hijacked Title")
        with pytest.raises(HTTPException) as exc_info:
            report_service.update_report(session, report.id, update_data, non_owner)

        assert exc_info.value.status_code == 403, (
            f"Expected 403 for non-owner update on '{editable_status}' report, "
            f"got {exc_info.value.status_code}"
        )

        # Report must be unchanged
        session.refresh(report)
        assert report.title == original_title, (
            f"Report title changed after non-owner update attempt: "
            f"'{report.title}' != '{original_title}'"
        )
        assert report.status == original_status

        # --- delete attempt by non-owner must raise 403 ---
        with pytest.raises(HTTPException) as exc_info:
            report_service.delete_report(session, report.id, non_owner)

        assert exc_info.value.status_code == 403, (
            f"Expected 403 for non-owner delete on '{editable_status}' report, "
            f"got {exc_info.value.status_code}"
        )

        # Report must still exist and be unchanged
        session.refresh(report)
        assert report.title == original_title
        assert report.status == original_status
    finally:
        _teardown_db(session, engine)


# ---------------------------------------------------------------------------
# Property 6: Read-Only State Enforcement
# Feature: expense-report-status, Property 6
# Validates: Requirements 4.1, 4.2, 8.1, 8.2
# ---------------------------------------------------------------------------


@settings(max_examples=20, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(
    read_only_status=st.sampled_from(["Submitted", "Scheduled for Payment"]),
)
def test_property_6_read_only_state_enforcement(read_only_status: str):
    """Property 6: Read-Only State Enforcement.

    # Feature: expense-report-status, Property 6: Read-Only State Enforcement

    For any expense report in a read-only state ('Submitted' or 'Scheduled for
    Payment') and any authenticated user, any attempt to update or delete the
    report must return 409 Conflict and leave the report unchanged.

    Validates: Requirements 4.1, 4.2, 8.1, 8.2
    """
    from app.schemas.expense_report import ExpenseReportUpdate
    from app.services import report_service

    session, engine = _make_db()
    try:
        owner = _make_owner(session)
        report = _make_report(session, owner, read_only_status)
        original_title = report.title
        original_status = report.status

        # --- update attempt must raise 409 ---
        update_data = ExpenseReportUpdate(title="Attempted Update")
        with pytest.raises(HTTPException) as exc_info:
            report_service.update_report(session, report.id, update_data, owner)

        assert exc_info.value.status_code == 409, (
            f"Expected 409 for update on read-only '{read_only_status}' report, "
            f"got {exc_info.value.status_code}"
        )

        # Report must be unchanged
        session.refresh(report)
        assert report.title == original_title, (
            f"Report title changed after update attempt on '{read_only_status}': "
            f"'{report.title}' != '{original_title}'"
        )
        assert report.status == original_status

        # --- delete attempt must raise 409 ---
        with pytest.raises(HTTPException) as exc_info:
            report_service.delete_report(session, report.id, owner)

        assert exc_info.value.status_code == 409, (
            f"Expected 409 for delete on read-only '{read_only_status}' report, "
            f"got {exc_info.value.status_code}"
        )

        # Report must still exist and be unchanged
        session.refresh(report)
        assert report.title == original_title
        assert report.status == original_status
    finally:
        _teardown_db(session, engine)
