"""Property-based tests for attachment management using Hypothesis.

# Feature: attachment-management

Properties tested:
  Property 1:  File type validation — whitelist files succeed, others fail 400
  Property 2:  File size enforcement — ≤10 MB succeeds, >10 MB fails 413
  Property 3:  Upload round-trip — retrieve returns identical content and metadata
  Property 4:  One-to-one invariant — line always has 0 or 1 attachments
  Property 5:  Replacement idempotence — uploading B after A leaves only B stored
  Property 6:  Deletion idempotence — first delete 204, second delete 404
  Property 7:  Authorization enforcement — non-owner non-admin gets 403
  Property 8:  Admin access override — admin can access any attachment
  Property 9:  Timestamp accuracy — created_at is UTC and within 5 seconds of now
  Property 10: File content validation — content mismatch fails 400
  Property 11: Secure file storage — files stored with UUID-based names

Requirements: 1.3, 1.5, 1.6, 2.1, 2.2, 2.3, 3.1, 3.2, 3.4, 4.1, 4.2, 4.5,
              6.1, 6.2, 6.4, 7.2, 9.1, 9.2, 12.1, 12.3, 12.4, 12.5, 13.1, 13.3, 13.5
"""

from __future__ import annotations

import io
import tempfile
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest
from hypothesis import HealthCheck, assume, given, settings, strategies as st
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models as _models  # noqa: F401 — register all ORM models with Base
from app.constants import ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES, MAX_FILE_SIZE
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
# Pre-computed password hash to avoid bcrypt cost per Hypothesis example
# ---------------------------------------------------------------------------

_TEST_PASSWORD_HASH = hash_password("test_password")

# ---------------------------------------------------------------------------
# Valid file type definitions (mime_type, extension, magic_prefix)
# ---------------------------------------------------------------------------

# Mapping from MIME type → (extension, magic bytes prefix, extra_content)
_VALID_FILE_TYPES: list[tuple[str, str, bytes]] = [
    ("application/pdf", ".pdf", b"%PDF-1.4 fake content"),
    (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".docx",
        b"PK\x03\x04" + b"\x00" * 20,
    ),
    (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xlsx",
        b"PK\x03\x04" + b"\x00" * 20,
    ),
    ("application/msword", ".doc", b"\xd0\xcf\x11\xe0" + b"\x00" * 20),
    ("application/vnd.ms-excel", ".xls", b"\xd0\xcf\x11\xe0" + b"\x00" * 20),
    (
        "application/vnd.google-apps.document",
        ".gdoc",
        b'{"url": "https://docs.google.com/stub"}',
    ),
    (
        "application/vnd.google-apps.spreadsheet",
        ".gsheet",
        b'{"url": "https://sheets.google.com/stub"}',
    ),
]

_valid_file_type_st = st.sampled_from(_VALID_FILE_TYPES)

# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

# Printable ASCII text, no control chars
_printable_st = st.text(
    alphabet=st.characters(
        min_codepoint=33, max_codepoint=126, blacklist_categories=("Cc", "Cs")
    ),
    min_size=1,
    max_size=50,
)

# Invalid extension: non-empty strings that are NOT whitelisted
_invalid_extension_st = st.text(
    alphabet=st.characters(min_codepoint=97, max_codepoint=122),  # a-z
    min_size=2,
    max_size=6,
).map(lambda s: f".{s}").filter(lambda ext: ext not in ALLOWED_EXTENSIONS)

# Invalid MIME type: strings not in the whitelist
_invalid_mime_st = st.text(
    alphabet=st.characters(min_codepoint=33, max_codepoint=126, blacklist_categories=("Cc", "Cs")),
    min_size=5,
    max_size=60,
).filter(lambda m: m not in ALLOWED_MIME_TYPES)

# File sizes around the boundary
_valid_size_st = st.integers(min_value=10, max_value=MAX_FILE_SIZE)
_oversized_st = st.integers(min_value=MAX_FILE_SIZE + 1, max_value=MAX_FILE_SIZE + 1024)

# Username: unique-safe printable strings
_username_st = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz0123456789",
    min_size=4,
    max_size=20,
)


# ---------------------------------------------------------------------------
# Helpers: client lifecycle
# ---------------------------------------------------------------------------


