# Attachment Management for Expense Report Lines - Design Document

## Overview

The Attachment Management feature enables users to upload, store, retrieve, and delete single file attachments associated with individual expense report line items. The system enforces strict file type validation (PDF, Word, Google Docs, Excel, Google Sheets), a 10 MB file size limit, and role-based access control. Admins can access all attachments regardless of ownership, while regular users can only access their own. The system warns users when submitting reports with missing attachments and provides a secure, API-driven file serving mechanism.

### Key Objectives

- Enable users to attach supporting documentation to expense line items
- Enforce file type and size constraints for security and storage efficiency
- Provide secure, authorized file access through API endpoints
- Warn users about missing attachments before report submission
- Allow admins to review attachments during the approval process
- Maintain data integrity with one-to-one attachment-to-line relationships

---

## Architecture

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React/TS)                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  AttachmentUploadComponent                               │   │
│  │  - Drag-and-drop file input                              │   │
│  │  - File picker                                           │   │
│  │  - Progress indicator                                    │   │
│  │  - Error display                                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  AttachmentDisplayComponent                              │   │
│  │  - Show current attachment metadata                      │   │
│  │  - Download button                                       │   │
│  │  - Delete button with confirmation                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  MissingAttachmentWarningDialog                           │   │
│  │  - List lines without attachments                        │   │
│  │  - "Add Attachments" / "Submit Without Attachments"      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↕ (HTTP)
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI/Python)                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  AttachmentRouter                                        │   │
│  │  - POST /api/expense-reports/{id}/lines/{id}/attachments │   │
│  │  - DELETE /api/expense-reports/{id}/lines/{id}/...       │   │
│  │  - GET /api/expense-reports/{id}/lines/{id}/attachments  │   │
│  │  - GET /api/expense-reports/{id}/lines/{id}/.../metadata │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  AttachmentService                                       │   │
│  │  - File validation (type, size, content)                 │   │
│  │  - Upload/delete/retrieve logic                          │   │
│  │  - Authorization checks                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  FileStorageManager                                      │   │
│  │  - Secure file system storage                            │   │
│  │  - UUID-based file naming                                │   │
│  │  - Permission management                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│                    Database (SQLite)                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Attachment Table                                        │   │
│  │  - id (PK)                                               │   │
│  │  - expense_report_line_id (FK, UNIQUE)                   │   │
│  │  - file_name, file_size, mime_type                       │   │
│  │  - storage_path, created_at, updated_at                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│                    File Storage (Secure Directory)               │
│  /secure/attachments/                                            │
│  ├── {uuid-1}/                                                   │
│  ├── {uuid-2}/                                                   │
│  └── ...                                                         │
└─────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **API-First**: All attachment operations are exposed through REST endpoints with clear contracts
2. **Security by Default**: Files are stored outside web-accessible directories and served only through authorized API endpoints
3. **One-to-One Relationship**: Database constraints enforce exactly one attachment per line
4. **Role-Based Access**: Users access only their own attachments; admins access all
5. **Fail-Safe Validation**: File type, size, and content are validated before storage
6. **Audit Trail**: Timestamps track creation and modification for compliance

---

## Components and Interfaces

### Backend Components

#### 1. Attachment Model (SQLAlchemy ORM)

```python
class Attachment(Base):
    __tablename__ = "attachments"
    
    id: int = Column(Integer, primary_key=True)
    expense_report_line_id: int = Column(
        Integer, 
        ForeignKey("expense_report_lines.id"), 
        unique=True,
        nullable=False
    )
    file_name: str = Column(String(255), nullable=False)
    file_size: int = Column(Integer, nullable=False)  # bytes
    mime_type: str = Column(String(100), nullable=False)
    storage_path: str = Column(String(500), nullable=False)  # UUID-based path
    created_at: datetime = Column(DateTime(timezone=True), default=datetime.utcnow)
    
    # Relationship
    expense_report_line = relationship("ExpenseReportLine", back_populates="attachment")
```

