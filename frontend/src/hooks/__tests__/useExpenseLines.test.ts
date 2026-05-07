/**
 * Unit tests for frontend/src/hooks/useExpenseLines.ts
 * Uses MSW v2 to intercept fetch calls and @testing-library/react for hook rendering.
 * Validates Requirements: 2.4, 2.8, 3.4, 3.8, 4.3
 */

import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useExpenseLines } from '../useExpenseLines';
import * as expenseLinesApi from '../../api/expenseLines';

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

const reportId = 1;

const sampleLine = {
  id: 1,
  report_id: reportId,
  description: 'Taxi to airport',
  amount: 45.50,
  incurred_date: '2026-04-23',
};

const anotherLine = {
  id: 2,
  report_id: reportId,
  description: 'Hotel accommodation',
  amount: 150.00,
  incurred_date: '2026-04-24',
};

const thirdLine = {
  id: 3,
  report_id: reportId,
  description: 'Meals',
  amount: 75.25,
  incurred_date: '2026-04-25',
};

/** Helper: render the hook with a pre-loaded list of lines. */
async function renderWithLines(initialLines = [sampleLine]) {
  server.use(
    http.get(`/reports/${reportId}/lines`, () =>
      HttpResponse.json(initialLines, { status: 200 }),
    ),
  );
  const rendered = renderHook(() => useExpenseLines(reportId));
  await waitFor(() => expect(rendered.result.current.isLoading).toBe(false));
  return rendered;
}

// ---------------------------------------------------------------------------
// Lines fetched on mount
// ---------------------------------------------------------------------------

