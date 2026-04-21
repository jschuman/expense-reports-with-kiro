# Project Structure

## Current Layout

```
.kiro/
  specs/
    expense-report-web-app/
      .config.kiro        # Spec metadata (workflow type, spec ID)
      requirements.md     # Feature requirements and acceptance criteria
  steering/
    product.md            # Product summary and domain glossary
    tech.md               # Tech stack and build commands
    structure.md          # This file — project organization
.vscode/
  settings.json           # Editor settings
```

## Expected Source Layout

```
frontend/                 # React + TypeScript app
  src/
    components/           # Shared MUI-based UI components
    pages/                # Page-level components (Login, Dashboard, CreateReport)
    api/                  # API client functions (typed fetch/axios wrappers)
    types/                # Shared TypeScript types and interfaces
    hooks/                # Custom React hooks
  public/                 # Static assets
  package.json

backend/                  # Python FastAPI app
  app/
    routers/              # Route handlers grouped by feature (auth, reports)
    models/               # SQLAlchemy ORM models
    schemas/              # Pydantic request/response schemas
    db/                   # Database setup, session management, migrations
    main.py               # FastAPI app entry point
  tests/                  # Pytest test files
  requirements.txt
```

## Organizational Conventions

- **API-first**: Define Pydantic schemas and FastAPI routes before building frontend components
- Group backend code by feature (auth, reports) not by layer
- Frontend `api/` directory contains all HTTP calls — components never call `fetch` directly
- TypeScript types in `frontend/src/types/` should mirror backend Pydantic schemas
- Auth middleware/dependency applied globally in FastAPI — protect all routes except `/auth/login`
- SQLite database file should not be committed to version control
- Spec files live in `.kiro/specs/{feature-name}/` and should not be modified by application code
