/**
 * Unit tests for frontend/src/hooks/useReports.ts
 * Uses MSW v2 to intercept fetch calls and @testing-library/react for hook rendering.
 */

import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useReports } from '../useReports';
import * as reportsApi from '../../api/reports';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

const sampleReport = {
  id: 1,
  title: 'Q1 Travel',
  purpose: 'Client visit',
  total_amount: 450.0,
  status: 'Pending',
  owner_id: 1,
};

const anotherReport = {
  id: 2,
  title: 'Conference',
  purpose: 'Annual summit',
  total_amount: 1200.5,
  status: 'Pending',
  owner_id: 1,
};

// ---------------------------------------------------------------------------
// Reports fetched on mount
// ---------------------------------------------------------------------------

describe('reports fetched on mount', () => {
  it('populates reports state when listReports returns data', async () => {
    server.use(
      http.get('/reports', () => HttpResponse.json([sampleReport], { status: 200 })),
    );

    const { result } = renderHook(() => useReports());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.reports).toEqual([sampleReport]);
    expect(result.current.error).toBeNull();
  });

  it('sets reports to empty array when server returns []', async () => {
    server.use(
      http.get('/reports', () => HttpResponse.json([], { status: 200 })),
    );

    const { result } = renderHook(() => useReports());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.reports).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('sets error state when listReports fails', async () => {
    server.use(
      http.get('/reports', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    const { result } = renderHook(() => useReports());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.reports).toEqual([]);
  });

  it('uses error message from Error instance when listReports throws', async () => {
    server.use(
      http.get('/reports', () =>
        HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 }),
      ),
    );

    const { result } = renderHook(() => useReports());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // ApiError extends Error, so message comes from the Error instance
    expect(result.current.error).toBe('Unauthorized');
  });

  it('uses fallback message when listReports rejects with a non-Error value', async () => {
    // Simulate a rejection with a non-Error value (e.g., a plain string)
    vi.spyOn(reportsApi, 'listReports').mockRejectedValueOnce('network failure' as never);

    const { result } = renderHook(() => useReports());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('Failed to load reports');
  });

  it('does not update state when component unmounts before listReports resolves', async () => {
    let resolveRequest!: () => void;
    const requestGate = new Promise<void>((res) => { resolveRequest = res; });

    server.use(
      http.get('/reports', async () => {
        await requestGate;
        return HttpResponse.json([sampleReport], { status: 200 });
      }),
    );

    const { result, unmount } = renderHook(() => useReports());
    expect(result.current.isLoading).toBe(true);

    // Unmount before the response arrives — cancelled flag is set to true
    unmount();

    // Now let the response through and flush microtasks
    resolveRequest();
    await new Promise((r) => setTimeout(r, 50));

    // State should remain at initial values (no update after unmount)
    expect(result.current.reports).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createReport()
// ---------------------------------------------------------------------------

describe('createReport()', () => {
  it('appends new report to the list on success', async () => {
    server.use(
      http.get('/reports', () => HttpResponse.json([sampleReport], { status: 200 })),
      http.post('/reports', () => HttpResponse.json(anotherReport, { status: 201 })),
    );

    const { result } = renderHook(() => useReports());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.reports).toHaveLength(1);

    await act(async () => {
      await result.current.createReport({
        title: 'Conference',
        purpose: 'Annual summit',
        total_amount: 1200.5,
      });
    });

    expect(result.current.reports).toHaveLength(2);
    expect(result.current.reports[1]).toEqual(anotherReport);
  });

  it('returns the created report from createReport', async () => {
    server.use(
      http.get('/reports', () => HttpResponse.json([], { status: 200 })),
      http.post('/reports', () => HttpResponse.json(sampleReport, { status: 201 })),
    );

    const { result } = renderHook(() => useReports());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let created: typeof sampleReport | undefined;
    await act(async () => {
      created = await result.current.createReport({
        title: 'Q1 Travel',
        purpose: 'Client visit',
        total_amount: 450.0,
      });
    });

    expect(created).toEqual(sampleReport);
  });

  it('throws and does not append when createReport fails', async () => {
    server.use(
      http.get('/reports', () => HttpResponse.json([sampleReport], { status: 200 })),
      http.post('/reports', () =>
        HttpResponse.json({ detail: 'Validation error' }, { status: 422 }),
      ),
    );

    const { result } = renderHook(() => useReports());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.createReport({
          title: '',
          purpose: 'Test',
          total_amount: 10,
        });
      }),
    ).rejects.toMatchObject({ status: 422 });

    // List should remain unchanged
    expect(result.current.reports).toHaveLength(1);
  });
});
