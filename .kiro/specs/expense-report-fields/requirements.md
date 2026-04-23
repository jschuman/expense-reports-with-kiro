# Requirements Document

## Introduction

This feature enhances the existing Expense Report Web App by adding new fields to the `Expense_Report` entity. The additions include an auto-populated owner display, a creation timestamp, a renamed and now-optional description field, a reimbursability flag, a conditional client selector, and an admin notes field. These changes affect the backend data model, API schemas, and the frontend form and display components. Existing expense report data will be cleared as part of this change — no migration of prior records is required.

## Glossary

- **Expense_Report**: A record associated with an Authenticated_User, consisting of Title, Description, Total_Amount, Status, Owner, Created_At, Reimbursable_From_Client, Client, and Admin_Notes.
- **Owner**: The Authenticated_User who created the Expense_Report. Populated automatically by the system at creation time.
- **Created_At**: The server-side timestamp recording when the Expense_Report was persisted to the database.
- **Description**: An optional free-text field on the Expense_Report describing its purpose. Replaces the former "Purpose" field.
- **Reimbursable_From_Client**: A boolean field on the Expense_Report indicating whether the expense is to be reimbursed by a Client.
- **Client**: An entity representing a business client. Selected from a predefined list. Required on an Expense_Report when Reimbursable_From_Client is `true`.
- **Client_List**: The system-managed list of available Clients presented as a dropdown to the user.
- **Admin_Notes**: An optional free-text field on the Expense_Report reserved for administrative annotations.
- **Create_Report_Form**: The form displayed to an Authenticated_User for entering Expense_Report details.
- **Dashboard**: The main page listing the Authenticated_User's Expense_Reports.
- **App**: The Expense Report Web App.
- **Authenticated_User**: A User who has successfully completed the login process.

## Requirements

### Requirement 1: Owner Field

**User Story:** As an Authenticated_User, I want the expense report to automatically record who created it, so that ownership is always traceable without manual input.

#### Acceptance Criteria

1. WHEN an Authenticated_User submits the Create_Report_Form, THE App SHALL set the Owner of the Expense_Report to the currently Authenticated_User.
2. THE App SHALL NOT allow the Authenticated_User to manually specify or modify the Owner field through the Create_Report_Form.
3. WHEN an Expense_Report is displayed, THE App SHALL show the Owner's username.

---

### Requirement 2: Created At Field

**User Story:** As an Authenticated_User, I want each expense report to record when it was created, so that I can track the timeline of my submissions.

#### Acceptance Criteria

1. WHEN an Expense_Report is persisted to the database, THE App SHALL record the Created_At timestamp as a UTC date and time.
2. THE App SHALL NOT allow the Authenticated_User to manually specify or modify the Created_At field.
3. WHEN an Expense_Report is displayed, THE App SHALL convert the Created_At UTC value to the user's local timezone as reported by their browser and show it as a human-readable date and time.
4. THE App SHALL retrieve the user's timezone from the browser at display time and SHALL NOT require the user to configure a timezone preference.

---

### Requirement 3: Description Field (Renamed from Purpose)

**User Story:** As an Authenticated_User, I want an optional description field on my expense report, so that I can provide context when needed without being required to do so.

#### Acceptance Criteria

1. THE App SHALL rename the existing "Purpose" field to "Description" in all user-facing labels, API schemas, and database columns.
2. THE App SHALL accept an Expense_Report submission where the Description field is empty or absent.
3. WHEN an Authenticated_User provides a Description, THE App SHALL store and return it as part of the Expense_Report.
4. WHEN an Authenticated_User does not provide a Description, THE App SHALL store and return the Description as an empty value.
5. WHEN an Expense_Report is displayed, THE App SHALL show the Description field; IF the Description is empty, THE App SHALL display a placeholder indicating no description was provided.

---

### Requirement 4: Reimbursable From Client Field

**User Story:** As an Authenticated_User, I want to indicate whether an expense report is reimbursable by a client, so that finance can process reimbursements correctly.

#### Acceptance Criteria

1. THE Create_Report_Form SHALL include a Reimbursable_From_Client field that accepts a boolean value (`true` or `false`).
2. WHEN an Authenticated_User submits the Create_Report_Form without specifying Reimbursable_From_Client, THE App SHALL default the value to `false`.
3. WHEN an Expense_Report is displayed, THE App SHALL show the Reimbursable_From_Client value as "Yes" when `true` and "No" when `false`.

---

### Requirement 5: Client Field

**User Story:** As an Authenticated_User, I want to select a client from a dropdown when my expense is reimbursable, so that the report is linked to the correct client for billing.

#### Acceptance Criteria

1. THE Create_Report_Form SHALL present the Client field as a dropdown populated from the Client_List.
2. THE Client_List SHALL be seeded with between 3 and 5 example clients.
3. WHEN an Authenticated_User sets Reimbursable_From_Client to `true` and submits the Create_Report_Form without selecting a Client, THE App SHALL display a validation error and SHALL NOT save the Expense_Report.
4. WHEN an Authenticated_User sets Reimbursable_From_Client to `false`, THE App SHALL accept the Create_Report_Form submission regardless of whether a Client is selected.
5. WHEN an Authenticated_User sets Reimbursable_From_Client to `true` and selects a valid Client, THE App SHALL store the selected Client on the Expense_Report.
6. IF an Authenticated_User submits a Client value that does not exist in the Client_List, THEN THE App SHALL return a validation error and SHALL NOT save the Expense_Report.
7. WHEN an Expense_Report is displayed, THE App SHALL show the Client field; IF no Client is associated, THE App SHALL display a placeholder indicating none was selected.

---

### Requirement 6: Admin Notes Field

**User Story:** As an Authenticated_User, I want an admin notes field on the expense report, so that administrators have a dedicated space for internal annotations in the future.

#### Acceptance Criteria

1. THE Expense_Report SHALL include an Admin_Notes field that accepts optional free text.
2. THE App SHALL accept an Expense_Report submission where the Admin_Notes field is empty or absent.
3. WHEN an Authenticated_User provides Admin_Notes, THE App SHALL store and return the value as part of the Expense_Report.
4. WHEN an Authenticated_User does not provide Admin_Notes, THE App SHALL store and return Admin_Notes as an empty value.
5. WHEN an Expense_Report is displayed, THE App SHALL show the Admin_Notes field; IF Admin_Notes is empty, THE App SHALL display a placeholder indicating no notes have been added.

---

### Requirement 7: Expense Report Display

**User Story:** As an Authenticated_User, I want to see all fields of an expense report when viewing it on the dashboard, so that I have a complete picture of each report at a glance.

#### Acceptance Criteria

1. WHEN an Expense_Report is displayed on the Dashboard, THE App SHALL show all of the following fields: Title, Description, Total_Amount, Status, Owner, Created_At, Reimbursable_From_Client, Client, and Admin_Notes.
2. WHEN an Expense_Report is displayed, THE App SHALL format Total_Amount as a currency value.
3. WHEN an Expense_Report is displayed, THE App SHALL convert the Created_At UTC timestamp to the user's local timezone as reported by their browser and display it as a human-readable date and time.
4. WHEN an Expense_Report is displayed, THE App SHALL show Reimbursable_From_Client as "Yes" or "No".
5. WHEN an optional field (Description, Client, Admin_Notes) has no value, THE App SHALL display a visual placeholder (e.g. "—" or "None") rather than leaving the field blank.

