# Implementation Plan: Expense Report Status Lifecycle

## Overview

Implement the full four-state status lifecycle (`In Progress → Submitted → Scheduled for Payment`, with a `Rejected → Submitted` resubmission path) for expense reports. This covers the Alembic migration, new ORM model, status service, updated report service, five new API endpoints, a `get_current_admin` dependency, new Pydantic schemas, updated frontend types and API client, a new `RejectDialog` component, and updated `ReportCard`, `DashboardPage`, and `useReports` hook — along with all unit, integration, and property-based tests.

## Tasks

- [x] 1. Database migration and ORM model setup
  - [x] 1.1 Create the `StatusAuditLog` ORM model
    - Create `backend/app/models/status_audit_log.py` with `id`, `expense_report_id` (FK → `expense_reports.id`, indexed), `status` (String 50), `changed_at` (DateTime UTC), and a `report` back-reference relationship to `ExpenseReport`
    - _Requirements: 11.1, 11.2, 11.6_

  - [x] 1.2 Update `ExpenseReport` model and `models/__init__.py`
    - Change the `status` column default from `"Pending"` to `"In Progress"` in `backend/app/models/expense_report.py`
    - Add the `audit_log` back-reference relationship to `StatusAuditLog`
    - Import `StatusAuditLog` in `backend/app/models/__init__.py` so `Base.metadata.create_all()` discovers the new table
    - _Requirements: 1.1, 11.4_

  - [x] 1.3 Write the Alembic migration
    - Create `backend/migrations/versions/YYYYMMDD_HHMM_add_status_lifecycle.py`
    - Step 1: Alter `expense_reports.status` server default from `"Pending"` to `"In Progress"`
    - Step 2: `UPDATE expense_reports SET status = 'In Progress' WHERE status = 'Pending'`
    - Step 3: Create `status_audit_log` table with all columns and the FK index
    - Step 4: Backfill one audit entry per existing report using `created_at` as `changed_at` and `"In Progress"` as `status`
    - _Requirements: 1.1, 11.1, 11.4, 11.6_

- [x] 2. Backend schemas and dependency
  - [x] 2.1 Add new Pydantic schemas to `backend/app/schemas/expense_report.py`
    - Add `RejectRequest` with `admin_notes: str = Field(..., min_length=1)`
    - Add `ExpenseReportUpdate` with all optional fields (`title`, `description`, `total_amount`, `reimbursable_from_client`, `client`) and the `validate_client` model validator
    - Add `StatusAuditLogEntry` with `id`, `expense_report_id`, `status`, `changed_at` and `model_config = ConfigDict(from_attributes=True)`
    - _Requirements: 6.1, 6.2, 2.1, 7.1_

  - [x] 2.2 Write unit tests for new schemas in `backend/tests/unit/test_schemas.py`
    - Test `RejectRequest` rejects empty string and whitespace-only `admin_notes`
    - Test `RejectRequest` accepts a non-empty string
    - Test `ExpenseReportUpdate` rejects `total_amount <= 0`
    - Test `ExpenseReportUpdate` rejects `reimbursable_from_client=True` with no `client`
    - Test `ExpenseReportUpdate` rejects an invalid `client` value
    - Test `ExpenseReportUpdate` accepts a valid partial update
    - _Requirements: 6.1, 6.2, 2.1_

  - [x] 2.3 Add `get_current_admin` dependency to `backend/app/dependencies.py`
    - Implement `get_current_admin` by calling `get_current_user` and checking `user.role.name == "Admin"`, raising `HTTPException(403)` if not
    - _Requirements: 5.4, 6.6_

  - [x] 2.4 Write unit tests for `get_current_admin` in `backend/tests/unit/test_dependencies.py`
    - Test that a user with `role.name == "Admin"` passes through
    - Test that a user with `role.name == "User"` raises 403
    - _Requirements: 5.4, 6.6_

