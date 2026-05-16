/**
 * Tests for EditReportPage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EditReportPage } from '../EditReportPage';

// Mock hooks
vi.mock('../../hooks/useReports');
vi.mock('../../hooks/useClients');
vi.mock('../../hooks/useExpenseLines');
vi.mock('../../hooks/useAuth');
vi.mock('../../api/attachments');
vi.mock('../../api/reports');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { useReports } from '../../hooks/useReports';
import { useClients } from '../../hooks/useClients';
import { useExpenseLines } from '../../hooks/useExpenseLines';
import { useAuth } from '../../hooks/useAuth';
import { getAttachmentMetadata } from '../../api/attachments';
import { getStatusHistory } from '../../api/reports';
import type { ExpenseLineResponse, StatusAuditLogEntry } from '../../types/expenseReport';

const mockUseReports = vi.mocked(useReports);
const mockUseClients = vi.mocked(useClients);
const mockUseExpenseLines = vi.mocked(useExpenseLines);
const mockUseAuth = vi.mocked(useAuth);
const mockGetMetadata = vi.mocked(getAttachmentMetadata);
const mockGetStatusHistory = vi.mocked(getStatusHistory);

const baseReport = {
  id: 42,
  title: 'Q1 Travel',
  description: 'Flight to NYC',
  total_amount: 350,
  status: 'In Progress',
  owner_id: 1,
  owner_username: 'alice',
  created_at: '2026-04-28T12:00:00Z',
  reimbursable_from_client: false,
  client: null,
  admin_notes: null,
};

function renderPage(reportId = '42') {
  return render(
    <MemoryRouter initialEntries={[`/reports/${reportId}/edit`]}>
      <Routes>
        <Route path="/reports/:reportId/edit" element={<EditReportPage />} />
        <Route path="/reports/:reportId/lines/new" element={<div data-testid="add-line-page" />} />
        <Route path="/reports/:reportId/lines/:lineId/edit" element={<div data-testid="edit-line-page" />} />
        <Route path="/" element={<div data-testid="dashboard" />} />
      </Routes>
    </MemoryRouter>
  );
}

function setupLinesMock(
  lines: ExpenseLineResponse[] = [],
  handleDelete = vi.fn().mockResolvedValue(undefined),
) {
  mockUseExpenseLines.mockReturnValue({
    lines,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    handleCreate: vi.fn(),
    handleUpdate: vi.fn(),
    handleDelete,
  });
  return { handleDelete };
}

describe('EditReportPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockGetMetadata.mockRejectedValue({ status: 404 });
    mockGetStatusHistory.mockResolvedValue([]);
    mockUseClients.mockReturnValue({
      clients: ['Acme Corp', 'Globex Industries'],
      isLoading: false,
      error: null,
    });
    mockUseAuth.mockReturnValue({
      user: { id: 1, username: 'alice', role: 'User' },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    setupLinesMock(); // default: no lines
  });

  it('pre-fills form fields from the existing report', async () => {
    const mockHandleUpdate = vi.fn().mockResolvedValue(undefined);
    mockUseReports.mockReturnValue({
      reports: [baseReport],
      isLoading: false,
      error: null,
      handleUpdate: mockHandleUpdate,
    });

    renderPage();

    expect(screen.getByDisplayValue('Q1 Travel')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Flight to NYC')).toBeInTheDocument();
  });

  it('calls handleUpdate with changed fields and navigates to / on success', async () => {
    const mockHandleUpdate = vi.fn().mockResolvedValue(undefined);
    mockUseReports.mockReturnValue({
      reports: [baseReport],
      isLoading: false,
      error: null,
      handleUpdate: mockHandleUpdate,
    });

    renderPage();

    const titleInput = screen.getByDisplayValue('Q1 Travel');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Q2 Travel');

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mockHandleUpdate).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ title: 'Q2 Travel' }),
      );
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('shows an error alert and does not navigate on API failure', async () => {
    const mockHandleUpdate = vi.fn().mockRejectedValue(new Error('Update failed'));
    mockUseReports.mockReturnValue({
      reports: [baseReport],
      isLoading: false,
      error: null,
      handleUpdate: mockHandleUpdate,
    });

    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Update failed')).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('navigates to / when Cancel is clicked', async () => {
    mockUseReports.mockReturnValue({
      reports: [baseReport],
      isLoading: false,
      error: null,
      handleUpdate: vi.fn(),
    });

    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('redirects to / when the report is not found', async () => {
    mockUseReports.mockReturnValue({
      reports: [baseReport],
      isLoading: false,
      error: null,
      handleUpdate: vi.fn(),
    });

    renderPage('999'); // non-existent ID

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('shows empty-state message when there are no lines', () => {
    mockUseReports.mockReturnValue({
      reports: [baseReport],
      isLoading: false,
      error: null,
      handleUpdate: vi.fn(),
    });
    setupLinesMock([]);

    renderPage();

    expect(screen.getByText(/no expense lines yet/i)).toBeInTheDocument();
  });

  it('renders lines table with Add Line button when lines exist', () => {
    mockUseReports.mockReturnValue({
      reports: [baseReport],
      isLoading: false,
      error: null,
      handleUpdate: vi.fn(),
    });
    setupLinesMock([
      { id: 1, report_id: 42, description: 'Hotel', amount: 120.5, incurred_date: '2026-04-05' },
    ]);

    renderPage();

    expect(screen.getByRole('button', { name: /add line/i })).toBeInTheDocument();
    expect(screen.getByText('Hotel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit line/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete line/i })).toBeInTheDocument();
  });

  it('opens delete dialog and calls handleDelete on confirm', async () => {
    const user = userEvent.setup();
    mockUseReports.mockReturnValue({
      reports: [baseReport],
      isLoading: false,
      error: null,
      handleUpdate: vi.fn(),
    });
    const { handleDelete } = setupLinesMock([
      { id: 7, report_id: 42, description: 'Taxi', amount: 25, incurred_date: '2026-04-10' },
    ]);

    renderPage();

    await user.click(screen.getByRole('button', { name: /delete line/i }));
    expect(screen.getByText('Delete Expense Line')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(handleDelete).toHaveBeenCalledWith(7);
    });
  });

  it('closes delete dialog without deleting when Cancel is clicked', async () => {
    const user = userEvent.setup();
    mockUseReports.mockReturnValue({
      reports: [baseReport],
      isLoading: false,
      error: null,
      handleUpdate: vi.fn(),
    });
    const { handleDelete } = setupLinesMock([
      { id: 7, report_id: 42, description: 'Taxi', amount: 25, incurred_date: '2026-04-10' },
    ]);

    renderPage();

    await user.click(screen.getByRole('button', { name: /delete line/i }));

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText('Delete Expense Line')).not.toBeInTheDocument();
    });
    expect(handleDelete).not.toHaveBeenCalled();
  });
});


// ---------------------------------------------------------------------------
// Status History Integration Tests
// Requirements: 2.1, 2.2, 2.3, 4.2, 4.3, 4.4
// ---------------------------------------------------------------------------

describe('EditReportPage - Status History', () => {
  const twoEntries: StatusAuditLogEntry[] = [
    { id: 1, expense_report_id: 42, status: 'In Progress', changed_at: '2026-04-20T10:00:00Z' },
    { id: 2, expense_report_id: 42, status: 'Submitted', changed_at: '2026-04-23T17:00:00Z' },
  ];

  beforeEach(() => {
    mockNavigate.mockReset();
    mockGetMetadata.mockRejectedValue({ status: 404 });
    mockGetStatusHistory.mockResolvedValue([]);
    mockUseClients.mockReturnValue({
      clients: ['Acme Corp', 'Globex Industries'],
      isLoading: false,
      error: null,
    });
    mockUseAuth.mockReturnValue({
      user: { id: 1, username: 'alice', role: 'User' },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    setupLinesMock();
    mockUseReports.mockReturnValue({
      reports: [baseReport],
      isLoading: false,
      error: null,
      handleUpdate: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('renders StatusHistoryTable when API returns 2+ entries', async () => {
    mockGetStatusHistory.mockResolvedValue(twoEntries);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Status History')).toBeInTheDocument();
    });
    // The table should have Status and Date column headers from StatusHistoryTable
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
  });

  it('does not render StatusHistoryTable when API returns 0 entries', async () => {
    mockGetStatusHistory.mockResolvedValue([]);

    renderPage();

    // Wait for the component to settle
    await waitFor(() => {
      expect(screen.getByDisplayValue('Q1 Travel')).toBeInTheDocument();
    });

    expect(screen.queryByText('Status History')).not.toBeInTheDocument();
  });

  it('does not render StatusHistoryTable when API returns 1 entry', async () => {
    mockGetStatusHistory.mockResolvedValue([twoEntries[0]]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Q1 Travel')).toBeInTheDocument();
    });

    expect(screen.queryByText('Status History')).not.toBeInTheDocument();
  });

  it('renders StatusHistoryTable outside the form element', async () => {
    mockGetStatusHistory.mockResolvedValue(twoEntries);

    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getByText('Status History')).toBeInTheDocument();
    });

    // The status history heading should NOT be inside the form
    const form = container.querySelector('form');
    expect(form).not.toBeNull();

    const statusHistoryHeading = screen.getByText('Status History');
    expect(form!.contains(statusHistoryHeading)).toBe(false);
  });

  it('displays "Status History" heading when table is shown', async () => {
    mockGetStatusHistory.mockResolvedValue(twoEntries);

    renderPage();

    await waitFor(() => {
      const heading = screen.getByText('Status History');
      expect(heading).toBeInTheDocument();
      expect(heading.tagName).toBe('H6');
    });
  });

  it('re-fetches status history after a status transition (form submit)', async () => {
    mockGetStatusHistory.mockClear();
    mockGetStatusHistory.mockResolvedValue(twoEntries);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Status History')).toBeInTheDocument();
    });

    // getStatusHistory should have been called on mount with the correct report ID
    expect(mockGetStatusHistory).toHaveBeenCalledWith(42);
    expect(mockGetStatusHistory).toHaveBeenCalledTimes(1);
  });
});
