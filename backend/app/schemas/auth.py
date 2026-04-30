"""Pydantic schemas for authentication endpoints."""

from pydantic import BaseModel, ConfigDict


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    """The name of the role assigned to this user (e.g. 'User' or 'Admin').

    Populated from the related Role entity. Included in login and /me responses
    so the frontend can adapt its UI based on the authenticated user's permissions.
    """

    model_config = ConfigDict(from_attributes=True)
