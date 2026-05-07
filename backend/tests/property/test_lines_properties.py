"""Property-based tests for expense lines using Hypothesis.

# Feature: expense-report-lines

Properties tested:
  Property 1: Line creation round-trip preserves all fields
  Property 2: Invalid line creation is always rejected
  Property 3: Line update round-trip preserves updated fields
  Property 4: Non-owner mutation is always forbidden
  Property 5: Status locking prevents all line mutations
  Property 6: Total amount always equals the sum of line amounts
  Property 7: Line deletion removes the line
  Property 8: Cascade delete removes all lines
  Property 9: Unauthenticated requests to line endpoints are always rejected
  Property 10: Admin can read lines for any report
  Property 11: Non-owner non-admin cannot read lines

Requirements: 1.1, 1.5, 2.4, 2.5, 2.6, 3.4, 3.6, 3.7, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 7.5, 7.9, 8.1, 8.2, 8.3
"""

from datetime import date, datetime, timedelta, timezone

import httpx
import pytest
from hypothesis import HealthCheck, given, settings, strategies as st
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base, get_db
from app.main import app
from app.models.expense_line import ExpenseLine
from app.models.expense_report import ExpenseReport
from app.models.role import Role
from app.models.user import User
from app.services.auth_service import hash_password


# ---------------------------------------------------------------------------
# Pre-computed password hash for test users
# ---------------------------------------------------------------------------

# Pre-compute a bcrypt hash once at module load time to avoid expensive hashing
# in tests. bcrypt with 12 rounds takes ~200-400ms per hash. With 100 examples
# per property test, this optimization reduces test execution time significantly.
_TEST_PASSWORD_HASH = hash_password("test_password")


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

# Valid description: non-empty printable ASCII string
_valid_description_st = st.text(
    alphabet=st.characters(min_codepoint=33, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
    min_size=1,
    max_size=200,
)

# Valid amount: positive float
_valid_amount_st = st.floats(
    min_value=0.01, max_value=100_000.0, allow_nan=False, allow_infinity=False
)

# Valid incurred_date: date within a reasonable range
_valid_date_st = st.dates(
    min_value=date(2020, 1, 1),
    max_value=date(2030, 12, 31),
)

# Locked statuses that prevent mutations
_locked_status_st = st.sampled_from(["Submitted", "Scheduled for Payment"])


# ---------------------------------------------------------------------------
# Helper function to create test client
# ---------------------------------------------------------------------------


def create_test_client():
    """Create a fresh httpx.AsyncClient backed by an in-memory SQLite DB."""
    import app.models as _models  # noqa: F401

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine)

    # Seed roles required by the User model's NOT NULL role_id constraint
    session = TestSession()
    try:
        session.add(Role(id=1, name="User"))
        session.add(Role(id=2, name="Admin"))
        session.commit()
    finally:
        session.close()

    def override_get_db():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db

    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://test")
    client._test_session_factory = TestSession  # type: ignore[attr-defined]
    client._engine = engine  # type: ignore[attr-defined]
    return client


def cleanup_test_client(client):
    """Clean up test client resources."""
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=client._engine)  # type: ignore[attr-defined]


async def _create_user_and_login(client, username: str, role_id: int = 1) -> int:
    """Create a user in the DB and log them in. Returns the user id."""
    session = client._test_session_factory()  # type: ignore[attr-defined]
    try:
        user = User(username=username, hashed_password=_TEST_PASSWORD_HASH, role_id=role_id)
        session.add(user)
        session.commit()
        session.refresh(user)
        user_id = user.id
    finally:
        session.close()

    login_resp = await client.post(
        "/auth/login",
        json={"username": username, "password": "test_password"},
    )
    assert login_resp.status_code == 200
    return user_id


async def _create_report(client, title: str = "Test Report") -> int:
    """Create a report for the currently logged-in user. Returns report id."""
    resp = await client.post(
        "/reports",
        json={"title": title},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _set_report_status(client, report_id: int, status: str) -> None:
    """Directly set a report's status in the DB (bypasses business logic)."""
    session = client._test_session_factory()  # type: ignore[attr-defined]
    try:
        report = session.get(ExpenseReport, report_id)
        report.status = status
        session.commit()
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Property 1: Line creation round-trip preserves all fields
# **Validates: Requirements 1.1, 2.4, 7.5**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    description=_valid_description_st,
    amount=_valid_amount_st,
    incurred_date=_valid_date_st,
)
async def test_property_1_line_creation_round_trip(description, amount, incurred_date):
    """Property 1: Line creation round-trip preserves all fields.

    # Feature: expense-report-lines, Property 1: Line creation round-trip preserves all fields

    For any valid ExpenseLineCreate payload (non-empty description, positive amount,
    valid date), submitting it via POST /reports/{id}/lines and then retrieving lines
    via GET /reports/{id}/lines SHALL return a record containing the same description,
    amount, and incurred_date.

    **Validates: Requirements 1.1, 2.4, 7.5**
    """
    client = create_test_client()
    try:
        await _create_user_and_login(client, "prop1_user")
        report_id = await _create_report(client)

        payload = {
            "description": description,
            "amount": amount,
            "incurred_date": incurred_date.isoformat(),
        }

        create_resp = await client.post(f"/reports/{report_id}/lines", json=payload)
        assert create_resp.status_code == 201, (
            f"Expected 201, got {create_resp.status_code}: {create_resp.text}"
        )

        created = create_resp.json()
        assert created["description"] == description
        assert abs(created["amount"] - amount) < 0.01
        assert created["incurred_date"] == incurred_date.isoformat()

        # Verify via GET
        get_resp = await client.get(f"/reports/{report_id}/lines")
        assert get_resp.status_code == 200

        lines = get_resp.json()
        matching = [ln for ln in lines if ln["id"] == created["id"]]
        assert len(matching) == 1

        retrieved = matching[0]
        assert retrieved["description"] == description
        assert abs(retrieved["amount"] - amount) < 0.01
        assert retrieved["incurred_date"] == incurred_date.isoformat()
        assert retrieved["report_id"] == report_id
    finally:
        await client.aclose()
        cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 2: Invalid line creation is always rejected
# **Validates: Requirements 2.5, 2.6**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    invalid_case=st.sampled_from([
        "empty_description",
        "missing_description",
        "zero_amount",
        "negative_amount",
        "missing_amount",
        "missing_date",
    ]),
)
async def test_property_2_invalid_creation_always_rejected(invalid_case):
    """Property 2: Invalid line creation is always rejected.

    # Feature: expense-report-lines, Property 2: Invalid line creation is always rejected

    For any ExpenseLineCreate payload where at least one required field is missing,
    empty, or invalid (non-positive amount, missing description, missing date),
    POST /reports/{id}/lines SHALL return 422 and the line count for the report
    SHALL remain unchanged.

    **Validates: Requirements 2.5, 2.6**
    """
    client = create_test_client()
    try:
        await _create_user_and_login(client, "prop2_user")
        report_id = await _create_report(client)

        # Get initial line count
        initial_resp = await client.get(f"/reports/{report_id}/lines")
        assert initial_resp.status_code == 200
        initial_count = len(initial_resp.json())

        # Build invalid payload based on case
        if invalid_case == "empty_description":
            payload = {"description": "", "amount": 10.0, "incurred_date": "2026-01-15"}
        elif invalid_case == "missing_description":
            payload = {"amount": 10.0, "incurred_date": "2026-01-15"}
        elif invalid_case == "zero_amount":
            payload = {"description": "Test", "amount": 0.0, "incurred_date": "2026-01-15"}
        elif invalid_case == "negative_amount":
            payload = {"description": "Test", "amount": -5.0, "incurred_date": "2026-01-15"}
        elif invalid_case == "missing_amount":
            payload = {"description": "Test", "incurred_date": "2026-01-15"}
        elif invalid_case == "missing_date":
            payload = {"description": "Test", "amount": 10.0}
        else:
            raise ValueError(f"Unknown invalid_case: {invalid_case}")

        resp = await client.post(f"/reports/{report_id}/lines", json=payload)
        assert resp.status_code == 422, (
            f"Expected 422 for {invalid_case}, got {resp.status_code}: {resp.text}"
        )

        # Verify line count unchanged
        final_resp = await client.get(f"/reports/{report_id}/lines")
        assert final_resp.status_code == 200
        assert len(final_resp.json()) == initial_count
    finally:
        await client.aclose()
        cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 3: Line update round-trip preserves updated fields
