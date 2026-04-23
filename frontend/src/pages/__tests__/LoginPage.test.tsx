/**
 * Tests for LoginPage
 * Requirements: 1.1, 1.2, 1.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../LoginPage';

// Mock the useAuth hook
vi.mock('../../hooks/useAuth');

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { useAuth } from '../../hooks/useAuth';

const mockUseAuth = vi.mocked(useAuth);

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  // Requirement 1.2: WHEN valid credentials submitted, App SHALL establish session and redirect to Dashboard
  it('navigates to / on successful login', async () => {
    const mockLogin = vi.fn().mockResolvedValue({ id: 1, username: 'alice' });
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin,
      logout: vi.fn(),
    });

    renderLogin();

    await userEvent.type(screen.getByLabelText(/username/i), 'alice');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  // Requirement 1.3: IF invalid credentials, App SHALL display error message
  it('renders ErrorAlert on failed login', async () => {
    const mockLogin = vi.fn().mockRejectedValue(new Error('Unauthorized'));
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin,
      logout: vi.fn(),
    });

    renderLogin();

    await userEvent.type(screen.getByLabelText(/username/i), 'alice');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpassword');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument();
    });

    // Should NOT navigate on failure
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
