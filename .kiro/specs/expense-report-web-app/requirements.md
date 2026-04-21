# Requirements Document

## Introduction

The Expense Report Web App allows authenticated users to create and manage expense reports. Users log in with a username and password, view their reports on a dashboard, and submit new reports with a title, purpose, and total amount. Submitted reports are saved with a "Pending" status. Unauthenticated users are redirected to the login screen for all page requests.

## Glossary

- **App**: The Expense Report Web App, the system described in this document.
- **User**: A person who interacts with the App.
- **Authenticated_User**: A User who has successfully completed the login process.
- **Unauthenticated_User**: A User who has not completed the login process or whose session has expired.
- **Dashboard**: The main page of the App, displaying the list of expense reports belonging to the Authenticated_User.
- **Expense_Report**: A record consisting of a Title, Purpose, Total_Amount, and Status, associated with an Authenticated_User.
- **Login_Screen**: The page where a User provides credentials to authenticate.
- **Create_Report_Form**: The form displayed to an Authenticated_User for entering Expense_Report details.
- **Status**: The current state of an Expense_Report. Valid values are: `Pending`.

## Requirements

### Requirement 1: User Authentication

**User Story:** As a User, I want to log in with a username and password, so that I can securely access my expense reports.

#### Acceptance Criteria

1. THE App SHALL require a username and password to authenticate a User.
2. WHEN a User submits valid credentials, THE App SHALL establish an authenticated session for that User and redirect the User to the Dashboard.
3. IF a User submits invalid credentials, THEN THE App SHALL display an error message indicating that the credentials are incorrect.
4. WHILE a User is Unauthenticated, THE App SHALL redirect all page requests to the Login_Screen.

---

### Requirement 2: Expense Report Dashboard

**User Story:** As an Authenticated_User, I want to see all my expense reports on a dashboard, so that I can review and manage them in one place.

#### Acceptance Criteria

1. WHEN an Authenticated_User accesses the Dashboard, THE App SHALL display all Expense_Reports associated with that Authenticated_User.
2. WHEN an Authenticated_User accesses the Dashboard, THE App SHALL provide a "Create New Report" action.
3. IF the Authenticated_User has no Expense_Reports, THEN THE App SHALL display a message indicating that no reports exist.

---

### Requirement 3: Create Expense Report

**User Story:** As an Authenticated_User, I want to fill out and submit a new expense report, so that I can record my expenses for review.

#### Acceptance Criteria

1. WHEN an Authenticated_User activates the "Create New Report" action, THE App SHALL display the Create_Report_Form with fields for Title, Purpose, and Total_Amount.
2. WHEN an Authenticated_User submits the Create_Report_Form with all required fields populated, THE App SHALL save the Expense_Report with a Status of `Pending` and associate it with the Authenticated_User.
3. WHEN an Authenticated_User successfully submits the Create_Report_Form, THE App SHALL redirect the Authenticated_User to the Dashboard.
4. IF an Authenticated_User submits the Create_Report_Form with one or more required fields empty, THEN THE App SHALL display a validation error identifying each missing field and SHALL NOT save the Expense_Report.
5. IF an Authenticated_User submits the Create_Report_Form with a Total_Amount that is not a positive numeric value, THEN THE App SHALL display a validation error and SHALL NOT save the Expense_Report.
