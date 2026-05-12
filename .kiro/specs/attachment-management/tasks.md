# Implementation Plan: Attachment Management for Expense Report Lines

## Overview

This implementation plan breaks down the attachment management feature into discrete, incremental coding tasks. The feature enables users to upload, store, retrieve, and delete single file attachments per expense report line with strict validation, secure storage, and role-based access control. All tasks are organized by implementation phase with clear dependencies, and all testing tasks are required (not optional) per the testing strategy.

## Tasks

- [x] 1. Backend Foundation: Database Schema and Models
  - [x] 1.1 Create Attachment SQLAlchemy ORM model
    - Define Attachment table with id, expense_report_line_id (FK, UNIQUE), file_name, file_size, mime_type, storage_path, created_at columns
    - Add relationship to ExpenseReportLine with back_populates
    - Implement cascade delete on line deletion
    - _Requirements: 7.1, 7.2, 7.3_
  
  - [x] 1.2 Update ExpenseReportLine model with attachment relationship
    - Add attachment relationship to ExpenseReportLine model
    - Ensure one-to-one relationship is properly configured
    - _Requirements: 1.6, 7.1_
  
  - [x] 1.3 Write unit tests for Attachment model
    - Test model creation with valid data
    - Test unique constraint on expense_report_line_id
    - Test cascade delete behavior
    - Test timestamp auto-generation
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 2. Backend Foundation: File Storage and Validation
  - [x] 2.1 Implement FileStorageManager class
    - Create secure directory with 0o700 permissions in __init__
    - Implement store_file() to save files with UUID-based names
    - Implement retrieve_file() to read file content by storage path
    - Implement delete_file() to remove files from storage
    - Implement validate_file_content() to check magic bytes against MIME type
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
  
  - [x] 2.2 Define file type whitelist and validation constants
    - Create ALLOWED_MIME_TYPES set with all 7 approved types (PDF, Word, Google Docs, Excel, Google Sheets)
    - Create ALLOWED_EXTENSIONS set with all approved extensions
    - Define MAX_FILE_SIZE constant (10 MB in bytes)
    - _Requirements: 2.1, 6.1_
  
  - [x] 2.3 Write unit tests for FileStorageManager
    - Test store_file() creates file with UUID-based name
    - Test retrieve_file() returns correct content
    - Test delete_file() removes file from storage
    - Test validate_file_content() for each MIME type (PDF, Word, Excel, Google Docs, Sheets)
    - Test validate_file_content() rejects mismatched content
    - Test directory permissions are 0o700
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 3. Backend Foundation: Pydantic Schemas
  - [x] 3.1 Create AttachmentMetadataResponse Pydantic schema
    - Define fields: id, file_name, file_size, mime_type, created_at
    - Use datetime type for created_at (FastAPI will serialize to ISO 8601 UTC)
    - Add Config with from_attributes=True for ORM compatibility
    - _Requirements: 1.4, 4.2, 4.4, 8.1_
  
  - [x] 3.2 Write unit tests for Pydantic schemas
    - Test AttachmentMetadataResponse validates correct data
    - Test schema rejects invalid data types
    - Test datetime serialization to ISO 8601 UTC format
    - _Requirements: 1.4, 4.2_