# **Validates: Requirements 3.4**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    # Original line values
    orig_description=_valid_description_st,
    orig_amount=_valid_amount_st,
    orig_date=_valid_date_st,
    # Update values — at least one must be provided
    new_description=st.one_of(st.none(), _valid_description_st),
    new_amount=st.one_of(st.none(), _valid_amount_st),
    new_date=st.one_of(st.none(), _valid_date_st),
)
async def test_property_3_line_update_round_trip(
    orig_description, orig_amount, orig_date,
    new_description, new_amount, new_date,
):
    """Property 3: Line update round-trip preserves updated fields.

    # Feature: expense-report-lines, Property 3: Line update round-trip preserves updated fields

    For any existing ExpenseLine and any valid ExpenseLineUpdate payload, submitting it
    via PUT /reports/{id}/lines/{line_id} and then retrieving the line SHALL return a
    record where the updated fields match the submitted values and unchanged fields
    retain their original values.

    **Validates: Requirements 3.4**
    """
    # Skip if all update fields are None (would be rejected by schema validator)
    if new_description is None and new_amount is None and new_date is None:
        return

    client = create_test_client()
    try:
        await _create_user_and_login(client, "prop3_user")
        report_id = await _create_report(client)

        # Create original line
        create_payload = {
            "description": orig_description,
            "amount": orig_amount,
            "incurred_date": orig_date.isoformat(),
        }
        create_resp = await client.post(f"/reports/{report_id}/lines", json=create_payload)
        assert create_resp.status_code == 201
        line_id = create_resp.json()["id"]

        # Build update payload (only non-None fields)
        update_payload = {}
        if new_description is not None:
            update_payload["description"] = new_description
        if new_amount is not None:
            update_payload["amount"] = new_amount
        if new_date is not None:
            update_payload["incurred_date"] = new_date.isoformat()

        put_resp = await client.put(
            f"/reports/{report_id}/lines/{line_id}", json=update_payload
        )
        assert put_resp.status_code == 200, (
            f"Expected 200, got {put_resp.status_code}: {put_resp.text}"
        )

        # Verify via GET
        get_resp = await client.get(f"/reports/{report_id}/lines")
        assert get_resp.status_code == 200
        lines = get_resp.json()
        matching = [ln for ln in lines if ln["id"] == line_id]
        assert len(matching) == 1

        retrieved = matching[0]

        # Updated fields should match new values
        expected_desc = new_description if new_description is not None else orig_description
        expected_amount = new_amount if new_amount is not None else orig_amount
        expected_date = new_date if new_date is not None else orig_date

        assert retrieved["description"] == expected_desc
        assert abs(retrieved["amount"] - expected_amount) < 0.01
        assert retrieved["incurred_date"] == expected_date.isoformat()
    finally:
        await client.aclose()
        cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 4: Non-owner mutation is always forbidden