- [ ] 3. Status service implementation
  - [ ] 3.1 Create `backend/app/services/status_service.py` with `submit_report()`
    - Load report by `report_id`, raise 404 if not found
    - Raise 403 if `current_user.id != report.user_id`
    - Raise 409 if `report.status` is not `"In Progress"` or `"Rejected"`
    - Raise 422 if required fields (`title`, `total_amount`) are not populated
    - Transition status to `"Submitted"`, write a `StatusAuditLog` entry with `datetime.now(timezone.utc)`, commit atomically, return updated report
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 7.5, 9.1, 9.2, 11.2, 11.3, 11.5_

  - [ ] 3.2 Add `accept_report()` to `status_service.py`
    - Load report, raise 404 if not found
    - Raise 403 if `current_user.role.name != "Admin"`
    - Raise 409 if `report.status != "Submitted"`
    - Transition status to `"Scheduled for Payment"`, write audit entry atomically, return updated report
    - _Requirements: 5.2, 5.3, 5.4, 9.1, 9.2, 11.2, 11.3, 11.5_

  - [ ] 3.3 Add `reject_report()` to `status_service.py`
    - Load report, raise 404 if not found
    - Raise 403 if `current_user.role.name != "Admin"`
    - Raise 409 if `report.status != "Submitted"`
    - Persist `admin_notes` on the report, transition status to `"Rejected"`, write audit entry atomically, return updated report
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 9.1, 9.2, 11.2, 11.3, 11.5_

  - [ ] 3.4 Write unit tests for `status_service.py` in `backend/tests/unit/test_status_service.py`
    - Test `submit_report` success from `"In Progress"` → `"Submitted"` with audit entry written
    - Test `submit_report` success from `"Rejected"` → `"Submitted"` with audit entry written
    - Test `submit_report` raises 403 for non-owner
    - Test `submit_report` raises 409 from `"Submitted"` state
    - Test `submit_report` raises 409 from `"Scheduled for Payment"` state
    - Test `accept_report` success from `"Submitted"` → `"Scheduled for Payment"` with audit entry written
    - Test `accept_report` raises 403 for non-admin user
    - Test `accept_report` raises 409 from `"In Progress"` state
    - Test `reject_report` success from `"Submitted"` → `"Rejected"` with `admin_notes` persisted and audit entry written
    - Test `reject_report` raises 403 for non-admin user
    - Test `reject_report` raises 409 from `"In Progress"` state
    - _Requirements: 3.2–3.6, 5.2–5.4, 6.1–6.6, 9.1, 9.2, 11.2_

  - [ ] 3.5 Write property test for status transition validity in `backend/tests/property/test_status_lifecycle_properties.py`
    - **Property 1: Status Transition Validity**
    - Use `@given(status=st.sampled_from([...]), action=st.sampled_from(["submit", "accept", "reject"]))` to generate all (state, action) combinations
    - Assert that undefined transitions return 409 and leave the report status unchanged
    - Run minimum 100 iterations
    - **Validates: Requirements 9.1, 9.2, 3.5, 5.3, 6.5**

  - [ ] 3.6 Write property test for audit log completeness
    - **Property 2: Audit Log Completeness**
    - Use `@given(transitions=st.lists(st.sampled_from(VALID_TRANSITION_SEQUENCES), min_size=1, max_size=5))` to generate valid transition sequences
    - Assert that the number of audit log entries equals the number of status changes applied, and each entry has the correct `expense_report_id`, `status`, and UTC `changed_at`
    - Run minimum 100 iterations
    - **Validates: Requirements 11.1, 11.2, 11.4, 11.6**

  - [ ] 3.7 Write property test for submit transition correctness
    - **Property 7: Submit Transition Correctness**
    - Use `@given(initial_status=st.sampled_from(["In Progress", "Rejected"]), report_data=valid_report_strategy())` to generate valid submit scenarios
    - Assert that after a successful submit the status is `"Submitted"` and exactly one new audit entry was written
    - Run minimum 100 iterations
    - **Validates: Requirements 3.3, 7.5, 11.2**

