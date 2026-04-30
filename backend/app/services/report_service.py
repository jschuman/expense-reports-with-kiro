"""Business logic for expense report operations.

All database interaction for the /reports endpoints lives here.
Routers are thin HTTP adapters that delegate to these functions.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session, joinedload

from app.models.expense_report import ExpenseReport
from app.schemas.expense_report import ExpenseReportCreate


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

    The report is always created with ``status="Pending"`` and associated
    with *user_id* as the owner.  ``created_at`` is set server-side to the
    current UTC time.  The caller receives the refreshed ORM object (with
    ``id`` populated) after the commit.
    """
    report = ExpenseReport(
        title=data.title,
        description=data.description or None,
        total_amount=data.total_amount,
        status="In Progress",
        owner_id=user_id,
        created_at=datetime.now(timezone.utc),
        reimbursable_from_client=data.reimbursable_from_client,
        client=data.client,
        admin_notes=None,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    db.refresh(report, attribute_names=["owner"])
    return report
