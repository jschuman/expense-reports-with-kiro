"""FastAPI application entry point for the Expense Report Web App."""

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from app.db.database import create_tables
from app.routers import auth, reports

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Create all database tables on startup."""
    create_tables()
    yield


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Expense Report API",
    description=(
        "API-first backend for the Expense Report Web App. "
        "See /docs for the interactive Swagger UI."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

# The secret key signs the session cookie so tampering is detectable.
# In production this should come from a secrets manager; for local dev a
# hard-coded fallback is acceptable.
_SESSION_SECRET = os.environ.get("SESSION_SECRET_KEY", "change-me-in-production-please")

app.add_middleware(
    SessionMiddleware,
    secret_key=_SESSION_SECRET,
    session_cookie="session",
    same_site="lax",
    https_only=False,  # set True behind HTTPS in production
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(auth.router, prefix="/auth")
app.include_router(reports.router, prefix="/reports")

# ---------------------------------------------------------------------------
# Global exception handlers
# ---------------------------------------------------------------------------


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all handler that prevents stack traces from leaking to clients."""
    logger.exception("Unhandled server error on %s %s", request.method, request.url)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )
