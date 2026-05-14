# Requirements Document

## Introduction

This document specifies requirements for enabling Admin users to edit expense reports regardless of their current status, and for making the Admin_Notes field visible on expense report edit and view screens with role-appropriate access controls. Regular users can view Admin_Notes in read-only mode, while Admin users can edit the field directly on any expense report.

## Glossary

- **Expense_Report**: A record with Title, Description, Total_Amount, Status, Owner, Created_At, Reimbursable_From_Client, Client, and Admin_Notes, associated with a User.
- **Admin**: An authenticated User with the Admin_Role, responsible for reviewing and managing expense reports.
- **Owner**: The authenticated User who created the Expense_Report.
- **Admin_Notes**: A free-text field on an Expense_Report reserved for administrative annotations. Editable only by Admin users.
- **Report_Service**: The backend service layer responsible for expense report persistence, retrieval, and update operations.
- **Edit_Screen**: The UI form that allows modification of Expense_Report fields.
- **View_Screen**: The UI display that shows Expense_Report details in read-only mode.
- **Status**: The current lifecycle state of an Expense_Report. Valid values: `In Progress`, `Submitted`, `Rejected`, `Scheduled for Payment`.

## Requirements

### Requirement 1: Admin Edit Access Regardless of Status

**User Story:** As an admin, I want to edit any expense report regardless of its current status, so that I can correct errors or update information at any stage of the workflow.

#### Acceptance Criteria

1. WHEN an Admin requests to update an Expense_Report, THE Report_Service SHALL allow the update regardless of the current Status of the Expense_Report.
2. WHEN an Admin updates an Expense_Report, THE Report_Service SHALL allow modification of the following fields: Title, Description, Reimbursable_From_Client, Client, and Admin_Notes. THE Report_Service SHALL NOT allow direct modification of Total_Amount, which is computed from the associated expense lines.
3. WHEN an Admin updates an Expense_Report, THE Report_Service SHALL apply only the fields explicitly provided in the request and SHALL preserve the existing values of any fields not included in the request.
4. WHEN an Admin updates an Expense_Report, THE Report_Service SHALL NOT change the Status of the Expense_Report as a result of the edit.
5. WHEN an Admin updates an Expense_Report, THE Report_Service SHALL validate all field constraints before persisting the changes: Title must be between 1 and 255 characters, Client must be a value from the Client_List when Reimbursable_From_Client is true, and Client must be a valid entry in the Client_List if provided.
6. IF an Admin submits an update with invalid field values, THEN THE Report_Service SHALL return a validation error indicating which fields failed validation and SHALL NOT persist the changes.
7. IF an Admin requests to update an Expense_Report that does not exist, THEN THE Report_Service SHALL return a 404 Not Found response.

---

### Requirement 2: Admin Edit Controls on Dashboard

**User Story:** As an admin, I want to see edit controls on all expense reports regardless of status, so that I can access the edit functionality from the dashboard.

#### Acceptance Criteria

1. WHEN an Admin views the Dashboard, THE Dashboard SHALL display an edit control for every Expense_Report visible to the Admin, regardless of its Status or Owner.
2. WHEN an Admin clicks the edit control on an Expense_Report, THE Dashboard SHALL navigate to the Edit_Screen for that Expense_Report.
3. WHEN a User with User_Role views the Dashboard, THE Dashboard SHALL display edit controls only for Expense_Reports the User owns that have status `In Progress` or `Rejected`, as defined by existing status requirements.
4. WHEN a User with User_Role clicks the edit control on an Expense_Report, THE Dashboard SHALL navigate to the Edit_Screen for that Expense_Report.

---

### Requirement 3: Admin Edit Screen

**User Story:** As an admin, I want the edit screen to allow me to modify expense report fields and admin notes, so that I can make corrections and add annotations in one place.

#### Acceptance Criteria

1. WHEN an Admin opens the Edit_Screen for an Expense_Report, THE Edit_Screen SHALL display all editable fields: Title, Description, Reimbursable_From_Client, Client, and Admin_Notes.
2. WHEN an Admin opens the Edit_Screen for an Expense_Report, THE Edit_Screen SHALL pre-populate each field with the current value from the Expense_Report, and SHALL display empty text for any field that has no current value.
3. WHEN an Admin submits changes on the Edit_Screen with all validation rules satisfied, THE Edit_Screen SHALL send an update request to the Report_Service and display a success confirmation within 2 seconds of receiving a successful response.
4. IF the Report_Service returns a validation error in response to an Admin's update request, THEN THE Edit_Screen SHALL display the error message returned by the Report_Service adjacent to the relevant field and SHALL retain all field values entered by the Admin without navigating away from the Edit_Screen.
5. IF the Admin sets Reimbursable_From_Client to true and does not select a Client, THEN THE Edit_Screen SHALL display a validation error indicating that Client is required and SHALL NOT submit the update request.
6. IF the Admin submits the Edit_Screen with a Title that is empty or exceeds 255 characters, THEN THE Edit_Screen SHALL display a validation error indicating the Title constraint and SHALL NOT submit the update request.
7. WHILE the Edit_Screen is submitting an update request to the Report_Service, THE Edit_Screen SHALL disable all form fields and the submit button to prevent duplicate submissions.

