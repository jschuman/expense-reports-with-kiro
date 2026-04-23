/**
 * Auth API functions.
 * Mirrors backend routes: POST /auth/login, POST /auth/logout, GET /auth/me
 */

import type { LoginRequest, UserResponse } from '../types/auth';
import { apiFetch, ApiError } from './client';

/**
 * POST /auth/login
 * Authenticates the user and establishes a session cookie.
 * Returns the authenticated UserResponse.
 */
export async function login(credentials: LoginRequest): Promise<UserResponse> {
  return apiFetch<UserResponse>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
}

/**
 * POST /auth/logout
 * Clears the session cookie.
 */
export async function logout(): Promise<void> {
  await apiFetch<unknown>('/auth/logout', { method: 'POST' });
}

/**
 * GET /auth/me
 * Returns the currently authenticated user, or null if not authenticated (401).
 */
export async function getSession(): Promise<UserResponse | null> {
  try {
    return await apiFetch<UserResponse>('/auth/me');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return null;
    }
    throw err;
  }
}
