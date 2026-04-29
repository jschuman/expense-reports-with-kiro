# Implementation Plan: User Roles and Logout

## Overview

This implementation adds role-based access control (RBAC) and logout functionality to the Expense Report Web App. The feature introduces a Role entity with two initial roles (User and Admin), modifies expense report visibility based on role, and adds logout capability. Implementation follows a backend-first approach: database migration → backend models and services → API endpoints → frontend integration.

## Tasks

- [x] 1. Create database migration for roles
  - Create Alembic migration script to add roles table and role_id column to users
  - Migration must create roles table with id and name columns
  - Migration must insert "User" (id=1) and "Admin" (id=2) roles
  - Migration must add role_id column to users table
  - Migration must assign role_id=1 (User) to all existing users
  - Migration must add foreign key constraint from users.role_id to roles.id
  - _Requirements: 1.1, 1.2, 1.5, 6.1, 6.2, 6.3_

- [ ] 2. Run and verify database migration
  - Execute migration using Alembic: `alembic upgrade head`
  - Verify roles table exists with User and Admin roles
  - Verify all existing users have role_id assigned
  - Verify foreign key constraint is enforced
  - _Requirements: 1.1, 1.2, 1.5, 6.1, 6.2, 6.3_

- [ ] 3. Update seed file to create users with roles
  - Modify backend/seed.py to query Role table for User and Admin roles
  - Create three users: "admin" with Admin role and two "users" with User role
  - Set passwords: admin/admin123, user1/user123, user2/user123
  - Ensure seed script is idempotent (check if users exist before creating)
  - _Requirements: 1.3, 1.4, 6.2_

- [ ] 4. Implement Role model
  - [ ] 4.1 Create backend/app/models/role.py with Role ORM model
    - Define Role class with id and name columns
    - Add unique constraint on name column
    - Add index on name column
    - Define relationship to User model
    - _Requirements: 1.1, 1.2_
  
  - [ ] 4.2 Write unit tests for Role model
    - Test Role model creation
    - Test unique constraint on role name
    - Test relationship to User model
    - _Requirements: 1.1, 1.2_

- [ ] 5. Modify User model to include role relationship
  - [ ] 5.1 Update backend/app/models/user.py
    - Add role_id foreign key column
    - Add role relationship to Role entity
    - Import Role type for type checking
    - _Requirements: 1.3, 1.5_
  
  - [ ] 5.2 Write unit tests for User model with role
    - Test User model with role_id foreign key
    - Test role relationship loading
    - Test that user without role_id fails validation
    - _Requirements: 1.3, 1.5_

- [ ] 6. Checkpoint - Verify database schema and models
  - Ensure all tests pass for Role and User models
  - Verify database schema matches ORM models
  - Ask the user if questions arise

- [ ] 7. Implement report service functions for role-based access
  - [ ] 7.1 Add get_all_reports function to backend/app/services/report_service.py
    - Implement function to return all expense reports ordered by id
    - Eagerly load owner relationship using joinedload
    - _Requirements: 2.1, 2.2_
  
  - [ ] 6.2 Write unit tests for report service
    - Test get_all_reports returns all reports
    - Test get_reports_for_user filters by owner_id
    - Test eager loading of owner relationship
    - _Requirements: 2.1, 3.1_
  
  - [ ] 6.3 Write property test for admin report visibility
    - **Property 2: Admin Report Visibility**
    - **Validates: Requirements 2.1, 2.2, 2.3**
    - Test that admin users receive all reports with owner information
    - Use Hypothesis to generate multiple users and reports
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [ ] 6.4 Write property test for user report filtering
    - **Property 3: User Report Filtering**
    - **Validates: Requirements 3.1, 5.3**
    - Test that user role users see only their own reports
    - Use Hypothesis to generate multiple users and reports
    - _Requirements: 3.1, 5.3_