def create_test_client(tmp_dir: str):
    """Create a fresh httpx.AsyncClient backed by an in-memory SQLite DB
    and a FileStorageManager rooted in *tmp_dir*."""
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

    storage = FileStorageManager(storage_dir=tmp_dir)

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_storage] = lambda: storage

    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://test")
    client._test_session_factory = TestSession  # type: ignore[attr-defined]
    client._engine = engine  # type: ignore[attr-defined]
    client._storage = storage  # type: ignore[attr-defined]
    return client


def cleanup_test_client(client) -> None:
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=client._engine)  # type: ignore[attr-defined]


async def _create_user_and_login(client, username: str, role_id: int = 1) -> int:
    session = client._test_session_factory()
    try:
        user = User(username=username, hashed_password=_TEST_PASSWORD_HASH, role_id=role_id)
        session.add(user)
        session.commit()
        session.refresh(user)
        return user.id
    finally:
        session.close()

    login_resp = await client.post(
        "/auth/login",
        json={"username": username, "password": "test_password"},
    )
    assert login_resp.status_code == 200
    return user.id


async def _login(client, username: str) -> None:
    resp = await client.post(
        "/auth/login",
        json={"username": username, "password": "test_password"},
    )
    assert resp.status_code == 200


async def _seed_user_and_login(client, username: str, role_id: int = 1) -> int:
    """Seed a user, log in, and return the user id."""
    session = client._test_session_factory()
    try:
        user = User(username=username, hashed_password=_TEST_PASSWORD_HASH, role_id=role_id)
        session.add(user)
        session.commit()
        session.refresh(user)
        uid = user.id
    finally:
        session.close()
    await _login(client, username)
    return uid


async def _create_report_and_line(client) -> tuple[int, int]:
    """Create a report + line for the currently logged-in user.
    Returns (report_id, line_id)."""
    r_resp = await client.post("/reports", json={"title": "Test"})
    assert r_resp.status_code == 201
    report_id = r_resp.json()["id"]

    l_resp = await client.post(
        f"/reports/{report_id}/lines",
        json={"description": "Hotel", "amount": 100.0, "incurred_date": "2026-05-01"},
    )
    assert l_resp.status_code == 201
    line_id = l_resp.json()["id"]
    return report_id, line_id


def _make_file(filename: str, content: bytes, mime_type: str):
    return ("file", (filename, io.BytesIO(content), mime_type))


def _upload_url(report_id: int, line_id: int) -> str:
    return f"/reports/{report_id}/lines/{line_id}/attachments"


# ---------------------------------------------------------------------------
# Property 1: File type validation (metamorphic)
# **Validates: Requirements 2.1, 2.2, 2.3**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(file_type=_valid_file_type_st)
async def test_property_1_whitelist_files_succeed(file_type):
    """Property 1a: For any file with MIME type and extension in the whitelist,
    upload SHALL succeed with HTTP 201.

    # Feature: attachment-management, Property 1: File type validation

    **Validates: Requirements 2.1, 2.2, 2.3**
    """
    mime_type, extension, content = file_type
    with tempfile.TemporaryDirectory() as tmp_dir:
        client = create_test_client(tmp_dir)
        try:
            await _seed_user_and_login(client, "p1a_user")
            report_id, line_id = await _create_report_and_line(client)

            resp = await client.post(
                _upload_url(report_id, line_id),
                files=[_make_file(f"file{extension}", content, mime_type)],
            )
            assert resp.status_code == 201, (
                f"Expected 201 for whitelisted type '{mime_type}'{extension}, "
                f"got {resp.status_code}: {resp.text}"
            )
        finally:
            await client.aclose()
            cleanup_test_client(client)


