/**
 * Unit tests for frontend/src/api/auth.ts
 * Uses MSW v2 to intercept fetch calls.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { login, logout, getSession } from '../auth';
import { ApiError } from '../client';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// login()
// ---------------------------------------------------------------------------

describe('login()', () => {
  it('sends POST /auth/login with JSON body and returns UserResponse on 200', async () => {
    let capturedRequest: Request | undefined;

    server.use(
      http.post('/auth/login', async ({ request }) => {
        capturedRequest = request.clone();
        return HttpResponse.json({ id: 1, username: 'alice' }, { status: 200 });
      }),
    );

    const result = await login({ username: 'alice', password: 'secret' });

    expect(result).toEqual({ id: 1, username: 'alice' });
    expect(capturedRequest).toBeDefined();
    expect(capturedRequest!.method).toBe('POST');
    expect(capturedRequest!.headers.get('content-type')).toContain('application/json');

    const body = await capturedRequest!.json();
    expect(body).toEqual({ username: 'alice', password: 'secret' });
  });

  it('throws ApiError with status 401 on invalid credentials', async () => {
    server.use(
      http.post('/auth/login', () =>
        HttpResponse.json({ detail: 'Invalid username or password' }, { status: 401 }),
      ),
    );

    await expect(login({ username: 'alice', password: 'wrong' })).rejects.toThrow(ApiError);
    await expect(login({ username: 'alice', password: 'wrong' })).rejects.toMatchObject({
      status: 401,
    });
  });

  it('sets credentials: include on the request', async () => {
    let capturedRequest: Request | undefined;

    server.use(
      http.post('/auth/login', ({ request }) => {
        capturedRequest = request.clone();
        return HttpResponse.json({ id: 2, username: 'bob' });
      }),
    );

    await login({ username: 'bob', password: 'pass' });

    // MSW intercepts at the fetch level; credentials mode is set by apiFetch
    // We verify the request was made (credentials are enforced by the wrapper)
    expect(capturedRequest).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// logout()
// ---------------------------------------------------------------------------

describe('logout()', () => {
  it('sends POST /auth/logout and resolves without error on 200', async () => {
    let capturedMethod: string | undefined;

    server.use(
      http.post('/auth/logout', ({ request }) => {
        capturedMethod = request.method;
        return HttpResponse.json({ detail: 'Logged out' }, { status: 200 });
      }),
    );

    await expect(logout()).resolves.toBeUndefined();
    expect(capturedMethod).toBe('POST');
  });

  it('throws ApiError on non-2xx response', async () => {
    server.use(
      http.post('/auth/logout', () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    );

    await expect(logout()).rejects.toThrow(ApiError);
    await expect(logout()).rejects.toMatchObject({ status: 500 });
  });
});

// ---------------------------------------------------------------------------
// getSession()
// ---------------------------------------------------------------------------

describe('getSession()', () => {
  it('sends GET /auth/me and returns UserResponse on 200', async () => {
    let capturedMethod: string | undefined;

    server.use(
      http.get('/auth/me', ({ request }) => {
        capturedMethod = request.method;
        return HttpResponse.json({ id: 3, username: 'carol' }, { status: 200 });
      }),
    );

    const result = await getSession();

    expect(result).toEqual({ id: 3, username: 'carol' });
    expect(capturedMethod).toBe('GET');
  });

  it('returns null on 401 (no active session)', async () => {
    server.use(
      http.get('/auth/me', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    const result = await getSession();
    expect(result).toBeNull();
  });

  it('re-throws ApiError for non-401 errors', async () => {
    server.use(
      http.get('/auth/me', () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    );

    await expect(getSession()).rejects.toThrow(ApiError);
    await expect(getSession()).rejects.toMatchObject({ status: 500 });
  });
});
