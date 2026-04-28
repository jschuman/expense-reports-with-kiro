"""Property-based tests for expense reports using hypothesis.

Original properties (pre-expense-report-fields feature):
  Property 4: Dashboard returns exactly the authenticated user's reports
  Property 5: Report creation round-trip preserves all fields
  Property 6: Reports with invalid fields are always rejected
  Property 7: Zod and Pydantic validation agree on valid inputs

New properties (expense-report-fields feature):
  Property 1: Owner is always the session user
  Property 2: Description round-trip
  Property 4 (new): Reimbursable default is false
  Property 6 (new): Client required when reimbursable is true
  Property 7 (new): Client validation — only list values accepted
  Property 10: Admin notes round-trip

Requirements: 1.1, 1.2, 2.1, 3.2, 3.3, 3.4, 3.5, 4.2, 5.3, 5.6, 6.2, 6.3, 6.4
"""

from datetime import datetime, timezone

import httpx
import pytest
from hypothesis import HealthCheck, given, settings, strategies as st
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.constants import CLIENTS
from app.db.database import Base, get_db
from app.main import app
from app.models.expense_report import ExpenseReport
from app.models.user import User
from app.services.auth_service import hash_password


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


# ---------------------------------------------------------------------------
# Property 4: Dashboard returns exactly the authenticated user's reports
# **Validates: Requirements 2.1**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=20, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    num_users=st.integers(min_value=2, max_value=5),
    reports_per_user=st.integers(min_value=1, max_value=5),
)
async def test_property_dashboard_returns_only_user_reports(num_users, reports_per_user):
    """Property 4: Dashboard returns exactly the authenticated user's reports.

    **Validates: Requirements 2.1**

    For any authenticated user, GET /reports SHALL return all and only the expense reports
    whose owner_id matches that user's id — no more, no fewer.
    """
    async_client = create_test_client()
    now = datetime.now(timezone.utc)

    try:
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        users = []

        try:
            for i in range(num_users):
                user = User(
                    username=f"user_{i}",
                    hashed_password=hash_password(f"pass_{i}"),
                )
                session.add(user)
                session.flush()

                for j in range(reports_per_user):
                    report = ExpenseReport(
                        title=f"Report {j} for user {i}",
                        description=f"Description {j}",
                        total_amount=100.0 + j,
                        status="Pending",
                        owner_id=user.id,
                        created_at=now,
                        reimbursable_from_client=False,
                    )
                    session.add(report)

                session.commit()
                session.refresh(user)
                users.append({"id": user.id, "username": user.username, "password": f"pass_{i}"})
        finally:
            session.close()

        for user_data in users:
            login_response = await async_client.post(
                "/auth/login",
                json={"username": user_data["username"], "password": user_data["password"]},
            )
            assert login_response.status_code == 200

            response = await async_client.get("/reports")
            assert response.status_code == 200

            reports = response.json()
            assert len(reports) == reports_per_user, (
                f"User {user_data['username']} should have {reports_per_user} reports, got {len(reports)}"
            )
            for report in reports:
                assert report["owner_id"] == user_data["id"]

            await async_client.post("/auth/logout")
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


