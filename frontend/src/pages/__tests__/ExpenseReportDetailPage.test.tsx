/**
 * Unit tests for ExpenseReportDetailPage
 *
 * Covers:
 * - Report header fields rendered (title, status chip, description, total_amount, reimbursable)
 * - Table columns present with correct headings
 * - Add/Edit/Delete buttons visible when status is "In Progress" and user is owner (Req 2.1, 3.1, 4.1)
 * - Add/Edit/Delete buttons absent when status is "Submitted" (Req 2.2, 3.1, 4.2)
 * - Add/Edit/Delete buttons absent when user is not the owner (Req 3.1, 4.2)
 * - Empty-state message shown when lines list is empty (Req 5.5, 6.2)
 * - Multiple lines: formatIncurredDate output (not raw ISO), currency-formatted amounts,
 *   subtotal row present (Req 5.4, 5.5, 5.6, 6.4, 6.5, 6.6)
 * - Delete flow: dialog opens on Delete click; Cancel closes dialog without calling handleDelete;
 *   Confirm calls handleDelete with the correct line id (Req 4.1, 4.2, 6.3, 6.4, 6.5, 6.6)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ExpenseReportDetailPage } from '../ExpenseReportDetailPage';
import type { ExpenseReportResponse, ExpenseLineResponse } from '../../types/expenseReport';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../hooks/useReports');
vi.mock('../../hooks/useAuth');
vi.mock('../../hooks/useExpenseLines');
vi.mock('../../api/attachments');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { useReports } from '../../hooks/useReports';
import { useAuth } from '../../hooks/useAuth';
import { useExpenseLines } from '../../hooks/useExpenseLines';
import { getAttachmentMetadata } from '../../api/attachments';

const mockUseReports = vi.mocked(useReports);
const mockUseAuth = vi.mocked(useAuth);
const mockUseExpenseLines = vi.mocked(useExpenseLines);
const mockGetMetadata = vi.mocked(getAttachmentMetadata);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNER_USER = { id: 1, username: 'alice', role: 'User' };
const OTHER_USER = { id: 2, username: 'bob', role: 'User' };

function makeReport(overrides: Partial<ExpenseReportResponse> = {}): ExpenseReportResponse {
  return {
    id: 10,
    title: 'Q1 Travel',
    description: 'Business trip',
    total_amount: 150.0,
    status: 'In Progress',
    owner_id: 1,
    owner_username: 'alice',
    created_at: '2026-04-01T10:00:00Z',
    reimbursable_from_client: false,
    client: null,
    admin_notes: null,
    ...overrides,
  };
}

const sampleLines: ExpenseLineResponse[] = [
  {
    id: 1,
    report_id: 10,
    description: 'Taxi to airport',
    amount: 45.5,
    incurred_date: '2026-04-05',
  },
  {
    id: 2,
    report_id: 10,
    description: 'Hotel stay',
    amount: 104.5,
    incurred_date: '2026-04-06',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupReportsMock(report: ExpenseReportResponse | null, isLoading = false) {
  mockUseReports.mockReturnValue({
    reports: report ? [report] : [],
    isLoading,
    error: null,
    createReport: vi.fn(),
    handleSubmit: vi.fn(),
    handleAccept: vi.fn(),
    handleReject: vi.fn(),
    handleUpdate: vi.fn(),
    handleDelete: vi.fn(),
  });
}

function setupLinesMock(
  lines: ExpenseLineResponse[],
  overrides: { isLoading?: boolean; error?: string | null; handleDelete?: ReturnType<typeof vi.fn> } = {},
) {
  const handleDelete = overrides.handleDelete ?? vi.fn().mockResolvedValue(undefined);
  mockUseExpenseLines.mockReturnValue({
    lines,
    isLoading: overrides.isLoading ?? false,
    error: overrides.error ?? null,
    refetch: vi.fn(),
    handleCreate: vi.fn(),
    handleUpdate: vi.fn(),
    handleDelete,
  });
  return { handleDelete };
}

function setupAuthMock(user = OWNER_USER) {
  mockUseAuth.mockReturnValue({
    user,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function renderPage(reportId = '10') {
  return render(
    <MemoryRouter initialEntries={[`/reports/${reportId}`]}>
      <Routes>
        <Route path="/reports/:reportId" element={<ExpenseReportDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExpenseReportDetailPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    // Default: no attachments for any line
    mockGetMetadata.mockRejectedValue({ status: 404 });
  });

  // -------------------------------------------------------------------------
  // Report header
  // -------------------------------------------------------------------------

  it('renders report title, status chip, description, and total_amount', () => {
    setupReportsMock(makeReport());
    setupLinesMock([]);
    setupAuthMock();

    renderPage();

    expect(screen.getByText('Q1 Travel')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Business trip')).toBeInTheDocument();
    expect(screen.getByText(/\$150\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Reimbursable/)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Editable state: In Progress + owner
  // -------------------------------------------------------------------------

  it('shows table columns and Add/Edit/Delete buttons when status is "In Progress" and user is owner', () => {
    setupReportsMock(makeReport({ status: 'In Progress', owner_id: 1 }));
    setupLinesMock(sampleLines);
    setupAuthMock(OWNER_USER);

    renderPage();

    // Table column headings
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();

    // Add button
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();

    // Per-row edit and delete icon buttons (one pair per line)
    const editButtons = screen.getAllByRole('button', { name: 'edit' });
    const deleteButtons = screen.getAllByRole('button', { name: 'delete' });
    expect(editButtons).toHaveLength(sampleLines.length);
    expect(deleteButtons).toHaveLength(sampleLines.length);
  });

  it('shows table columns and Add/Edit/Delete buttons when status is "Rejected" and user is owner', () => {
    setupReportsMock(makeReport({ status: 'Rejected', owner_id: 1 }));
    setupLinesMock(sampleLines);
    setupAuthMock(OWNER_USER);

    renderPage();

    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'edit' })).toHaveLength(sampleLines.length);
    expect(screen.getAllByRole('button', { name: 'delete' })).toHaveLength(sampleLines.length);
  });

  // -------------------------------------------------------------------------
  // Non-editable state: Submitted + owner
  // -------------------------------------------------------------------------

  it('hides Add/Edit/Delete buttons when status is "Submitted"', () => {
    setupReportsMock(makeReport({ status: 'Submitted', owner_id: 1 }));
    setupLinesMock(sampleLines);
    setupAuthMock(OWNER_USER);

    renderPage();

    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'delete' })).not.toBeInTheDocument();
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
  });

  it('hides Add/Edit/Delete buttons when status is "Scheduled for Payment"', () => {
    setupReportsMock(makeReport({ status: 'Scheduled for Payment', owner_id: 1 }));
    setupLinesMock(sampleLines);
    setupAuthMock(OWNER_USER);

    renderPage();

    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'delete' })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Non-owner: In Progress but different owner
  // -------------------------------------------------------------------------

  it('hides Add/Edit/Delete buttons when user is not the owner', () => {
    setupReportsMock(makeReport({ status: 'In Progress', owner_id: 99 }));
    setupLinesMock(sampleLines);
    setupAuthMock(OTHER_USER);

    renderPage();

    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'delete' })).not.toBeInTheDocument();
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Empty lines state
  // -------------------------------------------------------------------------

  it('shows empty-state message when there are no expense lines', () => {
    setupReportsMock(makeReport());
    setupLinesMock([]);
    setupAuthMock();

    renderPage();

    expect(screen.getByText('No expense lines yet.')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Multiple lines: formatting and subtotal
  // -------------------------------------------------------------------------

  it('shows lines with currency-formatted amounts, formatted dates (not raw ISO), and a subtotal row', () => {
    setupReportsMock(makeReport({ total_amount: 150.0 }));
    setupLinesMock(sampleLines);
    setupAuthMock(OWNER_USER);

    renderPage();

    // Line data present
    expect(screen.getByText('Taxi to airport')).toBeInTheDocument();
    expect(screen.getByText('Hotel stay')).toBeInTheDocument();

    // Currency-formatted amounts
    expect(screen.getByText('$45.50')).toBeInTheDocument();
    expect(screen.getByText('$104.50')).toBeInTheDocument();

    // Dates formatted (not raw ISO strings)
    expect(screen.queryByText('2026-04-05')).not.toBeInTheDocument();
    expect(screen.queryByText('2026-04-06')).not.toBeInTheDocument();
    // The formatted date strings should be present (Apr 5, 2026 style)
    expect(screen.getByText(/Apr.*5.*2026|April.*5.*2026/i)).toBeInTheDocument();

    // Subtotal row — $150.00 also appears in the report header total, so expect 2 occurrences
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getAllByText('$150.00')).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Not found
  // -------------------------------------------------------------------------

  it('shows an inline error alert when the report is not found', () => {
    setupReportsMock(null, false);
    setupLinesMock([]);
    setupAuthMock();

    renderPage();

    expect(screen.getByText('Report not found.')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Delete flow
  // -------------------------------------------------------------------------

  it('opens delete dialog when Delete button is clicked', async () => {
    const user = userEvent.setup();
    setupReportsMock(makeReport({ status: 'In Progress', owner_id: 1 }));
    setupLinesMock(sampleLines);
    setupAuthMock(OWNER_USER);

    renderPage();

    const deleteButtons = screen.getAllByRole('button', { name: 'delete' });
    await user.click(deleteButtons[0]);

    expect(screen.getByText('Delete Expense Line')).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  it('closes the dialog without calling handleDelete when Cancel is clicked', async () => {
    const user = userEvent.setup();
    setupReportsMock(makeReport({ status: 'In Progress', owner_id: 1 }));
    const { handleDelete } = setupLinesMock(sampleLines);
    setupAuthMock(OWNER_USER);

    renderPage();

    const deleteButtons = screen.getAllByRole('button', { name: 'delete' });
    await user.click(deleteButtons[0]);

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText('Delete Expense Line')).not.toBeInTheDocument();
    });
    expect(handleDelete).not.toHaveBeenCalled();
  });

  it('calls handleDelete with the correct line id when Confirm is clicked', async () => {
    const user = userEvent.setup();
    setupReportsMock(makeReport({ status: 'In Progress', owner_id: 1 }));
    const { handleDelete } = setupLinesMock(sampleLines);
    setupAuthMock(OWNER_USER);

    renderPage();

    // Click delete on the first line (id = 1)
    const deleteButtons = screen.getAllByRole('button', { name: 'delete' });
    await user.click(deleteButtons[0]);

    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(handleDelete).toHaveBeenCalledWith(sampleLines[0].id);
    });
  });

  it('Add button navigates to the new line page', async () => {
    const user = userEvent.setup();
    setupReportsMock(makeReport({ status: 'In Progress', owner_id: 1 }));
    setupLinesMock([]);
    setupAuthMock(OWNER_USER);

    renderPage();

    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(mockNavigate).toHaveBeenCalledWith('/reports/10/lines/new');
  });

  it('Edit button navigates to the edit line page', async () => {
    const user = userEvent.setup();
    setupReportsMock(makeReport({ status: 'In Progress', owner_id: 1 }));
    setupLinesMock(sampleLines);
    setupAuthMock(OWNER_USER);

    renderPage();

    const editButtons = screen.getAllByRole('button', { name: 'edit' });
    await user.click(editButtons[0]);

    expect(mockNavigate).toHaveBeenCalledWith(`/reports/10/lines/${sampleLines[0].id}/edit`);
  });
});

// ---------------------------------------------------------------------------
// Back to Dashboard navigation
// ---------------------------------------------------------------------------

describe('Back to Dashboard button', () => {
  it('navigates to / when the back button is clicked', async () => {
    const user = userEvent.setup();
    setupReportsMock(makeReport({ status: 'Submitted', owner_id: 1 }));
    setupLinesMock([]);
    setupAuthMock(OWNER_USER);

    renderPage();

    await user.click(screen.getByRole('button', { name: /back to dashboard/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
