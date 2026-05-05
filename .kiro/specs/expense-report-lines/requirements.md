# Requirements Document

## Introduction

This feature adds line-item support to the Expense Report Web App. Each Expense_Report can have zero or more Expense_Lines associated with it. Each Expense_Line captures a single expenditure with a description, incurred date, and amount. The Total_Amount on the Expense_Report is fully derived from the sum of its Expense_Lines and is never entered manually. This feature affects the backend data model, API schemas, and the frontend display and navigation components.

## Glossary

- **Expense_Report**: A record associated with an Authenticated_User, consisting of Title, Description, Total_Amount, Status, Owner, Created_At, Reimbursable_From_Client, Client, and Admin_Notes, and a collection of Expense_Lines.
- **Expense_Line**: A single line item on an Expense_Report, consisting of a Description, Incurred_Date, and Amount.
- **Expense_Line_Description**: A required free-text field on an Expense_Line describing the specific expenditure (e.g. "Taxi to airport").
- **Incurred_Date**: The date on which the expenditure represented by an Expense_Line occurred, stored as a UTC date.
- **Line_Amount**: A positive monetary value representing the cost of a single Expense_Line.
- **Total_Amount**: The sum of all Line_Amount values across all Expense_Lines belonging to an Expense_Report. Computed and stored server-side; never entered or modified directly by the user.
- **Line_Manager**: The backend component responsible for creating, updating, deleting, and retrieving Expense_Lines.
- **Report_Service**: The backend service layer responsible for expense report persistence and retrieval.
- **Expense_Lines_Section**: The read-only UI section within the Expense_Report_Detail_Page that displays all Expense_Lines and provides Add, Edit, and Delete controls.
- **Expense_Report_Detail_Page**: The frontend page that displays a single Expense_Report, including its fields and the Expense_Lines_Section.
- **Expense_Line_Detail_Page**: The dedicated frontend page used for both creating a new Expense_Line and editing an existing one. Contains all Expense_Line fields.
- **Dashboard**: The main page listing the Authenticated_User's Expense_Reports.
- **App**: The Expense Report Web App.
- **Authenticated_User**: A User who has successfully completed the login process.
- **Owner**: The Authenticated_User who created the Expense_Report.

## Requirements

### Requirement 1: Expense Line Data Model

**User Story:** As an Authenticated_User, I want each expense report to support multiple line items, so that I can itemise individual expenditures within a single report.

#### Acceptance Criteria

1. THE Line_Manager SHALL store each Expense_Line with the following fields: a unique identifier, a reference to the parent Expense_Report, Expense_Line_Description, Line_Amount, and Incurred_Date.
2. THE Line_Manager SHALL enforce referential integrity between Expense_Line and Expense_Report, so that an Expense_Line cannot exist without a valid parent Expense_Report.
3. THE Line_Manager SHALL allow an Expense_Report to have zero Expense_Lines.
4. THE Line_Manager SHALL allow an Expense_Report to have multiple Expense_Lines.
5. WHEN an Expense_Report is deleted, THE Line_Manager SHALL delete all Expense_Lines associated with that Expense_Report.

---

### Requirement 2: Add an Expense Line

**User Story:** As an Owner, I want to add line items to my expense report, so that I can record each individual expenditure separately.

#### Acceptance Criteria

1. WHILE an Expense_Report has status `In Progress` or `Rejected`, THE App SHALL display an Add control within the Expense_Lines_Section to the Owner.
2. WHEN an Owner activates the Add control, THE App SHALL navigate to the Expense_Line_Detail_Page in create mode for the parent Expense_Report.
3. THE Expense_Line_Detail_Page SHALL include fields for Expense_Line_Description, Line_Amount, and Incurred_Date.
4. WHEN an Owner submits the Expense_Line_Detail_Page with all required fields populated and valid, THE Line_Manager SHALL create the Expense_Line and associate it with the Expense_Report.
5. IF an Owner submits the Expense_Line_Detail_Page with one or more required fields empty, THEN THE Line_Manager SHALL return a descriptive validation error and SHALL NOT create the Expense_Line.
6. IF an Owner submits the Expense_Line_Detail_Page with a Line_Amount that is not a positive numeric value, THEN THE Line_Manager SHALL return a validation error and SHALL NOT create the Expense_Line.
7. IF an Owner submits the Expense_Line_Detail_Page with an Incurred_Date that is not a valid calendar date, THEN THE Line_Manager SHALL return a validation error and SHALL NOT create the Expense_Line.
8. WHEN an Expense_Line is successfully created, THE App SHALL navigate back to the Expense_Report_Detail_Page and display the updated Expense_Lines_Section.

---

### Requirement 3: Edit an Expense Line

**User Story:** As an Owner, I want to edit an existing line item on my expense report, so that I can correct mistakes before submitting.

#### Acceptance Criteria

1. WHILE an Expense_Report has status `In Progress` or `Rejected`, THE App SHALL display an Edit control for each Expense_Line in the Expense_Lines_Section to the Owner.
2. WHEN an Owner activates the Edit control for an Expense_Line, THE App SHALL navigate to the Expense_Line_Detail_Page in edit mode, pre-populated with the current field values of that Expense_Line.
3. THE Expense_Line_Detail_Page in edit mode SHALL include fields for Expense_Line_Description, Line_Amount, and Incurred_Date.
4. WHEN an Owner submits the Expense_Line_Detail_Page with all required fields populated and valid, THE Line_Manager SHALL update the Expense_Line with the new values.
5. IF an Owner submits the Expense_Line_Detail_Page with one or more required fields empty or invalid, THEN THE Line_Manager SHALL return a descriptive validation error and SHALL NOT update the Expense_Line.
6. IF a User who is not the Owner attempts to update an Expense_Line, THEN THE Line_Manager SHALL return a 403 Forbidden response.
7. WHILE an Expense_Report has status `Submitted` or `Scheduled for Payment`, THE Line_Manager SHALL reject any update request for an Expense_Line belonging to that Expense_Report with a 409 Conflict response.
8. WHEN an Expense_Line is successfully updated, THE App SHALL navigate back to the Expense_Report_Detail_Page and display the updated Expense_Lines_Section.

