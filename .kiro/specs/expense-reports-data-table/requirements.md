# Requirements Document

## Introduction

Replace the existing card-based expense reports list on the Dashboard page with a data table (for both Admin and User roles). The table displays all fields currently shown in the ReportCard component, with column-level sorting and type-appropriate filtering. This is a frontend-only change — no backend modifications are required. The implementation uses MUI X DataGrid Community (`@mui/x-data-grid`) which provides built-in sorting and filtering capabilities.

## Glossary

- **Data_Table**: An MUI X DataGrid Community component that renders expense reports as rows with sortable, filterable columns.
- **Column_Filter**: A per-column filter control provided by DataGrid's built-in filtering system. The filter operator type matches the column's data type (text contains, numeric comparison, date comparison, or selection list).
- **Sort_Indicator**: A visual affordance (arrow icon) on a column header indicating the current sort direction (ascending, descending, or none), provided by DataGrid's built-in sorting.
- **Expense_Report**: A record with id, title, description, total_amount, status, owner_username, created_at, reimbursable_from_client, client, and admin_notes.
- **Admin**: A user with the "Admin" role who sees all expense reports system-wide.
- **User**: A user with the "User" role who sees only their own expense reports.

## Requirements

### Requirement 1: Data Table Rendering

**User Story:** As a user (Admin or User role), I want to see expense reports displayed in a data table instead of cards, so that I can scan and compare reports more efficiently.

#### Acceptance Criteria

1. WHEN the Dashboard page loads, THE Data_Table SHALL render expense reports as rows with one row per report.
2. THE Data_Table SHALL display the following columns in left-to-right order: Title, Amount, Status, Owner, Created, Reimbursable, Client, and Admin Notes.
3. THE Data_Table SHALL format the Amount column as US currency with two decimal places and thousands separators (e.g., "$1,234.56").
4. THE Data_Table SHALL format the Created column as a human-readable localized date-time string (e.g., "Apr 23, 2026, 5:00 PM") converted from UTC to the user's local timezone using the browser's Intl API.
5. THE Data_Table SHALL display the Reimbursable column as "Yes" when the value is true and "No" when the value is false.
6. THE Data_Table SHALL display a placeholder value "—" for null or empty Client and Admin Notes fields.
7. THE Data_Table SHALL display the Status column as a color-coded chip with the following mappings: default for In Progress, primary for Submitted, success for Scheduled for Payment, error for Rejected, and default for any other status value.
8. WHEN the API returns expense report data, THE Data_Table SHALL map the following data fields to columns: title → Title, total_amount → Amount, status → Status, owner_username → Owner, created_at → Created, reimbursable_from_client → Reimbursable, client → Client, admin_notes → Admin Notes.

### Requirement 2: Column Sorting

**User Story:** As a user, I want to sort the data table by any column, so that I can organize reports by the field most relevant to my current task.

#### Acceptance Criteria

1. WHEN a user clicks a column header, THE Data_Table SHALL sort the rows by that column in ascending order.
2. WHEN a user clicks the same column header a second time, THE Data_Table SHALL reverse the sort to descending order.
3. WHEN a user clicks the same column header a third time, THE Data_Table SHALL remove the sort and return rows to their original load order (the order returned by the API).
4. WHILE a sort is active on a column, THE Data_Table SHALL display a Sort_Indicator on that column header showing the active sort direction (up for ascending, down for descending).
5. WHEN a sort is removed or no sort is active, THE Data_Table SHALL NOT display a Sort_Indicator on any column header.
6. THE Data_Table SHALL sort text columns (Title, Owner, Client, Admin Notes) using case-insensitive alphabetical ordering.
7. THE Data_Table SHALL sort the Amount column using numeric ordering.
8. THE Data_Table SHALL sort the Created column using chronological ordering.
9. THE Data_Table SHALL sort the Status column using alphabetical ordering of the status label.
10. THE Data_Table SHALL sort the Reimbursable column by treating "Yes" as greater than "No".

### Requirement 3: Column Filtering

**User Story:** As a user, I want to filter the data table by specific column values, so that I can quickly find reports matching particular criteria.

#### Acceptance Criteria

