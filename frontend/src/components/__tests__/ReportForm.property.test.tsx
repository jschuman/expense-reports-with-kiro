/**
 * Property-based tests for ReportForm component using fast-check.
 *
 * Property 7 (frontend side): For any form input that passes Zod client-side
 * validation, the equivalent request body SHALL also pass Pydantic server-side
 * validation.
 * Validates: Requirements 3.2, 3.4, 4.1, 5.3
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';
import { ReportForm } from '../ReportForm';

// ---------------------------------------------------------------------------
// Mock useClients so property tests don't make real HTTP calls
// ---------------------------------------------------------------------------
vi.mock('../../hooks/useClients');
import { useClients } from '../../hooks/useClients';

const mockUseClients = vi.mocked(useClients);

const SAMPLE_CLIENTS = ['Acme Corp', 'Globex Industries', 'Initech', 'Umbrella Ltd', 'Hooli'];

beforeEach(() => {
  mockUseClients.mockReturnValue({ clients: SAMPLE_CLIENTS, isLoading: false, error: null });
});

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
  description,
  onSubmit,
}: {
  title: string;
  description: string;
  onSubmit: ReturnType<typeof vi.fn>;
}) {
  render(<ReportForm onSubmit={onSubmit} isSubmitting={false} />);

  await act(async () => {
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: title } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: description } });
    fireEvent.submit(screen.getByRole('button', { name: /submit report/i }).closest('form')!);
  });
}

describe('ReportForm property-based tests', () => {
  /**
   * Property 7 (valid side): For any non-empty title and any description (optional),
   * Zod accepts the input and onSubmit IS called.
   * Validates: Requirements 3.2, 3.4, 4.1
   */
  it(
    'calls onSubmit for any valid input (non-empty title, optional description)',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 255 }).filter((s) => s.trim().length > 0),
          fc.string(),
          async (title, description) => {
            const mockOnSubmit = vi.fn().mockResolvedValue(undefined);

            await renderFillAndSubmit({
              title,
              description,
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
   * Validates: Requirements 3.4
   */
  it(
    'does NOT call onSubmit when title is empty',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          async (description) => {
            const mockOnSubmit = vi.fn().mockResolvedValue(undefined);

            await renderFillAndSubmit({
              title: '',
              description,
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
});