#### 2. Pydantic Schemas

**Request Schema (Upload)**:
```python
class AttachmentUploadRequest(BaseModel):
    # File is provided as multipart form data, not in JSON body
    pass
```

**Response Schema**:
```python
class AttachmentMetadataResponse(BaseModel):
    id: int
    file_name: str
    file_size: int  # bytes
    mime_type: str
    created_at: datetime  # ISO 8601 UTC
    
    class Config:
        from_attributes = True
```

#### 3. File Type Whitelist

```python
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "application/msword",  # .doc
    "application/vnd.google-apps.document",  # .gdoc
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
    "application/vnd.ms-excel",  # .xls
    "application/vnd.google-apps.spreadsheet",  # .gsheet
}

ALLOWED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".doc",
    ".gdoc",
    ".xlsx",
    ".xls",
    ".gsheet",
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB in bytes
```

#### 4. AttachmentService

**Core Methods**:

```python
class AttachmentService:
    
    async def upload_attachment(
        self,
        report_id: int,
        line_id: int,
        file: UploadFile,
        current_user: User,
        db: Session
    ) -> AttachmentMetadataResponse:
        """
        Upload and store an attachment for an expense report line.
        
        Steps:
        1. Verify user owns the report (or is admin)
        2. Validate file type (extension + MIME type)
        3. Validate file size
        4. Validate file content (magic bytes)
        5. Delete existing attachment if present
        6. Store file in secure directory with UUID name
        7. Create/update Attachment record in database
        8. Return metadata
        
        Raises:
        - 403 Forbidden: User doesn't own report
        - 400 Bad Request: Invalid file type
        - 413 Payload Too Large: File exceeds 10 MB
        """
        pass
    
    async def delete_attachment(
        self,
        report_id: int,
        line_id: int,
        current_user: User,
        db: Session
    ) -> None:
        """
        Delete an attachment and its associated file.
        
        Steps:
        1. Verify user owns the report (or is admin)
        2. Retrieve Attachment record
        3. Delete file from storage
        4. Delete Attachment record from database
        
        Raises:
        - 403 Forbidden: User doesn't own report
        - 404 Not Found: Attachment doesn't exist
        """
        pass
    
    async def get_attachment(
        self,
        report_id: int,
        line_id: int,
        current_user: User,
        db: Session
    ) -> tuple[bytes, str, str]:
        """
        Retrieve attachment file content.
        
        Returns: (file_content, mime_type, original_filename)
        
        Raises:
        - 403 Forbidden: User doesn't own report
        - 404 Not Found: Attachment doesn't exist
        """
        pass
    
    async def get_attachment_metadata(
        self,
        report_id: int,
        line_id: int,
        current_user: User,
        db: Session
    ) -> AttachmentMetadataResponse:
        """
        Retrieve attachment metadata without downloading file.
        
        Raises:
        - 403 Forbidden: User doesn't own report
        - 404 Not Found: Attachment doesn't exist
        """
        pass
```

#### 5. FileStorageManager

```python
class FileStorageManager:
    
    def __init__(self, storage_dir: str = "./secure/attachments"):
        self.storage_dir = storage_dir
        self._ensure_secure_directory()
    
    def _ensure_secure_directory(self) -> None:
        """Create storage directory with restricted permissions (0o700)."""
        pass
    
    def store_file(self, file_content: bytes, original_filename: str) -> str:
        """
        Store file with UUID-based name.
        
        Returns: storage_path (relative path for database)
        """
        pass
    
    def retrieve_file(self, storage_path: str) -> bytes:
        """Retrieve file content by storage path."""
        pass
    
    def delete_file(self, storage_path: str) -> None:
        """Delete file from storage."""
        pass
    
    def validate_file_content(self, file_content: bytes, mime_type: str) -> bool:
        """
        Validate file content matches declared MIME type using magic bytes.
        
        Supported checks:
        - PDF: %PDF header
        - Word (.docx): ZIP with specific structure
        - Excel (.xlsx): ZIP with specific structure
        - Google Docs/Sheets: Specific MIME type validation
        """
        pass
```

