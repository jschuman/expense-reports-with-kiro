"""Secure file storage manager for attachment files.

Files are stored on disk in a restricted directory (0o700) using UUID-based
names so that original filenames are never exposed in the file system path.

Magic-byte validation is performed per MIME type:
  - PDF           : b'%PDF'                  (4 bytes)
  - DOCX / XLSX   : b'PK\x03\x04'           (ZIP container, 4 bytes)
  - DOC  / XLS    : b'\xd0\xcf\x11\xe0'     (OLE2 compound doc, 4 bytes)
  - Google types  : no binary signature — rely on declared MIME type only
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

# Magic-byte signatures keyed by MIME type.
# None means no binary check is possible; MIME type declaration is trusted.
_MAGIC_BYTES: dict[str, bytes | None] = {
    "application/pdf": b"%PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": b"PK\x03\x04",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": b"PK\x03\x04",
    "application/msword": b"\xd0\xcf\x11\xe0",
    "application/vnd.ms-excel": b"\xd0\xcf\x11\xe0",
    # Google Docs / Sheets are tiny JSON stub files — no binary signature.
    "application/vnd.google-apps.document": None,
    "application/vnd.google-apps.spreadsheet": None,
}


class FileStorageManager:
    """Manages secure storage of attachment files on the local file system."""

    def __init__(self, storage_dir: str = "./secure/attachments") -> None:
        self.storage_dir = storage_dir
        self._ensure_secure_directory()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _ensure_secure_directory(self) -> None:
        """Create the storage directory with owner-only permissions (0o700)."""
        path = Path(self.storage_dir)
        path.mkdir(parents=True, exist_ok=True)
        # Enforce 0o700 regardless of umask.
        os.chmod(path, 0o700)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def store_file(self, file_content: bytes, original_filename: str) -> str:
        """Persist *file_content* to disk with a UUID-based name.

        The original filename extension is preserved so MIME sniffing by
        downstream tools remains accurate.

        Returns:
            The storage path (relative to the storage root) to be persisted
            in the database.
        """
        suffix = Path(original_filename).suffix  # e.g. ".pdf"
        filename = f"{uuid.uuid4()}{suffix}"
        full_path = Path(self.storage_dir) / filename
        full_path.write_bytes(file_content)
        # Return a relative-style path for portability.
        return str(Path(self.storage_dir) / filename)

    def retrieve_file(self, storage_path: str) -> bytes:
        """Return the raw bytes of the file at *storage_path*.

        Raises:
            FileNotFoundError: If the file does not exist on disk.
        """
        return Path(storage_path).read_bytes()

    def delete_file(self, storage_path: str) -> None:
        """Remove the file at *storage_path* from disk.

        Raises:
            FileNotFoundError: If the file does not exist on disk.
        """
        path = Path(storage_path)
        if not path.exists():
            raise FileNotFoundError(f"Attachment file not found: {storage_path}")
        path.unlink()

    def validate_file_content(self, file_content: bytes, mime_type: str) -> bool:
        """Check that *file_content* matches the declared *mime_type*.

        For MIME types with known magic bytes the first bytes of the content
        are compared against the signature. For Google Doc / Sheet types no
        binary signature exists, so the function returns True as long as
        *mime_type* is a recognised Google type.

        Returns:
            True if content matches the MIME type; False otherwise.
        """
        if mime_type not in _MAGIC_BYTES:
            # Unknown / unsupported MIME type — reject.
            return False

        expected_magic = _MAGIC_BYTES[mime_type]

        if expected_magic is None:
            # Google types: no magic bytes available — accept on MIME type alone.
            return True

        return file_content[: len(expected_magic)] == expected_magic
