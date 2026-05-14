/**
 * Unit tests for ActionCell component.
 * Requirements: 5.2, 5.3, 5.4, 5.5, 7.4
 *
 * Covers:
 *  - Correct buttons render for owner with "In Progress" status (Edit, Delete, Submit)
 *  - Correct buttons render for admin with "Submitted" status (View, Accept, Reject)
 *  - Correct buttons render for owner (non-admin) with "Submitted" status (View only)
 *  - Correct buttons render for admin with non-"Submitted" status (View only)
 *  - Each button click invokes the correct handler with the report ID
 *  - Aria-labels include the report title
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionCell, type ActionCellProps } from '../ActionCell';
import type { ExpenseReportResponse } from '../../types/expenseReport';
import type { UserResponse } from '../../types/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReport(overrides: Partial<ExpenseReportResponse> = {}): ExpenseReportResponse {
  return {
    id: 42,
    title: 'Trip to NYC',
    description: 'Business trip',
    total_amount: 1500.0,
    status: 'In Progress',
    owner_id: 1,
    owner_username: 'alice',
    created_at: '2026-04-23T17:00:00Z',
    reimbursable_from_client: false,
    client: null,
    admin_notes: null,
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    id: 1,
    username: 'alice',
    role: 'User',
    ...overrides,
  };
}

function renderActionCell(propsOverrides: Partial<ActionCellProps> = {}) {
  const defaultProps: ActionCellProps = {
    report: makeReport(),
    currentUser: makeUser(),
    onSubmit: vi.fn(),
    onAccept: vi.fn(),
    onReject: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onView: vi.fn(),
    ...propsOverrides,
  };

  render(<ActionCell {...defaultProps} />);
  return defaultProps;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActionCell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Req 5.2: Owner with "In Progress" status → Edit, Delete, Submit
  // -------------------------------------------------------------------------

  describe('owner with "In Progress" status (Req 5.2)', () => {
    it('renders Edit, Delete, and Submit buttons', () => {
      renderActionCell({
        report: makeReport({ status: 'In Progress', owner_id: 1 }),
        currentUser: makeUser({ id: 1, role: 'User' }),
      });

      expect(screen.getByRole('button', { name: /^Edit Trip to NYC$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Delete Trip to NYC$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Submit Trip to NYC$/i })).toBeInTheDocument();
    });

    it('does not render View, Accept, or Reject buttons', () => {
      renderActionCell({
        report: makeReport({ status: 'In Progress', owner_id: 1 }),
        currentUser: makeUser({ id: 1, role: 'User' }),
      });

      expect(screen.queryByRole('button', { name: /^View/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Accept/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Reject/i })).not.toBeInTheDocument();
    });

    it('renders Edit, Delete, and Submit for owner with "Rejected" status', () => {
      renderActionCell({
        report: makeReport({ status: 'Rejected', owner_id: 1 }),
        currentUser: makeUser({ id: 1, role: 'User' }),
      });

      expect(screen.getByRole('button', { name: /^Edit Trip to NYC$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Delete Trip to NYC$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Submit Trip to NYC$/i })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Req 5.3: Admin with "Submitted" status → View, Accept, Reject
  // -------------------------------------------------------------------------

  describe('admin with "Submitted" status (Req 5.3)', () => {
    it('renders View, Accept, and Reject buttons', () => {
      renderActionCell({
        report: makeReport({ status: 'Submitted', owner_id: 2 }),
        currentUser: makeUser({ id: 1, role: 'Admin' }),
      });

      expect(screen.getByRole('button', { name: /^View Trip to NYC$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Accept Trip to NYC$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Reject Trip to NYC$/i })).toBeInTheDocument();
    });

    it('does not render Edit, Delete, or Submit buttons', () => {
      renderActionCell({
        report: makeReport({ status: 'Submitted', owner_id: 2 }),
        currentUser: makeUser({ id: 1, role: 'Admin' }),
      });

      expect(screen.queryByRole('button', { name: /^Edit/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Delete/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Submit/i })).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Req 5.4: Owner (non-admin) with "Submitted" status → View only
  // -------------------------------------------------------------------------

  describe('owner (non-admin) with "Submitted" status (Req 5.4)', () => {
    it('renders only a View button', () => {
      renderActionCell({
        report: makeReport({ status: 'Submitted', owner_id: 1 }),
        currentUser: makeUser({ id: 1, role: 'User' }),
      });

      expect(screen.getByRole('button', { name: /^View Trip to NYC$/i })).toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });

    it('renders only a View button for "Scheduled for Payment" status', () => {
      renderActionCell({
        report: makeReport({ status: 'Scheduled for Payment', owner_id: 1 }),
        currentUser: makeUser({ id: 1, role: 'User' }),
      });

      expect(screen.getByRole('button', { name: /^View Trip to NYC$/i })).toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Req 5.5: Admin with non-"Submitted" status → View only
  // -------------------------------------------------------------------------

  describe('admin with non-"Submitted" status (Req 5.5)', () => {
    it('renders only a View button for "In Progress" status', () => {
      renderActionCell({
        report: makeReport({ status: 'In Progress', owner_id: 2 }),
        currentUser: makeUser({ id: 1, role: 'Admin' }),
      });

      expect(screen.getByRole('button', { name: /^View Trip to NYC$/i })).toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });

    it('renders only a View button for "Scheduled for Payment" status', () => {
      renderActionCell({
        report: makeReport({ status: 'Scheduled for Payment', owner_id: 2 }),
        currentUser: makeUser({ id: 1, role: 'Admin' }),
      });

      expect(screen.getByRole('button', { name: /^View Trip to NYC$/i })).toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });

    it('renders only a View button for "Rejected" status', () => {
      renderActionCell({
        report: makeReport({ status: 'Rejected', owner_id: 2 }),
        currentUser: makeUser({ id: 1, role: 'Admin' }),
      });

      expect(screen.getByRole('button', { name: /^View Trip to NYC$/i })).toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Button click handlers
  // -------------------------------------------------------------------------

  describe('button click handlers', () => {
    it('calls onEdit with the report ID when Edit is clicked', async () => {
      const user = userEvent.setup();
      const props = renderActionCell({
        report: makeReport({ status: 'In Progress', owner_id: 1, id: 99 }),
        currentUser: makeUser({ id: 1, role: 'User' }),
      });

      await user.click(screen.getByRole('button', { name: /^Edit/i }));
      expect(props.onEdit).toHaveBeenCalledOnce();
      expect(props.onEdit).toHaveBeenCalledWith(99);
    });

    it('calls onDelete with the report ID when Delete is clicked', async () => {
      const user = userEvent.setup();
      const props = renderActionCell({
        report: makeReport({ status: 'In Progress', owner_id: 1, id: 99 }),
        currentUser: makeUser({ id: 1, role: 'User' }),
      });

      // Click the delete icon button to open confirmation dialog
      await user.click(screen.getByRole('button', { name: /^Delete/i }));
      // Confirm deletion in the dialog
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      expect(props.onDelete).toHaveBeenCalledOnce();
      expect(props.onDelete).toHaveBeenCalledWith(99);
    });

    it('calls onSubmit with the report ID when Submit is clicked', async () => {
      const user = userEvent.setup();
      const props = renderActionCell({
        report: makeReport({ status: 'In Progress', owner_id: 1, id: 99 }),
        currentUser: makeUser({ id: 1, role: 'User' }),
      });

      await user.click(screen.getByRole('button', { name: /^Submit/i }));
      expect(props.onSubmit).toHaveBeenCalledOnce();
      expect(props.onSubmit).toHaveBeenCalledWith(99);
    });

    it('calls onView with the report ID when View is clicked', async () => {
      const user = userEvent.setup();
      const props = renderActionCell({
        report: makeReport({ status: 'Submitted', owner_id: 2 }),
        currentUser: makeUser({ id: 1, role: 'Admin' }),
      });

      await user.click(screen.getByRole('button', { name: /^View/i }));
      expect(props.onView).toHaveBeenCalledOnce();
      expect(props.onView).toHaveBeenCalledWith(42);
    });

    it('calls onAccept with the report ID when Accept is clicked', async () => {
      const user = userEvent.setup();
      const props = renderActionCell({
        report: makeReport({ status: 'Submitted', owner_id: 2, id: 77 }),
        currentUser: makeUser({ id: 1, role: 'Admin' }),
      });

      await user.click(screen.getByRole('button', { name: /^Accept/i }));
      expect(props.onAccept).toHaveBeenCalledOnce();
      expect(props.onAccept).toHaveBeenCalledWith(77);
    });

    it('calls onReject with the report ID when Reject is clicked', async () => {
      const user = userEvent.setup();
      const props = renderActionCell({
        report: makeReport({ status: 'Submitted', owner_id: 2, id: 77 }),
        currentUser: makeUser({ id: 1, role: 'Admin' }),
      });

      await user.click(screen.getByRole('button', { name: /^Reject/i }));
      expect(props.onReject).toHaveBeenCalledOnce();
      expect(props.onReject).toHaveBeenCalledWith(77);
    });
  });

  // -------------------------------------------------------------------------
  // Req 7.4: Accessible names include report title
  // -------------------------------------------------------------------------

  describe('accessible names include report title (Req 7.4)', () => {
    it('Edit button aria-label includes the report title', () => {
      renderActionCell({
        report: makeReport({ status: 'In Progress', owner_id: 1, title: 'Q4 Conference' }),
        currentUser: makeUser({ id: 1, role: 'User' }),
      });

      expect(screen.getByRole('button', { name: 'Edit Q4 Conference' })).toBeInTheDocument();
    });

    it('Delete button aria-label includes the report title', () => {
      renderActionCell({
        report: makeReport({ status: 'In Progress', owner_id: 1, title: 'Q4 Conference' }),
        currentUser: makeUser({ id: 1, role: 'User' }),
      });

      expect(screen.getByRole('button', { name: 'Delete Q4 Conference' })).toBeInTheDocument();
    });

    it('Submit button aria-label includes the report title', () => {
      renderActionCell({
        report: makeReport({ status: 'In Progress', owner_id: 1, title: 'Q4 Conference' }),
        currentUser: makeUser({ id: 1, role: 'User' }),
      });

      expect(screen.getByRole('button', { name: 'Submit Q4 Conference' })).toBeInTheDocument();
    });

    it('View button aria-label includes the report title', () => {
      renderActionCell({
        report: makeReport({ status: 'Submitted', owner_id: 2, title: 'Team Lunch' }),
        currentUser: makeUser({ id: 1, role: 'Admin' }),
      });

      expect(screen.getByRole('button', { name: 'View Team Lunch' })).toBeInTheDocument();
    });

    it('Accept button aria-label includes the report title', () => {
      renderActionCell({
        report: makeReport({ status: 'Submitted', owner_id: 2, title: 'Team Lunch' }),
        currentUser: makeUser({ id: 1, role: 'Admin' }),
      });

      expect(screen.getByRole('button', { name: 'Accept Team Lunch' })).toBeInTheDocument();
    });

    it('Reject button aria-label includes the report title', () => {
      renderActionCell({
        report: makeReport({ status: 'Submitted', owner_id: 2, title: 'Team Lunch' }),
        currentUser: makeUser({ id: 1, role: 'Admin' }),
      });

      expect(screen.getByRole('button', { name: 'Reject Team Lunch' })).toBeInTheDocument();
    });
  });
});
