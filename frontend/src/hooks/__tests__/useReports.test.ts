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

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const sampleReport = {
  id: 1,
  title: 'Q1 Travel',
  description: 'Client visit',
  total_amount: 450.0,
  status: 'In Progress',
  owner_id: 1,
  owner_username: 'user1',
  created_at: '2026-01-01T00:00:00Z',
  reimbursable_from_client: false,
  client: null,
  admin_notes: null,
};

const anotherReport = {
  id: 2,
  title: 'Conference',
  description: 'Annual summit',
  total_amount: 1200.5,
  status: 'In Progress',
  owner_id: 1,
  owner_username: 'user1',
  created_at: '2026-01-02T00:00:00Z',
  reimbursable_from_client: false,
  client: null,
  admin_notes: null,
};

/** Helper: render the hook with a pre-loaded list of reports. */
async function renderWithReports(initialReports = [sampleReport]) {
  server.use(
    http.get('/reports', () => HttpResponse.json(initialReports, { status: 200 })),
  );
  const rendered = renderHook(() => useReports());
  await waitFor(() => expect(rendered.result.current.isLoading).toBe(false));
  return rendered;
}

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
        total_amount: 1200.5,
        reimbursable_from_client: false,
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
        total_amount: 450.0,
        reimbursable_from_client: false,
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
          total_amount: 10,
          reimbursable_from_client: false,
        });
      }),
    ).rejects.toMatchObject({ status: 422 });

    // List should remain unchanged
    expect(result.current.reports).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// handleSubmit()
// ---------------------------------------------------------------------------

