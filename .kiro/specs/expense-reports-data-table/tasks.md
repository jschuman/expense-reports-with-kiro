# Implementation Plan: Expense Reports Data Table

## Overview

Replace the card-based expense reports list on the Dashboard page with an MUI X DataGrid Community component. Implementation proceeds in layers: install dependency → create pure utility functions (with tests) → build cell renderer components → assemble the main table component → integrate into DashboardPage → wire up overlays and actions.

## Tasks

- [x] 1. Install dependency and set up utility module
  - [x] 1.1 Install @mui/x-data-grid package
    - Run `npm install @mui/x-data-grid` in the frontend directory
    - Verify the package is added to `package.json` dependencies
    - _Requirements: 1.1_

  - [x] 1.2 Create `frontend/src/utils/tableUtils.ts` with pure utility functions
    - Implement `formatCurrency(amount: number): string` using `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`
    - Implement `formatDate(date: Date): string` using `Intl.DateTimeFormat` with month short, day numeric, year numeric, hour numeric, minute 2-digit
    - Implement `displayOrPlaceholder(value: string | null | undefined): string` returning "—" for null/undefined/empty/whitespace-only strings
    - Implement `getVisibleColumns(columns: GridColDef[], isAdmin: boolean): GridColDef[]` filtering out `owner_username` for non-admins
    - Implement `getRowActions(report, currentUser): ActionType[]` returning the correct action set based on report status, user role, and ownership
    - Export the `ActionType` type
    - _Requirements: 1.3, 1.4, 1.6, 4.3, 4.4, 5.2, 5.3, 5.4, 5.5_

- [x] 2. Write property-based tests for utility functions
  - [x] 2.1 Write property test for `getRowActions` (Property 1: Row actions correctness)
    - **Property 1: Row actions correctness**
    - Generate arbitrary report status (In Progress, Submitted, Scheduled for Payment, Rejected, unknown), user role (Admin, User), and ownership (owner or not)
    - Assert the returned action set matches the requirements matrix exactly
    - Use `fc.assert(fc.property(...), { numRuns: 100 })`
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5**

  - [x] 2.2 Write property test for `formatCurrency` (Property 2: Currency formatting value preservation)
    - **Property 2: Currency formatting value preservation**
    - Generate arbitrary finite non-negative numbers
    - Assert that parsing the formatted string back (stripping $ and ,) equals the original rounded to 2 decimal places
    - Use `fc.assert(fc.property(...), { numRuns: 100 })`
    - **Validates: Requirements 1.3**

  - [x] 2.3 Write property test for `displayOrPlaceholder` (Property 3: Placeholder logic correctness)
    - **Property 3: Placeholder logic correctness**
    - Generate null, undefined, whitespace-only strings → assert returns "—"
    - Generate strings with at least one non-whitespace character → assert returns the original string
    - Use `fc.assert(fc.property(...), { numRuns: 100 })`
    - **Validates: Requirements 1.6**

  - [x] 2.4 Write property test for `getVisibleColumns` (Property 4: Column visibility correctness)
    - **Property 4: Column visibility correctness**
    - Generate arbitrary column arrays that include an `owner_username` column
    - Assert admin sees all columns including `owner_username`; non-admin sees all columns except `owner_username`; order of other columns is preserved
    - Use `fc.assert(fc.property(...), { numRuns: 100 })`
    - **Validates: Requirements 4.3, 4.4, 4.5**

- [x] 3. Checkpoint - Ensure all property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Build cell renderer components
  - [ ] 4.1 Create `StatusChip` component in `frontend/src/components/StatusChip.tsx`
    - Accept a `status: string` prop
    - Map status to MUI Chip color: "In Progress" → default, "Submitted" → primary, "Scheduled for Payment" → success, "Rejected" → error, any other → default
    - Render an MUI `<Chip>` with the label set to the status string
    - _Requirements: 1.7_

  - [ ] 4.2 Create `ActionCell` component in `frontend/src/components/ActionCell.tsx`
    - Accept `ActionCellProps` (report, currentUser, action handlers)
    - Call `getRowActions()` to determine which buttons to render
    - Render MUI `IconButton` for each action with accessible `aria-label` including the report title (e.g., "Edit Trip to NYC")
    - Wire click handlers to the appropriate action callbacks
    - For Reject, call `onReject(reportId)` which will trigger the RejectDialog in the parent
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 7.4_