- [ ] 7. Implement report service functions for role-based access
  - [ ] 7.1 Add get_all_reports function to backend/app/services/report_service.py
    - Implement function to return all expense reports ordered by id
    - Eagerly load owner relationship using joinedload
    - _Requirements: 2.1, 2.2_
  
  - [ ] 7.2 Write unit tests for report service
    - Test get_all_reports returns all reports
    - Test get_reports_for_user filters by owner_id
    - Test eager loading of owner relationship
    - _Requirements: 2.1, 3.1_
  
  - [ ] 7.3 Write property test for admin report visibility
    - **Property 2: Admin Report Visibility**
    - **Validates: Requirements 2.1, 2.2, 2.3**
    - Test that admin users receive all reports with owner information
    - Use Hypothesis to generate multiple users and reports
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [ ] 7.4 Write property test for user report filtering
    - **Property 3: User Report Filtering**
    - **Validates: Requirements 3.1, 5.3**
    - Test that user role users see only their own reports
    - Use Hypothesis to generate multiple users and reports
    - _Requirements: 3.1, 5.3_

- [ ] 8. Update reports router for role-based filtering
  - [ ] 8.1 Modify list_reports endpoint in backend/app/routers/reports.py
    - Add role-based branching logic (Admin vs User)
    - Eagerly load role relationship for current_user
    - Call get_all_reports for Admin role
    - Call get_reports_for_user for User role
    - _Requirements: 2.1, 3.1, 5.1, 5.2_
  
  - [ ] 8.2 Write unit tests for reports router
    - Test list_reports with Admin role returns all reports
    - Test list_reports with User role returns filtered reports
    - Test role-based branching logic
    - _Requirements: 2.1, 3.1, 5.1, 5.2_
  
  - [ ] 8.3 Write integration tests for role-based report access
    - Test end-to-end: Admin login → GET /reports → receives all reports
    - Test end-to-end: User login → GET /reports → receives only own reports
    - Test that reports include owner_username for admin users
    - Test that user cannot see other users' reports
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 5.2, 5.3_
  
  - [ ] 8.4 Write property test for role retrieval from session
    - **Property 6: Role Retrieval from Session**
    - **Validates: Requirements 5.1**
    - Test that system correctly retrieves role from session
    - Use Hypothesis to generate different role assignments
    - _Requirements: 5.1_

- [ ] 9. Update auth schemas to include role field
  - [ ] 9.1 Modify UserResponse in backend/app/schemas/auth.py
    - Add role field (string type) to UserResponse schema
    - Add docstring explaining role field
    - _Requirements: 7.1, 7.2, 7.3_
  
  - [ ] 9.2 Write unit tests for auth schemas
    - Test UserResponse serialization includes role field
    - Test UserResponse with different role values
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 10. Update auth router to return role information
  - [ ] 10.1 Modify login endpoint in backend/app/routers/auth.py
    - Eagerly load role relationship before returning UserResponse
    - Ensure role field is included in response
    - _Requirements: 7.1_
  
  - [ ] 10.2 Modify /me endpoint in backend/app/routers/auth.py
    - Eagerly load role relationship before returning UserResponse
    - Ensure role field is included in response
    - _Requirements: 7.2_
  
  - [ ] 10.3 Write unit tests for auth router
    - Test login response includes role field
    - Test /me response includes role field
    - Test logout clears session
    - _Requirements: 7.1, 7.2, 4.1_
  
  - [ ] 10.4 Write integration tests for auth with roles
    - Test POST /auth/login returns role field
    - Test GET /auth/me returns role field
    - Test authentication fails for user without role
    - _Requirements: 7.1, 7.2, 6.4_
  
  - [ ] 10.5 Write property test for authentication response includes role
    - **Property 7: Authentication Response Includes Role**
    - **Validates: Requirements 7.1, 7.2**
    - Test that authentication responses include role field
    - Use Hypothesis to generate users with different roles
    - _Requirements: 7.1, 7.2_

- [ ] 11. Checkpoint - Verify backend implementation
  - Ensure all backend tests pass
  - Verify API endpoints return correct data for Admin and User roles
  - Test logout endpoint clears session
  - Ask the user if questions arise

- [ ] 12. Implement logout functionality tests
  - [ ] 12.1 Write integration tests for logout
    - Test POST /auth/logout clears session
    - Test protected endpoints return 401 after logout
    - Test logout is idempotent (can logout twice)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  
  - [ ] 12.2 Write property test for logout session clearing
    - **Property 4: Logout Session Clearing**
    - **Validates: Requirements 4.1**
    - Test that logout clears all session data
    - Use Hypothesis to generate different session states
    - _Requirements: 4.1_
  
  - [ ] 12.3 Write property test for protected endpoint authorization
    - **Property 5: Protected Endpoint Authorization**
    - **Validates: Requirements 4.4**
    - Test that protected endpoints reject invalid sessions
    - Use Hypothesis to test multiple protected endpoints
    - _Requirements: 4.4_