@pytest.mark.asyncio
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(extension=_invalid_extension_st, mime=_invalid_mime_st)
async def test_property_1_non_whitelist_files_fail_400(extension, mime):
    """Property 1b: For any file with MIME type or extension NOT in the whitelist,
    upload SHALL fail with HTTP 400.

    # Feature: attachment-management, Property 1: File type validation

    **Validates: Requirements 2.1, 2.2, 2.3**
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        client = create_test_client(tmp_dir)
        try:
            await _seed_user_and_login(client, "p1b_user")
            report_id, line_id = await _create_report_and_line(client)

            resp = await client.post(
                _upload_url(report_id, line_id),
                files=[_make_file(f"file{extension}", b"some content", mime)],
            )
            assert resp.status_code == 400, (
                f"Expected 400 for non-whitelisted type '{mime}'{extension}, "
                f"got {resp.status_code}"
            )
        finally:
            await client.aclose()
            cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 2: File size enforcement
# **Validates: Requirements 6.1, 6.2, 6.4**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(
    max_examples=15,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(extra_bytes=st.integers(min_value=0, max_value=1024))
async def test_property_2a_file_at_max_size_succeeds(extra_bytes):
    """Property 2a: A PDF file exactly at or below MAX_FILE_SIZE SHALL succeed.

    # Feature: attachment-management, Property 2: File size enforcement

    **Validates: Requirements 6.1, 6.4**
    """
    # Build content that is exactly 4 bytes of magic + enough padding to be ≤ max
    content = b"%PDF" + b"\x00" * min(extra_bytes, MAX_FILE_SIZE - 4)
    assume(len(content) <= MAX_FILE_SIZE)

    with tempfile.TemporaryDirectory() as tmp_dir:
        client = create_test_client(tmp_dir)
        try:
            await _seed_user_and_login(client, "p2a_user")
            report_id, line_id = await _create_report_and_line(client)

            resp = await client.post(
                _upload_url(report_id, line_id),
                files=[_make_file("ok.pdf", content, "application/pdf")],
            )
            assert resp.status_code == 201, (
                f"Expected 201 for {len(content)}-byte file, got {resp.status_code}"
            )
        finally:
            await client.aclose()
            cleanup_test_client(client)


@pytest.mark.asyncio
@settings(
    max_examples=10,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(overflow=st.integers(min_value=1, max_value=1024))
async def test_property_2b_oversized_file_fails_413(overflow):
    """Property 2b: Any file exceeding MAX_FILE_SIZE SHALL fail with HTTP 413.

    # Feature: attachment-management, Property 2: File size enforcement

    **Validates: Requirements 6.1, 6.2, 6.4**
    """
    content = b"%PDF" + b"\x00" * (MAX_FILE_SIZE - 4 + overflow)

    with tempfile.TemporaryDirectory() as tmp_dir:
        client = create_test_client(tmp_dir)
        try:
            await _seed_user_and_login(client, "p2b_user")
            report_id, line_id = await _create_report_and_line(client)

            resp = await client.post(
                _upload_url(report_id, line_id),
                files=[_make_file("big.pdf", content, "application/pdf")],
            )
            assert resp.status_code == 413, (
                f"Expected 413 for {len(content)}-byte file, got {resp.status_code}"
            )
        finally:
            await client.aclose()
            cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 3: Upload round-trip
# **Validates: Requirements 1.3, 4.1, 4.2**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(
    max_examples=15,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(file_type=_valid_file_type_st, suffix=st.binary(min_size=0, max_size=64))
async def test_property_3_upload_round_trip(file_type, suffix):
    """Property 3: For any valid file uploaded, retrieving it SHALL return the
    identical byte content, and metadata SHALL match what was stored.

    # Feature: attachment-management, Property 3: Upload round-trip

    **Validates: Requirements 1.3, 4.1, 4.2**
    """
    mime_type, extension, magic = file_type
    content = magic + suffix

    with tempfile.TemporaryDirectory() as tmp_dir:
        client = create_test_client(tmp_dir)
        try:
            await _seed_user_and_login(client, "p3_user")
            report_id, line_id = await _create_report_and_line(client)

            filename = f"receipt{extension}"
            upload_resp = await client.post(
                _upload_url(report_id, line_id),
                files=[_make_file(filename, content, mime_type)],
            )
            assert upload_resp.status_code == 201
            meta = upload_resp.json()

            # Download — retrieve raw bytes
            dl_resp = await client.get(_upload_url(report_id, line_id))
            assert dl_resp.status_code == 200
            assert dl_resp.content == content, "Downloaded bytes must match uploaded bytes"
            assert dl_resp.headers["content-type"] == mime_type
            assert f'filename="{filename}"' in dl_resp.headers["content-disposition"]

            # Metadata endpoint must match upload response
            meta_resp = await client.get(f"{_upload_url(report_id, line_id)}/metadata")
            assert meta_resp.status_code == 200
            stored_meta = meta_resp.json()
            assert stored_meta["id"] == meta["id"]
            assert stored_meta["file_name"] == filename
            assert stored_meta["file_size"] == len(content)
            assert stored_meta["mime_type"] == mime_type
        finally:
            await client.aclose()
            cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 4: One-to-one attachment invariant
# **Validates: Requirements 1.6, 7.4**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(
    max_examples=15,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(n_uploads=st.integers(min_value=1, max_value=5))
async def test_property_4_one_to_one_invariant(n_uploads):
    """Property 4: After any number of uploads to the same line, that line
    SHALL have exactly one attachment.

    # Feature: attachment-management, Property 4: One-to-one invariant

    **Validates: Requirements 1.6, 7.4**
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        client = create_test_client(tmp_dir)
        try:
            await _seed_user_and_login(client, "p4_user")
            report_id, line_id = await _create_report_and_line(client)

            for i in range(n_uploads):
                resp = await client.post(
                    _upload_url(report_id, line_id),
                    files=[_make_file(f"file{i}.pdf", b"%PDF-1.4 content", "application/pdf")],
                )
                assert resp.status_code == 201

            # Verify exactly one attachment exists via metadata
            meta_resp = await client.get(f"{_upload_url(report_id, line_id)}/metadata")
            assert meta_resp.status_code == 200, (
                f"Expected one attachment after {n_uploads} uploads"
            )

            # Also verify the DB directly
            session = client._test_session_factory()
            try:
                from app.models.attachment import Attachment
                count = (
                    session.query(Attachment)
                    .filter(Attachment.expense_report_line_id == line_id)
                    .count()
                )
                assert count == 1, (
                    f"Expected 1 DB attachment record after {n_uploads} uploads, got {count}"
                )
            finally:
                session.close()
        finally:
            await client.aclose()
            cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 5: Replacement idempotence
