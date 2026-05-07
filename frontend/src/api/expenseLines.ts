/**
 * Expense Lines API functions.
 * Mirrors backend routes: GET /reports/{reportId}/lines, POST /reports/{reportId}/lines,
 * PUT /reports/{reportId}/lines/{lineId}, DELETE /reports/{reportId}/lines/{lineId}
 */

import type {
  ExpenseLineCreate,
  ExpenseLineResponse,
  ExpenseLineUpdate,
} from '../types/expenseReport';
import { apiFetch, ApiError } from './client';

/**
 * GET /reports/{reportId}/lines
 * Returns all expense lines for the specified report.
 */
export async function listLines(reportId: number): Promise<ExpenseLineResponse[]> {
  return apiFetch<ExpenseLineResponse[]>(`/reports/${reportId}/lines`);
}

/**
 * POST /reports/{reportId}/lines
 * Creates a new expense line for the specified report.
 * Returns the created ExpenseLineResponse.
 */
export async function createLine(
  reportId: number,
  data: ExpenseLineCreate,
): Promise<ExpenseLineResponse> {
  return apiFetch<ExpenseLineResponse>(`/reports/${reportId}/lines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/**
 * PUT /reports/{reportId}/lines/{lineId}
 * Updates an existing expense line.
 * Returns the updated ExpenseLineResponse.
 */
export async function updateLine(
  reportId: number,
  lineId: number,
  data: ExpenseLineUpdate,
): Promise<ExpenseLineResponse> {
  return apiFetch<ExpenseLineResponse>(`/reports/${reportId}/lines/${lineId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/**
 * DELETE /reports/{reportId}/lines/{lineId}
 * Deletes an expense line.
 * Returns void on 204 No Content.
 */
export async function deleteLine(reportId: number, lineId: number): Promise<void> {
  const response = await fetch(`/reports/${reportId}/lines/${lineId}`, {
    method: 'DELETE',
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
  // 204 No Content — no body to parse
}
