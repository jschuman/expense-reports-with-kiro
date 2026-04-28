/**
 * Unit tests for frontend/src/api/clients.ts
 * Uses MSW v2 to intercept fetch calls.
 * 100% coverage required.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { listClients } from '../clients';
import { ApiError } from '../client';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const sampleClients = ['Acme Corp', 'Globex Industries', 'Initech', 'Umbrella Ltd', 'Hooli'];

// ---------------------------------------------------------------------------
// listClients()
// ---------------------------------------------------------------------------

describe('listClients()', () => {
  it('sends GET /clients and returns string[] on 200', async () => {
    let capturedMethod: string | undefined;
    let capturedUrl: string | undefined;

    server.use(
      http.get('/clients', ({ request }) => {
        capturedMethod = request.method;
        capturedUrl = request.url;
        return HttpResponse.json(sampleClients, { status: 200 });
      }),
    );

    const result = await listClients();

    expect(result).toEqual(sampleClients);
    expect(capturedMethod).toBe('GET');
    expect(capturedUrl).toContain('/clients');
  });

  it('sends request with credentials included', async () => {
    let capturedCredentials: RequestCredentials | undefined;

    // Intercept at the fetch level to inspect credentials
    server.use(
      http.get('/clients', ({ request }) => {
        capturedCredentials = request.credentials;
        return HttpResponse.json(sampleClients, { status: 200 });
      }),
    );

    await listClients();

    // MSW node environment normalises credentials to 'include' via apiFetch
    expect(capturedCredentials).toBe('include');
  });

  it('returns an empty array when the server returns []', async () => {
    server.use(
      http.get('/clients', () => HttpResponse.json([], { status: 200 })),
    );

    const result = await listClients();
    expect(result).toEqual([]);
  });

  it('returns a string[] (all elements are strings)', async () => {
    server.use(
      http.get('/clients', () => HttpResponse.json(sampleClients, { status: 200 })),
    );

    const result = await listClients();

    expect(Array.isArray(result)).toBe(true);
    result.forEach((item) => expect(typeof item).toBe('string'));
  });

  it('throws ApiError on 401', async () => {
    server.use(
      http.get('/clients', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    await expect(listClients()).rejects.toThrow(ApiError);
    await expect(listClients()).rejects.toMatchObject({ status: 401 });
  });

  it('throws ApiError on 500', async () => {
    server.use(
      http.get('/clients', () =>
        HttpResponse.json({ detail: 'Internal server error' }, { status: 500 }),
      ),
    );

    await expect(listClients()).rejects.toThrow(ApiError);
    await expect(listClients()).rejects.toMatchObject({ status: 500 });
  });
});