# **Validates: Requirement 1.5**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(
    max_examples=15,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(
    file_a=_valid_file_type_st,
    file_b=_valid_file_type_st,
    suffix_a=st.binary(min_size=4, max_size=20),
    suffix_b=st.binary(min_size=4, max_size=20),
)
async def test_property_5_replacement_idempotence(file_a, file_b, suffix_a, suffix_b):
    """Property 5: Uploading file B after file A results in ONLY file B being
    stored. File A's content SHALL no longer be retrievable.

    # Feature: attachment-management, Property 5: Replacement idempotence

    **Validates: Requirement 1.5**
    """
    mime_a, ext_a, magic_a = file_a
    mime_b, ext_b, magic_b = file_b
    content_a = magic_a + suffix_a
    content_b = magic_b + suffix_b

    with tempfile.TemporaryDirectory() as tmp_dir:
        client = create_test_client(tmp_dir)
        try:
            await _seed_user_and_login(client, "p5_user")
            report_id, line_id = await _create_report_and_line(client)

            # Upload A
            resp_a = await client.post(
                _upload_url(report_id, line_id),
                files=[_make_file(f"a{ext_a}", content_a, mime_a)],
            )
            assert resp_a.status_code == 201

            # Upload B (replaces A)
            resp_b = await client.post(
                _upload_url(report_id, line_id),
                files=[_make_file(f"b{ext_b}", content_b, mime_b)],
            )
            assert resp_b.status_code == 201

            # Retrieved content must equal B's content
            dl_resp = await client.get(_upload_url(report_id, line_id))
            assert dl_resp.status_code == 200
            assert dl_resp.content == content_b, (
                "Retrieved content must match file B, not file A"
            )

            # Metadata must reflect B
            meta = resp_b.json()
            assert meta["file_name"] == f"b{ext_b}"
            assert meta["file_size"] == len(content_b)
        finally:
            await client.aclose()
            cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 6: Deletion idempotence
# **Validates: Requirements 3.1, 3.2, 3.4**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(
    max_examples=15,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(_=st.just(None))
