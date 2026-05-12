/**
 * Unit tests for AttachmentDisplayComponent.
 *
 * deleteAttachment() and downloadAttachment() are mocked so tests never make
 * real HTTP calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttachmentDisplayComponent } from '../AttachmentDisplayComponent';
import type { AttachmentMetadata } from '../../types/attachments';

// ---------------------------------------------------------------------------
// Mock the API module
// ---------------------------------------------------------------------------

vi.mock('../../api/attachments');
import { deleteAttachment, downloadAttachment } from '../../api/attachments';

const mockDeleteAttachment = vi.mocked(deleteAttachment);
const mockDownloadAttachment = vi.mocked(downloadAttachment);

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleAttachment: AttachmentMetadata = {
  id: 1,
  file_name: 'receipt.pdf',
  file_size: 102400,
  mime_type: 'application/pdf',
  created_at: '2026-05-12T10:00:00Z',
};

// ---------------------------------------------------------------------------
// Default props helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  reportId: 10,
  lineId: 5,
  attachment: sampleAttachment,
  onRefresh: vi.fn(),
};

function renderWithAttachment(overrides: Partial<typeof defaultProps> = {}) {
  return render(<AttachmentDisplayComponent {...defaultProps} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AttachmentDisplayComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Metadata display
  // -------------------------------------------------------------------------

  describe('metadata display', () => {
    it('displays attachment metadata when attachment is present', () => {
      renderWithAttachment();

      expect(screen.getByTestId('attachment-info')).toBeInTheDocument();
      expect(screen.getByTestId('attachment-filename')).toHaveTextContent('receipt.pdf');
    });

    it('displays the formatted file size', () => {
      renderWithAttachment();
      // 102400 bytes → 100.0 KB
      expect(screen.getByTestId('attachment-filesize')).toHaveTextContent('100.0 KB');
    });

    it('displays the upload timestamp', () => {
      renderWithAttachment();
      expect(screen.getByTestId('attachment-date')).toHaveTextContent(/Uploaded/i);
    });

    it('shows "No attachment uploaded." when attachment is null', () => {
      renderWithAttachment({ attachment: null });
      expect(screen.getByTestId('no-attachment-message')).toBeInTheDocument();
      expect(screen.queryByTestId('attachment-info')).not.toBeInTheDocument();
    });

    it('does not show error message initially', () => {
      renderWithAttachment();
      expect(screen.queryByTestId('error-message')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Download button
  // -------------------------------------------------------------------------

  describe('download button', () => {
    it('is enabled when attachment is present', () => {
      renderWithAttachment();
      expect(screen.getByTestId('download-button')).not.toBeDisabled();
    });

    it('is disabled when no attachment exists', () => {
      renderWithAttachment({ attachment: null });
      expect(screen.getByTestId('download-button')).toBeDisabled();
    });

    it('calls downloadAttachment when clicked', async () => {
      mockDownloadAttachment.mockResolvedValue(undefined);
      renderWithAttachment();

      await userEvent.click(screen.getByTestId('download-button'));

      expect(mockDownloadAttachment).toHaveBeenCalledWith(10, 5);
    });

    it('shows error message when download fails', async () => {
      mockDownloadAttachment.mockRejectedValue(new Error('Download failed'));
      renderWithAttachment();

      await userEvent.click(screen.getByTestId('download-button'));

      await waitFor(() =>
        expect(screen.getByTestId('error-message')).toBeInTheDocument(),
      );
      expect(screen.getByTestId('error-message')).toHaveTextContent('Download failed');
    });
  });

  // -------------------------------------------------------------------------
  // Delete button
  // -------------------------------------------------------------------------

  describe('delete button', () => {
    it('is enabled when attachment is present', () => {
      renderWithAttachment();
      expect(screen.getByTestId('delete-button')).not.toBeDisabled();
    });

    it('is disabled when no attachment exists', () => {
      renderWithAttachment({ attachment: null });
      expect(screen.getByTestId('delete-button')).toBeDisabled();
    });

    it('opens the confirmation dialog when clicked', async () => {
      renderWithAttachment();

      // Dialog not yet open — confirm button is not rendered
      expect(screen.queryByTestId('confirm-delete-button')).not.toBeInTheDocument();

      await userEvent.click(screen.getByTestId('delete-button'));

      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('confirm-delete-button')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Confirmation dialog
  // -------------------------------------------------------------------------

  describe('confirmation dialog', () => {
    it('does not delete when "Cancel" is clicked', async () => {
      renderWithAttachment();

      await userEvent.click(screen.getByTestId('delete-button'));
      await userEvent.click(screen.getByTestId('cancel-delete-button'));

      expect(mockDeleteAttachment).not.toHaveBeenCalled();
      // After cancel the dialog is closed — confirm button leaves the DOM
      await waitFor(() =>
        expect(screen.queryByTestId('confirm-delete-button')).not.toBeInTheDocument(),
      );
    });

    it('calls deleteAttachment and onRefresh when "Delete" is confirmed', async () => {
      mockDeleteAttachment.mockResolvedValue(undefined);
      const onRefresh = vi.fn();
      renderWithAttachment({ onRefresh });

      await userEvent.click(screen.getByTestId('delete-button'));
      await userEvent.click(screen.getByTestId('confirm-delete-button'));

      await waitFor(() => expect(onRefresh).toHaveBeenCalled());
      expect(mockDeleteAttachment).toHaveBeenCalledWith(10, 5);
    });

    it('shows error message when delete fails', async () => {
      mockDeleteAttachment.mockRejectedValue(new Error('Server error'));
      renderWithAttachment();

      await userEvent.click(screen.getByTestId('delete-button'));
      await userEvent.click(screen.getByTestId('confirm-delete-button'));

      await waitFor(() =>
        expect(screen.getByTestId('error-message')).toBeInTheDocument(),
      );
      expect(screen.getByTestId('error-message')).toHaveTextContent('Server error');
    });

    it('does not call onRefresh when delete fails', async () => {
      mockDeleteAttachment.mockRejectedValue(new Error('Server error'));
      const onRefresh = vi.fn();
      renderWithAttachment({ onRefresh });

      await userEvent.click(screen.getByTestId('delete-button'));
      await userEvent.click(screen.getByTestId('confirm-delete-button'));

      await waitFor(() =>
        expect(screen.getByTestId('error-message')).toBeInTheDocument(),
      );
      expect(onRefresh).not.toHaveBeenCalled();
    });

    it('displays the attachment file name in the dialog', async () => {
      renderWithAttachment();

      await userEvent.click(screen.getByTestId('delete-button'));

      expect(screen.getByTestId('confirm-dialog')).toHaveTextContent('receipt.pdf');
    });
  });

  // -------------------------------------------------------------------------
  // Missing attachment graceful handling
  // -------------------------------------------------------------------------

  describe('graceful handling of missing attachment', () => {
    it('renders without errors when attachment is null', () => {
      expect(() => renderWithAttachment({ attachment: null })).not.toThrow();
    });

    it('renders without errors when attachment is present', () => {
      expect(() => renderWithAttachment()).not.toThrow();
    });
  });
});
