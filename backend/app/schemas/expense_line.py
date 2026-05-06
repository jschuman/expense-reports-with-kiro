"""Pydantic schemas for expense line endpoints."""

from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ExpenseLineCreate(BaseModel):
    """Request body for POST /reports/{report_id}/lines."""

    description: str = Field(..., min_length=1)
    amount: float = Field(..., gt=0)
    incurred_date: date  # ISO 8601 date string in request, e.g. "2026-04-23"


class ExpenseLineUpdate(BaseModel):
    """Request body for PUT /reports/{report_id}/lines/{line_id}. All fields optional."""

    description: Optional[str] = Field(default=None, min_length=1)
    amount: Optional[float] = Field(default=None, gt=0)
    incurred_date: Optional[date] = Field(default=None)

    @model_validator(mode="after")
    def at_least_one_field(self) -> "ExpenseLineUpdate":
        if all(v is None for v in [self.description, self.amount, self.incurred_date]):
            raise ValueError("At least one field must be provided for update")
        return self


class ExpenseLineResponse(BaseModel):
    """Response schema for a single expense line."""

    id: int
    report_id: int
    description: str
    amount: float
    incurred_date: date  # serialized as "YYYY-MM-DD"

    model_config = ConfigDict(from_attributes=True)
