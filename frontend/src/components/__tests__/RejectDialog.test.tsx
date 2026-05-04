/**
 * Tests for RejectDialog component.
 * Requirements: 6.1, 6.2
 *
 * Covers:
 *  - Confirm button is disabled when admin_notes is empty
 *  - Confirm button is disabled when admin_notes is whitespace only
 *  - Confirm button is enabled when admin_notes is non-empty
 *  - Clicking Confirm calls onConfirm with the trimmed notes value
 *  - Clicking Cancel calls onClose without calling onConfirm
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RejectDialog } from '../RejectDialog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDialog(overrides: { open?: boolean } = {}) {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  const { rerender } = render(
    <RejectDialog
      open={overrides.open ?? true}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
  return { onClose, onConfirm, rerender };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RejectDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Confirm button disabled state
  // -------------------------------------------------------------------------

  describe('Confirm button disabled state', () => {
    it('is disabled when admin_notes is empty (initial state)', () => {
      renderDialog();
      const confirmButton = screen.getByRole('button', { name: /confirm/i });
      expect(confirmButton).toBeDisabled();
    });

    it('is disabled when admin_notes contains only spaces', async () => {
      const user = userEvent.setup();
      renderDialog();

      const textarea = screen.getByLabelText(/admin notes/i);
      await user.type(textarea, '   ');

      const confirmButton = screen.getByRole('button', { name: /confirm/i });
      expect(confirmButton).toBeDisabled();
    });

    it('is disabled when admin_notes contains only tab characters', async () => {
      const user = userEvent.setup();
      renderDialog();

      const textarea = screen.getByLabelText(/admin notes/i);
      await user.type(textarea, '\t\t');

      const confirmButton = screen.getByRole('button', { name: /confirm/i });
      expect(confirmButton).toBeDisabled();
    });

    it('is disabled when admin_notes contains only newlines', async () => {
      const user = userEvent.setup();
      renderDialog();

      const textarea = screen.getByLabelText(/admin notes/i);
      await user.type(textarea, '\n\n');

      const confirmButton = screen.getByRole('button', { name: /confirm/i });
      expect(confirmButton).toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // Confirm button enabled state
  // -------------------------------------------------------------------------

  describe('Confirm button enabled state', () => {
    it('is enabled when admin_notes contains at least one non-whitespace character', async () => {
      const user = userEvent.setup();
      renderDialog();

      const textarea = screen.getByLabelText(/admin notes/i);
      await user.type(textarea, 'Missing receipts');

      const confirmButton = screen.getByRole('button', { name: /confirm/i });
      expect(confirmButton).toBeEnabled();
    });

    it('is enabled when admin_notes has leading/trailing whitespace around real content', async () => {
      const user = userEvent.setup();
      renderDialog();

      const textarea = screen.getByLabelText(/admin notes/i);
      await user.type(textarea, '  valid note  ');

      const confirmButton = screen.getByRole('button', { name: /confirm/i });
      expect(confirmButton).toBeEnabled();
    });
  });

  // -------------------------------------------------------------------------
  // Confirm action
  // -------------------------------------------------------------------------

  describe('Confirm action', () => {
    it('calls onConfirm with the trimmed notes value when Confirm is clicked', async () => {
      const user = userEvent.setup();
      const { onConfirm } = renderDialog();

      const textarea = screen.getByLabelText(/admin notes/i);
      await user.type(textarea, '  Missing receipts  ');

      const confirmButton = screen.getByRole('button', { name: /confirm/i });
      await user.click(confirmButton);

      expect(onConfirm).toHaveBeenCalledOnce();
      expect(onConfirm).toHaveBeenCalledWith('Missing receipts');
    });

    it('calls onConfirm with trimmed value (no surrounding whitespace)', async () => {
      const user = userEvent.setup();
      const { onConfirm } = renderDialog();

      const textarea = screen.getByLabelText(/admin notes/i);
      await user.type(textarea, '   Amount exceeds policy limit   ');

      await user.click(screen.getByRole('button', { name: /confirm/i }));

      expect(onConfirm).toHaveBeenCalledWith('Amount exceeds policy limit');
    });

    it('does not call onConfirm when Confirm button is disabled', () => {
      const { onConfirm } = renderDialog();

      // Do not type anything — button should be disabled and onConfirm unreachable
      const confirmButton = screen.getByRole('button', { name: /confirm/i });
      expect(confirmButton).toBeDisabled();
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Cancel action
  // -------------------------------------------------------------------------

  describe('Cancel action', () => {
    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup();
      const { onClose } = renderDialog();

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onClose).toHaveBeenCalledOnce();
    });

    it('does not call onConfirm when Cancel is clicked', async () => {
      const user = userEvent.setup();
      const { onConfirm } = renderDialog();

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('calls onClose even when admin_notes has content', async () => {
      const user = userEvent.setup();
      const { onClose, onConfirm } = renderDialog();

      const textarea = screen.getByLabelText(/admin notes/i);
      await user.type(textarea, 'Some notes');

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onClose).toHaveBeenCalledOnce();
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Dialog visibility
  // -------------------------------------------------------------------------

  describe('dialog visibility', () => {
    it('renders the dialog title when open', () => {
      renderDialog({ open: true });
      expect(screen.getByText(/reject expense report/i)).toBeInTheDocument();
    });

    it('does not render dialog content when closed', () => {
      renderDialog({ open: false });
      expect(screen.queryByText(/reject expense report/i)).not.toBeInTheDocument();
    });
  });
});
