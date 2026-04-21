"""Unit tests for Pydantic schema validation."""

import pytest
from pydantic import ValidationError

from app.schemas.auth import LoginRequest
from app.schemas.expense_report import ExpenseReportCreate, ExpenseReportResponse


# ---------------------------------------------------------------------------
# ExpenseReportCreate — valid inputs
# ---------------------------------------------------------------------------


class TestExpenseReportCreateValid:
    def test_valid_payload_is_accepted(self):
        report = ExpenseReportCreate(
            title="Q1 Travel",
            purpose="Client visit",
            total_amount=450.00,
        )
        assert report.title == "Q1 Travel"
        assert report.purpose == "Client visit"
        assert report.total_amount == 450.00

    def test_minimum_positive_amount_is_accepted(self):
        report = ExpenseReportCreate(
            title="Lunch",
            purpose="Team lunch",
            total_amount=0.01,
        )
        assert report.total_amount == 0.01

    def test_title_at_max_length_is_accepted(self):
        long_title = "A" * 255
        report = ExpenseReportCreate(
            title=long_title,
            purpose="Some purpose",
            total_amount=10.0,
        )
        assert len(report.title) == 255


# ---------------------------------------------------------------------------
# ExpenseReportCreate — invalid inputs
# ---------------------------------------------------------------------------


class TestExpenseReportCreateInvalid:
    def test_empty_title_is_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportCreate(title="", purpose="Valid purpose", total_amount=10.0)
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("title",) for e in errors)

    def test_empty_purpose_is_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportCreate(title="Valid title", purpose="", total_amount=10.0)
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("purpose",) for e in errors)

    def test_total_amount_zero_is_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportCreate(
                title="Valid title", purpose="Valid purpose", total_amount=0
            )
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("total_amount",) for e in errors)

    def test_total_amount_negative_is_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportCreate(
                title="Valid title", purpose="Valid purpose", total_amount=-1
            )
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("total_amount",) for e in errors)

    def test_title_exceeding_max_length_is_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportCreate(
                title="A" * 256, purpose="Valid purpose", total_amount=10.0
            )
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("title",) for e in errors)

    def test_missing_title_is_rejected(self):
        with pytest.raises(ValidationError):
            ExpenseReportCreate(purpose="Valid purpose", total_amount=10.0)

    def test_missing_purpose_is_rejected(self):
        with pytest.raises(ValidationError):
            ExpenseReportCreate(title="Valid title", total_amount=10.0)

    def test_missing_total_amount_is_rejected(self):
        with pytest.raises(ValidationError):
            ExpenseReportCreate(title="Valid title", purpose="Valid purpose")


# ---------------------------------------------------------------------------
# ExpenseReportResponse — ORM mode
# ---------------------------------------------------------------------------


class TestExpenseReportResponse:
    def test_from_orm_attributes(self):
        class FakeORM:
            id = 1
            title = "Q1 Travel"
            purpose = "Client visit"
            total_amount = 450.00
            status = "Pending"
            owner_id = 42

        response = ExpenseReportResponse.model_validate(FakeORM())
        assert response.id == 1
        assert response.status == "Pending"
        assert response.owner_id == 42


# ---------------------------------------------------------------------------
# LoginRequest — valid and invalid inputs
# ---------------------------------------------------------------------------


class TestLoginRequest:
    def test_valid_credentials_are_accepted(self):
        req = LoginRequest(username="alice", password="secret")
        assert req.username == "alice"
        assert req.password == "secret"

    def test_missing_username_is_rejected(self):
        with pytest.raises(ValidationError):
            LoginRequest(password="secret")

    def test_missing_password_is_rejected(self):
        with pytest.raises(ValidationError):
            LoginRequest(username="alice")

    def test_missing_both_fields_is_rejected(self):
        with pytest.raises(ValidationError):
            LoginRequest()