describe('handleSubmit()', () => {
  it('updates the matching report status to "Submitted" in local state on success', async () => {
    const submittedReport = { ...sampleReport, status: 'Submitted' };

    const { result } = await renderWithReports([sampleReport, anotherReport]);

    server.use(
      http.post(`/reports/${sampleReport.id}/submit`, () =>
        HttpResponse.json(submittedReport, { status: 200 }),
      ),
    );

    await act(async () => {
      await result.current.handleSubmit(sampleReport.id);
    });

    expect(result.current.reports).toHaveLength(2);
    expect(result.current.reports[0]).toEqual(submittedReport);
    // Other reports are unaffected
    expect(result.current.reports[1]).toEqual(anotherReport);
  });

  it('throws and leaves state unchanged when submit fails', async () => {
    const { result } = await renderWithReports([sampleReport]);

    server.use(
      http.post(`/reports/${sampleReport.id}/submit`, () =>
        HttpResponse.json({ detail: 'Conflict' }, { status: 409 }),
      ),
    );

    await expect(
      act(async () => {
        await result.current.handleSubmit(sampleReport.id);
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(result.current.reports[0]).toEqual(sampleReport);
  });
});

// ---------------------------------------------------------------------------
// handleAccept()
// ---------------------------------------------------------------------------

describe('handleAccept()', () => {
  it('updates the matching report status to "Scheduled for Payment" in local state on success', async () => {
    const submittedReport = { ...sampleReport, status: 'Submitted' };
    const scheduledReport = { ...sampleReport, status: 'Scheduled for Payment' };

    const { result } = await renderWithReports([submittedReport, anotherReport]);

    server.use(
      http.post(`/reports/${submittedReport.id}/accept`, () =>
        HttpResponse.json(scheduledReport, { status: 200 }),
      ),
    );

    await act(async () => {
      await result.current.handleAccept(submittedReport.id);
    });

    expect(result.current.reports).toHaveLength(2);
    expect(result.current.reports[0]).toEqual(scheduledReport);
    // Other reports are unaffected
    expect(result.current.reports[1]).toEqual(anotherReport);
  });

  it('throws and leaves state unchanged when accept fails', async () => {
    const submittedReport = { ...sampleReport, status: 'Submitted' };
    const { result } = await renderWithReports([submittedReport]);

    server.use(
      http.post(`/reports/${submittedReport.id}/accept`, () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
    );

    await expect(
      act(async () => {
        await result.current.handleAccept(submittedReport.id);
      }),
    ).rejects.toMatchObject({ status: 403 });

    expect(result.current.reports[0]).toEqual(submittedReport);
  });
});

// ---------------------------------------------------------------------------
// handleReject()
// ---------------------------------------------------------------------------

describe('handleReject()', () => {
  it('updates the matching report status to "Rejected" and admin_notes in local state on success', async () => {
    const submittedReport = { ...sampleReport, status: 'Submitted' };
    const rejectedReport = {
      ...sampleReport,
      status: 'Rejected',
      admin_notes: 'Missing receipts',
    };

    const { result } = await renderWithReports([submittedReport, anotherReport]);

    server.use(
      http.post(`/reports/${submittedReport.id}/reject`, () =>
        HttpResponse.json(rejectedReport, { status: 200 }),
      ),
    );

    await act(async () => {
      await result.current.handleReject(submittedReport.id, 'Missing receipts');
    });

    expect(result.current.reports).toHaveLength(2);
    expect(result.current.reports[0]).toEqual(rejectedReport);
    expect(result.current.reports[0].admin_notes).toBe('Missing receipts');
    // Other reports are unaffected
    expect(result.current.reports[1]).toEqual(anotherReport);
  });

  it('throws and leaves state unchanged when reject fails', async () => {
    const submittedReport = { ...sampleReport, status: 'Submitted' };
    const { result } = await renderWithReports([submittedReport]);

    server.use(
      http.post(`/reports/${submittedReport.id}/reject`, () =>
        HttpResponse.json({ detail: 'Validation error' }, { status: 422 }),
      ),
    );

    await expect(
      act(async () => {
        await result.current.handleReject(submittedReport.id, '');
      }),
    ).rejects.toMatchObject({ status: 422 });

    expect(result.current.reports[0]).toEqual(submittedReport);
  });
});

// ---------------------------------------------------------------------------
// handleUpdate()
// ---------------------------------------------------------------------------

describe('handleUpdate()', () => {
  it('updates the matching report fields in local state on success', async () => {
    const updatedReport = { ...sampleReport, title: 'Updated Title', total_amount: 999 };

    const { result } = await renderWithReports([sampleReport, anotherReport]);

    server.use(
      http.put(`/reports/${sampleReport.id}`, () =>
        HttpResponse.json(updatedReport, { status: 200 }),
      ),
    );

    await act(async () => {
      await result.current.handleUpdate(sampleReport.id, {
        title: 'Updated Title',
        total_amount: 999,
      });
    });

    expect(result.current.reports).toHaveLength(2);
    expect(result.current.reports[0]).toEqual(updatedReport);
    expect(result.current.reports[0].title).toBe('Updated Title');
    expect(result.current.reports[0].total_amount).toBe(999);
    // Other reports are unaffected
    expect(result.current.reports[1]).toEqual(anotherReport);
  });

  it('throws and leaves state unchanged when update fails', async () => {
    const { result } = await renderWithReports([sampleReport]);

    server.use(
      http.put(`/reports/${sampleReport.id}`, () =>
        HttpResponse.json({ detail: 'Conflict' }, { status: 409 }),
      ),
    );

    await expect(
      act(async () => {
        await result.current.handleUpdate(sampleReport.id, { title: 'New Title' });
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(result.current.reports[0]).toEqual(sampleReport);
  });
});

// ---------------------------------------------------------------------------
// handleDelete()
// ---------------------------------------------------------------------------

describe('handleDelete()', () => {
  it('removes the report from local state on success', async () => {
    const { result } = await renderWithReports([sampleReport, anotherReport]);

    server.use(
      http.delete(`/reports/${sampleReport.id}`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );

    await act(async () => {
      await result.current.handleDelete(sampleReport.id);
    });

    expect(result.current.reports).toHaveLength(1);
    expect(result.current.reports[0]).toEqual(anotherReport);
  });

  it('removes only the targeted report, leaving others intact', async () => {
    const { result } = await renderWithReports([sampleReport, anotherReport]);

    server.use(
      http.delete(`/reports/${anotherReport.id}`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );

    await act(async () => {
      await result.current.handleDelete(anotherReport.id);
    });

    expect(result.current.reports).toHaveLength(1);
    expect(result.current.reports[0]).toEqual(sampleReport);
  });

  it('throws and leaves state unchanged when delete fails', async () => {
    const { result } = await renderWithReports([sampleReport]);

    server.use(
      http.delete(`/reports/${sampleReport.id}`, () =>
        HttpResponse.json({ detail: 'Conflict' }, { status: 409 }),
      ),
    );

    await expect(
      act(async () => {
        await result.current.handleDelete(sampleReport.id);
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(result.current.reports).toHaveLength(1);
    expect(result.current.reports[0]).toEqual(sampleReport);
  });
});
