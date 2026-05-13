# Implementation Plan: Status History Table

## Overview

This plan implements a read-only status history table on expense report detail pages. The backend exposes a new `GET /reports/{report_id}/status-history` endpoint using the existing `StatusAuditLog` model. The frontend adds a `StatusHistoryTable` component that conditionally renders when there are 2+ audit entries, reusing the existing `StatusChip` and `formatUtcDate` utilities. All tasks follow the API-first approach: backend endpoint → frontend API client → component → integration into pages.

## Tasks

- [x] 1. Implement backend status history endpoint
  - [x] 1.1 Add `GET /reports/{report_id}/status-history` endpoint to `backend/app/routers/reports.py`
    - Add a new route function `get_status_history` that accepts `report_id` path parameter
    - Use `Depends(get_current_user)` for authentication and `Depends(get_db)` for database session
    - Query `StatusAuditLog` entries filtered by `expense_report_id`, ordered by `changed_at ASC`
    - Return `List[StatusAuditLogEntry]` response model (schema already exists in `backend/app/schemas/expense_report.py`)
    - Implement authorization: return 404 if report doesn't exist, 403 if user is not owner and not Admin
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 1.2 Write integration tests for the status history endpoint in `backend/tests/integration/test_status_history.py`
    - Test 200 response with correct JSON shape for report owner
    - Test 200 response for admin user (non-owner)
    - Test 401 response for unauthenticated request
    - Test 403 response for authenticated non-owner non-admin user
    - Test 404 response for non-existent report ID
    - Test empty array response for report with no audit entries
    - Test ordering: entries returned in chronological order
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 1.3 Write property tests for the status history endpoint in `backend/tests/property/test_status_history_properties.py`
    - **Property 1: Audit entry serialization round-trip**
    - **Validates: Requirements 1.2**
    - Generate arbitrary `StatusAuditLog` instances with random status strings and UTC datetimes using Hypothesis
    - Serialize through `StatusAuditLogEntry` Pydantic schema and verify JSON output preserves status and datetime
    - Minimum 100 iterations
    - _Requirements: 1.2_

  - [x] 1.4 Write property test for ordering invariant in `backend/tests/property/test_status_history_properties.py`
    - **Property 2: Status history ordering invariant**
    - **Validates: Requirements 1.3**
    - Generate lists of audit entries with arbitrary `changed_at` datetimes using Hypothesis
    - Insert in random order, call the endpoint, verify response is sorted by `changed_at` ASC
    - Minimum 100 iterations
    - _Requirements: 1.3_

  - [x] 1.5 Write property test for authorized access completeness in `backend/tests/property/test_status_history_properties.py`
    - **Property 3: Authorized access returns complete history**
    - **Validates: Requirements 1.4**
    - Generate N audit entries for a report using Hypothesis
    - Request as owner or admin, verify response contains exactly N entries with matching IDs
    - Minimum 100 iterations
    - _Requirements: 1.4_

