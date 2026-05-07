"""Unit tests for the Attachment SQLAlchemy ORM model.

Tests cover:
- Model creation with valid data
- Unique constraint on expense_report_line_id
- Cascade delete behavior (attachment removed when parent line is deleted)
- Timestamp auto-generation
- ORM relationship between Attachment and ExpenseLine
"""

import pytest
from datetime import datetime, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.db.database import Base
from app.models.attachment import Attachment
from app.models.expense_line import ExpenseLine
from app.models.expense_report import ExpenseReport
from app.models.role import Role
from app.models.user import User


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def db_session():
    """Yield a SQLAlchemy session backed by a fresh in-memory SQLite database.

    FK enforcement is explicitly enabled via PRAGMA because SQLite disables it
    by default.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)

    Session = sessionmaker(bind=engine)
    session = Session()

    # Seed roles required by User FK
    session.add(Role(id=1, name="User"))
    session.add(Role(id=2, name="Admin"))
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


def make_user(session, username: str = "alice") -> User:
    user = User(username=username, hashed_password="hashed_pw", role_id=1)
    session.add(user)
    session.flush()
    return user


def make_report(session, owner: User) -> ExpenseReport:
    report = ExpenseReport(
        title="Q1 Travel",
        owner_id=owner.id,
        created_at=datetime.now(timezone.utc),
    )
    session.add(report)
    session.flush()
    return report


def make_line(session, report: ExpenseReport) -> ExpenseLine:
    line = ExpenseLine(
        report_id=report.id,
        description="Hotel stay",
        amount=150.00,
        incurred_date=datetime(2026, 5, 1).date(),
    )
    session.add(line)
    session.flush()
    return line


def make_attachment(session, line: ExpenseLine, **kwargs) -> Attachment:
    defaults = dict(
        expense_report_line_id=line.id,
        file_name="receipt.pdf",
        file_size=12345,
        mime_type="application/pdf",
        storage_path="/secure/attachments/some-uuid/receipt.pdf",
    )
    defaults.update(kwargs)
    attachment = Attachment(**defaults)
    session.add(attachment)
    session.flush()
    return attachment


# ---------------------------------------------------------------------------
# Attachment model tests
# ---------------------------------------------------------------------------


class TestAttachmentModel:
    def test_create_attachment_persists_and_is_retrievable(self, db_session):
        """An Attachment created with valid fields should be saved and queryable."""
        user = make_user(db_session)
        report = make_report(db_session, user)
        line = make_line(db_session, report)
        attachment = make_attachment(db_session, line)
        db_session.commit()

        fetched = db_session.query(Attachment).filter_by(id=attachment.id).one()
        assert fetched.id is not None
        assert fetched.expense_report_line_id == line.id
        assert fetched.file_name == "receipt.pdf"
        assert fetched.file_size == 12345
        assert fetched.mime_type == "application/pdf"
        assert fetched.storage_path == "/secure/attachments/some-uuid/receipt.pdf"

    def test_created_at_is_auto_generated(self, db_session):
        """created_at should be populated automatically and be a datetime."""
        user = make_user(db_session)
        report = make_report(db_session, user)
        line = make_line(db_session, report)
        attachment = make_attachment(db_session, line)
        db_session.commit()

        fetched = db_session.query(Attachment).filter_by(id=attachment.id).one()
        assert fetched.created_at is not None
        assert isinstance(fetched.created_at, datetime)

    def test_unique_constraint_on_expense_report_line_id(self, db_session):
        """Adding a second Attachment to the same ExpenseLine must raise IntegrityError."""
        user = make_user(db_session)
        report = make_report(db_session, user)
        line = make_line(db_session, report)
        make_attachment(db_session, line, file_name="first.pdf")
        db_session.commit()

        db_session.add(Attachment(
            expense_report_line_id=line.id,
            file_name="second.pdf",
            file_size=999,
            mime_type="application/pdf",
            storage_path="/secure/attachments/other-uuid/second.pdf",
        ))
        with pytest.raises(IntegrityError):
            db_session.commit()

    def test_cascade_delete_removes_attachment_when_line_is_deleted(self, db_session):
        """Deleting an ExpenseLine must cascade-delete its associated Attachment."""
        user = make_user(db_session)
        report = make_report(db_session, user)
        line = make_line(db_session, report)
        attachment = make_attachment(db_session, line)
        db_session.commit()

        attachment_id = attachment.id

        db_session.delete(line)
        db_session.commit()

        result = db_session.query(Attachment).filter_by(id=attachment_id).first()
        assert result is None

    def test_relationship_from_attachment_to_line(self, db_session):
        """The expense_report_line relationship should resolve to the parent ExpenseLine."""
        user = make_user(db_session)
        report = make_report(db_session, user)
        line = make_line(db_session, report)
        attachment = make_attachment(db_session, line)
        db_session.commit()

        fetched = db_session.query(Attachment).filter_by(id=attachment.id).one()
        assert fetched.expense_report_line is not None
        assert fetched.expense_report_line.id == line.id
        assert fetched.expense_report_line.description == "Hotel stay"

    def test_relationship_from_line_to_attachment(self, db_session):
        """The attachment relationship on ExpenseLine should resolve to the Attachment."""
        user = make_user(db_session)
        report = make_report(db_session, user)
        line = make_line(db_session, report)
        make_attachment(db_session, line)
        db_session.commit()

        fetched_line = db_session.query(ExpenseLine).filter_by(id=line.id).one()
        assert fetched_line.attachment is not None
        assert fetched_line.attachment.file_name == "receipt.pdf"

    def test_line_with_no_attachment_has_none(self, db_session):
        """An ExpenseLine with no attachment should have attachment=None."""
        user = make_user(db_session)
        report = make_report(db_session, user)
        line = make_line(db_session, report)
        db_session.commit()

        fetched_line = db_session.query(ExpenseLine).filter_by(id=line.id).one()
        assert fetched_line.attachment is None

    def test_missing_required_field_raises_integrity_error(self, db_session):
        """Creating an Attachment without a required field must raise IntegrityError."""
        user = make_user(db_session)
        report = make_report(db_session, user)
        line = make_line(db_session, report)
        db_session.commit()

        # file_name is nullable=False; omitting it should fail at DB level
        db_session.add(Attachment(
            expense_report_line_id=line.id,
            file_name=None,  # violates NOT NULL
            file_size=100,
            mime_type="application/pdf",
            storage_path="/secure/attachments/uuid/file.pdf",
        ))
        with pytest.raises(IntegrityError):
            db_session.commit()