#### 6. AttachmentRouter (FastAPI)

```python
@router.post(
    "/api/expense-reports/{report_id}/lines/{line_id}/attachments",
    response_model=AttachmentMetadataResponse,
    status_code=201
)
async def upload_attachment(
    report_id: int,
    line_id: int,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> AttachmentMetadataResponse:
    """Upload attachment to expense report line."""
    pass

@router.delete(
    "/api/expense-reports/{report_id}/lines/{line_id}/attachments",
    status_code=204
)
async def delete_attachment(
    report_id: int,
    line_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> None:
    """Delete attachment from expense report line."""
    pass

@router.get(
    "/api/expense-reports/{report_id}/lines/{line_id}/attachments"
)
async def get_attachment(
    report_id: int,
    line_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> FileResponse:
    """Download attachment file."""
    pass

@router.get(
    "/api/expense-reports/{report_id}/lines/{line_id}/attachments/metadata",
    response_model=AttachmentMetadataResponse
)
async def get_attachment_metadata(
    report_id: int,
    line_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> AttachmentMetadataResponse:
    """Get attachment metadata without downloading file."""
    pass
```

### Frontend Components

#### 1. AttachmentUploadComponent

```typescript
interface AttachmentUploadComponentProps {
  reportId: number;
  lineId: number;
  onUploadSuccess: (metadata: AttachmentMetadata) => void;
  onUploadError: (error: string) => void;
}

export const AttachmentUploadComponent: React.FC<AttachmentUploadComponentProps> = ({
  reportId,
  lineId,
  onUploadSuccess,
  onUploadError,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // Drag-and-drop handlers
  // File picker handler
  // Upload logic with progress tracking
  // Error handling with specific messages
};
```

#### 2. AttachmentDisplayComponent

```typescript
interface AttachmentDisplayComponentProps {
  reportId: number;
  lineId: number;
  metadata: AttachmentMetadata | null;
  onDelete: () => void;
  onRefresh: () => void;
  isAdmin?: boolean;
}

export const AttachmentDisplayComponent: React.FC<AttachmentDisplayComponentProps> = ({
  reportId,
  lineId,
  metadata,
  onDelete,
  onRefresh,
  isAdmin = false,
}) => {
  // Display current attachment metadata
  // Download button
  // Delete button with confirmation dialog
  // Conditional rendering based on attachment presence
};
```

#### 3. MissingAttachmentWarningDialog

```typescript
interface MissingAttachmentWarningDialogProps {
  missingCount: number;
  onAddAttachments: () => void;
  onSubmitWithout: () => void;
}

export const MissingAttachmentWarningDialog: React.FC<MissingAttachmentWarningDialogProps> = ({
  missingCount,
  onAddAttachments,
  onSubmitWithout,
}) => {
  // Display warning with count of missing attachments
  // Two action buttons
};
```

#### 4. API Client Functions

```typescript
// frontend/src/api/attachments.ts

export async function uploadAttachment(
  reportId: number,
  lineId: number,
  file: File,
  onProgress?: (progress: number) => void
): Promise<AttachmentMetadata> {
  const formData = new FormData();
  formData.append("file", file);
  
  // Use XMLHttpRequest or fetch with progress tracking
  // Handle various error responses
}

export async function deleteAttachment(
  reportId: number,
  lineId: number
): Promise<void> {
  // DELETE request
}

export async function downloadAttachment(
  reportId: number,
  lineId: number
): Promise<void> {
  // GET request with file download
}

export async function getAttachmentMetadata(
  reportId: number,
  lineId: number
): Promise<AttachmentMetadata> {
  // GET request for metadata
}
```

#### 5. TypeScript Types

