# Design Document: User Roles and Logout

## Overview

This design introduces role-based access control (RBAC) and logout functionality to the Expense Report Web App. The system will support two roles: **User** (restricted access to own reports) and **Admin** (access to all reports). The design adds a new `Role` entity, modifies the `User` model to reference roles, updates report retrieval logic to filter based on roles, and enhances the frontend to display logout functionality and role information.

### Key Design Decisions

1. **Role as a separate entity**: Storing roles as database entities (rather than an enum column) enables future extensibility without schema changes
2. **Server-side enforcement**: Role-based filtering occurs in the service layer, ensuring API-level security regardless of frontend behavior
3. **Backward compatibility**: Existing users will be assigned the "User" role during migration
4. **Session-based logout**: Leverages existing SessionMiddleware infrastructure for stateless logout

## Architecture

### System Components

The feature impacts the following architectural layers:

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ DashboardPage  │  │ LogoutButton │  │ RoleDisplay     │ │
│  │ (modified)     │  │ (new)        │  │ (new)           │ │
│  └────────────────┘  └──────────────┘  └─────────────────┘ │
│           │                  │                   │           │
│           └──────────────────┴───────────────────┘           │
│                              │                               │
└──────────────────────────────┼───────────────────────────────┘
                               │ HTTP/JSON
┌──────────────────────────────┼───────────────────────────────┐
│                        Backend (FastAPI)                      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              API Layer (Routers)                       │  │
│  │  /auth/logout (existing)  /auth/me (modified)         │  │
│  │  /reports (modified)                                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                              │                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │           Service Layer (Business Logic)               │  │
│  │  report_service.get_reports_for_user (modified)        │  │
│  │  report_service.get_all_reports (new)                  │  │
│  └────────────────────────────────────────────────────────┘  │
│                              │                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Data Layer (SQLAlchemy ORM)               │  │
│  │  User (modified)  Role (new)  ExpenseReport (unchanged)│  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

### Data Flow

**Admin viewing reports:**
```
Dashboard → GET /reports → get_current_user (extracts user + role)
  → report_service checks role → returns all reports → Dashboard displays all
```

**User viewing reports:**
```
Dashboard → GET /reports → get_current_user (extracts user + role)
  → report_service checks role → filters by owner_id → Dashboard displays own reports
```

**Logout flow:**
```
LogoutButton → POST /auth/logout → session.clear() → redirect to /login
```

## Components and Interfaces

### Backend Components

#### 1. Role Model (New)

**File:** `backend/app/models/role.py`

```python
"""SQLAlchemy ORM model for the Role entity."""

from __future__ import annotations

from typing import TYPE_CHECKING, List

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)

    users: Mapped[List["User"]] = relationship("User", back_populates="role")
```

**Responsibilities:**
- Store role definitions (User, Admin)
- Provide relationship to User entities
- Enforce unique role names via database constraint

#### 2. User Model (Modified)

**File:** `backend/app/models/user.py`

**Changes:**
- Add `role_id` foreign key column
- Add `role` relationship to Role entity
- Maintain existing `reports` relationship

```python
"""SQLAlchemy ORM model for the User entity."""

from __future__ import annotations

from typing import TYPE_CHECKING, List

from sqlalchemy import Integer, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.expense_report import ExpenseReport
    from app.models.role import Role


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(
        String(150), unique=True, nullable=False, index=True
    )
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role_id: Mapped[int] = mapped_column(Integer, ForeignKey("roles.id"), nullable=False)

    role: Mapped["Role"] = relationship("Role", back_populates="users")
    reports: Mapped[List["ExpenseReport"]] = relationship(
        "ExpenseReport", back_populates="owner"
    )
```

#### 3. Report Service (Modified)

**File:** `backend/app/services/report_service.py`

