/**
 * Unit tests for MissingAttachmentWarningDialog.
 *
 * Requirements: 5.2, 5.3, 5.4, 5.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MissingAttachmentWarningDialog } from '../MissingAttachmentWarningDialog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  open: true,
  missingCount: 3,
  onAddAttachments: vi.fn(),
  onSubmitWithout: vi.fn(),
};

function renderDialog(overrides: Partial<typeof defaultProps> = {}) {
  return render(<MissingAttachmentWarningDialog {...defaultProps} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MissingAttachmentWarningDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Visibility
  // -------------------------------------------------------------------------

  describe('visibility', () => {
    it('renders the dialog when open is true', () => {
      renderDialog();
      expect(screen.getByTestId('missing-attachment-dialog')).toBeInTheDocument();
    });

    it('does not render dialog content when open is false', () => {
      renderDialog({ open: false });
      expect(screen.queryByTestId('missing-attachment-message')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Message content
  // -------------------------------------------------------------------------

  describe('message content', () => {
    it('displays the correct count of missing attachments (plural)', () => {
      renderDialog({ missingCount: 3 });
      const message = screen.getByTestId('missing-attachment-message');
      expect(message).toHaveTextContent('3');
    });

    it('displays singular wording when missingCount is 1', () => {
      renderDialog({ missingCount: 1 });
      const message = screen.getByTestId('missing-attachment-message');
      expect(message).toHaveTextContent('1');
      expect(message).toHaveTextContent(/line is missing an attachment/i);
    });

    it('displays plural wording when missingCount is more than 1', () => {
      renderDialog({ missingCount: 5 });
      const message = screen.getByTestId('missing-attachment-message');
      expect(message).toHaveTextContent('5');
      expect(message).toHaveTextContent(/lines are missing attachments/i);
    });

    it('displays the dialog title', () => {
      renderDialog();
      expect(screen.getByText('Missing Attachments')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Buttons present
  // -------------------------------------------------------------------------

  describe('button rendering', () => {
    it('renders the "Add Attachments" button', () => {
      renderDialog();
      expect(screen.getByTestId('add-attachments-button')).toBeInTheDocument();
      expect(screen.getByText('Add Attachments')).toBeInTheDocument();
    });

    it('renders the "Submit Without Attachments" button', () => {
      renderDialog();
      expect(screen.getByTestId('submit-without-button')).toBeInTheDocument();
      expect(screen.getByText('Submit Without Attachments')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Callbacks
  // -------------------------------------------------------------------------

  describe('callbacks', () => {
    it('calls onAddAttachments when "Add Attachments" is clicked', async () => {
      const onAddAttachments = vi.fn();
      renderDialog({ onAddAttachments });

      await userEvent.click(screen.getByTestId('add-attachments-button'));

      expect(onAddAttachments).toHaveBeenCalledOnce();
    });

    it('does not call onSubmitWithout when "Add Attachments" is clicked', async () => {
      const onSubmitWithout = vi.fn();
      renderDialog({ onSubmitWithout });

      await userEvent.click(screen.getByTestId('add-attachments-button'));

      expect(onSubmitWithout).not.toHaveBeenCalled();
    });

    it('calls onSubmitWithout when "Submit Without Attachments" is clicked', async () => {
      const onSubmitWithout = vi.fn();
      renderDialog({ onSubmitWithout });

      await userEvent.click(screen.getByTestId('submit-without-button'));

      expect(onSubmitWithout).toHaveBeenCalledOnce();
    });

    it('does not call onAddAttachments when "Submit Without Attachments" is clicked', async () => {
      const onAddAttachments = vi.fn();
      renderDialog({ onAddAttachments });

      await userEvent.click(screen.getByTestId('submit-without-button'));

      expect(onAddAttachments).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('renders correctly with missingCount of 0', () => {
      renderDialog({ missingCount: 0 });
      expect(screen.getByTestId('missing-attachment-message')).toHaveTextContent('0');
    });

    it('renders correctly with a large missingCount', () => {
      renderDialog({ missingCount: 100 });
      expect(screen.getByTestId('missing-attachment-message')).toHaveTextContent('100');
    });
  });
});
