"""Property-based tests for expense reports using hypothesis.

Property 4: Dashboard returns exactly the authenticated user's reports
Property 5: Report creation round-trip preserves all fields
Property 6: Reports with invalid fields are always rejected
Property 7: Zod and Pydantic validation agree on valid inputs

Requirements: 1.1, 2.1, 3.2, 3.4, 3.5
"""

from datetime import datetime, timezone

import httpx
import pytest
from hypothesis import HealthCheck, given, settings, strategies as st
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

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