**New function:**
```python
def get_all_reports(db: Session) -> list[ExpenseReport]:
    """Return all expense reports in the system, ordered by id ascending.
    
    Used for Admin role users. Eagerly loads owner relationship.
    """
    return (
        db.query(ExpenseReport)
        .options(joinedload(ExpenseReport.owner))
        .order_by(ExpenseReport.id)
        .all()
    )
```

**Modified function:**
```python
def get_reports_for_user(db: Session, user_id: int) -> list[ExpenseReport]:
    """Return expense reports owned by user_id, ordered by id ascending.
    
    Used for User role users. Eagerly loads owner relationship.
    """
    # Existing implementation unchanged
```

#### 4. Reports Router (Modified)

**File:** `backend/app/routers/reports.py`

**Changes to `list_reports` endpoint:**
```python
@router.get("", response_model=List[ExpenseReportResponse])
def list_reports(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[ExpenseReportResponse]:
    """Return expense reports based on the authenticated user's role.
    
    - Admin role: returns all reports in the system
    - User role: returns only reports owned by the authenticated user
    
    Returns 401 when no valid session cookie is present.
    """
    # Eagerly load role to avoid additional query
    db.refresh(current_user, attribute_names=["role"])
    
    if current_user.role.name == "Admin":
        reports = report_service.get_all_reports(db)
    else:
        reports = report_service.get_reports_for_user(db, current_user.id)
    
    return [_to_response(r) for r in reports]
```

#### 5. Auth Schemas (Modified)

**File:** `backend/app/schemas/auth.py`

**Changes:**
- Add `role` field to `UserResponse`

```python
"""Pydantic schemas for authentication endpoints."""

from pydantic import BaseModel, ConfigDict


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    role: str  # New field: role name (e.g., "User", "Admin")

    model_config = ConfigDict(from_attributes=True)
```

#### 6. Auth Router (Modified)

**File:** `backend/app/routers/auth.py`

**Changes to `/login` and `/me` endpoints:**
```python
@router.post("/login", response_model=UserResponse)
def login(
    credentials: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> UserResponse:
    """Authenticate a user and establish a session via HTTP-only cookie."""
    user: User | None = auth_service.authenticate_user(
        db, credentials.username, credentials.password
    )
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    request.session["user_id"] = user.id
    
    # Eagerly load role for response
    db.refresh(user, attribute_names=["role"])
    
    return UserResponse(
        id=user.id,
        username=user.username,
        role=user.role.name
    )


@router.get("/me", response_model=UserResponse)
def me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> UserResponse:
    """Return the currently authenticated user with role information."""
    # Eagerly load role
    db.refresh(current_user, attribute_names=["role"])
    
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        role=current_user.role.name
    )
```

**Note:** The `/logout` endpoint already exists and requires no changes.

### Frontend Components

#### 1. User Type (Modified)

**File:** `frontend/src/types/user.ts` (new file)

```typescript
/**
 * User types mirroring backend auth schemas.
 */

export interface User {
  id: number;
  username: string;
  role: string;
}
```

#### 2. Auth API (Modified)

**File:** `frontend/src/api/auth.ts`

**Changes:**
- Update return types to include `role` field
- Add logout function

```typescript
export interface LoginResponse {
  id: number;
  username: string;
  role: string;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  // Existing implementation, updated return type
}

export async function logout(): Promise<void> {
  const response = await fetch('/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
  
  if (!response.ok) {
    throw new Error('Logout failed');
  }
}

export async function getCurrentUser(): Promise<LoginResponse> {
  // Existing implementation, updated return type
}
```

#### 3. Dashboard Page (Modified)

**File:** `frontend/src/pages/DashboardPage.tsx`

**Changes:**
- Add logout button in header
- Display user role information
- Update page title based on role (Admin sees "All Expense Reports", User sees "My Expense Reports")

