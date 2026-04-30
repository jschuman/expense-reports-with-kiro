"""Unit tests for report_service.py.

Uses an in-memory SQLite database with a fresh schema per test so each
test is fully isolated.
"""

from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base
from app.models.expense_report import ExpenseReport
from app.models.role import Role
from app.models.user import User
from app.schemas.expense_report import ExpenseReportCreate
from app.services import report_service
from app.services.auth_service import hash_password

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def db_session():
    """Provide a fresh in-memory SQLite session for each test."""
    import app.models  # noqa: F401 — register all ORM models with Base

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    # Seed roles for tests
    user_role = Role(id=1, name="User")
    admin_role = Role(id=2, name="Admin")
    session.add(user_role)
    session.add(admin_role)
    session.commit()
    
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def user_a(db_session):
    """Seed and return a User with username 'alice'."""
    user = User(username="alice", hashed_password=hash_password("pw"), role_id=1)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def user_b(db_session):
    """Seed and return a second User with username 'bob'."""
    user = User(username="bob", hashed_password=hash_password("pw"), role_id=1)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


# ---------------------------------------------------------------------------
# get_all_reports
# ---------------------------------------------------------------------------


def test_get_all_reports_returns_all_reports_in_database(db_session, user_a, user_b):
    """get_all_reports returns all expense reports regardless of owner."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    r1 = ExpenseReport(
        title="Alice Report 1",
        description="Travel",
        total_amount=100.0,
        status="Pending",
        owner_id=user_a.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    r2 = ExpenseReport(
        title="Alice Report 2",
        description="Meals",
        total_amount=50.0,
        status="Pending",
        owner_id=user_a.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    r3 = ExpenseReport(
        title="Bob Report 1",
        description="Supplies",
        total_amount=200.0,
        status="Pending",
        owner_id=user_b.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    db_session.add_all([r1, r2, r3])
    db_session.commit()

    results = report_service.get_all_reports(db_session)

    assert len(results) == 3
    titles = {r.title for r in results}
    assert titles == {"Alice Report 1", "Alice Report 2", "Bob Report 1"}


def test_get_all_reports_returns_empty_list_when_no_reports(db_session):
    """get_all_reports returns an empty list when there are no reports in the database."""
    results = report_service.get_all_reports(db_session)

    assert results == []


def test_get_all_reports_orders_by_id_ascending(db_session, user_a):
    """get_all_reports returns reports ordered by id in ascending order."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    r1 = ExpenseReport(
        title="Report C",
        total_amount=100.0,
        status="Pending",
        owner_id=user_a.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    r2 = ExpenseReport(
        title="Report A",
        total_amount=50.0,
        status="Pending",
        owner_id=user_a.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    r3 = ExpenseReport(
        title="Report B",
        total_amount=200.0,
        status="Pending",
        owner_id=user_a.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    db_session.add_all([r1, r2, r3])
    db_session.commit()

    results = report_service.get_all_reports(db_session)

    # Results should be ordered by id (which is insertion order in this case)
    assert len(results) == 3
    assert results[0].id < results[1].id < results[2].id
    assert [r.title for r in results] == ["Report C", "Report A", "Report B"]


def test_get_all_reports_eagerly_loads_owner_relationship(db_session, user_a):
    """get_all_reports eagerly loads the owner relationship so owner.username is accessible."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    r1 = ExpenseReport(
        title="Eager Load Test",
        total_amount=75.0,
        status="Pending",
        owner_id=user_a.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    db_session.add(r1)
    db_session.commit()

    results = report_service.get_all_reports(db_session)

    assert len(results) == 1
    # owner relationship must be loaded — no lazy-load exception
    assert results[0].owner is not None
    assert results[0].owner.username == "alice"


# ---------------------------------------------------------------------------
# get_reports_for_user
# ---------------------------------------------------------------------------


def test_get_reports_for_user_returns_only_that_users_reports(db_session, user_a, user_b):
    """get_reports_for_user returns only reports whose owner_id matches user_id."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    r1 = ExpenseReport(
        title="Alice Report 1",
        description="Travel",
        total_amount=100.0,
        status="Pending",
        owner_id=user_a.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    r2 = ExpenseReport(
        title="Alice Report 2",
        description="Meals",
        total_amount=50.0,
        status="Pending",
        owner_id=user_a.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    r3 = ExpenseReport(
        title="Bob Report 1",
        description="Supplies",
        total_amount=200.0,
        status="Pending",
        owner_id=user_b.id,
        created_at=now,
        reimbursable_from_client=False,
    )
    db_session.add_all([r1, r2, r3])
    db_session.commit()

    results = report_service.get_reports_for_user(db_session, user_a.id)

    assert len(results) == 2
    owner_ids = {r.owner_id for r in results}
    assert owner_ids == {user_a.id}
    titles = {r.title for r in results}
    assert titles == {"Alice Report 1", "Alice Report 2"}


def test_get_reports_for_user_returns_empty_list_when_no_reports(db_session, user_a):
    """get_reports_for_user returns an empty list when the user has no reports."""
    results = report_service.get_reports_for_user(db_session, user_a.id)

    assert results == []


# ---------------------------------------------------------------------------
# create_report
# ---------------------------------------------------------------------------


def test_create_report_persists_with_in_progress_status_and_correct_owner(db_session, user_a):
    """create_report saves a record with status='In Progress' and the given owner_id."""
    data = ExpenseReportCreate(title="Q1 Travel", total_amount=450.0)

    report = report_service.create_report(db_session, user_a.id, data)

    assert report.id is not None
    assert report.status == "In Progress"
    assert report.owner_id == user_a.id

    persisted = db_session.get(ExpenseReport, report.id)
    assert persisted is not None
    assert persisted.status == "In Progress"
    assert persisted.owner_id == user_a.id


def test_create_report_stores_fields_exactly_as_provided(db_session, user_a):
    """create_report stores title, description, and total_amount without modification."""
    data = ExpenseReportCreate(
        title="Conference Expenses",
        description="Annual tech conference",
        total_amount=1234.56,
    )

    report = report_service.create_report(db_session, user_a.id, data)

    assert report.title == "Conference Expenses"
    assert report.description == "Annual tech conference"
    assert report.total_amount == pytest.approx(1234.56)


def test_create_report_sets_created_at_to_utc_datetime(db_session, user_a):
    """create_report sets created_at to a UTC datetime on creation."""
    before = datetime.now(timezone.utc)
    data = ExpenseReportCreate(title="Lunch", total_amount=20.0)

    report = report_service.create_report(db_session, user_a.id, data)

    after = datetime.now(timezone.utc)
    # created_at should be between before and after
    # SQLite stores without timezone info, so compare naive
    created_naive = report.created_at.replace(tzinfo=None) if report.created_at.tzinfo else report.created_at
    before_naive = before.replace(tzinfo=None)
    after_naive = after.replace(tzinfo=None)
    assert before_naive <= created_naive <= after_naive


def test_create_report_admin_notes_is_none(db_session, user_a):
    """create_report always sets admin_notes to None — it is not user-settable."""
    data = ExpenseReportCreate(title="Misc", total_amount=10.0)

    report = report_service.create_report(db_session, user_a.id, data)

    assert report.admin_notes is None


def test_create_report_reimbursable_defaults_to_false(db_session, user_a):
    """create_report stores reimbursable_from_client=False when not provided."""
    data = ExpenseReportCreate(title="Misc", total_amount=10.0)

    report = report_service.create_report(db_session, user_a.id, data)

    assert report.reimbursable_from_client is False


def test_create_report_stores_reimbursable_and_client(db_session, user_a):
    """create_report persists reimbursable_from_client and client correctly."""
    data = ExpenseReportCreate(
        title="Client Trip",
        total_amount=500.0,
        reimbursable_from_client=True,
        client="Acme Corp",
    )

    report = report_service.create_report(db_session, user_a.id, data)

    assert report.reimbursable_from_client is True
    assert report.client == "Acme Corp"


def test_create_report_purpose_field_does_not_exist(db_session, user_a):
    """The old 'purpose' field must not exist on the returned ORM object."""
    data = ExpenseReportCreate(title="Misc", total_amount=10.0)

    report = report_service.create_report(db_session, user_a.id, data)

    assert not hasattr(report, "purpose")


def test_create_report_owner_username_accessible(db_session, user_a):
    """create_report eagerly loads the owner relationship so owner.username is accessible."""
    data = ExpenseReportCreate(title="Owner Check", total_amount=30.0)

    report = report_service.create_report(db_session, user_a.id, data)

    # owner relationship must be loaded — no lazy-load exception
    assert report.owner is not None
    assert report.owner.username == "alice"


def test_get_reports_for_user_owner_username_accessible(db_session, user_a):
    """get_reports_for_user eagerly loads owner so owner.username is accessible."""
    data = ExpenseReportCreate(title="Eager Load Test", total_amount=75.0)
    report_service.create_report(db_session, user_a.id, data)

    results = report_service.get_reports_for_user(db_session, user_a.id)

    assert len(results) == 1
    # owner relationship must be loaded — no lazy-load exception
    assert results[0].owner is not None
    assert results[0].owner.username == "alice"