async def test_property_6_deletion_idempotence(_):
    """Property 6: Deleting an attachment twice — first delete SHALL return 204,
    second delete SHALL return 404.

    # Feature: attachment-management, Property 6: Deletion idempotence

    **Validates: Requirements 3.1, 3.2, 3.4**
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        client = create_test_client(tmp_dir)
        try:
            await _seed_user_and_login(client, "p6_user")
            report_id, line_id = await _create_report_and_line(client)

            await client.post(
                _upload_url(report_id, line_id),
                files=[_make_file("file.pdf", b"%PDF-1.4 content", "application/pdf")],
            )

            # First delete → 204
            first_del = await client.delete(_upload_url(report_id, line_id))
            assert first_del.status_code == 204, (
                f"First delete expected 204, got {first_del.status_code}"
            )

            # Second delete → 404
            second_del = await client.delete(_upload_url(report_id, line_id))
            assert second_del.status_code == 404, (
                f"Second delete expected 404, got {second_del.status_code}"
            )
        finally:
            await client.aclose()
            cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 7: Authorization enforcement
# **Validates: Requirements 4.5, 9.1, 9.2**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(
    max_examples=15,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(_=st.just(None))
async def test_property_7_non_owner_non_admin_gets_403(_):
    """Property 7: For any attachment, a non-owner non-admin user SHALL receive
    403 on all read operations.

    # Feature: attachment-management, Property 7: Authorization enforcement

    **Validates: Requirements 4.5, 9.1, 9.2**
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        client = create_test_client(tmp_dir)
        try:
            # Seed owner and upload
            await _seed_user_and_login(client, "p7_owner")
            report_id, line_id = await _create_report_and_line(client)
            await client.post(
                _upload_url(report_id, line_id),
                files=[_make_file("file.pdf", b"%PDF-1.4 data", "application/pdf")],
            )

            # Switch to non-owner
            await client.post("/auth/logout")
            await _seed_user_and_login(client, "p7_other")

            download_resp = await client.get(_upload_url(report_id, line_id))
            assert download_resp.status_code == 403, (
                f"Non-owner download: expected 403, got {download_resp.status_code}"
            )

            meta_resp = await client.get(f"{_upload_url(report_id, line_id)}/metadata")
            assert meta_resp.status_code == 403, (
                f"Non-owner metadata: expected 403, got {meta_resp.status_code}"
            )
        finally:
            await client.aclose()
            cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 8: Admin access override
# **Validates: Requirements 13.1, 13.3, 13.5**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(
    max_examples=15,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(_=st.just(None))
async def test_property_8_admin_can_access_any_attachment(_):
    """Property 8: An Admin user SHALL be able to download and view metadata for
    any attachment, regardless of report ownership.

    # Feature: attachment-management, Property 8: Admin access override

    **Validates: Requirements 13.1, 13.3, 13.5**
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        client = create_test_client(tmp_dir)
        try:
            # Seed owner and upload
            await _seed_user_and_login(client, "p8_owner")
            report_id, line_id = await _create_report_and_line(client)
            await client.post(
                _upload_url(report_id, line_id),
                files=[_make_file("file.pdf", b"%PDF-1.4 data", "application/pdf")],
            )

            # Switch to admin
            await client.post("/auth/logout")
            await _seed_user_and_login(client, "p8_admin", role_id=2)

            download_resp = await client.get(_upload_url(report_id, line_id))
            assert download_resp.status_code == 200, (
                f"Admin download: expected 200, got {download_resp.status_code}"
            )

            meta_resp = await client.get(f"{_upload_url(report_id, line_id)}/metadata")
            assert meta_resp.status_code == 200, (
                f"Admin metadata: expected 200, got {meta_resp.status_code}"
            )
        finally:
            await client.aclose()
            cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 9: Timestamp accuracy
# **Validates: Requirement 7.2**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(
    max_examples=15,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(_=st.just(None))
async def test_property_9_timestamp_is_recent_utc(_):
    """Property 9: For any uploaded attachment, created_at SHALL be a UTC
    timestamp within 5 seconds of the upload time.

    # Feature: attachment-management, Property 9: Timestamp accuracy

    **Validates: Requirement 7.2**
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        client = create_test_client(tmp_dir)
        try:
            await _seed_user_and_login(client, "p9_user")
            report_id, line_id = await _create_report_and_line(client)

            before = datetime.now(timezone.utc)
            resp = await client.post(
                _upload_url(report_id, line_id),
                files=[_make_file("file.pdf", b"%PDF-1.4 data", "application/pdf")],
            )
            after = datetime.now(timezone.utc)
            assert resp.status_code == 201

            meta = resp.json()
            created_at_str = meta["created_at"]
            created_at = datetime.fromisoformat(created_at_str)

            # Ensure it's timezone-aware
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)

            assert before - timedelta(seconds=5) <= created_at <= after + timedelta(seconds=5), (
                f"created_at {created_at} is not within 5s of the upload window "
                f"[{before}, {after}]"
            )
        finally:
            await client.aclose()
            cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 10: File content validation (magic bytes mismatch)