```typescript
export function DashboardPage() {
  const { reports, isLoading, error } = useReports();
  const { user } = useAuth(); // New hook to access current user
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      // Handle error
    }
  };

  const pageTitle = user?.role === 'Admin' 
    ? 'All Expense Reports' 
    : 'My Expense Reports';

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" component="h1">
            {pageTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Logged in as {user?.username} ({user?.role})
          </Typography>
        </Box>
        <Box display="flex" gap={2}>
          <Button
            variant="contained"
            onClick={() => navigate('/reports/new')}
          >
            Create New Report
          </Button>
          <Button
            variant="outlined"
            onClick={handleLogout}
          >
            Logout
          </Button>
        </Box>
      </Box>

      {/* Existing report display logic */}
    </Container>
  );
}
```

#### 4. Auth Hook (New)

**File:** `frontend/src/hooks/useAuth.ts`

```typescript
/**
 * Hook for accessing current user information.
 * Fetches user data on mount and provides loading/error states.
 */

import { useState, useEffect } from 'react';
import { getCurrentUser } from '../api/auth';
import type { User } from '../types/user';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => setError('Failed to load user information'))
      .finally(() => setIsLoading(false));
  }, []);

  return { user, isLoading, error };
}
```

## Data Models

### Database Schema Changes

#### New Table: `roles`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | Unique role identifier |
| name | VARCHAR(50) | UNIQUE, NOT NULL, INDEX | Role name (e.g., "User", "Admin") |

**Initial data:**
- `(1, "User")`
- `(2, "Admin")`

#### Modified Table: `users`

**New column:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| role_id | INTEGER | FOREIGN KEY(roles.id), NOT NULL | Reference to user's role |

**Migration strategy:**
1. Create `roles` table
2. Insert "User" and "Admin" roles
3. Add `role_id` column to `users` table
4. Set all existing users' `role_id` to the "User" role's id
5. Add NOT NULL constraint to `role_id`

### SQLAlchemy ORM Models

See "Components and Interfaces" section for complete model definitions.

**Key relationships:**
- `Role.users` → one-to-many → `User.role`
- `User.reports` → one-to-many → `ExpenseReport.owner` (unchanged)

### Pydantic Schemas

#### UserResponse (Modified)

```python
class UserResponse(BaseModel):
    id: int
    username: str
    role: str  # New field
    
    model_config = ConfigDict(from_attributes=True)
```

**Usage:**
- Returned by `POST /auth/login`
- Returned by `GET /auth/me`

#### ExpenseReportResponse (Unchanged)

No changes required. The `owner_username` field already provides owner information for admin users.

### TypeScript Types

#### User (New)

```typescript
export interface User {
  id: number;
  username: string;
  role: string;
}
```

#### ExpenseReportResponse (Unchanged)

Existing type already includes `owner_username` field needed for admin view.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Before defining properties, I need to analyze the acceptance criteria for testability using the prework tool.


### Property Reflection

After analyzing all acceptance criteria, I've identified the following redundancies:

**Redundant Properties:**
- **2.4** (Dashboard displays owner_username) is redundant with **2.3** (Dashboard displays owner information) - both test the same UI rendering behavior
- **3.2** (System doesn't return other users' reports) is logically redundant with **3.1** (System returns only owned reports) - if all returned reports match owner_id, then non-matching reports are necessarily excluded
- **4.2** (Invalidate session cookie) is redundant with **4.1** (Clear session) - clearing the session invalidates the cookie
- **5.2, 5.3, 5.4** (Role-based filtering enforcement) are all redundant with **2.1** (Admin sees all) and **3.1** (User sees own) - these specific tests already verify the filtering logic
- **7.3** (Role as string field) is redundant with **7.1** and **7.2** (Login and /me include role) - if both endpoints include the role field, the format requirement is already tested

**Combined Properties:**
- **2.1, 2.2, 2.3** can be combined into a single comprehensive property: "Admin users receive all reports with owner information"
- **7.1 and 7.2** can be combined into: "Authentication responses include role information"

