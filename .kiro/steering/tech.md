# Tech Stack

## Frontend

- **Framework**: React with TypeScript
- **Styling/Components**: Material UI (MUI)
- **Language**: TypeScript (strict mode preferred)

## Backend

- **Framework**: Python FastAPI
- **Database**: SQLite (via SQLAlchemy or similar ORM)
- **API style**: API-first — define OpenAPI schemas before implementing endpoints

## Development Approach

- **API-first**: Design and document the REST API (OpenAPI/Swagger) before writing frontend or backend logic. FastAPI auto-generates `/docs` and `/openapi.json`.
- Unauthenticated requests must be rejected at the API level (401) and redirected to login on the frontend
- Form validation must be enforced server-side via FastAPI request models (Pydantic); client-side validation is additive
- Expense reports are always saved with `Status: Pending` on creation — no other status values exist yet
- Use Pydantic models for all request/response schemas

## Common Commands

### Frontend

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run tests
npm test -- --run
```

### Backend

```bash
# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn main:app --reload

# Run tests
pytest

# any python scripts
python3

# View auto-generated API docs (dev server must be running)
# http://localhost:8000/docs
```
