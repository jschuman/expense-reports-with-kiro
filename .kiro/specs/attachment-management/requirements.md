# Attachment Management for Expense Report Lines

## Introduction

This feature enables users to upload and manage file attachments to individual expense report lines. Each report line can have one optional attachment (PDF, Word, Google Docs, Excel, or Google Sheets formats). Users can delete attachments to replace them, and the system warns users when submitting reports with lines missing attachments. This feature enhances expense documentation and audit compliance by allowing users to attach supporting receipts and documentation directly to line items.

## Glossary

- **Attachment**: A file uploaded and associated with a single Expense_Report_Line. Attachments are optional.
- **Expense_Report_Line**: A line item within an Expense_Report containing details about a single expense (e.g., date, category, amount).
- **Expense_Report**: A collection of Expense_Report_Lines submitted by a user for reimbursement.
- **File_Type_Whitelist**: The set of allowed MIME types and file extensions: PDF, Word documents (`.docx`, `.doc`), Google Docs (`.gdoc`), Excel spreadsheets (`.xlsx`, `.xls`), and Google Sheets (`.gsheet`).
- **Attachment_Storage**: The backend file storage system where uploaded attachments are persisted (file system or cloud storage).
- **Attachment_Metadata**: Information about an attachment including file name, file size, upload timestamp, and MIME type.
- **Missing_Attachment_Warning**: A confirmation dialog displayed to the user when attempting to submit a report with one or more lines lacking attachments.
- **Attachment_Manager**: The backend service responsible for handling attachment upload, deletion, retrieval, and validation logic.
- **Report_Submission**: The action of finalizing and submitting an Expense_Report for approval.

## Requirements

### Requirement 1: Upload Single Attachment to Expense Report Line

**User Story:** As a user, I want to upload a single file attachment to an expense report line, so that I can provide supporting documentation for that expense.

#### Acceptance Criteria

1. WHEN a user selects a file to upload to an Expense_Report_Line, THE Attachment_Manager SHALL validate the file against the File_Type_Whitelist
2. IF the file type is not in the File_Type_Whitelist, THEN THE Attachment_Manager SHALL reject the upload and return a descriptive error message indicating the allowed file types
3. WHEN a valid file is uploaded, THE Attachment_Manager SHALL store the file in Attachment_Storage and create an Attachment record in the database
4. WHEN an Attachment is successfully created, THE Attachment_Manager SHALL return Attachment_Metadata including file name, file size, upload timestamp, and MIME type
5. WHEN a user uploads a file to an Expense_Report_Line that already has an Attachment, THE Attachment_Manager SHALL replace the existing Attachment with the new one
6. THE Attachment_Manager SHALL enforce a one-to-one relationship between Expense_Report_Line and Attachment (each line has at most one attachment)

#### Property-Based Testing Considerations

- **Round-trip property**: For file uploads, verify that the uploaded file can be retrieved and its content matches the original (parse → store → retrieve → compare)
- **Invariant property**: After upload, the Expense_Report_Line SHALL have exactly one Attachment associated with it
- **Idempotence property**: Uploading the same file twice to the same line SHALL result in the same Attachment (no duplicates)

---

### Requirement 2: Validate File Type Against Whitelist

**User Story:** As a system, I want to validate uploaded files against a whitelist of allowed types, so that only approved file formats are stored.

#### Acceptance Criteria

