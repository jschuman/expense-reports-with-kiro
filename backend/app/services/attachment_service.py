"""Business logic for attachment operations on expense report lines.

Access control rules:
- upload_attachment: report owner only
- delete_attachment: report owner only
- get_attachment: report owner or Admin role
- get_attachment_metadata: report owner or Admin role

Validation rules (upload):
- File extension must be in ALLOWED_EXTENSIONS                  → 400
- Declared MIME type must be in ALLOWED_MIME_TYPES              → 400
- File size must be ≤ MAX_FILE_SIZE (10 MB)                     → 413
- File content magic bytes must match declared MIME type        → 400

One-to-one enforcement:
- If the line already has an attachment, it is deleted (file + record)
  before the new one is stored.

Requirements: 1.1-1.6, 2.1-2.3, 3.1-3.5, 4.1-4.5, 6.1-6.4, 9.1, 12.1-12.5
"""

from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.constants import ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES, MAX_FILE_SIZE
from app.models.attachment import Attachment
from app.models.expense_line import ExpenseLine
from app.models.expense_report import ExpenseReport
from app.schemas.attachment import AttachmentMetadataResponse
from app.services.file_storage import FileStorageManager

# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _get_report_or_404(db: Session, report_id: int) -> ExpenseReport:
    report = db.get(ExpenseReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


def _get_line_or_404(db: Session, report_id: int, line_id: int) -> ExpenseLine:
    line = db.get(ExpenseLine, line_id)
    if line is None or line.report_id != report_id:
        raise HTTPException(status_code=404, detail="Line not found")
    return line


def _assert_owner_or_admin(report: ExpenseReport, current_user) -> None:
    """Raise 403 if *current_user* is neither the owner nor an Admin."""
    is_owner = current_user.id == report.owner_id
    is_admin = current_user.role is not None and current_user.role.name == "Admin"
    if not (is_owner or is_admin):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to access this attachment",
        )


def _assert_owner(report: ExpenseReport, current_user) -> None:
    """Raise 403 if *current_user* is not the owner of *report*."""
    if current_user.id != report.owner_id:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to modify this attachment",
        )


def _validate_file_type(filename: str, content_type: str) -> None:
    """Raise 400 if the file extension or MIME type is not whitelisted."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"File extension '{ext}' is not allowed. "
                f"Allowed extensions: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            ),
        )
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"MIME type '{content_type}' is not allowed. "
                f"Allowed types: {', '.join(sorted(ALLOWED_MIME_TYPES))}"
            ),
        )


def _validate_file_size(size: int) -> None:
    """Raise 413 if *size* exceeds MAX_FILE_SIZE."""
    if size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File size exceeds the maximum allowed size of {MAX_FILE_SIZE // (1024 * 1024)} MB",
        )


def _validate_content(
    storage: FileStorageManager, content: bytes, mime_type: str
) -> None:
    """Raise 400 if file content does not match the declared MIME type."""
    if not storage.validate_file_content(content, mime_type):
        raise HTTPException(
            status_code=400,
            detail="File content does not match the declared MIME type",
        )


def _delete_existing_attachment(
    db: Session, storage: FileStorageManager, line: ExpenseLine
) -> None:
    """Remove the existing attachment record and file for *line*, if any."""
    existing: Attachment | None = (
        db.query(Attachment)
        .filter(Attachment.expense_report_line_id == line.id)
        .first()
    )
    if existing is not None:
        try:
            storage.delete_file(existing.storage_path)
        except FileNotFoundError:
            pass  # File already gone; still clean up the DB record.
        db.delete(existing)
        db.flush()


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------


async def upload_attachment(
    report_id: int,
    line_id: int,
    file: UploadFile,
    current_user,
    db: Session,
    storage: FileStorageManager,
) -> AttachmentMetadataResponse:
    """Upload and store an attachment for an expense report line.

    Steps:
    1. Verify user owns the report (403 if not).
    2. Validate file extension and MIME type (400 if invalid).
    3. Read file content and validate size (413 if too large).
    4. Validate content magic bytes (400 if mismatch).
    5. Delete existing attachment if present.
    6. Store file and create Attachment record.
    7. Return AttachmentMetadataResponse.
    """
    report = _get_report_or_404(db, report_id)
    _assert_owner(report, current_user)

    line = _get_line_or_404(db, report_id, line_id)

    filename = file.filename or "upload"
    content_type = file.content_type or ""

    _validate_file_type(filename, content_type)

    content = await file.read()
    _validate_file_size(len(content))
    _validate_content(storage, content, content_type)

    _delete_existing_attachment(db, storage, line)

    storage_path = storage.store_file(content, filename)

    attachment = Attachment(
        expense_report_line_id=line.id,
        file_name=filename,
        file_size=len(content),
        mime_type=content_type,
        storage_path=storage_path,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    return AttachmentMetadataResponse.model_validate(attachment)


def delete_attachment(
    report_id: int,
    line_id: int,
    current_user,
    db: Session,
    storage: FileStorageManager,
) -> None:
    """Delete an attachment and its associated file.

    Returns None (HTTP 204).
    Raises 403 if not owner, 404 if no attachment exists.
    """
    report = _get_report_or_404(db, report_id)
    _assert_owner(report, current_user)

    _get_line_or_404(db, report_id, line_id)

    attachment: Attachment | None = (
        db.query(Attachment)
        .filter(Attachment.expense_report_line_id == line_id)
        .first()
    )
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")

    storage.delete_file(attachment.storage_path)
    db.delete(attachment)
    db.commit()


def get_attachment(
    report_id: int,
    line_id: int,
    current_user,
    db: Session,
    storage: FileStorageManager,
) -> tuple[bytes, str, str]:
    """Retrieve attachment file content.

    Returns: (file_content, mime_type, original_filename)
    Raises 403 if not owner/admin, 404 if no attachment exists.
    """
    report = _get_report_or_404(db, report_id)
    _assert_owner_or_admin(report, current_user)

    _get_line_or_404(db, report_id, line_id)

    attachment: Attachment | None = (
        db.query(Attachment)
        .filter(Attachment.expense_report_line_id == line_id)
        .first()
    )
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")

    content = storage.retrieve_file(attachment.storage_path)
    return content, attachment.mime_type, attachment.file_name


def get_attachment_metadata(
    report_id: int,
    line_id: int,
    current_user,
    db: Session,
    storage: FileStorageManager,
) -> AttachmentMetadataResponse:
    """Retrieve attachment metadata without downloading the file.

    Raises 403 if not owner/admin, 404 if no attachment exists.
    """
    report = _get_report_or_404(db, report_id)
    _assert_owner_or_admin(report, current_user)

    _get_line_or_404(db, report_id, line_id)

    attachment: Attachment | None = (
        db.query(Attachment)
        .filter(Attachment.expense_report_line_id == line_id)
        .first()
    )
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")

    return AttachmentMetadataResponse.model_validate(attachment)
