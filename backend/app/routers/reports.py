"""Reports router: list and create expense reports.

All routes require a valid session cookie (enforced via get_current_user).
Business logic and DB interaction are delegated to report_service.
"""

from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.expense_report import ExpenseReportCreate, ExpenseReportResponse
from app.services import report_service

router = APIRouter(tags=["reports"])


@router.get("", response_model=List[ExpenseReportResponse])
def list_reports(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[ExpenseReportResponse]:
    """Return all expense reports belonging to the authenticated user.

    Returns an empty list when the user has no reports.
    Returns 401 when no valid session cookie is present (raised by get_current_user).
    """
    reports = report_service.get_reports_for_user(db, current_user.id)
    return [ExpenseReportResponse.model_validate(r) for r in reports]


@router.post("", response_model=ExpenseReportResponse, status_code=status.HTTP_201_CREATED)
def create_report(
    data: ExpenseReportCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpenseReportResponse:
    """Create a new expense report for the authenticated user.

    The report is saved with status="Pending" and owner_id set to the
    current user's id.

    Returns 201 with the created ExpenseReportResponse on success.
    Returns 401 when no valid session cookie is present.
    Returns 422 when the request body fails Pydantic validation
    (empty title/purpose, non-positive total_amount).
    """
    report = report_service.create_report(db, current_user.id, data)
    return ExpenseReportResponse.model_validate(report)
