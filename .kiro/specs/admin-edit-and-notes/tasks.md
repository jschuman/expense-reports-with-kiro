# Implementation Plan: Admin Edit and Notes

## Overview

This plan implements admin edit access (bypassing status restrictions) and admin notes editability on expense reports. The backend adds an `AdminExpenseReportUpdate` schema and `admin_update_report` service function, with the existing `PUT /reports/{id}` endpoint branching on role. The frontend updates `getRowActions` for admin edit controls, adds admin notes to the edit screen (editable for admins, read-only for regular users), and displays admin notes on the view screen.

## Tasks

- [x] 1. Backend schema and service layer
  - [x] 1.1 Create `AdminExpenseReportUpdate` Pydantic schema in `backend/app/schemas/expense_report.py`
    - Add new schema class extending BaseModel with fields: title, description, reimbursable_from_client, client, admin_notes (max 1000 chars)
    - Include the same `validate_client` model_validator as existing `ExpenseReportUpdate`
    - _Requirements: 1.2, 1.5, 6.1_

  - [x] 1.2 Implement `admin_update_report` service function in `backend/app/services/report_service.py`
    - Add function that accepts db, report_id, and AdminExpenseReportUpdate data
    - No status or ownership restrictions — update succeeds for any valid report
    - Apply only explicitly provided (non-None) fields, preserving existing values
    - Do NOT change the report's status
    - Return 404 if report not found
    - _Requirements: 1.1, 1.3, 1.4, 1.6, 1.7, 6.2, 6.3, 6.4_

  - [x] 1.3 Update `PUT /reports/{report_id}` router in `backend/app/routers/reports.py`
    - Change request schema to `AdminExpenseReportUpdate` (superset that accepts admin_notes)
    - Reload user with role relationship to determine if Admin
    - If Admin: delegate to `admin_update_report`
    - If non-Admin: strip admin_notes, construct `ExpenseReportUpdate`, delegate to existing `update_report`
    - Update imports accordingly
    - _Requirements: 1.1, 5.4, 7.4, 7.5_

  - [x] 1.4 Write unit tests for `AdminExpenseReportUpdate` schema in `backend/tests/unit/test_schemas.py`
    - Test valid inputs with all fields, partial fields, admin_notes at max length
    - Test invalid inputs: title empty, title > 255 chars, invalid client, admin_notes > 1000 chars
    - Test client validation: required when reimbursable_from_client is true
    - _Requirements: 1.5, 6.1_

  - [x] 1.5 Write unit tests for `admin_update_report` service in `backend/tests/unit/test_report_service.py`
    - Test successful update across all statuses (In Progress, Submitted, Rejected, Scheduled for Payment)
    - Test partial update preserves unprovided fields
    - Test 404 for non-existent report
    - Test admin_notes update and clear
    - _Requirements: 1.1, 1.3, 1.4, 1.6, 1.7, 6.2, 6.3, 6.4_

  - [x] 1.6 Write unit tests for updated router logic in `backend/tests/unit/test_reports_router.py`
    - Test admin request delegates to admin_update_report
    - Test non-admin request strips admin_notes and delegates to update_report
    - _Requirements: 5.4, 7.5_

- [x] 2. Backend integration and property tests
  - [x] 2.1 Write integration tests for admin update in `backend/tests/integration/test_reports.py`
    - Test PUT /reports/{id} as Admin: successful update for each status
    - Test PUT /reports/{id} as Admin: 404 for non-existent report
    - Test PUT /reports/{id} as Admin: 422 for invalid fields
    - Test PUT /reports/{id} as User: admin_notes discarded from payload
    - Test PUT /reports/{id} as User: 409 for non-editable status (Submitted, Scheduled for Payment)
    - Test PUT /reports/{id} as User: 403 for non-owned report
    - Test error priority: 409 before 403 for non-admin users
    - _Requirements: 1.1, 1.6, 1.7, 5.4, 7.1, 7.2, 7.3, 7.5, 7.6_

  - [x] 2.2 Write property tests for admin update in `backend/tests/property/test_admin_edit_properties.py`
    - **Property 1: Admin update succeeds for any status without changing status**
    - **Validates: Requirements 1.1, 1.4**

  - [x] 2.3 Write property test for partial update preservation in `backend/tests/property/test_admin_edit_properties.py`
    - **Property 2: Admin partial update preserves unprovided fields**
    - **Validates: Requirements 1.3, 6.4**

  - [x] 2.4 Write property test for invalid input rejection in `backend/tests/property/test_admin_edit_properties.py`
    - **Property 3: Admin update rejects invalid input without persisting changes**
    - **Validates: Requirements 1.5, 1.6**

  - [x] 2.5 Write property test for non-admin admin_notes stripping in `backend/tests/property/test_admin_edit_properties.py`
    - **Property 4: Non-admin update discards admin_notes from payload**
    - **Validates: Requirements 5.4, 7.5**

  - [x] 2.6 Write property test for admin notes round-trip in `backend/tests/property/test_admin_edit_properties.py`
    - **Property 7: Admin notes round-trip persistence**
    - **Validates: Requirements 6.2**

  - [x] 2.7 Write property test for non-owner rejection in `backend/tests/property/test_admin_edit_properties.py`
    - **Property 8: Non-owner regular user cannot update reports**
    - **Validates: Requirements 7.3**

