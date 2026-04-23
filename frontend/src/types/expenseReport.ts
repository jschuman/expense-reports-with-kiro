/**
 * Expense report types mirroring backend Pydantic schemas.
 */

export interface ExpenseReportCreate {
  title: string;
  purpose: string;
  total_amount: number;
}

export interface ExpenseReportResponse {
  id: number;
  title: string;
  purpose: string;
  total_amount: number;
  status: string;
  owner_id: number;
}
