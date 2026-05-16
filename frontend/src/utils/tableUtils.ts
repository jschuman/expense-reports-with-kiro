/**
 * Pure utility functions for the Expense Reports Data Table.
 * These functions handle formatting, column visibility, and row action logic.
 */

import type { GridColDef } from '@mui/x-data-grid';
import type { ExpenseReportResponse } from '../types/expenseReport';
import type { UserResponse } from '../types/auth';

/**
 * Action types available for expense report rows.
 */
export type ActionType = 'view' | 'edit' | 'delete' | 'submit' | 'accept' | 'reject';

/**
 * Formats a number as US currency with two decimal places and thousands separators.
 * e.g. 1234.5 → "$1,234.50"
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/**
 * Formats a Date object as a human-readable localized date-time string.
 * e.g. "Apr 23, 2026, 5:00 PM"
 *
 * Uses the browser's local timezone automatically (no explicit timeZone option).
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/**
 * Returns the original string if it contains at least one non-whitespace character,
 * otherwise returns the em-dash placeholder "—".
 */
export function displayOrPlaceholder(value: string | null | undefined): string {
  if (value == null || value.trim() === '') {
    return '—';
  }
  return value;
}

/**
 * Filters columns based on user role.
 * Non-admin users do not see the `owner_username` column.
 */
export function getVisibleColumns(columns: GridColDef[], isAdmin: boolean): GridColDef[] {
  if (isAdmin) return columns;
  return columns.filter((col) => col.field !== 'owner_username');
}

/**
 * Determines the available row actions for a given expense report based on
 * the report's status, the current user's role, and ownership.
 *
 * Logic (evaluated in priority order):
 * 1. Status "In Progress" or "Rejected" AND user is owner → ['edit', 'delete', 'submit']
 * 2. Status "Submitted" AND user is Admin → ['edit', 'accept', 'reject']
 * 3. User is Admin (any non-Submitted status) → ['edit', 'view']
 * 4. Status "Submitted" or "Scheduled for Payment" AND user is owner (non-admin) → ['view']
 * 5. Any other case → ['view']
 */
export function getRowActions(
  report: ExpenseReportResponse,
  currentUser: UserResponse
): ActionType[] {
  const isAdmin = currentUser.role === 'Admin';
  const isOwner = report.owner_id === currentUser.id;
  const status = report.status;

  // Rule 1: Owner with editable status
  if ((status === 'In Progress' || status === 'Rejected') && isOwner) {
    return ['edit', 'delete', 'submit'];
  }

  // Rule 2: Admin reviewing submitted report (accept/reject takes priority, but edit still available)
  if (status === 'Submitted' && isAdmin) {
    return ['edit', 'accept', 'reject'];
  }

  // Rule 3: Admin can edit any report regardless of ownership or status
  if (isAdmin) {
    return ['edit', 'view'];
  }

  // Rule 4: Owner (non-admin) with submitted or scheduled report
  if ((status === 'Submitted' || status === 'Scheduled for Payment') && isOwner) {
    return ['view'];
  }

  // Rule 5: Safe default
  return ['view'];
}
