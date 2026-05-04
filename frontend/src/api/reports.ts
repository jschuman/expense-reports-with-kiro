/**
 * Reports API functions.
 * Mirrors backend routes: GET /reports, POST /reports, PUT /reports/{id},
 * DELETE /reports/{id}, POST /reports/{id}/submit, POST /reports/{id}/accept,
 * POST /reports/{id}/reject
 */

import type { ExpenseReportCreate, ExpenseReportResponse, ExpenseReportUpdate } from '../types/expenseReport';
import { apiFetch, ApiError } from './client';

/**
 * GET /reports
 * Returns all expense reports belonging to the authenticated user.
 */
export async function listReports(): Promise<ExpenseReportResponse[]> {
  return apiFetch<ExpenseReportResponse[]>('/reports');
}

/**
 * POST /reports
 * Creates a new expense report for the authenticated user.
 * Returns the created ExpenseReportResponse.
 */
export async function createReport(data: ExpenseReportCreate): Promise<ExpenseReportResponse> {
  return apiFetch<ExpenseReportResponse>('/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/**
 * POST /reports/{id}/submit
 * Transitions the report from "In Progress" or "Rejected" to "Submitted".
 * Returns the updated ExpenseReportResponse.
 */
export async function submitReport(reportId: number): Promise<ExpenseReportResponse> {
  return apiFetch<ExpenseReportResponse>(`/reports/${reportId}/submit`, {
    method: 'POST',
  });
}

/**
 * POST /reports/{id}/accept
 * Transitions the report from "Submitted" to "Scheduled for Payment".
 * Requires Admin role. Returns the updated ExpenseReportResponse.
 */
export async function acceptReport(reportId: number): Promise<ExpenseReportResponse> {
  return apiFetch<ExpenseReportResponse>(`/reports/${reportId}/accept`, {
    method: 'POST',
  });
}

/**
 * POST /reports/{id}/reject
 * Transitions the report from "Submitted" to "Rejected".
 * Requires Admin role and non-empty adminNotes.
 * Returns the updated ExpenseReportResponse.
 */
export async function rejectReport(reportId: number, adminNotes: string): Promise<ExpenseReportResponse> {
  return apiFetch<ExpenseReportResponse>(`/reports/${reportId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ admin_notes: adminNotes }),
  });
}

/**
 * PUT /reports/{id}
 * Updates editable fields on a report in "In Progress" or "Rejected" state.
 * Returns the updated ExpenseReportResponse.
 */
export async function updateReport(reportId: number, data: ExpenseReportUpdate): Promise<ExpenseReportResponse> {
  return apiFetch<ExpenseReportResponse>(`/reports/${reportId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/**
 * DELETE /reports/{id}
 * Deletes a report in "In Progress" or "Rejected" state.
 * Returns void on 204 No Content.
 */
export async function deleteReport(reportId: number): Promise<void> {
  const response = await fetch(`/reports/${reportId}`, {
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
