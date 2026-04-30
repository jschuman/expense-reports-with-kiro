/**
 * Integration tests for the logout flow on DashboardPage.
 *
 * These tests render the real DashboardPage (with real hooks) and intercept
 * HTTP calls via MSW, exercising the full path from button click → API call
 * → navigation / error display.
 *
 * Scenarios:
 * 1. Complete logout flow: click Logout → POST /auth/logout → redirect to /login
 * 2. Logout with API failure → error message shown, no redirect
 * 3. Session expiration (401 on /auth/me) → ProtectedRoute redirects to /login
 *
 * Requirements: 4.5, 4.6
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { DashboardPage } from '../DashboardPage';
import { ProtectedRoute } from '../../components/ProtectedRoute';

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const authenticatedUser = { id: 1, username: 'alice', role: 'User' };
const adminUser = { id: 2, username: 'bob', role: 'Admin' };

const sampleReport = {
  id: 1,
  title: 'Q1 Travel',
  description: 'Client visit',
  total_amount: 450.0,
  status: 'Pending',
  owner_id: 1,
  owner_username: 'alice',
  created_at: '2026-01-01T00:00:00Z',
  reimbursable_from_client: false,
  client: null,
  admin_notes: null,
};

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/**
 * Renders DashboardPage inside a MemoryRouter with a /login stub route so we
 * can assert navigation after logout.
 */
function renderWithRouter(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// 1. Complete logout flow: click → API call → redirect to /login
// ---------------------------------------------------------------------------

describe('complete logout flow', () => {
  it('redirects to /login after successful logout', async () => {
    server.use(
      http.get('/auth/me', () => HttpResponse.json(authenticatedUser, { status: 200 })),
      http.get('/reports', () => HttpResponse.json([], { status: 200 })),
      http.post('/auth/logout', () =>
        HttpResponse.json({ detail: 'Logged out' }, { status: 200 })
      ),
    );

    renderWithRouter('/');

    // Wait for the dashboard to load (session restored)
    await waitFor(() =>
      expect(screen.getByTestId('logout-button')).toBeInTheDocument()
    );

    await userEvent.click(screen.getByTestId('logout-button'));

    // After logout, ProtectedRoute should redirect to /login
    await waitFor(() =>
      expect(screen.getByTestId('login-page')).toBeInTheDocument()
    );
  });

  it('calls POST /auth/logout exactly once when Logout is clicked', async () => {
    let logoutCallCount = 0;

    server.use(
      http.get('/auth/me', () => HttpResponse.json(authenticatedUser, { status: 200 })),
      http.get('/reports', () => HttpResponse.json([], { status: 200 })),
      http.post('/auth/logout', () => {
        logoutCallCount++;
        return HttpResponse.json({ detail: 'Logged out' }, { status: 200 });
      }),
    );

    renderWithRouter('/');

    await waitFor(() =>
      expect(screen.getByTestId('logout-button')).toBeInTheDocument()
    );

    await userEvent.click(screen.getByTestId('logout-button'));

    await waitFor(() =>
      expect(screen.getByTestId('login-page')).toBeInTheDocument()
    );

    expect(logoutCallCount).toBe(1);
  });

  it('shows the correct page title for a User-role user before logout', async () => {
    server.use(
      http.get('/auth/me', () => HttpResponse.json(authenticatedUser, { status: 200 })),
      http.get('/reports', () => HttpResponse.json([sampleReport], { status: 200 })),
      http.post('/auth/logout', () =>
        HttpResponse.json({ detail: 'Logged out' }, { status: 200 })
      ),
    );

    renderWithRouter('/');

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'My Expense Reports' })
      ).toBeInTheDocument()
    );
  });

  it('shows the correct page title for an Admin-role user before logout', async () => {
    server.use(
      http.get('/auth/me', () => HttpResponse.json(adminUser, { status: 200 })),
      http.get('/reports', () => HttpResponse.json([sampleReport], { status: 200 })),
      http.post('/auth/logout', () =>
        HttpResponse.json({ detail: 'Logged out' }, { status: 200 })
      ),
    );

    renderWithRouter('/');

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'All Expense Reports' })
      ).toBeInTheDocument()
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Logout with API failure → error message shown, no redirect
// ---------------------------------------------------------------------------

describe('logout with API failure', () => {
  it('shows an error message when POST /auth/logout returns 500', async () => {
    server.use(
      http.get('/auth/me', () => HttpResponse.json(authenticatedUser, { status: 200 })),
      http.get('/reports', () => HttpResponse.json([], { status: 200 })),
      http.post('/auth/logout', () =>
        HttpResponse.json({ detail: 'Internal server error' }, { status: 500 })
      ),
    );

    renderWithRouter('/');

    await waitFor(() =>
      expect(screen.getByTestId('logout-button')).toBeInTheDocument()
    );

    await userEvent.click(screen.getByTestId('logout-button'));

    await waitFor(() =>
      expect(screen.getByTestId('logout-error')).toBeInTheDocument()
    );
    expect(screen.getByTestId('logout-error')).toHaveTextContent(
      'Logout failed. Please try again.'
    );
  });

  it('does not navigate to /login when logout API fails', async () => {
    server.use(
      http.get('/auth/me', () => HttpResponse.json(authenticatedUser, { status: 200 })),
      http.get('/reports', () => HttpResponse.json([], { status: 200 })),
      http.post('/auth/logout', () =>
        HttpResponse.json({ detail: 'Internal server error' }, { status: 500 })
      ),
    );

    renderWithRouter('/');

    await waitFor(() =>
      expect(screen.getByTestId('logout-button')).toBeInTheDocument()
    );

    await userEvent.click(screen.getByTestId('logout-button'));

    await waitFor(() =>
      expect(screen.getByTestId('logout-error')).toBeInTheDocument()
    );

    // Dashboard should still be visible
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('logout-button')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. Session expiration → ProtectedRoute redirects to /login
// ---------------------------------------------------------------------------

describe('session expiration', () => {
  it('redirects to /login when /auth/me returns 401 (session expired)', async () => {
    server.use(
      http.get('/auth/me', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 })
      ),
    );

    renderWithRouter('/');

    // ProtectedRoute should redirect unauthenticated users to /login
    await waitFor(() =>
      expect(screen.getByTestId('login-page')).toBeInTheDocument()
    );

    expect(screen.queryByTestId('logout-button')).not.toBeInTheDocument();
  });

  it('does not render the dashboard when session is expired', async () => {
    server.use(
      http.get('/auth/me', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 })
      ),
    );

    renderWithRouter('/');

    await waitFor(() =>
      expect(screen.getByTestId('login-page')).toBeInTheDocument()
    );

    expect(
      screen.queryByRole('heading', { name: /expense reports/i })
    ).not.toBeInTheDocument();
  });
});
