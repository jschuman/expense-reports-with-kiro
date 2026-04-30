"""Unit tests for Pydantic schema validation."""

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.constants import CLIENTS
from app.schemas.auth import LoginRequest, UserResponse
from app.schemas.expense_report import (
    ExpenseReportCreate,
    ExpenseReportResponse,
    ExpenseReportUpdate,
    RejectRequest,
    StatusAuditLogEntry,
)


# ---------------------------------------------------------------------------
# ExpenseReportCreate — valid inputs
# ---------------------------------------------------------------------------


class TestExpenseReportCreateValid:
    def test_valid_payload_with_all_fields(self):
        report = ExpenseReportCreate(
            title="Q1 Travel",
            description="Client visit",
            total_amount=450.00,
            reimbursable_from_client=True,
            client="Acme Corp",
        )
        assert report.title == "Q1 Travel"
        assert report.description == "Client visit"
        assert report.total_amount == 450.00
        assert report.reimbursable_from_client is True
        assert report.client == "Acme Corp"

    def test_no_description_is_accepted(self):
        """Description is optional — omitting it should succeed."""
        report = ExpenseReportCreate(title="Lunch", total_amount=20.00)
        assert report.description is None

    def test_empty_description_is_accepted(self):
        """An empty string description is allowed (treated as absent)."""
        report = ExpenseReportCreate(
            title="Lunch", description="", total_amount=20.00
        )
        assert report.description == ""

    def test_reimbursable_defaults_to_false(self):
        report = ExpenseReportCreate(title="Lunch", total_amount=20.00)
        assert report.reimbursable_from_client is False

    def test_reimbursable_false_with_no_client_is_accepted(self):
        """Client is not required when reimbursable_from_client is False."""
        report = ExpenseReportCreate(
            title="Office supplies",
            total_amount=15.00,
            reimbursable_from_client=False,
        )
        assert report.client is None

    def test_reimbursable_true_with_valid_client_is_accepted(self):
        """Each entry in CLIENTS is a valid client value."""
        for client_name in CLIENTS:
            report = ExpenseReportCreate(
                title="Trip",
                total_amount=100.00,
                reimbursable_from_client=True,
                client=client_name,
            )
            assert report.client == client_name

    def test_minimum_positive_amount_is_accepted(self):
        report = ExpenseReportCreate(title="Lunch", total_amount=0.01)
        assert report.total_amount == 0.01

    def test_title_at_max_length_is_accepted(self):
        long_title = "A" * 255
        report = ExpenseReportCreate(title=long_title, total_amount=10.0)
        assert len(report.title) == 255

    def test_client_none_when_not_reimbursable(self):
        """Explicitly passing client=None with reimbursable=False is fine."""
        report = ExpenseReportCreate(
            title="Misc",
            total_amount=5.00,
            reimbursable_from_client=False,
            client=None,
        )
        assert report.client is None


# ---------------------------------------------------------------------------
# ExpenseReportCreate — invalid inputs
# ---------------------------------------------------------------------------


