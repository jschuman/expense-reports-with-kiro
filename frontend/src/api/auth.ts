/**
 * Auth API functions.
 * Mirrors backend routes: POST /auth/login, POST /auth/logout, GET /auth/me
 *
 * UserResponse now includes a `role` field (e.g., "User" or "Admin") returned
 * by both the login and /me endpoints.
 */

import type { LoginRequest, UserResponse } from '../types/auth';
import { apiFetch, ApiError } from './client';

/**
 * POST /auth/login
 * Authenticates the user and establishes a session cookie.
 * Returns the authenticated UserResponse including the user's role.
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
 * Clears the session cookie. Resolves on success, throws ApiError on failure.
 */
export async function logout(): Promise<void> {
  await apiFetch<unknown>('/auth/logout', { method: 'POST' });
}

/**
 * GET /auth/me
 * Returns the currently authenticated user (including role), or null on 401.
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

/**
 * Alias for getSession() — returns the current user with role information,
 * or null if not authenticated.
 */
export const getCurrentUser = getSession;
