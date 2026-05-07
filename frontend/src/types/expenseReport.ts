/**
 * Expense report types mirroring backend Pydantic schemas.
 */

export interface ExpenseReportCreate {
  title: string;
  description?: string;
  reimbursable_from_client: boolean;
  client?: string;
}

export interface ExpenseReportResponse {
  id: number;
  title: string;
  description: string | null;
  total_amount: number;
  status: string;
  owner_id: number;
  owner_username: string;
  created_at: string;
  reimbursable_from_client: boolean;
  client: string | null;
  admin_notes: string | null;
}

/**
 * Request body for PUT /reports/{id}.
 * All fields are optional — only provided fields are updated.
 */
export interface ExpenseReportUpdate {
  title?: string;
  description?: string;
  reimbursable_from_client?: boolean;
  client?: string;
}

/**
 * A single entry in the status audit log, mirroring the backend StatusAuditLogEntry schema.
 * changed_at is an ISO 8601 UTC string (e.g. "2026-04-23T17:00:00Z").
 */
export interface StatusAuditLogEntry {
  id: number;
  expense_report_id: number;
  status: string;
  changed_at: string;
}

/**
 * Request body for POST /reports/{id}/lines.
 * Creates a new expense line with description, amount, and incurred date.
 */
export interface ExpenseLineCreate {
  description: string;
  amount: number;
  incurred_date: string; // ISO 8601 date: "YYYY-MM-DD"
}

/**
 * Request body for PUT /reports/{id}/lines/{line_id}.
 * All fields are optional — only provided fields are updated.
 */
export interface ExpenseLineUpdate {
  description?: string;
  amount?: number;
  incurred_date?: string; // ISO 8601 date: "YYYY-MM-DD"
}

/**
 * Response body for GET /reports/{id}/lines and related line endpoints.
 * Mirrors the backend ExpenseLineResponse schema.
 */
export interface ExpenseLineResponse {
  id: number;
  report_id: number;
  description: string;
  amount: number;
  incurred_date: string; // ISO 8601 date: "YYYY-MM-DD"
}