**Final Property Set:**
1. User creation assigns default role (1.4)
2. Admin users see all reports with owner information (2.1 + 2.2 + 2.3)
3. User role users see only their own reports (3.1)
4. Logout clears session state (4.1)
5. Invalidated sessions are rejected by protected endpoints (4.4)
6. Role information is retrieved from authenticated session (5.1)
7. Authentication responses include role information (7.1 + 7.2)

### Correctness Properties

### Property 1: User Creation Assigns Role

*For any* valid user creation data (username and password), when a new user is created, the system SHALL assign a role_id to that user, and the user SHALL have a valid role relationship.

**Validates: Requirements 1.4**

### Property 2: Admin Report Visibility

*For any* database state containing expense reports from multiple users, when an authenticated user with Admin role requests expense reports, the system SHALL return all expense reports in the database, and each returned report SHALL include the owner_username field.

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 3: User Report Filtering

*For any* authenticated user with User role and any database state containing expense reports, when that user requests expense reports, the system SHALL return only reports where owner_id matches the authenticated user's id, and SHALL NOT return any reports with different owner_ids.

**Validates: Requirements 3.1, 5.3**

### Property 4: Logout Session Clearing

*For any* authenticated user session, when the user requests logout, the system SHALL clear all session data, and subsequent requests SHALL NOT contain the user_id in the session.

**Validates: Requirements 4.1**

### Property 5: Protected Endpoint Authorization

*For any* protected endpoint and any request with an invalidated or missing session, the system SHALL return a 401 Unauthorized response and SHALL NOT execute the endpoint logic.

**Validates: Requirements 4.4**

### Property 6: Role Retrieval from Session

*For any* authenticated user, when the system processes a request requiring role information, the system SHALL correctly retrieve the user's role from the database based on the session's user_id, and the retrieved role SHALL match the role assigned to that user.

**Validates: Requirements 5.1**

### Property 7: Authentication Response Includes Role

*For any* user with any assigned role, when that user successfully authenticates (via login or session verification), the authentication response SHALL include a role field containing the user's role name as a string.

**Validates: Requirements 7.1, 7.2**

## Error Handling

### Backend Error Scenarios

#### 1. Missing Role Assignment

**Scenario:** User record exists without a role_id (data integrity violation)

**Handling:**
- Authentication should fail with 401 Unauthorized
- Log error for investigation
- Migration should prevent this state

**Implementation:**
```python
# In auth_service.authenticate_user
user = db.query(User).filter(User.username == username).first()
if user is None or user.role_id is None:
    return None  # Treat as authentication failure
```

#### 2. Invalid Role Reference

**Scenario:** User has role_id pointing to non-existent role

**Handling:**
- Database foreign key constraint prevents this at write time
- If somehow occurs, treat as authentication failure
- Log error for investigation

#### 3. Logout with No Active Session

**Scenario:** User calls POST /auth/logout without an active session

**Handling:**
- Return 200 OK with success message (idempotent operation)
- No error thrown - logout of non-existent session is a no-op

**Implementation:**
```python
@router.post("/logout")
def logout(request: Request) -> dict:
    """Clear session - idempotent operation."""
    request.session.clear()  # Safe even if session is empty
    return {"detail": "Logged out"}
```

#### 4. Role-Based Access with Missing Role

**Scenario:** Authenticated user's role relationship fails to load

**Handling:**
- Return 500 Internal Server Error
- Log error with user_id and context
- Indicates database integrity issue

**Implementation:**
```python
# In reports router
db.refresh(current_user, attribute_names=["role"])
if current_user.role is None:
    logger.error(f"User {current_user.id} has no role relationship")
    raise HTTPException(status_code=500, detail="Internal server error")
```

### Frontend Error Scenarios

#### 1. Logout API Failure

**Scenario:** POST /auth/logout returns non-2xx status

**Handling:**
- Display error message to user
- Do NOT redirect to login (session may still be valid)
- Allow user to retry

**Implementation:**
```typescript
const handleLogout = async () => {
  try {
    await logout();
    navigate('/login');
  } catch (err) {
    setError('Logout failed. Please try again.');
  }
};
```

