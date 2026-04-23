/**
 * Unit tests for frontend/src/hooks/useAuth.ts
 * Uses MSW v2 to intercept fetch calls and @testing-library/react for hook rendering.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useAuth } from '../useAuth';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const aliceUser = { id: 1, username: 'alice' };

// ---------------------------------------------------------------------------
// Session restoration on mount
// ---------------------------------------------------------------------------

describe('session restoration on mount', () => {
  it('sets user and isAuthenticated when getSession returns a user', async () => {
    server.use(
      http.get('/auth/me', () => HttpResponse.json(aliceUser, { status: 200 })),
    );

    const { result } = renderHook(() => useAuth());

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toEqual(aliceUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('leaves user null and isAuthenticated false when getSession returns null (401)', async () => {
    server.use(
      http.get('/auth/me', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('sets isLoading false and leaves state clear when getSession throws a non-401 error', async () => {
    server.use(
      http.get('/auth/me', () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('does not update state when component unmounts before getSession resolves', async () => {
    // Use a deferred promise so we can control when the response arrives
    let resolveRequest!: () => void;
    const requestGate = new Promise<void>((res) => { resolveRequest = res; });

    server.use(
      http.get('/auth/me', async () => {
        await requestGate;
        return HttpResponse.json(aliceUser, { status: 200 });
      }),
    );

    const { result, unmount } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(true);

    // Unmount before the response arrives — cancelled flag is set
    unmount();

    // Now let the response through and flush microtasks
    resolveRequest();
    await new Promise((r) => setTimeout(r, 50));

    // State should remain at initial values (no update after unmount)
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// login()
// ---------------------------------------------------------------------------

describe('login()', () => {
  it('updates user and isAuthenticated on successful login', async () => {
    // getSession returns 401 initially (not logged in)
    server.use(
      http.get('/auth/me', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
      http.post('/auth/login', () => HttpResponse.json(aliceUser, { status: 200 })),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login({ username: 'alice', password: 'secret' });
    });

    expect(result.current.user).toEqual(aliceUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('clears state and re-throws on 401 login failure', async () => {
    server.use(
      http.get('/auth/me', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
      http.post('/auth/login', () =>
        HttpResponse.json({ detail: 'Invalid credentials' }, { status: 401 }),
      ),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login({ username: 'alice', password: 'wrong' });
      }),
    ).rejects.toMatchObject({ status: 401 });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('re-throws non-401 errors from login without clearing state', async () => {
    server.use(
      http.get('/auth/me', () => HttpResponse.json(aliceUser, { status: 200 })),
      http.post('/auth/login', () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await expect(
      act(async () => {
        await result.current.login({ username: 'alice', password: 'secret' });
      }),
    ).rejects.toMatchObject({ status: 500 });

    // Non-401 errors don't clear state
    expect(result.current.user).toEqual(aliceUser);
    expect(result.current.isAuthenticated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// logout()
// ---------------------------------------------------------------------------

describe('logout()', () => {
  it('clears user and isAuthenticated after logout', async () => {
    server.use(
      http.get('/auth/me', () => HttpResponse.json(aliceUser, { status: 200 })),
      http.post('/auth/logout', () =>
        HttpResponse.json({ detail: 'Logged out' }, { status: 200 }),
      ),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('clears state even when logout API call fails', async () => {
    server.use(
      http.get('/auth/me', () => HttpResponse.json(aliceUser, { status: 200 })),
      http.post('/auth/logout', () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    // logout uses try/finally — state is cleared even if the API call throws.
    // We catch the rejection and then wait for state to settle.
    let caughtError: unknown;
    await act(async () => {
      try {
        await result.current.logout();
      } catch (err) {
        caughtError = err;
      }
    });

    expect(caughtError).toMatchObject({ status: 500 });
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});