---

### Requirement 4: Delete an Expense Line

**User Story:** As an Owner, I want to remove a line item from my expense report, so that I can correct errors or remove duplicate entries.

#### Acceptance Criteria

1. WHILE an Expense_Report has status `In Progress` or `Rejected`, THE App SHALL display a Delete control for each Expense_Line in the Expense_Lines_Section to the Owner.
2. WHEN an Owner activates the Delete control for an Expense_Line, THE App SHALL prompt the Owner to confirm the deletion.
3. WHEN an Owner confirms deletion, THE Line_Manager SHALL permanently remove the Expense_Line from the Expense_Report.
4. IF a User who is not the Owner attempts to delete an Expense_Line, THEN THE Line_Manager SHALL return a 403 Forbidden response.
5. WHILE an Expense_Report has status `Submitted` or `Scheduled for Payment`, THE Line_Manager SHALL reject any delete request for an Expense_Line belonging to that Expense_Report with a 409 Conflict response.

---

### Requirement 5: Total Amount Calculation

**User Story:** As an Authenticated_User, I want the total amount on my expense report to reflect the sum of all line items automatically, so that I do not have to calculate or enter it manually.

#### Acceptance Criteria

1. WHEN an Expense_Line is created, updated, or deleted, THE Report_Service SHALL recompute the Total_Amount of the parent Expense_Report as the sum of all Line_Amount values for that Expense_Report.
2. THE Report_Service SHALL store the computed Total_Amount on the Expense_Report record.
3. WHEN an Expense_Report has zero Expense_Lines, THE Report_Service SHALL set the Total_Amount to `0.00`.
4. WHEN an Expense_Report is retrieved via the API, THE Report_Service SHALL return the current Total_Amount reflecting all Expense_Lines.
5. THE App SHALL display the Total_Amount on the Dashboard and in the Expense_Report_Detail_Page, formatted as a currency value.
6. THE App SHALL present Total_Amount as a read-only value and SHALL NOT provide any input field that allows the user to set or modify Total_Amount directly.

---

### Requirement 6: Expense Lines Display

**User Story:** As an Authenticated_User, I want to see all line items for an expense report in a read-only table, so that I can review the breakdown of expenditures.

#### Acceptance Criteria

1. WHEN an Expense_Report is displayed on the Expense_Report_Detail_Page, THE App SHALL show the Expense_Lines_Section listing all Expense_Lines associated with that Expense_Report in a read-only table.
2. THE Expense_Lines_Section SHALL display the following columns for each Expense_Line: Expense_Line_Description, Line_Amount, and Incurred_Date.
3. THE Expense_Lines_Section SHALL display Line_Amount formatted as a currency value.
4. THE Expense_Lines_Section SHALL display Incurred_Date as a human-readable date (e.g. "Apr 23, 2026"), converted to the user's local timezone using the browser's `Intl` API.
5. IF an Expense_Report has zero Expense_Lines, THE App SHALL display a message within the Expense_Lines_Section indicating that no line items have been added.
6. THE Expense_Lines_Section SHALL display the sum of all Line_Amount values as a subtotal, consistent with the Expense_Report's Total_Amount.

---

### Requirement 7: Expense Lines API

**User Story:** As a developer, I want a well-defined REST API for expense line operations, so that the frontend and any future integrations can manage line items reliably.

#### Acceptance Criteria

1. THE Line_Manager SHALL expose a `POST /expense-reports/{report_id}/lines` endpoint that creates a new Expense_Line for the specified Expense_Report.
2. THE Line_Manager SHALL expose a `GET /expense-reports/{report_id}/lines` endpoint that returns all Expense_Lines for the specified Expense_Report.
3. THE Line_Manager SHALL expose a `PUT /expense-reports/{report_id}/lines/{line_id}` endpoint that updates the specified Expense_Line.
4. THE Line_Manager SHALL expose a `DELETE /expense-reports/{report_id}/lines/{line_id}` endpoint that deletes the specified Expense_Line.
5. THE Line_Manager SHALL accept and return Expense_Line payloads containing only the fields: Expense_Line_Description, Line_Amount, and Incurred_Date.
6. IF a request references an Expense_Report that does not exist, THEN THE Line_Manager SHALL return a 404 Not Found response.
7. IF a request references an Expense_Line that does not exist or does not belong to the specified Expense_Report, THEN THE Line_Manager SHALL return a 404 Not Found response.
8. THE Line_Manager SHALL validate all request bodies using Pydantic schemas before processing any operation.
9. WHEN an unauthenticated request is made to any Expense_Line endpoint, THE Line_Manager SHALL return a 401 Unauthorized response.

---

### Requirement 8: Line Items Read-Only for Non-Owners

**User Story:** As a system, I want to ensure that only the report owner can modify line items, so that expense data integrity is maintained.

#### Acceptance Criteria

1. WHEN an Authenticated_User who is not the Owner of an Expense_Report requests the list of Expense_Lines for that report, THE Line_Manager SHALL return the Expense_Lines if the Authenticated_User has Admin_Role.
2. IF an Authenticated_User with User_Role who is not the Owner attempts to retrieve Expense_Lines for an Expense_Report they do not own, THEN THE Line_Manager SHALL return a 403 Forbidden response.
3. THE Line_Manager SHALL enforce ownership checks on all create, update, and delete operations for Expense_Lines.
