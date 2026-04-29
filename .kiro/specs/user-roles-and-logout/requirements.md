# Requirements Document

## Introduction

This document specifies requirements for adding role-based access control and logout functionality to the Expense Report Web App. The feature introduces a Role entity with two initial roles (User and Admin), modifies expense report visibility based on role, and adds logout capability to the authentication system.

## Glossary

- **Role**: An entity representing a user's permission level in the system, determining what expense reports they can view
- **User_Role**: A role with restricted access that can only view expense reports they own
- **Admin_Role**: A role with elevated access that can view all expense reports in the system
- **Expense_Report_System**: The backend system that manages expense report creation, storage, and retrieval
- **Auth_System**: The backend authentication system that manages login, logout, and session management
- **User**: An authenticated account in the system with an assigned role
- **Session**: A server-side session established after successful login, stored via HTTP-only cookie
- **Dashboard**: The main page displaying expense reports based on the authenticated user's role
- **Logout_Button**: A UI control that allows users to terminate their session and return to the login screen

## Requirements

### Requirement 1: Role Entity and Assignment

**User Story:** As a system administrator, I want roles to be stored as distinct entities in the database, so that the system can be extended with additional roles in the future without structural changes.

#### Acceptance Criteria

1. THE Expense_Report_System SHALL store Role as a separate database entity with a unique identifier and name
2. THE Expense_Report_System SHALL support at least two roles: User_Role and Admin_Role
3. THE Expense_Report_System SHALL associate each User with exactly one Role
4. WHEN a User is created, THE Expense_Report_System SHALL assign a default Role to that User
5. THE Expense_Report_System SHALL enforce referential integrity between User and Role entities

### Requirement 2: Admin Report Visibility

**User Story:** As an admin, I want to see all expense reports in the system, so that I can review and manage reports from all users.

#### Acceptance Criteria

1. WHEN an authenticated User with Admin_Role requests expense reports, THE Expense_Report_System SHALL return all expense reports in the system
2. THE Expense_Report_System SHALL include owner information for each expense report returned to Admin_Role users
3. WHEN an Admin_Role user views the Dashboard, THE Dashboard SHALL display all expense reports with clear indication of each report's owner
4. FOR ALL expense reports visible to Admin_Role users, THE Dashboard SHALL display the owner_username field

### Requirement 3: User Report Visibility

**User Story:** As a regular user, I want to see only my own expense reports, so that I maintain privacy and focus on my own submissions.

#### Acceptance Criteria

1. WHEN an authenticated User with User_Role requests expense reports, THE Expense_Report_System SHALL return only expense reports where the owner_id matches the authenticated User's id
2. THE Expense_Report_System SHALL not return expense reports owned by other users to User_Role users
3. WHEN a User_Role user views the Dashboard, THE Dashboard SHALL display only expense reports they own

### Requirement 4: Logout Functionality

**User Story:** As a user, I want to log out of the application, so that I can end my session and protect my account when using shared devices.

#### Acceptance Criteria

1. WHEN an authenticated User requests logout, THE Auth_System SHALL clear the user's session
2. WHEN an authenticated User requests logout, THE Auth_System SHALL invalidate the session cookie
3. WHEN logout completes successfully, THE Auth_System SHALL return a success response
4. WHEN a User with an invalidated session attempts to access protected resources, THE Auth_System SHALL return a 401 Unauthorized response
5. WHEN a User clicks the Logout_Button, THE Dashboard SHALL send a logout request to the Auth_System
6. WHEN logout completes successfully, THE Dashboard SHALL redirect the User to the login screen
7. THE Dashboard SHALL display a Logout_Button to all authenticated users

### Requirement 5: Role-Based Authorization

**User Story:** As a system, I want to enforce role-based access control at the API level, so that users cannot bypass frontend restrictions to access unauthorized data.

#### Acceptance Criteria

1. WHEN a User requests expense reports, THE Expense_Report_System SHALL determine the User's Role from the authenticated session
2. THE Expense_Report_System SHALL apply role-based filtering before returning expense report data
3. WHEN a User_Role user attempts to access an expense report they do not own, THE Expense_Report_System SHALL not include that report in the response
4. THE Expense_Report_System SHALL enforce role-based access control for all expense report retrieval operations

### Requirement 6: Backward Compatibility

**User Story:** As a developer, I want existing users to be assigned a default role during migration, so that the system continues to function without manual intervention.

#### Acceptance Criteria

1. WHEN the Role entity is introduced to the database, THE Expense_Report_System SHALL create User_Role and Admin_Role entries
2. WHEN existing User records are migrated, THE Expense_Report_System SHALL assign User_Role to all existing users by default
3. THE Expense_Report_System SHALL ensure all User records have a valid Role assignment after migration
4. WHEN a User without a Role attempts to authenticate, THE Auth_System SHALL reject the authentication request

### Requirement 7: Session State and Role Information

**User Story:** As a frontend application, I want to know the authenticated user's role, so that I can display appropriate UI elements and messaging.

#### Acceptance Criteria

1. WHEN a User successfully authenticates, THE Auth_System SHALL include the User's Role in the authentication response
2. WHEN a User requests their current session information, THE Auth_System SHALL include the User's Role in the response
3. THE Auth_System SHALL return the Role name as a string field in user profile responses
4. WHEN the Dashboard loads, THE Dashboard SHALL display the authenticated User's role information

