"""Lines router: create, list, update, and delete expense lines for a report.

All routes require a valid session cookie (enforced via get_current_user).
Business logic and DB interaction are delegated to line_service.

Endpoints are mounted under /reports (see main.py), so the full paths are:
  POST   /reports/{report_id}/lines
  GET    /reports/{report_id}/lines
  PUT    /reports/{report_id}/lines/{line_id}
  DELETE /reports/{report_id}/lines/{line_id}

Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7, 7.8, 7.9
"""

from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.expense_line import (
    ExpenseLineCreate,
    ExpenseLineResponse,
    ExpenseLineUpdate,
)
from app.services import line_service

router = APIRouter(tags=["lines"])


@router.post(
    "/{report_id}/lines",
    response_model=ExpenseLineResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_line(
    report_id: int,
    data: ExpenseLineCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpenseLineResponse:
    """Create a new expense line for the specified report.

    Returns 201 with the created ExpenseLineResponse on success.
    Returns 401 when no valid session cookie is present.
    Returns 403 when the caller is not the report owner.
    Returns 404 when the report does not exist.
    Returns 409 when the report status is locked (Submitted or Scheduled for Payment).
    Returns 422 when the request body fails Pydantic validation.

    Requirements: 7.1, 7.6, 7.8, 7.9
    """
    line = line_service.create_line(db, report_id, data, current_user)
    return ExpenseLineResponse.model_validate(line)


@router.get(
    "/{report_id}/lines",
    response_model=List[ExpenseLineResponse],
)
def list_lines(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[ExpenseLineResponse]:
    """Return all expense lines for the specified report.

    Returns 200 with a list of ExpenseLineResponse objects on success.
    Returns 401 when no valid session cookie is present.
    Returns 403 when the caller is not the owner and does not have Admin role.
    Returns 404 when the report does not exist.

    Requirements: 7.2, 7.7, 7.9
    """
    lines = line_service.list_lines(db, report_id, current_user)
    return [ExpenseLineResponse.model_validate(line) for line in lines]


@router.put(
    "/{report_id}/lines/{line_id}",
    response_model=ExpenseLineResponse,
)
def update_line(
    report_id: int,
    line_id: int,
    data: ExpenseLineUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpenseLineResponse:
    """Update an existing expense line (partial update — only provided fields applied).

    Returns 200 with the updated ExpenseLineResponse on success.
    Returns 401 when no valid session cookie is present.
    Returns 403 when the caller is not the report owner.
    Returns 404 when the report or line does not exist, or line belongs to a different report.
    Returns 409 when the report status is locked.
    Returns 422 when the request body fails Pydantic validation.

    Requirements: 7.3, 7.7, 7.8, 7.9
    """
    line = line_service.update_line(db, report_id, line_id, data, current_user)
    return ExpenseLineResponse.model_validate(line)


@router.delete(
    "/{report_id}/lines/{line_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_line(
    report_id: int,
    line_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete an expense line permanently.

    Returns 204 No Content on success.
    Returns 401 when no valid session cookie is present.
    Returns 403 when the caller is not the report owner.
    Returns 404 when the report or line does not exist, or line belongs to a different report.
    Returns 409 when the report status is locked.

    Requirements: 7.4, 7.7, 7.9
    """
    line_service.delete_line(db, report_id, line_id, current_user)