```typescript
// frontend/src/types/attachments.ts

export interface AttachmentMetadata {
  id: number;
  file_name: string;
  file_size: number;  // bytes
  mime_type: string;
  created_at: string;  // ISO 8601 UTC
  updated_at: string;  // ISO 8601 UTC
}

export interface AttachmentUploadError {
  type: "invalid_type" | "too_large" | "network" | "server";
  message: string;
}
```

---

## Data Models

### Database Schema

```sql
CREATE TABLE attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_report_line_id INTEGER NOT NULL UNIQUE,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (expense_report_line_id) REFERENCES expense_report_lines(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_attachment_line ON attachments(expense_report_line_id);
```

### Relationships

```
ExpenseReport (1) ──── (N) ExpenseReportLine (1) ──── (0..1) Attachment
```

- **ExpenseReport → ExpenseReportLine**: One report has many lines
- **ExpenseReportLine → Attachment**: One line has at most one attachment (enforced by UNIQUE constraint)
- **Cascade Delete**: Deleting a line deletes its attachment

### File Storage Structure

```
/secure/attachments/
├── {uuid-1}/
│   └── file_content  (no extension, binary)
├── {uuid-2}/
│   └── file_content
└── ...
```

**Rationale**:
- UUID-based directory names prevent guessing
- No file extensions prevent direct access
- Restricted permissions (0o700) prevent unauthorized access
- Files served only through API endpoints

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: File Type Validation

*For any* file with a MIME type and extension, if both are in the whitelist, the upload SHALL succeed; if either is not in the whitelist, the upload SHALL fail with a 400 error.

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 2: File Size Enforcement

*For any* file, if its size is ≤ 10 MB, the upload SHALL succeed; if its size is > 10 MB, the upload SHALL fail with a 413 error.

**Validates: Requirements 6.1, 6.2, 6.4**

### Property 3: Upload Round-Trip

*For any* valid file uploaded to an expense report line, retrieving it via the GET endpoint SHALL return identical content and metadata (file name, MIME type, size).

**Validates: Requirements 1.3, 4.1, 4.2**

### Property 4: One-to-One Attachment Invariant

*For any* expense report line, after any attachment operation (upload, delete, replace), the line SHALL have exactly 0 or 1 attachment in the database.

**Validates: Requirements 1.6, 7.4**

### Property 5: Attachment Replacement Idempotence

*For any* expense report line, uploading file A then file B SHALL result in only file B being stored and retrievable; file A SHALL be deleted.

**Validates: Requirements 1.5**

### Property 6: Deletion Idempotence

*For any* attachment, deleting it twice SHALL result in the first deletion returning 204 (No Content) and the second returning 404 (Not Found).

**Validates: Requirements 3.1, 3.2, 3.4**

### Property 7: Authorization Enforcement

*For any* attachment, a user who does not own the expense report and is not an admin SHALL receive a 403 (Forbidden) error when attempting to access, upload, delete, or retrieve it.

**Validates: Requirements 4.5, 9.1, 9.2**

### Property 8: Admin Access Override

*For any* attachment, an authenticated admin user SHALL be able to access, retrieve, and view metadata regardless of report ownership.

**Validates: Requirements 13.1, 13.3, 13.5**

### Property 9: Timestamp Accuracy

*For any* attachment, the `created_at` timestamp SHALL be set to the current UTC time at creation.

**Validates: Requirements 7.2**

### Property 10: File Content Validation

*For any* file, if its content (magic bytes) does not match the declared MIME type, the upload SHALL fail with a 400 error.

**Validates: Requirements 12.5**

### Property 11: Missing Attachment Warning

*For any* expense report with N lines lacking attachments, submitting the report SHALL display a warning dialog listing N missing attachments; if N = 0, no warning SHALL be displayed.

**Validates: Requirements 5.1, 5.2, 5.6**

### Property 12: Secure File Storage

*For any* uploaded file, it SHALL be stored in a non-web-accessible directory with restricted permissions and SHALL only be retrievable through authorized API endpoints, never via direct URL.

**Validates: Requirements 12.1, 12.3, 12.4**

