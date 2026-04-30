# Requirements Document

## Introduction

This document specifies requirements for the expense report status lifecycle in the Expense Report Web App. Expense reports move through a defined set of statuses as they are submitted, reviewed, and scheduled for payment. The feature introduces status transitions, role-based permissions on those transitions, and the rules governing who can edit or act on a report at each stage.

## Glossary

- **Expense_Report**: A record with Title, Description, Total_Amount, Status, and associated metadata, owned by a User.
- **Status**: The current lifecycle state of an Expense_Report. Valid values: `In Progress`, `Submitted`, `Rejected`, `Scheduled for Payment`.
- **Owner**: The authenticated User who created the Expense_Report.
- **Admin**: An authenticated User with the Admin_Role, responsible for reviewing submitted reports.
- **Status_Machine**: The backend component that enforces valid status transitions and associated business rules.
- **Report_Service**: The backend service layer responsible for expense report persistence and retrieval.
- **Admin_Notes**: A text field on an Expense_Report that an Admin MUST populate when rejecting a report.
- **Submit_Action**: The action taken by an Owner to transition a report from `In Progress` to `Submitted`.
- **Accept_Action**: The action taken by an Admin to transition a report from `Submitted` to `Scheduled for Payment`.
- **Reject_Action**: The action taken by an Admin to transition a report from `Submitted` to `Rejected`, requiring Admin_Notes.
- **Validation**: The process of verifying that an Expense_Report meets all required field constraints before a status transition is allowed.
- **Dashboard**: The main page listing expense reports visible to the authenticated user.
- **Status_Audit_Log**: A persistent table that records every status change applied to an Expense_Report, including the report identifier, the new status value, and the UTC datetime of the change.
- **Audit_Entry**: A single row in the Status_Audit_Log representing one status change event for one Expense_Report.

## Requirements

### Requirement 1: Initial Status on Creation

**User Story:** As an owner, I want my expense report to start in the In Progress state when I create it, so that I can continue editing it before submitting.

#### Acceptance Criteria

1. WHEN an Owner creates a new Expense_Report, THE Report_Service SHALL assign the status `In Progress` to that Expense_Report.
2. THE Report_Service SHALL reject any request to create an Expense_Report with a status other than `In Progress`.

---

### Requirement 2: Owner Permissions in the In Progress State

**User Story:** As an owner, I want to be able to edit, update, and delete my expense report while it is In Progress, so that I can correct mistakes before submitting.

#### Acceptance Criteria

1. WHILE an Expense_Report has status `In Progress`, THE Report_Service SHALL allow the Owner to update any editable field on that Expense_Report.
2. WHILE an Expense_Report has status `In Progress`, THE Report_Service SHALL allow the Owner to delete that Expense_Report.
3. WHILE an Expense_Report has status `In Progress`, THE Dashboard SHALL display edit and delete controls to the Owner for that Expense_Report.
4. IF a User who is not the Owner attempts to update an Expense_Report with status `In Progress`, THEN THE Report_Service SHALL return a 403 Forbidden response.
5. IF a User who is not the Owner attempts to delete an Expense_Report with status `In Progress`, THEN THE Report_Service SHALL return a 403 Forbidden response.

---

### Requirement 3: Submitting a Report

**User Story:** As an owner, I want to submit my expense report for admin review, so that it can be approved and scheduled for payment.

#### Acceptance Criteria

1. WHILE an Expense_Report has status `In Progress`, THE Dashboard SHALL display a Submit button to the Owner.
2. WHEN an Owner triggers the Submit_Action on an Expense_Report with status `In Progress`, THE Status_Machine SHALL validate that all required fields on the Expense_Report are populated.
3. WHEN validation passes, THE Status_Machine SHALL transition the Expense_Report status from `In Progress` to `Submitted`.
4. IF validation fails, THEN THE Status_Machine SHALL return a descriptive error and SHALL NOT change the Expense_Report status.
5. IF an Owner attempts to trigger the Submit_Action on an Expense_Report that does not have status `In Progress`, THEN THE Status_Machine SHALL return a 409 Conflict response.
6. IF a User who is not the Owner attempts to trigger the Submit_Action, THEN THE Status_Machine SHALL return a 403 Forbidden response.

---

### Requirement 4: Owner Permissions in the Submitted State

**User Story:** As an owner, I want my submitted report to be read-only, so that the admin reviews the exact version I submitted.

#### Acceptance Criteria

1. WHILE an Expense_Report has status `Submitted`, THE Report_Service SHALL reject any update request from the Owner with a 409 Conflict response.
2. WHILE an Expense_Report has status `Submitted`, THE Report_Service SHALL reject any delete request from the Owner with a 409 Conflict response.
3. WHILE an Expense_Report has status `Submitted`, THE Dashboard SHALL display the Expense_Report to the Owner in a read-only view without edit or delete controls.

---

### Requirement 5: Admin Review of Submitted Reports

**User Story:** As an admin, I want to view submitted expense reports and either accept or reject them, so that I can control which reports proceed to payment.

#### Acceptance Criteria

1. WHILE an Expense_Report has status `Submitted`, THE Dashboard SHALL display Accept and Reject controls to Admin users.
2. WHEN an Admin triggers the Accept_Action on an Expense_Report with status `Submitted`, THE Status_Machine SHALL transition the Expense_Report status from `Submitted` to `Scheduled for Payment`.
3. IF an Admin attempts to trigger the Accept_Action on an Expense_Report that does not have status `Submitted`, THEN THE Status_Machine SHALL return a 409 Conflict response.
4. IF a User who is not an Admin attempts to trigger the Accept_Action, THEN THE Status_Machine SHALL return a 403 Forbidden response.