- [ ] 4. Report service update
  - [ ] 4.1 Update `create_report()` in `backend/app/services/report_service.py`
    - Change `status="Pending"` to `status="In Progress"`
    - Write an initial `StatusAuditLog` entry (status `"In Progress"`, `changed_at=datetime.now(timezone.utc)`) in the same transaction as the report insert
    - _Requirements: 1.1, 11.1, 11.3, 11.5, 11.6_

  - [ ] 4.2 Add `update_report()` to `report_service.py`
    - Accept `db`, `report_id`, `data: ExpenseReportUpdate`, `current_user`
    - Raise 404 if report not found
    - Raise 403 if `current_user.id != report.user_id`
    - Raise 409 if `report.status` is not `"In Progress"` or `"Rejected"`
    - Apply only the non-`None` fields from `data` to the report, commit, and return the updated report
    - _Requirements: 2.1, 2.4, 4.1, 7.1, 7.6, 8.1_

  - [ ] 4.3 Add `delete_report()` to `report_service.py`
    - Accept `db`, `report_id`, `current_user`
    - Raise 404 if report not found
    - Raise 403 if `current_user.id != report.user_id`
    - Raise 409 if `report.status` is not `"In Progress"` or `"Rejected"`
    - Delete the report and commit
    - _Requirements: 2.2, 2.5, 4.2, 7.2, 8.2_

  - [ ] 4.4 Update unit tests for `report_service.py` in `backend/tests/unit/test_report_service.py`
    - Test `create_report` sets status to `"In Progress"` and writes one audit entry
    - Test `update_report` success for `"In Progress"` state
    - Test `update_report` success for `"Rejected"` state
    - Test `update_report` raises 403 for non-owner
    - Test `update_report` raises 409 for `"Submitted"` state
    - Test `update_report` raises 409 for `"Scheduled for Payment"` state
    - Test `delete_report` success for `"In Progress"` state
    - Test `delete_report` success for `"Rejected"` state
    - Test `delete_report` raises 403 for non-owner
    - Test `delete_report` raises 409 for `"Submitted"` state
    - Test `delete_report` raises 409 for `"Scheduled for Payment"` state
    - _Requirements: 1.1, 2.1, 2.2, 2.4, 2.5, 4.1, 4.2, 7.1, 7.2, 7.6, 8.1, 8.2, 11.1_

  - [ ] 4.5 Write property test for owner-only edit and delete enforcement
    - **Property 3: Owner-Only Edit and Delete Enforcement**
    - Use `@given(report_data=report_strategy(), non_owner=user_strategy())` to generate editable reports with non-owner users
    - Assert that update and delete attempts by non-owners return 403 and leave the report unchanged
    - Run minimum 100 iterations
    - **Validates: Requirements 2.4, 2.5, 7.6**

  - [ ] 4.6 Write property test for read-only state enforcement
    - **Property 6: Read-Only State Enforcement**
    - Use `@given(status=st.sampled_from(["Submitted", "Scheduled for Payment"]), update_data=report_update_strategy())` to generate read-only state scenarios
    - Assert that update and delete attempts on read-only reports return 409 and leave the report unchanged
    - Run minimum 100 iterations
    - **Validates: Requirements 4.1, 4.2, 8.1, 8.2**

- [ ] 5. Checkpoint — backend service layer complete
  - Ensure all backend unit and property tests pass before proceeding to router changes. Run `pytest backend/tests/unit/ backend/tests/property/` and fix any failures.

