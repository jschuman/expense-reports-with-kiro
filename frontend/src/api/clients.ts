/**
 * Clients API functions.
 * Mirrors backend route: GET /clients
 */

import { apiFetch } from './client';

/**
 * GET /clients
 * Returns the list of available client names.
 * Requires an authenticated session.
 */
export async function listClients(): Promise<string[]> {
  return apiFetch<string[]>('/clients');
}
