from __future__ import annotations

from typing import Optional

from passlib.context import CryptContext
from sqlalchemy.orm import Session

# bcrypt with cost factor 12 (≥ 12 as required)
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(password: str) -> str:
    """Hash a plaintext password and return the bcrypt hash."""
    return _pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored bcrypt hash."""
    return _pwd_context.verify(plain_password, hashed_password)


def authenticate_user(db: Session, username: str, password: str) -> Optional["User"]:  # noqa: F821
    """Return the User if credentials are valid, otherwise None.

    Queries the database for a user with the given username, then verifies
    the supplied plaintext password against the stored bcrypt hash.
    Routers must delegate all credential verification to this function —
    no DB queries or passlib calls belong in the router layer.
    """
    from app.models.user import User  # local import avoids circular dependency

    user: Optional[User] = db.query(User).filter(User.username == username).first()
    if user is None:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user
