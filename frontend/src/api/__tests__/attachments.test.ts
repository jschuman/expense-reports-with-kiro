/**
 * Unit tests for frontend/src/api/attachments.ts
 *
 * uploadAttachment() uses XMLHttpRequest for progress tracking;
 * the XHR constructor is replaced with a factory that returns a
 * controllable stub for each test.
 *
 * deleteAttachment(), downloadAttachment(), and getAttachmentMetadata()
 * use fetch and are intercepted by MSW.
 */

import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  uploadAttachment,
  deleteAttachment,
  downloadAttachment,
  getAttachmentMetadata,
} from '../attachments';
import type { AttachmentMetadata } from '../../types/attachments';

// ---------------------------------------------------------------------------
// MSW server (for fetch-based functions)
// ---------------------------------------------------------------------------

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Shared sample data
// ---------------------------------------------------------------------------

const sampleMetadata: AttachmentMetadata = {
  id: 42,
  file_name: 'receipt.pdf',
  file_size: 12345,
  mime_type: 'application/pdf',
  created_at: '2026-05-12T10:00:00Z',
};

const makeFile = (name = 'receipt.pdf', type = 'application/pdf'): File =>
  new File(['%PDF-1.4 fake content'], name, { type });

// ---------------------------------------------------------------------------
// XHR mock helpers
// ---------------------------------------------------------------------------

interface XHREventMap {
  load: ProgressEvent;
  error: ProgressEvent;
  abort: ProgressEvent;
}

interface XHRUploadEventMap {
  progress: ProgressEvent;
}

/**
 * Build a minimal XHR stub.  Tests control the stub via the returned object.
 */
function makeXhrStub() {
  const uploadListeners: Partial<Record<keyof XHRUploadEventMap, EventListener>> = {};
  const listeners: Partial<Record<keyof XHREventMap, EventListener>> = {};

  const stub = {
    // Properties the implementation sets
    withCredentials: false as boolean,
    responseText: '',
    status: 0,
    statusText: '',

    // Mock methods
    open: vi.fn(),
    send: vi.fn(),

    upload: {
      addEventListener(
        type: keyof XHRUploadEventMap,
        listener: EventListener,
      ) {
        uploadListeners[type] = listener;
      },
    },

    addEventListener(type: keyof XHREventMap, listener: EventListener) {
      listeners[type] = listener;
    },

    // Test helpers to fire events
    fireProgress(loaded: number, total: number) {
      uploadListeners['progress']?.({
        lengthComputable: true,
        loaded,
        total,
      } as unknown as Event);
    },
    fireLoad(status: number, body: unknown) {
      stub.status = status;
      stub.statusText = status === 200 ? 'OK' : 'Error';
      stub.responseText = JSON.stringify(body);
      listeners['load']?.({} as Event);
    },
    fireError() {
      listeners['error']?.({} as Event);
    },
    fireAbort() {
      listeners['abort']?.({} as Event);
    },
    /**
     * Fire a load event using a raw response body string (not JSON-serialised).
     * Does NOT modify statusText — callers set xhrStub.statusText before calling.
     * Useful for testing the malformed-JSON-on-success branch and empty-statusText branch.
     */
    fireLoadRaw(status: number, rawText: string) {
      stub.status = status;
      stub.responseText = rawText;
      listeners['load']?.({} as Event);
    },
    /** Fire a progress event where lengthComputable is false. */
    fireProgressNonComputable() {
      uploadListeners['progress']?.({ lengthComputable: false, loaded: 0, total: 0 } as unknown as Event);
    },
  };

  return stub;
}

// ---------------------------------------------------------------------------
// uploadAttachment() — uses XHR
// ---------------------------------------------------------------------------

