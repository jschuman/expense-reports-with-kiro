---
inclusion: always
---
# API Standards

1. **Contract First**: Before writing any backend logic, define the route in OpenAPI 3.0 format. FastAPI auto-generates `/docs` and `/openapi.json` — keep schemas accurate and up to date.

2. **REST Patterns**: Use standard HTTP verbs — `POST` for create, `GET` for list/retrieve, `PUT`/`PATCH` for update, `DELETE` for removal.

3. **Validation**:
   - **Backend**: All request inputs must be validated using Pydantic models (FastAPI's native validation). Never access raw request data without a schema.
   - **Frontend**: Use Zod for form and API response validation in the React/TypeScript layer where needed.