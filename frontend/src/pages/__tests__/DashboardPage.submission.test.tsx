/**
 * Integration tests for DashboardPage — report submission with missing attachment check.
 *
 * Tests the new handleSubmitWithCheck logic that:
 *  - Proceeds directly when all lines have attachments
 *  - Shows MissingAttachmentWarningDialog when one or more lines lack attachments
 *  - "Add Attachments" navigates to the edit page
 *  - "Submit Without Attachments" proceeds with submission
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '../DashboardPage';
import type { ExpenseReportResponse, ExpenseLineResponse } from '../../types/expenseReport';
import type { AttachmentMetadata } from '../../types/attachments';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../hooks/useReports');
vi.mock('../../hooks/useAuth');
vi.mock('../../api/expenseLines');
vi.mock('../../api/attachments');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

import { useReports } from '../../hooks/useReports';
import { useAuth } from '../../hooks/useAuth';
import { listLines } from '../../api/expenseLines';
import { getAttachmentMetadata } from '../../api/attachments';

const mockUseReports = vi.mocked(useReports);
const mockUseAuth = vi.mocked(useAuth);
const mockListLines = vi.mocked(listLines);
const mockGetMetadata = vi.mocked(getAttachmentMetadata);

// downloadAttachment may be called in other tests — mock it to be safe
vi.mocked(await import('../../api/attachments')).downloadAttachment = vi.fn().mockResolvedValue(undefined);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const userRoleUser = { id: 1, username: 'alice', role: 'User' };

const inProgressReport: ExpenseReportResponse = {
  id: 42,
  title: 'Travel Expenses',
  description: 'Business trip',
  total_amount: 300,
  status: 'In Progress',
  owner_id: 1,
  owner_username: 'alice',
  created_at: '2026-04-01T00:00:00Z',
  reimbursable_from_client: false,
  client: null,
  admin_notes: null,
};

const lines: ExpenseLineResponse[] = [
  { id: 10, report_id: 42, description: 'Flight', amount: 200, incurred_date: '2026-04-02' },
  { id: 11, report_id: 42, description: 'Hotel', amount: 100, incurred_date: '2026-04-03' },
];

const sampleMetadata: AttachmentMetadata = {
  id: 1,
  file_name: 'receipt.pdf',
  file_size: 10240,
  mime_type: 'application/pdf',
  created_at: '2026-05-01T09:00:00Z',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const { ApiError } = await import('../../api/client');

let mockHandleSubmit: ReturnType<typeof vi.fn>;

function setupMocks(overrides: { handleSubmit?: ReturnType<typeof vi.fn> } = {}) {
  mockHandleSubmit = overrides.handleSubmit ?? vi.fn().mockResolvedValue(undefined);

  mockUseReports.mockReturnValue({
    reports: [inProgressReport],
    isLoading: false,
    error: null,
    createReport: vi.fn(),
    handleSubmit: mockHandleSubmit,
    handleAccept: vi.fn(),
    handleReject: vi.fn(),
    handleUpdate: vi.fn(),
    handleDelete: vi.fn(),
  });

  mockUseAuth.mockReturnValue({
    user: userRoleUser,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardPage — submission with attachment check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  // -------------------------------------------------------------------------
  // Requirement 5.6: all attachments present → no warning, submit directly
  // -------------------------------------------------------------------------

  describe('all attachments present', () => {
    it('proceeds directly to submission without showing dialog when all lines have attachments', async () => {
      setupMocks();
      mockListLines.mockResolvedValue(lines);
      // Both lines have attachments
      mockGetMetadata.mockResolvedValue(sampleMetadata);

      renderDashboard();

      await userEvent.click(screen.getByRole('button', { name: /submit report/i }));

      await waitFor(() => expect(mockHandleSubmit).toHaveBeenCalledWith(42));
      expect(screen.queryByTestId('missing-attachment-dialog')).not.toBeInTheDocument();
    });

    it('proceeds directly when there are no lines', async () => {
      setupMocks();
      mockListLines.mockResolvedValue([]);

      renderDashboard();

      await userEvent.click(screen.getByRole('button', { name: /submit report/i }));

      await waitFor(() => expect(mockHandleSubmit).toHaveBeenCalledWith(42));
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 5.2: missing attachments → show warning dialog
  // -------------------------------------------------------------------------

  describe('missing attachments → warning dialog', () => {
    it('shows MissingAttachmentWarningDialog when at least one line lacks an attachment', async () => {
      setupMocks();
      mockListLines.mockResolvedValue(lines);
      // Both lines missing attachment (404)
      mockGetMetadata.mockRejectedValue(new ApiError(404, 'Not found'));

      renderDashboard();

      await userEvent.click(screen.getByRole('button', { name: /submit report/i }));

      await waitFor(() =>
        expect(screen.getByTestId('missing-attachment-dialog')).toBeInTheDocument(),
      );
    });

    it('does NOT call handleSubmit when the dialog is shown', async () => {
      setupMocks();
      mockListLines.mockResolvedValue(lines);
      mockGetMetadata.mockRejectedValue(new ApiError(404, 'Not found'));

      renderDashboard();

      await userEvent.click(screen.getByRole('button', { name: /submit report/i }));

      await waitFor(() =>
        expect(screen.getByTestId('missing-attachment-dialog')).toBeInTheDocument(),
      );

      expect(mockHandleSubmit).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 5.3: dialog shows correct count of missing lines
  // -------------------------------------------------------------------------

  describe('correct missing count', () => {
    it('shows count = 2 when both of two lines lack attachments', async () => {
      setupMocks();
      mockListLines.mockResolvedValue(lines); // 2 lines
      mockGetMetadata.mockRejectedValue(new ApiError(404, 'Not found'));

      renderDashboard();

      await userEvent.click(screen.getByRole('button', { name: /submit report/i }));

      await waitFor(() =>
        expect(screen.getByTestId('missing-attachment-message')).toHaveTextContent('2'),
      );
    });

    it('shows count = 1 when only one of two lines lacks an attachment', async () => {
      setupMocks();
      mockListLines.mockResolvedValue(lines); // 2 lines
      // First line has attachment, second does not
      mockGetMetadata
        .mockResolvedValueOnce(sampleMetadata)
        .mockRejectedValueOnce(new ApiError(404, 'Not found'));

      renderDashboard();

      await userEvent.click(screen.getByRole('button', { name: /submit report/i }));

      await waitFor(() =>
        expect(screen.getByTestId('missing-attachment-message')).toHaveTextContent('1'),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 5.4: "Add Attachments" → navigate to editor
  // -------------------------------------------------------------------------

  describe('"Add Attachments" button', () => {
    it('navigates to the report edit page when "Add Attachments" is clicked', async () => {
      setupMocks();
      mockListLines.mockResolvedValue(lines);
      mockGetMetadata.mockRejectedValue(new ApiError(404, 'Not found'));

      renderDashboard();

      await userEvent.click(screen.getByRole('button', { name: /submit report/i }));

      await waitFor(() =>
        expect(screen.getByTestId('add-attachments-button')).toBeInTheDocument(),
      );

      await userEvent.click(screen.getByTestId('add-attachments-button'));

      expect(mockNavigate).toHaveBeenCalledWith('/reports/42/edit');
    });

    it('closes the dialog after "Add Attachments" is clicked', async () => {
      setupMocks();
      mockListLines.mockResolvedValue(lines);
      mockGetMetadata.mockRejectedValue(new ApiError(404, 'Not found'));

      renderDashboard();

      await userEvent.click(screen.getByRole('button', { name: /submit report/i }));

      await waitFor(() =>
        expect(screen.getByTestId('add-attachments-button')).toBeInTheDocument(),
      );

      await userEvent.click(screen.getByTestId('add-attachments-button'));

      await waitFor(() =>
        expect(screen.queryByTestId('missing-attachment-dialog')).not.toBeInTheDocument(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 5.5: "Submit Without Attachments" → proceed with submission
  // -------------------------------------------------------------------------

  describe('"Submit Without Attachments" button', () => {
    it('calls handleSubmit when "Submit Without Attachments" is clicked', async () => {
      setupMocks();
      mockListLines.mockResolvedValue(lines);
      mockGetMetadata.mockRejectedValue(new ApiError(404, 'Not found'));

      renderDashboard();

      await userEvent.click(screen.getByRole('button', { name: /submit report/i }));

      await waitFor(() =>
        expect(screen.getByTestId('submit-without-button')).toBeInTheDocument(),
      );

      await userEvent.click(screen.getByTestId('submit-without-button'));

      await waitFor(() => expect(mockHandleSubmit).toHaveBeenCalledWith(42));
    });

    it('closes the dialog after "Submit Without Attachments" is clicked', async () => {
      setupMocks();
      mockListLines.mockResolvedValue(lines);
      mockGetMetadata.mockRejectedValue(new ApiError(404, 'Not found'));

      renderDashboard();

      await userEvent.click(screen.getByRole('button', { name: /submit report/i }));

      await waitFor(() =>
        expect(screen.getByTestId('submit-without-button')).toBeInTheDocument(),
      );

      await userEvent.click(screen.getByTestId('submit-without-button'));

      await waitFor(() =>
        expect(screen.queryByTestId('missing-attachment-dialog')).not.toBeInTheDocument(),
      );
    });
  });
});
