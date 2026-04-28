"""Clients router: return the list of available client names.

All routes require a valid session cookie (enforced via get_current_user).
"""

from typing import List

from fastapi import APIRouter, Depends

from app.constants import CLIENTS
from app.dependencies import get_current_user
from app.models.user import User

router = APIRouter(tags=["clients"])


@router.get("", response_model=List[str])
def list_clients(
    current_user: User = Depends(get_current_user),
) -> List[str]:
    """Return the list of available client names.

    Returns 200 with the full CLIENTS list for authenticated users.
    Returns 401 when no valid session cookie is present (raised by get_current_user).
    """
    return CLIENTS
