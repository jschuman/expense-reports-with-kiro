"""Business logic for expense report operations.

All database interaction for the /reports endpoints lives here.
Routers are thin HTTP adapters that delegate to these functions.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.expense_line import ExpenseLine
from app.models.expense_report import ExpenseReport
from app.models.status_audit_log import StatusAuditLog
from app.schemas.expense_report import (
    AdminExpenseReportUpdate,
    ExpenseReportCreate,
    ExpenseReportUpdate,
)



def _compute_total(db: Session, report_id: int) -> float:
    """Compute the total amount for a report as the sum of its line amounts.

    Returns 0.0 when the report has no lines.
    """
    result = (
        db.query(func.sum(ExpenseLine.amount))
        .filter(ExpenseLine.report_id == report_id)
        .scalar()
    )
    return result or 0.0


def get_all_reports(db: Session) -> list[ExpenseReport]:
    """Return all expense reports in the system, ordered by id ascending.
    
    Used for Admin role users. Eagerly loads owner relationship.
    """
    return (
        db.query(ExpenseReport)
        .options(joinedload(ExpenseReport.owner))
        .order_by(ExpenseReport.id)
        .all()
    )


def get_reports_for_user(db: Session, user_id: int) -> list[ExpenseReport]:
    """Return all expense reports owned by *user_id*, ordered by id ascending.

    The ``owner`` relationship is eagerly loaded so that ``owner_username``
    is accessible without an additional query.  Returns an empty list when
    the user has no reports.
    """
    return (
        db.query(ExpenseReport)
        .options(joinedload(ExpenseReport.owner))
        .filter(ExpenseReport.owner_id == user_id)
        .order_by(ExpenseReport.id)
        .all()
    )


def create_report(
    db: Session,
    user_id: int,
    data: ExpenseReportCreate,
) -> ExpenseReport:
    """Persist a new expense report and return the ORM object.

    The report is always created with ``status="In Progress"`` and associated
    with *user_id* as the owner.  ``created_at`` is set server-side to the
    current UTC time.  An initial ``StatusAuditLog`` entry is written in the
    same transaction.  The caller receives the refreshed ORM object (with
    ``id`` populated) after the commit.
    """
    now = datetime.now(timezone.utc)
    report = ExpenseReport(
        title=data.title,
        description=data.description or None,
        status="In Progress",
        owner_id=user_id,
        created_at=now,
        reimbursable_from_client=data.reimbursable_from_client,
        client=data.client,
        admin_notes=None,
    )
    db.add(report)
    db.flush()  # populate report.id before writing the audit entry

    audit_entry = StatusAuditLog(
        expense_report_id=report.id,
        status="In Progress",
        changed_at=now,
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(report)
    db.refresh(report, attribute_names=["owner"])
    return report


def update_report(
    db: Session,
    report_id: int,
    data: ExpenseReportUpdate,
    current_user,
) -> ExpenseReport:
    """Update editable fields on an expense report.

    Only the owner may update a report, and only while it is in an editable
    state (``"In Progress"`` or ``"Rejected"``).  Only non-``None`` fields
    from *data* are applied so that a partial update does not overwrite
    existing values with ``None``.

    Raises:
        HTTPException 404: Report not found.
        HTTPException 403: Caller is not the report owner.
        HTTPException 409: Report is not in an editable state.

    Requirements: 2.1, 2.4, 4.1, 7.1, 7.6, 8.1
    """
    report = db.get(ExpenseReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    if current_user.id != report.owner_id:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to modify this report",
        )

    if report.status not in ("In Progress", "Rejected"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot perform this action on a report with status '{report.status}'",
        )

    # Apply only the fields that were explicitly provided (non-None)
    update_data = data.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(report, field, value)

    db.commit()
    db.refresh(report)
    return report


def admin_update_report(
    db: Session,
    report_id: int,
    data: AdminExpenseReportUpdate,
) -> ExpenseReport:
    """Update an expense report as an Admin (no status/ownership restrictions).

    Applies only explicitly provided (non-None) fields.  Does NOT change the
    report's status.  Validates field constraints via the Pydantic schema.
    Returns 404 if report not found.

    Requirements: 1.1, 1.3, 1.4, 1.6, 1.7, 6.2, 6.3, 6.4
    """
    report = db.get(ExpenseReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    # Apply only the fields that were explicitly provided (non-None)
    update_data = data.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(report, field, value)

    db.commit()
    db.refresh(report)
    return report


def delete_report(
    db: Session,
    report_id: int,
    current_user,
) -> None:
    """Delete an expense report.

    Only the owner may delete a report, and only while it is in an editable
    state (``"In Progress"`` or ``"Rejected"``).

    Raises:
        HTTPException 404: Report not found.
        HTTPException 403: Caller is not the report owner.
        HTTPException 409: Report is not in an editable state.

    Requirements: 2.2, 2.5, 4.2, 7.2, 8.2
    """
    report = db.get(ExpenseReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    if current_user.id != report.owner_id:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to modify this report",
        )

    if report.status not in ("In Progress", "Rejected"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot perform this action on a report with status '{report.status}'",
        )

    db.delete(report)
    db.commit()
