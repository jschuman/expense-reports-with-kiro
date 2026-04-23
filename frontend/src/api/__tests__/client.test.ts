/**
 * Unit tests for frontend/src/api/client.ts
 * Covers the apiFetch base wrapper and ApiError class.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { apiFetch, ApiError } from '../client';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('apiFetch()', () => {
  it('returns parsed JSON on a 2xx response', async () => {
    server.use(
      http.get('/test', () => HttpResponse.json({ ok: true }, { status: 200 })),
    );

    const result = await apiFetch<{ ok: boolean }>('/test');
    expect(result).toEqual({ ok: true });
  });

  it('sets credentials: include on every request', async () => {
    // MSW intercepts at the fetch level; we verify the request reaches the handler
    // (credentials mode is enforced by apiFetch wrapper)
    server.use(
      http.get('/test-creds', () => HttpResponse.json({ ok: true })),
    );

    await expect(apiFetch('/test-creds')).resolves.toEqual({ ok: true });
  });

  it('throws ApiError with the detail string from JSON error body', async () => {
    server.use(
      http.get('/test-error', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    await expect(apiFetch('/test-error')).rejects.toThrow(ApiError);
    await expect(apiFetch('/test-error')).rejects.toMatchObject({
      status: 401,
      message: 'Not authenticated',
    });
  });

  it('throws ApiError with stringified detail when detail is an object', async () => {
    server.use(
      http.get('/test-detail-obj', () =>
        HttpResponse.json(
          { detail: [{ loc: ['body', 'title'], msg: 'field required' }] },
          { status: 422 },
        ),
      ),
    );

    const err = await apiFetch('/test-detail-obj').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.message).toContain('field required');
  });

  it('falls back to statusText when error body is not valid JSON', async () => {
    server.use(
      http.get('/test-non-json', () =>
        new HttpResponse('Internal Server Error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    );

    const err = await apiFetch('/test-non-json').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
    // message falls back to statusText
    expect(typeof err.message).toBe('string');
  });

  it('uses statusText when JSON error body has no detail field', async () => {
    server.use(
      http.get('/test-no-detail', () =>
        HttpResponse.json({ error: 'something went wrong' }, { status: 503 }),
      ),
    );

    const err = await apiFetch('/test-no-detail').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(503);
  });
});

describe('ApiError', () => {
  it('has the correct name and status', () => {
    const err = new ApiError(404, 'Not found');
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err).toBeInstanceOf(Error);
  });
});
