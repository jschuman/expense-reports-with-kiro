/**
 * Tests for CreateReportPage
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CreateReportPage } from '../CreateReportPage';

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

// Mock ReportForm so we can inspect the isSubmitting prop without fighting Zod validation
vi.mock('../../components/ReportForm', () => ({
  ReportForm: ({
    onSubmit,
    isSubmitting,
  }: {
    onSubmit: (data: { title: string; purpose: string; total_amount: number }) => Promise<void>;
    isSubmitting: boolean;
  }) => (
    <div>
      <span data-testid="is-submitting">{String(isSubmitting)}</span>
      <button
        data-testid="submit-btn"
        onClick={() => onSubmit({ title: 'Test', purpose: 'Testing', total_amount: 10 })}
      >
        Submit
      </button>
    </div>
  ),
}));

import { useReports } from '../../hooks/useReports';

const mockUseReports = vi.mocked(useReports);

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

  // Requirement 3.2, 3.3: WHEN form submitted with valid data, App SHALL save report and redirect to Dashboard
  it('calls createReport and navigates to / on successful submission', async () => {
    const mockCreateReport = vi.fn().mockResolvedValue({
      id: 1,
      title: 'Test',
      purpose: 'Testing',
      total_amount: 10,
      status: 'Pending',
      owner_id: 1,
    });

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
        purpose: 'Testing',
        total_amount: 10,
      });
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  // Requirement 3.4, 3.5: IF API error on submission, App SHALL display error and NOT navigate
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
    // createReport resolves only after we manually advance — use a deferred promise
    let resolveCreate!: () => void;
    const pendingCreate = new Promise<{
      id: number;
      title: string;
      purpose: string;
      total_amount: number;
      status: string;
      owner_id: number;
    }>((resolve) => {
      resolveCreate = () =>
        resolve({
          id: 1,
          title: 'Test',
          purpose: 'Testing',
          total_amount: 10,
          status: 'Pending',
          owner_id: 1,
        });
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
