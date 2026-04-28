/**
 * Tests for ReportForm component.
 * Requirements: 3.1, 3.2, 4.1, 5.1, 5.3, 5.4
 *
 * Covers:
 *  - description field renders as optional (no asterisk / required marker)
 *  - purpose field is gone
 *  - client dropdown is hidden when reimbursable checkbox is unchecked
 *  - client dropdown appears when reimbursable checkbox is checked
 *  - inline error appears when reimbursable=true and no client selected on submit
 *  - valid submission (reimbursable=true + valid client) calls onSubmit with correct payload
 *  - unchecking reimbursable clears the client value before submission
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportForm } from '../ReportForm';

// ---------------------------------------------------------------------------
// Mock useClients so tests don't make real HTTP calls
// ---------------------------------------------------------------------------
vi.mock('../../hooks/useClients');
import { useClients } from '../../hooks/useClients';

const mockUseClients = vi.mocked(useClients);

const SAMPLE_CLIENTS = ['Acme Corp', 'Globex Industries', 'Initech', 'Umbrella Ltd', 'Hooli'];

function mockClientsReady(clients = SAMPLE_CLIENTS) {
  mockUseClients.mockReturnValue({ clients, isLoading: false, error: null });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe('ReportForm', () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue(undefined);
    mockClientsReady();
  });

  // -------------------------------------------------------------------------
  // Field presence
  // -------------------------------------------------------------------------

  describe('field presence', () => {
    it('renders the description field as optional (no asterisk in label)', () => {
      render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      const descriptionField = screen.getByLabelText(/description/i);
      expect(descriptionField).toBeInTheDocument();

      // MUI marks required fields with an asterisk (*) via aria-required on the input.
      // An optional field should NOT have aria-required="true".
      expect(descriptionField).not.toHaveAttribute('aria-required', 'true');
      expect(descriptionField).not.toBeRequired();
    });

    it('does not render a purpose field', () => {
      render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      expect(screen.queryByLabelText(/purpose/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/^purpose$/i)).not.toBeInTheDocument();
    });

    it('renders the reimbursable from client checkbox (unchecked by default)', () => {
      render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      const checkbox = screen.getByRole('checkbox', { name: /reimbursable from client/i });
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).not.toBeChecked();
    });
  });

  // -------------------------------------------------------------------------
  // Client dropdown visibility
  // -------------------------------------------------------------------------

  describe('client dropdown visibility', () => {
    it('hides the client dropdown when reimbursable checkbox is unchecked', () => {
      render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      // Checkbox starts unchecked — client dropdown should not be visible
      expect(screen.queryByLabelText(/^client$/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('shows the client dropdown when reimbursable checkbox is checked', async () => {
      const user = userEvent.setup();
      render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      await user.click(screen.getByRole('checkbox', { name: /reimbursable from client/i }));

      // Client dropdown (MUI Select renders as combobox) should now be visible
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('hides the client dropdown again when reimbursable checkbox is unchecked after being checked', async () => {
      const user = userEvent.setup();
      render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      const checkbox = screen.getByRole('checkbox', { name: /reimbursable from client/i });

      await user.click(checkbox); // check
      expect(screen.getByRole('combobox')).toBeInTheDocument();

      await user.click(checkbox); // uncheck
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Client validation
  // -------------------------------------------------------------------------

  describe('client validation', () => {
    it('shows inline error under client dropdown when reimbursable=true and no client selected on submit', async () => {
      const user = userEvent.setup();
      render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      await user.type(screen.getByLabelText(/title/i), 'Q2 Travel');
      await user.type(screen.getByLabelText(/total amount/i), '500');
      await user.click(screen.getByRole('checkbox', { name: /reimbursable from client/i }));

      // Submit without selecting a client
      await user.click(screen.getByRole('button', { name: /submit report/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/client is required when reimbursable from client is selected/i)
        ).toBeInTheDocument();
      });

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('does not show client error when reimbursable=false and no client selected', async () => {
      const user = userEvent.setup();
      render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      await user.type(screen.getByLabelText(/title/i), 'Q2 Travel');
      await user.type(screen.getByLabelText(/total amount/i), '500');

      await user.click(screen.getByRole('button', { name: /submit report/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledOnce();
      });

      expect(
        screen.queryByText(/client is required/i)
      ).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Valid submission with reimbursable=true + client
  // -------------------------------------------------------------------------

  describe('valid submission with reimbursable=true and a valid client', () => {
    it('calls onSubmit with correct payload including client', async () => {
      const user = userEvent.setup();
      render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      await user.type(screen.getByLabelText(/title/i), 'Q2 Travel');
      await user.type(screen.getByLabelText(/total amount/i), '850');
      await user.click(screen.getByRole('checkbox', { name: /reimbursable from client/i }));

      // Open the MUI Select and pick a client
      await user.click(screen.getByRole('combobox'));
      const listbox = await screen.findByRole('listbox');
      await user.click(within(listbox).getByText('Acme Corp'));

      await user.click(screen.getByRole('button', { name: /submit report/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledOnce();
        expect(mockOnSubmit).toHaveBeenCalledWith({
          title: 'Q2 Travel',
          total_amount: 850,
          reimbursable_from_client: true,
          client: 'Acme Corp',
        });
      });
    });

    it('populates the client dropdown with values from useClients', async () => {
      const user = userEvent.setup();
      render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      await user.click(screen.getByRole('checkbox', { name: /reimbursable from client/i }));
      await user.click(screen.getByRole('combobox'));

      const listbox = await screen.findByRole('listbox');
      for (const clientName of SAMPLE_CLIENTS) {
        expect(within(listbox).getByText(clientName)).toBeInTheDocument();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Unchecking reimbursable clears client before submission
  // -------------------------------------------------------------------------

  describe('unchecking reimbursable clears client value', () => {
    it('submits without client when reimbursable is unchecked after selecting a client', async () => {
      const user = userEvent.setup();
      render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      await user.type(screen.getByLabelText(/title/i), 'Q2 Travel');
      await user.type(screen.getByLabelText(/total amount/i), '500');

      const checkbox = screen.getByRole('checkbox', { name: /reimbursable from client/i });

      // Check and select a client
      await user.click(checkbox);
      await user.click(screen.getByRole('combobox'));
      const listbox = await screen.findByRole('listbox');
      await user.click(within(listbox).getByText('Acme Corp'));

      // Uncheck — client dropdown disappears and value is cleared
      await user.click(checkbox);
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /submit report/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledOnce();
        const payload = mockOnSubmit.mock.calls[0][0];
        expect(payload.reimbursable_from_client).toBe(false);
        expect(payload.client).toBeUndefined();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Existing validation still works
  // -------------------------------------------------------------------------

  describe('existing field validation', () => {
    it('shows inline validation errors when submitted with empty title and amount', async () => {
      const user = userEvent.setup();
      render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      await user.click(screen.getByRole('button', { name: /submit report/i }));

      await waitFor(() => {
        expect(screen.getByText('Title is required')).toBeInTheDocument();
        expect(screen.getByText('Amount must be a number')).toBeInTheDocument();
      });

      // description is optional — no required error expected
      expect(screen.queryByText(/description is required/i)).not.toBeInTheDocument();
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('shows validation error when total_amount is 0', async () => {
      const user = userEvent.setup();
      render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      await user.type(screen.getByLabelText(/title/i), 'My Report');
      await user.type(screen.getByLabelText(/total amount/i), '0');

      await user.click(screen.getByRole('button', { name: /submit report/i }));

      await waitFor(() => {
        expect(screen.getByText('Amount must be positive')).toBeInTheDocument();
      });

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('calls onSubmit with correct payload when valid data is submitted (no reimbursable)', async () => {
      const user = userEvent.setup();
      render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={false} />);

      await user.type(screen.getByLabelText(/title/i), 'Q1 Travel');
      await user.type(screen.getByLabelText(/total amount/i), '450.50');

      await user.click(screen.getByRole('button', { name: /submit report/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledOnce();
        expect(mockOnSubmit).toHaveBeenCalledWith({
          title: 'Q1 Travel',
          total_amount: 450.5,
          reimbursable_from_client: false,
        });
      });
    });

    it('disables the submit button when isSubmitting is true', () => {
      render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={true} />);

      expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();
    });
  });
});