- [ ] 5. Write unit tests for cell renderer components
  - [ ] 5.1 Write unit tests for `StatusChip`
    - Test each status value maps to the correct chip color
    - Test unknown status values render with default color
    - Test the chip label displays the status text
    - _Requirements: 1.7_

  - [ ] 5.2 Write unit tests for `ActionCell`
    - Test correct buttons render for owner with "In Progress" status (Edit, Delete, Submit)
    - Test correct buttons render for admin with "Submitted" status (View, Accept, Reject)
    - Test correct buttons render for owner (non-admin) with "Submitted" status (View only)
    - Test correct buttons render for admin with non-"Submitted" status (View only)
    - Test each button click invokes the correct handler with the report ID
    - Test aria-labels include the report title
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 7.4_

- [ ] 6. Build the ExpenseReportsTable component
  - [ ] 6.1 Create `ExpenseReportsTable` component in `frontend/src/components/ExpenseReportsTable.tsx`
    - Accept `ExpenseReportsTableProps` (reports, isLoading, currentUser, action handlers)
    - Define `GridColDef[]` column configuration matching the design (Title, Amount, Status, Owner, Created, Reimbursable, Client, Admin Notes, Actions)
    - Use `getVisibleColumns()` to conditionally exclude Owner column for non-admins
    - Configure DataGrid with `sortingOrder={['asc', 'desc', null]}`
    - Configure Status column as `singleSelect` with valueOptions
    - Configure Reimbursable column as `singleSelect` with boolean valueOptions and valueFormatter
    - Configure Created column with `type: 'dateTime'` and `valueGetter` to parse ISO string to Date
    - Configure Actions column with `sortable: false`, `filterable: false`, `disableColumnMenu: true`
    - Use `renderCell` for Amount (formatCurrency), Status (StatusChip), Created (formatDate), Client/Admin Notes (displayOrPlaceholder), Actions (ActionCell)
    - Configure slot overrides for noRowsOverlay, noResultsOverlay, and loadingOverlay
    - Set loadingOverlay aria-label to "Loading expense reports"
    - Manage RejectDialog open/close state within the component
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1–2.10, 3.1–3.9, 4.1–4.5, 5.1, 5.6, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3_

- [ ] 7. Write unit tests for ExpenseReportsTable
  - [ ] 7.1 Write unit tests for ExpenseReportsTable rendering and behavior
    - Test columns render in correct order (Title, Amount, Status, Owner, Created, Reimbursable, Client, Admin Notes, Actions)
    - Test Amount column displays formatted currency (e.g., "$1,234.56")
    - Test Created column displays formatted date
    - Test Reimbursable column displays "Yes"/"No"
    - Test null Client/Admin Notes display "—" placeholder
    - Test Owner column is visible for admin users
    - Test Owner column is hidden for non-admin users
    - Test loading overlay renders with accessible label when isLoading is true
    - Test EmptyState overlay renders when reports array is empty
    - Test RejectDialog opens when Reject action is triggered
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 4.3, 4.4, 6.1, 6.2, 5.6_

- [ ] 8. Integrate into DashboardPage
  - [ ] 8.1 Replace card-based list with ExpenseReportsTable in DashboardPage
    - Import `ExpenseReportsTable` component
    - Remove or replace the existing `ReportCard` mapping/rendering logic
    - Pass `reports`, `isLoading`, `currentUser` from existing hooks (`useReports`, `useAuth`)
    - Wire action handlers: onSubmit, onAccept, onReject, onEdit, onDelete, onView using existing DashboardPage logic
    - Ensure the existing `ErrorAlert` component still renders above the table for API errors
    - _Requirements: 1.1, 4.1, 4.2, 5.7, 6.1_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All testing tasks are required per project steering rules — none are marked optional
- Each property test validates a specific correctness property from the design document
- The DataGrid handles sorting and filtering internally — no custom sort/filter logic is implemented
- The existing `useReports` hook, `useAuth` hook, `RejectDialog`, and `EmptyState` components are reused without modification
- `@mui/x-data-grid` Community edition is MIT-licensed and integrates with the existing MUI theme

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "id": 3, "tasks": ["4.1", "4.2"] },
    { "id": 4, "tasks": ["5.1", "5.2"] },
    { "id": 5, "tasks": ["6.1"] },
    { "id": 6, "tasks": ["7.1"] },
    { "id": 7, "tasks": ["8.1"] }
  ]
}
```
