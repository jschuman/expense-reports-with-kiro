/**
 * Unit tests for frontend/src/api/expenseLines.ts
 * Uses MSW v2 to intercept fetch calls.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { listLines, createLine, updateLine, deleteLine } from '../expenseLines';
import { ApiError } from '../client';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const sampleLine = {
  id: 1,
  report_id: 10,
  description: 'Taxi to airport',
  amount: 45.50,
  incurred_date: '2026-04-23',
};

// ---------------------------------------------------------------------------
// listLines()
// ---------------------------------------------------------------------------

describe('listLines()', () => {
  it('sends GET /reports/{reportId}/lines and returns ExpenseLineResponse[] on 200', async () => {
    let capturedMethod: string | undefined;
    let capturedUrl: string | undefined;

    server.use(
      http.get('/reports/:reportId/lines', ({ request }) => {
        capturedMethod = request.method;
        capturedUrl = request.url;
        return HttpResponse.json([sampleLine], { status: 200 });
      }),
    );

    const result = await listLines(10);

    expect(result).toEqual([sampleLine]);
    expect(capturedMethod).toBe('GET');
    expect(capturedUrl).toContain('/reports/10/lines');
  });

  it('returns an empty array when the server returns []', async () => {
    server.use(
      http.get('/reports/:reportId/lines', () => HttpResponse.json([], { status: 200 })),
    );

    const result = await listLines(10);
    expect(result).toEqual([]);
  });

  it('returns multiple lines in the correct order', async () => {
    const lines = [
      { ...sampleLine, id: 1, description: 'First' },
      { ...sampleLine, id: 2, description: 'Second' },
      { ...sampleLine, id: 3, description: 'Third' },
    ];

    server.use(
      http.get('/reports/:reportId/lines', () => HttpResponse.json(lines, { status: 200 })),
    );

    const result = await listLines(10);
    expect(result).toEqual(lines);
    expect(result).toHaveLength(3);
  });

  it('throws ApiError on 401', async () => {
    server.use(
      http.get('/reports/:reportId/lines', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    await expect(listLines(10)).rejects.toThrow(ApiError);
    await expect(listLines(10)).rejects.toMatchObject({ status: 401 });
  });

  it('throws ApiError on 403 (non-owner non-admin)', async () => {
    server.use(
      http.get('/reports/:reportId/lines', () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
    );

    await expect(listLines(10)).rejects.toThrow(ApiError);
    await expect(listLines(10)).rejects.toMatchObject({ status: 403 });
  });

  it('throws ApiError on 404 (report not found)', async () => {
    server.use(
      http.get('/reports/:reportId/lines', () =>
        HttpResponse.json({ detail: 'Report not found' }, { status: 404 }),
      ),
    );

    await expect(listLines(99)).rejects.toThrow(ApiError);
    await expect(listLines(99)).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// createLine()
// ---------------------------------------------------------------------------

describe('createLine()', () => {
  it('sends POST /reports/{reportId}/lines with correct JSON body and returns ExpenseLineResponse on 201', async () => {
    let capturedRequest: Request | undefined;

    server.use(
      http.post('/reports/:reportId/lines', async ({ request }) => {
        capturedRequest = request.clone();
        return HttpResponse.json(sampleLine, { status: 201 });
      }),
    );

    const payload = {
      description: 'Taxi to airport',
      amount: 45.50,
      incurred_date: '2026-04-23',
    };
    const result = await createLine(10, payload);

    expect(result).toEqual(sampleLine);
    expect(capturedRequest).toBeDefined();
    expect(capturedRequest!.method).toBe('POST');
    expect(capturedRequest!.headers.get('content-type')).toContain('application/json');
    expect(capturedRequest!.url).toContain('/reports/10/lines');

    const body = await capturedRequest!.json();
    expect(body).toEqual(payload);
  });

  it('sends the exact description, amount, and incurred_date provided', async () => {
    let capturedBody: unknown;

    server.use(
      http.post('/reports/:reportId/lines', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(
          {
            ...sampleLine,
            description: 'Hotel stay',
            amount: 250.00,
            incurred_date: '2026-04-20',
          },
          { status: 201 },
        );
      }),
    );

    await createLine(10, {
      description: 'Hotel stay',
      amount: 250.00,
      incurred_date: '2026-04-20',
    });

    expect(capturedBody).toEqual({
      description: 'Hotel stay',
      amount: 250.00,
      incurred_date: '2026-04-20',
    });
  });

  it('throws ApiError on 401', async () => {
    server.use(
      http.post('/reports/:reportId/lines', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    await expect(
      createLine(10, {
        description: 'Test',
        amount: 10,
        incurred_date: '2026-04-23',
      }),
    ).rejects.toThrow(ApiError);
    await expect(
      createLine(10, {
        description: 'Test',
        amount: 10,
        incurred_date: '2026-04-23',
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('throws ApiError on 403 (non-owner)', async () => {
    server.use(
      http.post('/reports/:reportId/lines', () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
    );

    await expect(
      createLine(10, {
        description: 'Test',
        amount: 10,
        incurred_date: '2026-04-23',
      }),
    ).rejects.toThrow(ApiError);
    await expect(
      createLine(10, {
        description: 'Test',
        amount: 10,
        incurred_date: '2026-04-23',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('throws ApiError on 409 (locked status)', async () => {
    server.use(
      http.post('/reports/:reportId/lines', () =>
        HttpResponse.json(
          { detail: 'Cannot perform this action on a report with status Submitted' },
          { status: 409 },
        ),
      ),
    );

    await expect(
      createLine(10, {
        description: 'Test',
        amount: 10,
        incurred_date: '2026-04-23',
      }),
    ).rejects.toThrow(ApiError);
    await expect(
      createLine(10, {
        description: 'Test',
        amount: 10,
        incurred_date: '2026-04-23',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('throws ApiError on 422 (validation failure)', async () => {
    server.use(
      http.post('/reports/:reportId/lines', () =>
        HttpResponse.json(
          { detail: [{ loc: ['body', 'description'], msg: 'field required' }] },
          { status: 422 },
        ),
      ),
    );

    await expect(
      createLine(10, {
        description: '',
        amount: 10,
        incurred_date: '2026-04-23',
      }),
    ).rejects.toThrow(ApiError);
    await expect(
      createLine(10, {
        description: '',
        amount: 10,
        incurred_date: '2026-04-23',
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('throws ApiError on 404 (report not found)', async () => {
    server.use(
      http.post('/reports/:reportId/lines', () =>
        HttpResponse.json({ detail: 'Report not found' }, { status: 404 }),
      ),
    );

    await expect(
      createLine(99, {
        description: 'Test',
        amount: 10,
        incurred_date: '2026-04-23',
      }),
    ).rejects.toThrow(ApiError);
    await expect(
      createLine(99, {
        description: 'Test',
        amount: 10,
        incurred_date: '2026-04-23',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// updateLine()
// ---------------------------------------------------------------------------

describe('updateLine()', () => {
  it('sends PUT /reports/{reportId}/lines/{lineId} with correct JSON body and returns ExpenseLineResponse on 200', async () => {
    let capturedRequest: Request | undefined;

    server.use(
      http.put('/reports/:reportId/lines/:lineId', async ({ request }) => {
        capturedRequest = request.clone();
        return HttpResponse.json(
          { ...sampleLine, description: 'Updated description' },
          { status: 200 },
        );
      }),
    );

    const payload = { description: 'Updated description' };
    const result = await updateLine(10, 1, payload);

    expect(result).toEqual({ ...sampleLine, description: 'Updated description' });
    expect(capturedRequest).toBeDefined();
    expect(capturedRequest!.method).toBe('PUT');
    expect(capturedRequest!.headers.get('content-type')).toContain('application/json');
    expect(capturedRequest!.url).toContain('/reports/10/lines/1');

    const body = await capturedRequest!.json();
    expect(body).toEqual(payload);
  });

  it('sends only the provided fields in the request body (partial update)', async () => {
    let capturedBody: unknown;

    server.use(
      http.put('/reports/:reportId/lines/:lineId', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(sampleLine, { status: 200 });
      }),
    );

    await updateLine(10, 1, { amount: 99.99 });

    expect(capturedBody).toEqual({ amount: 99.99 });
  });

  it('sends Content-Type: application/json header', async () => {
    let capturedContentType: string | null = null;

    server.use(
      http.put('/reports/:reportId/lines/:lineId', ({ request }) => {
        capturedContentType = request.headers.get('content-type');
        return HttpResponse.json(sampleLine, { status: 200 });
      }),
    );

    await updateLine(10, 1, { description: 'Test' });

    expect(capturedContentType).toContain('application/json');
  });

  it('throws ApiError on 401', async () => {
    server.use(
      http.put('/reports/:reportId/lines/:lineId', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    await expect(updateLine(10, 1, { description: 'x' })).rejects.toThrow(ApiError);
    await expect(updateLine(10, 1, { description: 'x' })).rejects.toMatchObject({ status: 401 });
  });

  it('throws ApiError on 403 (non-owner)', async () => {
    server.use(
      http.put('/reports/:reportId/lines/:lineId', () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
    );

    await expect(updateLine(10, 1, { description: 'x' })).rejects.toThrow(ApiError);
    await expect(updateLine(10, 1, { description: 'x' })).rejects.toMatchObject({ status: 403 });
  });

  it('throws ApiError on 409 (locked status)', async () => {
    server.use(
      http.put('/reports/:reportId/lines/:lineId', () =>
        HttpResponse.json(
          { detail: 'Cannot perform this action on a report with status Submitted' },
          { status: 409 },
        ),
      ),
    );

    await expect(updateLine(10, 1, { description: 'x' })).rejects.toThrow(ApiError);
    await expect(updateLine(10, 1, { description: 'x' })).rejects.toMatchObject({ status: 409 });
  });

  it('throws ApiError on 422 (validation failure)', async () => {
    server.use(
      http.put('/reports/:reportId/lines/:lineId', () =>
        HttpResponse.json(
          { detail: [{ loc: ['body', 'amount'], msg: 'ensure this value is greater than 0' }] },
          { status: 422 },
        ),
      ),
    );

    await expect(updateLine(10, 1, { amount: -5 })).rejects.toThrow(ApiError);
    await expect(updateLine(10, 1, { amount: -5 })).rejects.toMatchObject({ status: 422 });
  });

  it('throws ApiError on 404 (report not found)', async () => {
    server.use(
      http.put('/reports/:reportId/lines/:lineId', () =>
        HttpResponse.json({ detail: 'Report not found' }, { status: 404 }),
      ),
    );

    await expect(updateLine(99, 1, { description: 'x' })).rejects.toThrow(ApiError);
    await expect(updateLine(99, 1, { description: 'x' })).rejects.toMatchObject({ status: 404 });
  });

  it('throws ApiError on 404 (line not found)', async () => {
    server.use(
      http.put('/reports/:reportId/lines/:lineId', () =>
        HttpResponse.json({ detail: 'Line not found' }, { status: 404 }),
      ),
    );

    await expect(updateLine(10, 99, { description: 'x' })).rejects.toThrow(ApiError);
    await expect(updateLine(10, 99, { description: 'x' })).rejects.toMatchObject({ status: 404 });
  });

  it('throws ApiError on 404 (line belongs to different report)', async () => {
    server.use(
      http.put('/reports/:reportId/lines/:lineId', () =>
        HttpResponse.json({ detail: 'Line not found' }, { status: 404 }),
      ),
    );

    await expect(updateLine(10, 1, { description: 'x' })).rejects.toThrow(ApiError);
    await expect(updateLine(10, 1, { description: 'x' })).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// deleteLine()
// ---------------------------------------------------------------------------

describe('deleteLine()', () => {
  it('sends DELETE /reports/{reportId}/lines/{lineId} and resolves void on 204', async () => {
    let capturedMethod: string | undefined;
    let capturedUrl: string | undefined;

    server.use(
      http.delete('/reports/:reportId/lines/:lineId', ({ request }) => {
        capturedMethod = request.method;
        capturedUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const result = await deleteLine(10, 1);

    expect(result).toBeUndefined();
    expect(capturedMethod).toBe('DELETE');
    expect(capturedUrl).toContain('/reports/10/lines/1');
  });

  it('sends DELETE to the correct report and line IDs', async () => {
    let capturedUrl: string | undefined;

    server.use(
      http.delete('/reports/:reportId/lines/:lineId', ({ request }) => {
        capturedUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await deleteLine(42, 7);

    expect(capturedUrl).toContain('/reports/42/lines/7');
  });

  it('throws ApiError on 401', async () => {
    server.use(
      http.delete('/reports/:reportId/lines/:lineId', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    await expect(deleteLine(10, 1)).rejects.toThrow(ApiError);
    await expect(deleteLine(10, 1)).rejects.toMatchObject({ status: 401 });
  });

  it('throws ApiError on 403 (non-owner)', async () => {
    server.use(
      http.delete('/reports/:reportId/lines/:lineId', () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
    );

    await expect(deleteLine(10, 1)).rejects.toThrow(ApiError);
    await expect(deleteLine(10, 1)).rejects.toMatchObject({ status: 403 });
  });

  it('throws ApiError on 409 (locked status)', async () => {
    server.use(
      http.delete('/reports/:reportId/lines/:lineId', () =>
        HttpResponse.json(
          { detail: 'Cannot perform this action on a report with status Submitted' },
          { status: 409 },
        ),
      ),
    );

    await expect(deleteLine(10, 1)).rejects.toThrow(ApiError);
    await expect(deleteLine(10, 1)).rejects.toMatchObject({ status: 409 });
  });

  it('throws ApiError on 404 (line not found)', async () => {
    server.use(
      http.delete('/reports/:reportId/lines/:lineId', () =>
        HttpResponse.json({ detail: 'Line not found' }, { status: 404 }),
      ),
    );

    await expect(deleteLine(10, 99)).rejects.toThrow(ApiError);
    await expect(deleteLine(10, 99)).rejects.toMatchObject({ status: 404 });
  });

  it('throws ApiError on 404 (report not found)', async () => {
    server.use(
      http.delete('/reports/:reportId/lines/:lineId', () =>
        HttpResponse.json({ detail: 'Report not found' }, { status: 404 }),
      ),
    );

    await expect(deleteLine(99, 1)).rejects.toThrow(ApiError);
    await expect(deleteLine(99, 1)).rejects.toMatchObject({ status: 404 });
  });

  it('handles non-JSON error response gracefully', async () => {
    server.use(
      http.delete('/reports/:reportId/lines/:lineId', () =>
        new HttpResponse('Internal Server Error', { status: 500 }),
      ),
    );

    await expect(deleteLine(10, 1)).rejects.toThrow(ApiError);
    await expect(deleteLine(10, 1)).rejects.toMatchObject({ status: 500 });
  });

  it('handles error response with non-string detail field', async () => {
    server.use(
      http.delete('/reports/:reportId/lines/:lineId', () =>
        HttpResponse.json(
          { detail: [{ loc: ['body'], msg: 'error' }] },
          { status: 422 },
        ),
      ),
    );

    await expect(deleteLine(10, 1)).rejects.toThrow(ApiError);
    await expect(deleteLine(10, 1)).rejects.toMatchObject({ status: 422 });
  });
});

// ---------------------------------------------------------------------------
// Error handling for other functions
// ---------------------------------------------------------------------------

describe('Error handling for listLines()', () => {
  it('handles non-JSON error response gracefully', async () => {
    server.use(
      http.get('/reports/:reportId/lines', () =>
        new HttpResponse('Internal Server Error', { status: 500 }),
      ),
    );

    await expect(listLines(10)).rejects.toThrow(ApiError);
    await expect(listLines(10)).rejects.toMatchObject({ status: 500 });
  });

  it('handles error response with non-string detail field', async () => {
    server.use(
      http.get('/reports/:reportId/lines', () =>
        HttpResponse.json(
          { detail: [{ loc: ['query'], msg: 'error' }] },
          { status: 422 },
        ),
      ),
    );

    await expect(listLines(10)).rejects.toThrow(ApiError);
    await expect(listLines(10)).rejects.toMatchObject({ status: 422 });
  });
});

describe('Error handling for createLine()', () => {
  it('handles non-JSON error response gracefully', async () => {
    server.use(
      http.post('/reports/:reportId/lines', () =>
        new HttpResponse('Internal Server Error', { status: 500 }),
      ),
    );

    await expect(
      createLine(10, {
        description: 'Test',
        amount: 10,
        incurred_date: '2026-04-23',
      }),
    ).rejects.toThrow(ApiError);
    await expect(
      createLine(10, {
        description: 'Test',
        amount: 10,
        incurred_date: '2026-04-23',
      }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it('handles error response with non-string detail field', async () => {
    server.use(
      http.post('/reports/:reportId/lines', () =>
        HttpResponse.json(
          { detail: [{ loc: ['body', 'amount'], msg: 'error' }] },
          { status: 422 },
        ),
      ),
    );

    await expect(
      createLine(10, {
        description: 'Test',
        amount: 10,
        incurred_date: '2026-04-23',
      }),
    ).rejects.toThrow(ApiError);
    await expect(
      createLine(10, {
        description: 'Test',
        amount: 10,
        incurred_date: '2026-04-23',
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('Error handling for updateLine()', () => {
  it('handles non-JSON error response gracefully', async () => {
    server.use(
      http.put('/reports/:reportId/lines/:lineId', () =>
        new HttpResponse('Internal Server Error', { status: 500 }),
      ),
    );

    await expect(updateLine(10, 1, { description: 'x' })).rejects.toThrow(ApiError);
    await expect(updateLine(10, 1, { description: 'x' })).rejects.toMatchObject({ status: 500 });
  });

  it('handles error response with non-string detail field', async () => {
    server.use(
      http.put('/reports/:reportId/lines/:lineId', () =>
        HttpResponse.json(
          { detail: [{ loc: ['body', 'amount'], msg: 'error' }] },
          { status: 422 },
        ),
      ),
    );

    await expect(updateLine(10, 1, { description: 'x' })).rejects.toThrow(ApiError);
    await expect(updateLine(10, 1, { description: 'x' })).rejects.toMatchObject({ status: 422 });
  });
});