- [ ] 13. Update OpenAPI documentation
  - Modify backend/docs/openapi.yaml to include role field in UserResponse
  - Update GET /reports endpoint description to explain role-based behavior
  - Verify documentation matches implementation
  - _Requirements: 2.1, 3.1, 7.1, 7.2_

- [ ] 14. Create frontend User type
  - [ ] 14.1 Create frontend/src/types/user.ts
    - Define User interface with id, username, and role fields
    - Add JSDoc comments explaining each field
    - _Requirements: 7.1, 7.2, 7.4_
  
  - [ ] 14.2 Write unit tests for User type
    - Test User type structure matches backend UserResponse
    - _Requirements: 7.1, 7.2_

- [ ] 15. Update frontend auth API
  - [ ] 15.1 Modify frontend/src/api/auth.ts
    - Update LoginResponse interface to include role field
    - Add logout function that calls POST /auth/logout
    - Update getCurrentUser return type to include role
    - _Requirements: 4.5, 7.1, 7.2_
  
  - [ ] 15.2 Write unit tests for auth API
    - Test logout function calls correct endpoint
    - Test logout function handles errors appropriately
    - Test login and getCurrentUser parse role field
    - _Requirements: 4.5, 7.1, 7.2_

- [ ] 16. Create useAuth hook
  - [ ] 16.1 Create frontend/src/hooks/useAuth.ts
    - Implement hook to fetch current user on mount
    - Provide user, isLoading, and error states
    - Use getCurrentUser API function
    - _Requirements: 7.4_
  
  - [ ] 16.2 Write unit tests for useAuth hook
    - Test useAuth hook fetches user data on mount
    - Test useAuth hook handles loading states
    - Test useAuth hook handles errors
    - _Requirements: 7.4_

- [ ] 17. Update DashboardPage with logout and role display
  - [ ] 17.1 Modify frontend/src/pages/DashboardPage.tsx
    - Add useAuth hook to access current user
    - Add logout button in header
    - Display user role information below page title
    - Update page title based on role (Admin: "All Expense Reports", User: "My Expense Reports")
    - Implement handleLogout function that calls logout API and navigates to login
    - _Requirements: 2.3, 3.3, 4.5, 4.6, 4.7, 7.4_
  
  - [ ] 17.2 Write component tests for DashboardPage
    - Test dashboard displays logout button
    - Test logout button triggers logout and navigation
    - Test dashboard displays user role information
    - Test page title changes based on role (Admin vs User)
    - Test dashboard displays owner_username for admin users
    - _Requirements: 2.3, 2.4, 3.3, 4.5, 4.6, 4.7, 7.4_
  
  - [ ] 17.3 Write integration tests for logout flow
    - Test complete logout flow: click button → API call → redirect
    - Test logout with API failure shows error message
    - Test session expiration redirects to login
    - _Requirements: 4.5, 4.6_

- [ ] 18. Final checkpoint - End-to-end verification
  - Ensure all tests pass (backend and frontend)
  - Verify admin users can see all reports with owner information
  - Verify regular users can only see their own reports
  - Verify logout functionality works correctly
  - Verify role information is displayed in UI
  - Ask the user if questions arise

- [ ] 19. Write property test for user creation assigns role
  - **Property 1: User Creation Assigns Role**
  - **Validates: Requirements 1.4**
  - Test that any new user creation assigns a role_id
  - Use Hypothesis to generate valid user creation data
  - Place in backend/tests/property/test_role_properties.py
  - _Requirements: 1.4_

## Notes

- All tasks reference specific requirements for traceability
- Property tests validate universal correctness properties from the design
- Testing follows red-green-refactor: tests are written alongside implementation
- Backend implementation precedes frontend to ensure API contract is stable
- Checkpoints ensure incremental validation and allow for user feedback
- Migration must be executed before any code changes to ensure database schema is ready
- All testing tasks are required per project testing strategy
