"""Reports router: list and create expense reports.

All routes require a valid session cookie (enforced via get_current_user).
Business logic and DB interaction are delegated to report_service.
"""

from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session, joinedload

from app.db.database import get_db
from app.dependencies import get_current_user
from app.models.expense_report import ExpenseReport
from app.models.user import User
from app.schemas.expense_report import ExpenseReportCreate, ExpenseReportResponse
from app.services import report_service

router = APIRouter(tags=["reports"])


def _to_response(report: ExpenseReport) -> ExpenseReportResponse:
    """Build an ExpenseReportResponse from an ORM object, resolving owner_username."""
    return ExpenseReportResponse(
        id=report.id,
        title=report.title,
        description=report.description,
        total_amount=report.total_amount,
        status=report.status,
        owner_id=report.owner_id,
        owner_username=report.owner.username,
        created_at=report.created_at,
        reimbursable_from_client=report.reimbursable_from_client,
        client=report.client,
        admin_notes=report.admin_notes,
    )


@router.get("", response_model=List[ExpenseReportResponse])
def list_reports(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[ExpenseReportResponse]:
    """Return expense reports based on the authenticated user's role.

    - Admin role: returns all reports in the system with owner information.
    - User role: returns only reports owned by the authenticated user.

    Returns an empty list when the user has no reports (User role).
    Returns 401 when no valid session cookie is present (raised by get_current_user).
    """
    # Re-fetch the user within the current session to ensure the role
    # relationship is available. current_user may have been loaded in a
    # different session (e.g. get_current_user dependency), so we query
    # by id with an eager joinedload of the role relationship.
    user_with_role = (
        db.query(User)
        .options(joinedload(User.role))
        .filter(User.id == current_user.id)
        .one()
    )

    if user_with_role.role.name == "Admin":
        reports = report_service.get_all_reports(db)
    else:
        reports = report_service.get_reports_for_user(db, current_user.id)
    return [_to_response(r) for r in reports]


@router.post("", response_model=ExpenseReportResponse, status_code=status.HTTP_201_CREATED)
def create_report(
    data: ExpenseReportCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpenseReportResponse:
    """Create a new expense report for the authenticated user.

    The report is saved with status="Pending", owner_id set to the current
    user's id, and created_at set to the current UTC time.

    Returns 201 with the created ExpenseReportResponse on success.
    Returns 401 when no valid session cookie is present.
    Returns 422 when the request body fails Pydantic validation.
    """
    report = report_service.create_report(db, current_user.id, data)
    return _to_response(report)
