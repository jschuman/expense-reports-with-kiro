/**
 * Attachment API client functions.
 * Mirrors backend routes under /reports/{reportId}/lines/{lineId}/attachments.
 *
 * Upload uses XMLHttpRequest so the caller can track upload progress via the
 * optional onProgress callback.  All other operations use apiFetch.
 */

import { ApiError, apiFetch } from './client';
import type { AttachmentMetadata, AttachmentUploadError } from '../types/attachments';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Map an ApiError (or unknown thrown value) to an AttachmentUploadError.
 */
function mapError(err: unknown): AttachmentUploadError {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 400:
        // Distinguish content mismatch from type/extension rejection by message.
        if (err.message.toLowerCase().includes('content')) {
          return { type: 'INVALID_CONTENT', message: err.message };
        }
        return { type: 'INVALID_FILE_TYPE', message: err.message };
      case 401:
        return { type: 'UNAUTHORIZED', message: err.message };
      case 403:
        return { type: 'FORBIDDEN', message: err.message };
      case 404:
        return { type: 'NOT_FOUND', message: err.message };
      case 413:
        return { type: 'FILE_TOO_LARGE', message: err.message };
      default:
        return { type: 'SERVER_ERROR', message: err.message };
    }
  }
  // Network failure or other unexpected error
  const message = err instanceof Error ? err.message : 'Unknown error';
  return { type: 'NETWORK_ERROR', message };
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

/**
 * POST /reports/{reportId}/lines/{lineId}/attachments
 *
 * Uploads a file as multipart/form-data.
 * Calls onProgress(0–100) as the upload proceeds.
 * Resolves with AttachmentMetadata on success.
 * Rejects with AttachmentUploadError on any failure.
 */
export function uploadAttachment(
  reportId: number,
  lineId: number,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<AttachmentMetadata> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as AttachmentMetadata);
        } catch {
          reject({ type: 'SERVER_ERROR', message: 'Invalid JSON response' } satisfies AttachmentUploadError);
        }
      } else {
        let message = xhr.statusText || String(xhr.status);
        try {
          const body = JSON.parse(xhr.responseText) as { detail?: unknown };
          if (body?.detail) {
            message =
              typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
          }
        } catch {
          // ignore — use statusText
        }
        reject(mapError(new ApiError(xhr.status, message)));
      }
    });

    xhr.addEventListener('error', () => {
      reject(mapError(new Error('Network error')));
    });

    xhr.addEventListener('abort', () => {
      reject(mapError(new Error('Upload aborted')));
    });

    xhr.open('POST', `/reports/${reportId}/lines/${lineId}/attachments`);
    xhr.withCredentials = true;
    xhr.send(formData);
  });
}

/**
 * DELETE /reports/{reportId}/lines/{lineId}/attachments
 *
 * Deletes the attachment for the given line.
 * Resolves with void on 204 No Content.
 * Rejects with AttachmentUploadError on failure.
 */
export async function deleteAttachment(
  reportId: number,
  lineId: number,
): Promise<void> {
  try {
    const response = await fetch(
      `/reports/${reportId}/lines/${lineId}/attachments`,
      { method: 'DELETE', credentials: 'include' },
    );
    if (!response.ok) {
      let message = response.statusText;
      try {
        const body = await response.json() as { detail?: unknown };
        if (body?.detail) {
          message =
            typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
        }
      } catch {
        // ignore
      }
      throw mapError(new ApiError(response.status, message));
    }
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'type' in err) {
      // Already an AttachmentUploadError — re-throw
      throw err;
    }
    throw mapError(err);
  }
}

/**
 * GET /reports/{reportId}/lines/{lineId}/attachments
 *
 * Downloads the attachment file and triggers a browser download.
 * Resolves with void when the download has been triggered.
 * Rejects with AttachmentUploadError on failure.
 */
export async function downloadAttachment(
  reportId: number,
  lineId: number,
): Promise<void> {
  try {
    const response = await fetch(
      `/reports/${reportId}/lines/${lineId}/attachments`,
      { credentials: 'include' },
    );

    if (!response.ok) {
      let message = response.statusText;
      try {
        const body = await response.json() as { detail?: unknown };
        if (body?.detail) {
          message =
            typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
        }
      } catch {
        // ignore
      }
      throw mapError(new ApiError(response.status, message));
    }

    // Derive the filename from the Content-Disposition header if present.
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const match = /filename="([^"]+)"/.exec(disposition);
    const filename = match ? match[1] : 'attachment';

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'type' in err) {
      throw err;
    }
    throw mapError(err);
  }
}

/**
 * GET /reports/{reportId}/lines/{lineId}/attachments/metadata
 *
 * Fetches attachment metadata without downloading the file content.
 * Resolves with AttachmentMetadata.
 * Rejects with AttachmentUploadError on failure.
 */
export async function getAttachmentMetadata(
  reportId: number,
  lineId: number,
): Promise<AttachmentMetadata> {
  try {
    return await apiFetch<AttachmentMetadata>(
      `/reports/${reportId}/lines/${lineId}/attachments/metadata`,
    );
  } catch (err) {
    throw mapError(err);
  }
}