- [x] 4. Backend Foundation: AttachmentService Core Logic
  - [x] 4.1 Implement AttachmentService.upload_attachment() method
    - Verify user owns report or is admin (403 if not)
    - Validate file type (extension + MIME type) against whitelist (400 if invalid)
    - Validate file size ≤ 10 MB (413 if too large)
    - Validate file content (magic bytes) matches MIME type (400 if mismatch)
    - Delete existing attachment if present (one-to-one enforcement)
    - Store file using FileStorageManager
    - Create Attachment record in database
    - Return AttachmentMetadataResponse
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 2.1, 2.2, 2.3, 6.1, 6.4, 9.1, 12.5_
  
  - [x] 4.2 Implement AttachmentService.delete_attachment() method
    - Verify user owns report or is admin (403 if not)
    - Retrieve Attachment record (404 if not found)
    - Delete file from storage using FileStorageManager
    - Delete Attachment record from database
    - Return None (204 response)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 9.1_
  
  - [x] 4.3 Implement AttachmentService.get_attachment() method
    - Verify user owns report or is admin (403 if not)
    - Retrieve Attachment record (404 if not found)
    - Retrieve file content from storage using FileStorageManager
    - Return tuple of (file_content, mime_type, original_filename)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 9.1_
  
  - [x] 4.4 Implement AttachmentService.get_attachment_metadata() method
    - Verify user owns report or is admin (403 if not)
    - Retrieve Attachment record (404 if not found)
    - Return AttachmentMetadataResponse
    - _Requirements: 4.1, 4.3, 8.4, 9.1_
  
  - [x] 4.5 Write unit tests for AttachmentService
    - Test upload_attachment() with valid file succeeds
    - Test upload_attachment() with invalid MIME type returns 400
    - Test upload_attachment() with invalid extension returns 400
    - Test upload_attachment() with file > 10 MB returns 413
    - Test upload_attachment() with mismatched content returns 400
    - Test upload_attachment() replaces existing attachment
    - Test upload_attachment() returns correct metadata
    - Test delete_attachment() removes file and record
    - Test delete_attachment() returns 404 for missing attachment
    - Test get_attachment() returns correct file content
    - Test get_attachment() returns 404 for missing attachment
    - Test get_attachment_metadata() returns correct metadata
    - Test authorization: non-owner non-admin gets 403
    - Test authorization: owner can access
    - Test authorization: admin can access any
    - _Requirements: 1.1-1.6, 3.1-3.5, 4.1-4.5, 6.1-6.4, 9.1-9.4_

- [x] 5. Backend API: FastAPI Router and Endpoints
  - [x] 5.1 Create AttachmentRouter with POST upload endpoint
    - Route: POST /api/expense-reports/{report_id}/lines/{line_id}/attachments
    - Accept multipart form data with file field
    - Call AttachmentService.upload_attachment()
    - Return 201 Created with AttachmentMetadataResponse
    - Handle validation errors (400, 413)
    - Handle authorization errors (403)
    - Handle not found errors (404)
    - _Requirements: 8.1, 9.5, 9.6_
  
  - [x] 5.2 Create AttachmentRouter with DELETE endpoint
    - Route: DELETE /api/expense-reports/{report_id}/lines/{line_id}/attachments
    - Call AttachmentService.delete_attachment()
    - Return 204 No Content on success
    - Handle authorization errors (403)
    - Handle not found errors (404)
    - _Requirements: 8.2, 9.5, 9.6_
  
  - [x] 5.3 Create AttachmentRouter with GET download endpoint
    - Route: GET /api/expense-reports/{report_id}/lines/{line_id}/attachments
    - Call AttachmentService.get_attachment()
    - Return FileResponse with correct Content-Type and Content-Disposition headers
    - Set Content-Disposition to attachment; filename="<original_filename>"
    - Handle authorization errors (403)
    - Handle not found errors (404)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 8.3, 9.5, 9.6_
  
  - [x] 5.4 Create AttachmentRouter with GET metadata endpoint
    - Route: GET /api/expense-reports/{report_id}/lines/{line_id}/attachments/metadata
    - Call AttachmentService.get_attachment_metadata()
    - Return 200 OK with AttachmentMetadataResponse
    - Handle authorization errors (403)
    - Handle not found errors (404)
    - _Requirements: 8.4, 9.5, 9.6_
  
  - [x] 5.5 Write integration tests for all attachment endpoints
    - Test POST upload with valid file returns 201 with metadata
    - Test POST upload with invalid file type returns 400
    - Test POST upload with file > 10 MB returns 413
    - Test POST upload with mismatched content returns 400
    - Test POST upload requires authentication (401 if missing)
    - Test POST upload requires ownership or admin role (403 if unauthorized)
    - Test DELETE returns 204 on success
    - Test DELETE returns 404 for missing attachment
    - Test DELETE requires authentication (401 if missing)
    - Test DELETE requires ownership or admin role (403 if unauthorized)
    - Test GET download returns file with correct headers
    - Test GET download returns 404 for missing attachment
    - Test GET download requires authentication (401 if missing)
    - Test GET download requires ownership or admin role (403 if unauthorized)
    - Test GET metadata returns 200 with metadata JSON
    - Test GET metadata returns 404 for missing attachment
    - Test GET metadata requires authentication (401 if missing)
    - Test GET metadata requires ownership or admin role (403 if unauthorized)
    - _Requirements: 8.1-8.6, 9.1-9.4_

