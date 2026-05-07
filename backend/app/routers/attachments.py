"""Attachments router: upload, delete, download, and metadata endpoints.

All routes require a valid session cookie (enforced via get_current_user).
Business logic is delegated to attachment_service.

Endpoints are mounted under /reports (see main.py), so the full paths are:
  POST   /reports/{report_id}/lines/{line_id}/attachments
  DELETE /reports/{report_id}/lines/{line_id}/attachments
  GET    /reports/{report_id}/lines/{line_id}/attachments
  GET    /reports/{report_id}/lines/{line_id}/attachments/metadata

Requirements: 4.1-4.5, 8.1-8.4, 9.5, 9.6
"""

from fastapi import APIRouter, Depends, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.dependencies import get_current_user, get_storage
from app.models.user import User
from app.schemas.attachment import AttachmentMetadataResponse
from app.services import attachment_service
from app.services.file_storage import FileStorageManager

router = APIRouter(tags=["attachments"])

_BASE = "/{report_id}/lines/{line_id}/attachments"


@router.post(
    _BASE,
    response_model=AttachmentMetadataResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    report_id: int,
    line_id: int,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage: FileStorageManager = Depends(get_storage),
) -> AttachmentMetadataResponse:
    """Upload a file attachment to an expense report line.

    Returns 201 with AttachmentMetadataResponse on success.
    Returns 400 when file type or content is invalid.
    Returns 401 when no valid session cookie is present.
    Returns 403 when the caller is not the report owner.
    Returns 404 when the report or line does not exist.
    Returns 413 when the file exceeds the 10 MB size limit.

    Requirements: 1.1-1.6, 2.1-2.3, 6.1-6.4, 8.1, 9.5, 9.6
    """
    return await attachment_service.upload_attachment(
        report_id=report_id,
        line_id=line_id,
        file=file,
        current_user=current_user,
        db=db,
        storage=storage,
    )


@router.delete(
    _BASE,
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_attachment(
    report_id: int,
    line_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage: FileStorageManager = Depends(get_storage),
) -> Response:
    """Delete the attachment from an expense report line.

    Returns 204 No Content on success.
    Returns 401 when no valid session cookie is present.
    Returns 403 when the caller is not the report owner.
    Returns 404 when the report, line, or attachment does not exist.

    Requirements: 3.1-3.5, 8.2, 9.5, 9.6
    """
    attachment_service.delete_attachment(
        report_id=report_id,
        line_id=line_id,
        current_user=current_user,
        db=db,
        storage=storage,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    _BASE,
)
def get_attachment(
    report_id: int,
    line_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage: FileStorageManager = Depends(get_storage),
) -> Response:
    """Download the attachment file from an expense report line.

    Returns 200 with raw file content and headers:
      - Content-Type: <mime_type>
      - Content-Disposition: attachment; filename="<original_filename>"
    Returns 401 when no valid session cookie is present.
    Returns 403 when the caller is not the owner or Admin.
    Returns 404 when the report, line, or attachment does not exist.

    Requirements: 4.1-4.5, 8.3, 9.5, 9.6
    """
    content, mime_type, filename = attachment_service.get_attachment(
        report_id=report_id,
        line_id=line_id,
        current_user=current_user,
        db=db,
        storage=storage,
    )
    return Response(
        content=content,
        media_type=mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get(
    f"{_BASE}/metadata",
    response_model=AttachmentMetadataResponse,
)
def get_attachment_metadata(
    report_id: int,
    line_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage: FileStorageManager = Depends(get_storage),
) -> AttachmentMetadataResponse:
    """Retrieve attachment metadata without downloading the file.

    Returns 200 with AttachmentMetadataResponse on success.
    Returns 401 when no valid session cookie is present.
    Returns 403 when the caller is not the owner or Admin.
    Returns 404 when the report, line, or attachment does not exist.

    Requirements: 4.1, 4.3, 8.4, 9.5, 9.6
    """
    return attachment_service.get_attachment_metadata(
        report_id=report_id,
        line_id=line_id,
        current_user=current_user,
        db=db,
        storage=storage,
    )
