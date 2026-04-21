"""FastAPI dependencies for the Expense Report Web App."""

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.user import User


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency that returns the currently authenticated user.

    Reads ``user_id`` from the signed session cookie set by
    ``SessionMiddleware``.  Raises ``HTTPException(401)`` if:
    - the session contains no ``user_id`` key, or
    - no ``User`` row exists for that id.
    """
    user_id = request.session.get("user_id")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return user
