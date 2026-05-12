/**
 * Integration tests for ExpenseReportDetailPage — admin attachment access.
 *
 * Tests that admins see the AttachmentDisplayComponent for each line of any
 * expense report, can refresh attachment state, and that non-admin users do
 * not see attachment rows.
 *
 * API functions are mocked so no real HTTP calls are made.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.5, 13.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ExpenseReportDetailPage } from '../ExpenseReportDetailPage';
import type { ExpenseReportResponse, ExpenseLineResponse } from '../../types/expenseReport';
import type { AttachmentMetadata } from '../../types/attachments';

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
  return { ...actual, useNavigate: () => mockNavigate };
});

import { useReports } from '../../hooks/useReports';
import { useAuth } from '../../hooks/useAuth';
import { useExpenseLines } from '../../hooks/useExpenseLines';
import { getAttachmentMetadata, downloadAttachment, deleteAttachment } from '../../api/attachments';

const mockUseReports = vi.mocked(useReports);
const mockUseAuth = vi.mocked(useAuth);
const mockUseExpenseLines = vi.mocked(useExpenseLines);
const mockGetMetadata = vi.mocked(getAttachmentMetadata);
const mockDownload = vi.mocked(downloadAttachment);
const mockDelete = vi.mocked(deleteAttachment);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN_USER = { id: 99, username: 'admin', role: 'Admin' };
const OWNER_USER = { id: 1, username: 'alice', role: 'User' };

const REPORT: ExpenseReportResponse = {
  id: 10,
  title: 'Trip Expenses',
  description: null,
  total_amount: 200,
  status: 'Submitted',
  owner_id: 1,
  owner_username: 'alice',
  created_at: '2026-04-01T00:00:00Z',
  reimbursable_from_client: false,
  client: null,
  admin_notes: null,
};

const LINE_1: ExpenseLineResponse = {
  id: 1,
  report_id: 10,
  description: 'Taxi',
  amount: 50,
  incurred_date: '2026-04-05',
};

const LINE_2: ExpenseLineResponse = {
  id: 2,
  report_id: 10,
  description: 'Hotel',
  amount: 150,
  incurred_date: '2026-04-06',
};

const ATTACHMENT_1: AttachmentMetadata = {
  id: 1,
  file_name: 'receipt.pdf',
  file_size: 1024,
  mime_type: 'application/pdf',
  created_at: '2026-04-06T12:00:00Z',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupReportsMock(report: ExpenseReportResponse) {
  mockUseReports.mockReturnValue({
    reports: [report],
    isLoading: false,
    error: null,
    createReport: vi.fn(),
    handleSubmit: vi.fn(),
    handleAccept: vi.fn(),
    handleReject: vi.fn(),
    handleUpdate: vi.fn(),
    handleDelete: vi.fn(),
  });
}

function setupLinesMock(lines: ExpenseLineResponse[]) {
  mockUseExpenseLines.mockReturnValue({
    lines,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    handleCreate: vi.fn(),
    handleUpdate: vi.fn(),
    handleDelete: vi.fn().mockResolvedValue(undefined),
  });
}

function setupAuthMock(user: typeof ADMIN_USER | typeof OWNER_USER) {
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

describe('Admin attachment access (Req 13.1, 13.2, 13.3, 13.5, 13.6)', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockGetMetadata.mockReset();
    mockDownload.mockReset();
    mockDelete.mockReset();
  });

  // -------------------------------------------------------------------------
  // 13.2 — attachment section visible to admin
  // -------------------------------------------------------------------------

  it('shows an attachment row for each line when the user is admin', async () => {
    setupReportsMock(REPORT);
    setupLinesMock([LINE_1, LINE_2]);
    setupAuthMock(ADMIN_USER);
    mockGetMetadata.mockResolvedValue(ATTACHMENT_1);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('attachment-row-1')).toBeInTheDocument();
      expect(screen.getByTestId('attachment-row-2')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 13.5 — non-admin cannot access other users' attachment rows
  // -------------------------------------------------------------------------

  it('does NOT show attachment rows when the user is a non-admin (User role)', () => {
    setupReportsMock(REPORT);
    setupLinesMock([LINE_1, LINE_2]);
    setupAuthMock(OWNER_USER);
    // getAttachmentMetadata should never be called for non-admins
    mockGetMetadata.mockResolvedValue(ATTACHMENT_1);

    renderPage();

    expect(screen.queryByTestId('attachment-row-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('attachment-row-2')).not.toBeInTheDocument();
    expect(mockGetMetadata).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 13.6 — admin can view attachment metadata (filename, size, date)
  // -------------------------------------------------------------------------

  it('displays attachment metadata when an attachment exists for a line', async () => {
    setupReportsMock(REPORT);
    setupLinesMock([LINE_1]);
    setupAuthMock(ADMIN_USER);
    mockGetMetadata.mockResolvedValue(ATTACHMENT_1);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('attachment-filename')).toHaveTextContent('receipt.pdf');
    });
    expect(screen.getByTestId('attachment-filesize')).toBeInTheDocument();
    expect(screen.getByTestId('attachment-date')).toBeInTheDocument();
  });

  it('shows the no-attachment placeholder when a line has no attachment', async () => {
    setupReportsMock(REPORT);
    setupLinesMock([LINE_1]);
    setupAuthMock(ADMIN_USER);
    mockGetMetadata.mockRejectedValue({ status: 404 });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('no-attachment-message')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 13.1 — admin fetches metadata for each line (any report, any owner)
  // -------------------------------------------------------------------------

  it('calls getAttachmentMetadata with the correct reportId and lineId for each line', async () => {
    setupReportsMock(REPORT);
    setupLinesMock([LINE_1, LINE_2]);
    setupAuthMock(ADMIN_USER);
    mockGetMetadata.mockResolvedValue(ATTACHMENT_1);

    renderPage();

    await waitFor(() => {
      expect(mockGetMetadata).toHaveBeenCalledWith(10, 1);
      expect(mockGetMetadata).toHaveBeenCalledWith(10, 2);
    });
  });

  it('does not call getAttachmentMetadata when lines list is empty', async () => {
    setupReportsMock(REPORT);
    setupLinesMock([]);
    setupAuthMock(ADMIN_USER);

    renderPage();

    // Give time for any async effects to fire
    await new Promise((r) => setTimeout(r, 50));
    expect(mockGetMetadata).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 13.3 — admin can download attachments
  // -------------------------------------------------------------------------

  it('allows admin to click the download button for an attachment', async () => {
    setupReportsMock(REPORT);
    setupLinesMock([LINE_1]);
    setupAuthMock(ADMIN_USER);
    mockGetMetadata.mockResolvedValue(ATTACHMENT_1);
    mockDownload.mockResolvedValue(undefined);

    renderPage();

    await waitFor(() => screen.getByTestId('download-button'));
    await userEvent.click(screen.getByTestId('download-button'));

    expect(mockDownload).toHaveBeenCalledWith(10, 1);
  });

  // -------------------------------------------------------------------------
  // Refresh — after delete, attachment state updates per line
  // -------------------------------------------------------------------------

  it('refreshes a single line attachment after delete confirmation', async () => {
    setupReportsMock(REPORT);
    setupLinesMock([LINE_1]);
    setupAuthMock(ADMIN_USER);
    mockGetMetadata.mockResolvedValueOnce(ATTACHMENT_1); // initial fetch
    mockDelete.mockResolvedValue(undefined);
    mockGetMetadata.mockRejectedValue({ status: 404 }); // after delete

    renderPage();

    // Wait for initial metadata to load
    await waitFor(() => screen.getByTestId('delete-button'));

    // Click delete → confirm dialog
    await userEvent.click(screen.getByTestId('delete-button'));
    await waitFor(() => screen.getByTestId('confirm-delete-button'));
    await userEvent.click(screen.getByTestId('confirm-delete-button'));

    // After deletion, AttachmentDisplayComponent calls onRefresh,
    // which re-fetches the metadata (now 404 → null → no-attachment-message)
    await waitFor(() => {
      expect(screen.getByTestId('no-attachment-message')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Mixed lines — some with attachments, some without
  // -------------------------------------------------------------------------

  it('shows attachment metadata for lines that have it and placeholder for lines that do not', async () => {
    setupReportsMock(REPORT);
    setupLinesMock([LINE_1, LINE_2]);
    setupAuthMock(ADMIN_USER);
    // LINE_1 has an attachment; LINE_2 does not
    mockGetMetadata
      .mockResolvedValueOnce(ATTACHMENT_1) // for LINE_1
      .mockRejectedValueOnce({ status: 404 }); // for LINE_2

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('attachment-filename')).toHaveTextContent('receipt.pdf');
      expect(screen.getByTestId('no-attachment-message')).toBeInTheDocument();
    });
  });
});
