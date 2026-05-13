# Requirements Document

## Introduction

This document specifies requirements for displaying a status history table on expense report detail pages (both the edit and view pages). The table shows a chronological record of all status changes applied to an expense report, giving users visibility into how the report progressed through the workflow. The table is only displayed when the report has undergone at least one status transition (i.e., it has more than one entry in the audit log).

## Glossary

- **Expense_Report**: A record with Title, Description, Total_Amount, Status, and associated metadata, owned by a User.
- **Status_History_Table**: A read-only table component displayed at the bottom of expense report detail pages that shows the chronological list of status changes.
- **Status_Audit_Log**: The persistent backend table that records every status change applied to an Expense_Report, including the report identifier, the new status value, and the UTC datetime of the change.
- **Audit_Entry**: A single row in the Status_Audit_Log representing one status change event for one Expense_Report.
- **Status_Pill**: A styled badge component that displays a status value with color coding consistent with the existing status display elsewhere in the application.
- **Detail_Page**: A page that shows the full details of a single Expense_Report. There are two variants: the View Detail Page (read-only) and the Edit Detail Page (editable fields).
- **Report_API**: The backend API endpoint that returns expense report data including status history.

## Requirements

### Requirement 1: Status History API Endpoint

**User Story:** As a frontend client, I want to retrieve the status history for an expense report, so that I can display the chronological record of status changes.

#### Acceptance Criteria

1. THE Report_API SHALL expose a dedicated sub-resource endpoint for retrieving the status history of an Expense_Report, accessible via a GET request scoped to a specific Expense_Report identifier.
2. THE Report_API SHALL return each Audit_Entry with the status value and the UTC datetime of the status change, serialized as ISO 8601 strings.
3. THE Report_API SHALL return Audit_Entry records ordered by the changed_at datetime from earliest to latest.
4. WHEN an authenticated User who is the owner of the Expense_Report or has the Admin role requests the status history for an Expense_Report, THE Report_API SHALL return all Audit_Entry records associated with that Expense_Report as a JSON array.
5. IF an unauthenticated User requests the status history, THEN THE Report_API SHALL return a 401 Unauthorized response.
6. IF an authenticated User requests the status history for an Expense_Report that does not exist, THEN THE Report_API SHALL return a 404 Not Found response.
7. IF an authenticated User who is neither the owner nor an Admin requests the status history for an Expense_Report, THEN THE Report_API SHALL return a 403 Forbidden response.

---

### Requirement 2: Conditional Display of the Status History Table

**User Story:** As a user, I want the status history table to only appear when there has been at least one status change, so that the page is not cluttered with a table showing only the initial status.

#### Acceptance Criteria

1. WHEN the Detail_Page renders an Expense_Report that has more than one Audit_Entry in the Status_Audit_Log, THE Detail_Page SHALL display the Status_History_Table.
2. WHEN the Detail_Page renders an Expense_Report that has one or fewer Audit_Entry records in the Status_Audit_Log, THE Detail_Page SHALL NOT render the Status_History_Table in the page DOM.
3. WHEN the Detail_Page renders an Expense_Report and the number of Audit_Entry records changes due to a status update on the same page session, THE Detail_Page SHALL re-evaluate the display condition and show or hide the Status_History_Table accordingly without requiring a full page reload.

---

### Requirement 3: Status History Table Content and Layout

**User Story:** As a user, I want to see the status and date of each status change in a simple table, so that I can understand the timeline of my expense report.

#### Acceptance Criteria

1. THE Status_History_Table SHALL display two columns with the header labels "Status" and "Date".
2. THE Status_History_Table SHALL render each Audit_Entry as a row containing the Status_Pill for that entry's status value and the formatted datetime of the status change.
3. THE Status_History_Table SHALL order rows by the changed_at datetime from earliest to latest.
4. THE Status_History_Table SHALL convert all UTC datetime values to the user's local timezone before displaying them.
5. THE Status_History_Table SHALL format datetime values as human-readable strings using the browser Intl API with month (short), day (numeric), year (numeric), hour (numeric), and minute (2-digit) options (e.g., "Apr 23, 2026, 5:00 PM").
6. THE Status_History_Table SHALL NOT display raw ISO 8601 strings to the user.
7. IF an Audit_Entry has a null or missing changed_at datetime value, THEN THE Status_History_Table SHALL display a placeholder dash character ("—") in the datetime column for that row.

---

### Requirement 4: Status History Table Placement

**User Story:** As a user, I want the status history table to appear at the bottom of the detail page, so that it does not interfere with the primary report content.

#### Acceptance Criteria

1. THE Detail_Page SHALL render the Status_History_Table as the last content section on the page, below all report detail fields and form controls.
2. THE Status_History_Table SHALL appear on both the View Detail Page and the Edit Detail Page.
3. THE Status_History_Table SHALL NOT contain any editable inputs, inline editing controls, or row-level action buttons on either the View Detail Page or the Edit Detail Page.
4. WHEN the Detail_Page is the Edit Detail Page, THE Status_History_Table SHALL be rendered outside the editable form region so that form submission does not affect the table content.
5. THE Detail_Page SHALL display a visible heading or label immediately above the Status_History_Table to distinguish it from the preceding content sections.

---

### Requirement 5: Status History Table is Static

**User Story:** As a user, I want the status history table to be a simple static display, so that I can quickly scan the history without interactive complexity.

#### Acceptance Criteria

1. THE Status_History_Table SHALL NOT provide sorting, filtering, or pagination controls.
2. THE Status_History_Table SHALL render all Audit_Entry records for the Expense_Report, displaying the full text content of each cell without ellipsis or character-limit truncation.
3. THE Status_History_Table SHALL NOT allow any user interaction that modifies the displayed data.
4. THE Status_History_Table SHALL expand within the page flow so that all rows are visible without a separate scrollable container within the table itself.
