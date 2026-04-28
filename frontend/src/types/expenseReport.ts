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
