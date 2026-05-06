# Implementation Plan: Expense Report Lines

## Overview

Add line-item support to the Expense Report Web App. The implementation proceeds in three phases: (1) backend data model and schemas, (2) backend service layer and API endpoints with full test coverage, (3) frontend types, API module, hooks, pages, and routing. Tests are co-located with the implementation tasks they cover. All test tasks are required.

## Tasks

- [x] 1. Create the `ExpenseLine` ORM model and Alembic migration
  - Create `backend/app/models/expense_line.py` with the `ExpenseLine` class: `id`, `report_id` (FK to `expense_reports.id` with `ondelete="CASCADE"`), `description` (Text, not null), `amount` (Float, not null), `incurred_date` (Date, not null), and a `report` back-reference relationship
  - Add `lines: Mapped[List["ExpenseLine"]]` relationship to `ExpenseReport` in `backend/app/models/expense_report.py` with `cascade="all, delete-orphan"`
  - Remove the `total_amount` column from the `ExpenseReport` ORM model in `backend/app/models/expense_report.py` — it is no longer stored
  - Import `ExpenseLine` in `backend/app/models/__init__.py` so `Base.metadata` is aware of the new model
  - Create a new Alembic migration file `backend/migrations/versions/20260505_0900_003_add_expense_lines.py` (revision `003`, down_revision `002`) that:
    - In `upgrade()`: removes the `total_amount` column from `expense_reports` using `batch_alter_table` (SQLite requires batch mode for column removal); creates the `expense_lines` table with all columns and a FK index on `report_id`
    - In `downgrade()`: drops the `expense_lines` table; re-adds the `total_amount` column to `expense_reports`
  - Delete the existing `backend/expense_reports.db` file and run `alembic upgrade head` from the `backend/` directory to apply the migration to a fresh database
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 5.2_

- [x] 2. Create `ExpenseLine` Pydantic schemas and update `ExpenseReport` schemas
  - [x] 2.1 Create `backend/app/schemas/expense_line.py` with `ExpenseLineCreate` (description min_length=1, amount gt=0, incurred_date), `ExpenseLineUpdate` (all optional, model_validator requiring at least one field), and `ExpenseLineResponse` (id, report_id, description, amount, incurred_date; `from_attributes=True`)
    - _Requirements: 1.1, 2.3, 2.4, 2.5, 2.6, 2.7, 7.5, 7.8_
  - [x] 2.2 Write unit tests for `ExpenseLine` schemas in `backend/tests/unit/test_expense_line_schemas.py`
    - Test `ExpenseLineCreate`: valid payload, missing description, empty description, zero amount, negative amount, missing date, invalid date string
    - Test `ExpenseLineUpdate`: valid partial update (each field individually), all-None payload rejected by model_validator
    - _Requirements: 2.5, 2.6, 2.7, 3.5_
  - [x] 2.3 Remove `total_amount` from `ExpenseReportCreate` and `ExpenseReportUpdate` in `backend/app/schemas/expense_report.py`
    - `ExpenseReportResponse` retains `total_amount` as a read-only computed field
    - Update `report_service.py` to add a `_compute_total(db, report_id)` helper using `func.sum(ExpenseLine.amount)` and call it from `_to_response` in `reports.py` when building each `ExpenseReportResponse`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_

- [x] 3. Write unit tests for `_compute_total` in `backend/tests/unit/test_report_service.py`
  - Test: returns correct sum with multiple lines, returns `0.0` with zero lines
  - _Requirements: 5.1, 5.3_

