"""Unit tests for FileStorageManager and attachment validation constants.

Tests cover:
- store_file() creates a file with a UUID-based name
- retrieve_file() returns the correct content
- delete_file() removes the file from storage
- delete_file() raises FileNotFoundError for a non-existent path
- validate_file_content() for each supported MIME type
- validate_file_content() rejects content that mismatches the declared MIME type
- validate_file_content() rejects unknown MIME types
- Storage directory permissions are 0o700
- ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS, and MAX_FILE_SIZE constants
"""

import os
import stat
from pathlib import Path

import pytest

from app.constants import ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES, MAX_FILE_SIZE
from app.services.file_storage import FileStorageManager


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def storage_manager(tmp_path: Path) -> FileStorageManager:
    """Return a FileStorageManager rooted in a temporary directory."""
    return FileStorageManager(storage_dir=str(tmp_path / "attachments"))


# ---------------------------------------------------------------------------
# Constant sanity tests (2.2)
# ---------------------------------------------------------------------------


class TestAttachmentConstants:
    def test_allowed_mime_types_contains_all_seven_types(self):
        """ALLOWED_MIME_TYPES must contain exactly the 7 approved MIME types."""
        expected = {
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
            "application/vnd.google-apps.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "application/vnd.google-apps.spreadsheet",
        }
        assert ALLOWED_MIME_TYPES == expected

    def test_allowed_extensions_contains_all_extensions(self):
        """ALLOWED_EXTENSIONS must contain exactly the 7 approved extensions."""
        expected = {".pdf", ".docx", ".doc", ".gdoc", ".xlsx", ".xls", ".gsheet"}
        assert ALLOWED_EXTENSIONS == expected

    def test_max_file_size_is_ten_mb(self):
        """MAX_FILE_SIZE must be exactly 10 MB (10 * 1024 * 1024 bytes)."""
        assert MAX_FILE_SIZE == 10 * 1024 * 1024


# ---------------------------------------------------------------------------
# Directory creation and permissions (2.1)
# ---------------------------------------------------------------------------


class TestFileStorageManagerInit:
    def test_storage_directory_is_created_on_init(self, tmp_path: Path):
        """FileStorageManager.__init__ must create the storage directory."""
        target = tmp_path / "new_dir"
        assert not target.exists()
        FileStorageManager(storage_dir=str(target))
        assert target.is_dir()

    def test_storage_directory_permissions_are_0o700(self, tmp_path: Path):
        """Storage directory must have owner-only permissions (0o700)."""
        target = tmp_path / "secure"
        FileStorageManager(storage_dir=str(target))
        mode = stat.S_IMODE(os.stat(target).st_mode)
        assert mode == 0o700

    def test_existing_directory_permissions_corrected_to_0o700(self, tmp_path: Path):
        """If the directory already exists with wrong permissions, they must be fixed."""
        target = tmp_path / "preexisting"
        target.mkdir(mode=0o755)
        FileStorageManager(storage_dir=str(target))
        mode = stat.S_IMODE(os.stat(target).st_mode)
        assert mode == 0o700


# ---------------------------------------------------------------------------
# store_file() tests (2.1)
# ---------------------------------------------------------------------------


class TestStoreFile:
    def test_store_file_creates_file_on_disk(self, storage_manager: FileStorageManager):
        """store_file() must persist the file to disk."""
        content = b"%PDF-1.4 test content"
        path = storage_manager.store_file(content, "receipt.pdf")
        assert Path(path).exists()

    def test_store_file_returns_path_with_uuid_based_name(self, storage_manager: FileStorageManager):
        """The returned path must contain a UUID-style filename, not the original name."""
        content = b"%PDF-1.4 test"
        path = storage_manager.store_file(content, "myreceipt.pdf")
        filename = Path(path).name
        # UUID is 36 chars + 1 dot + extension; ensure original name is not present
        assert "myreceipt" not in filename
        # Extension must be preserved
        assert filename.endswith(".pdf")

    def test_store_file_preserves_file_extension(self, storage_manager: FileStorageManager):
        """The stored file must keep the original extension."""
        path = storage_manager.store_file(b"PK\x03\x04content", "document.docx")
        assert Path(path).suffix == ".docx"

    def test_store_file_content_matches_what_was_stored(self, storage_manager: FileStorageManager):
        """Bytes written to disk must exactly match the input content."""
        content = b"%PDF-1.4 exact content check"
        path = storage_manager.store_file(content, "file.pdf")
        assert Path(path).read_bytes() == content

    def test_store_file_each_call_produces_unique_path(self, storage_manager: FileStorageManager):
        """Two calls with identical content must produce different storage paths."""
        content = b"%PDF-1.4 same"
        path1 = storage_manager.store_file(content, "file.pdf")
        path2 = storage_manager.store_file(content, "file.pdf")
        assert path1 != path2


# ---------------------------------------------------------------------------
# retrieve_file() tests (2.1)
# ---------------------------------------------------------------------------