---

## Error Handling

### Backend Error Responses

| Scenario | HTTP Status | Response Body |
|----------|-------------|---------------|
| Invalid file type | 400 | `{"detail": "File type not allowed. Allowed types: PDF, Word documents, Google Docs, Excel spreadsheets, Google Sheets"}` |
| File too large | 413 | `{"detail": "File size exceeds the maximum limit of 10 MB"}` |
| File content mismatch | 400 | `{"detail": "File content does not match declared MIME type"}` |
| Attachment not found | 404 | `{"detail": "Attachment not found"}` |
| User not authorized | 403 | `{"detail": "You do not have permission to access this attachment"}` |
| User not authenticated | 401 | `{"detail": "Not authenticated"}` |
| Report not found | 404 | `{"detail": "Expense report not found"}` |
| Line not found | 404 | `{"detail": "Expense report line not found"}` |

### Frontend Error Handling

**Error Message Display**:
- Invalid file type: "File type not allowed. Allowed types: PDF, Word documents, Google Docs, Excel spreadsheets, Google Sheets"
- File too large: "File size exceeds the maximum limit of 10 MB"
- Network error: "Upload failed. Please check your connection and try again"
- Server error: "Upload failed. Please try again later"

**Error Recovery**:
- All errors are displayed in a dismissible alert
- Form data is preserved after error
- User can retry upload without losing context
- Errors are logged to browser console for debugging

---

## Testing Strategy

### Unit Tests (Backend - pytest)

**File Validation Tests**:
- Test each allowed MIME type succeeds
- Test each disallowed MIME type fails
- Test extension validation
- Test magic byte validation for each file type
- Test file size validation (under, at, over limit)

**Database Tests**:
- Test Attachment model creation with valid data
- Test unique constraint on expense_report_line_id
- Test cascade delete when line is deleted
- Test timestamp auto-generation and updates

**Authorization Tests**:
- Test user can access own attachments
- Test user cannot access others' attachments
- Test admin can access any attachment
- Test unauthenticated requests return 401

**Service Logic Tests**:
- Test upload creates Attachment record and stores file
- Test delete removes both record and file
- Test retrieval returns correct content and metadata
- Test replacement deletes old attachment before storing new

**API Endpoint Tests**:
- Test POST upload with valid file returns 201
- Test POST upload with invalid file returns 400
- Test DELETE returns 204 on success, 404 on missing
- Test GET returns file with correct headers
- Test GET metadata returns JSON response

### Unit Tests (Frontend - Vitest)

**Component Tests**:
- Test AttachmentUploadComponent renders upload input
- Test drag-and-drop triggers upload
- Test file picker triggers upload
- Test progress indicator displays during upload
- Test error messages display for various error types
- Test AttachmentDisplayComponent shows metadata when present
- Test download button is enabled/disabled based on attachment presence
- Test delete button shows confirmation dialog
- Test MissingAttachmentWarningDialog displays correct count

**API Client Tests**:
- Test uploadAttachment sends multipart form data
- Test deleteAttachment sends DELETE request
- Test downloadAttachment triggers file download
- Test getAttachmentMetadata sends GET request
- Test error handling for each error type

**Type Tests**:
- Test AttachmentMetadata type matches API response
- Test AttachmentUploadError type covers all error scenarios

### Integration Tests

**End-to-End Workflows**:
- Test complete upload flow: select file → validate → store → retrieve
- Test complete delete flow: delete → verify removed from DB → verify file deleted
- Test replacement flow: upload A → upload B → verify only B exists
- Test authorization flow: user uploads → different user cannot access → admin can access
- Test missing attachment warning: submit report with missing attachments → warning appears → user can proceed or add attachments

### Property-Based Tests (Hypothesis)

**File Validation Properties**:
- For any file in whitelist, validation succeeds
- For any file not in whitelist, validation fails
- For any file with mismatched content/MIME, validation fails

