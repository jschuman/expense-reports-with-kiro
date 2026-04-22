"""Unit tests for report_service.py.

Uses an in-memory SQLite database with a fresh schema per test so each
test is fully isolated.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base
from app.models.expense_report import ExpenseReport
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
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def user_a(db_session):
    """Seed and return a User with username 'alice'."""
    user = User(username="alice", hashed_password=hash_password("pw"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def user_b(db_session):
    """Seed and return a second User with username 'bob'."""
    user = User(username="bob", hashed_password=hash_password("pw"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


# ---------------------------------------------------------------------------
# get_reports_for_user
# ---------------------------------------------------------------------------


def test_get_reports_for_user_returns_only_that_users_reports(db_session, user_a, user_b):
    """get_reports_for_user returns only reports whose owner_id matches user_id."""
    # Seed two reports for alice and one for bob
    r1 = ExpenseReport(
        title="Alice Report 1",
        purpose="Travel",
        total_amount=100.0,
        status="Pending",
        owner_id=user_a.id,
    )
    r2 = ExpenseReport(
        title="Alice Report 2",
        purpose="Meals",
        total_amount=50.0,
        status="Pending",
        owner_id=user_a.id,
    )
    r3 = ExpenseReport(
        title="Bob Report 1",
        purpose="Supplies",
        total_amount=200.0,
        status="Pending",
        owner_id=user_b.id,
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


def test_create_report_persists_with_pending_status_and_correct_owner(db_session, user_a):
    """create_report saves a record with status='Pending' and the given owner_id."""
    data = ExpenseReportCreate(title="Q1 Travel", purpose="Client visit", total_amount=450.0)

    report = report_service.create_report(db_session, user_a.id, data)

    assert report.id is not None
    assert report.status == "Pending"
    assert report.owner_id == user_a.id

    # Verify it is actually persisted in the DB
    persisted = db_session.get(ExpenseReport, report.id)
    assert persisted is not None
    assert persisted.status == "Pending"
    assert persisted.owner_id == user_a.id


def test_create_report_stores_fields_exactly_as_provided(db_session, user_a):
    """create_report stores title, purpose, and total_amount without modification."""
    data = ExpenseReportCreate(
        title="Conference Expenses",
        purpose="Annual tech conference",
        total_amount=1234.56,
    )

    report = report_service.create_report(db_session, user_a.id, data)

    assert report.title == "Conference Expenses"
    assert report.purpose == "Annual tech conference"
    assert report.total_amount == pytest.approx(1234.56)