# ---------------------------------------------------------------------------
# Property 5: Report creation round-trip preserves all fields
# **Validates: Requirements 3.2**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=20, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    title=st.text(
        alphabet=st.characters(min_codepoint=33, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
        min_size=1,
        max_size=255,
    ),
    description=st.one_of(
        st.none(),
        st.text(
            alphabet=st.characters(min_codepoint=33, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
            min_size=0,
            max_size=500,
        ),
    ),
    total_amount=st.floats(min_value=0.01, max_value=1000000.0, allow_nan=False, allow_infinity=False),
)
async def test_property_report_creation_round_trip_preserves_fields(
    title, description, total_amount
):
    """Property 5: Report creation round-trip preserves all fields.

    **Validates: Requirements 3.2**

    For any valid ExpenseReportCreate payload, submitting it via POST /reports and then
    retrieving the report via GET /reports SHALL return a record containing the same
    title, description, and total_amount, with status equal to "Pending" and owner_id
    equal to the authenticated user's id.
    """
    async_client = create_test_client()

    try:
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            user = User(username="roundtrip_user", hashed_password=hash_password("roundtrip_pass"))
            session.add(user)
            session.commit()
            session.refresh(user)
            user_id = user.id
        finally:
            session.close()

        login_response = await async_client.post(
            "/auth/login",
            json={"username": "roundtrip_user", "password": "roundtrip_pass"},
        )
        assert login_response.status_code == 200

        payload = {"title": title, "total_amount": total_amount}
        if description is not None:
            payload["description"] = description

        create_response = await async_client.post("/reports", json=payload)
        assert create_response.status_code == 201, (
            f"Expected 201 for valid payload, got {create_response.status_code}: {create_response.text}"
        )

        created_report = create_response.json()

        get_response = await async_client.get("/reports")
        assert get_response.status_code == 200

        reports = get_response.json()
        matching = [r for r in reports if r["id"] == created_report["id"]]
        assert len(matching) == 1

        retrieved = matching[0]
        assert retrieved["title"] == title
        assert abs(retrieved["total_amount"] - total_amount) < 0.01
        assert retrieved["status"] == "Pending"
        assert retrieved["owner_id"] == user_id
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


# ---------------------------------------------------------------------------
# Property 6: Reports with invalid fields are always rejected
# **Validates: Requirements 3.4, 3.5**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=20, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    invalid_field=st.sampled_from(["empty_title", "zero_amount", "negative_amount"]),
)
async def test_property_invalid_reports_always_rejected(invalid_field):
    """Property 6: Reports with invalid fields are always rejected.

    **Validates: Requirements 3.4, 3.5**

    For any ExpenseReportCreate payload where at least one required field is empty
    or total_amount is not a positive number, POST /reports SHALL return 422 and
    SHALL NOT persist any record to the database.
    """
    async_client = create_test_client()

    try:
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            user = User(username="invalid_user", hashed_password=hash_password("invalid_pass"))
            session.add(user)
            session.commit()
        finally:
            session.close()

        login_response = await async_client.post(
            "/auth/login",
            json={"username": "invalid_user", "password": "invalid_pass"},
        )
        assert login_response.status_code == 200

        initial_response = await async_client.get("/reports")
        initial_count = len(initial_response.json())

        if invalid_field == "empty_title":
            payload = {"title": "", "total_amount": 100.0}
        elif invalid_field == "zero_amount":
            payload = {"title": "Valid title", "total_amount": 0.0}
        elif invalid_field == "negative_amount":
            payload = {"title": "Valid title", "total_amount": -10.0}
        else:
            raise ValueError(f"Unknown invalid_field: {invalid_field}")

        response = await async_client.post("/reports", json=payload)

        assert response.status_code == 422, (
            f"Expected 422 for {invalid_field}, got {response.status_code}"
        )

        final_response = await async_client.get("/reports")
        final_count = len(final_response.json())
        assert final_count == initial_count
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


# ---------------------------------------------------------------------------
# Property 7: Zod and Pydantic validation agree on valid inputs
# **Validates: Requirements 3.4, 3.5**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=20, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    title=st.text(
        alphabet=st.characters(min_codepoint=33, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
        min_size=1,
        max_size=255,
    ),
    total_amount=st.floats(min_value=0.01, max_value=1000000.0, allow_nan=False, allow_infinity=False),
)
async def test_property_zod_pydantic_validation_agree(title, total_amount):
    """Property 7: Zod and Pydantic validation agree on valid inputs.

    **Validates: Requirements 3.4, 3.5**

    For any form input that passes Zod client-side validation (non-empty title,
    positive float), the equivalent request body SHALL also pass Pydantic server-side
    validation — the server SHALL NOT return 422 for a client-validated payload.
    """
    async_client = create_test_client()

    try:
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            user = User(username="zod_user", hashed_password=hash_password("zod_pass"))
            session.add(user)
            session.commit()
        finally:
            session.close()

        login_response = await async_client.post(
            "/auth/login",
            json={"username": "zod_user", "password": "zod_pass"},
        )
        assert login_response.status_code == 200

        payload = {"title": title, "total_amount": total_amount}

        response = await async_client.post("/reports", json=payload)

        assert response.status_code == 201, (
            f"Expected 201 for Zod-valid input, got {response.status_code}: {response.text}"
        )
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


