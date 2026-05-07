"""Unit tests for the AttachmentMetadataResponse Pydantic schema.

Tests cover:
- Schema validates correct data
- Schema rejects invalid data types
- datetime field serializes to ISO 8601 UTC format
- ORM model compatibility via from_attributes=True
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta

import pytest
from pydantic import ValidationError

from app.schemas.attachment import AttachmentMetadataResponse


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _valid_data(**overrides) -> dict:
    defaults = {
        "id": 1,
        "file_name": "receipt.pdf",
        "file_size": 12345,
        "mime_type": "application/pdf",
        "created_at": datetime(2026, 5, 7, 12, 0, 0, tzinfo=timezone.utc),
    }
    defaults.update(overrides)
    return defaults


# ---------------------------------------------------------------------------
# Valid data
# ---------------------------------------------------------------------------


class TestAttachmentMetadataResponseValid:
    def test_valid_payload_creates_instance(self):
        schema = AttachmentMetadataResponse(**_valid_data())
        assert schema.id == 1
        assert schema.file_name == "receipt.pdf"
        assert schema.file_size == 12345
        assert schema.mime_type == "application/pdf"
        assert schema.created_at == datetime(2026, 5, 7, 12, 0, 0, tzinfo=timezone.utc)

    def test_all_supported_mime_types_accepted(self):
        """Schema does not restrict mime_type values — any string is accepted."""
        for mime in [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
            "application/vnd.google-apps.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "application/vnd.google-apps.spreadsheet",
        ]:
            schema = AttachmentMetadataResponse(**_valid_data(mime_type=mime))
            assert schema.mime_type == mime

    def test_large_file_size_accepted(self):
        schema = AttachmentMetadataResponse(**_valid_data(file_size=10 * 1024 * 1024))
        assert schema.file_size == 10 * 1024 * 1024

    def test_datetime_with_offset_timezone_accepted(self):
        """Timezone-aware datetimes with offsets other than UTC should be accepted."""
        eastern = datetime(2026, 5, 7, 8, 0, 0, tzinfo=timezone(timedelta(hours=-4)))
        schema = AttachmentMetadataResponse(**_valid_data(created_at=eastern))
        assert schema.created_at == eastern

    def test_naive_datetime_accepted(self):
        """Pydantic accepts naive datetimes for datetime fields."""
        naive = datetime(2026, 5, 7, 12, 0, 0)
        schema = AttachmentMetadataResponse(**_valid_data(created_at=naive))
        assert schema.created_at == naive


# ---------------------------------------------------------------------------
# Invalid data
# ---------------------------------------------------------------------------


class TestAttachmentMetadataResponseInvalid:
    def test_missing_id_raises_validation_error(self):
        data = _valid_data()
        del data["id"]
        with pytest.raises(ValidationError):
            AttachmentMetadataResponse(**data)

    def test_missing_file_name_raises_validation_error(self):
        data = _valid_data()
        del data["file_name"]
        with pytest.raises(ValidationError):
            AttachmentMetadataResponse(**data)

    def test_missing_file_size_raises_validation_error(self):
        data = _valid_data()
        del data["file_size"]
        with pytest.raises(ValidationError):
            AttachmentMetadataResponse(**data)

    def test_missing_mime_type_raises_validation_error(self):
        data = _valid_data()
        del data["mime_type"]
        with pytest.raises(ValidationError):
            AttachmentMetadataResponse(**data)

    def test_missing_created_at_raises_validation_error(self):
        data = _valid_data()
        del data["created_at"]
        with pytest.raises(ValidationError):
            AttachmentMetadataResponse(**data)

    def test_non_integer_id_raises_validation_error(self):
        with pytest.raises(ValidationError):
            AttachmentMetadataResponse(**_valid_data(id="not-an-int"))

    def test_non_integer_file_size_raises_validation_error(self):
        with pytest.raises(ValidationError):
            AttachmentMetadataResponse(**_valid_data(file_size="big"))

    def test_non_string_file_name_raises_validation_error(self):
        """Pydantic v2 rejects non-string values for str fields (no implicit coercion)."""
        with pytest.raises(ValidationError):
            AttachmentMetadataResponse(**_valid_data(file_name=123))

    def test_invalid_datetime_raises_validation_error(self):
        with pytest.raises(ValidationError):
            AttachmentMetadataResponse(**_valid_data(created_at="not-a-date"))


# ---------------------------------------------------------------------------
# datetime serialization
# ---------------------------------------------------------------------------


class TestAttachmentMetadataResponseDatetimeSerialization:
    def test_model_json_serializes_created_at_to_iso8601(self):
        """model.model_dump_json() must produce an ISO 8601-compatible string."""
        dt = datetime(2026, 5, 7, 12, 30, 0, tzinfo=timezone.utc)
        schema = AttachmentMetadataResponse(**_valid_data(created_at=dt))
        json_str = schema.model_dump_json()
        # ISO 8601 UTC strings contain 'T' separator and timezone info
        assert "2026-05-07" in json_str
        assert "12:30:00" in json_str

    def test_model_dump_preserves_datetime_object(self):
        """model.model_dump() must preserve the datetime object (not stringify it)."""
        dt = datetime(2026, 5, 7, 9, 0, 0, tzinfo=timezone.utc)
        schema = AttachmentMetadataResponse(**_valid_data(created_at=dt))
        dumped = schema.model_dump()
        assert isinstance(dumped["created_at"], datetime)
        assert dumped["created_at"] == dt


# ---------------------------------------------------------------------------
# ORM compatibility (from_attributes=True)
# ---------------------------------------------------------------------------


class TestAttachmentMetadataResponseOrmMode:
    def test_model_validate_from_orm_like_object(self):
        """model_validate() must work on objects with attribute-style access."""

        class FakeOrmAttachment:
            id = 42
            file_name = "expense.docx"
            file_size = 9876
            mime_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            created_at = datetime(2026, 1, 15, 8, 0, 0, tzinfo=timezone.utc)

        schema = AttachmentMetadataResponse.model_validate(FakeOrmAttachment())
        assert schema.id == 42
        assert schema.file_name == "expense.docx"
        assert schema.file_size == 9876
        assert schema.mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        assert schema.created_at == datetime(2026, 1, 15, 8, 0, 0, tzinfo=timezone.utc)