- [x] 4. Implement `line_service.py`
  - [x] 4.1 Create `backend/app/services/line_service.py` with private helpers `_get_report_or_404`, `_get_line_or_404`, `_assert_owner`, `_assert_editable`, `_assert_read_access`, and public functions `create_line`, `list_lines`, `update_line`, `delete_line`
    - `create_line`: check ownership, check editable status, persist line, commit — no total recalculation needed
    - `list_lines`: check read access (owner or admin), return lines ordered by id
    - `update_line`: check ownership, check editable status, find line, apply partial update via `model_dump(exclude_none=True)`, commit
    - `delete_line`: check ownership, check editable status, find line, delete, commit
    - _Requirements: 1.2, 1.5, 2.4, 3.4, 3.6, 3.7, 4.3, 4.4, 4.5, 8.1, 8.2, 8.3_
  - [x] 4.2 Write unit tests for `line_service` functions in `backend/tests/unit/test_line_service.py`
    - `create_line`: valid creation persists line; 403 for non-owner; 409 for locked status (`Submitted`, `Scheduled for Payment`); 404 for missing report
    - `list_lines`: owner receives lines; admin receives lines for any report; non-owner non-admin receives 403; 404 for missing report
    - `update_line`: valid full update; valid partial update (only provided fields change); 403 for non-owner; 409 for locked status; 404 for missing report; 404 for line not belonging to report
    - `delete_line`: valid deletion removes line; 403 for non-owner; 409 for locked status; 404 for missing line
    - _Requirements: 1.2, 2.4, 3.4, 3.6, 3.7, 4.3, 4.4, 4.5, 8.1, 8.2, 8.3_

- [x] 5. Create the `lines` FastAPI router and register it
  - [x] 5.1 Create `backend/app/routers/lines.py` with four endpoints under `/{report_id}/lines`:
    - `POST /{report_id}/lines` → 201 `ExpenseLineResponse`; delegates to `create_line`
    - `GET /{report_id}/lines` → 200 `List[ExpenseLineResponse]`; delegates to `list_lines`
    - `PUT /{report_id}/lines/{line_id}` → 200 `ExpenseLineResponse`; delegates to `update_line`
    - `DELETE /{report_id}/lines/{line_id}` → 204 No Content; delegates to `delete_line`
    - All endpoints use `get_current_user` dependency
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7, 7.8, 7.9_
  - [x] 5.2 Register the lines router in `backend/app/main.py` with `prefix="/reports"`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [x] 5.3 Write integration tests for all line endpoints in `backend/tests/integration/test_lines.py`
    - Use `httpx.AsyncClient` + `ASGITransport` pattern matching `test_reports.py`
    - `POST /reports/{id}/lines`: 201 success (verify response shape and `GET /reports` shows updated total_amount); 401 unauthenticated; 403 non-owner; 409 locked status (`Submitted`); 409 locked status (`Scheduled for Payment`); 422 missing description; 422 empty description; 422 zero amount; 422 negative amount; 422 missing date; 404 report not found
    - `GET /reports/{id}/lines`: 200 owner (verify list shape); 200 admin (any report); 200 empty list; 401 unauthenticated; 403 non-owner non-admin; 404 report not found
    - `PUT /reports/{id}/lines/{id}`: 200 success (verify updated fields and `GET /reports` shows updated total_amount); 200 partial update; 401 unauthenticated; 403 non-owner; 409 locked status; 422 invalid payload (all-None); 404 report not found; 404 line not found; 404 line belongs to different report
    - `DELETE /reports/{id}/lines/{id}`: 204 success (verify line absent and `GET /reports` shows updated total_amount); 401 unauthenticated; 403 non-owner; 409 locked status; 404 line not found
    - _Requirements: 2.4, 2.5, 2.6, 2.7, 3.4, 3.5, 3.6, 3.7, 4.3, 4.4, 4.5, 5.1, 7.1–7.9, 8.1, 8.2, 8.3_

