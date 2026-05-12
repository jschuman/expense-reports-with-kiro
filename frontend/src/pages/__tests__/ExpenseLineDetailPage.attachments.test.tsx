/**
 * Integration tests for ExpenseLineDetailPage — attachment flows.
 *
 * Tests the integration of AttachmentUploadComponent and
 * AttachmentDisplayComponent inside the line editor page, covering:
 *  - Upload flow: select file → display updated metadata
 *  - Delete flow: confirm delete → attachment removed
 *  - Replacement flow: upload A → upload B → only B displayed
 *  - Authorization: components passed correct reportId / lineId props
 *  - Attachment section absent in create mode
 *
 * API functions are mocked so no real HTTP calls are made.
 *
 * Requirements: 1.1-1.6, 3.1-3.5, 4.1-4.5, 9.1-9.4, 10.1-10.8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ExpenseLineDetailPage } from '../ExpenseLineDetailPage';
import type { ExpenseLineResponse } from '../../types/expenseReport';
import type { AttachmentMetadata } from '../../types/attachments';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../hooks/useExpenseLines');
vi.mock('../../api/attachments');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

import { useExpenseLines } from '../../hooks/useExpenseLines';
import {
  getAttachmentMetadata,
  uploadAttachment,
  deleteAttachment,
  downloadAttachment,
} from '../../api/attachments';

const mockUseExpenseLines = vi.mocked(useExpenseLines);
const mockGetMetadata = vi.mocked(getAttachmentMetadata);
const mockUpload = vi.mocked(uploadAttachment);
const mockDelete = vi.mocked(deleteAttachment);

// downloadAttachment is mocked but we don't need it to do anything in these tests.
vi.mocked(downloadAttachment).mockResolvedValue(undefined);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleLine: ExpenseLineResponse = {
  id: 5,
  report_id: 10,
  description: 'Taxi to airport',
  amount: 45.5,
  incurred_date: '2026-04-05',
};

const attachmentA: AttachmentMetadata = {
  id: 1,
  file_name: 'receipt-a.pdf',
  file_size: 10240,
  mime_type: 'application/pdf',
  created_at: '2026-05-10T09:00:00Z',
};

const attachmentB: AttachmentMetadata = {
  id: 2,
  file_name: 'receipt-b.pdf',
  file_size: 20480,
  mime_type: 'application/pdf',
  created_at: '2026-05-12T11:00:00Z',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const { ApiError } = await import('../../api/client');

function setupLinesMock(lines: ExpenseLineResponse[] = [sampleLine]) {
  mockUseExpenseLines.mockReturnValue({
    lines,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    handleCreate: vi.fn().mockResolvedValue(undefined),
    handleUpdate: vi.fn().mockResolvedValue(undefined),
    handleDelete: vi.fn(),
  });
}

function renderEditMode(reportId = '10', lineId = '5') {
  return render(
    <MemoryRouter initialEntries={[`/reports/${reportId}/lines/${lineId}/edit`]}>
      <Routes>
        <Route
          path="/reports/:reportId/lines/:lineId/edit"
          element={<ExpenseLineDetailPage />}
        />
        <Route path="/reports/:reportId/edit" element={<div data-testid="edit-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderCreateMode(reportId = '10') {
  return render(
    <MemoryRouter initialEntries={[`/reports/${reportId}/lines/new`]}>
      <Routes>
        <Route path="/reports/:reportId/lines/new" element={<ExpenseLineDetailPage />} />
        <Route path="/reports/:reportId/edit" element={<div data-testid="edit-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

const makeFile = (name = 'receipt.pdf') =>
  new File(['%PDF-1.4 fake'], name, { type: 'application/pdf' });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExpenseLineDetailPage — attachment integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  // -------------------------------------------------------------------------
  // Attachment section visibility
  // -------------------------------------------------------------------------

  describe('attachment section', () => {
    it('shows attachment section in edit mode', async () => {
      mockGetMetadata.mockRejectedValue(new ApiError(404, 'Not found'));
      setupLinesMock();
      renderEditMode();

      await waitFor(() =>
        expect(screen.getByTestId('attachment-section')).toBeInTheDocument(),
      );
    });

    it('does NOT show attachment section in create mode', () => {
      setupLinesMock();
      renderCreateMode();

      expect(screen.queryByTestId('attachment-section')).not.toBeInTheDocument();
    });

    it('fetches attachment metadata on mount in edit mode', async () => {
      mockGetMetadata.mockResolvedValue(attachmentA);
      setupLinesMock();
      renderEditMode();

      await waitFor(() =>
        expect(mockGetMetadata).toHaveBeenCalledWith(10, 5),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Upload flow
  // -------------------------------------------------------------------------

  describe('upload flow', () => {
    it('shows uploaded file metadata after successful upload', async () => {
      // Initially no attachment
      mockGetMetadata.mockRejectedValue(new ApiError(404, 'Not found'));
      mockUpload.mockResolvedValue(attachmentA);
      setupLinesMock();
      renderEditMode();

      await waitFor(() =>
        expect(screen.getByTestId('attachment-section')).toBeInTheDocument(),
      );

      // Upload a file
      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
      await userEvent.upload(fileInput, makeFile('receipt-a.pdf'));

      // After upload success the display component should show the new file name
      await waitFor(() =>
        expect(screen.getByTestId('attachment-filename')).toHaveTextContent('receipt-a.pdf'),
      );
    });

    it('passes correct reportId and lineId to uploadAttachment', async () => {
      mockGetMetadata.mockRejectedValue(new ApiError(404, 'Not found'));
      mockUpload.mockResolvedValue(attachmentA);
      setupLinesMock();
      renderEditMode('10', '5');

      await waitFor(() => expect(screen.getByTestId('attachment-section')).toBeInTheDocument());

      await userEvent.upload(screen.getByTestId('file-input'), makeFile());

      await waitFor(() =>
        expect(mockUpload).toHaveBeenCalledWith(10, 5, expect.any(File), expect.any(Function)),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Delete flow
  // -------------------------------------------------------------------------

  describe('delete flow', () => {
    it('removes attachment display after delete confirmation', async () => {
      mockGetMetadata.mockResolvedValue(attachmentA);
      mockDelete.mockResolvedValue(undefined);

      // After delete, re-fetch returns 404
      mockGetMetadata
        .mockResolvedValueOnce(attachmentA)
        .mockRejectedValueOnce(new ApiError(404, 'Not found'));

      setupLinesMock();
      renderEditMode();

      // Wait for attachment to be displayed
      await waitFor(() =>
        expect(screen.getByTestId('attachment-filename')).toHaveTextContent('receipt-a.pdf'),
      );

      // Click delete
      await userEvent.click(screen.getByTestId('delete-button'));
      // Confirm delete
      await userEvent.click(screen.getByTestId('confirm-delete-button'));

      await waitFor(() =>
        expect(mockDelete).toHaveBeenCalledWith(10, 5),
      );

      // After refresh, no attachment info displayed
      await waitFor(() =>
        expect(screen.queryByTestId('attachment-filename')).not.toBeInTheDocument(),
      );
    });

    it('passes correct reportId and lineId to deleteAttachment', async () => {
      mockGetMetadata.mockResolvedValue(attachmentA);
      mockDelete.mockResolvedValue(undefined);
      mockGetMetadata
        .mockResolvedValueOnce(attachmentA)
        .mockRejectedValueOnce(new ApiError(404, 'Not found'));

      setupLinesMock();
      renderEditMode('10', '5');

      await waitFor(() =>
        expect(screen.getByTestId('delete-button')).not.toBeDisabled(),
      );

      await userEvent.click(screen.getByTestId('delete-button'));
      await userEvent.click(screen.getByTestId('confirm-delete-button'));

      await waitFor(() =>
        expect(mockDelete).toHaveBeenCalledWith(10, 5),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Replacement flow
  // -------------------------------------------------------------------------

  describe('replacement flow', () => {
    it('displays only the second attachment after uploading two files', async () => {
      mockGetMetadata.mockRejectedValue(new ApiError(404, 'Not found'));
      // First upload returns attachmentA, second returns attachmentB
      mockUpload
        .mockResolvedValueOnce(attachmentA)
        .mockResolvedValueOnce(attachmentB);

      setupLinesMock();
      renderEditMode();

      await waitFor(() => expect(screen.getByTestId('attachment-section')).toBeInTheDocument());

      const fileInput = screen.getByTestId('file-input') as HTMLInputElement;

      // Upload A
      await userEvent.upload(fileInput, makeFile('receipt-a.pdf'));
      await waitFor(() =>
        expect(screen.getByTestId('attachment-filename')).toHaveTextContent('receipt-a.pdf'),
      );

      // Upload B (replaces A)
      await userEvent.upload(fileInput, makeFile('receipt-b.pdf'));
      await waitFor(() =>
        expect(screen.getByTestId('attachment-filename')).toHaveTextContent('receipt-b.pdf'),
      );

      // Only one attachment filename shown
      expect(screen.getAllByTestId('attachment-filename')).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Authorization — correct IDs passed to components
  // -------------------------------------------------------------------------

  describe('authorization — correct IDs propagated', () => {
    it('uses reportId 42 and lineId 7 when those are the route params', async () => {
      const line: ExpenseLineResponse = { ...sampleLine, id: 7, report_id: 42 };
      mockUseExpenseLines.mockReturnValue({
        lines: [line],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
        handleCreate: vi.fn(),
        handleUpdate: vi.fn().mockResolvedValue(undefined),
        handleDelete: vi.fn(),
      });
      mockGetMetadata.mockRejectedValue(new ApiError(404, 'Not found'));
      mockUpload.mockResolvedValue(attachmentA);

      renderEditMode('42', '7');

      await waitFor(() => expect(screen.getByTestId('attachment-section')).toBeInTheDocument());

      expect(mockGetMetadata).toHaveBeenCalledWith(42, 7);

      await userEvent.upload(screen.getByTestId('file-input'), makeFile());
      await waitFor(() =>
        expect(mockUpload).toHaveBeenCalledWith(42, 7, expect.any(File), expect.any(Function)),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Displays current attachment on load
  // -------------------------------------------------------------------------

  describe('existing attachment on load', () => {
    it('displays attachment metadata fetched from the API on mount', async () => {
      mockGetMetadata.mockResolvedValue(attachmentA);
      setupLinesMock();
      renderEditMode();

      await waitFor(() =>
        expect(screen.getByTestId('attachment-filename')).toHaveTextContent('receipt-a.pdf'),
      );
      expect(screen.getByTestId('attachment-filesize')).toBeInTheDocument();
    });

    it('shows "No attachment uploaded" when the API returns 404', async () => {
      mockGetMetadata.mockRejectedValue(new ApiError(404, 'Not found'));
      setupLinesMock();
      renderEditMode();

      await waitFor(() =>
        expect(screen.getByTestId('no-attachment-message')).toBeInTheDocument(),
      );
    });
  });
});
