"""Unit tests for attachment_service.py.

Each test uses an in-memory SQLite database and a temporary FileStorageManager
so the tests are fully isolated from the file system and from each other.

Coverage:
- upload_attachment: valid file, invalid extension, invalid MIME type,
  file > 10 MB, content mismatch, replaces existing, returns metadata
- delete_attachment: success, 404 missing attachment, 403 non-owner
- get_attachment: returns content + headers, 404 missing, 403 non-owner
- get_attachment_metadata: returns metadata, 404 missing, 403 non-owner
- Authorization: owner succeeds, non-owner non-admin → 403, admin succeeds

Requirements: 1.1-1.6, 3.1-3.5, 4.1-4.5, 6.1-6.4, 9.1-9.4
"""

from __future__ import annotations

import io
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — register all ORM models with Base
from app.db.database import Base
from app.models.attachment import Attachment
from app.models.expense_line import ExpenseLine
from app.models.expense_report import ExpenseReport
from app.models.role import Role
from app.models.user import User
from app.services import attachment_service
from app.services.auth_service import hash_password
from app.services.file_storage import FileStorageManager


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def db_session():
    """Fresh in-memory SQLite session with FK enforcement and seeded roles."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def set_pragma(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    session.add(Role(id=1, name="User"))
    session.add(Role(id=2, name="Admin"))
    session.commit()

    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def storage(tmp_path):
    """FileStorageManager rooted in a temp directory."""
    return FileStorageManager(storage_dir=str(tmp_path / "attachments"))


@pytest.fixture()
def owner(db_session):
    user = User(username="alice", hashed_password=hash_password("pw"), role_id=1)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(user, attribute_names=["role"])
    return user


@pytest.fixture()
def other_user(db_session):
    user = User(username="bob", hashed_password=hash_password("pw"), role_id=1)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(user, attribute_names=["role"])
    return user


@pytest.fixture()
def admin_user(db_session):
    user = User(username="admin", hashed_password=hash_password("pw"), role_id=2)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(user, attribute_names=["role"])
    return user


@pytest.fixture()
def report(db_session, owner):
    r = ExpenseReport(
        title="Q1 Travel",
        status="In Progress",
        owner_id=owner.id,
        created_at=datetime.now(timezone.utc),
        reimbursable_from_client=False,
    )
    db_session.add(r)
    db_session.commit()
    db_session.refresh(r)
    return r


@pytest.fixture()
def line(db_session, report):
    ln = ExpenseLine(
        report_id=report.id,
        description="Hotel",
        amount=200.0,
        incurred_date=date(2026, 5, 1),
    )
    db_session.add(ln)
    db_session.commit()
    db_session.refresh(ln)
    return ln


# ---------------------------------------------------------------------------
# Helper: build a fake UploadFile
# ---------------------------------------------------------------------------

PDF_MAGIC = b"%PDF-1.4 fake pdf content"
DOCX_MAGIC = b"PK\x03\x04" + b"\x00" * 50


def _make_upload_file(
    filename: str = "receipt.pdf",
    content_type: str = "application/pdf",
    content: bytes = PDF_MAGIC,
) -> MagicMock:
    """Return a mock UploadFile whose read() coroutine returns *content*."""
    mock_file = MagicMock()
    mock_file.filename = filename
    mock_file.content_type = content_type
    mock_file.read = AsyncMock(return_value=content)
    return mock_file


# ---------------------------------------------------------------------------
# upload_attachment tests
# ---------------------------------------------------------------------------


class TestUploadAttachment:
    @pytest.mark.asyncio
    async def test_valid_pdf_upload_succeeds(self, db_session, storage, owner, report, line):
        result = await attachment_service.upload_attachment(
            report_id=report.id,
            line_id=line.id,
            file=_make_upload_file(),
            current_user=owner,
            db=db_session,
            storage=storage,
        )
        assert result.file_name == "receipt.pdf"
        assert result.file_size == len(PDF_MAGIC)
        assert result.mime_type == "application/pdf"
        assert result.id is not None

    @pytest.mark.asyncio
    async def test_upload_returns_attachment_metadata_response(self, db_session, storage, owner, report, line):
        from app.schemas.attachment import AttachmentMetadataResponse
        result = await attachment_service.upload_attachment(
            report_id=report.id,
            line_id=line.id,
            file=_make_upload_file(),
            current_user=owner,
            db=db_session,
            storage=storage,
        )
        assert isinstance(result, AttachmentMetadataResponse)
        assert isinstance(result.created_at, datetime)

    @pytest.mark.asyncio
    async def test_upload_invalid_extension_returns_400(self, db_session, storage, owner, report, line):
        with pytest.raises(HTTPException) as exc_info:
            await attachment_service.upload_attachment(
                report_id=report.id,
                line_id=line.id,
                file=_make_upload_file(filename="image.png", content_type="image/png"),
                current_user=owner,
                db=db_session,
                storage=storage,
            )
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_upload_invalid_mime_type_returns_400(self, db_session, storage, owner, report, line):
        with pytest.raises(HTTPException) as exc_info:
            await attachment_service.upload_attachment(
                report_id=report.id,
                line_id=line.id,
                file=_make_upload_file(filename="file.pdf", content_type="text/plain"),
                current_user=owner,
                db=db_session,
                storage=storage,
            )
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_upload_file_too_large_returns_413(self, db_session, storage, owner, report, line):
        big_content = b"%PDF" + b"\x00" * (10 * 1024 * 1024 + 1)
        with pytest.raises(HTTPException) as exc_info:
            await attachment_service.upload_attachment(
                report_id=report.id,
                line_id=line.id,
                file=_make_upload_file(content=big_content),
                current_user=owner,
                db=db_session,
                storage=storage,
            )
        assert exc_info.value.status_code == 413

    @pytest.mark.asyncio
    async def test_upload_content_mismatch_returns_400(self, db_session, storage, owner, report, line):
        # Filename/MIME says PDF but content is DOCX magic bytes
        with pytest.raises(HTTPException) as exc_info:
            await attachment_service.upload_attachment(
                report_id=report.id,
                line_id=line.id,
                file=_make_upload_file(
                    filename="receipt.pdf",
                    content_type="application/pdf",
                    content=DOCX_MAGIC,  # wrong magic bytes for PDF
                ),
                current_user=owner,
                db=db_session,
                storage=storage,
            )
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_upload_replaces_existing_attachment(self, db_session, storage, owner, report, line):
        # First upload
        await attachment_service.upload_attachment(
            report_id=report.id,
            line_id=line.id,
            file=_make_upload_file(filename="first.pdf"),
            current_user=owner,
            db=db_session,
            storage=storage,
        )

        # Second upload to same line
        second = await attachment_service.upload_attachment(
            report_id=report.id,
            line_id=line.id,
            file=_make_upload_file(filename="second.pdf"),
            current_user=owner,
            db=db_session,
            storage=storage,
        )

        # Exactly one attachment should exist for this line
        count = (
            db_session.query(Attachment)
            .filter(Attachment.expense_report_line_id == line.id)
            .count()
        )
        assert count == 1
        assert second.file_name == "second.pdf"

    @pytest.mark.asyncio
    async def test_upload_non_owner_returns_403(self, db_session, storage, other_user, report, line):
        with pytest.raises(HTTPException) as exc_info:
            await attachment_service.upload_attachment(
                report_id=report.id,
                line_id=line.id,
                file=_make_upload_file(),
                current_user=other_user,
                db=db_session,
                storage=storage,
            )
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_upload_admin_non_owner_returns_403(self, db_session, storage, admin_user, report, line):
        """Upload is owner-only even for admins (read differs from write)."""
        with pytest.raises(HTTPException) as exc_info:
            await attachment_service.upload_attachment(
                report_id=report.id,
                line_id=line.id,
                file=_make_upload_file(),
                current_user=admin_user,
                db=db_session,
                storage=storage,
            )
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_upload_missing_report_returns_404(self, db_session, storage, owner, line):
        with pytest.raises(HTTPException) as exc_info:
            await attachment_service.upload_attachment(
                report_id=9999,
                line_id=line.id,
                file=_make_upload_file(),
                current_user=owner,
                db=db_session,
                storage=storage,
            )
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_upload_line_belongs_to_different_report_returns_404(
        self, db_session, storage, owner, report, line
    ):
        """Line exists but belongs to a different report → 404."""
        other_report = ExpenseReport(
            title="Other Report",
            status="In Progress",
            owner_id=owner.id,
            created_at=datetime.now(timezone.utc),
            reimbursable_from_client=False,
        )
        db_session.add(other_report)
        db_session.commit()
        db_session.refresh(other_report)

        with pytest.raises(HTTPException) as exc_info:
            await attachment_service.upload_attachment(
                report_id=other_report.id,
                line_id=line.id,  # line belongs to `report`, not `other_report`
                file=_make_upload_file(),
                current_user=owner,
                db=db_session,
                storage=storage,
            )
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_upload_replaces_attachment_when_physical_file_already_gone(
        self, db_session, storage, owner, report, line
    ):
        """Replacement upload succeeds even if the previous physical file was deleted."""
        # Seed a DB record whose physical file does NOT exist.
        att = Attachment(
            expense_report_line_id=line.id,
            file_name="ghost.pdf",
            file_size=100,
            mime_type="application/pdf",
            storage_path="/nonexistent/path/ghost.pdf",
        )
        db_session.add(att)
        db_session.commit()

        # Should not raise even though the old file is gone from disk.
        result = await attachment_service.upload_attachment(
            report_id=report.id,
            line_id=line.id,
            file=_make_upload_file(filename="new.pdf"),
            current_user=owner,
            db=db_session,
            storage=storage,
        )
        assert result.file_name == "new.pdf"
        count = (
            db_session.query(Attachment)
            .filter(Attachment.expense_report_line_id == line.id)
            .count()
        )
        assert count == 1


# ---------------------------------------------------------------------------
# delete_attachment tests
# ---------------------------------------------------------------------------


class TestDeleteAttachment:
    def _seed_attachment(self, db_session, storage, line) -> Attachment:
        path = storage.store_file(PDF_MAGIC, "receipt.pdf")
        att = Attachment(
            expense_report_line_id=line.id,
            file_name="receipt.pdf",
            file_size=len(PDF_MAGIC),
            mime_type="application/pdf",
            storage_path=path,
        )
        db_session.add(att)
        db_session.commit()
        return att

    def test_delete_removes_file_and_record(self, db_session, storage, owner, report, line):
        att = self._seed_attachment(db_session, storage, line)
        storage_path = att.storage_path

        attachment_service.delete_attachment(
            report_id=report.id,
            line_id=line.id,
            current_user=owner,
            db=db_session,
            storage=storage,
        )

        # DB record gone
        assert db_session.get(Attachment, att.id) is None
        # File gone
        from pathlib import Path
        assert not Path(storage_path).exists()

    def test_delete_missing_attachment_returns_404(self, db_session, storage, owner, report, line):
        with pytest.raises(HTTPException) as exc_info:
            attachment_service.delete_attachment(
                report_id=report.id,
                line_id=line.id,
                current_user=owner,
                db=db_session,
                storage=storage,
            )
        assert exc_info.value.status_code == 404

    def test_delete_non_owner_returns_403(self, db_session, storage, other_user, report, line):
        self._seed_attachment(db_session, storage, line)
        with pytest.raises(HTTPException) as exc_info:
            attachment_service.delete_attachment(
                report_id=report.id,
                line_id=line.id,
                current_user=other_user,
                db=db_session,
                storage=storage,
            )
        assert exc_info.value.status_code == 403

    def test_delete_missing_report_returns_404(self, db_session, storage, owner):
        with pytest.raises(HTTPException) as exc_info:
            attachment_service.delete_attachment(
                report_id=9999,
                line_id=1,
                current_user=owner,
                db=db_session,
                storage=storage,
            )
        assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# get_attachment tests
# ---------------------------------------------------------------------------


class TestGetAttachment:
    def _seed_attachment(self, db_session, storage, line) -> Attachment:
        path = storage.store_file(PDF_MAGIC, "receipt.pdf")
        att = Attachment(
            expense_report_line_id=line.id,
            file_name="receipt.pdf",
            file_size=len(PDF_MAGIC),
            mime_type="application/pdf",
            storage_path=path,
        )
        db_session.add(att)
        db_session.commit()
        return att

    def test_get_attachment_returns_content_mime_and_filename(self, db_session, storage, owner, report, line):
        self._seed_attachment(db_session, storage, line)
        content, mime, filename = attachment_service.get_attachment(
            report_id=report.id,
            line_id=line.id,
            current_user=owner,
            db=db_session,
            storage=storage,
        )
        assert content == PDF_MAGIC
        assert mime == "application/pdf"
        assert filename == "receipt.pdf"

    def test_get_attachment_admin_can_access(self, db_session, storage, admin_user, report, line):
        self._seed_attachment(db_session, storage, line)
        content, mime, filename = attachment_service.get_attachment(
            report_id=report.id,
            line_id=line.id,
            current_user=admin_user,
            db=db_session,
            storage=storage,
        )
        assert content == PDF_MAGIC

    def test_get_attachment_missing_returns_404(self, db_session, storage, owner, report, line):
        with pytest.raises(HTTPException) as exc_info:
            attachment_service.get_attachment(
                report_id=report.id,
                line_id=line.id,
                current_user=owner,
                db=db_session,
                storage=storage,
            )
        assert exc_info.value.status_code == 404

    def test_get_attachment_non_owner_non_admin_returns_403(self, db_session, storage, other_user, report, line):
        self._seed_attachment(db_session, storage, line)
        with pytest.raises(HTTPException) as exc_info:
            attachment_service.get_attachment(
                report_id=report.id,
                line_id=line.id,
                current_user=other_user,
                db=db_session,
                storage=storage,
            )
        assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# get_attachment_metadata tests
# ---------------------------------------------------------------------------


class TestGetAttachmentMetadata:
    def _seed_attachment(self, db_session, storage, line) -> Attachment:
        path = storage.store_file(PDF_MAGIC, "invoice.pdf")
        att = Attachment(
            expense_report_line_id=line.id,
            file_name="invoice.pdf",
            file_size=len(PDF_MAGIC),
            mime_type="application/pdf",
            storage_path=path,
        )
        db_session.add(att)
        db_session.commit()
        return att

    def test_get_metadata_returns_correct_fields(self, db_session, storage, owner, report, line):
        from app.schemas.attachment import AttachmentMetadataResponse
        att = self._seed_attachment(db_session, storage, line)
        result = attachment_service.get_attachment_metadata(
            report_id=report.id,
            line_id=line.id,
            current_user=owner,
            db=db_session,
            storage=storage,
        )
        assert isinstance(result, AttachmentMetadataResponse)
        assert result.id == att.id
        assert result.file_name == "invoice.pdf"
        assert result.mime_type == "application/pdf"
        assert result.file_size == len(PDF_MAGIC)

    def test_get_metadata_admin_can_access(self, db_session, storage, admin_user, report, line):
        self._seed_attachment(db_session, storage, line)
        result = attachment_service.get_attachment_metadata(
            report_id=report.id,
            line_id=line.id,
            current_user=admin_user,
            db=db_session,
            storage=storage,
        )
        assert result.file_name == "invoice.pdf"

    def test_get_metadata_missing_returns_404(self, db_session, storage, owner, report, line):
        with pytest.raises(HTTPException) as exc_info:
            attachment_service.get_attachment_metadata(
                report_id=report.id,
                line_id=line.id,
                current_user=owner,
                db=db_session,
                storage=storage,
            )
        assert exc_info.value.status_code == 404

    def test_get_metadata_non_owner_non_admin_returns_403(self, db_session, storage, other_user, report, line):
        self._seed_attachment(db_session, storage, line)
        with pytest.raises(HTTPException) as exc_info:
            attachment_service.get_attachment_metadata(
                report_id=report.id,
                line_id=line.id,
                current_user=other_user,
                db=db_session,
                storage=storage,
            )
        assert exc_info.value.status_code == 403