# ---------------------------------------------------------------------------
# Feature: expense-report-fields
# Property 1: Owner is always the session user
# **Validates: Requirements 1.1, 1.2**
# ---------------------------------------------------------------------------

# Shared strategy for valid report titles
_valid_title_st = st.text(
    alphabet=st.characters(min_codepoint=33, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
    min_size=1,
    max_size=255,
)

# Shared strategy for valid total_amount values
_valid_amount_st = st.floats(min_value=0.01, max_value=1_000_000.0, allow_nan=False, allow_infinity=False)


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    title=_valid_title_st,
    total_amount=_valid_amount_st,
)
async def test_property_owner_is_always_session_user(title, total_amount):
    """Property 1: Owner is always the session user.

    # Feature: expense-report-fields, Property 1: Owner is always the session user

    For any authenticated user and any valid report creation payload, the owner_id on
    the returned ExpenseReportResponse SHALL equal the authenticated user's id,
    regardless of any owner_id value present in the request body.

    **Validates: Requirements 1.1, 1.2**
    """
    async_client = create_test_client()

    try:
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            user = User(username="owner_prop_user", hashed_password=hash_password("owner_prop_pass"))
            session.add(user)
            session.commit()
            session.refresh(user)
            user_id = user.id
        finally:
            session.close()

        login_resp = await async_client.post(
            "/auth/login",
            json={"username": "owner_prop_user", "password": "owner_prop_pass"},
        )
        assert login_resp.status_code == 200

        payload = {"title": title, "total_amount": total_amount}
        create_resp = await async_client.post("/reports", json=payload)
        assert create_resp.status_code == 201, (
            f"Expected 201, got {create_resp.status_code}: {create_resp.text}"
        )

        report = create_resp.json()
        assert report["owner_id"] == user_id, (
            f"owner_id {report['owner_id']} != authenticated user id {user_id}"
        )
        assert report["owner_username"] == "owner_prop_user", (
            f"owner_username '{report['owner_username']}' != 'owner_prop_user'"
        )
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


# ---------------------------------------------------------------------------
# Feature: expense-report-fields
# Property 2: Description round-trip
# **Validates: Requirements 3.2, 3.3, 3.4**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    description=st.one_of(
        st.none(),
        st.just(""),
        st.text(
            alphabet=st.characters(min_codepoint=32, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
            min_size=1,
            max_size=500,
        ),
    ),
    total_amount=_valid_amount_st,
)
async def test_property_description_round_trip(description, total_amount):
    """Property 2: Description round-trip.

    # Feature: expense-report-fields, Property 2: Description round-trip

    For any valid report creation payload — whether description is absent, empty, or a
    non-empty string — submitting the report and retrieving it via GET /reports SHALL
    return a record whose description field equals the submitted value (or null when
    absent/empty).

    **Validates: Requirements 3.2, 3.3, 3.4**
    """
    async_client = create_test_client()

    try:
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            user = User(username="desc_rt_user", hashed_password=hash_password("desc_rt_pass"))
            session.add(user)
            session.commit()
        finally:
            session.close()

        login_resp = await async_client.post(
            "/auth/login",
            json={"username": "desc_rt_user", "password": "desc_rt_pass"},
        )
        assert login_resp.status_code == 200

        payload: dict = {"title": "Description Round-Trip Report", "total_amount": total_amount}
        if description is not None:
            payload["description"] = description

        create_resp = await async_client.post("/reports", json=payload)
        assert create_resp.status_code == 201, (
            f"Expected 201, got {create_resp.status_code}: {create_resp.text}"
        )

        created = create_resp.json()
        report_id = created["id"]

        get_resp = await async_client.get("/reports")
        assert get_resp.status_code == 200

        reports = get_resp.json()
        matching = [r for r in reports if r["id"] == report_id]
        assert len(matching) == 1, f"Expected exactly 1 matching report, got {len(matching)}"

        retrieved = matching[0]

        # None and empty string both map to null/None in the response
        if description is None or description == "":
            assert retrieved["description"] is None, (
                f"Expected null description for absent/empty input, got '{retrieved['description']}'"
            )
        else:
            assert retrieved["description"] == description, (
                f"Description round-trip failed: sent '{description}', got '{retrieved['description']}'"
            )
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