---

### Requirement 6: Rejecting a Report

**User Story:** As an admin, I want to reject a submitted expense report and provide a reason, so that the owner knows what to correct before resubmitting.

#### Acceptance Criteria

1. WHEN an Admin triggers the Reject_Action on an Expense_Report with status `Submitted`, THE Status_Machine SHALL require that the Admin_Notes field is populated.
2. IF the Admin_Notes field is empty or absent when the Reject_Action is triggered, THEN THE Status_Machine SHALL return a descriptive validation error and SHALL NOT change the Expense_Report status.
3. WHEN the Admin_Notes field is populated and the Reject_Action is triggered, THE Status_Machine SHALL transition the Expense_Report status from `Submitted` to `Rejected`.
4. WHEN the Reject_Action completes, THE Report_Service SHALL persist the Admin_Notes value on the Expense_Report.
5. IF an Admin attempts to trigger the Reject_Action on an Expense_Report that does not have status `Submitted`, THEN THE Status_Machine SHALL return a 409 Conflict response.
6. IF a User who is not an Admin attempts to trigger the Reject_Action, THEN THE Status_Machine SHALL return a 403 Forbidden response.

---

### Requirement 7: Owner Permissions in the Rejected State

**User Story:** As an owner, I want to be able to edit and resubmit my rejected expense report, so that I can address the admin's feedback and try again.

#### Acceptance Criteria

1. WHILE an Expense_Report has status `Rejected`, THE Report_Service SHALL allow the Owner to update any editable field on that Expense_Report.
2. WHILE an Expense_Report has status `Rejected`, THE Report_Service SHALL allow the Owner to delete that Expense_Report.
3. WHILE an Expense_Report has status `Rejected`, THE Dashboard SHALL display the Admin_Notes to the Owner so that the Owner can understand the reason for rejection.
4. WHILE an Expense_Report has status `Rejected`, THE Dashboard SHALL display edit, delete, and Submit controls to the Owner.
5. WHEN an Owner triggers the Submit_Action on an Expense_Report with status `Rejected`, THE Status_Machine SHALL apply the same validation and transition rules as defined in Requirement 3.
6. IF a User who is not the Owner attempts to update an Expense_Report with status `Rejected`, THEN THE Report_Service SHALL return a 403 Forbidden response.

---

### Requirement 8: Scheduled for Payment State

**User Story:** As a user, I want accepted expense reports to be locked from further changes, so that the payment record remains accurate.

#### Acceptance Criteria

1. WHILE an Expense_Report has status `Scheduled for Payment`, THE Report_Service SHALL reject any update request from any User with a 409 Conflict response.
2. WHILE an Expense_Report has status `Scheduled for Payment`, THE Report_Service SHALL reject any delete request from any User with a 409 Conflict response.
3. WHILE an Expense_Report has status `Scheduled for Payment`, THE Dashboard SHALL display the Expense_Report in a read-only view to all Users without edit, delete, or action controls.

---

### Requirement 9: Invalid Status Transitions

**User Story:** As a system, I want to enforce that only defined status transitions are allowed, so that reports cannot be moved to arbitrary states.

#### Acceptance Criteria

1. THE Status_Machine SHALL only permit the following transitions:
   - `In Progress` → `Submitted` (via Submit_Action by Owner)
   - `Submitted` → `Scheduled for Payment` (via Accept_Action by Admin)
   - `Submitted` → `Rejected` (via Reject_Action by Admin)
   - `Rejected` → `Submitted` (via Submit_Action by Owner)
2. IF any actor attempts a transition not listed in criterion 1, THEN THE Status_Machine SHALL return a 409 Conflict response and SHALL NOT modify the Expense_Report.
3. THE Status_Machine SHALL validate the current status of the Expense_Report before applying any transition.

---

### Requirement 10: Status Visibility

**User Story:** As a user, I want to see the current status of each expense report on the dashboard, so that I know where each report is in the review process.

#### Acceptance Criteria

1. THE Dashboard SHALL display the current status of each Expense_Report in the report list.
2. THE Report_Service SHALL include the status field in all Expense_Report API responses.
3. WHEN an Expense_Report has status `Rejected`, THE Dashboard SHALL display the Admin_Notes alongside the status for the Owner.

---

### Requirement 11: Status Change Audit Log

**User Story:** As an admin, I want every status change on an expense report to be recorded with a timestamp, so that I have a complete, traceable history of how each report progressed through the workflow.

#### Acceptance Criteria

1. WHEN an Owner creates a new Expense_Report, THE Report_Service SHALL write an Audit_Entry to the Status_Audit_Log recording the Expense_Report identifier, the status `In Progress`, and the UTC datetime of creation.
2. WHEN the Status_Machine applies any status transition to an Expense_Report, THE Status_Machine SHALL write an Audit_Entry to the Status_Audit_Log recording the Expense_Report identifier, the new status value, and the UTC datetime of the transition.
3. THE Report_Service SHALL generate all Audit_Entry timestamps server-side in UTC; client-supplied timestamps SHALL NOT be used for Audit_Entry records.
4. THE Status_Audit_Log SHALL preserve all Audit_Entry records for an Expense_Report regardless of subsequent status changes to that Expense_Report.
5. IF writing an Audit_Entry fails, THEN THE Report_Service SHALL roll back the associated status change and return a 500 Internal Server Error, so that the Expense_Report status and the Status_Audit_Log remain consistent.
6. THE Report_Service SHALL include the Expense_Report identifier, the new status value, and the UTC datetime in every Audit_Entry stored in the Status_Audit_Log.