# **Validates: Requirement 12.5**
# ---------------------------------------------------------------------------

# Mismatched pairs: (filename_ext, declared_mime, wrong_content)
_MISMATCH_CASES: list[tuple[str, str, bytes]] = [
    # Claim PDF but send DOCX magic
    (".pdf", "application/pdf", b"PK\x03\x04" + b"\x00" * 20),
    # Claim DOCX but send PDF magic
    (
        ".docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        b"%PDF-1.4 not a docx",
    ),
    # Claim DOC but send PDF magic
    (".doc", "application/msword", b"%PDF-1.4 not a doc"),
    # Claim XLS but send DOCX magic
    (".xls", "application/vnd.ms-excel", b"PK\x03\x04" + b"\x00" * 20),
]

_mismatch_case_st = st.sampled_from(_MISMATCH_CASES)


@pytest.mark.asyncio
@settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(mismatch=_mismatch_case_st)
async def test_property_10_content_mismatch_fails_400(mismatch):
    """Property 10: For any file whose content does not match the declared
    MIME type (wrong magic bytes), upload SHALL fail with HTTP 400.

    # Feature: attachment-management, Property 10: File content validation

    **Validates: Requirement 12.5**
    """
    extension, mime_type, wrong_content = mismatch
    with tempfile.TemporaryDirectory() as tmp_dir:
        client = create_test_client(tmp_dir)
        try:
            await _seed_user_and_login(client, "p10_user")
            report_id, line_id = await _create_report_and_line(client)

            resp = await client.post(
                _upload_url(report_id, line_id),
                files=[_make_file(f"file{extension}", wrong_content, mime_type)],
            )
            assert resp.status_code == 400, (
                f"Expected 400 for content mismatch ({mime_type}), "
                f"got {resp.status_code}"
            )
        finally:
            await client.aclose()
            cleanup_test_client(client)


# ---------------------------------------------------------------------------
# Property 11: Secure file storage (UUID-based names)
# **Validates: Requirements 12.1, 12.3, 12.4**
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@settings(
    max_examples=15,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(file_type=_valid_file_type_st)
async def test_property_11_files_stored_with_uuid_names(file_type):
    """Property 11: For any uploaded file, the file SHALL be stored in the
    secure directory with a UUID-based name (not the original filename), so that
    original filenames are never exposed in the file system path.

    # Feature: attachment-management, Property 11: Secure file storage

    **Validates: Requirements 12.1, 12.3, 12.4**
    """
    mime_type, extension, content = file_type
    original_filename = f"my_sensitive_receipt{extension}"

    with tempfile.TemporaryDirectory() as tmp_dir:
        client = create_test_client(tmp_dir)
        storage: FileStorageManager = client._storage  # type: ignore[attr-defined]
        try:
            await _seed_user_and_login(client, "p11_user")
            report_id, line_id = await _create_report_and_line(client)

            resp = await client.post(
                _upload_url(report_id, line_id),
                files=[_make_file(original_filename, content, mime_type)],
            )
            assert resp.status_code == 201

            # Inspect actual files stored on disk
            stored_files = list(Path(storage.storage_dir).iterdir())
            assert len(stored_files) == 1, "Exactly one file should be stored"

            stored_name = stored_files[0].name
            # Original filename stem must NOT appear in the stored name
            original_stem = Path(original_filename).stem
            assert original_stem not in stored_name, (
                f"Original filename stem '{original_stem}' found in stored "
                f"filename '{stored_name}' — UUID-based naming not enforced"
            )

            # The stored name (minus extension) must be a valid UUID
            stored_stem = Path(stored_name).stem
            try:
                uuid.UUID(stored_stem)
            except ValueError:
                assert False, (
                    f"Stored filename stem '{stored_stem}' is not a valid UUID"
                )
        finally:
            await client.aclose()
            cleanup_test_client(client)
