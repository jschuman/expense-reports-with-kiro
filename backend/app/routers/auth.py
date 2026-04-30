"""Auth router: login, logout, and session introspection."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import LoginRequest, UserResponse
from app.services import auth_service

router = APIRouter(tags=["auth"])


@router.post("/login", response_model=UserResponse)
def login(
    credentials: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> UserResponse:
    """Authenticate a user and establish a session via HTTP-only cookie.

    Returns the authenticated user's profile on success (200).
    Returns 401 if the credentials are invalid.
    Returns 422 if the request body is malformed (handled by FastAPI/Pydantic).
    """
    user: User | None = auth_service.authenticate_user(
        db, credentials.username, credentials.password
    )
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    request.session["user_id"] = user.id

    # Eagerly load role relationship to populate the role field in the response.
    # db.refresh with attribute_names ensures the role is loaded within this
    # session before the response is serialised.
    db.refresh(user, attribute_names=["role"])

    if user.role is None:
        # Data integrity violation: user exists but has no valid role.
        # Per Requirement 6.4, authentication must be rejected.
        request.session.clear()
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return UserResponse(id=user.id, username=user.username, role=user.role.name)


@router.post("/logout")
def logout(request: Request) -> dict:
    """Clear the current session cookie, logging the user out."""
    request.session.clear()
    return {"detail": "Logged out"}


@router.get("/me", response_model=UserResponse)
def me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    """Return the currently authenticated user.

    Used by the frontend to restore session state on page load.
    Returns 401 if no valid session cookie is present (raised by get_current_user).
    """
    # Eagerly load role relationship to populate the role field in the response.
    db.refresh(current_user, attribute_names=["role"])

    return UserResponse(id=current_user.id, username=current_user.username, role=current_user.role.name)
