/**
 * Tests for ReportForm component.
 * Requirements: 3.1, 3.4, 3.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportForm } from '../ReportForm';

describe('ReportForm', () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue(undefined);
  });

  it('shows inline validation errors for each field when submitted empty', async () => {
    const user = userEvent.setup();

    render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={false} />);

    await user.click(screen.getByRole('button', { name: /submit report/i }));

    await waitFor(() => {
      expect(screen.getByText('Title is required')).toBeInTheDocument();
      expect(screen.getByText('Amount must be a number')).toBeInTheDocument();
    });

    // description is optional — no required error expected
    expect(screen.queryByText('Purpose is required')).not.toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('shows validation error when total_amount is 0', async () => {
    const user = userEvent.setup();

    render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={false} />);

    await user.type(screen.getByLabelText(/title/i), 'My Report');
    await user.type(screen.getByLabelText(/purpose/i), 'Business travel');
    await user.type(screen.getByLabelText(/total amount/i), '0');

    await user.click(screen.getByRole('button', { name: /submit report/i }));

    await waitFor(() => {
      expect(screen.getByText('Amount must be positive')).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with correct payload when valid data is submitted', async () => {
    const user = userEvent.setup();

    render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={false} />);

    await user.type(screen.getByLabelText(/title/i), 'Q1 Travel');
    await user.type(screen.getByLabelText(/total amount/i), '450.50');

    await user.click(screen.getByRole('button', { name: /submit report/i }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledOnce();
      expect(mockOnSubmit).toHaveBeenCalledWith({
        title: 'Q1 Travel',
        total_amount: 450.50,
        reimbursable_from_client: false,
      });
    });
  });

  it('shows validation error for negative total_amount', async () => {
    const user = userEvent.setup();

    render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={false} />);

    await user.type(screen.getByLabelText(/title/i), 'My Report');
    await user.type(screen.getByLabelText(/purpose/i), 'Business travel');
    await user.type(screen.getByLabelText(/total amount/i), '-10');

    await user.click(screen.getByRole('button', { name: /submit report/i }));

    await waitFor(() => {
      expect(screen.getByText('Amount must be positive')).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('disables the submit button when isSubmitting is true', () => {
    render(<ReportForm onSubmit={mockOnSubmit} isSubmitting={true} />);

    expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();
  });
});