# **Validates: Requirements 3.6, 4.4, 8.3**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    description=_valid_description_st,
    amount=_valid_amount_st,
    incurred_date=_valid_date_st,
)
async def test_property_4_non_owner_mutation_forbidden(description, amount, incurred_date):
    """Property 4: Non-owner mutation is always forbidden.

    # Feature: expense-report-lines, Property 4: Non-owner mutation is always forbidden

    For any ExpenseLine owned by user A, any PUT or DELETE request to that line made by
    an authenticated user B (where B is not A and B does not have Admin role) SHALL
    return 403 Forbidden and the line SHALL remain unchanged.

    **Validates: Requirements 3.6, 4.4, 8.3**
    """
    client = create_test_client()
    try:
        # Create user A and their report + line
        await _create_user_and_login(client, "prop4_user_a")
        report_id = await _create_report(client)

        create_payload = {
            "description": description,
            "amount": amount,
            "incurred_date": incurred_date.isoformat(),
        }
        create_resp = await client.post(f"/reports/{report_id}/lines", json=create_payload)
        assert create_resp.status_code == 201
        line_id = create_resp.json()["id"]

        # Logout user A
        await client.post("/auth/logout")

        # Create user B (non-admin) and login
        await _create_user_and_login(client, "prop4_user_b")

        # Attempt PUT as user B
        update_payload = {"description": "Hacked description"}
        put_resp = await client.put(
            f"/reports/{report_id}/lines/{line_id}", json=update_payload
        )
        assert put_resp.status_code == 403, (
            f"Expected 403 for non-owner PUT, got {put_resp.status_code}"
        )

        # Attempt DELETE as user B
        del_resp = await client.delete(f"/reports/{report_id}/lines/{line_id}")
        assert del_resp.status_code == 403, (
            f"Expected 403 for non-owner DELETE, got {del_resp.status_code}"
        )

        # Logout user B, login user A to verify line unchanged
        await client.post("/auth/logout")
        login_resp = await client.post(
            "/auth/login",
            json={"username": "prop4_user_a", "password": "test_password"},
        )
        assert login_resp.status_code == 200

        get_resp = await client.get(f"/reports/{report_id}/lines")
        assert get_resp.status_code == 200
        lines = get_resp.json()
        matching = [ln for ln in lines if ln["id"] == line_id]
        assert len(matching) == 1

        retrieved = matching[0]
        assert retrieved["description"] == description
        assert abs(retrieved["amount"] - amount) < 0.01
        assert retrieved["incurred_date"] == incurred_date.isoformat()
    finally:
        await client.aclose()
        cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 5: Status locking prevents all line mutations
# **Validates: Requirements 3.7, 4.5**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    locked_status=_locked_status_st,
    description=_valid_description_st,
    amount=_valid_amount_st,
    incurred_date=_valid_date_st,
)
async def test_property_5_status_locking_prevents_mutations(
    locked_status, description, amount, incurred_date
):
    """Property 5: Status locking prevents all line mutations.

    # Feature: expense-report-lines, Property 5: Status locking prevents all line mutations

    For any ExpenseReport with status Submitted or Scheduled for Payment, any POST,
    PUT, or DELETE request to its lines made by the owner SHALL return 409 Conflict
    and the lines collection SHALL remain unchanged.

    **Validates: Requirements 3.7, 4.5**
    """
    client = create_test_client()
    try:
        await _create_user_and_login(client, "prop5_user")
        report_id = await _create_report(client)

        # Create a line while report is still editable
        create_payload = {
            "description": description,
            "amount": amount,
            "incurred_date": incurred_date.isoformat(),
        }
        create_resp = await client.post(f"/reports/{report_id}/lines", json=create_payload)
        assert create_resp.status_code == 201
        line_id = create_resp.json()["id"]

        # Lock the report by setting status directly in DB
        await _set_report_status(client, report_id, locked_status)

        # Attempt POST (create new line)
        post_resp = await client.post(
            f"/reports/{report_id}/lines",
            json={"description": "New line", "amount": 5.0, "incurred_date": "2026-06-01"},
        )
        assert post_resp.status_code == 409, (
            f"Expected 409 for POST on {locked_status} report, got {post_resp.status_code}"
        )

        # Attempt PUT (update existing line)
        put_resp = await client.put(
            f"/reports/{report_id}/lines/{line_id}",
            json={"description": "Updated"},
        )
        assert put_resp.status_code == 409, (
            f"Expected 409 for PUT on {locked_status} report, got {put_resp.status_code}"
        )

        # Attempt DELETE
        del_resp = await client.delete(f"/reports/{report_id}/lines/{line_id}")
        assert del_resp.status_code == 409, (
            f"Expected 409 for DELETE on {locked_status} report, got {del_resp.status_code}"
        )

        # Verify lines unchanged
        # Need to reset status to editable to read lines (or use admin)
        await _set_report_status(client, report_id, "In Progress")
        get_resp = await client.get(f"/reports/{report_id}/lines")
        assert get_resp.status_code == 200
        lines = get_resp.json()
        assert len(lines) == 1
        assert lines[0]["id"] == line_id
        assert lines[0]["description"] == description
    finally:
        await client.aclose()
        cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 6: Total amount always equals the sum of line amounts
