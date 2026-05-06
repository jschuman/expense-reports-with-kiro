"""Unit tests for ExpenseLine Pydantic schema validation.

Requirements: 2.5, 2.6, 2.7, 3.5
"""

from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas.expense_line import (
    ExpenseLineCreate,
    ExpenseLineResponse,
    ExpenseLineUpdate,
)


# ---------------------------------------------------------------------------
# ExpenseLineCreate — valid inputs
# ---------------------------------------------------------------------------


class TestExpenseLineCreateValid:
    def test_valid_payload_with_all_fields(self):
        line = ExpenseLineCreate(
            description="Taxi to airport",
            amount=45.50,
            incurred_date=date(2026, 4, 23),
        )
        assert line.description == "Taxi to airport"
        assert line.amount == 45.50
        assert line.incurred_date == date(2026, 4, 23)

    def test_valid_payload_with_iso_date_string(self):
        """Pydantic coerces an ISO 8601 date string to a date object."""
        line = ExpenseLineCreate(
            description="Hotel stay",
            amount=120.00,
            incurred_date="2026-04-23",
        )
        assert line.incurred_date == date(2026, 4, 23)

    def test_minimum_positive_amount_is_accepted(self):
        line = ExpenseLineCreate(
            description="Coffee",
            amount=0.01,
            incurred_date=date(2026, 1, 1),
        )
        assert line.amount == pytest.approx(0.01)

    def test_large_amount_is_accepted(self):
        line = ExpenseLineCreate(
            description="Conference registration",
            amount=9999.99,
            incurred_date=date(2026, 12, 31),
        )
        assert line.amount == pytest.approx(9999.99)

    def test_single_character_description_is_accepted(self):
        """min_length=1 means a single character is the minimum valid description."""
        line = ExpenseLineCreate(
            description="X",
            amount=10.0,
            incurred_date=date(2026, 6, 15),
        )
        assert line.description == "X"


# ---------------------------------------------------------------------------
# ExpenseLineCreate — invalid inputs
# ---------------------------------------------------------------------------


class TestExpenseLineCreateInvalid:
    def test_missing_description_is_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ExpenseLineCreate(amount=10.0, incurred_date=date(2026, 4, 23))
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("description",) for e in errors)

    def test_empty_description_is_rejected(self):
        """An empty string fails min_length=1."""
        with pytest.raises(ValidationError) as exc_info:
            ExpenseLineCreate(
                description="",
                amount=10.0,
                incurred_date=date(2026, 4, 23),
            )
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("description",) for e in errors)

    def test_zero_amount_is_rejected(self):
        """amount must be > 0 (gt=0), so 0 is invalid."""
        with pytest.raises(ValidationError) as exc_info:
            ExpenseLineCreate(
                description="Lunch",
                amount=0,
                incurred_date=date(2026, 4, 23),
            )
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("amount",) for e in errors)

    def test_negative_amount_is_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ExpenseLineCreate(
                description="Lunch",
                amount=-5.0,
                incurred_date=date(2026, 4, 23),
            )
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("amount",) for e in errors)

    def test_missing_amount_is_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ExpenseLineCreate(
                description="Lunch",
                incurred_date=date(2026, 4, 23),
            )
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("amount",) for e in errors)

    def test_missing_date_is_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ExpenseLineCreate(description="Lunch", amount=10.0)
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("incurred_date",) for e in errors)

    def test_invalid_date_string_is_rejected(self):
        """A non-date string must fail Pydantic date coercion."""
        with pytest.raises(ValidationError) as exc_info:
            ExpenseLineCreate(
                description="Lunch",
                amount=10.0,
                incurred_date="not-a-date",
            )
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("incurred_date",) for e in errors)

    def test_all_fields_missing_is_rejected(self):
        with pytest.raises(ValidationError):
            ExpenseLineCreate()


# ---------------------------------------------------------------------------
# ExpenseLineUpdate — valid inputs
# ---------------------------------------------------------------------------


