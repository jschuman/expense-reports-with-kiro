/**
 * Property-based tests for ReportForm component using fast-check.
 * Validates: Property 7 (frontend side) — Requirements 3.4, 3.5
 *
 * Property 7: Zod and Pydantic validation agree on valid inputs.
 * For any form input that passes Zod client-side validation, the equivalent
 * request body SHALL also pass Pydantic server-side validation.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';
import { ReportForm } from '../ReportForm';

// Clean up the DOM between each property run to avoid stale elements
afterEach(() => {
  cleanup();
});

/**
 * Render the form, fill fields via fireEvent (synchronous, fast), and submit.
 * Uses screen.getByLabelText which works reliably with MUI TextField.
 */
async function renderFillAndSubmit({
  title,
  purpose,
  amount,
  onSubmit,
}: {
  title: string;
  purpose: string;
  amount: string;
  onSubmit: ReturnType<typeof vi.fn>;
}) {
  render(<ReportForm onSubmit={onSubmit} isSubmitting={false} />);

  await act(async () => {
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: title } });
    fireEvent.change(screen.getByLabelText(/purpose/i), { target: { value: purpose } });
    fireEvent.change(screen.getByLabelText(/total amount/i), { target: { value: amount } });
    fireEvent.submit(screen.getByRole('button', { name: /submit report/i }).closest('form')!);
  });
}

describe('ReportForm property-based tests', () => {
  /**
   * Property 7 (valid side): For any non-empty title, non-empty purpose, and
   * positive amount, Zod accepts the input and onSubmit IS called.
   * Validates: Requirements 3.4, 3.5
   */
  it(
    'calls onSubmit for any valid input (non-empty strings, positive amount)',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 255 }).filter((s) => s.trim().length > 0),
          fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          fc.double({ min: 0.01, max: 1_000_000, noNaN: true }),
          async (title, purpose, amount) => {
            const mockOnSubmit = vi.fn().mockResolvedValue(undefined);

            await renderFillAndSubmit({
              title,
              purpose,
              amount: String(amount),
              onSubmit: mockOnSubmit,
            });

            await waitFor(() => {
              expect(mockOnSubmit).toHaveBeenCalledOnce();
            });

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000 // 100 async iterations need more than the default 5s
  );

  /**
   * Property 7 (invalid title): For any empty title, Zod rejects the input
   * and onSubmit is NOT called.
   * Validates: Requirements 3.4, 3.5
   */
  it(
    'does NOT call onSubmit when title is empty',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          fc.double({ min: 0.01, max: 1_000_000, noNaN: true }),
          async (purpose, amount) => {
            const mockOnSubmit = vi.fn().mockResolvedValue(undefined);

            await renderFillAndSubmit({
              title: '',
              purpose,
              amount: String(amount),
              onSubmit: mockOnSubmit,
            });

            await waitFor(() => {
              expect(screen.getByText('Title is required')).toBeInTheDocument();
            });

            expect(mockOnSubmit).not.toHaveBeenCalled();

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );

  /**
   * Property 7 (invalid amount): For any non-positive amount (zero or negative),
   * Zod rejects the input and onSubmit is NOT called.
   * Validates: Requirements 3.4, 3.5
   */
  it(
    'does NOT call onSubmit when total_amount is non-positive',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 255 }).filter((s) => s.trim().length > 0),
          fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          fc.oneof(
            fc.constant(0),
            fc.double({ min: -1_000_000, max: -0.001, noNaN: true })
          ),
          async (title, purpose, amount) => {
            const mockOnSubmit = vi.fn().mockResolvedValue(undefined);

            await renderFillAndSubmit({
              title,
              purpose,
              amount: String(amount),
              onSubmit: mockOnSubmit,
            });

            await waitFor(() => {
              expect(screen.getByText('Amount must be positive')).toBeInTheDocument();
            });

            expect(mockOnSubmit).not.toHaveBeenCalled();

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    },
    30_000
  );
});
