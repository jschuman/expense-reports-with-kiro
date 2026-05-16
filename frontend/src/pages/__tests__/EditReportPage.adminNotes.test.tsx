/**
 * Tests for EditReportPage admin notes component behavior (Task 5.3)
 * Requirements: 3.1, 3.7, 5.1, 5.2, 6.1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EditReportPage } from '../EditReportPage';

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

function setupMocks(overrides: {
  isAdmin?: boolean;
  handleUpdate?: ReturnType<typeof vi.fn>;
  report?: typeof baseReport;
} = {}) {
  const {
    isAdmin = false,
    handleUpdate = vi.fn().mockResolvedValue(undefined),
    report = baseReport,
  } = overrides;

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
    reports: [report],
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
// Requirement 6.1: Admin sees editable admin_notes TextField
// ---------------------------------------------------------------------------

describe('EditReportPage - Admin sees editable admin_notes TextField (Req 6.1)', () => {
  it('renders an editable TextField for admin notes when user is Admin', () => {
    setupMocks({ isAdmin: true });
    renderPage();

    const adminNotesInput = screen.getByLabelText(/admin notes/i);
    expect(adminNotesInput).toBeInTheDocument();
    expect(adminNotesInput).not.toBeDisabled();
    expect(adminNotesInput.tagName).toBe('TEXTAREA');
  });

  it('pre-populates admin notes from report data for Admin', () => {
    setupMocks({
      isAdmin: true,
      report: { ...baseReport, admin_notes: 'Review needed for Q1' },
    });
    renderPage();

    const adminNotesInput = screen.getByLabelText(/admin notes/i);
    expect(adminNotesInput).toHaveValue('Review needed for Q1');
  });

  it('allows Admin to type in admin notes field', async () => {
    setupMocks({ isAdmin: true });
    renderPage();

    const adminNotesInput = screen.getByLabelText(/admin notes/i);
    await userEvent.type(adminNotesInput, 'New admin note');

    expect(adminNotesInput).toHaveValue('New admin note');
  });
});

// ---------------------------------------------------------------------------
// Requirement 5.1, 5.2: Regular user sees read-only admin_notes display
// ---------------------------------------------------------------------------

describe('EditReportPage - Regular user sees read-only admin_notes (Req 5.1, 5.2)', () => {
  it('displays admin notes as non-editable text for regular user', () => {
    setupMocks({
      isAdmin: false,
      report: { ...baseReport, admin_notes: 'Please fix the amounts' },
    });
    renderPage();

    // Should NOT have an editable textarea for admin notes
    expect(screen.queryByLabelText(/admin notes/i)).not.toBeInTheDocument();

    // Should display the admin notes text
    expect(screen.getByText('Please fix the amounts')).toBeInTheDocument();
  });

  it('displays "Admin Notes" label for regular user', () => {
    setupMocks({
      isAdmin: false,
      report: { ...baseReport, admin_notes: 'Some notes' },
    });
    renderPage();

    expect(screen.getByText('Admin Notes')).toBeInTheDocument();
  });

  it('preserves line breaks in read-only admin notes display', () => {
    setupMocks({
      isAdmin: false,
      report: { ...baseReport, admin_notes: 'Line 1\nLine 2\nLine 3' },
    });
    renderPage();

    const notesElement = screen.getByText((_content, element) => {
      return element?.textContent === 'Line 1\nLine 2\nLine 3';
    });
    expect(notesElement).toBeInTheDocument();
    expect(notesElement).toHaveStyle({ whiteSpace: 'pre-wrap' });
  });

  it('renders admin notes as non-interactive element for regular user', () => {
    setupMocks({
      isAdmin: false,
      report: { ...baseReport, admin_notes: 'Read only content' },
    });
    renderPage();

    // No textarea or input for admin notes
    expect(screen.queryByLabelText(/admin notes/i)).not.toBeInTheDocument();

    // The text should be in a Typography element (non-interactive)
    const notesText = screen.getByText('Read only content');
    expect(notesText.tagName).not.toBe('TEXTAREA');
    expect(notesText.tagName).not.toBe('INPUT');
  });
});

// ---------------------------------------------------------------------------
// Requirement 5.3: Admin notes placeholder when empty
// ---------------------------------------------------------------------------

describe('EditReportPage - Admin notes placeholder when empty (Req 5.1, 5.3)', () => {
  it('shows placeholder text when admin_notes is null for regular user', () => {
    setupMocks({
      isAdmin: false,
      report: { ...baseReport, admin_notes: null },
    });
    renderPage();

    expect(screen.getByText('No admin notes have been added.')).toBeInTheDocument();
  });

  it('shows placeholder text when admin_notes is empty string for regular user', () => {
    setupMocks({
      isAdmin: false,
      report: { ...baseReport, admin_notes: '' },
    });
    renderPage();

    expect(screen.getByText('No admin notes have been added.')).toBeInTheDocument();
  });

  it('placeholder is styled as italic for visual distinction', () => {
    setupMocks({
      isAdmin: false,
      report: { ...baseReport, admin_notes: null },
    });
    renderPage();

    const placeholder = screen.getByText('No admin notes have been added.');
    expect(placeholder).toHaveStyle({ fontStyle: 'italic' });
  });
});

// ---------------------------------------------------------------------------
// Requirement 3.7: Form disabled during submission
// ---------------------------------------------------------------------------

describe('EditReportPage - Form disabled during submission (Req 3.7)', () => {
  it('disables admin notes TextField during submission for admin', async () => {
    let resolveUpdate: () => void;
    const handleUpdate = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { resolveUpdate = resolve; }),
    );
    setupMocks({
      isAdmin: true,
      handleUpdate,
      report: { ...baseReport, admin_notes: 'test notes' },
    });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/admin notes/i)).toBeDisabled();
    });

    // Also verify other fields are disabled
    expect(screen.getByLabelText(/title/i)).toBeDisabled();
    expect(screen.getByLabelText(/description/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();

    // Resolve the update to clean up
    resolveUpdate!();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });
});

// ---------------------------------------------------------------------------
// Requirement 3.1, 6.1: admin_notes included in payload for admin
// ---------------------------------------------------------------------------

describe('EditReportPage - admin_notes in submission payload (Req 3.1, 6.1)', () => {
  it('includes admin_notes in update payload when user is Admin', async () => {
    const handleUpdate = vi.fn().mockResolvedValue(undefined);
    setupMocks({
      isAdmin: true,
      handleUpdate,
      report: { ...baseReport, admin_notes: 'Original notes' },
    });
    renderPage();

    // Modify admin notes
    const adminNotesInput = screen.getByLabelText(/admin notes/i);
    await userEvent.clear(adminNotesInput);
    await userEvent.type(adminNotesInput, 'Updated notes');

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(handleUpdate).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ admin_notes: 'Updated notes' }),
      );
    });
  });

  it('includes empty admin_notes in payload when admin clears the field', async () => {
    const handleUpdate = vi.fn().mockResolvedValue(undefined);
    setupMocks({
      isAdmin: true,
      handleUpdate,
      report: { ...baseReport, admin_notes: 'Some notes' },
    });
    renderPage();

    const adminNotesInput = screen.getByLabelText(/admin notes/i);
    await userEvent.clear(adminNotesInput);

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(handleUpdate).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ admin_notes: '' }),
      );
    });
  });

  it('does NOT include admin_notes in update payload for regular user', async () => {
    const handleUpdate = vi.fn().mockResolvedValue(undefined);
    setupMocks({
      isAdmin: false,
      handleUpdate,
      report: { ...baseReport, admin_notes: 'Existing admin notes' },
    });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(handleUpdate).toHaveBeenCalled();
    });

    const payload = handleUpdate.mock.calls[0][1];
    expect(payload).not.toHaveProperty('admin_notes');
  });
});
