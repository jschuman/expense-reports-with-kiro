"""Pydantic schemas for expense report endpoints."""

from pydantic import BaseModel, ConfigDict, Field


class ExpenseReportCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    purpose: str = Field(..., min_length=1)
    total_amount: float = Field(..., gt=0)


class ExpenseReportResponse(BaseModel):
    id: int
    title: str
    purpose: str
    total_amount: float
    status: str
    owner_id: int

    model_config = ConfigDict(from_attributes=True)