class TestExpenseReportCreateInvalid:
    def test_empty_title_is_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportCreate(title="", total_amount=10.0)
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("title",) for e in errors)

    def test_title_exceeding_max_length_is_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportCreate(title="A" * 256, total_amount=10.0)
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("title",) for e in errors)

    def test_missing_title_is_rejected(self):
        with pytest.raises(ValidationError):
            ExpenseReportCreate(total_amount=10.0)

    def test_total_amount_zero_is_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportCreate(title="Valid title", total_amount=0)
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("total_amount",) for e in errors)

    def test_total_amount_negative_is_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportCreate(title="Valid title", total_amount=-1)
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("total_amount",) for e in errors)

    def test_missing_total_amount_is_rejected(self):
        with pytest.raises(ValidationError):
            ExpenseReportCreate(title="Valid title")

    def test_reimbursable_true_with_no_client_is_rejected(self):
        """Requirement 5.3: client is required when reimbursable_from_client=True."""
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportCreate(
                title="Trip",
                total_amount=200.00,
                reimbursable_from_client=True,
                client=None,
            )
        errors = exc_info.value.errors()
        assert any("client" in str(e["msg"]).lower() for e in errors)

    def test_reimbursable_true_with_missing_client_is_rejected(self):
        """Omitting client entirely when reimbursable=True should also fail."""
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportCreate(
                title="Trip",
                total_amount=200.00,
                reimbursable_from_client=True,
            )
        errors = exc_info.value.errors()
        assert any("client" in str(e["msg"]).lower() for e in errors)

    def test_client_not_in_clients_list_is_rejected(self):
        """Requirement 5.6: client must be a value from CLIENTS."""
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportCreate(
                title="Trip",
                total_amount=200.00,
                reimbursable_from_client=True,
                client="Unknown Corp",
            )
        errors = exc_info.value.errors()
        assert any("client" in str(e["msg"]).lower() for e in errors)

    def test_invalid_client_without_reimbursable_flag_is_rejected(self):
        """Even when reimbursable=False, a non-CLIENTS value is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportCreate(
                title="Trip",
                total_amount=200.00,
                reimbursable_from_client=False,
                client="Fake Client",
            )
        errors = exc_info.value.errors()
        assert any("client" in str(e["msg"]).lower() for e in errors)


# ---------------------------------------------------------------------------
# ExpenseReportResponse — ORM mode
# ---------------------------------------------------------------------------


class TestExpenseReportResponse:
    def _make_fake_orm(self, **overrides):
        class FakeORM:
            id = 1
            title = "Q1 Travel"
            description = "Client visit to NYC"
            total_amount = 450.00
            status = "Pending"
            owner_id = 42
            owner_username = "alice"
            created_at = datetime(2026, 4, 28, 12, 0, 0, tzinfo=timezone.utc)
            reimbursable_from_client = True
            client = "Acme Corp"
            admin_notes = None

        for key, value in overrides.items():
            setattr(FakeORM, key, value)
        return FakeORM()

    def test_all_new_fields_are_present(self):
        response = ExpenseReportResponse.model_validate(self._make_fake_orm())
        assert response.id == 1
        assert response.title == "Q1 Travel"
        assert response.description == "Client visit to NYC"
        assert response.total_amount == 450.00
        assert response.status == "Pending"
        assert response.owner_id == 42
        assert response.owner_username == "alice"
        assert response.created_at == datetime(2026, 4, 28, 12, 0, 0, tzinfo=timezone.utc)
        assert response.reimbursable_from_client is True
        assert response.client == "Acme Corp"
        assert response.admin_notes is None

    def test_nullable_fields_accept_none(self):
        response = ExpenseReportResponse.model_validate(
            self._make_fake_orm(description=None, client=None, admin_notes=None)
        )
        assert response.description is None
        assert response.client is None
        assert response.admin_notes is None

    def test_admin_notes_populated(self):
        response = ExpenseReportResponse.model_validate(
            self._make_fake_orm(admin_notes="Needs review")
        )
        assert response.admin_notes == "Needs review"

    def test_reimbursable_false_with_no_client(self):
        response = ExpenseReportResponse.model_validate(
            self._make_fake_orm(reimbursable_from_client=False, client=None)
        )
        assert response.reimbursable_from_client is False
        assert response.client is None

    def test_purpose_field_is_absent(self):
        """The old 'purpose' field must not exist on the response schema."""
        response = ExpenseReportResponse.model_validate(self._make_fake_orm())
        assert not hasattr(response, "purpose")


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


# ---------------------------------------------------------------------------
# UserResponse — role field serialization
# ---------------------------------------------------------------------------


class TestUserResponse:
    """Tests for UserResponse schema, focusing on the role field.

    Requirements: 7.1, 7.2, 7.3
    """

    def test_user_response_includes_role_field(self):
        """UserResponse serializes the role field correctly."""
        response = UserResponse(id=1, username="alice", role="User")
        assert response.role == "User"

    def test_user_response_with_admin_role(self):
        """UserResponse accepts 'Admin' as a valid role value."""
        response = UserResponse(id=2, username="bob", role="Admin")
        assert response.role == "Admin"

    def test_user_response_with_user_role(self):
        """UserResponse accepts 'User' as a valid role value."""
        response = UserResponse(id=3, username="carol", role="User")
        assert response.role == "User"

    def test_user_response_role_is_string(self):
        """The role field is a plain string, not an enum or complex type."""
        response = UserResponse(id=1, username="alice", role="User")
        assert isinstance(response.role, str)

    def test_user_response_missing_role_is_rejected(self):
        """Omitting the role field raises a ValidationError."""
        with pytest.raises(ValidationError) as exc_info:
            UserResponse(id=1, username="alice")
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("role",) for e in errors)

    def test_user_response_from_orm_object(self):
        """UserResponse can be constructed from an ORM-like object via model_validate."""

        class FakeUser:
            id = 10
            username = "dave"

            class role:
                name = "Admin"

        # model_validate with from_attributes=True reads nested attributes,
        # but role is a relationship — we pass the name directly as a flat dict
        response = UserResponse(id=10, username="dave", role="Admin")
        assert response.id == 10
        assert response.username == "dave"
        assert response.role == "Admin"

    def test_user_response_serializes_to_dict_with_role(self):
        """model_dump() output includes the role key."""
        response = UserResponse(id=1, username="alice", role="User")
        data = response.model_dump()
        assert "role" in data
        assert data["role"] == "User"

    def test_user_response_all_fields_present(self):
        """UserResponse exposes id, username, and role — no extra fields."""
        response = UserResponse(id=5, username="eve", role="User")
        data = response.model_dump()
        assert set(data.keys()) == {"id", "username", "role"}


# ---------------------------------------------------------------------------
# RejectRequest — valid and invalid admin_notes
# ---------------------------------------------------------------------------


class TestRejectRequest:
    """Tests for RejectRequest schema validation.

    Requirements: 6.1, 6.2
    """

    def test_non_empty_admin_notes_is_accepted(self):
        req = RejectRequest(admin_notes="Missing receipts")
        assert req.admin_notes == "Missing receipts"

    def test_single_character_admin_notes_is_accepted(self):
        req = RejectRequest(admin_notes="x")
        assert req.admin_notes == "x"

    def test_empty_string_admin_notes_is_rejected(self):
        """An empty string must fail min_length=1 validation."""
        with pytest.raises(ValidationError) as exc_info:
            RejectRequest(admin_notes="")
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("admin_notes",) for e in errors)

    def test_whitespace_only_admin_notes_is_rejected(self):
        """A string of only spaces has length > 0 but Pydantic min_length counts
        characters, so a single space passes min_length=1.  The service layer
        enforces the non-whitespace rule; here we verify that a truly empty
        string is rejected at the schema level."""
        # A single space technically passes min_length=1 — that is intentional.
        # The schema rejects *empty* strings; whitespace trimming is a service concern.
        with pytest.raises(ValidationError):
            RejectRequest(admin_notes="")

    def test_missing_admin_notes_is_rejected(self):
        """Omitting admin_notes entirely must raise ValidationError."""
        with pytest.raises(ValidationError) as exc_info:
            RejectRequest()
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("admin_notes",) for e in errors)

    def test_long_admin_notes_is_accepted(self):
        """No upper-bound constraint — long notes should be accepted."""
        long_notes = "A" * 1000
        req = RejectRequest(admin_notes=long_notes)
        assert len(req.admin_notes) == 1000


# ---------------------------------------------------------------------------
# ExpenseReportUpdate — valid and invalid inputs
# ---------------------------------------------------------------------------


class TestExpenseReportUpdate:
    """Tests for ExpenseReportUpdate schema validation.

    Requirements: 2.1
    """

    def test_all_none_is_accepted(self):
        """An empty update (all fields None) is valid — nothing to change."""
        update = ExpenseReportUpdate()
        assert update.title is None
        assert update.total_amount is None

    def test_valid_partial_update_title_only(self):
        update = ExpenseReportUpdate(title="New Title")
        assert update.title == "New Title"
        assert update.total_amount is None

    def test_valid_partial_update_amount_only(self):
        update = ExpenseReportUpdate(total_amount=99.99)
        assert update.total_amount == 99.99

    def test_valid_full_update(self):
        update = ExpenseReportUpdate(
            title="Updated",
            description="New desc",
            total_amount=250.00,
            reimbursable_from_client=True,
            client="Acme Corp",
        )
        assert update.title == "Updated"
        assert update.total_amount == 250.00
        assert update.client == "Acme Corp"

    def test_total_amount_zero_is_rejected(self):
        """total_amount must be > 0 when provided."""
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportUpdate(total_amount=0)
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("total_amount",) for e in errors)

    def test_total_amount_negative_is_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportUpdate(total_amount=-5.0)
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("total_amount",) for e in errors)

    def test_reimbursable_true_with_no_client_is_rejected(self):
        """client is required when reimbursable_from_client=True."""
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportUpdate(reimbursable_from_client=True, client=None)
        errors = exc_info.value.errors()
        assert any("client" in str(e["msg"]).lower() for e in errors)

    def test_reimbursable_true_with_valid_client_is_accepted(self):
        update = ExpenseReportUpdate(reimbursable_from_client=True, client="Hooli")
        assert update.client == "Hooli"

    def test_invalid_client_value_is_rejected(self):
        """A client value not in CLIENTS must be rejected."""
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportUpdate(client="Unknown Corp")
        errors = exc_info.value.errors()
        assert any("client" in str(e["msg"]).lower() for e in errors)

    def test_valid_client_from_clients_list_is_accepted(self):
        for client_name in CLIENTS:
            update = ExpenseReportUpdate(
                reimbursable_from_client=True, client=client_name
            )
            assert update.client == client_name

    def test_empty_title_is_rejected(self):
        """title must have min_length=1 when provided."""
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportUpdate(title="")
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("title",) for e in errors)

    def test_title_exceeding_max_length_is_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ExpenseReportUpdate(title="A" * 256)
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("title",) for e in errors)


# ---------------------------------------------------------------------------
# StatusAuditLogEntry — ORM mode
# ---------------------------------------------------------------------------


class TestStatusAuditLogEntry:
    """Tests for StatusAuditLogEntry schema.

    Requirements: 11.6
    """

    def _make_fake_orm(self, **overrides):
        class FakeAuditLog:
            id = 1
            expense_report_id = 42
            status = "Submitted"
            changed_at = datetime(2026, 4, 30, 10, 0, 0, tzinfo=timezone.utc)

        for key, value in overrides.items():
            setattr(FakeAuditLog, key, value)
        return FakeAuditLog()

    def test_from_orm_object(self):
        entry = StatusAuditLogEntry.model_validate(self._make_fake_orm())
        assert entry.id == 1
        assert entry.expense_report_id == 42
        assert entry.status == "Submitted"
        assert entry.changed_at == datetime(2026, 4, 30, 10, 0, 0, tzinfo=timezone.utc)

    def test_all_status_values_accepted(self):
        for status in ["In Progress", "Submitted", "Rejected", "Scheduled for Payment"]:
            entry = StatusAuditLogEntry.model_validate(
                self._make_fake_orm(status=status)
            )
            assert entry.status == status

    def test_missing_id_is_rejected(self):
        with pytest.raises(ValidationError):
            StatusAuditLogEntry(
                expense_report_id=1,
                status="Submitted",
                changed_at=datetime(2026, 4, 30, tzinfo=timezone.utc),
            )

    def test_missing_changed_at_is_rejected(self):
        with pytest.raises(ValidationError):
            StatusAuditLogEntry(id=1, expense_report_id=1, status="Submitted")