class TestRetrieveFile:
    def test_retrieve_file_returns_correct_content(self, storage_manager: FileStorageManager):
        """retrieve_file() must return the exact bytes that were stored."""
        content = b"%PDF-1.4 hello world"
        path = storage_manager.store_file(content, "invoice.pdf")
        assert storage_manager.retrieve_file(path) == content

    def test_retrieve_file_raises_for_nonexistent_path(self, storage_manager: FileStorageManager, tmp_path: Path):
        """retrieve_file() must raise FileNotFoundError for a missing file."""
        with pytest.raises(FileNotFoundError):
            storage_manager.retrieve_file(str(tmp_path / "ghost.pdf"))


# ---------------------------------------------------------------------------
# delete_file() tests (2.1)
# ---------------------------------------------------------------------------


class TestDeleteFile:
    def test_delete_file_removes_file_from_disk(self, storage_manager: FileStorageManager):
        """delete_file() must remove the file from the file system."""
        path = storage_manager.store_file(b"%PDF-1.4 data", "doc.pdf")
        assert Path(path).exists()
        storage_manager.delete_file(path)
        assert not Path(path).exists()

    def test_delete_file_raises_for_nonexistent_path(self, storage_manager: FileStorageManager, tmp_path: Path):
        """delete_file() must raise FileNotFoundError when the file is missing."""
        with pytest.raises(FileNotFoundError):
            storage_manager.delete_file(str(tmp_path / "missing.pdf"))


# ---------------------------------------------------------------------------
# validate_file_content() tests (2.1, 2.3)
# ---------------------------------------------------------------------------


class TestValidateFileContent:
    # --- PDF ---
    def test_validate_pdf_with_correct_magic_bytes_returns_true(self, storage_manager: FileStorageManager):
        content = b"%PDF-1.4 some content here"
        assert storage_manager.validate_file_content(content, "application/pdf") is True

    def test_validate_pdf_with_wrong_magic_bytes_returns_false(self, storage_manager: FileStorageManager):
        content = b"PK\x03\x04 not a pdf"
        assert storage_manager.validate_file_content(content, "application/pdf") is False

    # --- DOCX ---
    def test_validate_docx_with_correct_magic_bytes_returns_true(self, storage_manager: FileStorageManager):
        content = b"PK\x03\x04" + b"\x00" * 100
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        assert storage_manager.validate_file_content(content, mime) is True

    def test_validate_docx_with_wrong_magic_bytes_returns_false(self, storage_manager: FileStorageManager):
        content = b"%PDF-1.4 not a docx"
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        assert storage_manager.validate_file_content(content, mime) is False

    # --- XLSX ---
    def test_validate_xlsx_with_correct_magic_bytes_returns_true(self, storage_manager: FileStorageManager):
        content = b"PK\x03\x04" + b"\x00" * 100
        mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assert storage_manager.validate_file_content(content, mime) is True

    def test_validate_xlsx_with_wrong_magic_bytes_returns_false(self, storage_manager: FileStorageManager):
        content = b"\xd0\xcf\x11\xe0 not xlsx"
        mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assert storage_manager.validate_file_content(content, mime) is False

    # --- DOC (OLE2) ---
    def test_validate_doc_with_correct_magic_bytes_returns_true(self, storage_manager: FileStorageManager):
        content = b"\xd0\xcf\x11\xe0" + b"\x00" * 100
        assert storage_manager.validate_file_content(content, "application/msword") is True

    def test_validate_doc_with_wrong_magic_bytes_returns_false(self, storage_manager: FileStorageManager):
        content = b"%PDF-1.4 not a doc"
        assert storage_manager.validate_file_content(content, "application/msword") is False

    # --- XLS (OLE2) ---
    def test_validate_xls_with_correct_magic_bytes_returns_true(self, storage_manager: FileStorageManager):
        content = b"\xd0\xcf\x11\xe0" + b"\x00" * 100
        assert storage_manager.validate_file_content(content, "application/vnd.ms-excel") is True

    def test_validate_xls_with_wrong_magic_bytes_returns_false(self, storage_manager: FileStorageManager):
        content = b"PK\x03\x04 not an xls"
        assert storage_manager.validate_file_content(content, "application/vnd.ms-excel") is False

    # --- Google Docs (no magic bytes — accept on MIME type) ---
    def test_validate_google_doc_returns_true_for_any_content(self, storage_manager: FileStorageManager):
        content = b'{"url": "https://docs.google.com/..."}'
        assert storage_manager.validate_file_content(content, "application/vnd.google-apps.document") is True

    # --- Google Sheets (no magic bytes — accept on MIME type) ---
    def test_validate_google_sheet_returns_true_for_any_content(self, storage_manager: FileStorageManager):
        content = b'{"url": "https://sheets.google.com/..."}'
        assert storage_manager.validate_file_content(content, "application/vnd.google-apps.spreadsheet") is True

    # --- Unknown / unsupported MIME type ---
    def test_validate_unknown_mime_type_returns_false(self, storage_manager: FileStorageManager):
        content = b"some random content"
        assert storage_manager.validate_file_content(content, "image/png") is False

    def test_validate_empty_content_returns_false_for_binary_types(self, storage_manager: FileStorageManager):
        """Empty bytes cannot match any binary magic signature."""
        assert storage_manager.validate_file_content(b"", "application/pdf") is False