- [~] 2. Checkpoint - Backend verification
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Implement frontend API client and StatusHistoryTable component
  - [~] 3.1 Add `getStatusHistory` function to `frontend/src/api/reports.ts`
    - Export an async function that calls `GET /reports/${reportId}/status-history`
    - Use the existing `apiFetch` client from `frontend/src/api/client.ts`
    - Return typed `StatusAuditLogEntry[]` (interface already exists in `frontend/src/types/expenseReport.ts`)
    - _Requirements: 1.1_

  - [~] 3.2 Write unit tests for `getStatusHistory` in `frontend/src/api/__tests__/reports.test.ts`
    - Test that the function calls the correct endpoint URL
    - Test that it returns the parsed response array
    - _Requirements: 1.1_

  - [~] 3.3 Create `StatusHistoryTable` component in `frontend/src/components/StatusHistoryTable.tsx`
    - Accept `entries: StatusAuditLogEntry[]` prop
    - Render MUI `Table` with "Status" and "Date" column headers
    - Render one `TableRow` per entry with `StatusChip` for status and `formatUtcDate(entry.changed_at)` for date
    - Render "—" placeholder when `changed_at` is null (handled by `formatUtcDate`)
    - No sorting, filtering, pagination, or interactive controls
    - No internal scroll container — all rows render inline
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 5.1, 5.2, 5.3, 5.4_

  - [~] 3.4 Write unit tests for `StatusHistoryTable` in `frontend/src/components/__tests__/StatusHistoryTable.test.tsx`
    - Test correct number of rows rendered
    - Test StatusChip rendered with correct status for each row
    - Test formatted dates displayed (not raw ISO strings)
    - Test "—" rendered for null `changed_at`
    - Test "Status" and "Date" column headers present
    - Test no interactive elements (buttons, inputs) in the table
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 5.1, 5.3_

  - [~] 3.5 Write property tests for `StatusHistoryTable` in `frontend/src/components/__tests__/StatusHistoryTable.property.test.tsx`
    - **Property 4: Conditional display threshold**
    - **Validates: Requirements 2.1, 2.2**
    - Generate arrays of `StatusAuditLogEntry` with arbitrary lengths using fast-check
    - Verify table renders if and only if array length >= 2
    - Minimum 100 iterations
    - _Requirements: 2.1, 2.2_

  - [~] 3.6 Write property test for row content completeness in `frontend/src/components/__tests__/StatusHistoryTable.property.test.tsx`
    - **Property 5: Row content completeness**
    - **Validates: Requirements 3.2, 5.2**
    - Generate non-empty arrays of entries using fast-check
    - Verify rendered output contains exactly one row per entry with correct status and formatted date
    - Minimum 100 iterations
    - _Requirements: 3.2, 5.2_

  - [~] 3.7 Write property test for date formatting in `frontend/src/utils/__tests__/formatDate.property.test.ts`
    - **Property 6: Date formatting produces human-readable non-ISO output**
    - **Validates: Requirements 3.4, 3.5, 3.6**
    - Generate valid UTC ISO 8601 datetime strings using fast-check
    - Verify `formatUtcDate` output does NOT match ISO 8601 pattern and contains recognizable date components
    - Minimum 100 iterations
    - _Requirements: 3.4, 3.5, 3.6_

- [~] 4. Checkpoint - Component verification
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Integrate StatusHistoryTable into detail pages
  - [~] 5.1 Integrate into `ExpenseReportDetailPage` in `frontend/src/pages/ExpenseReportDetailPage.tsx`
    - Call `getStatusHistory(reportId)` on mount alongside existing data fetches
    - Store result in local state
    - Render `<Typography variant="h6">Status History</Typography>` heading and `<StatusHistoryTable entries={entries} />` at the bottom of the page when `entries.length >= 2`
    - Handle fetch errors silently (do not block page rendering)
    - _Requirements: 2.1, 2.2, 4.1, 4.2, 4.5_

  - [~] 5.2 Integrate into `EditReportPage` in `frontend/src/pages/EditReportPage.tsx`
    - Call `getStatusHistory(reportId)` on mount alongside existing data fetches
    - Store result in local state
    - Render heading and `<StatusHistoryTable entries={entries} />` **outside** the `<form>` element, at the bottom of the page, when `entries.length >= 2`
    - Re-fetch status history after status transition actions (submit/accept/reject) to reflect new entries
    - Handle fetch errors silently
    - _Requirements: 2.1, 2.2, 2.3, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [~] 5.3 Write unit tests for status history integration in `ExpenseReportDetailPage` in `frontend/src/pages/__tests__/ExpenseReportDetailPage.test.tsx`
    - Test table renders when API returns 2+ entries
    - Test table does not render when API returns 0 or 1 entries
    - Test "Status History" heading is present when table is shown
    - Test table appears after report detail content
    - _Requirements: 2.1, 2.2, 4.1, 4.5_

  - [~] 5.4 Write unit tests for status history integration in `EditReportPage` in `frontend/src/pages/__tests__/EditReportPage.test.tsx`
    - Test table renders when API returns 2+ entries
    - Test table does not render when API returns 0 or 1 entries
    - Test table is rendered outside the form element
    - Test "Status History" heading is present when table is shown
    - Test re-fetch after status transition action
    - _Requirements: 2.1, 2.2, 2.3, 4.2, 4.3, 4.4_

- [~] 6. Final checkpoint - Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All testing tasks are required per project testing strategy — none are marked optional
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties defined in the design document
- Unit and integration tests validate specific examples and edge cases
- The backend endpoint reuses existing `StatusAuditLog` model and `StatusAuditLogEntry` schema — no new models needed
- The frontend reuses existing `StatusChip` component and `formatUtcDate` utility — no new shared utilities needed
- Checkpoints ensure incremental validation between backend and frontend phases

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5"] },
    { "id": 2, "tasks": ["3.1", "3.3"] },
    { "id": 3, "tasks": ["3.2", "3.4", "3.5", "3.6", "3.7"] },
    { "id": 4, "tasks": ["5.1", "5.2"] },
    { "id": 5, "tasks": ["5.3", "5.4"] }
  ]
}
```