**Upload/Retrieval Properties**:
- For any valid file, upload then retrieve returns identical content
- For any file, uploading twice to same line results in only second file being stored

**Authorization Properties**:
- For any attachment, non-owner non-admin cannot access
- For any attachment, owner can access
- For any attachment, admin can access

**Timestamp Properties**:
- For any attachment, created_at is set to current time
- For any attachment, updated_at is updated on modification

**Size Validation Properties**:
- For any file ≤ 10 MB, upload succeeds
- For any file > 10 MB, upload fails

---

## Integration Points

### With Existing Expense Report System

1. **ExpenseReportLine Model**: Add `attachment` relationship
   ```python
   attachment = relationship("Attachment", back_populates="expense_report_line", uselist=False)
   ```

2. **Report Submission Logic**: Check for missing attachments before submission
   ```python
   missing_lines = [line for line in report.lines if line.attachment is None]
   if missing_lines:
       # Display warning dialog
   ```

3. **Authentication/Authorization**: Use existing `get_current_user` dependency
   ```python
   current_user = Depends(get_current_user)
   ```

4. **Database Session**: Use existing session management
   ```python
   db = Depends(get_db)
   ```

### Frontend Integration

1. **Line Editor Page**: Embed AttachmentUploadComponent and AttachmentDisplayComponent
2. **Report Submission**: Check for missing attachments and show MissingAttachmentWarningDialog
3. **Admin Report View**: Show attachment section with download capability

---

## Security Considerations

### File Storage Security

- **Location**: Files stored in `/secure/attachments/` outside web root
- **Permissions**: Directory and files have 0o700 (owner read/write/execute only)
- **Naming**: UUID-based names prevent guessing or direct access
- **Access**: Only through API endpoints with authorization checks

### File Content Security

- **Magic Byte Validation**: Verify file content matches declared MIME type
- **Size Limits**: 10 MB limit prevents storage exhaustion
- **Type Whitelist**: Only approved formats allowed

### API Security

- **Authentication**: All endpoints require valid JWT token (401 if missing)
- **Authorization**: User ownership verified for each request (403 if unauthorized)
- **Admin Override**: Admins can access any attachment with role verification
- **Input Validation**: Pydantic schemas validate all inputs

### Data Privacy

- **User Isolation**: Users cannot access others' attachments
- **Audit Trail**: Timestamps track creation and modification
- **Cascade Delete**: Attachments deleted when lines are deleted

---

## Implementation Strategy

### Phase 1: Backend Foundation

1. Create Attachment SQLAlchemy model with relationships
2. Implement FileStorageManager for secure file operations
3. Implement AttachmentService with core logic
4. Create Pydantic schemas for requests/responses
5. Implement AttachmentRouter with all endpoints
6. Add authorization checks using existing auth system
7. Write comprehensive unit and integration tests

### Phase 2: Frontend Components

1. Create AttachmentUploadComponent with drag-and-drop
2. Create AttachmentDisplayComponent with download/delete
3. Create MissingAttachmentWarningDialog
4. Implement API client functions in `frontend/src/api/attachments.ts`
5. Create TypeScript types in `frontend/src/types/attachments.ts`
6. Write component and API client tests

### Phase 3: Integration

1. Update ExpenseReportLine model with attachment relationship
2. Integrate AttachmentUploadComponent into line editor
3. Integrate AttachmentDisplayComponent into line viewer
4. Add missing attachment check to report submission
5. Show MissingAttachmentWarningDialog on submission
6. Test end-to-end workflows

### Phase 4: Admin Features

1. Update frontend to show attachment section for admins
2. Verify admin can access any attachment
3. Test admin workflows

---

## Future Enhancements

- Multiple attachments per line (requires schema changes)
- Attachment versioning (track upload history)
- Virus scanning integration (ClamAV or similar)
- Cloud storage backend (S3, GCS) instead of file system
- Attachment preview (PDF, image thumbnails)
- Batch download (ZIP multiple attachments)
- Attachment search and filtering
- Attachment retention policies