1. THE Data_Table SHALL provide a text-based filter for the Title, Owner, Client, and Admin Notes columns that supports "contains", "equals", "starts with", and "ends with" operators via the DataGrid column menu.
2. THE Data_Table SHALL provide a numeric filter for the Amount column that supports comparison operators (=, !=, >, >=, <, <=) via the DataGrid column menu.
3. THE Data_Table SHALL provide a date filter for the Created column that supports comparison operators (is, is not, is after, is before) via the DataGrid column menu.
4. THE Data_Table SHALL provide a single-select filter for the Status column with options: "In Progress", "Submitted", "Scheduled for Payment", and "Rejected".
5. THE Data_Table SHALL provide a single-select filter for the Reimbursable column with options: "Yes" and "No".
6. WHEN a filter value is applied, THE Data_Table SHALL display only rows that match the active filter.
7. WHEN a filter is cleared, THE Data_Table SHALL restore all rows.
8. IF the active filter results in zero matching rows, THEN THE Data_Table SHALL display a "No rows" overlay message.
9. WHEN no filters are active, THE Data_Table SHALL display all rows without restriction.

### Requirement 4: Role-Based Behavior

**User Story:** As an admin, I want to see all expense reports in the data table, while regular users see only their own, so that access control is maintained in the new table view.

#### Acceptance Criteria

1. WHILE the authenticated user has the Admin role, THE Data_Table SHALL display all expense reports returned by the API.
2. WHILE the authenticated user has the User role, THE Data_Table SHALL display only expense reports owned by that user (as returned by the API).
3. WHILE the authenticated user has the Admin role, THE Data_Table SHALL display the Owner column.
4. WHILE the authenticated user has the User role, THE Data_Table SHALL hide the Owner column (since all reports belong to the same user).
5. WHILE the Owner column is hidden, THE Data_Table SHALL NOT include the Owner column in sort or filter operations.

### Requirement 5: Row Actions

**User Story:** As a user, I want to perform actions on reports directly from the table, so that I can manage reports without losing context of the full list.

#### Acceptance Criteria

1. THE Data_Table SHALL include an Actions column as the last column in the table, and the Actions column SHALL NOT be sortable or filterable.
2. WHEN a report has status "In Progress" or "Rejected" and the authenticated user is the owner, THE Data_Table SHALL display Edit, Delete, and Submit action buttons in the Actions column for that row.
3. WHEN a report has status "Submitted" and the authenticated user has the Admin role, THE Data_Table SHALL display View, Accept, and Reject action buttons in the Actions column for that row.
4. WHEN a report has status "Submitted" or "Scheduled for Payment" and the authenticated user is the owner (without Admin role), THE Data_Table SHALL display only a View action button in the Actions column for that row.
5. WHEN the authenticated user has the Admin role and the report does not have status "Submitted", THE Data_Table SHALL display only a View action button in the Actions column for that row.
6. WHEN the Reject action button is clicked, THE Data_Table SHALL open the existing RejectDialog component to collect admin notes.
7. WHEN the Submit action button is clicked, THE Data_Table SHALL invoke the submit action for the corresponding report. WHEN the Accept action button is clicked, THE Data_Table SHALL invoke the accept action for the corresponding report. WHEN the Edit action button is clicked, THE Data_Table SHALL navigate to the edit view for the corresponding report. WHEN the Delete action button is clicked, THE Data_Table SHALL invoke the delete action for the corresponding report. WHEN the View action button is clicked, THE Data_Table SHALL navigate to the read-only detail view for the corresponding report.

### Requirement 6: Empty and Loading States

**User Story:** As a user, I want clear feedback when data is loading or when no reports match my filters, so that I understand the current state of the table.

#### Acceptance Criteria

1. WHILE expense report data is being fetched, THE Data_Table SHALL display a loading overlay with an accessible label of "Loading expense reports" so that screen readers announce the loading state.
2. IF the fetch completes and the user has zero expense reports (no reports exist regardless of filters), THEN THE Data_Table SHALL display the existing EmptyState component via the DataGrid's noRowsOverlay slot.
3. IF the fetch completes and expense reports exist but the active filter results in zero matching rows, THEN THE Data_Table SHALL display a "No matching reports" message via the DataGrid's noResultsOverlay slot.

### Requirement 7: Accessibility

**User Story:** As a user relying on assistive technology, I want the data table to be accessible, so that I can navigate and interact with expense reports using a screen reader or keyboard.

#### Acceptance Criteria

1. THE Data_Table SHALL use the MUI X DataGrid's built-in ARIA roles and semantic structure for table accessibility.
2. THE Data_Table SHALL support keyboard navigation such that all sort controls, filter inputs, and action buttons are reachable via the Tab key and arrow keys as provided by DataGrid's built-in keyboard support.
3. WHEN a user activates a sort control, THE Data_Table SHALL update the aria-sort attribute on the sorted column header to "ascending" or "descending" as provided by DataGrid's built-in behavior.
4. THE Data_Table SHALL provide an accessible name for each action button that includes the report title of the target row (e.g., "View [report title]", "Delete [report title]").