class TestExpenseLineUpdateValid:
    def test_description_only_is_accepted(self):
        update = ExpenseLineUpdate(description="Updated description")
        assert update.description == "Updated description"
        assert update.amount is None
        assert update.incurred_date is None

    def test_amount_only_is_accepted(self):
        update = ExpenseLineUpdate(amount=99.99)
        assert update.amount == pytest.approx(99.99)
        assert update.description is None
        assert update.incurred_date is None

    def test_incurred_date_only_is_accepted(self):
        update = ExpenseLineUpdate(incurred_date=date(2026, 5, 1))
        assert update.incurred_date == date(2026, 5, 1)
        assert update.description is None
        assert update.amount is None

    def test_all_fields_provided_is_accepted(self):
        update = ExpenseLineUpdate(
            description="Full update",
            amount=150.00,
            incurred_date=date(2026, 3, 10),
        )
        assert update.description == "Full update"
        assert update.amount == pytest.approx(150.00)
        assert update.incurred_date == date(2026, 3, 10)

    def test_two_fields_provided_is_accepted(self):
        update = ExpenseLineUpdate(description="Partial", amount=25.0)
        assert update.description == "Partial"
        assert update.amount == pytest.approx(25.0)
        assert update.incurred_date is None

    def test_incurred_date_as_iso_string_is_accepted(self):
        update = ExpenseLineUpdate(incurred_date="2026-07-04")
        assert update.incurred_date == date(2026, 7, 4)


# ---------------------------------------------------------------------------
# ExpenseLineUpdate — invalid inputs
# ---------------------------------------------------------------------------


class TestExpenseLineUpdateInvalid:
    def test_all_none_payload_is_rejected_by_model_validator(self):
        """Submitting no fields at all must be rejected — at least one is required."""
        with pytest.raises(ValidationError) as exc_info:
            ExpenseLineUpdate()
        errors = exc_info.value.errors()
        assert any(
            "at least one field" in str(e.get("msg", "")).lower() for e in errors
        )

    def test_explicit_all_none_payload_is_rejected(self):
        """Explicitly passing None for every field must also be rejected."""
        with pytest.raises(ValidationError) as exc_info:
            ExpenseLineUpdate(description=None, amount=None, incurred_date=None)
        errors = exc_info.value.errors()
        assert any(
            "at least one field" in str(e.get("msg", "")).lower() for e in errors
        )

    def test_empty_description_is_rejected(self):
        """description has min_length=1 even in update mode."""
        with pytest.raises(ValidationError) as exc_info:
            ExpenseLineUpdate(description="")
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("description",) for e in errors)

    def test_zero_amount_is_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ExpenseLineUpdate(amount=0)
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("amount",) for e in errors)

    def test_negative_amount_is_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ExpenseLineUpdate(amount=-1.0)
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("amount",) for e in errors)

    def test_invalid_date_string_is_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ExpenseLineUpdate(incurred_date="not-a-date")
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("incurred_date",) for e in errors)


# ---------------------------------------------------------------------------
# ExpenseLineResponse — ORM mode
# ---------------------------------------------------------------------------


class TestExpenseLineResponse:
    def _make_fake_orm(self, **overrides):
        class FakeORM:
            id = 1
            report_id = 42
            description = "Taxi to airport"
            amount = 45.50
            incurred_date = date(2026, 4, 23)

        for key, value in overrides.items():
            setattr(FakeORM, key, value)
        return FakeORM()

    def test_from_orm_object_all_fields(self):
        response = ExpenseLineResponse.model_validate(self._make_fake_orm())
        assert response.id == 1
        assert response.report_id == 42
        assert response.description == "Taxi to airport"
        assert response.amount == pytest.approx(45.50)
        assert response.incurred_date == date(2026, 4, 23)

    def test_from_orm_object_different_values(self):
        response = ExpenseLineResponse.model_validate(
            self._make_fake_orm(
                id=99,
                report_id=7,
                description="Hotel",
                amount=200.00,
                incurred_date=date(2026, 1, 15),
            )
        )
        assert response.id == 99
        assert response.report_id == 7
        assert response.description == "Hotel"
        assert response.amount == pytest.approx(200.00)
        assert response.incurred_date == date(2026, 1, 15)

    def test_missing_id_is_rejected(self):
        with pytest.raises(ValidationError):
            ExpenseLineResponse(
                report_id=1,
                description="Test",
                amount=10.0,
                incurred_date=date(2026, 4, 23),
            )

    def test_missing_report_id_is_rejected(self):
        with pytest.raises(ValidationError):
            ExpenseLineResponse(
                id=1,
                description="Test",
                amount=10.0,
                incurred_date=date(2026, 4, 23),
            )

    def test_serializes_date_as_iso_string(self):
        """model_dump() should serialize incurred_date as an ISO date string."""
        response = ExpenseLineResponse.model_validate(self._make_fake_orm())
        data = response.model_dump()
        # date objects serialize to date objects in model_dump by default;
        # verify the field is present and correct
        assert data["incurred_date"] == date(2026, 4, 23)

    def test_all_expected_fields_present(self):
        response = ExpenseLineResponse.model_validate(self._make_fake_orm())
        data = response.model_dump()
        assert set(data.keys()) == {"id", "report_id", "description", "amount", "incurred_date"}
