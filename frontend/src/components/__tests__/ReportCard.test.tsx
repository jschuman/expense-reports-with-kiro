/**
 * Tests for ReportCard component.
 * Requirements: 1.3, 2.3, 3.5, 4.3, 5.7, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5
 *
 * Covers:
 *  - All new fields render for a fully-populated report
 *  - "—" renders for null description, client, and admin_notes
 *  - "Yes" / "No" renders for reimbursable_from_client
 *  - created_at is displayed as a human-readable string (not raw ISO)
 *  - purpose is no longer referenced
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportCard } from '../ReportCard';
import type { ExpenseReportResponse } from '../../types/expenseReport';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FULL_REPORT: ExpenseReportResponse = {
  id: 1,
  title: 'Q2 Travel',
  description: 'Client visit to NYC',
  total_amount: 850.0,
  status: 'Pending',
  owner_id: 1,
  owner_username: 'alice',
  created_at: '2026-05-01T14:32:00Z',
  reimbursable_from_client: true,
  client: 'Acme Corp',
  admin_notes: 'Approved by finance',
};

const NULL_OPTIONAL_REPORT: ExpenseReportResponse = {
  id: 2,
  title: 'Office Supplies',
  description: null,
  total_amount: 45.0,
  status: 'Pending',
  owner_id: 2,
  owner_username: 'bob',
  created_at: '2026-04-10T09:00:00Z',
  reimbursable_from_client: false,
  client: null,
  admin_notes: null,
};

const EMPTY_STRING_OPTIONAL_REPORT: ExpenseReportResponse = {
  ...NULL_OPTIONAL_REPORT,
  id: 3,
  description: '',
  client: '',
  admin_notes: '',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReportCard', () => {
  // -------------------------------------------------------------------------
  // Fully-populated report — all fields render
  // -------------------------------------------------------------------------

  describe('fully-populated report', () => {
    it('renders the report title', () => {
      render(<ReportCard report={FULL_REPORT} />);
      expect(screen.getByRole('heading', { name: 'Q2 Travel' })).toBeInTheDocument();
    });

    it('renders the description', () => {
      render(<ReportCard report={FULL_REPORT} />);
      expect(screen.getByText('Client visit to NYC')).toBeInTheDocument();
    });

    it('renders total_amount formatted as currency', () => {
      render(<ReportCard report={FULL_REPORT} />);
      expect(screen.getByText('$850.00')).toBeInTheDocument();
    });

    it('renders the status chip', () => {
      render(<ReportCard report={FULL_REPORT} />);
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('renders owner_username', () => {
      render(<ReportCard report={FULL_REPORT} />);
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    it('renders created_at as a human-readable string (no raw "T" separator)', () => {
      const { container } = render(<ReportCard report={FULL_REPORT} />);

      // The raw ISO string should NOT appear in the document
      expect(screen.queryByText('2026-05-01T14:32:00Z')).not.toBeInTheDocument();

      // The "Created" label must be present
      expect(screen.getByText('Created')).toBeInTheDocument();

      // The formatted value should not contain a raw ISO "T" separator
      expect(container.textContent).not.toMatch(/2026-05-01T/);
    });

    it('renders reimbursable_from_client as "Yes" when true', () => {
      render(<ReportCard report={FULL_REPORT} />);
      expect(screen.getByText('Yes')).toBeInTheDocument();
    });

    it('renders the client name', () => {
      render(<ReportCard report={FULL_REPORT} />);
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    it('renders admin_notes', () => {
      render(<ReportCard report={FULL_REPORT} />);
      expect(screen.getByText('Approved by finance')).toBeInTheDocument();
    });

    it('renders all field labels', () => {
      render(<ReportCard report={FULL_REPORT} />);
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
    it('renders "—" for null description', () => {
      render(<ReportCard report={NULL_OPTIONAL_REPORT} />);
      // There should be at least one "—" placeholder
      const placeholders = screen.getAllByText('—');
      expect(placeholders.length).toBeGreaterThanOrEqual(1);
    });

    it('renders "—" for null client', () => {
      render(<ReportCard report={NULL_OPTIONAL_REPORT} />);
      const placeholders = screen.getAllByText('—');
      // description, client, and admin_notes are all null → three "—" placeholders
      expect(placeholders.length).toBeGreaterThanOrEqual(3);
    });

    it('renders "—" for null admin_notes', () => {
      render(<ReportCard report={NULL_OPTIONAL_REPORT} />);
      const placeholders = screen.getAllByText('—');
      expect(placeholders.length).toBeGreaterThanOrEqual(3);
    });

    it('renders "—" for empty string description', () => {
      render(<ReportCard report={EMPTY_STRING_OPTIONAL_REPORT} />);
      const placeholders = screen.getAllByText('—');
      expect(placeholders.length).toBeGreaterThanOrEqual(3);
    });

    it('renders "—" for empty string client', () => {
      render(<ReportCard report={EMPTY_STRING_OPTIONAL_REPORT} />);
      const placeholders = screen.getAllByText('—');
      expect(placeholders.length).toBeGreaterThanOrEqual(3);
    });

    it('renders "—" for empty string admin_notes', () => {
      render(<ReportCard report={EMPTY_STRING_OPTIONAL_REPORT} />);
      const placeholders = screen.getAllByText('—');
      expect(placeholders.length).toBeGreaterThanOrEqual(3);
    });
  });

  // -------------------------------------------------------------------------
  // Reimbursable boolean display
  // -------------------------------------------------------------------------

  describe('reimbursable_from_client display', () => {
    it('renders "Yes" when reimbursable_from_client is true', () => {
      render(<ReportCard report={{ ...FULL_REPORT, reimbursable_from_client: true }} />);
      expect(screen.getByText('Yes')).toBeInTheDocument();
      expect(screen.queryByText('No')).not.toBeInTheDocument();
    });

    it('renders "No" when reimbursable_from_client is false', () => {
      render(<ReportCard report={{ ...FULL_REPORT, reimbursable_from_client: false }} />);
      expect(screen.getByText('No')).toBeInTheDocument();
      expect(screen.queryByText('Yes')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // created_at formatting
  // -------------------------------------------------------------------------

  describe('created_at formatting', () => {
    it('does not display the raw ISO string', () => {
      render(<ReportCard report={FULL_REPORT} />);
      expect(screen.queryByText('2026-05-01T14:32:00Z')).not.toBeInTheDocument();
    });

    it('does not contain a raw "T" separator in the displayed date', () => {
      const { container } = render(<ReportCard report={FULL_REPORT} />);
      // The raw ISO "T" separator should not appear in the rendered output
      expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    });
  });

  // -------------------------------------------------------------------------
  // purpose field is gone
  // -------------------------------------------------------------------------

  describe('purpose field is absent', () => {
    it('does not render a "Purpose" label', () => {
      render(<ReportCard report={FULL_REPORT} />);
      expect(screen.queryByText(/^purpose$/i)).not.toBeInTheDocument();
    });
  });
});