# **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    amounts=st.lists(
        st.floats(min_value=0.01, max_value=10_000.0, allow_nan=False, allow_infinity=False),
        min_size=1,
        max_size=5,
    ),
)
async def test_property_6_total_amount_invariant(amounts):
    """Property 6: Total amount always equals the sum of line amounts.

    # Feature: expense-report-lines, Property 6: Total amount always equals the sum of line amounts

    For any sequence of line create, update, and delete operations on an ExpenseReport,
    the total_amount field on the report returned by GET /reports SHALL always equal the
    arithmetic sum of all current ExpenseLine.amount values for that report (or 0.00
    when there are no lines).

    **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    """
    client = create_test_client()
    try:
        await _create_user_and_login(client, "prop6_user")
        report_id = await _create_report(client)

        line_ids = []

        # Create lines and verify total after each
        for i, amt in enumerate(amounts):
            create_resp = await client.post(
                f"/reports/{report_id}/lines",
                json={
                    "description": f"Line {i}",
                    "amount": amt,
                    "incurred_date": "2026-03-15",
                },
            )
            assert create_resp.status_code == 201
            line_ids.append(create_resp.json()["id"])

            # Check total_amount on report
            reports_resp = await client.get("/reports")
            assert reports_resp.status_code == 200
            report = [r for r in reports_resp.json() if r["id"] == report_id][0]
            expected_total = sum(amounts[: i + 1])
            assert abs(report["total_amount"] - expected_total) < 0.01, (
                f"After creating {i+1} lines: expected total {expected_total}, "
                f"got {report['total_amount']}"
            )

        # Update the first line's amount and verify total
        if len(line_ids) >= 1:
            new_amount = amounts[0] + 10.0
            put_resp = await client.put(
                f"/reports/{report_id}/lines/{line_ids[0]}",
                json={"amount": new_amount},
            )
            assert put_resp.status_code == 200

            reports_resp = await client.get("/reports")
            report = [r for r in reports_resp.json() if r["id"] == report_id][0]
            expected_total = new_amount + sum(amounts[1:])
            assert abs(report["total_amount"] - expected_total) < 0.01

        # Delete all lines and verify total is 0
        for lid in line_ids:
            del_resp = await client.delete(f"/reports/{report_id}/lines/{lid}")
            assert del_resp.status_code == 204

        reports_resp = await client.get("/reports")
        report = [r for r in reports_resp.json() if r["id"] == report_id][0]
        assert abs(report["total_amount"] - 0.0) < 0.01, (
            f"Expected total_amount=0.0 after deleting all lines, got {report['total_amount']}"
        )
    finally:
        await client.aclose()
        cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 7: Line deletion removes the line