- [x] 6. Backend: Property-Based Tests
  - [x] 6.1 Write property test for file type validation (Property 1)
    - For any file with MIME type and extension in whitelist, upload succeeds
    - For any file with MIME type or extension not in whitelist, upload fails with 400
    - Use Hypothesis to generate valid and invalid file types
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 6.2 Write property test for file size enforcement (Property 2)
    - For any file ≤ 10 MB, upload succeeds
    - For any file > 10 MB, upload fails with 413
    - Use Hypothesis to generate files of various sizes
    - _Requirements: 6.1, 6.2, 6.4_
  
  - [x] 6.3 Write property test for upload round-trip (Property 3)
    - For any valid file uploaded, retrieving it returns identical content and metadata
    - Use Hypothesis to generate various file types and sizes
    - _Requirements: 1.3, 4.1, 4.2_
  
  - [x] 6.4 Write property test for one-to-one attachment invariant (Property 4)
    - For any expense report line, after any operation, line has 0 or 1 attachment
    - Use Hypothesis to generate sequences of upload/delete operations
    - _Requirements: 1.6, 7.4_
  
  - [x] 6.5 Write property test for attachment replacement idempotence (Property 5)
    - For any line, uploading file A then file B results in only B being stored
    - File A is deleted and not retrievable
    - Use Hypothesis to generate file sequences
    - _Requirements: 1.5_
  
  - [x] 6.6 Write property test for deletion idempotence (Property 6)
    - For any attachment, first delete returns 204, second returns 404
    - Use Hypothesis to generate delete sequences
    - _Requirements: 3.1, 3.2, 3.4_
  
  - [x] 6.7 Write property test for authorization enforcement (Property 7)
    - For any attachment, non-owner non-admin gets 403
    - For any attachment, owner gets access
    - For any attachment, admin gets access
    - Use Hypothesis to generate user/role combinations
    - _Requirements: 4.5, 9.1, 9.2_
  
  - [x] 6.8 Write property test for admin access override (Property 8)
    - For any attachment, admin can access regardless of ownership
    - Use Hypothesis to generate admin/non-admin user combinations
    - _Requirements: 13.1, 13.3, 13.5_
  
  - [x] 6.9 Write property test for timestamp accuracy (Property 9)
    - For any attachment, created_at is set to current UTC time (within 1 second)
    - Use Hypothesis to generate multiple attachments
    - _Requirements: 7.2_
  
  - [x] 6.10 Write property test for file content validation (Property 10)
    - For any file with mismatched content/MIME type, upload fails with 400
    - For any file with matching content/MIME type, upload succeeds
    - Use Hypothesis to generate files with various content/MIME combinations
    - _Requirements: 12.5_
  
  - [x] 6.11 Write property test for secure file storage (Property 12)
    - For any uploaded file, it's only accessible through API endpoints
    - Files are stored with UUID-based names in non-web-accessible directory
    - Use Hypothesis to generate file access attempts
    - _Requirements: 12.1, 12.3, 12.4_

- [x] 7. Backend: Checkpoint - Ensure all backend tests pass
  - Ensure all unit tests, integration tests, and property-based tests pass
  - Verify 100% code coverage on backend/app/ (excluding __pycache__ and .pyc files)
  - Ask the user if questions arise

