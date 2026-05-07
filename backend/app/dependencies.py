"""FastAPI dependencies for the Expense Report Web App."""

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.user import User
from app.services.file_storage import FileStorageManager

# Singleton FileStorageManager shared across requests.
_storage_manager: FileStorageManager | None = None


def get_storage() -> FileStorageManager:
    """FastAPI dependency that returns the shared FileStorageManager instance."""
    global _storage_manager
    if _storage_manager is None:
        _storage_manager = FileStorageManager()
    return _storage_manager


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


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency that requires the current user to have the Admin role.

    Delegates to ``get_current_user`` for authentication, then checks that
    ``user.role.name == "Admin"``.  Raises ``HTTPException(403)`` if the user
    is authenticated but does not hold the Admin role.
    """
    if current_user.role is None or current_user.role.name != "Admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return current_user
