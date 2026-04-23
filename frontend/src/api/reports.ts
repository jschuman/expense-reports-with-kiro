/**
 * Reports API functions.
 * Mirrors backend routes: GET /reports, POST /reports
 */

import type { ExpenseReportCreate, ExpenseReportResponse } from '../types/expenseReport';
import { apiFetch } from './client';

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