1. THE File_Type_Whitelist SHALL include the following MIME types and extensions:
   - PDF: `application/pdf` (`.pdf`)
   - Word documents: `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (`.docx`), `application/msword` (`.doc`)
   - Google Docs: `application/vnd.google-apps.document` (`.gdoc`)
   - Excel spreadsheets: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (`.xlsx`), `application/vnd.ms-excel` (`.xls`)
   - Google Sheets: `application/vnd.google-apps.spreadsheet` (`.gsheet`)
2. WHEN a file is uploaded, THE Attachment_Manager SHALL check both the file extension and MIME type against the File_Type_Whitelist
3. IF either the file extension or MIME type is not in the File_Type_Whitelist, THEN THE Attachment_Manager SHALL reject the upload
4. WHEN a file is rejected, THE Attachment_Manager SHALL return an error response with HTTP status 400 and a message listing the allowed file types

#### Property-Based Testing Considerations

- **Metamorphic property**: For any file in the whitelist, validation SHALL succeed; for any file not in the whitelist, validation SHALL fail
- **Idempotence property**: Validating the same file multiple times SHALL always produce the same result

---

### Requirement 3: Delete Attachment from Expense Report Line

**User Story:** As a user, I want to delete an attachment from an expense report line, so that I can remove incorrect or outdated documentation.

#### Acceptance Criteria

1. WHEN a user requests deletion of an Attachment, THE Attachment_Manager SHALL remove the Attachment record from the database
2. WHEN an Attachment is deleted, THE Attachment_Manager SHALL also remove the associated file from Attachment_Storage
3. WHEN an Attachment is successfully deleted, THE Attachment_Manager SHALL return a success response with HTTP status 204 (No Content)
4. IF a user attempts to delete an Attachment that does not exist, THEN THE Attachment_Manager SHALL return an error response with HTTP status 404 (Not Found)
5. AFTER an Attachment is deleted, THE Expense_Report_Line SHALL have no associated Attachment (the one-to-one relationship is cleared)

#### Property-Based Testing Considerations

- **Idempotence property**: Deleting an Attachment twice SHALL result in the second deletion returning a 404 error (not a success)
- **Invariant property**: After deletion, the Expense_Report_Line SHALL have zero Attachments

---

### Requirement 4: Retrieve Attachment from Expense Report Line

**User Story:** As a user, I want to retrieve and download an attachment from an expense report line, so that I can review the supporting documentation.

#### Acceptance Criteria

1. WHEN a user requests an Attachment by Expense_Report_Line ID, THE Attachment_Manager SHALL retrieve the Attachment record and associated file from Attachment_Storage
2. WHEN an Attachment is successfully retrieved, THE Attachment_Manager SHALL return the file with the correct MIME type and original file name in the response headers
3. IF an Expense_Report_Line has no associated Attachment, THEN THE Attachment_Manager SHALL return an error response with HTTP status 404 (Not Found)
4. WHEN a file is retrieved, THE Attachment_Manager SHALL set the `Content-Disposition` header to `attachment; filename="<original_filename>"` to trigger a download
5. THE Attachment_Manager SHALL verify that the requesting user is the owner of the Expense_Report before allowing retrieval

#### Property-Based Testing Considerations

- **Round-trip property**: For any uploaded file, retrieving it SHALL return the same content and metadata
- **Invariant property**: The retrieved file name and MIME type SHALL match the stored Attachment_Metadata

---

### Requirement 5: Display Missing Attachment Warning on Report Submission

**User Story:** As a user, I want to be warned when submitting a report with lines missing attachments, so that I can decide whether to add attachments or proceed without them.

#### Acceptance Criteria

1. WHEN a user attempts to submit an Expense_Report, THE Report_Submission service SHALL check all Expense_Report_Lines for missing Attachments
2. IF one or more Expense_Report_Lines lack an Attachment, THEN THE Report_Submission service SHALL display a Missing_Attachment_Warning dialog to the user
3. THE Missing_Attachment_Warning dialog SHALL list the number of lines without attachments and provide two options: "Add Attachments" and "Submit Without Attachments"
4. IF the user selects "Add Attachments", THEN THE dialog SHALL close and the user SHALL be returned to the report editing view
5. IF the user selects "Submit Without Attachments", THEN THE Report_Submission service SHALL proceed with submitting the Expense_Report
6. IF all Expense_Report_Lines have Attachments, THEN THE Report_Submission service SHALL proceed directly to submission without displaying the warning

#### Property-Based Testing Considerations

- **Idempotence property**: Submitting a report multiple times with the same attachment state SHALL produce the same warning behavior
- **Metamorphic property**: If a line has an attachment, the warning SHALL not mention that line; if a line lacks an attachment, the warning SHALL mention it

---

### Requirement 6: Enforce File Size Limits

**User Story:** As a system, I want to enforce file size limits on attachments, so that storage and performance are not negatively impacted.

#### Acceptance Criteria

1. THE Attachment_Manager SHALL enforce a maximum file size limit of 10 MB per attachment
2. WHEN a user attempts to upload a file larger than 10 MB, THE Attachment_Manager SHALL reject the upload and return an error response with HTTP status 413 (Payload Too Large)
3. WHEN a file is rejected due to size, THE Attachment_Manager SHALL return an error message indicating the maximum allowed file size
4. THE Attachment_Manager SHALL validate file size before storing the file in Attachment_Storage

#### Property-Based Testing Considerations

- **Metamorphic property**: For any file under 10 MB, upload SHALL succeed; for any file over 10 MB, upload SHALL fail
- **Invariant property**: No file larger than 10 MB SHALL be stored in Attachment_Storage

---

### Requirement 7: Persist Attachment Metadata in Database

**User Story:** As a system, I want to store attachment metadata in the database, so that I can track and manage attachments efficiently.

#### Acceptance Criteria

1. THE database schema SHALL include an Attachment table with the following columns:
   - `id`: Unique identifier (primary key)
   - `expense_report_line_id`: Foreign key referencing Expense_Report_Line (unique constraint to enforce one-to-one relationship)
   - `file_name`: Original file name as uploaded by the user
   - `file_size`: Size of the file in bytes
   - `mime_type`: MIME type of the file
   - `storage_path`: Path or identifier for the file in Attachment_Storage
   - `created_at`: Timestamp of when the attachment was uploaded (UTC)
2. WHEN an Attachment is created, THE database SHALL automatically set `created_at` to the current UTC timestamp
3. THE Attachment table SHALL have a unique constraint on `expense_report_line_id` to enforce the one-to-one relationship

#### Property-Based Testing Considerations

- **Invariant property**: Each Expense_Report_Line SHALL have at most one Attachment record in the database
- **Round-trip property**: Storing and retrieving Attachment_Metadata from the database SHALL preserve all fields accurately

---

### Requirement 8: Provide API Endpoints for Attachment Management

**User Story:** As a frontend developer, I want well-defined REST API endpoints for attachment operations, so that I can integrate attachment management into the UI.

#### Acceptance Criteria

1. THE backend SHALL provide a `POST /api/expense-reports/{report_id}/lines/{line_id}/attachments` endpoint to upload an attachment
   - Request: Multipart form data with file field
   - Response: HTTP 201 (Created) with Attachment_Metadata JSON
   - Validation: File type, file size, user authorization
2. THE backend SHALL provide a `DELETE /api/expense-reports/{report_id}/lines/{line_id}/attachments` endpoint to delete an attachment
   - Response: HTTP 204 (No Content) on success, HTTP 404 (Not Found) if no attachment exists
   - Validation: User authorization
3. THE backend SHALL provide a `GET /api/expense-reports/{report_id}/lines/{line_id}/attachments` endpoint to retrieve an attachment
   - Response: HTTP 200 with file content and appropriate headers (Content-Type, Content-Disposition)
   - Response: HTTP 404 (Not Found) if no attachment exists
   - Validation: User authorization
4. THE backend SHALL provide a `GET /api/expense-reports/{report_id}/lines/{line_id}/attachments/metadata` endpoint to retrieve attachment metadata without downloading the file
   - Response: HTTP 200 with Attachment_Metadata JSON
   - Response: HTTP 404 (Not Found) if no attachment exists
   - Validation: User authorization
5. ALL attachment endpoints SHALL require authentication (reject unauthenticated requests with HTTP 401)
6. ALL attachment endpoints SHALL verify that the requesting user owns the Expense_Report before allowing access

#### Property-Based Testing Considerations

- **Round-trip property**: Uploading a file via POST and retrieving it via GET SHALL return identical content
- **Idempotence property**: Multiple DELETE requests to the same endpoint SHALL result in the first succeeding and subsequent requests returning 404

---

### Requirement 9: Validate User Authorization for Attachment Operations

**User Story:** As a system, I want to ensure users can only access attachments for their own expense reports, so that data privacy and security are maintained.

#### Acceptance Criteria

1. WHEN a user requests an attachment operation (upload, delete, retrieve, or view metadata), THE Attachment_Manager SHALL verify that the user is the owner of the Expense_Report
2. IF the user is not the owner of the Expense_Report, THEN THE Attachment_Manager SHALL return an error response with HTTP status 403 (Forbidden)
3. WHEN a user is authenticated, THE Attachment_Manager SHALL extract the user ID from the authentication token and compare it to the Expense_Report owner
4. IF the user is not authenticated, THEN THE Attachment_Manager SHALL return an error response with HTTP status 401 (Unauthorized)

#### Property-Based Testing Considerations

- **Invariant property**: A user SHALL never be able to access attachments for reports they do not own
- **Idempotence property**: Authorization checks SHALL always produce the same result for the same user and report

---

### Requirement 10: Display Attachment UI in Report Line Editor

**User Story:** As a user, I want to see an attachment upload/download interface in the expense report line editor, so that I can easily manage attachments.

#### Acceptance Criteria

1. WHEN a user opens an Expense_Report_Line for editing, THE frontend SHALL display an attachment section with:
   - A file upload input (drag-and-drop or file picker)
   - Display of the current attachment (if one exists) showing file name, file size, and upload timestamp
   - A delete button to remove the current attachment
   - A download button to retrieve the current attachment
2. WHEN a user drags a file onto the attachment section, THE frontend SHALL accept the file and initiate upload
3. WHEN a user selects a file via the file picker, THE frontend SHALL initiate upload
4. WHILE a file is uploading, THE frontend SHALL display a progress indicator
5. WHEN an upload completes successfully, THE frontend SHALL display the new attachment metadata and refresh the attachment section
6. WHEN an upload fails, THE frontend SHALL display an error message indicating the reason (e.g., invalid file type, file too large)
7. WHEN a user clicks the delete button, THE frontend SHALL display a confirmation dialog before deleting the attachment
8. WHEN a user clicks the download button, THE frontend SHALL trigger a download of the attachment file

#### Property-Based Testing Considerations

- **Idempotence property**: Uploading the same file twice SHALL result in the same attachment being displayed
- **Metamorphic property**: If an attachment exists, the download button SHALL be enabled; if no attachment exists, the download button SHALL be disabled

---

### Requirement 11: Handle Attachment Upload Errors Gracefully

**User Story:** As a user, I want clear error messages when attachment uploads fail, so that I can understand what went wrong and take corrective action.

#### Acceptance Criteria

1. WHEN an attachment upload fails due to invalid file type, THE frontend SHALL display an error message: "File type not allowed. Allowed types: PDF, Word documents, Google Docs, Excel spreadsheets, Google Sheets"
2. WHEN an attachment upload fails due to file size exceeding the limit, THE frontend SHALL display an error message: "File size exceeds the maximum limit of 10 MB"
3. WHEN an attachment upload fails due to a network error, THE frontend SHALL display an error message: "Upload failed. Please check your connection and try again"
4. WHEN an attachment upload fails due to a server error, THE frontend SHALL display an error message: "Upload failed. Please try again later"
5. WHEN an error is displayed, THE frontend SHALL allow the user to retry the upload without losing other form data
6. THE frontend SHALL log all upload errors to the browser console for debugging purposes

#### Property-Based Testing Considerations

- **Metamorphic property**: For each error condition, the appropriate error message SHALL be displayed
- **Idempotence property**: Retrying a failed upload with the same file SHALL produce the same result

---

### Requirement 12: Store Attachments Securely

**User Story:** As a system, I want to store attachments securely, so that files are protected from unauthorized access and data loss.

#### Acceptance Criteria

1. THE Attachment_Manager SHALL store uploaded files in a secure location with restricted file system permissions (readable only by the application)
2. WHEN a file is stored, THE Attachment_Manager SHALL use a unique, non-guessable file name (e.g., UUID-based) to prevent direct file access via URL
3. THE Attachment_Manager SHALL NOT store files in a web-accessible directory (e.g., not in `public/` or `static/`)
4. WHEN a file is retrieved, THE Attachment_Manager SHALL serve it through the API endpoint (not via direct file URL) to enforce authorization checks
5. THE Attachment_Manager SHALL validate file content (magic bytes) to ensure the file type matches the declared MIME type

#### Property-Based Testing Considerations

- **Invariant property**: Files SHALL only be accessible through authorized API endpoints, never via direct URL
- **Idempotence property**: Retrieving the same file multiple times SHALL always enforce authorization checks

---

### Requirement 13: Admin Access to Attachments

**User Story:** As an admin, I want to view and download attachments from any expense report line, so that I can review supporting documentation during the approval process.

#### Acceptance Criteria

1. WHEN an authenticated Admin_Role user requests an Attachment from any Expense_Report, THE Attachment_Manager SHALL allow access regardless of report ownership
2. WHEN an Admin_Role user views an Expense_Report_Line, THE frontend SHALL display the attachment section showing the current attachment (if one exists) with file name, file size, and upload timestamp
3. WHEN an Admin_Role user clicks the download button for an attachment, THE Attachment_Manager SHALL serve the file with HTTP status 200 and appropriate headers (Content-Type, Content-Disposition)
4. WHEN an Admin_Role user attempts to access an attachment for a report that does not exist, THE Attachment_Manager SHALL return an error response with HTTP status 404 (Not Found)
5. THE Attachment_Manager SHALL verify that the requesting user has Admin_Role before granting access to attachments from reports they do not own
6. WHEN an Admin_Role user views the attachment metadata endpoint, THE Attachment_Manager SHALL return the Attachment_Metadata JSON including file name, file size, MIME type, and upload timestamp

#### Property-Based Testing Considerations

- **Invariant property**: An Admin_Role user SHALL be able to access attachments from any Expense_Report, regardless of ownership
- **Metamorphic property**: If a user has Admin_Role, attachment access SHALL be granted; if a user has User_Role and does not own the report, attachment access SHALL be denied

---

## Summary

This requirements document defines a comprehensive attachment management system for expense report lines. The feature enables users to upload, delete, and retrieve single attachments per report line with strict file type and size validation. The system enforces user authorization, provides clear error handling, and warns users when submitting reports with missing attachments. Admins can view and download attachments from any expense report during the approval process. All requirements follow EARS patterns and INCOSE quality rules, with explicit acceptance criteria and property-based testing considerations to ensure robust implementation and testing.
