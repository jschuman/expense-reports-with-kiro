/**
 * Unit tests for frontend/src/api/reports.ts
 * Uses MSW v2 to intercept fetch calls.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { listReports, createReport, submitReport, acceptReport, rejectReport, updateReport, deleteReport } from '../reports';
import { ApiError } from '../client';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const sampleReport = {
  id: 1,
  title: 'Q1 Travel',
  purpose: 'Client visit',
  total_amount: 450.0,
  status: 'Pending',
  owner_id: 1,
};

// ---------------------------------------------------------------------------
// listReports()
// ---------------------------------------------------------------------------

describe('listReports()', () => {
  it('sends GET /reports and returns ExpenseReportResponse[] on 200', async () => {
    let capturedMethod: string | undefined;

    server.use(
      http.get('/reports', ({ request }) => {
        capturedMethod = request.method;
        return HttpResponse.json([sampleReport], { status: 200 });
      }),
    );

    const result = await listReports();

    expect(result).toEqual([sampleReport]);
    expect(capturedMethod).toBe('GET');
  });

  it('returns an empty array when the server returns []', async () => {
    server.use(
      http.get('/reports', () => HttpResponse.json([], { status: 200 })),
    );

    const result = await listReports();
    expect(result).toEqual([]);
  });

  it('throws ApiError on 401', async () => {
    server.use(
      http.get('/reports', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    await expect(listReports()).rejects.toThrow(ApiError);
    await expect(listReports()).rejects.toMatchObject({ status: 401 });
  });
});

// ---------------------------------------------------------------------------
// createReport()
// ---------------------------------------------------------------------------

describe('createReport()', () => {
  it('sends POST /reports with correct JSON body and returns ExpenseReportResponse on 201', async () => {
    let capturedRequest: Request | undefined;

    server.use(
      http.post('/reports', async ({ request }) => {
        capturedRequest = request.clone();
        return HttpResponse.json(sampleReport, { status: 201 });
      }),
    );

    const payload = { title: 'Q1 Travel', purpose: 'Client visit', total_amount: 450.0 };
    const result = await createReport(payload);

    expect(result).toEqual(sampleReport);
    expect(capturedRequest).toBeDefined();
    expect(capturedRequest!.method).toBe('POST');
    expect(capturedRequest!.headers.get('content-type')).toContain('application/json');

    const body = await capturedRequest!.json();
    expect(body).toEqual(payload);
  });

  it('sends the exact title, purpose, and total_amount provided', async () => {
    let capturedBody: unknown;

    server.use(
      http.post('/reports', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(
          { ...sampleReport, title: 'Conference', purpose: 'Annual summit', total_amount: 1200.5 },
          { status: 201 },
        );
      }),
    );

    await createReport({ title: 'Conference', purpose: 'Annual summit', total_amount: 1200.5 });

    expect(capturedBody).toEqual({
      title: 'Conference',
      purpose: 'Annual summit',
      total_amount: 1200.5,
    });
  });

  it('throws ApiError on 401', async () => {
    server.use(
      http.post('/reports', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    await expect(
      createReport({ title: 'Test', purpose: 'Test', total_amount: 10 }),
    ).rejects.toThrow(ApiError);
    await expect(
      createReport({ title: 'Test', purpose: 'Test', total_amount: 10 }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('throws ApiError on 422 validation failure', async () => {
    server.use(
      http.post('/reports', () =>
        HttpResponse.json(
          { detail: [{ loc: ['body', 'title'], msg: 'field required' }] },
          { status: 422 },
        ),
      ),
    );

    await expect(
      createReport({ title: '', purpose: 'Test', total_amount: 10 }),
    ).rejects.toThrow(ApiError);
    await expect(
      createReport({ title: '', purpose: 'Test', total_amount: 10 }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

// ---------------------------------------------------------------------------
// submitReport()
// ---------------------------------------------------------------------------

describe('submitReport()', () => {
  it('sends POST /reports/{id}/submit and returns ExpenseReportResponse on 200', async () => {
    let capturedMethod: string | undefined;
    let capturedUrl: string | undefined;

    server.use(
      http.post('/reports/:id/submit', ({ request }) => {
        capturedMethod = request.method;
        capturedUrl = request.url;
        return HttpResponse.json({ ...sampleReport, status: 'Submitted' }, { status: 200 });
      }),
    );

    const result = await submitReport(1);

    expect(result).toEqual({ ...sampleReport, status: 'Submitted' });
    expect(capturedMethod).toBe('POST');
    expect(capturedUrl).toContain('/reports/1/submit');
  });

  it('throws ApiError on 403 (non-owner)', async () => {
    server.use(
      http.post('/reports/:id/submit', () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
    );

    await expect(submitReport(1)).rejects.toThrow(ApiError);
    await expect(submitReport(1)).rejects.toMatchObject({ status: 403 });
  });

  it('throws ApiError on 409 (invalid state)', async () => {
    server.use(
      http.post('/reports/:id/submit', () =>
        HttpResponse.json({ detail: 'Cannot submit from this state' }, { status: 409 }),
      ),
    );

    await expect(submitReport(1)).rejects.toThrow(ApiError);
    await expect(submitReport(1)).rejects.toMatchObject({ status: 409 });
  });
});

// ---------------------------------------------------------------------------
// acceptReport()
// ---------------------------------------------------------------------------

describe('acceptReport()', () => {
  it('sends POST /reports/{id}/accept and returns ExpenseReportResponse on 200', async () => {
    let capturedMethod: string | undefined;
    let capturedUrl: string | undefined;

    server.use(
      http.post('/reports/:id/accept', ({ request }) => {
        capturedMethod = request.method;
        capturedUrl = request.url;
        return HttpResponse.json({ ...sampleReport, status: 'Scheduled for Payment' }, { status: 200 });
      }),
    );

    const result = await acceptReport(1);

    expect(result).toEqual({ ...sampleReport, status: 'Scheduled for Payment' });
    expect(capturedMethod).toBe('POST');
    expect(capturedUrl).toContain('/reports/1/accept');
  });

  it('throws ApiError on 403 (non-admin)', async () => {
    server.use(
      http.post('/reports/:id/accept', () =>
        HttpResponse.json({ detail: 'Admin role required' }, { status: 403 }),
      ),
    );

    await expect(acceptReport(1)).rejects.toThrow(ApiError);
    await expect(acceptReport(1)).rejects.toMatchObject({ status: 403 });
  });

  it('throws ApiError on 409 (invalid state)', async () => {
    server.use(
      http.post('/reports/:id/accept', () =>
        HttpResponse.json({ detail: 'Cannot accept from this state' }, { status: 409 }),
      ),
    );

    await expect(acceptReport(1)).rejects.toThrow(ApiError);
    await expect(acceptReport(1)).rejects.toMatchObject({ status: 409 });
  });
});

// ---------------------------------------------------------------------------
// rejectReport()
// ---------------------------------------------------------------------------

describe('rejectReport()', () => {
  it('sends POST /reports/{id}/reject with { admin_notes } body and returns ExpenseReportResponse on 200', async () => {
    let capturedMethod: string | undefined;
    let capturedUrl: string | undefined;
    let capturedBody: unknown;

    server.use(
      http.post('/reports/:id/reject', async ({ request }) => {
        capturedMethod = request.method;
        capturedUrl = request.url;
        capturedBody = await request.json();
        return HttpResponse.json({ ...sampleReport, status: 'Rejected', admin_notes: 'Missing receipts' }, { status: 200 });
      }),
    );

    const result = await rejectReport(1, 'Missing receipts');

    expect(result).toEqual({ ...sampleReport, status: 'Rejected', admin_notes: 'Missing receipts' });
    expect(capturedMethod).toBe('POST');
    expect(capturedUrl).toContain('/reports/1/reject');
    expect(capturedBody).toEqual({ admin_notes: 'Missing receipts' });
  });

  it('sends the exact admin_notes string provided', async () => {
    let capturedBody: unknown;

    server.use(
      http.post('/reports/:id/reject', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ...sampleReport, status: 'Rejected' }, { status: 200 });
      }),
    );

    await rejectReport(42, 'Amount exceeds policy limit');

    expect(capturedBody).toEqual({ admin_notes: 'Amount exceeds policy limit' });
  });

  it('sends Content-Type: application/json header', async () => {
    let capturedContentType: string | null = null;

    server.use(
      http.post('/reports/:id/reject', ({ request }) => {
        capturedContentType = request.headers.get('content-type');
        return HttpResponse.json({ ...sampleReport, status: 'Rejected' }, { status: 200 });
      }),
    );

    await rejectReport(1, 'Some reason');

    expect(capturedContentType).toContain('application/json');
  });

  it('throws ApiError on 403 (non-admin)', async () => {
    server.use(
      http.post('/reports/:id/reject', () =>
        HttpResponse.json({ detail: 'Admin role required' }, { status: 403 }),
      ),
    );

    await expect(rejectReport(1, 'reason')).rejects.toThrow(ApiError);
    await expect(rejectReport(1, 'reason')).rejects.toMatchObject({ status: 403 });
  });

  it('throws ApiError on 422 (empty admin_notes)', async () => {
    server.use(
      http.post('/reports/:id/reject', () =>
        HttpResponse.json({ detail: 'admin_notes must be non-empty' }, { status: 422 }),
      ),
    );

    await expect(rejectReport(1, '')).rejects.toThrow(ApiError);
    await expect(rejectReport(1, '')).rejects.toMatchObject({ status: 422 });
  });
});

// ---------------------------------------------------------------------------
// updateReport()
// ---------------------------------------------------------------------------

describe('updateReport()', () => {
  it('sends PUT /reports/{id} with the update body and returns ExpenseReportResponse on 200', async () => {
    let capturedMethod: string | undefined;
    let capturedUrl: string | undefined;
    let capturedBody: unknown;

    server.use(
      http.put('/reports/:id', async ({ request }) => {
        capturedMethod = request.method;
        capturedUrl = request.url;
        capturedBody = await request.json();
        return HttpResponse.json({ ...sampleReport, title: 'Updated Title' }, { status: 200 });
      }),
    );

    const updateData = { title: 'Updated Title', total_amount: 500 };
    const result = await updateReport(1, updateData);

    expect(result).toEqual({ ...sampleReport, title: 'Updated Title' });
    expect(capturedMethod).toBe('PUT');
    expect(capturedUrl).toContain('/reports/1');
    expect(capturedBody).toEqual(updateData);
  });

  it('sends only the provided fields in the request body', async () => {
    let capturedBody: unknown;

    server.use(
      http.put('/reports/:id', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(sampleReport, { status: 200 });
      }),
    );

    await updateReport(5, { total_amount: 999.99 });

    expect(capturedBody).toEqual({ total_amount: 999.99 });
  });

  it('sends Content-Type: application/json header', async () => {
    let capturedContentType: string | null = null;

    server.use(
      http.put('/reports/:id', ({ request }) => {
        capturedContentType = request.headers.get('content-type');
        return HttpResponse.json(sampleReport, { status: 200 });
      }),
    );

    await updateReport(1, { title: 'Test' });

    expect(capturedContentType).toContain('application/json');
  });

  it('throws ApiError on 403 (non-owner)', async () => {
    server.use(
      http.put('/reports/:id', () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
    );

    await expect(updateReport(1, { title: 'x' })).rejects.toThrow(ApiError);
    await expect(updateReport(1, { title: 'x' })).rejects.toMatchObject({ status: 403 });
  });

  it('throws ApiError on 409 (read-only state)', async () => {
    server.use(
      http.put('/reports/:id', () =>
        HttpResponse.json({ detail: 'Cannot update in this state' }, { status: 409 }),
      ),
    );

    await expect(updateReport(1, { title: 'x' })).rejects.toThrow(ApiError);
    await expect(updateReport(1, { title: 'x' })).rejects.toMatchObject({ status: 409 });
  });
});

// ---------------------------------------------------------------------------
// deleteReport()
// ---------------------------------------------------------------------------

describe('deleteReport()', () => {
  it('sends DELETE /reports/{id} and resolves void on 204', async () => {
    let capturedMethod: string | undefined;
    let capturedUrl: string | undefined;

    server.use(
      http.delete('/reports/:id', ({ request }) => {
        capturedMethod = request.method;
        capturedUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const result = await deleteReport(1);

    expect(result).toBeUndefined();
    expect(capturedMethod).toBe('DELETE');
    expect(capturedUrl).toContain('/reports/1');
  });

  it('sends DELETE to the correct report ID', async () => {
    let capturedUrl: string | undefined;

    server.use(
      http.delete('/reports/:id', ({ request }) => {
        capturedUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await deleteReport(42);

    expect(capturedUrl).toContain('/reports/42');
  });

  it('throws ApiError on 403 (non-owner)', async () => {
    server.use(
      http.delete('/reports/:id', () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
    );

    await expect(deleteReport(1)).rejects.toThrow(ApiError);
    await expect(deleteReport(1)).rejects.toMatchObject({ status: 403 });
  });

  it('throws ApiError on 409 (read-only state)', async () => {
    server.use(
      http.delete('/reports/:id', () =>
        HttpResponse.json({ detail: 'Cannot delete in this state' }, { status: 409 }),
      ),
    );

    await expect(deleteReport(1)).rejects.toThrow(ApiError);
    await expect(deleteReport(1)).rejects.toMatchObject({ status: 409 });
  });

  it('throws ApiError on 404 (not found)', async () => {
    server.use(
      http.delete('/reports/:id', () =>
        HttpResponse.json({ detail: 'Report not found' }, { status: 404 }),
      ),
    );

    await expect(deleteReport(99)).rejects.toThrow(ApiError);
    await expect(deleteReport(99)).rejects.toMatchObject({ status: 404 });
  });

  it('throws ApiError using statusText when error JSON has no detail field', async () => {
    server.use(
      http.delete('/reports/:id', () =>
        HttpResponse.json({ message: 'something went wrong' }, { status: 500 }),
      ),
    );

    await expect(deleteReport(1)).rejects.toThrow(ApiError);
    await expect(deleteReport(1)).rejects.toMatchObject({ status: 500 });
  });

  it('throws ApiError with stringified detail when detail is a non-string', async () => {
    server.use(
      http.delete('/reports/:id', () =>
        HttpResponse.json({ detail: [{ loc: ['body'], msg: 'invalid' }] }, { status: 422 }),
      ),
    );

    await expect(deleteReport(1)).rejects.toThrow(ApiError);
    await expect(deleteReport(1)).rejects.toMatchObject({ status: 422 });
  });
});