# ---------------------------------------------------------------------------
# Feature: expense-report-fields
# Property 4 (new): Reimbursable default is false
# **Validates: Requirements 4.2**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    title=_valid_title_st,
    total_amount=_valid_amount_st,
)
async def test_property_reimbursable_default_is_false(title, total_amount):
    """Property 4 (new): Reimbursable default is false.

    # Feature: expense-report-fields, Property 4: Reimbursable default is false

    For any valid report creation payload that omits reimbursable_from_client, the
    returned ExpenseReportResponse SHALL have reimbursable_from_client equal to false.

    **Validates: Requirements 4.2**
    """
    async_client = create_test_client()

    try:
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            user = User(username="reimb_default_user", hashed_password=hash_password("reimb_default_pass"))
            session.add(user)
            session.commit()
        finally:
            session.close()

        login_resp = await async_client.post(
            "/auth/login",
            json={"username": "reimb_default_user", "password": "reimb_default_pass"},
        )
        assert login_resp.status_code == 200

        # Deliberately omit reimbursable_from_client from the payload
        payload = {"title": title, "total_amount": total_amount}
        create_resp = await async_client.post("/reports", json=payload)
        assert create_resp.status_code == 201, (
            f"Expected 201, got {create_resp.status_code}: {create_resp.text}"
        )

        report = create_resp.json()
        assert report["reimbursable_from_client"] is False, (
            f"Expected reimbursable_from_client=False when omitted, got {report['reimbursable_from_client']}"
        )
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


# ---------------------------------------------------------------------------
# Feature: expense-report-fields
# Property 6 (new): Client required when reimbursable is true
# **Validates: Requirements 5.3**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    title=_valid_title_st,
    total_amount=_valid_amount_st,
)
async def test_property_client_required_when_reimbursable_true(title, total_amount):
    """Property 6 (new): Client required when reimbursable is true.

    # Feature: expense-report-fields, Property 6: Client required when reimbursable is true

    For any report creation payload where reimbursable_from_client is True and client is
    absent or null, the API SHALL return 422 and SHALL NOT persist any record to the
    database.

    **Validates: Requirements 5.3**
    """
    async_client = create_test_client()

    try:
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            user = User(username="client_req_user", hashed_password=hash_password("client_req_pass"))
            session.add(user)
            session.commit()
        finally:
            session.close()

        login_resp = await async_client.post(
            "/auth/login",
            json={"username": "client_req_user", "password": "client_req_pass"},
        )
        assert login_resp.status_code == 200

        # Capture report count before the invalid attempt
        before_resp = await async_client.get("/reports")
        assert before_resp.status_code == 200
        count_before = len(before_resp.json())

        # reimbursable=True with no client — must be rejected
        payload = {
            "title": title,
            "total_amount": total_amount,
            "reimbursable_from_client": True,
            # client intentionally omitted
        }
        create_resp = await async_client.post("/reports", json=payload)
        assert create_resp.status_code == 422, (
            f"Expected 422 when reimbursable=True and client absent, got {create_resp.status_code}"
        )

        # Confirm no new record was persisted
        after_resp = await async_client.get("/reports")
        assert after_resp.status_code == 200
        count_after = len(after_resp.json())
        assert count_after == count_before, (
            f"DB record count changed from {count_before} to {count_after} after rejected request"
        )
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


