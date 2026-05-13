"""Property-based tests for the status history endpoint.

Feature: status-history-table

Properties covered:
  Property 2: Status history ordering invariant

Requirements: 1.3
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Request
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, given, settings, strategies as st
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — register all ORM models with Base
from app.db.database import Base, get_db
from app.dependencies import get_current_user
from app.main import app
from app.models.expense_report import ExpenseReport
from app.models.role import Role
from app.models.status_audit_log import StatusAuditLog
from app.models.user import User
from app.services.auth_service import hash_password

# ---------------------------------------------------------------------------
# Pre-computed password hash (avoids expensive bcrypt in every example)
# ---------------------------------------------------------------------------

_TEST_PASSWORD_HASH = hash_password("test_password")

ALL_STATUSES = ["In Progress", "Submitted", "Rejected", "Scheduled for Payment"]


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

# Strategy for generating arbitrary UTC datetimes within a reasonable range
reasonable_datetimes = st.datetimes(
    min_value=datetime(2000, 1, 1),
    max_value=datetime(2030, 12, 31),
    timezones=st.just(timezone.utc),
)

# Strategy for generating a list of audit entries (status + changed_at pairs)
audit_entry_strategy = st.lists(
    st.tuples(
        st.sampled_from(ALL_STATUSES),
        reasonable_datetimes,
    ),
    min_size=1,
    max_size=20,
)


# ---------------------------------------------------------------------------
# Property 2: Status history ordering invariant
# Feature: status-history-table, Property 2: Status history ordering invariant
# Validates: Requirements 1.3
# ---------------------------------------------------------------------------


@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(entries=audit_entry_strategy)
def test_property_2_status_history_ordering_invariant(entries: list[tuple[str, datetime]]):
    """Property 2: Status history ordering invariant.

    # Feature: status-history-table, Property 2: Status history ordering invariant

    For any set of StatusAuditLog entries associated with an expense report,
    the endpoint SHALL return them in non-decreasing order of changed_at —
    that is, for every consecutive pair of entries in the response, the first
    entry's changed_at is less than or equal to the second entry's changed_at.

    **Validates: Requirements 1.3**
    """
    # Set up a fresh in-memory database for each example
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine)

    # Seed roles
    session = TestSession()
    session.add(Role(id=1, name="User"))
    session.add(Role(id=2, name="Admin"))
    session.commit()

    # Create owner user
    owner = User(username="owner", hashed_password=_TEST_PASSWORD_HASH, role_id=1)
    session.add(owner)
    session.commit()
    session.refresh(owner)
    owner_id = owner.id

    # Create a report
    report = ExpenseReport(
        title="Test Report",
        description="Description",
        status="In Progress",
        owner_id=owner_id,
        created_at=datetime.now(timezone.utc),
        reimbursable_from_client=False,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    report_id = report.id

    # Insert audit entries in the generated (random) order
    for status_val, changed_at_val in entries:
        audit_entry = StatusAuditLog(
            expense_report_id=report_id,
            status=status_val,
            changed_at=changed_at_val.replace(tzinfo=None),  # SQLite stores naive datetimes
        )
        session.add(audit_entry)
    session.commit()
    session.close()

    # Override dependencies for the test client
    def override_get_db():
        s = TestSession()
        try:
            yield s
        finally:
            s.close()

    def override_get_current_user(request: Request, db=None) -> User:
        s = TestSession()
        try:
            return s.get(User, owner_id)
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    try:
        with TestClient(app, raise_server_exceptions=True) as client:
            response = client.get(f"/reports/{report_id}/status-history")

        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )

        result = response.json()

        # Verify we got back all entries
        assert len(result) == len(entries), (
            f"Expected {len(entries)} entries, got {len(result)}"
        )

        # Verify ordering: each consecutive pair must be in non-decreasing
        # order of changed_at
        for i in range(len(result) - 1):
            current_dt = result[i]["changed_at"]
            next_dt = result[i + 1]["changed_at"]
            assert current_dt <= next_dt, (
                f"Ordering violation at index {i}: "
                f"{current_dt} > {next_dt}"
            )
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
