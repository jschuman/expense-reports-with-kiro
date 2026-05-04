/**
 * Component tests for DashboardPage
 *
 * Covers:
 * - Logout button is displayed (Requirement 4.7)
 * - Logout button triggers logout API call and navigates to /login (Requirements 4.5, 4.6)
 * - Logout API failure shows error message (Requirement 4.6)
 * - User role information is displayed below the page title (Requirement 7.4)
 * - Page title changes based on role: Admin → "All Expense Reports",
 *   User → "My Expense Reports" (Requirements 2.3, 3.3)
 * - Admin users see owner_username on report cards (Requirement 2.4)
 * - Existing behaviour: empty state, report cards, create-report navigation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '../DashboardPage';
import type { ExpenseReportResponse } from '../../types/expenseReport';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../hooks/useReports');
vi.mock('../../hooks/useAuth');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { useReports } from '../../hooks/useReports';
import { useAuth } from '../../hooks/useAuth';

const mockUseReports = vi.mocked(useReports);
const mockUseAuth = vi.mocked(useAuth);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const userRoleUser = { id: 1, username: 'alice', role: 'User' };
const adminRoleUser = { id: 2, username: 'bob', role: 'Admin' };

const mockLogout = vi.fn();

const sampleReports: ExpenseReportResponse[] = [
  {
    id: 1,
    title: 'Q1 Travel',
    description: 'Client visit',
    total_amount: 450.0,
    status: 'Pending',
    owner_id: 1,
    owner_username: 'alice',
    created_at: '2026-01-01T00:00:00Z',
    reimbursable_from_client: false,
    client: null,
    admin_notes: null,
  },
  {
    id: 2,
    title: 'Office Supplies',
    description: 'Team equipment',
    total_amount: 120.5,
    status: 'Pending',
    owner_id: 2,
    owner_username: 'bob',
    created_at: '2026-01-02T00:00:00Z',
    reimbursable_from_client: false,
    client: null,
    admin_notes: null,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

function setupDefaultMocks({
  reports = [] as ExpenseReportResponse[],
  isLoading = false,
  error = null as string | null,
  user = userRoleUser,
  logoutImpl = vi.fn().mockResolvedValue(undefined),
} = {}) {
  mockUseReports.mockReturnValue({
    reports,
    isLoading,
    error,
    createReport: vi.fn(),
    handleSubmit: vi.fn(),
    handleAccept: vi.fn(),
    handleReject: vi.fn(),
    handleUpdate: vi.fn(),
    handleDelete: vi.fn(),
  });
  mockUseAuth.mockReturnValue({
    user,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: logoutImpl,
  });
  return logoutImpl;
}

// ---------------------------------------------------------------------------
// beforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockNavigate.mockReset();
  mockLogout.mockReset();
});

// ---------------------------------------------------------------------------
// Requirement 4.7: Logout button is visible to all authenticated users
// ---------------------------------------------------------------------------

describe('Logout button visibility', () => {
  it('renders a Logout button for a User-role user', () => {
    setupDefaultMocks({ user: userRoleUser });
    renderDashboard();
    expect(screen.getByTestId('logout-button')).toBeInTheDocument();
  });

  it('renders a Logout button for an Admin-role user', () => {
    setupDefaultMocks({ user: adminRoleUser });
    renderDashboard();
    expect(screen.getByTestId('logout-button')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Requirements 4.5 / 4.6: Logout triggers API call and navigates to /login
// ---------------------------------------------------------------------------

describe('Logout button behaviour', () => {
  it('calls logout() and navigates to /login on success', async () => {
    const logoutImpl = vi.fn().mockResolvedValue(undefined);
    setupDefaultMocks({ logoutImpl });
    renderDashboard();

    await userEvent.click(screen.getByTestId('logout-button'));

    expect(logoutImpl).toHaveBeenCalledOnce();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'));
  });

  it('shows an error message when logout API call fails', async () => {
    const logoutImpl = vi.fn().mockRejectedValue(new Error('Network error'));
    setupDefaultMocks({ logoutImpl });
    renderDashboard();

    await userEvent.click(screen.getByTestId('logout-button'));

    await waitFor(() =>
      expect(screen.getByTestId('logout-error')).toBeInTheDocument()
    );
    expect(screen.getByTestId('logout-error')).toHaveTextContent(
      'Logout failed. Please try again.'
    );
    // Should NOT navigate away when logout fails
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not navigate to /login when logout fails', async () => {
    const logoutImpl = vi.fn().mockRejectedValue(new Error('Server error'));
    setupDefaultMocks({ logoutImpl });
    renderDashboard();

    await userEvent.click(screen.getByTestId('logout-button'));

    await waitFor(() =>
      expect(screen.getByTestId('logout-error')).toBeInTheDocument()
    );
    expect(mockNavigate).not.toHaveBeenCalledWith('/login');
  });

  it('clears a previous logout error when logout succeeds on retry', async () => {
    const logoutImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('Temporary error'))
      .mockResolvedValueOnce(undefined);
    setupDefaultMocks({ logoutImpl });
    renderDashboard();

    // First click — fails
    await userEvent.click(screen.getByTestId('logout-button'));
    await waitFor(() =>
      expect(screen.getByTestId('logout-error')).toBeInTheDocument()
    );

    // Second click — succeeds
    await userEvent.click(screen.getByTestId('logout-button'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'));
    expect(screen.queryByTestId('logout-error')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Requirement 7.4: Role information is displayed below the page title
// ---------------------------------------------------------------------------

describe('Role display', () => {
  it('displays username and role for a User-role user', () => {
    setupDefaultMocks({ user: userRoleUser });
    renderDashboard();

    const roleDisplay = screen.getByTestId('role-display');
    expect(roleDisplay).toHaveTextContent('alice');
    expect(roleDisplay).toHaveTextContent('User');
  });

  it('displays username and role for an Admin-role user', () => {
    setupDefaultMocks({ user: adminRoleUser });
    renderDashboard();

    const roleDisplay = screen.getByTestId('role-display');
    expect(roleDisplay).toHaveTextContent('bob');
    expect(roleDisplay).toHaveTextContent('Admin');
  });

  it('does not render role display when user is null', () => {
    setupDefaultMocks({ user: null as unknown as typeof userRoleUser });
    renderDashboard();

    expect(screen.queryByTestId('role-display')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Requirements 2.3 / 3.3: Page title changes based on role
// ---------------------------------------------------------------------------

describe('Page title based on role', () => {
  it('shows "My Expense Reports" for User-role users', () => {
    setupDefaultMocks({ user: userRoleUser });
    renderDashboard();

    expect(
      screen.getByRole('heading', { name: 'My Expense Reports' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'All Expense Reports' })
    ).not.toBeInTheDocument();
  });

  it('shows "All Expense Reports" for Admin-role users', () => {
    setupDefaultMocks({ user: adminRoleUser });
    renderDashboard();

    expect(
      screen.getByRole('heading', { name: 'All Expense Reports' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'My Expense Reports' })
    ).not.toBeInTheDocument();
  });

  it('defaults to "My Expense Reports" when user is null', () => {
    setupDefaultMocks({ user: null as unknown as typeof userRoleUser });
    renderDashboard();

    expect(
      screen.getByRole('heading', { name: 'My Expense Reports' })
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Requirement 2.4: Admin users see owner_username on report cards
// ---------------------------------------------------------------------------

describe('owner_username display for admin users', () => {
  it('renders owner_username on report cards when admin views all reports', () => {
    setupDefaultMocks({ user: adminRoleUser, reports: sampleReports });
    renderDashboard();

    // Both owner usernames should be visible in the report cards
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  it('renders report cards with owner_username for regular user viewing own reports', () => {
    const ownReports: ExpenseReportResponse[] = [
      {
        id: 1,
        title: 'Q1 Travel',
        description: 'Client visit',
        total_amount: 450.0,
        status: 'Pending',
        owner_id: 1,
        owner_username: 'alice',
        created_at: '2026-01-01T00:00:00Z',
        reimbursable_from_client: false,
        client: null,
        admin_notes: null,
      },
    ];
    setupDefaultMocks({ user: userRoleUser, reports: ownReports });
    renderDashboard();

    expect(screen.getByText('alice')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Existing behaviour: empty state, report cards, create-report navigation
// ---------------------------------------------------------------------------

describe('existing DashboardPage behaviour', () => {
  it('renders EmptyState when report list is empty', () => {
    setupDefaultMocks({ reports: [] });
    renderDashboard();

    expect(screen.getByText('No expense reports yet')).toBeInTheDocument();
  });

  it('renders ReportCard components when reports are present', () => {
    setupDefaultMocks({ reports: sampleReports });
    renderDashboard();

    expect(screen.getByText('Q1 Travel')).toBeInTheDocument();
    expect(screen.getByText('Office Supplies')).toBeInTheDocument();
    expect(screen.queryByText('No expense reports yet')).not.toBeInTheDocument();
  });

  it('navigates to /reports/new when "Create New Report" button is clicked', async () => {
    setupDefaultMocks();
    renderDashboard();

    await userEvent.click(
      screen.getByRole('button', { name: /create new report/i })
    );

    expect(mockNavigate).toHaveBeenCalledWith('/reports/new');
  });
});
