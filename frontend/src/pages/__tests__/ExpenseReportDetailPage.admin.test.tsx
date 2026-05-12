/**
 * Integration tests for ExpenseReportDetailPage — attachment download icon.
 *
 * Tests that the paperclip download icon appears in the description column
 * when a line has an attachment, triggers a download on click, and is absent
 * when no attachment exists — for both admin and regular users.
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
import { getAttachmentMetadata, downloadAttachment } from '../../api/attachments';

const mockUseReports = vi.mocked(useReports);
const mockUseAuth = vi.mocked(useAuth);
const mockUseExpenseLines = vi.mocked(useExpenseLines);
const mockGetMetadata = vi.mocked(getAttachmentMetadata);
const mockDownload = vi.mocked(downloadAttachment);

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

describe('Attachment download icon in lines table (Req 13.1, 13.2, 13.3, 13.5, 13.6)', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockGetMetadata.mockReset();
    mockDownload.mockReset();
  });

  // -------------------------------------------------------------------------
  // Icon visibility
  // -------------------------------------------------------------------------

  it('shows the download icon when the line has an attachment (admin)', async () => {
    setupReportsMock(REPORT);
    setupLinesMock([LINE_1]);
    setupAuthMock(ADMIN_USER);
    mockGetMetadata.mockResolvedValue(ATTACHMENT_1);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /download attachment/i })).toBeInTheDocument();
    });
  });

  it('shows the download icon when the line has an attachment (regular user / owner)', async () => {
    setupReportsMock(REPORT);
    setupLinesMock([LINE_1]);
    setupAuthMock(OWNER_USER);
    mockGetMetadata.mockResolvedValue(ATTACHMENT_1);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /download attachment/i })).toBeInTheDocument();
    });
  });

  it('does not show the download icon when the line has no attachment', async () => {
    setupReportsMock(REPORT);
    setupLinesMock([LINE_1]);
    setupAuthMock(OWNER_USER);
    mockGetMetadata.mockRejectedValue({ status: 404 });

    renderPage();

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('button', { name: /download attachment/i })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Multiple lines — icon only on lines with attachments
  // -------------------------------------------------------------------------

  it('shows icon only for lines that have an attachment', async () => {
    setupReportsMock(REPORT);
    setupLinesMock([LINE_1, LINE_2]);
    setupAuthMock(OWNER_USER);
    mockGetMetadata
      .mockResolvedValueOnce(ATTACHMENT_1)    // LINE_1 has attachment
      .mockRejectedValueOnce({ status: 404 }); // LINE_2 does not

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /download attachment/i })).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Clicking the icon triggers download
  // -------------------------------------------------------------------------

  it('calls downloadAttachment with correct reportId and lineId when icon is clicked', async () => {
    setupReportsMock(REPORT);
    setupLinesMock([LINE_1]);
    setupAuthMock(OWNER_USER);
    mockGetMetadata.mockResolvedValue(ATTACHMENT_1);
    mockDownload.mockResolvedValue(undefined);

    renderPage();

    await waitFor(() => screen.getByRole('button', { name: /download attachment/i }));
    await userEvent.click(screen.getByRole('button', { name: /download attachment/i }));

    expect(mockDownload).toHaveBeenCalledOnce();
    expect(mockDownload).toHaveBeenCalledWith(10, 1);
  });

  it('calls downloadAttachment with the correct lineId for each respective line', async () => {
    setupReportsMock(REPORT);
    setupLinesMock([LINE_1, LINE_2]);
    setupAuthMock(OWNER_USER);
    mockGetMetadata.mockResolvedValue(ATTACHMENT_1);
    mockDownload.mockResolvedValue(undefined);

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /download attachment/i })).toHaveLength(2);
    });

    const [btn1, btn2] = screen.getAllByRole('button', { name: /download attachment/i });
    await userEvent.click(btn1);
    expect(mockDownload).toHaveBeenLastCalledWith(10, 1);

    await userEvent.click(btn2);
    expect(mockDownload).toHaveBeenLastCalledWith(10, 2);
  });

  // -------------------------------------------------------------------------
  // Metadata fetch
  // -------------------------------------------------------------------------

  it('calls getAttachmentMetadata for each line on mount', async () => {
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

    await new Promise((r) => setTimeout(r, 50));
    expect(mockGetMetadata).not.toHaveBeenCalled();
  });
});