- [ ] 6. Write backend property-based tests
  - [ ] 6.1 Write property test for Property 1 (line creation round-trip) in `backend/tests/property/test_lines_properties.py`
    - Generate random valid description/amount/date via Hypothesis; POST line; GET lines; assert all fields match
    - `@settings(max_examples=100)`
    - **Property 1: Line creation round-trip preserves all fields**
    - **Validates: Requirements 1.1, 2.4, 7.5**
  - [ ] 6.2 Write property test for Property 2 (invalid creation always rejected)
    - Generate payloads with missing/empty description, non-positive amount, or missing date; assert 422 and line count unchanged
    - `@settings(max_examples=100)`
    - **Property 2: Invalid line creation is always rejected**
    - **Validates: Requirements 2.5, 2.6**
  - [ ] 6.3 Write property test for Property 3 (line update round-trip)
    - Create a line; generate random valid `ExpenseLineUpdate` payload; PUT; GET; assert updated fields match and unchanged fields retain original values
    - `@settings(max_examples=100)`
    - **Property 3: Line update round-trip preserves updated fields**
    - **Validates: Requirements 3.4**
  - [ ] 6.4 Write property test for Property 4 (non-owner mutation forbidden)
    - Create two users; create line as user A; attempt PUT and DELETE as user B (non-admin); assert 403 and line unchanged
    - `@settings(max_examples=100)`
    - **Property 4: Non-owner mutation is always forbidden**
    - **Validates: Requirements 3.6, 4.4, 8.3**
  - [ ] 6.5 Write property test for Property 5 (status locking prevents mutations)
    - Create line; transition report to `Submitted` or `Scheduled for Payment`; attempt POST/PUT/DELETE as owner; assert 409 and lines unchanged
    - `@settings(max_examples=100)`
    - **Property 5: Status locking prevents all line mutations**
    - **Validates: Requirements 3.7, 4.5**
  - [ ] 6.6 Write property test for Property 6 (total amount invariant)
    - Generate N lines with random amounts; after each create/update/delete assert `total_amount == sum(current line amounts)` and `0.0` when no lines remain
    - `@settings(max_examples=100)`
    - **Property 6: Total amount always equals the sum of line amounts**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
  - [ ] 6.7 Write property test for Property 7 (line deletion removes the line)
    - Create line; DELETE; GET lines; assert line absent; assert total_amount updated
    - `@settings(max_examples=100)`
    - **Property 7: Line deletion removes the line**
    - **Validates: Requirements 4.3, 5.1**
  - [ ] 6.8 Write property test for Property 8 (cascade delete removes all lines)
    - Create report with N lines; DELETE report; query DB directly; assert no orphaned `expense_lines` rows
    - `@settings(max_examples=100)`
    - **Property 8: Cascade delete removes all lines**
    - **Validates: Requirements 1.5**
  - [ ] 6.9 Write property test for Property 9 (unauthenticated requests rejected)
    - Call each of the four line endpoints without a session cookie; assert 401 for all
    - `@settings(max_examples=100)`
    - **Property 9: Unauthenticated requests to line endpoints are always rejected**
    - **Validates: Requirements 7.9**
  - [ ] 6.10 Write property test for Property 10 (admin can read lines for any report)
    - Create report as user A; GET lines as admin user; assert 200 and correct list
    - `@settings(max_examples=100)`
    - **Property 10: Admin can read lines for any report**
    - **Validates: Requirements 8.1**
  - [ ] 6.11 Write property test for Property 11 (non-owner non-admin read forbidden)
    - Create report as user A; GET lines as user B (User role, not owner); assert 403
    - `@settings(max_examples=100)`
    - **Property 11: Non-owner non-admin cannot read lines**
    - **Validates: Requirements 8.2**

- [ ] 7. Update existing backend tests broken by `total_amount` removal
  - Find all existing tests in `backend/tests/` that pass `total_amount` in report create or update payloads and remove that field from those payloads
  - Verify all pre-existing backend tests pass after the schema change
  - _Requirements: 5.2, 5.6_

- [ ] 8. Backend checkpoint — ensure all backend tests pass
  - Run `pytest` from the `backend/` directory; all tests must pass with 100% coverage across `backend/app/`
  - Resolve any failures before proceeding to frontend work

- [ ] 9. Update TypeScript types and remove `total_amount` from frontend create/update types
  - [ ] 9.1 Add `ExpenseLineCreate`, `ExpenseLineUpdate`, and `ExpenseLineResponse` interfaces to `frontend/src/types/expenseReport.ts`
    - `ExpenseLineCreate`: `description: string`, `amount: number`, `incurred_date: string` (ISO 8601)
    - `ExpenseLineUpdate`: all fields optional
    - `ExpenseLineResponse`: `id`, `report_id`, `description`, `amount`, `incurred_date`
    - _Requirements: 1.1, 2.3, 3.3, 7.5_
  - [ ] 9.2 Remove `total_amount` from `ExpenseReportCreate` and `ExpenseReportUpdate` TypeScript interfaces in `frontend/src/types/expenseReport.ts`
    - `ExpenseReportResponse` retains `total_amount` as a read-only field
    - _Requirements: 5.6_