# **Validates: Requirements 4.3, 5.1**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    description=_valid_description_st,
    amount=_valid_amount_st,
    incurred_date=_valid_date_st,
)
async def test_property_7_line_deletion_removes_line(description, amount, incurred_date):
    """Property 7: Line deletion removes the line.

    # Feature: expense-report-lines, Property 7: Line deletion removes the line

    For any existing ExpenseLine, after a successful DELETE /reports/{id}/lines/{line_id},
    the line SHALL no longer appear in GET /reports/{id}/lines and the report's
    total_amount SHALL reflect the removal.

    **Validates: Requirements 4.3, 5.1**
    """
    client = create_test_client()
    try:
        await _create_user_and_login(client, "prop7_user")
        report_id = await _create_report(client)

        # Create a line
        create_payload = {
            "description": description,
            "amount": amount,
            "incurred_date": incurred_date.isoformat(),
        }
        create_resp = await client.post(f"/reports/{report_id}/lines", json=create_payload)
        assert create_resp.status_code == 201
        line_id = create_resp.json()["id"]

        # Verify total_amount includes the line
        reports_resp = await client.get("/reports")
        report = [r for r in reports_resp.json() if r["id"] == report_id][0]
        assert abs(report["total_amount"] - amount) < 0.01

        # Delete the line
        del_resp = await client.delete(f"/reports/{report_id}/lines/{line_id}")
        assert del_resp.status_code == 204

        # Verify line is gone
        get_resp = await client.get(f"/reports/{report_id}/lines")
        assert get_resp.status_code == 200
        lines = get_resp.json()
        assert all(ln["id"] != line_id for ln in lines), (
            f"Line {line_id} should not appear after deletion"
        )

        # Verify total_amount is updated
        reports_resp = await client.get("/reports")
        report = [r for r in reports_resp.json() if r["id"] == report_id][0]
        assert abs(report["total_amount"] - 0.0) < 0.01, (
            f"Expected total_amount=0.0 after deletion, got {report['total_amount']}"
        )
    finally:
        await client.aclose()
        cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 8: Cascade delete removes all lines
# **Validates: Requirements 1.5**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    num_lines=st.integers(min_value=1, max_value=5),
)
async def test_property_8_cascade_delete_removes_all_lines(num_lines):
    """Property 8: Cascade delete removes all lines.

    # Feature: expense-report-lines, Property 8: Cascade delete removes all lines

    For any ExpenseReport with N lines, deleting the report via DELETE /reports/{id}
    SHALL result in all N lines being permanently removed (no orphaned expense_lines
    rows remain in the database).

    **Validates: Requirements 1.5**
    """
    client = create_test_client()
    try:
        await _create_user_and_login(client, "prop8_user")
        report_id = await _create_report(client)

        # Create N lines
        for i in range(num_lines):
            create_resp = await client.post(
                f"/reports/{report_id}/lines",
                json={
                    "description": f"Line {i}",
                    "amount": 10.0 + i,
                    "incurred_date": "2026-04-01",
                },
            )
            assert create_resp.status_code == 201

        # Verify lines exist
        get_resp = await client.get(f"/reports/{report_id}/lines")
        assert get_resp.status_code == 200
        assert len(get_resp.json()) == num_lines

        # Delete the report
        del_resp = await client.delete(f"/reports/{report_id}")
        assert del_resp.status_code == 204

        # Query DB directly to verify no orphaned lines
        session = client._test_session_factory()  # type: ignore[attr-defined]
        try:
            orphaned = (
                session.query(ExpenseLine)
                .filter(ExpenseLine.report_id == report_id)
                .all()
            )
            assert len(orphaned) == 0, (
                f"Expected 0 orphaned lines after report deletion, found {len(orphaned)}"
            )
        finally:
            session.close()
    finally:
        await client.aclose()
        cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 9: Unauthenticated requests to line endpoints are always rejected
# **Validates: Requirements 7.9**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    report_id=st.integers(min_value=1, max_value=9999),
    line_id=st.integers(min_value=1, max_value=9999),
)
async def test_property_9_unauthenticated_requests_rejected(report_id, line_id):
    """Property 9: Unauthenticated requests to line endpoints are always rejected.

    # Feature: expense-report-lines, Property 9: Unauthenticated requests to line endpoints are always rejected

    For any line endpoint (POST, GET, PUT, DELETE), a request made without a valid
    session cookie SHALL return 401 Unauthorized.

    **Validates: Requirements 7.9**
    """
    client = create_test_client()
    try:
        # POST without auth
        post_resp = await client.post(
            f"/reports/{report_id}/lines",
            json={"description": "Test", "amount": 10.0, "incurred_date": "2026-01-01"},
        )
        assert post_resp.status_code == 401, (
            f"Expected 401 for unauthenticated POST, got {post_resp.status_code}"
        )

        # GET without auth
        get_resp = await client.get(f"/reports/{report_id}/lines")
        assert get_resp.status_code == 401, (
            f"Expected 401 for unauthenticated GET, got {get_resp.status_code}"
        )

        # PUT without auth
        put_resp = await client.put(
            f"/reports/{report_id}/lines/{line_id}",
            json={"description": "Updated"},
        )
        assert put_resp.status_code == 401, (
            f"Expected 401 for unauthenticated PUT, got {put_resp.status_code}"
        )

        # DELETE without auth
        del_resp = await client.delete(f"/reports/{report_id}/lines/{line_id}")
        assert del_resp.status_code == 401, (
            f"Expected 401 for unauthenticated DELETE, got {del_resp.status_code}"
        )
    finally:
        await client.aclose()
        cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 10: Admin can read lines for any report
