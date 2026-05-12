/**
 * Unit tests for ExpenseLineDetailPage
 *
 * Covers:
 * - Render in create mode: all fields empty, submit button present, cancel navigates back
 * - Render in edit mode: form pre-populated with existing line values
 * - Loading spinner shown while loading in edit mode
 * - Submit in create mode with valid data: handleCreate called with correct payload; attachment section shown
 * - Submit in create mode: Done button navigates back to report editor
 * - Submit in edit mode with valid data: handleUpdate called with correct payload; navigates to detail page
 * - Submit with empty description: client-side error shown, no API call
 * - Submit with zero amount: client-side error shown, no API call
 * - Submit with negative amount: client-side error shown, no API call
 * - Server 422 response: field-level error messages displayed
 * - Server 409 response: Alert with server detail message displayed
 * - Attachment section shown in edit mode with display and upload components
 * - Form fields disabled after line creation (attachment section visible)
 *
 * Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.3, 3.4, 3.5, 3.8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ExpenseLineDetailPage } from '../ExpenseLineDetailPage';
import type { ExpenseLineResponse } from '../../types/expenseReport';
import { ApiError } from '../../api/client';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../hooks/useExpenseLines');

vi.mock('../../api/attachments', () => ({
  getAttachmentMetadata: vi.fn().mockRejectedValue(new (class extends Error { status = 404; constructor() { super('Not found'); } })()),
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
  downloadAttachment: vi.fn(),
}));

vi.mock('../../components/AttachmentUploadComponent', () => ({
  AttachmentUploadComponent: ({ reportId, lineId }: { reportId: number; lineId: number }) => (
    <div data-testid="attachment-upload" data-report-id={reportId} data-line-id={lineId} />
  ),
}));

vi.mock('../../components/AttachmentDisplayComponent', () => ({
  AttachmentDisplayComponent: ({ reportId, lineId }: { reportId: number; lineId: number }) => (
    <div data-testid="attachment-display" data-report-id={reportId} data-line-id={lineId} />
  ),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { useExpenseLines } from '../../hooks/useExpenseLines';

const mockUseExpenseLines = vi.mocked(useExpenseLines);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleLine: ExpenseLineResponse = {
  id: 5,
  report_id: 10,
  description: 'Taxi to airport',
  amount: 45.5,
  incurred_date: '2026-04-05',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupLinesMock(
  lines: ExpenseLineResponse[] = [],
  overrides: {
    isLoading?: boolean;
    handleCreate?: ReturnType<typeof vi.fn>;
    handleUpdate?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const handleCreate = overrides.handleCreate ?? vi.fn().mockResolvedValue(sampleLine);
  const handleUpdate = overrides.handleUpdate ?? vi.fn().mockResolvedValue(undefined);
  mockUseExpenseLines.mockReturnValue({
    lines,
    isLoading: overrides.isLoading ?? false,
    error: null,
    refetch: vi.fn(),
    handleCreate,
    handleUpdate,
    handleDelete: vi.fn(),
  });
  return { handleCreate, handleUpdate };
}

function renderCreateMode(reportId = '10') {
  return render(
    <MemoryRouter initialEntries={[`/reports/${reportId}/lines/new`]}>
      <Routes>
        <Route path="/reports/:reportId/lines/new" element={<ExpenseLineDetailPage />} />
        <Route path="/reports/:reportId" element={<div data-testid="detail-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderEditMode(reportId = '10', lineId = '5') {
  return render(
    <MemoryRouter initialEntries={[`/reports/${reportId}/lines/${lineId}/edit`]}>
      <Routes>
        <Route
          path="/reports/:reportId/lines/:lineId/edit"
          element={<ExpenseLineDetailPage />}
        />
        <Route path="/reports/:reportId" element={<div data-testid="detail-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExpenseLineDetailPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  // -------------------------------------------------------------------------
  // Create mode rendering
  // -------------------------------------------------------------------------

  it('renders empty form in create mode with Add Line button and Cancel button', () => {
    setupLinesMock();
    renderCreateMode();

    expect(screen.getByText('Add Expense Line')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add line/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();

    // All fields empty on initial render
    expect(screen.getByLabelText(/description/i)).toHaveValue('');
    expect(screen.getByLabelText(/amount/i)).toHaveValue(null); // type="number" with empty value
  });

  it('Cancel button navigates to the report detail page without submitting', async () => {
    setupLinesMock();
    renderCreateMode();

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/reports/10/edit');
  });

  // -------------------------------------------------------------------------
  // Edit mode rendering
  // -------------------------------------------------------------------------

  it('renders Save Changes button in edit mode', () => {
    setupLinesMock([sampleLine]);
    renderEditMode();

    expect(screen.getByText('Edit Expense Line')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('pre-populates form with existing line values in edit mode', async () => {
    setupLinesMock([sampleLine]);
    renderEditMode();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Taxi to airport')).toBeInTheDocument();
      expect(screen.getByDisplayValue('45.5')).toBeInTheDocument();
      expect(screen.getByDisplayValue('2026-04-05')).toBeInTheDocument();
    });
  });

  it('shows CircularProgress while loading in edit mode', () => {
    setupLinesMock([], { isLoading: true });
    renderEditMode();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Valid submissions
  // -------------------------------------------------------------------------

  it('calls handleCreate with correct payload and shows attachment section on success', async () => {
    const { handleCreate } = setupLinesMock();
    renderCreateMode();

    await userEvent.type(screen.getByLabelText(/description/i), 'Hotel stay');
    await userEvent.type(screen.getByLabelText(/amount/i), '120');
    fireEvent.change(screen.getByLabelText(/^Date/i), { target: { value: '2026-04-10' } });

    await userEvent.click(screen.getByRole('button', { name: /add line/i }));

    await waitFor(() => {
      expect(handleCreate).toHaveBeenCalledWith({
        description: 'Hotel stay',
        amount: 120,
        incurred_date: '2026-04-10',
      });
    });

    // Attachment section is shown instead of navigating away
    await waitFor(() => {
      expect(screen.getByTestId('attachment-section')).toBeInTheDocument();
    });

    // Form fields are disabled after creation
    expect(screen.getByLabelText(/description/i)).toBeDisabled();
    expect(screen.getByLabelText(/amount/i)).toBeDisabled();

    // Done button is present to navigate back
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();

    // Should NOT have navigated yet
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('Done button navigates back to report editor after line creation', async () => {
    setupLinesMock();
    renderCreateMode();

    await userEvent.type(screen.getByLabelText(/description/i), 'Hotel stay');
    await userEvent.type(screen.getByLabelText(/amount/i), '120');
    fireEvent.change(screen.getByLabelText(/^Date/i), { target: { value: '2026-04-10' } });

    await userEvent.click(screen.getByRole('button', { name: /add line/i }));

    await waitFor(() => {
      expect(screen.getByTestId('attachment-section')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /done/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/reports/10/edit');
  });

  it('calls handleUpdate with correct payload and navigates to detail page on success', async () => {
    const { handleUpdate } = setupLinesMock([sampleLine]);
    renderEditMode();

    // Wait for pre-population
    await waitFor(() => {
      expect(screen.getByDisplayValue('Taxi to airport')).toBeInTheDocument();
    });

    const descriptionInput = screen.getByLabelText(/description/i);
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, 'Updated taxi');

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(handleUpdate).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ description: 'Updated taxi' }),
      );
      expect(mockNavigate).toHaveBeenCalledWith('/reports/10/edit');
    });
  });

  // -------------------------------------------------------------------------
  // Client-side validation
  // -------------------------------------------------------------------------

  it('shows description required error and does not call API when description is empty', async () => {
    const { handleCreate } = setupLinesMock();
    renderCreateMode();

    await userEvent.type(screen.getByLabelText(/amount/i), '50');
    fireEvent.change(screen.getByLabelText(/^Date/i), { target: { value: '2026-04-10' } });

    await userEvent.click(screen.getByRole('button', { name: /add line/i }));

    await waitFor(() => {
      expect(screen.getByText(/description is required/i)).toBeInTheDocument();
    });
    expect(handleCreate).not.toHaveBeenCalled();
  });

  it('shows amount error and does not call API when amount is zero', async () => {
    const { handleCreate } = setupLinesMock();
    renderCreateMode();

    await userEvent.type(screen.getByLabelText(/description/i), 'Hotel');
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/^Date/i), { target: { value: '2026-04-10' } });

    await userEvent.click(screen.getByRole('button', { name: /add line/i }));

    await waitFor(() => {
      expect(screen.getByText(/amount must be greater than 0/i)).toBeInTheDocument();
    });
    expect(handleCreate).not.toHaveBeenCalled();
  });

  it('shows amount error and does not call API when amount is negative', async () => {
    const { handleCreate } = setupLinesMock();
    renderCreateMode();

    await userEvent.type(screen.getByLabelText(/description/i), 'Hotel');
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '-10' } });
    fireEvent.change(screen.getByLabelText(/^Date/i), { target: { value: '2026-04-10' } });

    await userEvent.click(screen.getByRole('button', { name: /add line/i }));

    await waitFor(() => {
      expect(screen.getByText(/amount must be greater than 0/i)).toBeInTheDocument();
    });
    expect(handleCreate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Server error handling
  // -------------------------------------------------------------------------

  it('displays field-level error messages on server 422 response', async () => {
    const validationDetail = [
      {
        loc: ['body', 'amount'],
        msg: 'Input should be greater than 0',
        type: 'greater_than',
      },
    ];
    const handleCreate = vi.fn().mockRejectedValue(
      new ApiError(422, JSON.stringify(validationDetail)),
    );
    setupLinesMock([], { handleCreate });
    renderCreateMode();

    // Provide values that pass client-side validation so the API call is made
    await userEvent.type(screen.getByLabelText(/description/i), 'Hotel');
    await userEvent.type(screen.getByLabelText(/amount/i), '50');
    fireEvent.change(screen.getByLabelText(/^Date/i), { target: { value: '2026-04-10' } });

    await userEvent.click(screen.getByRole('button', { name: /add line/i }));

    await waitFor(() => {
      expect(screen.getByText('Input should be greater than 0')).toBeInTheDocument();
    });
  });

  it('displays server Alert on 409 response', async () => {
    const handleCreate = vi.fn().mockRejectedValue(
      new ApiError(409, 'Report is not editable'),
    );
    setupLinesMock([], { handleCreate });
    renderCreateMode();

    await userEvent.type(screen.getByLabelText(/description/i), 'Hotel');
    await userEvent.type(screen.getByLabelText(/amount/i), '50');
    fireEvent.change(screen.getByLabelText(/^Date/i), { target: { value: '2026-04-10' } });

    await userEvent.click(screen.getByRole('button', { name: /add line/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Report is not editable')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Attachment section
  // -------------------------------------------------------------------------

  it('shows attachment section in edit mode with upload and display components', async () => {
    setupLinesMock([sampleLine]);
    renderEditMode();

    await waitFor(() => {
      expect(screen.getByTestId('attachment-section')).toBeInTheDocument();
    });

    expect(screen.getByTestId('attachment-upload')).toBeInTheDocument();
    expect(screen.getByTestId('attachment-display')).toBeInTheDocument();
  });

  it('does not show attachment section in create mode before submission', () => {
    setupLinesMock();
    renderCreateMode();

    expect(screen.queryByTestId('attachment-section')).not.toBeInTheDocument();
  });

  it('hides Add Line and Cancel buttons after line creation (attachment section visible)', async () => {
    setupLinesMock();
    renderCreateMode();

    await userEvent.type(screen.getByLabelText(/description/i), 'Hotel stay');
    await userEvent.type(screen.getByLabelText(/amount/i), '120');
    fireEvent.change(screen.getByLabelText(/^Date/i), { target: { value: '2026-04-10' } });

    await userEvent.click(screen.getByRole('button', { name: /add line/i }));

    await waitFor(() => {
      expect(screen.getByTestId('attachment-section')).toBeInTheDocument();
    });

    // Add Line and Cancel buttons should be hidden
    expect(screen.queryByRole('button', { name: /add line/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('does not show Done button in edit mode', async () => {
    setupLinesMock([sampleLine]);
    renderEditMode();

    await waitFor(() => {
      expect(screen.getByTestId('attachment-section')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /done/i })).not.toBeInTheDocument();
  });
});