#### 2. Missing Role in User Response

**Scenario:** Login or /me response doesn't include role field

**Handling:**
- Display error message
- Prevent dashboard access
- Log error for debugging

**Implementation:**
```typescript
// In useAuth hook
if (!userData.role) {
  throw new Error('User role information missing');
}
```

#### 3. Session Expiration During Use

**Scenario:** User's session expires while viewing dashboard

**Handling:**
- API returns 401 for subsequent requests
- Redirect to login page
- Display "Session expired" message

**Implementation:**
```typescript
// In API client
if (response.status === 401) {
  navigate('/login', { state: { message: 'Session expired' } });
}
```

## Testing Strategy

This feature requires a comprehensive testing approach combining unit tests, integration tests, and property-based tests. The testing strategy follows the project's established patterns using pytest (backend) and Vitest (frontend).

### Property-Based Testing Applicability

**Assessment:** Property-based testing (PBT) IS appropriate for this feature.

**Rationale:**
- Core logic involves data filtering and transformation (report visibility based on roles)
- Authorization logic should hold universally across different user/role combinations
- Session management behavior should be consistent regardless of session content
- Response schema validation should work for all valid user states

**PBT Library:** Hypothesis (Python) for backend property tests

**Configuration:**
- Minimum 100 iterations per property test
- Each test tagged with feature name and property reference

### Backend Testing

#### 1. Unit Tests (pytest)

**File:** `backend/tests/unit/test_role_model.py`
- Test Role model creation
- Test unique constraint on role name
- Test relationship to User model

**File:** `backend/tests/unit/test_user_model.py`
- Test User model with role_id foreign key
- Test role relationship loading
- Test that user without role_id fails validation

**File:** `backend/tests/unit/test_report_service.py`
- Test `get_all_reports()` returns all reports
- Test `get_reports_for_user()` filters by owner_id
- Test eager loading of owner relationship

**File:** `backend/tests/unit/test_auth_router.py`
- Test login response includes role field
- Test /me response includes role field
- Test logout clears session

**File:** `backend/tests/unit/test_reports_router.py`
- Test list_reports with Admin role returns all reports
- Test list_reports with User role returns filtered reports
- Test role-based branching logic

#### 2. Integration Tests (pytest)

**File:** `backend/tests/integration/test_role_based_access.py`
- Test end-to-end: Admin login → GET /reports → receives all reports
- Test end-to-end: User login → GET /reports → receives only own reports
- Test end-to-end: User login → logout → GET /reports → 401
- Test that reports include owner_username for admin users
- Test that user cannot see other users' reports

**File:** `backend/tests/integration/test_logout.py`
- Test POST /auth/logout clears session
- Test protected endpoints return 401 after logout
- Test logout is idempotent (can logout twice)

**File:** `backend/tests/integration/test_auth_with_roles.py`
- Test POST /auth/login returns role field
- Test GET /auth/me returns role field
- Test authentication fails for user without role

#### 3. Property-Based Tests (pytest + Hypothesis)

**File:** `backend/tests/property/test_role_properties.py`

