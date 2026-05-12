# Expense Report Web App

A full-stack web application for creating and managing expense reports with client reimbursement tracking.

## Overview

The Expense Report Web App allows authenticated users to create, view, and manage expense reports. Each report can be marked as reimbursable from a client, with automatic owner tracking and timestamp recording.

### Key Features

- **User Authentication**: Secure login system with session-based authentication
- **Role-Based Access Control**: User and Admin roles with different report visibility permissions
- **Expense Report Status Lifecycle**: Reports move through a four-state workflow — `In Progress → Submitted → Scheduled for Payment` (or `Rejected → Submitted` for resubmission)
- **Expense Report Management**: Create, edit, submit, and delete expense reports with detailed information
- **Admin Review**: Admins can accept or reject submitted reports; rejected reports require a reason (admin notes)
- **Status Audit Log**: Every status change is recorded with a UTC timestamp for full traceability
- **Expense Line Items**: Each report supports multiple line items (description, amount, incurred date); the report total is automatically computed as the sum of all lines
- **Expense Report Detail View**: Read-only detail page (`/reports/:reportId`) showing the full line-item table with currency-formatted amounts and dates, a subtotal footer row, and a "Back to Dashboard" button. Inline Add/Edit/Delete controls are shown only to the report owner when the report is in an editable state (`In Progress` or `Rejected`).
- **Expense Line Items Embedded in Edit Page**: The Edit Report page (`/reports/:reportId/edit`) includes the full expense lines table directly — no separate navigation needed. Owners can add, edit, and delete lines from the same page, with a delete confirmation dialog. The report total is automatically computed server-side as the sum of all lines and is never entered manually.
- **Expense Line Create/Edit Form**: Dedicated form page for adding new lines or editing existing ones, with client-side validation (non-empty description, positive amount, valid date), server-side 422 field-level error display, and 409 conflict alerts for locked reports. After saving, the user is returned to the Edit Report page.
- **Create Report → Edit Report Flow**: After creating a new report, the user is taken directly to the Edit Report page so they can immediately add expense lines.
- **Dashboard View Button**: Reports in non-editable states (Submitted, Scheduled for Payment) show a **View** button on the dashboard card, linking to the read-only detail page. Admins in Submitted state see View alongside Accept/Reject.
- **Full Client-Side Routing**: React Router routes for all report and line pages, all protected by authentication:
  - `/reports/:reportId` — read-only detail page
  - `/reports/:reportId/edit` — edit report + manage lines
  - `/reports/:reportId/lines/new` — add a line
  - `/reports/:reportId/lines/:lineId/edit` — edit a line
- **Client Reimbursement Tracking**: Mark expenses as client-reimbursable and associate them with specific clients
- **Automatic Metadata**: Owner and creation timestamp are automatically recorded
- **Expense Reports Data Table**: MUI X DataGrid-based table view on the Dashboard with sortable/filterable columns, role-based column visibility, and context-sensitive row actions
- **Responsive UI**: Material UI-based interface with form validation

### Tech Stack

**Backend:**
- Python 3.14+
- FastAPI (REST API framework)
- SQLAlchemy (ORM)
- SQLite (database)
- Pydantic (data validation)

**Frontend:**
- React 18+ with TypeScript
- Material UI (MUI) components
- Vite (build tool)
- Zod (schema validation)

**Testing:**
- Backend: pytest with Hypothesis (property-based testing)
- Frontend: Vitest with fast-check (property-based testing)

## Project Structure

```
.
├── backend/              # Python FastAPI backend
│   ├── app/
│   │   ├── routers/      # API route handlers
│   │   ├── models/       # SQLAlchemy ORM models
│   │   ├── schemas/      # Pydantic request/response schemas
│   │   ├── services/     # Business logic layer
│   │   ├── db/           # Database configuration
│   │   └── main.py       # FastAPI application entry point
│   ├── tests/            # Backend tests (unit, integration, property-based)
│   ├── docs/             # OpenAPI specification
│   ├── requirements.txt  # Python dependencies
│   └── seed.py           # Database seeding script
│
├── frontend/             # React TypeScript frontend
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Page-level components
│   │   ├── api/          # API client functions
│   │   ├── hooks/        # Custom React hooks
│   │   ├── types/        # TypeScript types and Zod schemas
│   │   └── utils/        # Utility functions
│   ├── package.json      # Node dependencies
│   └── vite.config.ts    # Vite configuration
│
└── .kiro/                # Project specifications and documentation
    ├── specs/            # Feature specifications
    └── steering/         # Development guidelines
```

## Getting Started

### Prerequisites

