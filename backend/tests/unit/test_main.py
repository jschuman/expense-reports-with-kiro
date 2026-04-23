"""Unit tests for app/main.py — global exception handler and app configuration.

The 500 handler (lines 75-76) is exercised by temporarily adding a route that
raises an unhandled exception, then removing it after the test.
"""

from fastapi.testclient import TestClient

from app.main import app


def test_unhandled_exception_returns_500_json():
    """Global exception handler catches unhandled errors and returns 500 JSON.

    A temporary route is added to the app that deliberately raises a
    RuntimeError.  The TestClient is created with raise_server_exceptions=False
    so the handler (not pytest) catches the exception.  The route is removed
    after the test to avoid polluting other tests.
    """

    @app.get("/_test_500")
    async def _boom():
        raise RuntimeError("deliberate test error")

    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/_test_500")

        assert response.status_code == 500
        assert response.json() == {"detail": "Internal server error"}
    finally:
        # Remove the temporary route so it doesn't affect other tests
        app.routes[:] = [r for r in app.routes if getattr(r, "path", None) != "/_test_500"]
