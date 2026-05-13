/**
 * Unit tests for StatusHistoryTable component.
 * Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 5.1, 5.3
 *
 * Covers:
 *  - Correct number of rows rendered
 *  - StatusChip rendered with correct status for each row
 *  - Formatted dates displayed (not raw ISO strings)
 *  - "—" rendered for null changed_at
 *  - "Status" and "Date" column headers present
 *  - No interactive elements (buttons, inputs) in the table
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { StatusHistoryTable } from '../StatusHistoryTable';
import type { StatusAuditLogEntry } from '../../types/expenseReport';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<StatusAuditLogEntry> = {}): StatusAuditLogEntry {
  return {
    id: 1,
    expense_report_id: 42,
    status: 'Submitted',
    changed_at: '2026-04-23T17:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StatusHistoryTable', () => {
  // -------------------------------------------------------------------------
  // Req 3.2: Correct number of rows rendered
  // -------------------------------------------------------------------------

  describe('row count', () => {
    it('renders one row per entry', () => {
      const entries = [
        makeEntry({ id: 1, status: 'In Progress', changed_at: '2026-04-20T10:00:00Z' }),
        makeEntry({ id: 2, status: 'Submitted', changed_at: '2026-04-23T17:00:00Z' }),
        makeEntry({ id: 3, status: 'Scheduled for Payment', changed_at: '2026-04-25T09:00:00Z' }),
      ];

      render(<StatusHistoryTable entries={entries} />);

      // Table body rows (excluding header row)
      const rows = screen.getAllByRole('row');
      // 1 header row + 3 body rows = 4 total
      expect(rows.length).toBe(4);
    });

    it('renders no body rows for empty entries', () => {
      render(<StatusHistoryTable entries={[]} />);

      const rows = screen.getAllByRole('row');
      // Only the header row
      expect(rows.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Req 3.1, 5.1: StatusChip rendered with correct status
  // -------------------------------------------------------------------------

  describe('StatusChip rendering', () => {
    it('renders a StatusChip with the correct status text for each row', () => {
      const entries = [
        makeEntry({ id: 1, status: 'In Progress' }),
        makeEntry({ id: 2, status: 'Submitted' }),
        makeEntry({ id: 3, status: 'Rejected' }),
      ];

      render(<StatusHistoryTable entries={entries} />);

      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Submitted')).toBeInTheDocument();
      expect(screen.getByText('Rejected')).toBeInTheDocument();
    });

    it('renders StatusChip as MUI Chip elements', () => {
      const entries = [makeEntry({ id: 1, status: 'Submitted' })];

      const { container } = render(<StatusHistoryTable entries={entries} />);

      const chips = container.querySelectorAll('.MuiChip-root');
      expect(chips.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Req 3.4, 3.5, 3.6: Formatted dates displayed (not raw ISO strings)
  // -------------------------------------------------------------------------

  describe('date formatting', () => {
    it('does not display raw ISO strings', () => {
      const entries = [
        makeEntry({ id: 1, changed_at: '2026-04-23T17:00:00Z' }),
      ];

      render(<StatusHistoryTable entries={entries} />);

      expect(screen.queryByText('2026-04-23T17:00:00Z')).not.toBeInTheDocument();
    });

    it('displays a formatted date containing the year', () => {
      const entries = [
        makeEntry({ id: 1, changed_at: '2026-04-23T17:00:00Z' }),
      ];

      render(<StatusHistoryTable entries={entries} />);

      // The formatted date should contain "2026" somewhere
      const cells = screen.getAllByRole('cell');
      const dateCell = cells.find((cell) => cell.textContent?.includes('2026'));
      expect(dateCell).toBeDefined();
    });

    it('displays a formatted date containing a month abbreviation', () => {
      const entries = [
        makeEntry({ id: 1, changed_at: '2026-04-23T17:00:00Z' }),
      ];

      render(<StatusHistoryTable entries={entries} />);

      // The formatted date should contain "Apr" (short month)
      const cells = screen.getAllByRole('cell');
      const dateCell = cells.find((cell) => cell.textContent?.includes('Apr'));
      expect(dateCell).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Req 3.5: "—" rendered for null changed_at
  // -------------------------------------------------------------------------

  describe('null changed_at handling', () => {
    it('renders "—" when changed_at is null', () => {
      const entries = [
        makeEntry({ id: 1, changed_at: null as unknown as string }),
      ];

      render(<StatusHistoryTable entries={entries} />);

      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Req 3.7, 5.3: "Status" and "Date" column headers present
  // -------------------------------------------------------------------------

  describe('column headers', () => {
    it('renders "Status" column header', () => {
      render(<StatusHistoryTable entries={[]} />);

      const headers = screen.getAllByRole('columnheader');
      const statusHeader = headers.find((h) => h.textContent?.trim() === 'Status');
      expect(statusHeader).toBeDefined();
    });

    it('renders "Date" column header', () => {
      render(<StatusHistoryTable entries={[]} />);

      const headers = screen.getAllByRole('columnheader');
      const dateHeader = headers.find((h) => h.textContent?.trim() === 'Date');
      expect(dateHeader).toBeDefined();
    });

    it('renders exactly two column headers', () => {
      render(<StatusHistoryTable entries={[]} />);

      const headers = screen.getAllByRole('columnheader');
      expect(headers.length).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Req 3.6: No interactive elements (buttons, inputs) in the table
  // -------------------------------------------------------------------------

  describe('no interactive elements', () => {
    it('does not render any buttons', () => {
      const entries = [
        makeEntry({ id: 1, status: 'In Progress' }),
        makeEntry({ id: 2, status: 'Submitted' }),
      ];

      render(<StatusHistoryTable entries={entries} />);

      const buttons = screen.queryAllByRole('button');
      expect(buttons.length).toBe(0);
    });

    it('does not render any text inputs', () => {
      const entries = [
        makeEntry({ id: 1, status: 'In Progress' }),
        makeEntry({ id: 2, status: 'Submitted' }),
      ];

      render(<StatusHistoryTable entries={entries} />);

      const inputs = screen.queryAllByRole('textbox');
      expect(inputs.length).toBe(0);
    });

    it('does not render any checkboxes', () => {
      const entries = [
        makeEntry({ id: 1, status: 'In Progress' }),
        makeEntry({ id: 2, status: 'Submitted' }),
      ];

      render(<StatusHistoryTable entries={entries} />);

      const checkboxes = screen.queryAllByRole('checkbox');
      expect(checkboxes.length).toBe(0);
    });

    it('does not render any links', () => {
      const entries = [
        makeEntry({ id: 1, status: 'In Progress' }),
        makeEntry({ id: 2, status: 'Submitted' }),
      ];

      render(<StatusHistoryTable entries={entries} />);

      const links = screen.queryAllByRole('link');
      expect(links.length).toBe(0);
    });
  });
});