- [x] 8. Frontend: TypeScript Types and API Client
  - [x] 8.1 Create TypeScript types for attachments
    - Define AttachmentMetadata interface matching backend response
    - Define AttachmentUploadError interface with error types
    - Export types from frontend/src/types/attachments.ts
    - _Requirements: 1.4, 4.2, 10.1_
  
  - [x] 8.2 Implement API client functions for attachment operations
    - Implement uploadAttachment() with multipart form data and progress tracking
    - Implement deleteAttachment() with DELETE request
    - Implement downloadAttachment() with file download trigger
    - Implement getAttachmentMetadata() with GET request
    - Handle error responses and map to AttachmentUploadError types
    - Export functions from frontend/src/api/attachments.ts
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 11.1-11.6_
  
  - [x] 8.3 Write unit tests for API client functions
    - Test uploadAttachment() sends multipart form data
    - Test uploadAttachment() tracks progress
    - Test uploadAttachment() handles error responses
    - Test deleteAttachment() sends DELETE request
    - Test downloadAttachment() triggers file download
    - Test getAttachmentMetadata() sends GET request
    - Test error handling for each error type (invalid type, too large, network, server)
    - _Requirements: 8.1-8.4, 11.1-11.6_

- [x] 9. Frontend: Attachment Upload Component
  - [x] 9.1 Create AttachmentUploadComponent with drag-and-drop
    - Render file input with drag-and-drop zone
    - Accept file picker selection
    - Display progress indicator during upload
    - Call uploadAttachment() API function
    - Handle upload success and call onUploadSuccess callback
    - Handle upload errors and call onUploadError callback
    - Display error messages for each error type
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 11.1-11.6_
  
  - [x] 9.2 Write unit tests for AttachmentUploadComponent
    - Test component renders file input
    - Test drag-and-drop triggers upload
    - Test file picker triggers upload
    - Test progress indicator displays during upload
    - Test error messages display for each error type
    - Test onUploadSuccess callback is called on success
    - Test onUploadError callback is called on error
    - Test form data is preserved after error
    - _Requirements: 10.1-10.8, 11.1-11.6_

- [x] 10. Frontend: Attachment Display Component
  - [x] 10.1 Create AttachmentDisplayComponent
    - Display current attachment metadata (file name, size, upload timestamp)
    - Render download button (enabled if attachment exists)
    - Render delete button (enabled if attachment exists)
    - Call downloadAttachment() API function on download button click
    - Show confirmation dialog before delete
    - Call deleteAttachment() API function on delete confirmation
    - Call onRefresh callback after delete to update parent
    - _Requirements: 10.1, 10.2, 10.7, 10.8_
  
  - [x] 10.2 Write unit tests for AttachmentDisplayComponent
    - Test component displays attachment metadata when present
    - Test download button is enabled when attachment exists
    - Test download button is disabled when no attachment
    - Test delete button is enabled when attachment exists
    - Test delete button is disabled when no attachment
    - Test confirmation dialog appears on delete button click
    - Test onRefresh callback is called after delete
    - Test component handles missing attachment gracefully
    - _Requirements: 10.1, 10.2, 10.7, 10.8_

- [x] 11. Frontend: Missing Attachment Warning Dialog
  - [x] 11.1 Create MissingAttachmentWarningDialog component
    - Display warning message with count of missing attachments
    - Render "Add Attachments" button
    - Render "Submit Without Attachments" button
    - Call onAddAttachments callback on "Add Attachments" click
    - Call onSubmitWithout callback on "Submit Without Attachments" click
    - _Requirements: 5.2, 5.3, 5.4, 5.5_
  
  - [x] 11.2 Write unit tests for MissingAttachmentWarningDialog
    - Test dialog displays correct count of missing attachments
    - Test "Add Attachments" button calls onAddAttachments callback
    - Test "Submit Without Attachments" button calls onSubmitWithout callback
    - Test dialog renders with correct message text
    - _Requirements: 5.2, 5.3, 5.4, 5.5_

- [x] 12. Frontend: Checkpoint - Ensure all frontend tests pass
  - Ensure all unit tests pass
  - Verify 100% code coverage on frontend/src/ utility functions
  - Ask the user if questions arise

