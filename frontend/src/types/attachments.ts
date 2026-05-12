/**
 * Types for attachment management, mirroring backend AttachmentMetadataResponse schema.
 */

/**
 * Metadata returned by the backend after a successful attachment upload
 * or when querying attachment metadata.
 */
export interface AttachmentMetadata {
  id: number;
  file_name: string;
  file_size: number; // bytes
  mime_type: string;
  created_at: string; // ISO 8601 UTC string
}

/**
 * Error types that can occur during attachment operations.
 * Maps to specific HTTP status codes from the backend.
 */
export type AttachmentErrorType =
  | 'INVALID_FILE_TYPE'   // 400 — extension or MIME type not in whitelist
  | 'INVALID_CONTENT'     // 400 — file content doesn't match declared MIME type
  | 'FILE_TOO_LARGE'      // 413 — file exceeds 10 MB limit
  | 'NOT_FOUND'           // 404 — attachment, line, or report not found
  | 'FORBIDDEN'           // 403 — caller is not the owner (or not admin for reads)
  | 'UNAUTHORIZED'        // 401 — not authenticated
  | 'NETWORK_ERROR'       // fetch failed (no response)
  | 'SERVER_ERROR';       // 5xx or unrecognised error

/**
 * Structured error thrown by attachment API functions.
 */
export interface AttachmentUploadError {
  type: AttachmentErrorType;
  message: string;
}