describe('lines fetched on mount', () => {
  it('populates lines state when listLines returns data', async () => {
    server.use(
      http.get(`/reports/${reportId}/lines`, () =>
        HttpResponse.json([sampleLine], { status: 200 }),
      ),
    );

    const { result } = renderHook(() => useExpenseLines(reportId));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.lines).toEqual([sampleLine]);
    expect(result.current.error).toBeNull();
  });

  it('sets lines to empty array when server returns []', async () => {
    server.use(
      http.get(`/reports/${reportId}/lines`, () =>
        HttpResponse.json([], { status: 200 }),
      ),
    );

    const { result } = renderHook(() => useExpenseLines(reportId));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.lines).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('sets error state when listLines fails', async () => {
    server.use(
      http.get(`/reports/${reportId}/lines`, () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    const { result } = renderHook(() => useExpenseLines(reportId));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.lines).toEqual([]);
  });

  it('uses error message from Error instance when listLines throws', async () => {
    server.use(
      http.get(`/reports/${reportId}/lines`, () =>
        HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 }),
      ),
    );

    const { result } = renderHook(() => useExpenseLines(reportId));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // ApiError extends Error, so message comes from the Error instance
    expect(result.current.error).toBe('Unauthorized');
  });

  it('uses fallback message when listLines rejects with a non-Error value', async () => {
    // Simulate a rejection with a non-Error value (e.g., a plain string)
    vi.spyOn(expenseLinesApi, 'listLines').mockRejectedValueOnce('network failure' as never);

    const { result } = renderHook(() => useExpenseLines(reportId));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('Failed to load lines');
  });

  it('does not update state when component unmounts before listLines resolves', async () => {
    let resolveRequest!: () => void;
    const requestGate = new Promise<void>((res) => { resolveRequest = res; });

    server.use(
      http.get(`/reports/${reportId}/lines`, async () => {
        await requestGate;
        return HttpResponse.json([sampleLine], { status: 200 });
      }),
    );

    const { result, unmount } = renderHook(() => useExpenseLines(reportId));
    expect(result.current.isLoading).toBe(true);

    // Unmount before the response arrives — cancelled flag is set to true
    unmount();

    // Now let the response through and flush microtasks
    resolveRequest();
    await new Promise((r) => setTimeout(r, 50));

    // State should remain at initial values (no update after unmount)
    expect(result.current.lines).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// handleCreate()
// ---------------------------------------------------------------------------

describe('handleCreate()', () => {
  it('calls createLine and triggers refetch on success', async () => {
    const { result } = await renderWithLines([sampleLine]);

    const newLine = { ...anotherLine };

    server.use(
      http.post(`/reports/${reportId}/lines`, () =>
        HttpResponse.json(newLine, { status: 201 }),
      ),
      http.get(`/reports/${reportId}/lines`, () =>
        HttpResponse.json([sampleLine, newLine], { status: 200 }),
      ),
    );

    await act(async () => {
      await result.current.handleCreate({
        description: 'Hotel accommodation',
        amount: 150.00,
        incurred_date: '2026-04-24',
      });
    });

    expect(result.current.lines).toHaveLength(2);
    expect(result.current.lines[1]).toEqual(newLine);
  });

  it('returns the created line from handleCreate', async () => {
    const { result } = await renderWithLines([]);

    const newLine = { ...sampleLine };

    server.use(
      http.post(`/reports/${reportId}/lines`, () =>
        HttpResponse.json(newLine, { status: 201 }),
      ),
      http.get(`/reports/${reportId}/lines`, () =>
        HttpResponse.json([newLine], { status: 200 }),
      ),
    );

    let created: typeof sampleLine | undefined;
    await act(async () => {
      created = await result.current.handleCreate({
        description: 'Taxi to airport',
        amount: 45.50,
        incurred_date: '2026-04-23',
      });
    });

    expect(created).toEqual(newLine);
  });

  it('throws and does not refetch when createLine fails', async () => {
    const { result } = await renderWithLines([sampleLine]);

    server.use(
      http.post(`/reports/${reportId}/lines`, () =>
        HttpResponse.json({ detail: 'Validation error' }, { status: 422 }),
      ),
    );

    await expect(
      act(async () => {
        await result.current.handleCreate({
          description: '',
          amount: -10,
          incurred_date: '2026-04-23',
        });
      }),
    ).rejects.toMatchObject({ status: 422 });

    // List should remain unchanged
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0]).toEqual(sampleLine);
  });

  it('throws when createLine returns 403 Forbidden (non-owner)', async () => {
    const { result } = await renderWithLines([sampleLine]);

    server.use(
      http.post(`/reports/${reportId}/lines`, () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
    );

    await expect(
      act(async () => {
        await result.current.handleCreate({
          description: 'Taxi',
          amount: 45.50,
          incurred_date: '2026-04-23',
        });
      }),
    ).rejects.toMatchObject({ status: 403 });

    expect(result.current.lines).toHaveLength(1);
  });

  it('throws when createLine returns 409 Conflict (locked status)', async () => {
    const { result } = await renderWithLines([sampleLine]);

    server.use(
      http.post(`/reports/${reportId}/lines`, () =>
        HttpResponse.json({ detail: 'Cannot perform this action on a report with status \'Submitted\'' }, { status: 409 }),
      ),
    );

    await expect(
      act(async () => {
        await result.current.handleCreate({
          description: 'Taxi',
          amount: 45.50,
          incurred_date: '2026-04-23',
        });
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(result.current.lines).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// handleUpdate()
// ---------------------------------------------------------------------------

describe('handleUpdate()', () => {
  it('calls updateLine and triggers refetch on success', async () => {
    const { result } = await renderWithLines([sampleLine, anotherLine]);

    const updatedLine = { ...sampleLine, description: 'Updated taxi fare', amount: 50.00 };

    server.use(
      http.put(`/reports/${reportId}/lines/${sampleLine.id}`, () =>
        HttpResponse.json(updatedLine, { status: 200 }),
      ),
      http.get(`/reports/${reportId}/lines`, () =>
        HttpResponse.json([updatedLine, anotherLine], { status: 200 }),
      ),
    );

    await act(async () => {
      await result.current.handleUpdate(sampleLine.id, {
        description: 'Updated taxi fare',
        amount: 50.00,
      });
    });

    expect(result.current.lines).toHaveLength(2);
    expect(result.current.lines[0]).toEqual(updatedLine);
    expect(result.current.lines[0].description).toBe('Updated taxi fare');
    expect(result.current.lines[0].amount).toBe(50.00);
    // Other lines are unaffected
    expect(result.current.lines[1]).toEqual(anotherLine);
  });

  it('supports partial updates (only provided fields)', async () => {
    const { result } = await renderWithLines([sampleLine]);

    const updatedLine = { ...sampleLine, amount: 60.00 };

    server.use(
      http.put(`/reports/${reportId}/lines/${sampleLine.id}`, () =>
        HttpResponse.json(updatedLine, { status: 200 }),
      ),
      http.get(`/reports/${reportId}/lines`, () =>
        HttpResponse.json([updatedLine], { status: 200 }),
      ),
    );

    await act(async () => {
      await result.current.handleUpdate(sampleLine.id, {
        amount: 60.00,
      });
    });

    expect(result.current.lines[0]).toEqual(updatedLine);
    expect(result.current.lines[0].amount).toBe(60.00);
    // Description should remain unchanged
    expect(result.current.lines[0].description).toBe(sampleLine.description);
  });

  it('throws and leaves state unchanged when updateLine fails', async () => {
    const { result } = await renderWithLines([sampleLine]);

    server.use(
      http.put(`/reports/${reportId}/lines/${sampleLine.id}`, () =>
        HttpResponse.json({ detail: 'Conflict' }, { status: 409 }),
      ),
    );

    await expect(
      act(async () => {
        await result.current.handleUpdate(sampleLine.id, {
          description: 'New description',
        });
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(result.current.lines[0]).toEqual(sampleLine);
  });

  it('throws when updateLine returns 403 Forbidden (non-owner)', async () => {
    const { result } = await renderWithLines([sampleLine]);

    server.use(
      http.put(`/reports/${reportId}/lines/${sampleLine.id}`, () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
    );

    await expect(
      act(async () => {
        await result.current.handleUpdate(sampleLine.id, {
          description: 'Updated',
        });
      }),
    ).rejects.toMatchObject({ status: 403 });

    expect(result.current.lines[0]).toEqual(sampleLine);
  });

  it('throws when updateLine returns 404 Not Found', async () => {
    const { result } = await renderWithLines([sampleLine]);

    server.use(
      http.put(`/reports/${reportId}/lines/999`, () =>
        HttpResponse.json({ detail: 'Line not found' }, { status: 404 }),
      ),
    );

    await expect(
      act(async () => {
        await result.current.handleUpdate(999, {
          description: 'Updated',
        });
      }),
    ).rejects.toMatchObject({ status: 404 });

    expect(result.current.lines[0]).toEqual(sampleLine);
  });
});

// ---------------------------------------------------------------------------
// handleDelete()
// ---------------------------------------------------------------------------

describe('handleDelete()', () => {
  it('calls deleteLine and triggers refetch on success', async () => {
    const { result } = await renderWithLines([sampleLine, anotherLine]);

    server.use(
      http.delete(`/reports/${reportId}/lines/${sampleLine.id}`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
      http.get(`/reports/${reportId}/lines`, () =>
        HttpResponse.json([anotherLine], { status: 200 }),
      ),
    );

    await act(async () => {
      await result.current.handleDelete(sampleLine.id);
    });

    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0]).toEqual(anotherLine);
  });

  it('removes only the targeted line, leaving others intact', async () => {
    const { result } = await renderWithLines([sampleLine, anotherLine, thirdLine]);

    server.use(
      http.delete(`/reports/${reportId}/lines/${anotherLine.id}`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
      http.get(`/reports/${reportId}/lines`, () =>
        HttpResponse.json([sampleLine, thirdLine], { status: 200 }),
      ),
    );

    await act(async () => {
      await result.current.handleDelete(anotherLine.id);
    });

    expect(result.current.lines).toHaveLength(2);
    expect(result.current.lines[0]).toEqual(sampleLine);
    expect(result.current.lines[1]).toEqual(thirdLine);
  });

  it('throws and leaves state unchanged when deleteLine fails', async () => {
    const { result } = await renderWithLines([sampleLine]);

    server.use(
      http.delete(`/reports/${reportId}/lines/${sampleLine.id}`, () =>
        HttpResponse.json({ detail: 'Conflict' }, { status: 409 }),
      ),
    );

    await expect(
      act(async () => {
        await result.current.handleDelete(sampleLine.id);
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0]).toEqual(sampleLine);
  });

  it('throws when deleteLine returns 403 Forbidden (non-owner)', async () => {
    const { result } = await renderWithLines([sampleLine]);

    server.use(
      http.delete(`/reports/${reportId}/lines/${sampleLine.id}`, () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
    );

    await expect(
      act(async () => {
        await result.current.handleDelete(sampleLine.id);
      }),
    ).rejects.toMatchObject({ status: 403 });

    expect(result.current.lines[0]).toEqual(sampleLine);
  });

  it('throws when deleteLine returns 404 Not Found', async () => {
    const { result } = await renderWithLines([sampleLine]);

    server.use(
      http.delete(`/reports/${reportId}/lines/999`, () =>
        HttpResponse.json({ detail: 'Line not found' }, { status: 404 }),
      ),
    );

    await expect(
      act(async () => {
        await result.current.handleDelete(999);
      }),
    ).rejects.toMatchObject({ status: 404 });

    expect(result.current.lines[0]).toEqual(sampleLine);
  });
});

// ---------------------------------------------------------------------------
// refetch()
// ---------------------------------------------------------------------------

describe('refetch()', () => {
  it('refetches lines and updates state', async () => {
    const { result } = await renderWithLines([sampleLine]);

    expect(result.current.lines).toHaveLength(1);

    // Update the mock to return additional lines
    server.use(
      http.get(`/reports/${reportId}/lines`, () =>
        HttpResponse.json([sampleLine, anotherLine], { status: 200 }),
      ),
    );

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.lines).toHaveLength(2);
    expect(result.current.lines[1]).toEqual(anotherLine);
  });

  it('sets loading state during refetch', async () => {
    const { result } = await renderWithLines([sampleLine]);

    // Update the mock to return additional lines
    server.use(
      http.get(`/reports/${reportId}/lines`, () =>
        HttpResponse.json([sampleLine, anotherLine], { status: 200 }),
      ),
    );

    await act(async () => {
      await result.current.refetch();
    });

    // After refetch completes, isLoading should be false
    expect(result.current.isLoading).toBe(false);
    expect(result.current.lines).toHaveLength(2);
  });

  it('clears error state on successful refetch', async () => {
    // Start with an error state
    server.use(
      http.get(`/reports/${reportId}/lines`, () =>
        HttpResponse.json({ detail: 'Error' }, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useExpenseLines(reportId));
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 3000 });

    expect(result.current.error).not.toBeNull();

    // Update the mock to return success
    server.use(
      http.get(`/reports/${reportId}/lines`, () =>
        HttpResponse.json([sampleLine], { status: 200 }),
      ),
    );

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.lines).toEqual([sampleLine]);
  });

  it('sets error state on refetch failure', async () => {
    const { result } = await renderWithLines([sampleLine]);

    expect(result.current.error).toBeNull();

    // Update the mock to return an error
    server.use(
      http.get(`/reports/${reportId}/lines`, () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    );

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).not.toBeNull();
    // Lines should remain unchanged on error
    expect(result.current.lines).toEqual([sampleLine]);
  });
});

// ---------------------------------------------------------------------------
// Multiple lines operations
// ---------------------------------------------------------------------------

describe('multiple lines operations', () => {
  it('handles create, update, and delete in sequence', async () => {
    const { result } = await renderWithLines([sampleLine]);

    // Create a new line
    const newLine = { ...anotherLine };
    server.use(
      http.post(`/reports/${reportId}/lines`, () =>
        HttpResponse.json(newLine, { status: 201 }),
      ),
      http.get(`/reports/${reportId}/lines`, () =>
        HttpResponse.json([sampleLine, newLine], { status: 200 }),
      ),
    );

    await act(async () => {
      await result.current.handleCreate({
        description: 'Hotel accommodation',
        amount: 150.00,
        incurred_date: '2026-04-24',
      });
    });

    expect(result.current.lines).toHaveLength(2);

    // Update the first line
    const updatedLine = { ...sampleLine, amount: 60.00 };
    server.use(
      http.put(`/reports/${reportId}/lines/${sampleLine.id}`, () =>
        HttpResponse.json(updatedLine, { status: 200 }),
      ),
      http.get(`/reports/${reportId}/lines`, () =>
        HttpResponse.json([updatedLine, newLine], { status: 200 }),
      ),
    );

    await act(async () => {
      await result.current.handleUpdate(sampleLine.id, { amount: 60.00 });
    });

    expect(result.current.lines[0]).toEqual(updatedLine);

    // Delete the second line
    server.use(
      http.delete(`/reports/${reportId}/lines/${newLine.id}`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
      http.get(`/reports/${reportId}/lines`, () =>
        HttpResponse.json([updatedLine], { status: 200 }),
      ),
    );

    await act(async () => {
      await result.current.handleDelete(newLine.id);
    });

    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0]).toEqual(updatedLine);
  });
});