# **Validates: Requirements 8.1**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    num_lines=st.integers(min_value=0, max_value=5),
)
async def test_property_10_admin_can_read_lines_for_any_report(num_lines):
    """Property 10: Admin can read lines for any report.

    # Feature: expense-report-lines, Property 10: Admin can read lines for any report

    For any ExpenseReport owned by user A, an authenticated user with Admin role SHALL
    receive 200 OK with the lines list when calling GET /reports/{id}/lines, regardless
    of ownership.

    **Validates: Requirements 8.1**
    """
    client = create_test_client()
    try:
        # Create user A (regular user) and their report + lines
        await _create_user_and_login(client, "prop10_user_a")
        report_id = await _create_report(client)

        for i in range(num_lines):
            create_resp = await client.post(
                f"/reports/{report_id}/lines",
                json={
                    "description": f"Line {i}",
                    "amount": 5.0 + i,
                    "incurred_date": "2026-05-01",
                },
            )
            assert create_resp.status_code == 201

        # Logout user A
        await client.post("/auth/logout")

        # Create admin user and login
        await _create_user_and_login(client, "prop10_admin", role_id=2)

        # Admin should be able to read lines for user A's report
        get_resp = await client.get(f"/reports/{report_id}/lines")
        assert get_resp.status_code == 200, (
            f"Expected 200 for admin GET, got {get_resp.status_code}: {get_resp.text}"
        )

        lines = get_resp.json()
        assert len(lines) == num_lines, (
            f"Expected {num_lines} lines, got {len(lines)}"
        )

        # Verify all lines belong to the correct report
        for ln in lines:
            assert ln["report_id"] == report_id
    finally:
        await client.aclose()
        cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 11: Non-owner non-admin cannot read lines
# **Validates: Requirements 8.2**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    description=_valid_description_st,
    amount=_valid_amount_st,
)
async def test_property_11_non_owner_non_admin_read_forbidden(description, amount):
    """Property 11: Non-owner non-admin cannot read lines.

    # Feature: expense-report-lines, Property 11: Non-owner non-admin cannot read lines

    For any ExpenseReport owned by user A, an authenticated user B with User role
    (where B != A) SHALL receive 403 Forbidden when calling GET /reports/{id}/lines.

    **Validates: Requirements 8.2**
    """
    client = create_test_client()
    try:
        # Create user A and their report with a line
        await _create_user_and_login(client, "prop11_user_a")
        report_id = await _create_report(client)

        create_resp = await client.post(
            f"/reports/{report_id}/lines",
            json={
                "description": description,
                "amount": amount,
                "incurred_date": "2026-07-01",
            },
        )
        assert create_resp.status_code == 201

        # Logout user A
        await client.post("/auth/logout")

        # Create user B (regular user, not admin) and login
        await _create_user_and_login(client, "prop11_user_b")

        # User B should NOT be able to read user A's lines
        get_resp = await client.get(f"/reports/{report_id}/lines")
        assert get_resp.status_code == 403, (
            f"Expected 403 for non-owner non-admin GET, got {get_resp.status_code}"
        )
    finally:
        await client.aclose()
        cleanup_test_client(client)
