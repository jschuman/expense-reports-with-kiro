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
 * - currentUser is passed to each ReportCard (Requirements 2.3, 3.1, 5.1)
 * - Action buttons wire to useReports handlers (Requirements 3.1, 5.1, 6.3, 10.1)
 *   - Submit button → handleSubmit (Requirement 3.1)
 *   - Accept button → handleAccept (Requirement 5.1)
 *   - Reject dialog confirm → handleReject (Requirement 6.3)
 *   - Edit button → navigate to /reports/:id/edit (Requirement 7.3)
 *   - Delete button → handleDelete (Requirement 10.1)
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
    status: 'In Progress',
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
    status: 'In Progress',
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
        status: 'In Progress',
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
// Requirements 2.3, 3.1, 5.1: currentUser is passed to each ReportCard
// ---------------------------------------------------------------------------

describe('currentUser passed to ReportCard', () => {
  it('passes the logged-in user to each ReportCard so role-based buttons render correctly', () => {
    // Owner (alice, id=1) viewing their own In Progress report — Submit button should appear
    const ownerReport: ExpenseReportResponse = {
      id: 1,
      title: 'Q1 Travel',
      description: 'Client visit',
      total_amount: 450.0,
      status: 'In Progress',
      owner_id: 1,
      owner_username: 'alice',
      created_at: '2026-01-01T00:00:00Z',
      reimbursable_from_client: false,
      client: null,
      admin_notes: null,
    };
    setupDefaultMocks({ user: userRoleUser, reports: [ownerReport] });
    renderDashboard();

    // Submit button is only shown when currentUser is the owner and status is In Progress
    expect(screen.getByRole('button', { name: /submit report/i })).toBeInTheDocument();
  });

  it('passes admin user to each ReportCard so Accept/Reject buttons render for Submitted reports', () => {
    const submittedReport: ExpenseReportResponse = {
      id: 10,
      title: 'Submitted Report',
      description: 'Awaiting review',
      total_amount: 200.0,
      status: 'Submitted',
      owner_id: 99,
      owner_username: 'charlie',
      created_at: '2026-02-01T00:00:00Z',
      reimbursable_from_client: false,
      client: null,
      admin_notes: null,
    };
    setupDefaultMocks({ user: adminRoleUser, reports: [submittedReport] });
    renderDashboard();

    // Accept and Reject buttons are only shown when currentUser is Admin and status is Submitted
    expect(screen.getByRole('button', { name: /accept report/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject report/i })).toBeInTheDocument();
  });

  it('renders no action buttons for a non-owner User viewing a Submitted report', () => {
    const submittedReport: ExpenseReportResponse = {
      id: 10,
      title: 'Submitted Report',
      description: 'Awaiting review',
      total_amount: 200.0,
      status: 'Submitted',
      owner_id: 99, // different from userRoleUser.id (1)
      owner_username: 'charlie',
      created_at: '2026-02-01T00:00:00Z',
      reimbursable_from_client: false,
      client: null,
      admin_notes: null,
    };
    setupDefaultMocks({ user: userRoleUser, reports: [submittedReport] });
    renderDashboard();

    expect(screen.queryByRole('button', { name: /submit report/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept report/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reject report/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Requirement 3.1: Submit button calls handleSubmit with the correct report ID
// ---------------------------------------------------------------------------

describe('Submit action wiring', () => {
  it('calls handleSubmit with the correct report ID when Submit is clicked', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    const inProgressReport: ExpenseReportResponse = {
      id: 42,
      title: 'Travel Expenses',
      description: 'Business trip',
      total_amount: 300.0,
      status: 'In Progress',
      owner_id: 1, // matches userRoleUser.id
      owner_username: 'alice',
      created_at: '2026-03-01T00:00:00Z',
      reimbursable_from_client: false,
      client: null,
      admin_notes: null,
    };
    mockUseReports.mockReturnValue({
      reports: [inProgressReport],
      isLoading: false,
      error: null,
      createReport: vi.fn(),
      handleSubmit,
      handleAccept: vi.fn(),
      handleReject: vi.fn(),
      handleUpdate: vi.fn(),
      handleDelete: vi.fn(),
    });
    mockUseAuth.mockReturnValue({
      user: userRoleUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    renderDashboard();

    await userEvent.click(screen.getByRole('button', { name: /submit report/i }));

    expect(handleSubmit).toHaveBeenCalledOnce();
    expect(handleSubmit).toHaveBeenCalledWith(42);
  });
});

// ---------------------------------------------------------------------------
// Requirement 5.1: Accept button calls handleAccept with the correct report ID
// ---------------------------------------------------------------------------

describe('Accept action wiring', () => {
  it('calls handleAccept with the correct report ID when Accept is clicked', async () => {
    const handleAccept = vi.fn().mockResolvedValue(undefined);
    const submittedReport: ExpenseReportResponse = {
      id: 55,
      title: 'Submitted Report',
      description: 'Ready for review',
      total_amount: 500.0,
      status: 'Submitted',
      owner_id: 99,
      owner_username: 'charlie',
      created_at: '2026-03-01T00:00:00Z',
      reimbursable_from_client: false,
      client: null,
      admin_notes: null,
    };
    mockUseReports.mockReturnValue({
      reports: [submittedReport],
      isLoading: false,
      error: null,
      createReport: vi.fn(),
      handleSubmit: vi.fn(),
      handleAccept,
      handleReject: vi.fn(),
      handleUpdate: vi.fn(),
      handleDelete: vi.fn(),
    });
    mockUseAuth.mockReturnValue({
      user: adminRoleUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    renderDashboard();

    await userEvent.click(screen.getByRole('button', { name: /accept report/i }));

    expect(handleAccept).toHaveBeenCalledOnce();
    expect(handleAccept).toHaveBeenCalledWith(55);
  });
});

// ---------------------------------------------------------------------------
// Requirement 6.3: Reject dialog confirm calls handleReject with report ID and notes
// ---------------------------------------------------------------------------

describe('Reject action wiring', () => {
  it('calls handleReject with the correct report ID and admin notes when dialog is confirmed', async () => {
    const handleReject = vi.fn().mockResolvedValue(undefined);
    const submittedReport: ExpenseReportResponse = {
      id: 77,
      title: 'Submitted Report',
      description: 'Ready for review',
      total_amount: 750.0,
      status: 'Submitted',
      owner_id: 99,
      owner_username: 'charlie',
      created_at: '2026-03-01T00:00:00Z',
      reimbursable_from_client: false,
      client: null,
      admin_notes: null,
    };
    mockUseReports.mockReturnValue({
      reports: [submittedReport],
      isLoading: false,
      error: null,
      createReport: vi.fn(),
      handleSubmit: vi.fn(),
      handleAccept: vi.fn(),
      handleReject,
      handleUpdate: vi.fn(),
      handleDelete: vi.fn(),
    });
    mockUseAuth.mockReturnValue({
      user: adminRoleUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    renderDashboard();

    // Open the reject dialog
    await userEvent.click(screen.getByRole('button', { name: /reject report/i }));

    // Type admin notes into the dialog text field
    const notesInput = screen.getByRole('textbox');
    await userEvent.type(notesInput, 'Missing receipts');

    // Confirm the rejection
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(handleReject).toHaveBeenCalledOnce();
    expect(handleReject).toHaveBeenCalledWith(77, 'Missing receipts');
  });

  it('does not call handleReject when the reject dialog is cancelled', async () => {
    const handleReject = vi.fn();
    const submittedReport: ExpenseReportResponse = {
      id: 77,
      title: 'Submitted Report',
      description: 'Ready for review',
      total_amount: 750.0,
      status: 'Submitted',
      owner_id: 99,
      owner_username: 'charlie',
      created_at: '2026-03-01T00:00:00Z',
      reimbursable_from_client: false,
      client: null,
      admin_notes: null,
    };
    mockUseReports.mockReturnValue({
      reports: [submittedReport],
      isLoading: false,
      error: null,
      createReport: vi.fn(),
      handleSubmit: vi.fn(),
      handleAccept: vi.fn(),
      handleReject,
      handleUpdate: vi.fn(),
      handleDelete: vi.fn(),
    });
    mockUseAuth.mockReturnValue({
      user: adminRoleUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    renderDashboard();

    // Open the reject dialog
    await userEvent.click(screen.getByRole('button', { name: /reject report/i }));

    // Cancel without confirming
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(handleReject).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Requirement 7.3: Edit button navigates to /reports/:id/edit
// ---------------------------------------------------------------------------

describe('Edit action wiring', () => {
  it('navigates to /reports/:id/edit when Edit is clicked', async () => {
    const inProgressReport: ExpenseReportResponse = {
      id: 88,
      title: 'Travel Expenses',
      description: 'Business trip',
      total_amount: 300.0,
      status: 'In Progress',
      owner_id: 1, // matches userRoleUser.id
      owner_username: 'alice',
      created_at: '2026-03-01T00:00:00Z',
      reimbursable_from_client: false,
      client: null,
      admin_notes: null,
    };
    setupDefaultMocks({ user: userRoleUser, reports: [inProgressReport] });
    renderDashboard();

    await userEvent.click(screen.getByRole('button', { name: /edit report/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/reports/88/edit');
  });
});

// ---------------------------------------------------------------------------
// View button navigates to /reports/:id (read-only detail page)
// ---------------------------------------------------------------------------

describe('View action wiring', () => {
  it('navigates to /reports/:id when View is clicked on a Submitted report', async () => {
    const submittedReport: ExpenseReportResponse = {
      id: 77,
      title: 'Conference Trip',
      description: null,
      total_amount: 500.0,
      status: 'Submitted',
      owner_id: 1,
      owner_username: 'alice',
      created_at: '2026-03-01T00:00:00Z',
      reimbursable_from_client: false,
      client: null,
      admin_notes: null,
    };
    setupDefaultMocks({ user: userRoleUser, reports: [submittedReport] });
    renderDashboard();

    await userEvent.click(screen.getByRole('button', { name: /view report/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/reports/77');
  });
});

// ---------------------------------------------------------------------------
// Requirement 10.1: Delete button calls handleDelete with the correct report ID
// ---------------------------------------------------------------------------

describe('Delete action wiring', () => {
  it('calls handleDelete with the correct report ID when Delete is clicked', async () => {
    const handleDelete = vi.fn().mockResolvedValue(undefined);
    const inProgressReport: ExpenseReportResponse = {
      id: 99,
      title: 'Travel Expenses',
      description: 'Business trip',
      total_amount: 300.0,
      status: 'In Progress',
      owner_id: 1, // matches userRoleUser.id
      owner_username: 'alice',
      created_at: '2026-03-01T00:00:00Z',
      reimbursable_from_client: false,
      client: null,
      admin_notes: null,
    };
    mockUseReports.mockReturnValue({
      reports: [inProgressReport],
      isLoading: false,
      error: null,
      createReport: vi.fn(),
      handleSubmit: vi.fn(),
      handleAccept: vi.fn(),
      handleReject: vi.fn(),
      handleUpdate: vi.fn(),
      handleDelete,
    });
    mockUseAuth.mockReturnValue({
      user: userRoleUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    renderDashboard();

    await userEvent.click(screen.getByRole('button', { name: /delete report/i }));

    expect(handleDelete).toHaveBeenCalledOnce();
    expect(handleDelete).toHaveBeenCalledWith(99);
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
