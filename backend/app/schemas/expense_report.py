"""Pydantic schemas for expense report endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RejectRequest(BaseModel):
    """Request body for POST /reports/{id}/reject."""

    admin_notes: str = Field(..., min_length=1, description="Reason for rejection (required, non-empty)")

    @model_validator(mode="after")
    def validate_admin_notes_not_whitespace(self) -> "RejectRequest":
        if not self.admin_notes.strip():
            raise ValueError("admin_notes must not be blank or whitespace-only")
        return self


class ExpenseReportUpdate(BaseModel):
    """Request body for PUT /reports/{id}. All fields optional."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None)
    reimbursable_from_client: Optional[bool] = Field(default=None)
    client: Optional[str] = Field(default=None)

    @model_validator(mode="after")
    def validate_client(self) -> "ExpenseReportUpdate":
        if self.reimbursable_from_client and not self.client:
            raise ValueError("client is required when reimbursable_from_client is true")
        if self.client is not None:
            from app.constants import CLIENTS

            if self.client not in CLIENTS:
                raise ValueError(f"client must be one of: {CLIENTS}")
        return self


class AdminExpenseReportUpdate(BaseModel):
    """Request body for PUT /reports/{id} when caller is Admin. All fields optional."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None)
    reimbursable_from_client: Optional[bool] = Field(default=None)
    client: Optional[str] = Field(default=None)
    admin_notes: Optional[str] = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_client(self) -> "AdminExpenseReportUpdate":
        if self.reimbursable_from_client and not self.client:
            raise ValueError("client is required when reimbursable_from_client is true")
        if self.client is not None:
            from app.constants import CLIENTS

            if self.client not in CLIENTS:
                raise ValueError(f"client must be one of: {CLIENTS}")
        return self


class StatusAuditLogEntry(BaseModel):
    """Response schema for a single audit log entry."""

    id: int
    expense_report_id: int
    status: str
    changed_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExpenseReportCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None)
    reimbursable_from_client: bool = Field(default=False)
    client: Optional[str] = Field(default=None)

    @model_validator(mode="after")
    def validate_client(self) -> "ExpenseReportCreate":
        if self.reimbursable_from_client and not self.client:
            raise ValueError("client is required when reimbursable_from_client is true")
        if self.client is not None:
            from app.constants import CLIENTS

            if self.client not in CLIENTS:
                raise ValueError(f"client must be one of: {CLIENTS}")
        return self


class ExpenseReportResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    total_amount: float
    status: str
    owner_id: int
    owner_username: str
    created_at: datetime
    reimbursable_from_client: bool
    client: Optional[str]
    admin_notes: Optional[str]

    model_config = ConfigDict(from_attributes=True)
