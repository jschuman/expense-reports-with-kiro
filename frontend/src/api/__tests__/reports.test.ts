/**
 * Unit tests for frontend/src/api/reports.ts
 * Uses MSW v2 to intercept fetch calls.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { listReports, createReport } from '../reports';
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