- [x] 3. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Frontend utility and type updates
  - [x] 4.1 Update `ExpenseReportUpdate` interface in `frontend/src/types/expenseReport.ts`
    - Add `admin_notes?: string` optional field to the interface
    - _Requirements: 6.1, 6.2_

  - [x] 4.2 Update `expenseReportUpdateSchema` Zod schema in `frontend/src/types/schemas.ts`
    - Add `admin_notes: z.string().max(1000, 'Admin notes must be 1000 characters or less').optional()`
    - _Requirements: 6.1_

  - [x] 4.3 Update `getRowActions` in `frontend/src/utils/tableUtils.ts`
    - Add admin rule before existing Rule 1: if user is Admin, return `['edit', 'view']` for non-Submitted statuses
    - For Submitted status, keep existing Rule 2 (accept/reject) taking priority
    - Ensure admin always has edit access regardless of ownership or status
    - _Requirements: 2.1, 2.2_

  - [ ] 4.4 Write unit tests for updated `getRowActions` in `frontend/src/utils/__tests__/tableUtils.test.ts`
    - Test admin gets edit action for all statuses (In Progress, Submitted, Rejected, Scheduled for Payment)
    - Test admin gets edit for reports they don't own
    - Test regular user still only gets edit for owned editable reports
    - Test Submitted status for admin still includes accept/reject
    - _Requirements: 2.1, 2.3_

  - [ ] 4.5 Write property tests for `getRowActions` in `frontend/src/utils/__tests__/tableUtils.property.test.ts`
    - **Property 5: Admin dashboard shows edit action for all reports**
    - **Validates: Requirements 2.1**

  - [ ] 4.6 Write property test for regular user row actions in `frontend/src/utils/__tests__/tableUtils.property.test.ts`
    - **Property 6: Regular user dashboard shows edit action only for owned editable reports**
    - **Validates: Requirements 2.3**

- [ ] 5. Frontend Edit Screen updates
  - [ ] 5.1 Update `EditReportPage` in `frontend/src/pages/EditReportPage.tsx` for admin notes
    - Add `adminNotes` state field, pre-populated from `report.admin_notes`
    - If user is Admin: render editable `<TextField multiline>` with 1000 char max and character count
    - If user is regular User: render read-only, visually distinct display of admin notes (non-interactive)
    - Show placeholder "No admin notes have been added." when empty
    - Preserve line breaks in read-only display using `whiteSpace: 'pre-wrap'`
    - Include `admin_notes` in update payload when user is Admin
    - _Requirements: 3.1, 3.2, 5.1, 5.2, 5.3, 5.5, 6.1, 6.2, 6.3_

  - [ ] 5.2 Ensure Edit Screen validation and submission behavior
    - Client-side validation: title required (1-255 chars), client required when reimbursable
    - Admin notes max 1000 chars validation for admin users
    - Disable all fields and submit button during submission
    - Display server-side validation errors adjacent to relevant fields
    - Display API errors (403, 404, 409) as ErrorAlert banner
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ] 5.3 Write component tests for `EditReportPage` admin notes in `frontend/src/pages/__tests__/EditReportPage.test.tsx`
    - Test admin sees editable admin_notes TextField
    - Test regular user sees read-only admin_notes display
    - Test admin notes placeholder when empty
    - Test form disabled during submission
    - Test admin_notes included in payload for admin, excluded for regular user
    - _Requirements: 3.1, 3.7, 5.1, 5.2, 6.1_

- [ ] 6. Frontend View Screen updates
  - [ ] 6.1 Update `ExpenseReportDetailPage` in `frontend/src/pages/ExpenseReportDetailPage.tsx`
    - Add "Admin Notes" section with visible label
    - Display content preserving line breaks (`whiteSpace: 'pre-wrap'`)
    - Show placeholder "No admin notes have been added." when empty
    - Wrap content in scrollable `<Box>` with `maxHeight: 200px` when content exceeds 500 characters
    - Read-only for all users (both Admin and regular)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 6.2 Write component tests for admin notes on View Screen in `frontend/src/pages/__tests__/ExpenseReportDetailPage.admin.test.tsx`
    - Test "Admin Notes" label is displayed
    - Test content renders with line breaks preserved
    - Test placeholder shown when admin_notes is null/empty
    - Test scrollable container for content > 500 characters
    - Test read-only for both admin and regular users
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All testing tasks are required per project testing strategy — none are marked optional
- Each task references specific requirements for traceability
- The `admin_notes` column already exists on the database model — no migration needed
- The `ExpenseReportResponse` already includes `admin_notes` — no response schema changes needed
- Property tests use Hypothesis (backend) and fast-check (frontend)
- Checkpoints ensure incremental validation between backend and frontend phases

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "4.1", "4.2"] },
    { "id": 2, "tasks": ["1.3", "1.5"] },
    { "id": 3, "tasks": ["1.6", "2.1", "4.3"] },
    { "id": 4, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "4.4", "4.5", "4.6"] },
    { "id": 5, "tasks": ["5.1"] },
    { "id": 6, "tasks": ["5.2", "6.1"] },
    { "id": 7, "tasks": ["5.3", "6.2"] }
  ]
}
```
