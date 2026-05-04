/**
 * Tests for EditReportPage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EditReportPage } from '../EditReportPage';

// Mock hooks
vi.mock('../../hooks/useReports');
vi.mock('../../hooks/useClients');

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

const mockUseReports = vi.mocked(useReports);
const mockUseClients = vi.mocked(useClients);

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

describe('EditReportPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseClients.mockReturnValue({
      clients: ['Acme Corp', 'Globex Industries'],
      isLoading: false,
      error: null,
    });
  });

  it('pre-fills form fields from the existing report', async () => {
    const mockHandleUpdate = vi.fn().mockResolvedValue(undefined);
    mockUseReports.mockReturnValue({
      reports: [baseReport],
      isLoading: false,
      error: null,
      handleUpdate: mockHandleUpdate,
    });

    renderPage();

    expect(screen.getByDisplayValue('Q1 Travel')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Flight to NYC')).toBeInTheDocument();
    expect(screen.getByDisplayValue('350')).toBeInTheDocument();
  });

  it('calls handleUpdate with changed fields and navigates to / on success', async () => {
    const mockHandleUpdate = vi.fn().mockResolvedValue(undefined);
    mockUseReports.mockReturnValue({
      reports: [baseReport],
      isLoading: false,
      error: null,
      handleUpdate: mockHandleUpdate,
    });

    renderPage();

    const titleInput = screen.getByDisplayValue('Q1 Travel');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Q2 Travel');

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mockHandleUpdate).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ title: 'Q2 Travel' }),
      );
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('shows an error alert and does not navigate on API failure', async () => {
    const mockHandleUpdate = vi.fn().mockRejectedValue(new Error('Update failed'));
    mockUseReports.mockReturnValue({
      reports: [baseReport],
      isLoading: false,
      error: null,
      handleUpdate: mockHandleUpdate,
    });

    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Update failed')).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('navigates to / when Cancel is clicked', async () => {
    mockUseReports.mockReturnValue({
      reports: [baseReport],
      isLoading: false,
      error: null,
      handleUpdate: vi.fn(),
    });

    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('redirects to / when the report is not found', async () => {
    mockUseReports.mockReturnValue({
      reports: [baseReport],
      isLoading: false,
      error: null,
      handleUpdate: vi.fn(),
    });

    renderPage('999'); // non-existent ID

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });
});
