"""Unit tests for SQLAlchemy ORM models (User and ExpenseReport).

Each test uses an in-memory SQLite database with a fresh schema so tests are
fully isolated from one another and from the on-disk development database.
"""

import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.db.database import Base
from app.models.expense_report import ExpenseReport
from app.models.role import Role
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
    
    Roles are seeded automatically for tests that require them.
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
        engine.dispose()


# ---------------------------------------------------------------------------
# Helper factories
# ---------------------------------------------------------------------------


def make_user(username: str = "alice", hashed_password: str = "hashed_pw", role_id: int = 1) -> User:
    return User(username=username, hashed_password=hashed_password, role_id=role_id)


def make_report(owner_id: int, **kwargs) -> ExpenseReport:
    defaults = {
        "title": "Q1 Travel",
        "description": None,
        "total_amount": 450.00,
        "owner_id": owner_id,
        "created_at": datetime.now(timezone.utc),
    }
    defaults.update(kwargs)
    return ExpenseReport(**defaults)


# ---------------------------------------------------------------------------
# Role model tests
# ---------------------------------------------------------------------------


class TestRoleModel:
    def test_create_role_persists_and_is_retrievable(self, db_session):
        """A Role created with valid fields should be saved and queryable."""
        role = Role(name="Manager")
        db_session.add(role)
        db_session.commit()

        fetched = db_session.query(Role).filter_by(name="Manager").one()
        assert fetched.id is not None
        assert fetched.name == "Manager"

    def test_duplicate_role_name_raises_integrity_error(self, db_session):
        """Inserting two Roles with the same name must raise IntegrityError."""
        db_session.add(Role(name="Supervisor"))
        db_session.commit()

        db_session.add(Role(name="Supervisor"))
        with pytest.raises(IntegrityError):
            db_session.commit()

    def test_role_users_relationship_empty_by_default(self, db_session):
        """A newly created Role with no associated users should have an empty list."""
        role = Role(name="Guest")
        db_session.add(role)
        db_session.commit()

        fetched = db_session.query(Role).filter_by(name="Guest").one()
        assert fetched.users == []

    def test_role_users_relationship_populated(self, db_session):
        """After adding a user with a role, the Role.users list should contain that user."""
        # Use existing seeded role
        role = db_session.query(Role).filter_by(name="User").one()
        
        user = make_user(username="testuser", role_id=role.id)
        db_session.add(user)
        db_session.commit()

        # Expire the cached state so SQLAlchemy re-fetches from DB
        db_session.expire(role)
        assert len(role.users) >= 1
        assert any(u.username == "testuser" for u in role.users)

    def test_user_role_relationship_resolves_correctly(self, db_session):
        """The role relationship on User should resolve to the correct Role."""
        role = db_session.query(Role).filter_by(name="Admin").one()
        
        user = make_user(username="adminuser", role_id=role.id)
        db_session.add(user)
        db_session.commit()

        fetched_user = db_session.query(User).filter_by(username="adminuser").one()
        assert fetched_user.role is not None
        assert fetched_user.role.id == role.id
        assert fetched_user.role.name == "Admin"


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

    def test_user_with_role_id_foreign_key(self, db_session):
        """A User with a valid role_id should persist and reference the correct role."""
        admin_role = db_session.query(Role).filter_by(name="Admin").one()
        
        user = make_user(username="adminuser", role_id=admin_role.id)
        db_session.add(user)
        db_session.commit()

        fetched = db_session.query(User).filter_by(username="adminuser").one()
        assert fetched.role_id == admin_role.id
        assert fetched.role_id == 2  # Admin role has id=2

    def test_user_role_relationship_loads_correctly(self, db_session):
        """The role relationship on User should eagerly load the associated Role."""
        user_role = db_session.query(Role).filter_by(name="User").one()
        
        user = make_user(username="regularuser", role_id=user_role.id)
        db_session.add(user)
        db_session.commit()

        fetched = db_session.query(User).filter_by(username="regularuser").one()
        # Access the role relationship
        assert fetched.role is not None
        assert fetched.role.name == "User"
        assert fetched.role.id == user_role.id

    def test_user_without_role_id_fails_validation(self, db_session):
        """Creating a User without role_id must raise IntegrityError due to NOT NULL constraint."""
        # Attempt to create a user without role_id (violates NOT NULL constraint)
        user = User(username="noroleuser", hashed_password="hashed_pw")
        db_session.add(user)
        
        with pytest.raises(IntegrityError):
            db_session.commit()

    def test_user_with_invalid_role_id_fails_validation(self, db_session):
        """Creating a User with non-existent role_id must raise IntegrityError due to FK constraint."""
        # Attempt to create a user with a role_id that doesn't exist
        user = make_user(username="invalidrole", role_id=9999)
        db_session.add(user)
        
        with pytest.raises(IntegrityError):
            db_session.commit()


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
        assert fetched.description is None
        assert fetched.total_amount == 450.00
        assert fetched.owner_id == user.id

    def test_status_defaults_to_in_progress(self, db_session):
        """status should default to 'In Progress' when not explicitly provided."""
        user = make_user()
        db_session.add(user)
        db_session.commit()

        # Do NOT pass status — rely on the column default.
        report = ExpenseReport(
            title="No Status",
            total_amount=100.0,
            owner_id=user.id,
            created_at=datetime.now(timezone.utc),
        )
        db_session.add(report)
        db_session.commit()

        fetched = db_session.query(ExpenseReport).filter_by(title="No Status").one()
        assert fetched.status == "In Progress"

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

    def test_description_is_nullable(self, db_session):
        """description column should accept None (nullable)."""
        user = make_user()
        db_session.add(user)
        db_session.commit()

        report = make_report(owner_id=user.id, description=None)
        db_session.add(report)
        db_session.commit()

        fetched = db_session.query(ExpenseReport).filter_by(title="Q1 Travel").one()
        assert fetched.description is None

    def test_description_stores_value_when_provided(self, db_session):
        """description column should store and return a string value."""
        user = make_user()
        db_session.add(user)
        db_session.commit()

        report = make_report(owner_id=user.id, description="Client visit to NYC")
        db_session.add(report)
        db_session.commit()

        fetched = db_session.query(ExpenseReport).filter_by(title="Q1 Travel").one()
        assert fetched.description == "Client visit to NYC"

    def test_created_at_is_stored_and_non_null(self, db_session):
        """created_at must be stored and returned as a non-null datetime."""
        user = make_user()
        db_session.add(user)
        db_session.commit()

        now = datetime.now(timezone.utc)
        report = make_report(owner_id=user.id, created_at=now)
        db_session.add(report)
        db_session.commit()

        fetched = db_session.query(ExpenseReport).filter_by(title="Q1 Travel").one()
        assert fetched.created_at is not None
        assert isinstance(fetched.created_at, datetime)

    def test_reimbursable_from_client_defaults_to_false(self, db_session):
        """reimbursable_from_client should default to False when not provided."""
        user = make_user()
        db_session.add(user)
        db_session.commit()

        report = make_report(owner_id=user.id)
        db_session.add(report)
        db_session.commit()

        fetched = db_session.query(ExpenseReport).filter_by(title="Q1 Travel").one()
        assert fetched.reimbursable_from_client is False

    def test_client_is_nullable(self, db_session):
        """client column should accept None (nullable)."""
        user = make_user()
        db_session.add(user)
        db_session.commit()

        report = make_report(owner_id=user.id, client=None)
        db_session.add(report)
        db_session.commit()

        fetched = db_session.query(ExpenseReport).filter_by(title="Q1 Travel").one()
        assert fetched.client is None

    def test_client_stores_value_when_provided(self, db_session):
        """client column should store and return a string value."""
        user = make_user()
        db_session.add(user)
        db_session.commit()

        report = make_report(owner_id=user.id, client="Acme Corp")
        db_session.add(report)
        db_session.commit()

        fetched = db_session.query(ExpenseReport).filter_by(title="Q1 Travel").one()
        assert fetched.client == "Acme Corp"

    def test_admin_notes_is_nullable(self, db_session):
        """admin_notes column should accept None (nullable)."""
        user = make_user()
        db_session.add(user)
        db_session.commit()

        report = make_report(owner_id=user.id, admin_notes=None)
        db_session.add(report)
        db_session.commit()

        fetched = db_session.query(ExpenseReport).filter_by(title="Q1 Travel").one()
        assert fetched.admin_notes is None

    def test_admin_notes_stores_value_when_provided(self, db_session):
        """admin_notes column should store and return a string value."""
        user = make_user()
        db_session.add(user)
        db_session.commit()

        report = make_report(owner_id=user.id, admin_notes="Approved by finance")
        db_session.add(report)
        db_session.commit()

        fetched = db_session.query(ExpenseReport).filter_by(title="Q1 Travel").one()
        assert fetched.admin_notes == "Approved by finance"
