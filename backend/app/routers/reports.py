"""Reports router: list, create, update, delete, and status-transition expense reports.

All routes require a valid session cookie (enforced via get_current_user or
get_current_admin).  Business logic and DB interaction are delegated to
report_service and status_service.
"""

from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session, joinedload

from app.db.database import get_db
from app.dependencies import get_current_admin, get_current_user
from app.models.expense_report import ExpenseReport
from app.models.user import User
from app.schemas.expense_report import (
    ExpenseReportCreate,
    ExpenseReportResponse,
    ExpenseReportUpdate,
    RejectRequest,
)
from app.services import report_service, status_service

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

    The report is saved with status="In Progress", owner_id set to the current
    user's id, and created_at set to the current UTC time.

    Returns 201 with the created ExpenseReportResponse on success.
    Returns 401 when no valid session cookie is present.
    Returns 422 when the request body fails Pydantic validation.
    """
    report = report_service.create_report(db, current_user.id, data)
    return _to_response(report)


@router.post("/{report_id}/submit", response_model=ExpenseReportResponse)
def submit_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpenseReportResponse:
    """Transition a report from 'In Progress' or 'Rejected' to 'Submitted'.

    Only the report owner may submit.

    Returns 200 with the updated ExpenseReportResponse on success.
    Returns 401 when no valid session cookie is present.
    Returns 403 when the caller is not the report owner.
    Returns 404 when the report does not exist.
    Returns 409 when the report is not in a submittable state.
    Returns 422 when required fields are not populated.

    Requirements: 3.2, 3.3, 3.5, 3.6
    """
    report = status_service.submit_report(db, report_id, current_user)
    return _to_response(report)


@router.post("/{report_id}/accept", response_model=ExpenseReportResponse)
def accept_report(
    report_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> ExpenseReportResponse:
    """Transition a report from 'Submitted' to 'Scheduled for Payment'.

    Only Admin users may accept a report.

    Returns 200 with the updated ExpenseReportResponse on success.
    Returns 401 when no valid session cookie is present.
    Returns 403 when the caller does not have the Admin role.
    Returns 404 when the report does not exist.
    Returns 409 when the report is not in 'Submitted' state.

    Requirements: 5.2, 5.3, 5.4
    """
    report = status_service.accept_report(db, report_id, current_user)
    return _to_response(report)


@router.post("/{report_id}/reject", response_model=ExpenseReportResponse)
def reject_report(
    report_id: int,
    body: RejectRequest,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
) -> ExpenseReportResponse:
    """Transition a report from 'Submitted' to 'Rejected', persisting admin_notes.

    Only Admin users may reject a report.  ``admin_notes`` must be non-empty.

    Returns 200 with the updated ExpenseReportResponse on success.
    Returns 401 when no valid session cookie is present.
    Returns 403 when the caller does not have the Admin role.
    Returns 404 when the report does not exist.
    Returns 409 when the report is not in 'Submitted' state.
    Returns 422 when ``admin_notes`` is empty or missing.

    Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
    """
    report = status_service.reject_report(db, report_id, body.admin_notes, current_user)
    return _to_response(report)


@router.put("/{report_id}", response_model=ExpenseReportResponse)
def update_report(
    report_id: int,
    data: ExpenseReportUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpenseReportResponse:
    """Update editable fields on an expense report.

    Only the report owner may update, and only while the report is in an
    editable state ('In Progress' or 'Rejected').

    Returns 200 with the updated ExpenseReportResponse on success.
    Returns 401 when no valid session cookie is present.
    Returns 403 when the caller is not the report owner.
    Returns 404 when the report does not exist.
    Returns 409 when the report is in a read-only state.
    Returns 422 when the request body fails Pydantic validation.

    Requirements: 2.1, 2.4, 4.1, 7.1, 7.6
    """
    report = report_service.update_report(db, report_id, data, current_user)
    return _to_response(report)


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete an expense report.

    Only the report owner may delete, and only while the report is in an
    editable state ('In Progress' or 'Rejected').

    Returns 204 No Content on success.
    Returns 401 when no valid session cookie is present.
    Returns 403 when the caller is not the report owner.
    Returns 404 when the report does not exist.
    Returns 409 when the report is in a read-only state.

    Requirements: 2.2, 2.5, 4.2, 7.2, 8.2
    """
    report_service.delete_report(db, report_id, current_user)