- [x] 13. Integration: Update Expense Report Line Editor
  - [x] 13.1 Integrate AttachmentUploadComponent into line editor
    - Add AttachmentUploadComponent to expense report line editor page
    - Pass reportId and lineId props
    - Implement onUploadSuccess to refresh attachment display
    - Implement onUploadError to show error message
    - _Requirements: 10.1-10.8_
  
  - [x] 13.2 Integrate AttachmentDisplayComponent into line editor
    - Add AttachmentDisplayComponent to expense report line editor page
    - Pass reportId and lineId props
    - Fetch current attachment metadata on component mount
    - Implement onDelete to refresh attachment display
    - Implement onRefresh to reload attachment metadata
    - _Requirements: 10.1, 10.2, 10.7, 10.8_
  
  - [x] 13.3 Write integration tests for line editor with attachments
    - Test upload flow: select file → validate → store → display
    - Test delete flow: delete → verify removed from DB → verify file deleted
    - Test replacement flow: upload A → upload B → verify only B exists
    - Test authorization flow: user uploads → different user cannot access → admin can access
    - _Requirements: 1.1-1.6, 3.1-3.5, 4.1-4.5, 9.1-9.4_

- [x] 14. Integration: Update Report Submission Logic
  - [x] 14.1 Add missing attachment check to report submission
    - Query all lines in report
    - Identify lines without attachments
    - If missing attachments exist, show MissingAttachmentWarningDialog
    - If user selects "Add Attachments", return to editor
    - If user selects "Submit Without Attachments", proceed with submission
    - If no missing attachments, proceed directly to submission
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  
  - [x] 14.2 Write integration tests for report submission with missing attachments
    - Test submit with all attachments present → no warning
    - Test submit with missing attachments → warning appears
    - Test warning shows correct count of missing lines
    - Test "Add Attachments" button returns to editor
    - Test "Submit Without Attachments" button proceeds with submission
    - _Requirements: 5.1-5.6_

- [x] 15. Integration: Admin Attachment Access
  - [x] 15.1 Update frontend to show attachment section for admins
    - Check user role in component
    - Show AttachmentDisplayComponent for admins viewing any report
    - Allow admins to download attachments from any report
    - _Requirements: 13.1, 13.2, 13.3, 13.6_
  
  - [x] 15.2 Write integration tests for admin attachment access
    - Test admin can view attachments from any report
    - Test admin can download attachments from any report
    - Test admin can view attachment metadata from any report
    - Test non-admin cannot access other users' attachments
    - _Requirements: 13.1, 13.3, 13.5, 13.6_

- [x] 16. Final Checkpoint - Ensure all tests pass
  - Ensure all unit tests, integration tests, and property-based tests pass
  - Verify 100% code coverage on backend/app/ and frontend/src/
  - Verify all requirements are covered by implementation tasks
  - Ask the user if questions arise

## Notes

- All testing tasks are required and must be implemented (no optional test tasks per testing strategy)
- Each task references specific requirements for traceability
- Property-based tests validate universal correctness properties defined in the design document
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end workflows
- Checkpoints ensure incremental validation and allow for course correction
- File storage uses UUID-based naming to prevent direct access and enforce API-driven retrieval
- Authorization checks are performed at the service layer and enforced in all endpoints
- All timestamps are stored in UTC and serialized as ISO 8601 strings in API responses
- Frontend converts UTC timestamps to local timezone for display using browser's Intl API

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "2.2", "3.1"] },
    { "id": 1, "tasks": ["1.3", "2.3", "3.2", "4.1", "4.2", "4.3", "4.4"] },
    { "id": 2, "tasks": ["4.5", "5.1", "5.2", "5.3", "5.4"] },
    { "id": 3, "tasks": ["5.5", "6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9", "6.10", "6.11"] },
    { "id": 4, "tasks": ["8.1", "8.2"] },
    { "id": 5, "tasks": ["8.3", "9.1", "10.1", "11.1"] },
    { "id": 6, "tasks": ["9.2", "10.2", "11.2"] },
    { "id": 7, "tasks": ["13.1", "13.2", "14.1", "15.1"] },
    { "id": 8, "tasks": ["13.3", "14.2", "15.2"] }
  ]
}
```