- [ ] 10. Create the `expenseLines` API module and its unit tests
  - [ ] 10.1 Create `frontend/src/api/expenseLines.ts` with `listLines`, `createLine`, `updateLine`, and `deleteLine` functions
    - All functions use `apiFetch` from `client.ts`
    - `deleteLine` handles 204 No Content (no JSON body), following the same pattern as `deleteReport` in `reports.ts`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [ ] 10.2 Write Vitest unit tests for `expenseLines.ts`
    - Mock `apiFetch`; test each function's URL construction, HTTP method, and request body
    - Test `deleteLine` handles the void/204 response correctly
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 11. Create the `useExpenseLines` hook and its unit tests
  - [ ] 11.1 Create `frontend/src/hooks/useExpenseLines.ts` returning `{ lines, isLoading, error, refetch, handleCreate, handleUpdate, handleDelete }`
    - Fetch lines on mount and after each mutation via `refetch`
    - Expose `refetch` so `ExpenseReportDetailPage` can refresh the report's `total_amount` after a line mutation
    - _Requirements: 2.4, 2.8, 3.4, 3.8, 4.3, 5.4_
  - [ ] 11.2 Write Vitest unit tests for `useExpenseLines`
    - Mock the `expenseLines` API module
    - Test loading state on mount, successful fetch populates `lines`, error state on API failure
    - Test `handleCreate` calls `createLine` and triggers refetch
    - Test `handleUpdate` calls `updateLine` and triggers refetch
    - Test `handleDelete` calls `deleteLine` and triggers refetch
    - _Requirements: 2.4, 2.8, 3.4, 3.8, 4.3_

- [ ] 12. Implement the `formatIncurredDate` utility and its unit tests
  - [ ] 12.1 Implement `formatIncurredDate(isoDate: string): string` (can live in `frontend/src/utils/formatDate.ts` or inline in the detail page, consistent with project conventions)
    - Parse as local date: `const [year, month, day] = isoDate.split('-').map(Number); const d = new Date(year, month - 1, day);`
    - Format with `new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(d)`
    - _Requirements: 6.4_
  - [ ] 12.2 Write Vitest unit tests for `formatIncurredDate` with 100% coverage
    - Test a known date string returns the expected human-readable format (e.g. `"2026-04-23"` → `"Apr 23, 2026"`)
    - Test month boundary dates (Jan 1, Dec 31)
    - Test that no raw ISO string (`"YYYY-MM-DD"`) is ever returned
    - Test that the date is not shifted by timezone offset (local date parsing)
    - _Requirements: 6.4_