```python
"""Property-based tests for role-based access control.

Feature: user-roles-and-logout
"""

from hypothesis import given, strategies as st
import pytest

# Property 1: User Creation Assigns Role
@given(username=st.text(min_size=1, max_size=150), 
       password=st.text(min_size=8))
def test_user_creation_assigns_role(db, username, password):
    """
    Feature: user-roles-and-logout, Property 1: User Creation Assigns Role
    
    For any valid user creation data, the created user SHALL have a role_id assigned.
    """
    # Test implementation
    pass

# Property 2: Admin Report Visibility
@given(num_users=st.integers(min_value=2, max_value=10),
       reports_per_user=st.integers(min_value=1, max_value=5))
def test_admin_sees_all_reports(db, admin_user, num_users, reports_per_user):
    """
    Feature: user-roles-and-logout, Property 2: Admin Report Visibility
    
    For any database state with reports from multiple users, admin SHALL see all reports.
    """
    # Test implementation
    pass

# Property 3: User Report Filtering
@given(num_other_users=st.integers(min_value=1, max_value=10),
       own_reports=st.integers(min_value=0, max_value=10),
       other_reports=st.integers(min_value=1, max_value=10))
def test_user_sees_only_own_reports(db, regular_user, num_other_users, own_reports, other_reports):
    """
    Feature: user-roles-and-logout, Property 3: User Report Filtering
    
    For any user with User role, returned reports SHALL only include reports they own.
    """
    # Test implementation
    pass

# Property 4: Logout Session Clearing
@given(session_data=st.dictionaries(st.text(), st.integers()))
def test_logout_clears_session(client, authenticated_user, session_data):
    """
    Feature: user-roles-and-logout, Property 4: Logout Session Clearing
    
    For any authenticated session, logout SHALL clear all session data.
    """
    # Test implementation
    pass

# Property 5: Protected Endpoint Authorization
@given(endpoint=st.sampled_from(['/reports', '/auth/me']))
def test_protected_endpoints_reject_invalid_session(client, endpoint):
    """
    Feature: user-roles-and-logout, Property 5: Protected Endpoint Authorization
    
    For any protected endpoint, requests without valid session SHALL return 401.
    """
    # Test implementation
    pass

# Property 6: Role Retrieval from Session
@given(role_name=st.sampled_from(['User', 'Admin']))
def test_role_retrieved_from_session(db, client, role_name):
    """
    Feature: user-roles-and-logout, Property 6: Role Retrieval from Session
    
    For any authenticated user, system SHALL correctly retrieve role from session.
    """
    # Test implementation
    pass

# Property 7: Authentication Response Includes Role
@given(role_name=st.sampled_from(['User', 'Admin']))
def test_auth_response_includes_role(db, client, role_name):
    """
    Feature: user-roles-and-logout, Property 7: Authentication Response Includes Role
    
    For any user with any role, authentication response SHALL include role field.
    """
    # Test implementation
    pass
```

**Configuration:** Each property test runs with `settings(max_examples=100)` to ensure comprehensive input coverage.

### Frontend Testing

#### 1. Unit Tests (Vitest)

**File:** `frontend/src/api/auth.test.ts`
- Test logout() function calls correct endpoint
- Test logout() handles errors appropriately
- Test login() and getCurrentUser() parse role field

**File:** `frontend/src/hooks/useAuth.test.ts`
- Test useAuth hook fetches user data on mount
- Test useAuth hook handles loading states
- Test useAuth hook handles errors

#### 2. Component Tests (Vitest + React Testing Library)

**File:** `frontend/src/pages/DashboardPage.test.tsx`
- Test dashboard displays logout button
- Test logout button triggers logout and navigation
- Test dashboard displays user role information
- Test page title changes based on role (Admin vs User)
- Test dashboard displays owner_username for admin users

**File:** `frontend/src/components/LogoutButton.test.tsx` (if created as separate component)
- Test button renders correctly
- Test button click triggers logout callback
- Test button handles logout errors

#### 3. Integration Tests (Vitest)

**File:** `frontend/src/integration/logout-flow.test.ts`
- Test complete logout flow: click button → API call → redirect
- Test logout with API failure shows error message
- Test session expiration redirects to login

### Migration Testing

**File:** `backend/tests/migration/test_role_migration.py`
- Test migration creates roles table
- Test migration inserts User and Admin roles
- Test migration adds role_id column to users
- Test migration assigns User role to existing users
- Test migration enforces NOT NULL constraint

### Test Coverage Requirements

- **Backend:** 100% coverage for all files in `backend/app/`
- **Frontend:** 100% coverage for `frontend/src/api/` and `frontend/src/hooks/`
- **Property tests:** Minimum 100 iterations per test

### Testing Task Requirements