- [ ] 6. New API endpoints
  - [ ] 6.1 Add `POST /reports/{id}/submit` endpoint to `backend/app/routers/reports.py`
    - Inject `current_user` via `get_current_user`, delegate to `status_service.submit_report()`
    - Return `ExpenseReportResponse` on 200
    - _Requirements: 3.2, 3.3, 3.5, 3.6_

  - [ ] 6.2 Add `POST /reports/{id}/accept` endpoint
    - Inject `current_user` via `get_current_admin`, delegate to `status_service.accept_report()`
    - Return `ExpenseReportResponse` on 200
    - _Requirements: 5.2, 5.3, 5.4_

  - [ ] 6.3 Add `POST /reports/{id}/reject` endpoint
    - Accept `RejectRequest` body, inject `current_user` via `get_current_admin`, delegate to `status_service.reject_report()`
    - Return `ExpenseReportResponse` on 200
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ] 6.4 Add `PUT /reports/{id}` endpoint
    - Accept `ExpenseReportUpdate` body, inject `current_user` via `get_current_user`, delegate to `report_service.update_report()`
    - Return `ExpenseReportResponse` on 200
    - _Requirements: 2.1, 2.4, 4.1, 7.1, 7.6_

  - [ ] 6.5 Add `DELETE /reports/{id}` endpoint
    - Inject `current_user` via `get_current_user`, delegate to `report_service.delete_report()`
    - Return 204 No Content on success
    - _Requirements: 2.2, 2.5, 4.2, 7.2, 8.2_

  - [ ] 6.6 Write integration tests for `POST /reports/{id}/submit` in `backend/tests/integration/`
    - Test 200 success: owner submits an `"In Progress"` report → status becomes `"Submitted"`
    - Test 200 success: owner resubmits a `"Rejected"` report → status becomes `"Submitted"`
    - Test 403: non-owner attempt returns 403
    - Test 409: attempt on `"Submitted"` report returns 409
    - Test 409: attempt on `"Scheduled for Payment"` report returns 409
    - Test 404: non-existent report returns 404
    - _Requirements: 3.2, 3.3, 3.5, 3.6, 7.5_

  - [ ] 6.7 Write integration tests for `POST /reports/{id}/accept`
    - Test 200 success: admin accepts a `"Submitted"` report → status becomes `"Scheduled for Payment"`
    - Test 403: non-admin user returns 403
    - Test 409: attempt on `"In Progress"` report returns 409
    - Test 404: non-existent report returns 404
    - _Requirements: 5.2, 5.3, 5.4_

  - [ ] 6.8 Write integration tests for `POST /reports/{id}/reject`
    - Test 200 success: admin rejects a `"Submitted"` report with valid `admin_notes` → status becomes `"Rejected"` and `admin_notes` persisted
    - Test 403: non-admin user returns 403
    - Test 409: attempt on `"In Progress"` report returns 409
    - Test 422: empty `admin_notes` returns 422
    - Test 422: missing `admin_notes` returns 422
    - Test 404: non-existent report returns 404
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ] 6.9 Write integration tests for `PUT /reports/{id}`
    - Test 200 success: owner updates an `"In Progress"` report
    - Test 200 success: owner updates a `"Rejected"` report
    - Test 403: non-owner returns 403
    - Test 409: attempt on `"Submitted"` report returns 409
    - Test 409: attempt on `"Scheduled for Payment"` report returns 409
    - Test 422: `total_amount <= 0` returns 422
    - Test 404: non-existent report returns 404
    - _Requirements: 2.1, 2.4, 4.1, 7.1, 7.6, 8.1_

  - [ ] 6.10 Write integration tests for `DELETE /reports/{id}`
    - Test 204 success: owner deletes an `"In Progress"` report
    - Test 204 success: owner deletes a `"Rejected"` report
    - Test 403: non-owner returns 403
    - Test 409: attempt on `"Submitted"` report returns 409
    - Test 409: attempt on `"Scheduled for Payment"` report returns 409
    - Test 404: non-existent report returns 404
    - _Requirements: 2.2, 2.5, 4.2, 7.2, 8.2_

  - [ ] 6.11 Write property test for admin-only accept and reject enforcement
    - **Property 4: Admin-Only Accept and Reject Enforcement**
    - Use `@given(report_data=submitted_report_strategy(), non_admin=non_admin_user_strategy())` to generate submitted reports with non-admin users
    - Assert that accept and reject attempts by non-admins return 403 and leave the report unchanged
    - Run minimum 100 iterations
    - **Validates: Requirements 5.4, 6.6**

  - [ ] 6.12 Write property test for reject requires non-empty admin notes
    - **Property 5: Reject Requires Non-Empty Admin Notes**
    - Use `@given(notes=st.one_of(st.just(""), st.just("   "), st.text(alphabet=st.characters(whitelist_categories=("Zs",)))))` to generate blank/whitespace notes
    - Assert that reject requests with blank notes return 422 and do not change the report status
    - Run minimum 100 iterations
    - **Validates: Requirements 6.1, 6.2**

- [ ] 7. Checkpoint — backend API complete
  - Ensure all backend unit, property, and integration tests pass. Run `pytest` from the `backend/` directory and fix any failures.

