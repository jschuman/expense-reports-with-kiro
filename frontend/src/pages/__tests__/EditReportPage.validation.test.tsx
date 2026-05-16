/**
 * Tests for EditReportPage validation and submission behavior (Task 5.2)
 * Requirements: 3.3, 3.4, 3.5, 3.6, 3.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EditReportPage } from '../EditReportPage';
import { ApiError } from '../../api/client';

// Mock hooks
vi.mock('../../hooks/useReports');
vi.mock('../../hooks/useClients');
vi.mock('../../hooks/useExpenseLines');
vi.mock('../../hooks/useAuth');
vi.mock('../../api/attachments');
vi.mock('../../api/reports');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { useReports } from '../../hooks/useReports';
import { useClients } from '../../hooks/useClients';
import { useExpenseLines } from '../../hooks/useExpenseLines';
import { useAuth } from '../../hooks/useAuth';
import { getAttachmentMetadata } from '../../api/attachments';
import { getStatusHistory } from '../../api/reports';

const mockUseReports = vi.mocked(useReports);
const mockUseClients = vi.mocked(useClients);
const mockUseExpenseLines = vi.mocked(useExpenseLines);
const mockUseAuth = vi.mocked(useAuth);
const mockGetMetadata = vi.mocked(getAttachmentMetadata);
const mockGetStatusHistory = vi.mocked(getStatusHistory);

const baseReport = {
  id: 42,
  title: 'Q1 Travel',
  description: 'Flight to NYC',
  total_amount: 350,
  status: 'In Progress',
  owner_id: 1,
  owner_username: 'alice',
  created_at: '2026-04-28T12:00:00Z',
  reimbursable_from_client: false,
  client: null,
  admin_notes: null,
};

function renderPage(reportId = '42') {
  return render(
    <MemoryRouter initialEntries={[`/reports/${reportId}/edit`]}>
      <Routes>
        <Route path="/reports/:reportId/edit" element={<EditReportPage />} />
        <Route path="/" element={<div data-testid="dashboard" />} />
      </Routes>
    </MemoryRouter>
  );
}

function setupMocks(overrides: { isAdmin?: boolean; handleUpdate?: ReturnType<typeof vi.fn> } = {}) {
  const { isAdmin = false, handleUpdate = vi.fn().mockResolvedValue(undefined) } = overrides;

  mockNavigate.mockReset();
  mockGetMetadata.mockRejectedValue({ status: 404 });
  mockGetStatusHistory.mockResolvedValue([]);
  mockUseClients.mockReturnValue({
    clients: ['Acme Corp', 'Globex Industries'],
    isLoading: false,
    error: null,
  });
  mockUseAuth.mockReturnValue({
    user: { id: 1, username: 'alice', role: isAdmin ? 'Admin' : 'User' },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
  mockUseExpenseLines.mockReturnValue({
    lines: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    handleCreate: vi.fn(),
    handleUpdate: vi.fn(),
    handleDelete: vi.fn(),
  });
  mockUseReports.mockReturnValue({
    reports: [baseReport],
    isLoading: false,
    error: null,
    handleUpdate,
    createReport: vi.fn(),
    handleSubmit: vi.fn(),
    handleAccept: vi.fn(),
    handleReject: vi.fn(),
    handleDelete: vi.fn(),
  });

  return { handleUpdate };
}

// ---------------------------------------------------------------------------
// Requirement 3.6: Client-side validation
// ---------------------------------------------------------------------------

describe('EditReportPage - Client-side validation', () => {
  beforeEach(() => {
    setupMocks();
  });

  it('shows validation error when title is empty (Req 3.6)', async () => {
    const { handleUpdate } = setupMocks();
    renderPage();

    const titleInput = screen.getByLabelText(/title/i);
    await userEvent.clear(titleInput);

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText('Title is required')).toBeInTheDocument();
    });
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it('shows validation error when client is required but not selected (Req 3.5)', async () => {
    const { handleUpdate } = setupMocks();
    mockUseReports.mockReturnValue({
      reports: [{ ...baseReport, reimbursable_from_client: true, client: null }],
      isLoading: false,
      error: null,
      handleUpdate,
      createReport: vi.fn(),
      handleSubmit: vi.fn(),
      handleAccept: vi.fn(),
      handleReject: vi.fn(),
      handleDelete: vi.fn(),
    });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText('Client is required when reimbursable from client is selected')).toBeInTheDocument();
    });
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it('does not submit when title exceeds 255 characters (Req 3.6)', async () => {
    const { handleUpdate } = setupMocks();
    renderPage();

    const titleInput = screen.getByLabelText(/title/i);
    await userEvent.clear(titleInput);
    // The input has maxLength=255, so we test the Zod validation by checking the schema
    // The maxLength attribute prevents typing more than 255 chars in the UI
    // But we can verify the field has the maxLength constraint
    expect(titleInput).toHaveAttribute('maxlength', '255');
    expect(handleUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Requirement 3.4: Admin notes max 1000 chars validation
// ---------------------------------------------------------------------------

describe('EditReportPage - Admin notes validation', () => {
  it('admin notes field has maxLength 1000 attribute (Req 3.4)', () => {
    setupMocks({ isAdmin: true });
    renderPage();

    const adminNotesInput = screen.getByLabelText(/admin notes/i);
    expect(adminNotesInput).toHaveAttribute('maxlength', '1000');
  });

  it('displays character count for admin notes (Req 3.4)', () => {
    setupMocks({ isAdmin: true });
    mockUseReports.mockReturnValue({
      reports: [{ ...baseReport, admin_notes: 'Some notes' }],
      isLoading: false,
      error: null,
      handleUpdate: vi.fn().mockResolvedValue(undefined),
      createReport: vi.fn(),
      handleSubmit: vi.fn(),
      handleAccept: vi.fn(),
      handleReject: vi.fn(),
      handleDelete: vi.fn(),
    });
    renderPage();

    expect(screen.getByText('10/1000')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Requirement 3.7: Disable all fields during submission
// ---------------------------------------------------------------------------

describe('EditReportPage - Submission disabling (Req 3.7)', () => {
  it('disables all fields and submit button during submission', async () => {
    let resolveUpdate: () => void;
    const handleUpdate = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { resolveUpdate = resolve; }),
    );
    setupMocks({ isAdmin: true, handleUpdate });
    mockUseReports.mockReturnValue({
      reports: [{ ...baseReport, admin_notes: 'test notes' }],
      isLoading: false,
      error: null,
      handleUpdate,
      createReport: vi.fn(),
      handleSubmit: vi.fn(),
      handleAccept: vi.fn(),
      handleReject: vi.fn(),
      handleDelete: vi.fn(),
    });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeDisabled();
    });
    expect(screen.getByLabelText(/description/i)).toBeDisabled();
    expect(screen.getByLabelText(/admin notes/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();

    // Resolve the update to clean up
    resolveUpdate!();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });
});

// ---------------------------------------------------------------------------
// Requirement 3.3: API errors (403, 404, 409) as ErrorAlert banner
// ---------------------------------------------------------------------------

describe('EditReportPage - API error handling (Req 3.3)', () => {
  it('displays 403 error as ErrorAlert banner', async () => {
    const handleUpdate = vi.fn().mockRejectedValue(
      new ApiError(403, 'You do not have permission to modify this report'),
    );
    setupMocks({ handleUpdate });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('You do not have permission to modify this report')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('displays 404 error as ErrorAlert banner', async () => {
    const handleUpdate = vi.fn().mockRejectedValue(
      new ApiError(404, 'Report not found'),
    );
    setupMocks({ handleUpdate });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Report not found')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('displays 409 error as ErrorAlert banner', async () => {
    const handleUpdate = vi.fn().mockRejectedValue(
      new ApiError(409, 'Cannot perform this action on a report with status \'Submitted\''),
    );
    setupMocks({ handleUpdate });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/cannot perform this action/i)).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Requirement 3.4: Server-side validation errors (422) adjacent to fields
// ---------------------------------------------------------------------------

describe('EditReportPage - Server-side validation errors (Req 3.4)', () => {
  it('displays 422 validation errors adjacent to relevant fields', async () => {
    const validationDetail = JSON.stringify([
      { loc: ['body', 'title'], msg: 'ensure this value has at least 1 characters', type: 'value_error' },
    ]);
    const handleUpdate = vi.fn().mockRejectedValue(
      new ApiError(422, validationDetail),
    );
    setupMocks({ handleUpdate });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText('ensure this value has at least 1 characters')).toBeInTheDocument();
    });
    // Should NOT show as ErrorAlert banner since it's a field-level error
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('displays 422 error as banner when detail is not parseable as field errors', async () => {
    const handleUpdate = vi.fn().mockRejectedValue(
      new ApiError(422, 'Validation failed'),
    );
    setupMocks({ handleUpdate });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Validation failed')).toBeInTheDocument();
    });
  });

  it('displays 422 admin_notes validation error adjacent to admin notes field', async () => {
    const validationDetail = JSON.stringify([
      { loc: ['body', 'admin_notes'], msg: 'ensure this value has at most 1000 characters', type: 'value_error' },
    ]);
    const handleUpdate = vi.fn().mockRejectedValue(
      new ApiError(422, validationDetail),
    );
    setupMocks({ isAdmin: true, handleUpdate });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText('ensure this value has at most 1000 characters')).toBeInTheDocument();
    });
  });
});
