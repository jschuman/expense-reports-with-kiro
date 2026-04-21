"""Unit tests for SQLAlchemy ORM models (User and ExpenseReport).

Each test uses an in-memory SQLite database with a fresh schema so tests are
fully isolated from one another and from the on-disk development database.
"""

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.db.database import Base
from app.models.expense_report import ExpenseReport
from app.models.user import User


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def db_session():
    """Yield a SQLAlchemy session backed by a fresh in-memory SQLite database.

    The schema is created before the test and dropped afterwards, guaranteeing
    full isolation between test cases.

    Foreign key enforcement is explicitly enabled via PRAGMA because SQLite
    disables it by default.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )

    # Enable FK enforcement for every connection on this engine.
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    # Register all mapped classes with this engine's metadata.
    Base.metadata.create_all(bind=engine)

    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


# ---------------------------------------------------------------------------
# Helper factories
# ---------------------------------------------------------------------------


def make_user(username: str = "alice", hashed_password: str = "hashed_pw") -> User:
    return User(username=username, hashed_password=hashed_password)


def make_report(owner_id: int, **kwargs) -> ExpenseReport:
    defaults = {
        "title": "Q1 Travel",
        "purpose": "Client visit",
        "total_amount": 450.00,
        "owner_id": owner_id,
    }
    defaults.update(kwargs)
    return ExpenseReport(**defaults)


# ---------------------------------------------------------------------------
# User model tests
# ---------------------------------------------------------------------------


class TestUserModel:
    def test_create_user_persists_and_is_retrievable(self, db_session):
        """A User created with valid fields should be saved and queryable."""
        user = make_user()
        db_session.add(user)
        db_session.commit()

        fetched = db_session.query(User).filter_by(username="alice").one()
        assert fetched.id is not None
        assert fetched.username == "alice"
        assert fetched.hashed_password == "hashed_pw"

    def test_duplicate_username_raises_integrity_error(self, db_session):
        """Inserting two Users with the same username must raise IntegrityError."""
        db_session.add(make_user(username="bob"))
        db_session.commit()

        db_session.add(make_user(username="bob"))
        with pytest.raises(IntegrityError):
            db_session.commit()

    def test_hashed_password_stored_as_is(self, db_session):
        """The model layer must NOT transform hashed_password — it is stored verbatim."""
        raw_hash = "$2b$12$examplehashvalue"
        user = make_user(hashed_password=raw_hash)
        db_session.add(user)
        db_session.commit()

        fetched = db_session.query(User).filter_by(username="alice").one()
        assert fetched.hashed_password == raw_hash

    def test_reports_relationship_empty_by_default(self, db_session):
        """A newly created User with no associated reports should have an empty list."""
        user = make_user()
        db_session.add(user)
        db_session.commit()

        fetched = db_session.query(User).filter_by(username="alice").one()
        assert fetched.reports == []


# ---------------------------------------------------------------------------
# ExpenseReport model tests
# ---------------------------------------------------------------------------


class TestExpenseReportModel:
    def test_create_report_persists_and_is_retrievable(self, db_session):
        """An ExpenseReport created with valid fields should be saved and queryable."""
        user = make_user()
        db_session.add(user)
        db_session.commit()

        report = make_report(owner_id=user.id)
        db_session.add(report)
        db_session.commit()

        fetched = db_session.query(ExpenseReport).filter_by(title="Q1 Travel").one()
        assert fetched.id is not None
        assert fetched.title == "Q1 Travel"
        assert fetched.purpose == "Client visit"
        assert fetched.total_amount == 450.00
        assert fetched.owner_id == user.id

    def test_status_defaults_to_pending(self, db_session):
        """status should default to 'Pending' when not explicitly provided."""
        user = make_user()
        db_session.add(user)
        db_session.commit()

        # Do NOT pass status — rely on the column default.
        report = ExpenseReport(
            title="No Status",
            purpose="Testing default",
            total_amount=100.0,
            owner_id=user.id,
        )
        db_session.add(report)
        db_session.commit()

        fetched = db_session.query(ExpenseReport).filter_by(title="No Status").one()
        assert fetched.status == "Pending"

    def test_nonexistent_owner_id_raises_integrity_error(self, db_session):
        """Inserting a report with a non-existent owner_id must raise IntegrityError."""
        report = make_report(owner_id=9999)
        db_session.add(report)
        with pytest.raises(IntegrityError):
            db_session.commit()

    def test_owner_back_populates_to_user(self, db_session):
        """The owner relationship on ExpenseReport should resolve to the correct User."""
        user = make_user()
        db_session.add(user)
        db_session.commit()

        report = make_report(owner_id=user.id)
        db_session.add(report)
        db_session.commit()

        fetched_report = db_session.query(ExpenseReport).filter_by(title="Q1 Travel").one()
        assert fetched_report.owner is not None
        assert fetched_report.owner.id == user.id
        assert fetched_report.owner.username == "alice"

    def test_user_reports_relationship_populated(self, db_session):
        """After adding a report, the User.reports list should contain that report."""
        user = make_user()
        db_session.add(user)
        db_session.commit()

        report = make_report(owner_id=user.id)
        db_session.add(report)
        db_session.commit()

        # Expire the cached state so SQLAlchemy re-fetches from DB.
        db_session.expire(user)
        assert len(user.reports) == 1
        assert user.reports[0].title == "Q1 Travel"
