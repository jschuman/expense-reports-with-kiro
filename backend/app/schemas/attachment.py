"""Pydantic schemas for attachment endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, BaseModel


class AttachmentMetadataResponse(BaseModel):
    """Response schema for attachment metadata.

    Returned by POST (upload), GET /metadata, and as part of line responses
    when an attachment is present.

    FastAPI serializes ``datetime`` fields to ISO 8601 UTC strings
    automatically when using ``response_model``.
    """

    id: int
    file_name: str
    file_size: int  # bytes
    mime_type: str
    created_at: datetime  # ISO 8601 UTC

    model_config = ConfigDict(from_attributes=True)
