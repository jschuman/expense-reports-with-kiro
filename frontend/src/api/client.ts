/**
 * Base API client with typed error handling.
 * All HTTP calls go through this module — components never call fetch directly.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Wrapper around fetch that:
 * - Always sends credentials (session cookie)
 * - Throws ApiError on non-2xx responses
 * - Parses and returns the JSON response body
 */
export async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      if (body?.detail) {
        message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
      }
    } catch {
      // ignore JSON parse errors — use statusText as fallback
    }
    throw new ApiError(response.status, message);
  }

  return response.json() as Promise<T>;
}