- [ ] 13. Create `ExpenseReportDetailPage` and its unit tests
  - [ ] 13.1 Create `frontend/src/pages/ExpenseReportDetailPage.tsx`
    - Fetch the report (by `reportId` from URL params) and lines via `useExpenseLines(reportId)`
    - Display report header: title, status badge (MUI `Chip`), description, `total_amount` (read-only, currency-formatted), reimbursable/client info
    - Render `Expense_Lines_Section` as an MUI `Table` with columns: Description, Amount (currency-formatted), Date (`formatIncurredDate`), and Actions (conditionally shown)
    - Show Add button and per-row Edit/Delete `IconButton`s only when `report.status` is `"In Progress"` or `"Rejected"` AND `currentUser.id === report.owner_id`
    - Show empty-state `Typography` message when `lines.length === 0`
    - Show subtotal row in `TableFooter` summing all line amounts, consistent with `report.total_amount`
    - Add button navigates to `/reports/${reportId}/lines/new`
    - Edit button navigates to `/reports/${reportId}/lines/${lineId}/edit`
    - Delete button opens a MUI `Dialog` for confirmation; on confirm calls `handleDelete`; on cancel closes dialog
    - After successful delete, stay on page and refresh lines list
    - Display `ErrorAlert` for API errors; display inline `Alert` for 403 and 404 responses
    - _Requirements: 2.1, 2.2, 2.8, 3.1, 3.2, 3.8, 4.1, 4.2, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  - [ ] 13.2 Write Vitest unit tests for `ExpenseReportDetailPage`
    - Render with mock report (`In Progress`, owner = current user): verify table columns present, Add button visible, Edit/Delete buttons visible per row
    - Render with mock report (`Submitted`, owner = current user): verify Add/Edit/Delete buttons absent
    - Render with mock report (`In Progress`, owner ≠ current user): verify Add/Edit/Delete buttons absent
    - Render with zero lines: verify empty-state message displayed
    - Render with multiple lines: verify `formatIncurredDate` output shown (not raw ISO), amounts currency-formatted, subtotal row present
    - Delete flow: click Delete → dialog appears; click Cancel → dialog closes, no API call; click Confirm → `handleDelete` called
    - _Requirements: 2.1, 3.1, 4.1, 4.2, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [ ] 14. Create `ExpenseLineDetailPage` and its unit tests
  - [ ] 14.1 Create `frontend/src/pages/ExpenseLineDetailPage.tsx` operating in create and edit modes
    - **Create mode** (`/reports/:reportId/lines/new`): empty form; on submit calls `createLine(reportId, formData)`; on success navigates to `/reports/${reportId}`
    - **Edit mode** (`/reports/:reportId/lines/:lineId/edit`): fetch lines via `useExpenseLines`, find matching line, pre-populate form; on submit calls `updateLine(reportId, lineId, formData)`; on success navigates to `/reports/${reportId}`
    - Form fields: `description` (MUI `TextField`, required), `amount` (MUI `TextField` type="number", required, must be > 0), `incurred_date` (MUI `DatePicker` or `<input type="date">`, required, valid calendar date)
    - Client-side validation mirrors Pydantic rules; server 422 errors displayed as field-level messages; other server errors (409) displayed as an `Alert`
    - Cancel button navigates back to `/reports/${reportId}` without submitting
    - Show `CircularProgress` while loading in edit mode
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.2, 3.3, 3.4, 3.5, 3.8_
  - [ ] 14.2 Write Vitest unit tests for `ExpenseLineDetailPage`
    - Render in create mode: all fields empty, submit button present, cancel navigates back
    - Render in edit mode: form pre-populated with existing line values
    - Submit in create mode with valid data: `createLine` called with correct payload; on success navigates to detail page
    - Submit in edit mode with valid data: `updateLine` called with correct payload; on success navigates to detail page
    - Submit with empty description: client-side error shown, no API call
    - Submit with zero amount: client-side error shown, no API call
    - Submit with negative amount: client-side error shown, no API call
    - Server 422 response: field-level error messages displayed
    - Server 409 response: `Alert` with server detail message displayed
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.3, 3.4, 3.5, 3.8_

- [ ] 15. Add new routes to `App.tsx` and update existing frontend tests
  - [ ] 15.1 Add three new protected routes to `frontend/src/App.tsx`:
    - `/reports/:reportId` → `<ExpenseReportDetailPage />`
    - `/reports/:reportId/lines/new` → `<ExpenseLineDetailPage />`
    - `/reports/:reportId/lines/:lineId/edit` → `<ExpenseLineDetailPage />`
    - Retain the existing `/reports/:reportId/edit` route unchanged
    - _Requirements: 2.2, 3.2_
  - [ ] 15.2 Update existing frontend tests that pass `total_amount` in report create or update payloads
    - Remove `total_amount` from those payloads to match the updated `ExpenseReportCreate` and `ExpenseReportUpdate` types
    - Verify all pre-existing frontend tests pass after the type change
    - _Requirements: 5.6_

- [ ] 16. Final checkpoint — ensure all tests pass
  - Run `pytest` from `backend/` and verify 100% coverage across `backend/app/`
  - Run `npm test -- --run` from `frontend/` and verify 100% coverage for all utility functions in `frontend/src/`
  - Resolve any remaining failures before considering the feature complete

## Notes

- All test tasks are required — no test tasks are marked optional, per workspace testing strategy
- Backend tasks (1–8) must be completed before frontend tasks (9–16)
- Tests are co-located with the implementation tasks they cover, not grouped at the end
- Property tests use `@settings(max_examples=100)` and pre-compute bcrypt hashes at module level to keep execution time reasonable (following the pattern in `test_reports_properties.py`)
- `total_amount` is NOT stored in the database — it is computed on the fly via `SUM(expense_lines.amount)` at read time in `report_service.py`; no `recalculate_total` or `db.flush()` timing concerns exist
- `incurred_date` is a calendar date (no time component); parse as local date on the frontend to avoid UTC offset shifting the displayed day
- The database will be reset as part of this feature deployment — no data migration is required
