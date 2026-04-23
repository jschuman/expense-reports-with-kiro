/**
 * Tests for DashboardPage
 * Requirements: 2.1, 2.2, 2.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '../DashboardPage';
import type { ExpenseReportResponse } from '../../types/expenseReport';

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

import { useReports } from '../../hooks/useReports';

const mockUseReports = vi.mocked(useReports);

const sampleReports: ExpenseReportResponse[] = [
  {
    id: 1,
    title: 'Q1 Travel',
    purpose: 'Client visit',
    total_amount: 450.0,
    status: 'Pending',
    owner_id: 1,
  },
  {
    id: 2,
    title: 'Office Supplies',
    purpose: 'Team equipment',
    total_amount: 120.5,
    status: 'Pending',
    owner_id: 1,
  },
];

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  // Requirement 2.3: IF user has no Expense_Reports, App SHALL display message indicating no reports exist
  it('renders EmptyState when report list is empty', () => {
    mockUseReports.mockReturnValue({
      reports: [],
      isLoading: false,
      error: null,
      createReport: vi.fn(),
    });

    renderDashboard();

    expect(screen.getByText('No expense reports yet')).toBeInTheDocument();
  });

  // Requirement 2.1: WHEN authenticated user accesses Dashboard, App SHALL display all Expense_Reports
  it('renders ReportCard components when reports are present', () => {
    mockUseReports.mockReturnValue({
      reports: sampleReports,
      isLoading: false,
      error: null,
      createReport: vi.fn(),
    });

    renderDashboard();

    expect(screen.getByText('Q1 Travel')).toBeInTheDocument();
    expect(screen.getByText('Office Supplies')).toBeInTheDocument();
    // EmptyState should NOT be shown
    expect(screen.queryByText('No expense reports yet')).not.toBeInTheDocument();
  });

  // Requirement 2.2: WHEN authenticated user accesses Dashboard, App SHALL provide "Create New Report" action
  it('navigates to /reports/new when "Create New Report" button is clicked', async () => {
    mockUseReports.mockReturnValue({
      reports: [],
      isLoading: false,
      error: null,
      createReport: vi.fn(),
    });

    renderDashboard();

    const button = screen.getByRole('button', { name: /create new report/i });
    await userEvent.click(button);

    expect(mockNavigate).toHaveBeenCalledWith('/reports/new');
  });
});