- [ ] 8. Frontend types and API client
  - [ ] 8.1 Update `frontend/src/types/expenseReport.ts`
    - Add `ExpenseReportUpdate` interface with all optional fields matching the backend schema
    - Add `StatusAuditLogEntry` interface with `id`, `expense_report_id`, `status`, `changed_at` (ISO 8601 string)
    - _Requirements: 2.1, 7.1, 11.6_

  - [ ] 8.2 Update `frontend/src/types/auth.ts`
    - Add `role: string` field to `UserResponse` interface
    - _Requirements: 5.1, 5.4, 6.6_

  - [ ] 8.3 Add new API functions to `frontend/src/api/reports.ts`
    - Add `submitReport(reportId: number): Promise<ExpenseReportResponse>`
    - Add `acceptReport(reportId: number): Promise<ExpenseReportResponse>`
    - Add `rejectReport(reportId: number, adminNotes: string): Promise<ExpenseReportResponse>`
    - Add `updateReport(reportId: number, data: ExpenseReportUpdate): Promise<ExpenseReportResponse>`
    - Add `deleteReport(reportId: number): Promise<void>`
    - _Requirements: 3.3, 5.2, 6.3, 2.1, 2.2_

  - [ ] 8.4 Write unit tests for the new API functions in `frontend/src/api/reports.test.ts`
    - Test `submitReport` calls `POST /reports/{id}/submit` and returns the response
    - Test `acceptReport` calls `POST /reports/{id}/accept` and returns the response
    - Test `rejectReport` calls `POST /reports/{id}/reject` with `{ admin_notes }` body and returns the response
    - Test `updateReport` calls `PUT /reports/{id}` with the update body and returns the response
    - Test `deleteReport` calls `DELETE /reports/{id}` and resolves void on 204
    - _Requirements: 3.3, 5.2, 6.3, 2.1, 2.2_

- [ ] 9. `useReports` hook update
  - [ ] 9.1 Add action handlers to `frontend/src/hooks/useReports.ts`
    - Add `handleSubmit(reportId: number)`: calls `submitReport`, updates local state on success
    - Add `handleAccept(reportId: number)`: calls `acceptReport`, updates local state on success
    - Add `handleReject(reportId: number, adminNotes: string)`: calls `rejectReport`, updates local state on success
    - Add `handleUpdate(reportId: number, data: ExpenseReportUpdate)`: calls `updateReport`, updates local state on success
    - Add `handleDelete(reportId: number)`: calls `deleteReport`, removes report from local state on success
    - _Requirements: 3.3, 5.2, 6.3, 2.1, 2.2_

  - [ ] 9.2 Update unit tests for `useReports` in `frontend/src/hooks/useReports.test.ts`
    - Test `handleSubmit` updates the matching report's status in local state on success
    - Test `handleAccept` updates the matching report's status in local state on success
    - Test `handleReject` updates the matching report's status and `admin_notes` in local state on success
    - Test `handleUpdate` updates the matching report's fields in local state on success
    - Test `handleDelete` removes the report from local state on success
    - _Requirements: 3.3, 5.2, 6.3, 2.1, 2.2_

- [ ] 10. `RejectDialog` component
  - [ ] 10.1 Create `frontend/src/components/RejectDialog.tsx`
    - Implement an MUI `Dialog` that accepts `open`, `onClose`, and `onConfirm(adminNotes: string)` props
    - Render a controlled `TextField` for `admin_notes`
    - Disable the Confirm button when `admin_notes.trim()` is empty
    - Call `onConfirm(adminNotes)` on Confirm click and reset state; call `onClose` on Cancel
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ] 10.2 Write unit tests for `RejectDialog` in `frontend/src/components/__tests__/RejectDialog.test.tsx`
    - Test Confirm button is disabled when `admin_notes` is empty
    - Test Confirm button is disabled when `admin_notes` is whitespace only
    - Test Confirm button is enabled when `admin_notes` is non-empty
    - Test clicking Confirm calls `onConfirm` with the trimmed notes value
    - Test clicking Cancel calls `onClose` without calling `onConfirm`
    - _Requirements: 6.1, 6.2_

