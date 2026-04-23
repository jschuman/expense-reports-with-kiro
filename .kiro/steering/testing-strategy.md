---
inclusion: always
---
# Testing Strategy

1. **Red-Green-Refactor**: For every new feature, suggest the test case before the implementation.

2. **Frontend Unit Tests**: Use Vitest. Every utility function in `frontend/src/` requires 100% coverage.

3. **Backend Unit Tests**: Use pytest. Test individual route handlers, Pydantic schema validation, and database logic in isolation. 100% coverage is required across all backend source files (`backend/app/`).

4. **Integration Tests**: Every FastAPI endpoint must have at minimum:
   - A test for the successful response (correct status code and response shape)
   - A test for failed validation (e.g., missing required fields, invalid values)

5. **Scope clarity**:
   - Vitest → React/TypeScript frontend only
   - pytest → Python FastAPI backend only

6. **Testing tasks are always required**: When generating implementation task lists, all testing-related tasks (unit tests, integration tests, property-based tests, and test updates) MUST be marked as required. Testing tasks MUST NOT be marked as optional (i.e., never use the `*` marker on test tasks in tasks.md).