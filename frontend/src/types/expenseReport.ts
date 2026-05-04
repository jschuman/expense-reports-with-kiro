/**
 * Expense report types mirroring backend Pydantic schemas.
 */

export interface ExpenseReportCreate {
  title: string;
  description?: string;
  total_amount: number;
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
  total_amount?: number;
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