---

### Requirement 4: Admin Notes Visibility on View Screen

**User Story:** As a user, I want to see admin notes on the expense report view screen, so that I can read any feedback or annotations left by administrators.

#### Acceptance Criteria

1. WHEN any authenticated User views an Expense_Report on the View_Screen, THE View_Screen SHALL display the Admin_Notes field with a visible label "Admin Notes", preserving line breaks present in the stored text.
2. IF the Admin_Notes field is empty, THEN THE View_Screen SHALL display a placeholder indicating no admin notes have been added.
3. WHEN a User with User_Role views the View_Screen, THE View_Screen SHALL display Admin_Notes as read-only text without edit controls.
4. WHEN an Admin views the View_Screen, THE View_Screen SHALL display Admin_Notes as read-only text (editing is performed via the Edit_Screen).
5. IF the Admin_Notes content exceeds 500 characters, THEN THE View_Screen SHALL display the full content within a scrollable container with a maximum height of 200 pixels.

---

### Requirement 5: Admin Notes on Edit Screen for Regular Users

**User Story:** As a regular user, I want to see admin notes on the edit screen in read-only mode, so that I can reference admin feedback while making corrections to my report.

#### Acceptance Criteria

1. WHEN a User with User_Role opens the Edit_Screen for an Expense_Report they own, THE Edit_Screen SHALL display the Admin_Notes field as non-editable text that is visually distinct from editable fields.
2. THE Edit_Screen SHALL render the Admin_Notes field for a User with User_Role as a non-interactive element that does not accept keyboard or pointer input for text modification.
3. WHEN the Admin_Notes field is empty, THE Edit_Screen SHALL display a placeholder indicating no admin notes have been added.
4. WHEN a User with User_Role submits changes on the Edit_Screen, THE Report_Service SHALL ignore any Admin_Notes value in the request payload and preserve the existing Admin_Notes value.
5. WHEN a User with User_Role opens the Edit_Screen for an Expense_Report they own, THE Edit_Screen SHALL preserve line breaks present in the Admin_Notes content when rendering the field.

---

### Requirement 6: Admin Notes Editability for Admin Users

**User Story:** As an admin, I want to edit the admin notes field on any expense report, so that I can provide feedback, instructions, or internal annotations at any time.

#### Acceptance Criteria

1. WHEN an Admin opens the Edit_Screen for any Expense_Report, THE Edit_Screen SHALL display the Admin_Notes field as an editable multiline text input with a maximum length of 1000 characters.
2. WHEN an Admin modifies the Admin_Notes field and submits the Edit_Screen, THE Report_Service SHALL persist the updated Admin_Notes value on the Expense_Report.
3. WHEN an Admin clears the Admin_Notes field and submits the Edit_Screen, THE Report_Service SHALL store Admin_Notes as an empty value.
4. THE Report_Service SHALL allow an Admin to update only the Admin_Notes field without modifying other fields on the Expense_Report.

---

### Requirement 7: Authorization Enforcement

**User Story:** As a system, I want to enforce that only Admin users can bypass status-based edit restrictions, so that regular users cannot circumvent the workflow.

#### Acceptance Criteria

1. IF a User with User_Role attempts to update an Expense_Report with status `Submitted`, THEN THE Report_Service SHALL return a 409 Conflict response with an error message indicating the report cannot be edited in its current status.
2. IF a User with User_Role attempts to update an Expense_Report with status `Scheduled for Payment`, THEN THE Report_Service SHALL return a 409 Conflict response with an error message indicating the report cannot be edited in its current status.
3. IF a User with User_Role attempts to update an Expense_Report they do not own that has status `In Progress` or `Rejected`, THEN THE Report_Service SHALL return a 403 Forbidden response with an error message indicating the user is not authorized to edit this report.
4. THE Report_Service SHALL determine the requesting User's role from the authenticated session before applying edit permissions.
5. WHEN a User with User_Role submits an update request containing an Admin_Notes value, THE Report_Service SHALL discard the Admin_Notes value and process the remaining fields according to existing status-based rules.
6. IF a User with User_Role submits an update request that violates both ownership and status restrictions, THEN THE Report_Service SHALL evaluate the status restriction first and return a 409 Conflict response.