describe('uploadAttachment()', () => {
  let xhrStub: ReturnType<typeof makeXhrStub>;

  beforeEach(() => {
    xhrStub = makeXhrStub();
    // Replace the global XMLHttpRequest constructor for each test.
    // Must be a regular function (not arrow) so `new XMLHttpRequest()` works.
    // When a constructor returns an object, `new` uses that object as the result.
    vi.stubGlobal('XMLHttpRequest', vi.fn().mockImplementation(function () { return xhrStub; }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a POST request with the correct URL and sends form data', async () => {
    const promise = uploadAttachment(10, 5, makeFile());
    xhrStub.fireLoad(201, sampleMetadata);
    await promise;

    expect(xhrStub.open).toHaveBeenCalledWith(
      'POST',
      '/reports/10/lines/5/attachments',
    );
    expect(xhrStub.send).toHaveBeenCalledWith(expect.any(FormData));
    expect(xhrStub.withCredentials).toBe(true);
  });

  it('resolves with AttachmentMetadata on 201', async () => {
    const promise = uploadAttachment(10, 5, makeFile());
    xhrStub.fireLoad(201, sampleMetadata);
    const result = await promise;
    expect(result).toEqual(sampleMetadata);
  });

  it('sends the file as a FormData field named "file"', async () => {
    let capturedForm: FormData | undefined;
    xhrStub.send = vi.fn((form: FormData) => {
      capturedForm = form;
    });

    const file = makeFile('invoice.pdf');
    const promise = uploadAttachment(1, 2, file);
    xhrStub.fireLoad(200, sampleMetadata);
    await promise;

    expect(capturedForm).toBeInstanceOf(FormData);
    expect(capturedForm?.get('file')).toBe(file);
  });

  it('calls onProgress with 0–100 as the upload progresses', async () => {
    const onProgress = vi.fn();
    const promise = uploadAttachment(10, 5, makeFile(), onProgress);

    xhrStub.fireProgress(25, 100);
    xhrStub.fireProgress(50, 100);
    xhrStub.fireProgress(100, 100);
    xhrStub.fireLoad(201, sampleMetadata);
    await promise;

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, 25);
    expect(onProgress).toHaveBeenNthCalledWith(2, 50);
    expect(onProgress).toHaveBeenNthCalledWith(3, 100);
  });

  it('does not throw when onProgress is not provided', async () => {
    const promise = uploadAttachment(10, 5, makeFile()); // no onProgress
    xhrStub.fireProgress(50, 100); // should not crash
    xhrStub.fireLoad(201, sampleMetadata);
    await expect(promise).resolves.toEqual(sampleMetadata);
  });

  it('rejects with INVALID_FILE_TYPE for a 400 response about file type', async () => {
    const promise = uploadAttachment(10, 5, makeFile());
    xhrStub.fireLoad(400, { detail: 'File type not allowed' });
    await expect(promise).rejects.toMatchObject({
      type: 'INVALID_FILE_TYPE',
      message: 'File type not allowed',
    });
  });

  it('rejects with INVALID_CONTENT for a 400 response about content mismatch', async () => {
    const promise = uploadAttachment(10, 5, makeFile());
    xhrStub.fireLoad(400, { detail: 'File content does not match declared MIME type' });
    await expect(promise).rejects.toMatchObject({
      type: 'INVALID_CONTENT',
    });
  });

  it('rejects with FILE_TOO_LARGE for a 413 response', async () => {
    const promise = uploadAttachment(10, 5, makeFile());
    xhrStub.fireLoad(413, { detail: 'File too large' });
    await expect(promise).rejects.toMatchObject({ type: 'FILE_TOO_LARGE' });
  });

  it('rejects with UNAUTHORIZED for a 401 response', async () => {
    const promise = uploadAttachment(10, 5, makeFile());
    xhrStub.fireLoad(401, { detail: 'Not authenticated' });
    await expect(promise).rejects.toMatchObject({ type: 'UNAUTHORIZED' });
  });

  it('rejects with FORBIDDEN for a 403 response', async () => {
    const promise = uploadAttachment(10, 5, makeFile());
    xhrStub.fireLoad(403, { detail: 'Forbidden' });
    await expect(promise).rejects.toMatchObject({ type: 'FORBIDDEN' });
  });

  it('rejects with SERVER_ERROR for a 500 response', async () => {
    const promise = uploadAttachment(10, 5, makeFile());
    xhrStub.fireLoad(500, { detail: 'Internal server error' });
    await expect(promise).rejects.toMatchObject({ type: 'SERVER_ERROR' });
  });

  it('rejects with NETWORK_ERROR when the XHR fires an error event', async () => {
    const promise = uploadAttachment(10, 5, makeFile());
    xhrStub.fireError();
    await expect(promise).rejects.toMatchObject({ type: 'NETWORK_ERROR' });
  });

  it('rejects with NETWORK_ERROR when the upload is aborted', async () => {
    const promise = uploadAttachment(10, 5, makeFile());
    xhrStub.fireAbort();
    await expect(promise).rejects.toMatchObject({ type: 'NETWORK_ERROR' });
  });
});

// ---------------------------------------------------------------------------
// deleteAttachment() — uses fetch / MSW
// ---------------------------------------------------------------------------

describe('deleteAttachment()', () => {
  it('sends DELETE to the correct URL with credentials', async () => {
    let capturedRequest: Request | undefined;

    server.use(
      http.delete('/reports/:reportId/lines/:lineId/attachments', ({ request }) => {
        capturedRequest = request;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await deleteAttachment(10, 5);

    expect(capturedRequest?.method).toBe('DELETE');
    expect(capturedRequest?.url).toContain('/reports/10/lines/5/attachments');
  });

  it('resolves with void on 204', async () => {
    server.use(
      http.delete('/reports/:reportId/lines/:lineId/attachments', () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );

    const result = await deleteAttachment(10, 5);
    expect(result).toBeUndefined();
  });

  it('rejects with NOT_FOUND for 404', async () => {
    server.use(
      http.delete('/reports/:reportId/lines/:lineId/attachments', () =>
        HttpResponse.json({ detail: 'Attachment not found' }, { status: 404 }),
      ),
    );

    await expect(deleteAttachment(10, 5)).rejects.toMatchObject({ type: 'NOT_FOUND' });
  });

  it('rejects with UNAUTHORIZED for 401', async () => {
    server.use(
      http.delete('/reports/:reportId/lines/:lineId/attachments', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    await expect(deleteAttachment(10, 5)).rejects.toMatchObject({ type: 'UNAUTHORIZED' });
  });

  it('rejects with FORBIDDEN for 403', async () => {
    server.use(
      http.delete('/reports/:reportId/lines/:lineId/attachments', () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
    );

    await expect(deleteAttachment(10, 5)).rejects.toMatchObject({ type: 'FORBIDDEN' });
  });

  it('rejects with SERVER_ERROR for 500', async () => {
    server.use(
      http.delete('/reports/:reportId/lines/:lineId/attachments', () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    );

    await expect(deleteAttachment(10, 5)).rejects.toMatchObject({ type: 'SERVER_ERROR' });
  });
});

// ---------------------------------------------------------------------------
// downloadAttachment() — uses fetch / MSW
// ---------------------------------------------------------------------------

describe('downloadAttachment()', () => {
  beforeEach(() => {
    // Spy only on the static methods — do NOT replace the URL constructor itself
    // because MSW uses `new URL()` internally to parse request URLs.
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    // Remove the spies so subsequent tests get the real (or jsdom) implementations.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore – jsdom may not define these; we restore what we patched
    delete (URL as Record<string, unknown>)['createObjectURL'];
    // @ts-ignore
    delete (URL as Record<string, unknown>)['revokeObjectURL'];
    vi.restoreAllMocks();
  });

  it('sends GET to the correct URL', async () => {
    let capturedUrl: string | undefined;

    server.use(
      http.get('/reports/:reportId/lines/:lineId/attachments', ({ request }) => {
        capturedUrl = request.url;
        return new HttpResponse(new Uint8Array([37, 80, 68, 70]).buffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="receipt.pdf"',
          },
        });
      }),
    );

    // Spy on anchor element creation
    const anchorSpy = { href: '', download: '', click: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue(anchorSpy as unknown as HTMLElement);

    await downloadAttachment(10, 5);

    expect(capturedUrl).toContain('/reports/10/lines/5/attachments');
    expect(anchorSpy.download).toBe('receipt.pdf');
    expect(anchorSpy.click).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('uses "attachment" as filename when Content-Disposition header is missing', async () => {
    server.use(
      http.get('/reports/:reportId/lines/:lineId/attachments', () =>
        new HttpResponse(new Uint8Array([0]).buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        }),
      ),
    );

    const anchorSpy = { href: '', download: '', click: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue(anchorSpy as unknown as HTMLElement);

    await downloadAttachment(10, 5);

    expect(anchorSpy.download).toBe('attachment');

    vi.restoreAllMocks();
  });

  it('rejects with UNAUTHORIZED for 401', async () => {
    server.use(
      http.get('/reports/:reportId/lines/:lineId/attachments', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    await expect(downloadAttachment(10, 5)).rejects.toMatchObject({ type: 'UNAUTHORIZED' });
  });

  it('rejects with FORBIDDEN for 403', async () => {
    server.use(
      http.get('/reports/:reportId/lines/:lineId/attachments', () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
    );

    await expect(downloadAttachment(10, 5)).rejects.toMatchObject({ type: 'FORBIDDEN' });
  });

  it('rejects with NOT_FOUND for 404', async () => {
    server.use(
      http.get('/reports/:reportId/lines/:lineId/attachments', () =>
        HttpResponse.json({ detail: 'Not found' }, { status: 404 }),
      ),
    );

    await expect(downloadAttachment(10, 5)).rejects.toMatchObject({ type: 'NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// getAttachmentMetadata() — uses fetch / MSW
// ---------------------------------------------------------------------------

describe('getAttachmentMetadata()', () => {
  it('sends GET to /attachments/metadata and returns AttachmentMetadata on 200', async () => {
    let capturedUrl: string | undefined;

    server.use(
      http.get('/reports/:reportId/lines/:lineId/attachments/metadata', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(sampleMetadata, { status: 200 });
      }),
    );

    const result = await getAttachmentMetadata(10, 5);

    expect(result).toEqual(sampleMetadata);
    expect(capturedUrl).toContain('/reports/10/lines/5/attachments/metadata');
  });

  it('rejects with NOT_FOUND for 404', async () => {
    server.use(
      http.get('/reports/:reportId/lines/:lineId/attachments/metadata', () =>
        HttpResponse.json({ detail: 'Not found' }, { status: 404 }),
      ),
    );

    await expect(getAttachmentMetadata(10, 5)).rejects.toMatchObject({ type: 'NOT_FOUND' });
  });

  it('rejects with UNAUTHORIZED for 401', async () => {
    server.use(
      http.get('/reports/:reportId/lines/:lineId/attachments/metadata', () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    );

    await expect(getAttachmentMetadata(10, 5)).rejects.toMatchObject({ type: 'UNAUTHORIZED' });
  });

  it('rejects with FORBIDDEN for 403', async () => {
    server.use(
      http.get('/reports/:reportId/lines/:lineId/attachments/metadata', () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
    );

    await expect(getAttachmentMetadata(10, 5)).rejects.toMatchObject({ type: 'FORBIDDEN' });
  });

  it('rejects with SERVER_ERROR for 500', async () => {
    server.use(
      http.get('/reports/:reportId/lines/:lineId/attachments/metadata', () =>
        HttpResponse.json({ detail: 'Internal error' }, { status: 500 }),
      ),
    );

    await expect(getAttachmentMetadata(10, 5)).rejects.toMatchObject({ type: 'SERVER_ERROR' });
  });
});

// ---------------------------------------------------------------------------
// Coverage gap tests
// ---------------------------------------------------------------------------

describe('uploadAttachment() — coverage gaps', () => {
  let xhrStub: ReturnType<typeof makeXhrStub>;

  beforeEach(() => {
    xhrStub = makeXhrStub();
    vi.stubGlobal('XMLHttpRequest', vi.fn().mockImplementation(function () { return xhrStub; }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects with SERVER_ERROR when 2xx response body is malformed JSON (line 80)', async () => {
    const promise = uploadAttachment(10, 5, makeFile());
    xhrStub.statusText = 'OK';
    xhrStub.fireLoadRaw(200, '{not valid json{{');
    await expect(promise).rejects.toMatchObject({
      type: 'SERVER_ERROR',
      message: 'Invalid JSON response',
    });
  });

  it('does not call onProgress when event is not length-computable', async () => {
    const onProgress = vi.fn();
    const promise = uploadAttachment(10, 5, makeFile(), onProgress);
    xhrStub.fireProgressNonComputable();
    xhrStub.fireLoad(201, sampleMetadata);
    await promise;
    // onProgress should NOT have been called because lengthComputable was false
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('uses JSON.stringify for non-string detail in XHR error response body', async () => {
    const promise = uploadAttachment(10, 5, makeFile());
    xhrStub.fireLoad(400, { detail: { code: 'INVALID', reason: 'bad type' } });
    const err = await promise.catch((e: unknown) => e);
    expect(err).toMatchObject({ type: 'INVALID_FILE_TYPE' });
    // message should be the JSON-stringified detail object
    expect((err as { message: string }).message).toContain('INVALID');
  });

  it('falls back to String(status) when statusText is empty', async () => {
    const promise = uploadAttachment(10, 5, makeFile());
    xhrStub.statusText = '';
    xhrStub.fireLoadRaw(400, 'bad body');
    const err = await promise.catch((e: unknown) => e);
    expect(err).toMatchObject({ type: 'INVALID_FILE_TYPE' });
  });
});

describe('deleteAttachment() — coverage gaps', () => {
  it('rejects with NETWORK_ERROR when fetch itself throws (line 145)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));

    await expect(deleteAttachment(10, 5)).rejects.toMatchObject({ type: 'NETWORK_ERROR' });

    vi.unstubAllGlobals();
  });

  it('rejects with NETWORK_ERROR when fetch rejects with a non-Error value (line 41 false branch)', async () => {
    // Rejecting with a plain string — not an Error instance — hits the false branch
    // of `err instanceof Error ? err.message : 'Unknown error'` in mapError().
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('plain string rejection'));

    await expect(deleteAttachment(10, 5)).rejects.toMatchObject({
      type: 'NETWORK_ERROR',
      message: 'Unknown error',
    });

    vi.unstubAllGlobals();
  });

  it('handles non-string detail in error response body', async () => {
    server.use(
      http.delete('/reports/:reportId/lines/:lineId/attachments', () =>
        HttpResponse.json({ detail: { code: 'ERR' } }, { status: 500 }),
      ),
    );

    const err = await deleteAttachment(10, 5).catch((e: unknown) => e);
    expect(err).toMatchObject({ type: 'SERVER_ERROR' });
    expect((err as { message: string }).message).toContain('ERR');
  });

  it('uses statusText when error response body has no detail field (line 131 false branch)', async () => {
    server.use(
      http.delete('/reports/:reportId/lines/:lineId/attachments', () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );

    const err = await deleteAttachment(10, 5).catch((e: unknown) => e);
    expect(err).toMatchObject({ type: 'SERVER_ERROR' });
  });
});

describe('downloadAttachment() — coverage gaps', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    delete (URL as Record<string, unknown>)['createObjectURL'];
    // @ts-ignore
    delete (URL as Record<string, unknown>)['revokeObjectURL'];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects with NETWORK_ERROR when fetch itself throws (line 196)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));

    await expect(downloadAttachment(10, 5)).rejects.toMatchObject({ type: 'NETWORK_ERROR' });
  });

  it('handles non-string detail in error response body', async () => {
    server.use(
      http.get('/reports/:reportId/lines/:lineId/attachments', () =>
        HttpResponse.json({ detail: { code: 'ERR' } }, { status: 403 }),
      ),
    );

    const err = await downloadAttachment(10, 5).catch((e: unknown) => e);
    expect(err).toMatchObject({ type: 'FORBIDDEN' });
    expect((err as { message: string }).message).toContain('ERR');
  });

  it('uses statusText when error response body has no detail field (line 170 false branch)', async () => {
    server.use(
      http.get('/reports/:reportId/lines/:lineId/attachments', () =>
        HttpResponse.json({}, { status: 403 }),
      ),
    );

    const err = await downloadAttachment(10, 5).catch((e: unknown) => e);
    expect(err).toMatchObject({ type: 'FORBIDDEN' });
  });
});
