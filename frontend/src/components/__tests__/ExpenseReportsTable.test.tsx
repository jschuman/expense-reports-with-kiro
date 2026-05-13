/**
 * Unit tests for ExpenseReportsTable component.
 * Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 4.3, 4.4, 6.1, 6.2, 5.6
 *
 * Covers:
 *  - Columns render in correct order
 *  - Amount column displays formatted currency
 *  - Created column displays formatted date
 *  - Reimbursable column displays "Yes"/"No"
 *  - Null Client/Admin Notes display "—" placeholder
 *  - Owner column is visible for admin users
 *  - Owner column is hidden for non-admin users
 *  - Loading overlay renders with accessible label when isLoading is true
 *  - EmptyState overlay renders when reports array is empty
 *  - RejectDialog opens when Reject action is triggered
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpenseReportsTable, type ExpenseReportsTableProps } from '../ExpenseReportsTable';
import type { ExpenseReportResponse } from '../../types/expenseReport';
import type { UserResponse } from '../../types/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReport(overrides: Partial<ExpenseReportResponse> = {}): ExpenseReportResponse {
  return {
    id: 1,
    title: 'Trip to NYC',
    description: 'Business trip',
    total_amount: 1234.56,
    status: 'Submitted',
    owner_id: 1,
    owner_username: 'alice',
    created_at: '2026-04-23T17:00:00Z',
    reimbursable_from_client: true,
    client: 'Acme Corp',
    admin_notes: 'Looks good',
    ...overrides,
  };
}

function makeAdminUser(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    id: 99,
    username: 'admin',
    role: 'Admin',
    ...overrides,
  };
}

function makeRegularUser(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    id: 1,
    username: 'alice',
    role: 'User',
    ...overrides,
  };
}

function renderTable(propsOverrides: Partial<ExpenseReportsTableProps> = {}) {
  const defaultProps: ExpenseReportsTableProps = {
    reports: [makeReport()],
    isLoading: false,
    currentUser: makeAdminUser(),
    onSubmit: vi.fn(),
    onAccept: vi.fn(),
    onReject: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onView: vi.fn(),
    ...propsOverrides,
  };

  const result = render(<ExpenseReportsTable {...defaultProps} />);
  return { ...result, props: defaultProps };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExpenseReportsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Req 1.2: Column order
  // -------------------------------------------------------------------------

  describe('column order (Req 1.2)', () => {
    it('renders columns in correct order for admin users', () => {
      renderTable({ currentUser: makeAdminUser() });

      const columnHeaders = screen.getAllByRole('columnheader');
      const headerNames = columnHeaders.map((h) => h.textContent?.trim());

      expect(headerNames).toEqual([
        'Title',
        'Amount',
        'Status',
        'Owner',
        'Created',
        'Reimbursable',
        'Client',
        'Admin Notes',
        'Actions',
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // Req 1.3: Amount column formatted currency
  // -------------------------------------------------------------------------

  describe('Amount column formatting (Req 1.3)', () => {
    it('displays formatted currency (e.g., "$1,234.56")', () => {
      renderTable({
        reports: [makeReport({ total_amount: 1234.56 })],
        currentUser: makeAdminUser(),
      });

      expect(screen.getByText('$1,234.56')).toBeInTheDocument();
    });

    it('displays zero amount as "$0.00"', () => {
      renderTable({
        reports: [makeReport({ total_amount: 0 })],
        currentUser: makeAdminUser(),
      });

      expect(screen.getByText('$0.00')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Req 1.4: Created column formatted date
  // -------------------------------------------------------------------------

  describe('Created column formatting (Req 1.4)', () => {
    it('displays a formatted date string (not raw ISO)', () => {
      renderTable({
        reports: [makeReport({ created_at: '2026-04-23T17:00:00Z' })],
        currentUser: makeAdminUser(),
      });

      // The exact format depends on locale, but it should NOT be the raw ISO string
      expect(screen.queryByText('2026-04-23T17:00:00Z')).not.toBeInTheDocument();
      // Should contain "2026" somewhere in the formatted output
      const cells = screen.getAllByRole('gridcell');
      const createdCell = cells.find((cell) => cell.textContent?.includes('2026'));
      expect(createdCell).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Req 1.5: Reimbursable column displays "Yes"/"No"
  // -------------------------------------------------------------------------

  describe('Reimbursable column (Req 1.5)', () => {
    it('displays "Yes" when reimbursable_from_client is true', () => {
      renderTable({
        reports: [makeReport({ reimbursable_from_client: true })],
        currentUser: makeAdminUser(),
      });

      const cells = screen.getAllByRole('gridcell');
      const reimbursableCell = cells.find((cell) => cell.textContent === 'Yes');
      expect(reimbursableCell).toBeDefined();
    });

    it('displays "No" when reimbursable_from_client is false', () => {
      renderTable({
        reports: [makeReport({ reimbursable_from_client: false })],
        currentUser: makeAdminUser(),
      });

      const cells = screen.getAllByRole('gridcell');
      const reimbursableCell = cells.find((cell) => cell.textContent === 'No');
      expect(reimbursableCell).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Req 1.6: Null Client/Admin Notes display "—" placeholder
  // -------------------------------------------------------------------------

  describe('placeholder for null values (Req 1.6)', () => {
    it('displays "—" for null Client', () => {
      renderTable({
        reports: [makeReport({ client: null })],
        currentUser: makeAdminUser(),
      });

      const cells = screen.getAllByRole('gridcell');
      const placeholderCells = cells.filter((cell) => cell.textContent === '—');
      expect(placeholderCells.length).toBeGreaterThanOrEqual(1);
    });

    it('displays "—" for null Admin Notes', () => {
      renderTable({
        reports: [makeReport({ admin_notes: null })],
        currentUser: makeAdminUser(),
      });

      const cells = screen.getAllByRole('gridcell');
      const placeholderCells = cells.filter((cell) => cell.textContent === '—');
      expect(placeholderCells.length).toBeGreaterThanOrEqual(1);
    });

    it('displays "—" for both null Client and null Admin Notes', () => {
      renderTable({
        reports: [makeReport({ client: null, admin_notes: null })],
        currentUser: makeAdminUser(),
      });

      const cells = screen.getAllByRole('gridcell');
      const placeholderCells = cells.filter((cell) => cell.textContent === '—');
      expect(placeholderCells.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // Req 4.3: Owner column visible for admin users
  // -------------------------------------------------------------------------

  describe('Owner column visibility for admin (Req 4.3)', () => {
    it('displays the Owner column header for admin users', () => {
      renderTable({ currentUser: makeAdminUser() });

      const columnHeaders = screen.getAllByRole('columnheader');
      const ownerHeader = columnHeaders.find((h) => h.textContent?.trim() === 'Owner');
      expect(ownerHeader).toBeDefined();
    });

    it('displays the owner_username value in the Owner column', () => {
      renderTable({
        reports: [makeReport({ owner_username: 'alice' })],
        currentUser: makeAdminUser(),
      });

      expect(screen.getByText('alice')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Req 4.4: Owner column hidden for non-admin users
  // -------------------------------------------------------------------------

  describe('Owner column hidden for non-admin (Req 4.4)', () => {
    it('does not display the Owner column header for regular users', () => {
      renderTable({ currentUser: makeRegularUser() });

      const columnHeaders = screen.getAllByRole('columnheader');
      const ownerHeader = columnHeaders.find((h) => h.textContent?.trim() === 'Owner');
      expect(ownerHeader).toBeUndefined();
    });

    it('renders columns without Owner for non-admin users', () => {
      renderTable({ currentUser: makeRegularUser() });

      const columnHeaders = screen.getAllByRole('columnheader');
      const headerNames = columnHeaders.map((h) => h.textContent?.trim());

      expect(headerNames).toEqual([
        'Title',
        'Amount',
        'Status',
        'Created',
        'Reimbursable',
        'Client',
        'Admin Notes',
        'Actions',
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // Req 6.1: Loading overlay with accessible label
  // -------------------------------------------------------------------------

  describe('loading overlay (Req 6.1)', () => {
    it('renders loading overlay with accessible label when isLoading is true', () => {
      renderTable({ isLoading: true });

      expect(screen.getByLabelText('Loading expense reports')).toBeInTheDocument();
    });

    it('does not render loading overlay when isLoading is false', () => {
      renderTable({ isLoading: false });

      expect(screen.queryByLabelText('Loading expense reports')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Req 6.2: EmptyState overlay when reports array is empty
  // -------------------------------------------------------------------------

  describe('empty state overlay (Req 6.2)', () => {
    it('renders EmptyState content when reports array is empty', () => {
      renderTable({ reports: [], isLoading: false });

      expect(screen.getByText('No expense reports yet')).toBeInTheDocument();
    });

    it('does not render EmptyState when reports exist', () => {
      renderTable({ reports: [makeReport()], isLoading: false });

      expect(screen.queryByText('No expense reports yet')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Req 5.6: RejectDialog opens when Reject action is triggered
  // -------------------------------------------------------------------------

  describe('RejectDialog opens on Reject action (Req 5.6)', () => {
    it('opens RejectDialog when Reject button is clicked', async () => {
      const user = userEvent.setup();

      renderTable({
        reports: [makeReport({ status: 'Submitted', owner_id: 2 })],
        currentUser: makeAdminUser(),
      });

      // The RejectDialog should not be visible initially
      expect(screen.queryByText('Reject Expense Report')).not.toBeInTheDocument();

      // Click the Reject button
      const rejectButton = screen.getByRole('button', { name: /^Reject Trip to NYC$/i });
      await user.click(rejectButton);

      // The RejectDialog should now be visible
      expect(screen.getByText('Reject Expense Report')).toBeInTheDocument();
    });
  });
});
