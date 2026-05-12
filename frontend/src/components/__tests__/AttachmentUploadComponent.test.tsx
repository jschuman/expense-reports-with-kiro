/**
 * Unit tests for AttachmentUploadComponent.
 *
 * uploadAttachment() is mocked so tests never make real HTTP calls.
 * userEvent is used for all interactions (drag-and-drop, clicks, file selection).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttachmentUploadComponent } from '../AttachmentUploadComponent';
import type { AttachmentMetadata, AttachmentUploadError } from '../../types/attachments';

// ---------------------------------------------------------------------------
// Mock the API module
// ---------------------------------------------------------------------------

vi.mock('../../api/attachments');
import { uploadAttachment } from '../../api/attachments';

const mockUploadAttachment = vi.mocked(uploadAttachment);

// ---------------------------------------------------------------------------
// Shared sample data
// ---------------------------------------------------------------------------

const sampleMetadata: AttachmentMetadata = {
  id: 1,
  file_name: 'receipt.pdf',
  file_size: 12345,
  mime_type: 'application/pdf',
  created_at: '2026-05-12T10:00:00Z',
};

const makeFile = (name = 'receipt.pdf', type = 'application/pdf') =>
  new File(['%PDF-1.4 fake'], name, { type });

// ---------------------------------------------------------------------------
// Default props
// ---------------------------------------------------------------------------

const defaultProps = {
  reportId: 10,
  lineId: 5,
  onUploadSuccess: vi.fn(),
  onUploadError: vi.fn(),
};

function renderComponent(props = defaultProps) {
  return render(<AttachmentUploadComponent {...props} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AttachmentUploadComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  describe('rendering', () => {
    it('renders the hidden file input', () => {
      renderComponent();
      const input = screen.getByTestId('file-input');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'file');
    });

    it('renders the drag-and-drop zone', () => {
      renderComponent();
      expect(screen.getByTestId('drop-zone')).toBeInTheDocument();
    });

    it('renders the "Choose File" button', () => {
      renderComponent();
      expect(screen.getByTestId('upload-button')).toBeInTheDocument();
      expect(screen.getByText('Choose File')).toBeInTheDocument();
    });

    it('does not show the progress indicator initially', () => {
      renderComponent();
      expect(screen.queryByTestId('progress-indicator')).not.toBeInTheDocument();
    });

    it('does not show an error message initially', () => {
      renderComponent();
      expect(screen.queryByTestId('error-message')).not.toBeInTheDocument();
    });

    it('displays accepted file type description', () => {
      renderComponent();
      expect(screen.getByText(/Accepted:/i)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // File picker selection
  // -------------------------------------------------------------------------

  describe('file picker selection', () => {
    it('triggers upload when a file is selected via the file input', async () => {
      mockUploadAttachment.mockResolvedValue(sampleMetadata);
      const onSuccess = vi.fn();
      render(
        <AttachmentUploadComponent
          {...defaultProps}
          onUploadSuccess={onSuccess}
        />,
      );

      const input = screen.getByTestId('file-input') as HTMLInputElement;
      const file = makeFile();
      await userEvent.upload(input, file);

      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(sampleMetadata));
      expect(mockUploadAttachment).toHaveBeenCalledWith(10, 5, file, expect.any(Function));
    });

    it('calls onUploadSuccess with the metadata returned by the API', async () => {
      mockUploadAttachment.mockResolvedValue(sampleMetadata);
      const onSuccess = vi.fn();
      render(
        <AttachmentUploadComponent {...defaultProps} onUploadSuccess={onSuccess} />,
      );

      const input = screen.getByTestId('file-input') as HTMLInputElement;
      await userEvent.upload(input, makeFile());

      await waitFor(() =>
        expect(onSuccess).toHaveBeenCalledWith(sampleMetadata),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Drag-and-drop
  // -------------------------------------------------------------------------

  describe('drag-and-drop', () => {
    it('triggers upload when a file is dropped onto the drop zone', async () => {
      mockUploadAttachment.mockResolvedValue(sampleMetadata);
      const onSuccess = vi.fn();
      render(
        <AttachmentUploadComponent {...defaultProps} onUploadSuccess={onSuccess} />,
      );

      const dropZone = screen.getByTestId('drop-zone');
      const file = makeFile('invoice.pdf');

      // Simulate drop event with dataTransfer
      const dropEvent = new Event('drop', { bubbles: true }) as DragEvent & {
        dataTransfer: DataTransfer;
      };
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: { files: [file] },
      });
      dropZone.dispatchEvent(dropEvent);

      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(sampleMetadata));
      expect(mockUploadAttachment).toHaveBeenCalledWith(10, 5, file, expect.any(Function));
    });

    it('does not trigger upload when no file is in the drop event', async () => {
      renderComponent();
      const dropZone = screen.getByTestId('drop-zone');

      const dropEvent = new Event('drop', { bubbles: true }) as DragEvent & {
        dataTransfer: DataTransfer;
      };
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: { files: [] },
      });
      dropZone.dispatchEvent(dropEvent);

      await new Promise((r) => setTimeout(r, 50));
      expect(mockUploadAttachment).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Progress indicator
  // -------------------------------------------------------------------------

  describe('progress indicator', () => {
    it('shows the progress indicator while upload is in progress', async () => {
      // Capture the onProgress callback so we can control progress updates
      let capturedOnProgress: ((pct: number) => void) | undefined;

      mockUploadAttachment.mockImplementation(
        (_reportId, _lineId, _file, onProgress) => {
          capturedOnProgress = onProgress;
          // Never resolves during this test
          return new Promise(() => {});
        },
      );

      renderComponent();
      const input = screen.getByTestId('file-input') as HTMLInputElement;
      await userEvent.upload(input, makeFile());

      // Before any progress fires, the indicator is already shown
      await waitFor(() =>
        expect(screen.getByTestId('progress-indicator')).toBeInTheDocument(),
      );

      // Simulate progress
      capturedOnProgress?.(50);
      await waitFor(() => expect(screen.getByText(/50%/)).toBeInTheDocument());
    });

    it('hides the progress indicator after upload completes', async () => {
      mockUploadAttachment.mockResolvedValue(sampleMetadata);
      renderComponent();

      const input = screen.getByTestId('file-input') as HTMLInputElement;
      await userEvent.upload(input, makeFile());

      await waitFor(() =>
        expect(screen.queryByTestId('progress-indicator')).not.toBeInTheDocument(),
      );
    });

    it('hides the progress indicator after upload fails', async () => {
      const uploadError: AttachmentUploadError = {
        type: 'FILE_TOO_LARGE',
        message: 'Too large',
      };
      mockUploadAttachment.mockRejectedValue(uploadError);
      renderComponent();

      const input = screen.getByTestId('file-input') as HTMLInputElement;
      await userEvent.upload(input, makeFile());

      await waitFor(() =>
        expect(screen.queryByTestId('progress-indicator')).not.toBeInTheDocument(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Error messages
  // -------------------------------------------------------------------------

  describe('error messages', () => {
    it('displays an error message when upload fails', async () => {
      const uploadError: AttachmentUploadError = {
        type: 'FILE_TOO_LARGE',
        message: 'File too large',
      };
      mockUploadAttachment.mockRejectedValue(uploadError);
      renderComponent();

      const input = screen.getByTestId('file-input') as HTMLInputElement;
      await userEvent.upload(input, makeFile());

      await waitFor(() =>
        expect(screen.getByTestId('error-message')).toBeInTheDocument(),
      );
      expect(
        within(screen.getByTestId('error-message')).getByText(/10 MB/i),
      ).toBeInTheDocument();
    });

    it('displays INVALID_FILE_TYPE error message', async () => {
      mockUploadAttachment.mockRejectedValue({
        type: 'INVALID_FILE_TYPE',
        message: 'Bad type',
      } satisfies AttachmentUploadError);
      renderComponent();

      await userEvent.upload(screen.getByTestId('file-input'), makeFile());

      await waitFor(() =>
        expect(screen.getByText(/File type not allowed/i)).toBeInTheDocument(),
      );
    });

    it('displays INVALID_CONTENT error message', async () => {
      mockUploadAttachment.mockRejectedValue({
        type: 'INVALID_CONTENT',
        message: 'Content mismatch',
      } satisfies AttachmentUploadError);
      renderComponent();

      await userEvent.upload(screen.getByTestId('file-input'), makeFile());

      await waitFor(() =>
        expect(screen.getByText(/file content does not match/i)).toBeInTheDocument(),
      );
    });

    it('displays NETWORK_ERROR error message', async () => {
      mockUploadAttachment.mockRejectedValue({
        type: 'NETWORK_ERROR',
        message: 'Network fail',
      } satisfies AttachmentUploadError);
      renderComponent();

      await userEvent.upload(screen.getByTestId('file-input'), makeFile());

      await waitFor(() =>
        expect(screen.getByText(/network error/i)).toBeInTheDocument(),
      );
    });

    it('displays UNAUTHORIZED error message', async () => {
      mockUploadAttachment.mockRejectedValue({
        type: 'UNAUTHORIZED',
        message: 'Not authenticated',
      } satisfies AttachmentUploadError);
      renderComponent();

      await userEvent.upload(screen.getByTestId('file-input'), makeFile());

      await waitFor(() =>
        expect(screen.getByText(/not authenticated/i)).toBeInTheDocument(),
      );
    });

    it('displays FORBIDDEN error message', async () => {
      mockUploadAttachment.mockRejectedValue({
        type: 'FORBIDDEN',
        message: 'No permission',
      } satisfies AttachmentUploadError);
      renderComponent();

      await userEvent.upload(screen.getByTestId('file-input'), makeFile());

      await waitFor(() =>
        expect(screen.getByText(/do not have permission/i)).toBeInTheDocument(),
      );
    });

    it('calls onUploadError callback when upload fails', async () => {
      const uploadError: AttachmentUploadError = {
        type: 'FILE_TOO_LARGE',
        message: 'File too large',
      };
      mockUploadAttachment.mockRejectedValue(uploadError);
      const onError = vi.fn();
      render(<AttachmentUploadComponent {...defaultProps} onUploadError={onError} />);

      await userEvent.upload(screen.getByTestId('file-input'), makeFile());

      await waitFor(() => expect(onError).toHaveBeenCalledWith(uploadError));
    });

    it('clears the previous error message when a new upload starts', async () => {
      // First upload fails
      const uploadError: AttachmentUploadError = {
        type: 'FILE_TOO_LARGE',
        message: 'File too large',
      };
      mockUploadAttachment.mockRejectedValueOnce(uploadError);

      renderComponent();
      const input = screen.getByTestId('file-input') as HTMLInputElement;
      await userEvent.upload(input, makeFile());
      await waitFor(() => expect(screen.getByTestId('error-message')).toBeInTheDocument());

      // Second upload succeeds → error should disappear during upload
      let resolveFn!: (v: AttachmentMetadata) => void;
      mockUploadAttachment.mockReturnValueOnce(
        new Promise<AttachmentMetadata>((res) => {
          resolveFn = res;
        }),
      );
      await userEvent.upload(input, makeFile('second.pdf'));
      // Error cleared immediately when upload starts
      await waitFor(() => expect(screen.queryByTestId('error-message')).not.toBeInTheDocument());

      resolveFn(sampleMetadata);
    });
  });

  // -------------------------------------------------------------------------
  // Disabled state during upload
  // -------------------------------------------------------------------------

  describe('disabled state', () => {
    it('disables the "Choose File" button while uploading', async () => {
      mockUploadAttachment.mockImplementation(() => new Promise(() => {}));

      renderComponent();
      const input = screen.getByTestId('file-input') as HTMLInputElement;
      await userEvent.upload(input, makeFile());

      await waitFor(() =>
        expect(screen.getByTestId('upload-button')).toBeDisabled(),
      );
    });
  });
});
