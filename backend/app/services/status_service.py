"""Status transition service for expense reports.

All status lifecycle logic lives here. Each function:
1. Loads the report (raises 404 if not found).
2. Checks actor authorization (raises 403 if wrong role/ownership).
3. Validates the current status (raises 409 if invalid transition).
4. Applies any field-level validation (raises 422 if preconditions unmet).
5. Updates the report status and writes an audit entry in the same transaction.
6. Commits and returns the updated report.

Atomic transactions: every status change and its corresponding audit log write
happen in a single SQLAlchemy transaction. If either fails, both are rolled back
(Requirement 11.5).
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.expense_report import ExpenseReport
from app.models.status_audit_log import StatusAuditLog
from app.models.user import User

# ---------------------------------------------------------------------------
# Valid transitions: (from_status, action) → to_status
# ---------------------------------------------------------------------------

_VALID_TRANSITIONS: dict[tuple[str, str], str] = {
    ("In Progress", "submit"): "Submitted",
    ("Rejected", "submit"): "Submitted",
    ("Submitted", "accept"): "Scheduled for Payment",
    ("Submitted", "reject"): "Rejected",
}

# States in which an owner may edit or delete a report
EDITABLE_STATUSES = {"In Progress", "Rejected"}


def _load_report(db: Session, report_id: int) -> ExpenseReport:
    """Load a report by id, raising 404 if not found."""
    report = db.get(ExpenseReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


def _write_audit_entry(db: Session, report: ExpenseReport, status: str) -> None:
    """Append a StatusAuditLog entry for *report* with the given *status*.

    The entry is added to the session but NOT committed here — the caller is
    responsible for committing the transaction so that the status change and
    the audit entry are committed atomically.
    """
    entry = StatusAuditLog(
        expense_report_id=report.id,
        status=status,
        changed_at=datetime.now(timezone.utc),
    )
    db.add(entry)


def submit_report(db: Session, report_id: int, current_user: User) -> ExpenseReport:
    """Transition a report from 'In Progress' or 'Rejected' to 'Submitted'.

    Raises:
        HTTPException 404: Report not found.
        HTTPException 403: Caller is not the report owner.
        HTTPException 409: Report is not in a submittable state.
        HTTPException 422: Required fields (title) are not populated.

    Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 7.5, 9.1, 9.2, 11.2, 11.3, 11.5
    """
    report = _load_report(db, report_id)

    # Authorization: only the owner may submit
    if current_user.id != report.owner_id:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to modify this report",
        )

    # State check: only In Progress and Rejected are submittable
    if report.status not in ("In Progress", "Rejected"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot perform this action on a report with status '{report.status}'",
        )

    # Field validation: title must be populated
    if not report.title:
        raise HTTPException(
            status_code=422,
            detail="Report must have a title before it can be submitted",
        )

    # Apply transition + audit entry atomically
    report.status = "Submitted"
    _write_audit_entry(db, report, "Submitted")
    db.commit()
    db.refresh(report)
    return report


def accept_report(db: Session, report_id: int, current_user: User) -> ExpenseReport:
    """Transition a report from 'Submitted' to 'Scheduled for Payment'.

    Raises:
        HTTPException 404: Report not found.
        HTTPException 403: Caller does not have the Admin role.
        HTTPException 409: Report is not in 'Submitted' state.

    Requirements: 5.2, 5.3, 5.4, 9.1, 9.2, 11.2, 11.3, 11.5
    """
    report = _load_report(db, report_id)

    # Authorization: only admins may accept
    if current_user.role is None or current_user.role.name != "Admin":
        raise HTTPException(status_code=403, detail="Admin role required")

    # State check: only Submitted reports can be accepted
    if report.status != "Submitted":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot perform this action on a report with status '{report.status}'",
        )

    # Apply transition + audit entry atomically
    report.status = "Scheduled for Payment"
    _write_audit_entry(db, report, "Scheduled for Payment")
    db.commit()
    db.refresh(report)
    return report


def reject_report(
    db: Session,
    report_id: int,
    admin_notes: str,
    current_user: User,
) -> ExpenseReport:
    """Transition a report from 'Submitted' to 'Rejected', persisting admin_notes.

    Raises:
        HTTPException 404: Report not found.
        HTTPException 403: Caller does not have the Admin role.
        HTTPException 409: Report is not in 'Submitted' state.

    Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 9.1, 9.2, 11.2, 11.3, 11.5
    """
    report = _load_report(db, report_id)

    # Authorization: only admins may reject
    if current_user.role is None or current_user.role.name != "Admin":
        raise HTTPException(status_code=403, detail="Admin role required")

    # State check: only Submitted reports can be rejected
    if report.status != "Submitted":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot perform this action on a report with status '{report.status}'",
        )

    # Persist admin_notes, apply transition + audit entry atomically
    report.admin_notes = admin_notes
    report.status = "Rejected"
    _write_audit_entry(db, report, "Rejected")
    db.commit()
    db.refresh(report)
    return report