- [ ] 11. `ReportCard` component update
  - [ ] 11.1 Update `frontend/src/components/ReportCard.tsx`
    - Add `currentUser: UserResponse` prop
    - Render a colored MUI `Chip` for the report status (distinct color per status value)
    - Display `admin_notes` prominently when `report.status === "Rejected"`
    - Render action buttons conditionally based on `report.status` and `currentUser.role`:
      - `"In Progress"` + owner: Edit, Delete, Submit buttons
      - `"Submitted"` + admin: Accept, Reject buttons (Reject opens `RejectDialog`)
      - `"Rejected"` + owner: Edit, Delete, Submit buttons
      - `"Submitted"` or `"Scheduled for Payment"` + owner: no action buttons
    - Wire button clicks to `onSubmit`, `onAccept`, `onReject`, `onEdit`, `onDelete` callback props
    - _Requirements: 2.3, 3.1, 4.3, 5.1, 7.3, 7.4, 8.3, 10.1, 10.3_

  - [ ] 11.2 Update unit tests for `ReportCard` in `frontend/src/components/__tests__/ReportCard.test.tsx`
    - Test Submit button is shown for owner when status is `"In Progress"`
    - Test Edit and Delete buttons are shown for owner when status is `"In Progress"`
    - Test no action buttons are shown for owner when status is `"Submitted"`
    - Test Accept and Reject buttons are shown for admin when status is `"Submitted"`
    - Test Edit, Delete, and Submit buttons are shown for owner when status is `"Rejected"`
    - Test no action buttons are shown for any user when status is `"Scheduled for Payment"`
    - Test `admin_notes` text is displayed when status is `"Rejected"`
    - Test `admin_notes` text is not displayed when status is not `"Rejected"`
    - Test status chip renders the correct label for each status value
    - _Requirements: 2.3, 3.1, 4.3, 5.1, 7.3, 7.4, 8.3, 10.1, 10.3_

  - [ ] 11.3 Write property test for dashboard controls matching status and role
    - **Property 8: Dashboard Controls Match Status and Role**
    - Use `@given(report=report_strategy(), user_role=st.sampled_from(["Admin", "User"]))` to generate all (status, role) combinations
    - Render `ReportCard` with each combination and assert that the set of visible action buttons exactly matches the permitted controls — no permitted action hidden, no forbidden action shown
    - Run minimum 100 iterations
    - **Validates: Requirements 2.3, 3.1, 4.3, 5.1, 7.3, 7.4, 8.3, 10.1**

- [ ] 12. `DashboardPage` update
  - [ ] 12.1 Update `frontend/src/pages/DashboardPage.tsx`
    - Read `currentUser` from the auth context
    - Pass `currentUser` to each `ReportCard` instance
    - Wire `onSubmit`, `onAccept`, `onReject`, `onEdit`, `onDelete` props on `ReportCard` to the corresponding `useReports` action handlers
    - Trigger a refetch or apply optimistic state update after each action completes
    - _Requirements: 2.3, 3.1, 4.3, 5.1, 7.3, 7.4, 8.3, 10.1_

  - [ ] 12.2 Update integration tests for `DashboardPage` in `frontend/src/pages/__tests__/DashboardPage.test.tsx`
    - Test that `currentUser` is passed to each rendered `ReportCard`
    - Test that clicking the Submit button on a card calls `handleSubmit` with the correct report ID
    - Test that clicking the Accept button on a card calls `handleAccept` with the correct report ID
    - Test that confirming the Reject dialog calls `handleReject` with the correct report ID and notes
    - Test that clicking the Delete button on a card calls `handleDelete` with the correct report ID
    - _Requirements: 2.3, 3.1, 5.1, 6.3, 10.1_

- [ ] 13. Final checkpoint — all tests pass
  - Run the full backend test suite: `pytest` from `backend/`
  - Run the full frontend test suite: `npm test -- --run` from `frontend/`
  - Ensure all tests pass and fix any remaining failures before considering the feature complete.

## Notes

- All testing tasks are required and must not be skipped
- Property-based tests use Hypothesis (backend) and must run a minimum of 100 iterations each
- Frontend property test (Property 8) uses Vitest with a property-testing approach over all (status, role) combinations
- All `changed_at` timestamps must be generated server-side with `datetime.now(timezone.utc)` — never trust client-supplied timestamps
- The `get_current_admin` dependency must be used on accept and reject endpoints; `get_current_user` on submit, update, and delete
- Atomic transactions: status change + audit log write must commit together or both roll back (Requirement 11.5)
- Tasks build incrementally: migration → models → schemas → services → routes → frontend types → API client → hooks → components → page