Per project testing strategy, all testing tasks in the implementation plan MUST be marked as required (never optional). This includes:
- Unit tests for new/modified components
- Integration tests for API endpoints
- Property-based tests for correctness properties
- Migration tests for database changes
- Frontend component tests

## Database Migration

### Migration Script

**File:** `backend/migrations/add_roles.py` (or Alembic migration)

```python
"""Add roles table and role_id to users.

Revision ID: add_roles_001
"""

from alembic import op
import sqlalchemy as sa


def upgrade():
    # Create roles table
    op.create_table(
        'roles',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(50), unique=True, nullable=False, index=True),
    )
    
    # Insert default roles
    op.execute("INSERT INTO roles (id, name) VALUES (1, 'User')")
    op.execute("INSERT INTO roles (id, name) VALUES (2, 'Admin')")
    
    # Add role_id column to users (nullable initially)
    op.add_column('users', sa.Column('role_id', sa.Integer(), nullable=True))
    
    # Assign User role to all existing users
    op.execute("UPDATE users SET role_id = 1")
    
    # Make role_id NOT NULL
    op.alter_column('users', 'role_id', nullable=False)
    
    # Add foreign key constraint
    op.create_foreign_key(
        'fk_users_role_id',
        'users', 'roles',
        ['role_id'], ['id']
    )


def downgrade():
    # Remove foreign key constraint
    op.drop_constraint('fk_users_role_id', 'users', type_='foreignkey')
    
    # Remove role_id column
    op.drop_column('users', 'role_id')
    
    # Drop roles table
    op.drop_table('roles')
```

### Migration Execution

```bash
# Generate migration (if using Alembic)
alembic revision --autogenerate -m "Add roles table and role_id to users"

# Review generated migration
# Edit if necessary to include data migration (INSERT roles, UPDATE users)

# Apply migration
alembic upgrade head

# Verify migration
python3 -c "from app.db.database import engine; from sqlalchemy import inspect; print(inspect(engine).get_table_names())"
```

### Post-Migration Verification

1. Verify roles table exists with User and Admin roles
2. Verify all users have role_id assigned
3. Verify foreign key constraint is enforced
4. Run test suite to ensure no regressions

## API Contract Changes

### Modified Endpoints

#### POST /auth/login

**Response Schema Change:**
```json
{
  "id": 1,
  "username": "admin",
  "role": "Admin"  // NEW FIELD
}
```

**Status Codes:** (unchanged)
- 200: Success
- 401: Invalid credentials
- 422: Validation error

#### GET /auth/me

**Response Schema Change:**
```json
{
  "id": 1,
  "username": "admin",
  "role": "Admin"  // NEW FIELD
}
```

**Status Codes:** (unchanged)
- 200: Success
- 401: Not authenticated

#### GET /reports

**Behavior Change:**
- **Admin role:** Returns all expense reports in the system
- **User role:** Returns only reports owned by the authenticated user

**Response Schema:** (unchanged)
```json
[
  {
    "id": 1,
    "title": "Office Supplies",
    "description": "Pens and paper",
    "total_amount": 45.99,
    "status": "Pending",
    "owner_id": 1,
    "owner_username": "admin",  // Already present, now relevant for admins
    "created_at": "2026-04-23T17:00:00Z",
    "reimbursable_from_client": false,
    "client": null,
    "admin_notes": null
  }
]
```

**Status Codes:** (unchanged)
- 200: Success
- 401: Not authenticated

#### POST /auth/logout

**No changes** - endpoint already exists and functions correctly.

### OpenAPI Specification Updates

**File:** `backend/docs/openapi.yaml`

Update the following schemas:

```yaml
components:
  schemas:
    UserResponse:
      type: object
      required:
        - id
        - username
        - role  # NEW FIELD
      properties:
        id:
          type: integer
        username:
          type: string
        role:
          type: string
          description: User's role name (e.g., "User", "Admin")
          example: "User"
```

Update endpoint descriptions:

```yaml
paths:
  /reports:
    get:
      summary: List expense reports
      description: |
        Returns expense reports based on the authenticated user's role.
        - Admin role: returns all reports in the system
        - User role: returns only reports owned by the authenticated user
      # ... rest of endpoint definition
```

## Implementation Notes

### Backend Implementation Order

1. **Create Role model** (`backend/app/models/role.py`)
2. **Modify User model** (add role_id, role relationship)
3. **Create and run migration** (create roles table, populate data, add foreign key)
4. **Add get_all_reports function** to report_service
5. **Modify reports router** (add role-based branching)
6. **Update auth schemas** (add role field to UserResponse)
7. **Modify auth router** (include role in responses)
8. **Write tests** (unit, integration, property-based)

### Frontend Implementation Order

1. **Create User type** (`frontend/src/types/user.ts`)
2. **Update auth API** (add logout function, update return types)
3. **Create useAuth hook** (`frontend/src/hooks/useAuth.ts`)
4. **Modify DashboardPage** (add logout button, role display, conditional title)
5. **Write tests** (unit, component, integration)

### Key Implementation Considerations

1. **Eager Loading:** Always eagerly load the `role` relationship when accessing `current_user.role` to avoid N+1 queries
2. **Role Name Comparison:** Use string comparison (`current_user.role.name == "Admin"`) rather than role_id to make code more readable
3. **Migration Safety:** The migration must handle existing users gracefully by assigning default role before enforcing NOT NULL constraint
4. **Frontend State Management:** Consider using React Context or similar for user state if multiple components need access to role information
5. **Logout Idempotency:** Ensure logout endpoint is idempotent (calling it multiple times has same effect as calling once)

## Security Considerations

1. **Server-Side Enforcement:** Role-based filtering MUST occur in the service layer, not just the frontend
2. **Session Security:** Existing SessionMiddleware provides signed cookies, preventing tampering
3. **Role Integrity:** Foreign key constraints prevent invalid role assignments
4. **Authorization Checks:** Every protected endpoint must verify user authentication and apply role-based logic where applicable
5. **Audit Trail:** Consider logging role-based access for security auditing (future enhancement)

## Future Enhancements

1. **Additional Roles:** The entity-based design supports adding new roles (e.g., "Manager", "Viewer") without schema changes
2. **Role Permissions:** Could extend to permission-based system where roles have associated permissions
3. **Role Assignment UI:** Admin interface for changing user roles
4. **Audit Logging:** Track when users access reports, especially for admin users viewing all reports
5. **Role-Based UI:** Show/hide UI elements based on role (e.g., admin-only features)

## Appendix: Complete File Changes

### Files to Create

1. `backend/app/models/role.py` - Role ORM model
2. `backend/migrations/add_roles.py` - Database migration
3. `frontend/src/types/user.ts` - User TypeScript type
4. `frontend/src/hooks/useAuth.ts` - Authentication hook
5. `backend/tests/property/test_role_properties.py` - Property-based tests
6. `backend/tests/integration/test_role_based_access.py` - Integration tests
7. `backend/tests/unit/test_role_model.py` - Role model unit tests

### Files to Modify

1. `backend/app/models/user.py` - Add role_id and role relationship
2. `backend/app/services/report_service.py` - Add get_all_reports function
3. `backend/app/routers/reports.py` - Add role-based branching in list_reports
4. `backend/app/schemas/auth.py` - Add role field to UserResponse
5. `backend/app/routers/auth.py` - Include role in login and /me responses
6. `frontend/src/pages/DashboardPage.tsx` - Add logout button and role display
7. `frontend/src/api/auth.ts` - Add logout function, update types
8. `backend/docs/openapi.yaml` - Update API documentation

### Files Unchanged

1. `backend/app/models/expense_report.py` - No changes needed
2. `backend/app/routers/auth.py` - Logout endpoint already exists
3. `frontend/src/types/expenseReport.ts` - Already includes owner_username
