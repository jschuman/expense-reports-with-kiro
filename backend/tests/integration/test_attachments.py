"""Integration tests for attachment endpoints using httpx.AsyncClient + ASGITransport.

Tests cover:
  POST   /reports/{report_id}/lines/{line_id}/attachments  — upload
  DELETE /reports/{report_id}/lines/{line_id}/attachments  — delete
  GET    /reports/{report_id}/lines/{line_id}/attachments  — download
  GET    /reports/{report_id}/lines/{line_id}/attachments/metadata

Requirements: 8.1-8.6, 9.1-9.4
"""

from __future__ import annotations

import io
from datetime import date, datetime, timezone

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models as _models  # noqa: F401 — register all ORM models with Base
from app.db.database import Base, get_db
from app.dependencies import get_storage
from app.main import app
from app.models.expense_line import ExpenseLine
from app.models.expense_report import ExpenseReport
from app.models.role import Role
from app.models.user import User
from app.services.auth_service import hash_password
from app.services.file_storage import FileStorageManager

# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

PDF_MAGIC = b"%PDF-1.4 test content for integration tests"
DOCX_MAGIC = b"PK\x03\x04" + b"\x00" * 50


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
async def async_client(tmp_path):
    """Yield an httpx.AsyncClient backed by a fresh in-memory SQLite DB
    and a temporary FileStorageManager."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine)

    session = TestSession()
    try:
        session.add(Role(id=1, name="User"))
        session.add(Role(id=2, name="Admin"))
        session.commit()
    finally:
        session.close()

    def override_get_db():
        s = TestSession()
        try:
            yield s
        finally:
            s.close()

    test_storage = FileStorageManager(storage_dir=str(tmp_path / "attachments"))

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_storage] = lambda: test_storage

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        client._test_session_factory = TestSession  # type: ignore[attr-defined]
        client._test_storage = test_storage  # type: ignore[attr-defined]
        yield client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
async def owner(async_client):
    session = async_client._test_session_factory()
    try:
        user = User(username="owner", hashed_password=hash_password("ownerpass"), role_id=1)
        session.add(user)
        session.commit()
        session.refresh(user)
        return {"id": user.id, "username": "owner", "password": "ownerpass"}
    finally:
        session.close()


@pytest.fixture()
async def other_user(async_client):
    session = async_client._test_session_factory()
    try:
        user = User(username="other", hashed_password=hash_password("otherpass"), role_id=1)
        session.add(user)
        session.commit()
        session.refresh(user)
        return {"id": user.id, "username": "other", "password": "otherpass"}
    finally:
        session.close()


@pytest.fixture()
async def admin_user(async_client):
    session = async_client._test_session_factory()
    try:
        user = User(username="admin", hashed_password=hash_password("adminpass"), role_id=2)
        session.add(user)
        session.commit()
        session.refresh(user)
        return {"id": user.id, "username": "admin", "password": "adminpass"}
    finally:
        session.close()


@pytest.fixture()
async def owner_report(async_client, owner):
    session = async_client._test_session_factory()
    try:
        report = ExpenseReport(
            title="Q1 Travel",
            status="In Progress",
            owner_id=owner["id"],
            created_at=datetime.now(timezone.utc),
            reimbursable_from_client=False,
        )
        session.add(report)
        session.commit()
        session.refresh(report)
        return report.id
    finally:
        session.close()


@pytest.fixture()
async def owner_line(async_client, owner_report):
    session = async_client._test_session_factory()
    try:
        line = ExpenseLine(
            report_id=owner_report,
            description="Hotel",
            amount=200.0,
            incurred_date=date(2026, 5, 1),
        )
        session.add(line)
        session.commit()
        session.refresh(line)
        return line.id
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _login(client, credentials):
    return await client.post(
        "/auth/login",
        json={"username": credentials["username"], "password": credentials["password"]},
    )


def _pdf_file(filename: str = "receipt.pdf", content: bytes = PDF_MAGIC):
    return ("file", (filename, io.BytesIO(content), "application/pdf"))


def _attachment_url(report_id: int, line_id: int) -> str:
    return f"/reports/{report_id}/lines/{line_id}/attachments"


def _metadata_url(report_id: int, line_id: int) -> str:
    return f"/reports/{report_id}/lines/{line_id}/attachments/metadata"


# ---------------------------------------------------------------------------
# POST /reports/{report_id}/lines/{line_id}/attachments — upload
# ---------------------------------------------------------------------------


class TestUploadAttachmentEndpoint:
    @pytest.mark.asyncio
    async def test_valid_pdf_upload_returns_201_with_metadata(
        self, async_client, owner, owner_report, owner_line
    ):
        await _login(async_client, owner)
        resp = await async_client.post(
            _attachment_url(owner_report, owner_line),
            files=[_pdf_file()],
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["file_name"] == "receipt.pdf"
        assert body["mime_type"] == "application/pdf"
        assert body["file_size"] == len(PDF_MAGIC)
        assert "id" in body
        assert "created_at" in body

    @pytest.mark.asyncio
    async def test_upload_invalid_file_type_returns_400(
        self, async_client, owner, owner_report, owner_line
    ):
        await _login(async_client, owner)
        resp = await async_client.post(
            _attachment_url(owner_report, owner_line),
            files=[("file", ("photo.png", io.BytesIO(b"PNG\x00data"), "image/png"))],
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_upload_file_too_large_returns_413(
        self, async_client, owner, owner_report, owner_line
    ):
        await _login(async_client, owner)
        big = b"%PDF" + b"\x00" * (10 * 1024 * 1024 + 1)
        resp = await async_client.post(
            _attachment_url(owner_report, owner_line),
            files=[_pdf_file(content=big)],
        )
        assert resp.status_code == 413

    @pytest.mark.asyncio
    async def test_upload_content_mismatch_returns_400(
        self, async_client, owner, owner_report, owner_line
    ):
        await _login(async_client, owner)
        # DOCX magic bytes declared as PDF
        resp = await async_client.post(
            _attachment_url(owner_report, owner_line),
            files=[_pdf_file(content=DOCX_MAGIC)],
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_upload_requires_authentication_returns_401(
        self, async_client, owner_report, owner_line
    ):
        # No login — no session cookie
        resp = await async_client.post(
            _attachment_url(owner_report, owner_line),
            files=[_pdf_file()],
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_upload_non_owner_returns_403(
        self, async_client, other_user, owner_report, owner_line
    ):
        await _login(async_client, other_user)
        resp = await async_client.post(
            _attachment_url(owner_report, owner_line),
            files=[_pdf_file()],
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_upload_missing_report_returns_404(
        self, async_client, owner, owner_line
    ):
        await _login(async_client, owner)
        resp = await async_client.post(
            _attachment_url(9999, owner_line),
            files=[_pdf_file()],
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /reports/{report_id}/lines/{line_id}/attachments
# ---------------------------------------------------------------------------


class TestDeleteAttachmentEndpoint:
    async def _upload(self, client, report_id, line_id):
        return await client.post(
            _attachment_url(report_id, line_id),
            files=[_pdf_file()],
        )

    @pytest.mark.asyncio
    async def test_delete_returns_204(
        self, async_client, owner, owner_report, owner_line
    ):
        await _login(async_client, owner)
        await self._upload(async_client, owner_report, owner_line)
        resp = await async_client.delete(_attachment_url(owner_report, owner_line))
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_missing_attachment_returns_404(
        self, async_client, owner, owner_report, owner_line
    ):
        await _login(async_client, owner)
        resp = await async_client.delete(_attachment_url(owner_report, owner_line))
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_requires_authentication_returns_401(
        self, async_client, owner_report, owner_line
    ):
        resp = await async_client.delete(_attachment_url(owner_report, owner_line))
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_delete_non_owner_returns_403(
        self, async_client, owner, other_user, owner_report, owner_line
    ):
        await _login(async_client, owner)
        await self._upload(async_client, owner_report, owner_line)
        # Switch to other_user
        await async_client.post("/auth/logout")
        await _login(async_client, other_user)
        resp = await async_client.delete(_attachment_url(owner_report, owner_line))
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /reports/{report_id}/lines/{line_id}/attachments — download
# ---------------------------------------------------------------------------


class TestGetAttachmentEndpoint:
    async def _upload(self, client, report_id, line_id):
        return await client.post(
            _attachment_url(report_id, line_id),
            files=[_pdf_file()],
        )

    @pytest.mark.asyncio
    async def test_get_returns_file_content_and_correct_headers(
        self, async_client, owner, owner_report, owner_line
    ):
        await _login(async_client, owner)
        await self._upload(async_client, owner_report, owner_line)
        resp = await async_client.get(_attachment_url(owner_report, owner_line))
        assert resp.status_code == 200
        assert resp.content == PDF_MAGIC
        assert resp.headers["content-type"] == "application/pdf"
        assert 'filename="receipt.pdf"' in resp.headers["content-disposition"]
        assert "attachment" in resp.headers["content-disposition"]

    @pytest.mark.asyncio
    async def test_get_admin_can_download(
        self, async_client, owner, admin_user, owner_report, owner_line
    ):
        await _login(async_client, owner)
        await self._upload(async_client, owner_report, owner_line)
        await async_client.post("/auth/logout")
        await _login(async_client, admin_user)
        resp = await async_client.get(_attachment_url(owner_report, owner_line))
        assert resp.status_code == 200
        assert resp.content == PDF_MAGIC

    @pytest.mark.asyncio
    async def test_get_missing_attachment_returns_404(
        self, async_client, owner, owner_report, owner_line
    ):
        await _login(async_client, owner)
        resp = await async_client.get(_attachment_url(owner_report, owner_line))
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_requires_authentication_returns_401(
        self, async_client, owner_report, owner_line
    ):
        resp = await async_client.get(_attachment_url(owner_report, owner_line))
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_non_owner_non_admin_returns_403(
        self, async_client, owner, other_user, owner_report, owner_line
    ):
        await _login(async_client, owner)
        await self._upload(async_client, owner_report, owner_line)
        await async_client.post("/auth/logout")
        await _login(async_client, other_user)
        resp = await async_client.get(_attachment_url(owner_report, owner_line))
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /reports/{report_id}/lines/{line_id}/attachments/metadata
# ---------------------------------------------------------------------------


class TestGetAttachmentMetadataEndpoint:
    async def _upload(self, client, report_id, line_id):
        return await client.post(
            _attachment_url(report_id, line_id),
            files=[_pdf_file()],
        )

    @pytest.mark.asyncio
    async def test_get_metadata_returns_200_with_json(
        self, async_client, owner, owner_report, owner_line
    ):
        await _login(async_client, owner)
        await self._upload(async_client, owner_report, owner_line)
        resp = await async_client.get(_metadata_url(owner_report, owner_line))
        assert resp.status_code == 200
        body = resp.json()
        assert body["file_name"] == "receipt.pdf"
        assert body["mime_type"] == "application/pdf"
        assert body["file_size"] == len(PDF_MAGIC)
        assert "id" in body
        assert "created_at" in body

    @pytest.mark.asyncio
    async def test_get_metadata_admin_can_access(
        self, async_client, owner, admin_user, owner_report, owner_line
    ):
        await _login(async_client, owner)
        await self._upload(async_client, owner_report, owner_line)
        await async_client.post("/auth/logout")
        await _login(async_client, admin_user)
        resp = await async_client.get(_metadata_url(owner_report, owner_line))
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_get_metadata_missing_attachment_returns_404(
        self, async_client, owner, owner_report, owner_line
    ):
        await _login(async_client, owner)
        resp = await async_client.get(_metadata_url(owner_report, owner_line))
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_metadata_requires_authentication_returns_401(
        self, async_client, owner_report, owner_line
    ):
        resp = await async_client.get(_metadata_url(owner_report, owner_line))
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_metadata_non_owner_non_admin_returns_403(
        self, async_client, owner, other_user, owner_report, owner_line
    ):
        await _login(async_client, owner)
        await self._upload(async_client, owner_report, owner_line)
        await async_client.post("/auth/logout")
        await _login(async_client, other_user)
        resp = await async_client.get(_metadata_url(owner_report, owner_line))
        assert resp.status_code == 403