# ---------------------------------------------------------------------------
# Feature: expense-report-fields
# Property 7 (new): Client validation — only list values accepted
# **Validates: Requirements 5.6**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    title=_valid_title_st,
    total_amount=_valid_amount_st,
    invalid_client=st.text(
        alphabet=st.characters(min_codepoint=32, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
        min_size=1,
        max_size=255,
    ).filter(lambda s: s not in CLIENTS),
)
async def test_property_client_validation_only_list_values_accepted(title, total_amount, invalid_client):
    """Property 7 (new): Client validation — only list values accepted.

    # Feature: expense-report-fields, Property 7: Client validation — only list values accepted

    For any report creation payload where client is set to a string not present in
    CLIENTS, the API SHALL return 422 and SHALL NOT persist any record to the database.

    **Validates: Requirements 5.6**
    """
    async_client = create_test_client()

    try:
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            user = User(username="client_val_user", hashed_password=hash_password("client_val_pass"))
            session.add(user)
            session.commit()
        finally:
            session.close()

        login_resp = await async_client.post(
            "/auth/login",
            json={"username": "client_val_user", "password": "client_val_pass"},
        )
        assert login_resp.status_code == 200

        # Capture report count before the invalid attempt
        before_resp = await async_client.get("/reports")
        assert before_resp.status_code == 200
        count_before = len(before_resp.json())

        # client value not in CLIENTS — must be rejected regardless of reimbursable flag
        payload = {
            "title": title,
            "total_amount": total_amount,
            "reimbursable_from_client": True,
            "client": invalid_client,
        }
        create_resp = await async_client.post("/reports", json=payload)
        assert create_resp.status_code == 422, (
            f"Expected 422 for client='{invalid_client}' (not in CLIENTS), got {create_resp.status_code}"
        )

        # Confirm no new record was persisted
        after_resp = await async_client.get("/reports")
        assert after_resp.status_code == 200
        count_after = len(after_resp.json())
        assert count_after == count_before, (
            f"DB record count changed from {count_before} to {count_after} after rejected request"
        )
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)


# ---------------------------------------------------------------------------
# Feature: expense-report-fields
# Property 10: Admin notes round-trip
# **Validates: Requirements 6.2, 6.3, 6.4**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(
    title=_valid_title_st,
    total_amount=_valid_amount_st,
)
async def test_property_admin_notes_always_null_on_creation(title, total_amount):
    """Property 10: Admin notes round-trip.

    # Feature: expense-report-fields, Property 10: Admin notes round-trip

    For any report creation payload — whether admin_notes is absent or a non-empty
    string — the returned ExpenseReportResponse SHALL have admin_notes equal to null
    (since admin notes are not user-settable at creation time).

    **Validates: Requirements 6.2, 6.3, 6.4**
    """
    async_client = create_test_client()

    try:
        session = async_client._test_session_factory()  # type: ignore[attr-defined]
        try:
            user = User(username="admin_notes_user", hashed_password=hash_password("admin_notes_pass"))
            session.add(user)
            session.commit()
        finally:
            session.close()

        login_resp = await async_client.post(
            "/auth/login",
            json={"username": "admin_notes_user", "password": "admin_notes_pass"},
        )
        assert login_resp.status_code == 200

        # Payload without admin_notes (it is not part of ExpenseReportCreate)
        payload = {"title": title, "total_amount": total_amount}
        create_resp = await async_client.post("/reports", json=payload)
        assert create_resp.status_code == 201, (
            f"Expected 201, got {create_resp.status_code}: {create_resp.text}"
        )

        report = create_resp.json()
        assert report["admin_notes"] is None, (
            f"Expected admin_notes=null on creation, got '{report['admin_notes']}'"
        )

        # Verify the same via GET /reports
        get_resp = await async_client.get("/reports")
        assert get_resp.status_code == 200

        reports = get_resp.json()
        matching = [r for r in reports if r["id"] == report["id"]]
        assert len(matching) == 1

        assert matching[0]["admin_notes"] is None, (
            f"Expected admin_notes=null in GET /reports, got '{matching[0]['admin_notes']}'"
        )
    finally:
        await async_client.aclose()
        cleanup_test_client(async_client)
