/**
 * Tests for ReportCard component.
 * Requirements: 2.3, 3.1, 4.3, 5.1, 7.3, 7.4, 8.3, 10.1, 10.3
 *
 * Covers:
 *  - All new fields render for a fully-populated report
 *  - "—" renders for null description, client, and admin_notes
 *  - "Yes" / "No" renders for reimbursable_from_client
 *  - created_at is displayed as a human-readable string (not raw ISO)
 *  - Status chip renders the correct label for each status value
 *  - Conditional action buttons based on status and user role
 *  - admin_notes alert displayed prominently when status is "Rejected"
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportCard } from '../ReportCard';
import type { ExpenseReportResponse } from '../../types/expenseReport';
import type { UserResponse } from '../../types/auth';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNER_USER: UserResponse = {
  id: 1,
  username: 'alice',
  role: 'User',
};

const ADMIN_USER: UserResponse = {
  id: 99,
  username: 'admin',
  role: 'Admin',
};

const NON_OWNER_USER: UserResponse = {
  id: 2,
  username: 'bob',
  role: 'User',
};

function makeReport(overrides: Partial<ExpenseReportResponse> = {}): ExpenseReportResponse {
  return {
    id: 1,
    title: 'Q2 Travel',
    description: 'Client visit to NYC',
    total_amount: 850.0,
    status: 'In Progress',
    owner_id: 1,
    owner_username: 'alice',
    created_at: '2026-05-01T14:32:00Z',
    reimbursable_from_client: true,
    client: 'Acme Corp',
    admin_notes: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReportCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Fully-populated report — all fields render
  // -------------------------------------------------------------------------

  describe('fully-populated report', () => {
    it('renders the report title', () => {
      render(<ReportCard report={makeReport()} currentUser={OWNER_USER} />);
      expect(screen.getByRole('heading', { name: 'Q2 Travel' })).toBeInTheDocument();
    });

    it('renders the description', () => {
      render(<ReportCard report={makeReport()} currentUser={OWNER_USER} />);
      expect(screen.getByText('Client visit to NYC')).toBeInTheDocument();
    });

    it('renders total_amount formatted as currency', () => {
      render(<ReportCard report={makeReport()} currentUser={OWNER_USER} />);
      expect(screen.getByText('$850.00')).toBeInTheDocument();
    });

    it('renders owner_username', () => {
      render(<ReportCard report={makeReport()} currentUser={OWNER_USER} />);
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    it('renders created_at as a human-readable string (no raw "T" separator)', () => {
      const { container } = render(<ReportCard report={makeReport()} currentUser={OWNER_USER} />);
      expect(screen.queryByText('2026-05-01T14:32:00Z')).not.toBeInTheDocument();
      expect(screen.getByText('Created')).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/2026-05-01T/);
    });

    it('renders reimbursable_from_client as "Yes" when true', () => {
      render(<ReportCard report={makeReport({ reimbursable_from_client: true })} currentUser={OWNER_USER} />);
      expect(screen.getByText('Yes')).toBeInTheDocument();
    });

    it('renders the client name', () => {
      render(<ReportCard report={makeReport()} currentUser={OWNER_USER} />);
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    it('renders all field labels', () => {
      render(<ReportCard report={makeReport()} currentUser={OWNER_USER} />);
      expect(screen.getByText('Description')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Owner')).toBeInTheDocument();
      expect(screen.getByText('Created')).toBeInTheDocument();
      expect(screen.getByText('Reimbursable')).toBeInTheDocument();
      expect(screen.getByText('Client')).toBeInTheDocument();
      expect(screen.getByText('Admin Notes')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Null optional fields — placeholder "—"
  // -------------------------------------------------------------------------

  describe('null optional fields display placeholder "—"', () => {
    it('renders "—" for null description, client, and admin_notes', () => {
      render(
        <ReportCard
          report={makeReport({ description: null, client: null, admin_notes: null })}
          currentUser={OWNER_USER}
        />
      );
      const placeholders = screen.getAllByText('—');
      expect(placeholders.length).toBeGreaterThanOrEqual(3);
    });

    it('renders "—" for empty string description, client, and admin_notes', () => {
      render(
        <ReportCard
          report={makeReport({ description: '', client: '', admin_notes: '' })}
          currentUser={OWNER_USER}
        />
      );
      const placeholders = screen.getAllByText('—');
      expect(placeholders.length).toBeGreaterThanOrEqual(3);
    });
  });

  // -------------------------------------------------------------------------
  // Reimbursable boolean display
  // -------------------------------------------------------------------------

  describe('reimbursable_from_client display', () => {
    it('renders "Yes" when reimbursable_from_client is true', () => {
      render(<ReportCard report={makeReport({ reimbursable_from_client: true })} currentUser={OWNER_USER} />);
      expect(screen.getByText('Yes')).toBeInTheDocument();
      expect(screen.queryByText('No')).not.toBeInTheDocument();
    });

    it('renders "No" when reimbursable_from_client is false', () => {
      render(<ReportCard report={makeReport({ reimbursable_from_client: false })} currentUser={OWNER_USER} />);
      expect(screen.getByText('No')).toBeInTheDocument();
      expect(screen.queryByText('Yes')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Status chip
  // -------------------------------------------------------------------------

  describe('status chip', () => {
    it('renders "In Progress" chip label', () => {
      render(<ReportCard report={makeReport({ status: 'In Progress' })} currentUser={OWNER_USER} />);
      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    it('renders "Submitted" chip label', () => {
      render(<ReportCard report={makeReport({ status: 'Submitted' })} currentUser={NON_OWNER_USER} />);
      expect(screen.getByText('Submitted')).toBeInTheDocument();
    });

    it('renders "Rejected" chip label', () => {
      render(<ReportCard report={makeReport({ status: 'Rejected' })} currentUser={OWNER_USER} />);
      expect(screen.getByText('Rejected')).toBeInTheDocument();
    });

    it('renders "Scheduled for Payment" chip label', () => {
      render(<ReportCard report={makeReport({ status: 'Scheduled for Payment' })} currentUser={OWNER_USER} />);
      expect(screen.getByText('Scheduled for Payment')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Action buttons — "In Progress" + owner
  // -------------------------------------------------------------------------

  describe('"In Progress" status + owner', () => {
    it('shows Submit button', () => {
      render(<ReportCard report={makeReport({ status: 'In Progress' })} currentUser={OWNER_USER} />);
      expect(screen.getByRole('button', { name: /submit report/i })).toBeInTheDocument();
    });

    it('shows Edit button', () => {
      render(<ReportCard report={makeReport({ status: 'In Progress' })} currentUser={OWNER_USER} />);
      expect(screen.getByRole('button', { name: /edit report/i })).toBeInTheDocument();
    });

    it('shows Delete button', () => {
      render(<ReportCard report={makeReport({ status: 'In Progress' })} currentUser={OWNER_USER} />);
      expect(screen.getByRole('button', { name: /delete report/i })).toBeInTheDocument();
    });

    it('does not show Accept or Reject buttons', () => {
      render(<ReportCard report={makeReport({ status: 'In Progress' })} currentUser={OWNER_USER} />);
      expect(screen.queryByRole('button', { name: /accept report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reject report/i })).not.toBeInTheDocument();
    });

    it('calls onSubmit with the report id when Submit is clicked', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <ReportCard
          report={makeReport({ status: 'In Progress' })}
          currentUser={OWNER_USER}
          onSubmit={onSubmit}
        />
      );
      await user.click(screen.getByRole('button', { name: /submit report/i }));
      expect(onSubmit).toHaveBeenCalledOnce();
      expect(onSubmit).toHaveBeenCalledWith(1);
    });

    it('calls onEdit with the report id when Edit is clicked', async () => {
      const user = userEvent.setup();
      const onEdit = vi.fn();
      render(
        <ReportCard
          report={makeReport({ status: 'In Progress' })}
          currentUser={OWNER_USER}
          onEdit={onEdit}
        />
      );
      await user.click(screen.getByRole('button', { name: /edit report/i }));
      expect(onEdit).toHaveBeenCalledOnce();
      expect(onEdit).toHaveBeenCalledWith(1);
    });

    it('calls onDelete with the report id when Delete is clicked', async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      render(
        <ReportCard
          report={makeReport({ status: 'In Progress' })}
          currentUser={OWNER_USER}
          onDelete={onDelete}
        />
      );
      await user.click(screen.getByRole('button', { name: /delete report/i }));
      expect(onDelete).toHaveBeenCalledOnce();
      expect(onDelete).toHaveBeenCalledWith(1);
    });
  });

  // -------------------------------------------------------------------------
  // Action buttons — "Submitted" + owner (read-only)
  // -------------------------------------------------------------------------

  describe('"Submitted" status + owner', () => {
    it('shows no action buttons for the owner', () => {
      render(<ReportCard report={makeReport({ status: 'Submitted' })} currentUser={OWNER_USER} />);
      expect(screen.queryByRole('button', { name: /submit report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /edit report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /delete report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /accept report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reject report/i })).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Action buttons — "Submitted" + admin
  // -------------------------------------------------------------------------

  describe('"Submitted" status + admin', () => {
    it('shows Accept button', () => {
      render(<ReportCard report={makeReport({ status: 'Submitted' })} currentUser={ADMIN_USER} />);
      expect(screen.getByRole('button', { name: /accept report/i })).toBeInTheDocument();
    });

    it('shows Reject button', () => {
      render(<ReportCard report={makeReport({ status: 'Submitted' })} currentUser={ADMIN_USER} />);
      expect(screen.getByRole('button', { name: /reject report/i })).toBeInTheDocument();
    });

    it('does not show Edit, Delete, or Submit buttons', () => {
      render(<ReportCard report={makeReport({ status: 'Submitted' })} currentUser={ADMIN_USER} />);
      expect(screen.queryByRole('button', { name: /edit report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /delete report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /submit report/i })).not.toBeInTheDocument();
    });

    it('calls onAccept with the report id when Accept is clicked', async () => {
      const user = userEvent.setup();
      const onAccept = vi.fn();
      render(
        <ReportCard
          report={makeReport({ status: 'Submitted' })}
          currentUser={ADMIN_USER}
          onAccept={onAccept}
        />
      );
      await user.click(screen.getByRole('button', { name: /accept report/i }));
      expect(onAccept).toHaveBeenCalledOnce();
      expect(onAccept).toHaveBeenCalledWith(1);
    });

    it('opens RejectDialog when Reject is clicked', async () => {
      const user = userEvent.setup();
      render(
        <ReportCard
          report={makeReport({ status: 'Submitted' })}
          currentUser={ADMIN_USER}
          onReject={vi.fn()}
        />
      );
      await user.click(screen.getByRole('button', { name: /reject report/i }));
      expect(screen.getByText(/reject expense report/i)).toBeInTheDocument();
    });

    it('calls onReject with report id and admin notes when RejectDialog is confirmed', async () => {
      const user = userEvent.setup();
      const onReject = vi.fn();
      render(
        <ReportCard
          report={makeReport({ status: 'Submitted' })}
          currentUser={ADMIN_USER}
          onReject={onReject}
        />
      );
      await user.click(screen.getByRole('button', { name: /reject report/i }));
      const textarea = screen.getByLabelText(/admin notes/i);
      await user.type(textarea, 'Missing receipts');
      await user.click(screen.getByRole('button', { name: /confirm/i }));
      expect(onReject).toHaveBeenCalledOnce();
      expect(onReject).toHaveBeenCalledWith(1, 'Missing receipts');
    });
  });

  // -------------------------------------------------------------------------
  // Action buttons — "Rejected" + owner
  // -------------------------------------------------------------------------

  describe('"Rejected" status + owner', () => {
    it('shows Edit button', () => {
      render(<ReportCard report={makeReport({ status: 'Rejected' })} currentUser={OWNER_USER} />);
      expect(screen.getByRole('button', { name: /edit report/i })).toBeInTheDocument();
    });

    it('shows Delete button', () => {
      render(<ReportCard report={makeReport({ status: 'Rejected' })} currentUser={OWNER_USER} />);
      expect(screen.getByRole('button', { name: /delete report/i })).toBeInTheDocument();
    });

    it('shows Submit button', () => {
      render(<ReportCard report={makeReport({ status: 'Rejected' })} currentUser={OWNER_USER} />);
      expect(screen.getByRole('button', { name: /submit report/i })).toBeInTheDocument();
    });

    it('does not show Accept or Reject buttons', () => {
      render(<ReportCard report={makeReport({ status: 'Rejected' })} currentUser={OWNER_USER} />);
      expect(screen.queryByRole('button', { name: /accept report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reject report/i })).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Action buttons — "Scheduled for Payment" (any user)
  // -------------------------------------------------------------------------

  describe('"Scheduled for Payment" status', () => {
    it('shows no action buttons for the owner', () => {
      render(
        <ReportCard
          report={makeReport({ status: 'Scheduled for Payment' })}
          currentUser={OWNER_USER}
        />
      );
      expect(screen.queryByRole('button', { name: /submit report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /edit report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /delete report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /accept report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reject report/i })).not.toBeInTheDocument();
    });

    it('shows no action buttons for an admin', () => {
      render(
        <ReportCard
          report={makeReport({ status: 'Scheduled for Payment' })}
          currentUser={ADMIN_USER}
        />
      );
      expect(screen.queryByRole('button', { name: /submit report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /edit report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /delete report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /accept report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reject report/i })).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // admin_notes prominent display when Rejected
  // -------------------------------------------------------------------------

  describe('admin_notes prominent display', () => {
    it('displays admin_notes in a prominent alert when status is "Rejected"', () => {
      render(
        <ReportCard
          report={makeReport({ status: 'Rejected', admin_notes: 'Missing receipts' })}
          currentUser={OWNER_USER}
        />
      );
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('Missing receipts');
    });

    it('does not display the rejection alert when status is "In Progress"', () => {
      render(
        <ReportCard
          report={makeReport({ status: 'In Progress', admin_notes: 'Some note' })}
          currentUser={OWNER_USER}
        />
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('does not display the rejection alert when status is "Submitted"', () => {
      render(
        <ReportCard
          report={makeReport({ status: 'Submitted', admin_notes: null })}
          currentUser={NON_OWNER_USER}
        />
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('does not display the rejection alert when status is "Scheduled for Payment"', () => {
      render(
        <ReportCard
          report={makeReport({ status: 'Scheduled for Payment', admin_notes: null })}
          currentUser={OWNER_USER}
        />
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('does not display the rejection alert when status is "Rejected" but admin_notes is null', () => {
      render(
        <ReportCard
          report={makeReport({ status: 'Rejected', admin_notes: null })}
          currentUser={OWNER_USER}
        />
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Non-owner user sees no action buttons on editable states
  // -------------------------------------------------------------------------

  describe('non-owner user', () => {
    it('sees no action buttons on an "In Progress" report they do not own', () => {
      render(
        <ReportCard
          report={makeReport({ status: 'In Progress' })}
          currentUser={NON_OWNER_USER}
        />
      );
      expect(screen.queryByRole('button', { name: /submit report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /edit report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /delete report/i })).not.toBeInTheDocument();
    });

    it('sees no action buttons on a "Rejected" report they do not own', () => {
      render(
        <ReportCard
          report={makeReport({ status: 'Rejected' })}
          currentUser={NON_OWNER_USER}
        />
      );
      expect(screen.queryByRole('button', { name: /submit report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /edit report/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /delete report/i })).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // created_at formatting
  // -------------------------------------------------------------------------

  describe('created_at formatting', () => {
    it('does not display the raw ISO string', () => {
      render(<ReportCard report={makeReport()} currentUser={OWNER_USER} />);
      expect(screen.queryByText('2026-05-01T14:32:00Z')).not.toBeInTheDocument();
    });

    it('does not contain a raw "T" separator in the displayed date', () => {
      const { container } = render(<ReportCard report={makeReport()} currentUser={OWNER_USER} />);
      expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    });
  });

  // -------------------------------------------------------------------------
  // purpose field is gone
  // -------------------------------------------------------------------------

  describe('purpose field is absent', () => {
    it('does not render a "Purpose" label', () => {
      render(<ReportCard report={makeReport()} currentUser={OWNER_USER} />);
      expect(screen.queryByText(/^purpose$/i)).not.toBeInTheDocument();
    });
  });
});
