"""Business logic for expense line operations.

All database interaction for the /reports/{report_id}/lines endpoints lives
here.  Routers are thin HTTP adapters that delegate to these functions.

Access control rules:
- create_line, update_line, delete_line: owner only, report must be editable
- list_lines: owner or Admin role

Locked statuses (mutations rejected with 409):
    "Submitted", "Scheduled for Payment"

Editable statuses (mutations allowed):
    "In Progress", "Rejected"

Requirements: 1.2, 1.5, 2.4, 3.4, 3.6, 3.7, 4.3, 4.4, 4.5, 8.1, 8.2, 8.3
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.expense_line import ExpenseLine
from app.models.expense_report import ExpenseReport
from app.schemas.expense_line import ExpenseLineCreate, ExpenseLineUpdate

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

LOCKED_STATUSES = ("Submitted", "Scheduled for Payment")
EDITABLE_STATUSES = ("In Progress", "Rejected")

# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _get_report_or_404(db: Session, report_id: int) -> ExpenseReport:
    """Load an ExpenseReport by id, raising 404 if not found."""
    report = db.get(ExpenseReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


def _get_line_or_404(db: Session, report_id: int, line_id: int) -> ExpenseLine:
    """Load an ExpenseLine by id, raising 404 if not found or not on the report.

    Verifies that the line belongs to the specified report so that a caller
    cannot manipulate lines from a different report by guessing ids.
    """
    line = db.get(ExpenseLine, line_id)
    if line is None or line.report_id != report_id:
        raise HTTPException(status_code=404, detail="Line not found")
    return line


def _assert_owner(report: ExpenseReport, current_user) -> None:
    """Raise 403 if *current_user* is not the owner of *report*.

    Requirements: 3.6, 4.4, 8.3
    """
    if current_user.id != report.owner_id:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to modify this report",
        )


def _assert_editable(report: ExpenseReport) -> None:
    """Raise 409 if *report* is in a locked status.

    Requirements: 3.7, 4.5
    """
    if report.status in LOCKED_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot perform this action on a report with status '{report.status}'",
        )


def _assert_read_access(report: ExpenseReport, current_user) -> None:
    """Raise 403 unless *current_user* is the owner or has the Admin role.

    Requirements: 8.1, 8.2
    """
    is_owner = current_user.id == report.owner_id
    is_admin = (
        current_user.role is not None and current_user.role.name == "Admin"
    )
    if not (is_owner or is_admin):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to view this report's lines",
        )


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


def create_line(
    db: Session,
    report_id: int,
    data: ExpenseLineCreate,
    current_user,
) -> ExpenseLine:
    """Create a new ExpenseLine on the specified report.

    Checks:
    1. Report exists (404 if not).
    2. Caller is the report owner (403 if not).
    3. Report is in an editable status (409 if locked).

    The line is persisted and the session is committed.  The refreshed ORM
    object (with ``id`` populated) is returned.

    Requirements: 1.2, 2.4
    """
    report = _get_report_or_404(db, report_id)
    _assert_owner(report, current_user)
    _assert_editable(report)

    line = ExpenseLine(
        report_id=report_id,
        **data.model_dump(),
    )
    db.add(line)
    db.commit()
    db.refresh(line)
    return line


def list_lines(
    db: Session,
    report_id: int,
    current_user,
) -> list[ExpenseLine]:
    """Return all ExpenseLines for the specified report, ordered by id.

    Checks:
    1. Report exists (404 if not).
    2. Caller is the owner or has Admin role (403 otherwise).

    Requirements: 8.1, 8.2
    """
    report = _get_report_or_404(db, report_id)
    _assert_read_access(report, current_user)

    return (
        db.query(ExpenseLine)
        .filter(ExpenseLine.report_id == report_id)
        .order_by(ExpenseLine.id)
        .all()
    )


def update_line(
    db: Session,
    report_id: int,
    line_id: int,
    data: ExpenseLineUpdate,
    current_user,
) -> ExpenseLine:
    """Apply a partial update to an existing ExpenseLine.

    Checks:
    1. Report exists (404 if not).
    2. Caller is the report owner (403 if not).
    3. Report is in an editable status (409 if locked).
    4. Line exists and belongs to the report (404 if not).

    Only fields explicitly provided in *data* (non-None) are applied so that
    a partial update does not overwrite existing values with None.

    Requirements: 3.4, 3.6, 3.7
    """
    report = _get_report_or_404(db, report_id)
    _assert_owner(report, current_user)
    _assert_editable(report)
    line = _get_line_or_404(db, report_id, line_id)

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(line, field, value)

    db.commit()
    db.refresh(line)
    return line


def delete_line(
    db: Session,
    report_id: int,
    line_id: int,
    current_user,
) -> None:
    """Permanently delete an ExpenseLine.

    Checks:
    1. Report exists (404 if not).
    2. Caller is the report owner (403 if not).
    3. Report is in an editable status (409 if locked).
    4. Line exists and belongs to the report (404 if not).

    Requirements: 4.3, 4.4, 4.5
    """
    report = _get_report_or_404(db, report_id)
    _assert_owner(report, current_user)
    _assert_editable(report)
    line = _get_line_or_404(db, report_id, line_id)

    db.delete(line)
    db.commit()
