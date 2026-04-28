/**
 * Tests for CreateReportPage
 * Requirements: 3.1, 3.2, 4.1, 5.1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CreateReportPage } from '../CreateReportPage';
import type { ExpenseReportFormData } from '../../types/schemas';

// Mock the useReports hook
vi.mock('../../hooks/useReports');

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock ReportForm so we can inspect the isSubmitting prop and control submitted data
vi.mock('../../components/ReportForm', () => ({
  ReportForm: ({
    onSubmit,
    isSubmitting,
  }: {
    onSubmit: (data: ExpenseReportFormData) => Promise<void>;
    isSubmitting: boolean;
  }) => (
    <div>
      <span data-testid="is-submitting">{String(isSubmitting)}</span>
      {/* Basic submission — no reimbursable, no client */}
      <button
        data-testid="submit-btn"
        onClick={() =>
          onSubmit({
            title: 'Test',
            description: 'Testing',
            total_amount: 10,
            reimbursable_from_client: false,
          })
        }
      >
        Submit
      </button>
      {/* Submission with reimbursable=true and a valid client */}
      <button
        data-testid="submit-btn-reimbursable"
        onClick={() =>
          onSubmit({
            title: 'Client Trip',
            description: 'NYC visit',
            total_amount: 850,
            reimbursable_from_client: true,
            client: 'Acme Corp',
          })
        }
      >
        Submit Reimbursable
      </button>
    </div>
  ),
}));

import { useReports } from '../../hooks/useReports';

const mockUseReports = vi.mocked(useReports);

const mockReportBase = {
  id: 1,
  title: 'Test',
  description: 'Testing',
  total_amount: 10,
  status: 'Pending',
  owner_id: 1,
  owner_username: 'alice',
  created_at: '2026-04-28T12:00:00Z',
  reimbursable_from_client: false,
  client: null,
  admin_notes: null,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <CreateReportPage />
    </MemoryRouter>
  );
}

describe('CreateReportPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  // Requirements 3.1, 4.1: new fields (description, reimbursable_from_client) are passed through to createReport
  it('calls createReport with all new fields and navigates to / on success', async () => {
    const mockCreateReport = vi.fn().mockResolvedValue(mockReportBase);

    mockUseReports.mockReturnValue({
      reports: [],
      isLoading: false,
      error: null,
      createReport: mockCreateReport,
    });

    renderPage();

    await userEvent.click(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(mockCreateReport).toHaveBeenCalledWith({
        title: 'Test',
        description: 'Testing',
        total_amount: 10,
        reimbursable_from_client: false,
      });
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  // Requirements 4.1, 5.1: reimbursable=true with a valid client is passed through correctly
  it('calls createReport with reimbursable_from_client=true and client on reimbursable submission', async () => {
    const mockCreateReport = vi.fn().mockResolvedValue({
      ...mockReportBase,
      title: 'Client Trip',
      description: 'NYC visit',
      total_amount: 850,
      reimbursable_from_client: true,
      client: 'Acme Corp',
    });

    mockUseReports.mockReturnValue({
      reports: [],
      isLoading: false,
      error: null,
      createReport: mockCreateReport,
    });

    renderPage();

    await userEvent.click(screen.getByTestId('submit-btn-reimbursable'));

    await waitFor(() => {
      expect(mockCreateReport).toHaveBeenCalledWith({
        title: 'Client Trip',
        description: 'NYC visit',
        total_amount: 850,
        reimbursable_from_client: true,
        client: 'Acme Corp',
      });
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  // Requirement 3.2: IF API error on submission, App SHALL display error and NOT navigate
  it('renders ErrorAlert with the error message and does not navigate on API error', async () => {
    const mockCreateReport = vi.fn().mockRejectedValue(new Error('Server error'));

    mockUseReports.mockReturnValue({
      reports: [],
      isLoading: false,
      error: null,
      createReport: mockCreateReport,
    });

    renderPage();

    await userEvent.click(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // Requirement 3.1: isSubmitting prop is true while submission is in flight
  it('passes isSubmitting=true to ReportForm while submission is in flight', async () => {
    let resolveCreate!: () => void;
    const pendingCreate = new Promise<typeof mockReportBase>((resolve) => {
      resolveCreate = () => resolve(mockReportBase);
    });

    const mockCreateReport = vi.fn().mockReturnValue(pendingCreate);

    mockUseReports.mockReturnValue({
      reports: [],
      isLoading: false,
      error: null,
      createReport: mockCreateReport,
    });

    renderPage();

    // Before submission, isSubmitting should be false
    expect(screen.getByTestId('is-submitting').textContent).toBe('false');

    // Trigger submission (do NOT await — we want to inspect mid-flight state)
    userEvent.click(screen.getByTestId('submit-btn'));

    // isSubmitting should become true while the promise is pending
    await waitFor(() => {
      expect(screen.getByTestId('is-submitting').textContent).toBe('true');
    });

    // Resolve the promise and confirm isSubmitting returns to false
    resolveCreate();

    await waitFor(() => {
      expect(screen.getByTestId('is-submitting').textContent).toBe('false');
    });
  });
});