- **Python 3.14+** (or Python 3.10+)
- **Node.js 18+** and npm
- **Git**

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd expense-report-app
   ```

2. **Set up the backend**

   ```bash
   cd backend
   
   # Install Python dependencies
   pip install -r requirements.txt
   
   # Run database migrations
   alembic upgrade head
   
   # Seed the database with default users
   python3 seed.py
   ```

   This creates three users with different roles:
   - Admin user: `admin` / `admin123` (can view all expense reports)
   - Regular users: `user1` / `user123` and `user2` / `user123` (can view only their own reports)

3. **Set up the frontend**

   ```bash
   cd ../frontend
   
   # Install Node dependencies
   npm install
   ```

### Running the Application

You'll need two terminal windows/tabs:

**Terminal 1 - Backend:**

```bash
cd backend
uvicorn app.main:app --reload
```

The backend API will be available at:
- API: http://localhost:8000
- Interactive API docs: http://localhost:8000/docs
- OpenAPI spec: http://localhost:8000/openapi.json

**Terminal 2 - Frontend:**

```bash
cd frontend
npm run dev
```

The frontend will be available at: http://localhost:5173 (or the next available port)

### First Login

1. Navigate to http://localhost:5173
2. Log in with one of the seeded credentials:
   - **Admin**: `admin` / `admin123` (can view all expense reports)
   - **User 1**: `user1` / `user123` (can view only their own reports)
   - **User 2**: `user2` / `user123` (can view only their own reports)
3. You'll be redirected to the dashboard where you can create and view expense reports

## Development

### Running Tests

**Backend tests:**

```bash
cd backend
pytest                    # Run all tests
pytest --cov             # Run with coverage report
pytest -v                # Verbose output
```

**Frontend tests:**

```bash
cd frontend
npm test -- --run        # Run all tests once
npm test                 # Run in watch mode
npm test -- --coverage   # Run with coverage report
```

### Code Quality

Both backend and frontend have 100% test coverage requirements:
- Backend: All files in `backend/app/` must have 100% coverage (410 tests, 100% coverage)
- Frontend: All utility functions in `frontend/src/` must have 100% coverage (396 tests, 100% coverage on `src/api/`, `src/hooks/`, and `src/utils/`)

### API Documentation

The backend uses FastAPI's automatic OpenAPI documentation. When the backend is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Database Management

The SQLite database file is located at `backend/expense_reports.db`.

**Database migrations** are managed with Alembic:

```bash
cd backend

# Apply all pending migrations
alembic upgrade head

# View migration history
alembic history

# Rollback one migration
alembic downgrade -1
```

**To reset the database:**

```bash
cd backend
rm expense_reports.db    # Delete the database
alembic upgrade head     # Run migrations to recreate schema
python3 seed.py          # Seed with default users
```

## Available Clients

The application includes 5 predefined clients for reimbursable expenses:
- Acme Corp
- Globex Industries
- Initech
- Umbrella Ltd
- Hooli

These are defined in `backend/app/constants.py` and served via the `GET /clients` API endpoint.

## Expense Report Fields

Each expense report includes:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Title | String | Yes | Report title (max 255 chars) |
| Description | String | No | Optional description |
| Total Amount | Number | Computed | Sum of all line item amounts; read-only, never entered manually |
| Status | String | Auto | `In Progress` on creation; transitions through `Submitted`, `Rejected`, `Scheduled for Payment` |
| Owner | User | Auto | Automatically set to the logged-in user |
| Created At | DateTime | Auto | Server-side UTC timestamp |
| Reimbursable from Client | Boolean | No | Whether expense is client-reimbursable (default: false) |
| Client | String | Conditional | Required when reimbursable is true; must be from predefined list |
| Admin Notes | String | No | Reserved for admin use |

## Expense Line Fields

Each line item on a report includes:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Description | String | Yes | What was purchased (e.g. "Taxi to airport") |
| Amount | Number | Yes | Cost of the item (must be positive) |
| Incurred Date | Date | Yes | Calendar date the expense occurred (ISO 8601) |

## Troubleshooting

### Database Schema Errors

If you see errors like `no such column: expense_reports.description`, the database has an old schema:

```bash
cd backend
rm expense_reports.db
python3 seed.py
# Restart the backend server
```

### Frontend Can't Connect to Backend

Ensure both servers are running and check the Vite proxy configuration in `frontend/vite.config.ts`. The proxy should include:
- `/auth`
- `/reports`
- `/clients`

### Port Conflicts

If ports 8000 or 5173 are in use:
- Backend: `uvicorn app.main:app --reload --port 8001`
- Frontend: Vite will automatically try the next available port

## Contributing

1. Follow the existing code style and conventions
2. Write tests for all new features (aim for 100% coverage)
3. Update API documentation when adding/modifying endpoints
4. Run the full test suite before submitting changes

## License

[Add your license information here]
