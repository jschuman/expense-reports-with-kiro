/**
 * Unit tests for frontend/src/hooks/useClients.ts
 * Uses MSW v2 to intercept fetch calls and @testing-library/react for hook rendering.
 * 100% coverage required.
 */

import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useClients } from '../useClients';
import * as clientsApi from '../../api/clients';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

const sampleClients = ['Acme Corp', 'Globex Industries', 'Initech', 'Umbrella Ltd', 'Hooli'];

// ---------------------------------------------------------------------------
// Clients fetched on mount
// ---------------------------------------------------------------------------

describe('clients fetched on mount', () => {
  it('starts with isLoading=true and empty clients', () => {
    server.use(
      http.get('/clients', async () => {
        // Delay so we can observe the initial loading state
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json(sampleClients, { status: 200 });
      }),
    );

    const { result } = renderHook(() => useClients());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.clients).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('populates clients state when listClients returns data', async () => {
    server.use(
      http.get('/clients', () => HttpResponse.json(sampleClients, { status: 200 })),
    );

    const { result } = renderHook(() => useClients());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.clients).toEqual(sampleClients);
    expect(result.current.error).toBeNull();
  });

  it('sets clients to empty array when server returns []', async () => {
    server.use(
      http.get('/clients', () => HttpResponse.json([], { status: 200 })),
    );

    const { result } = renderHook(() => useClients());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.clients).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('transitions isLoading from true to false after fetch completes', async () => {
    server.use(
      http.get('/clients', () => HttpResponse.json(sampleClients, { status: 200 })),
    );

    const { result } = renderHook(() => useClients());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('error state', () => {
  it('sets error state when listClients fails with 401', async () => {
    server.use(
      http.get('/clients', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    const { result } = renderHook(() => useClients());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.clients).toEqual([]);
  });

  it('uses error message from Error instance when listClients throws', async () => {
    server.use(
      http.get('/clients', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    const { result } = renderHook(() => useClients());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('Not authenticated');
  });

  it('uses fallback message when listClients rejects with a non-Error value', async () => {
    vi.spyOn(clientsApi, 'listClients').mockRejectedValueOnce('network failure' as never);

    const { result } = renderHook(() => useClients());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('Failed to load clients');
  });

  it('sets isLoading to false even when fetch fails', async () => {
    server.use(
      http.get('/clients', () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useClients());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cleanup on unmount
// ---------------------------------------------------------------------------

describe('cleanup on unmount', () => {
  it('does not update state when component unmounts before listClients resolves', async () => {
    let resolveRequest!: () => void;
    const requestGate = new Promise<void>((res) => {
      resolveRequest = res;
    });

    server.use(
      http.get('/clients', async () => {
        await requestGate;
        return HttpResponse.json(sampleClients, { status: 200 });
      }),
    );

    const { result, unmount } = renderHook(() => useClients());
    expect(result.current.isLoading).toBe(true);

    // Unmount before the response arrives — cancelled flag is set to true
    unmount();

    // Let the response through and flush microtasks
    resolveRequest();
    await new Promise((r) => setTimeout(r, 50));

    // State should remain at initial values (no update after unmount)
    expect(result.current.clients).toEqual([]);
  });

  it('does not update state when component unmounts before listClients rejects', async () => {
    let rejectRequest!: () => void;
    const requestGate = new Promise<void>((res) => {
      rejectRequest = res;
    });

    server.use(
      http.get('/clients', async () => {
        await requestGate;
        return HttpResponse.json({ detail: 'Server error' }, { status: 500 });
      }),
    );

    const { result, unmount } = renderHook(() => useClients());
    expect(result.current.isLoading).toBe(true);

    // Unmount before the error arrives — cancelled flag is set to true
    unmount();

    // Let the error through and flush microtasks
    rejectRequest();
    await new Promise((r) => setTimeout(r, 50));

    // State should remain at initial values (no error update after unmount)
    expect(result.current.error).toBeNull();
  });
});
