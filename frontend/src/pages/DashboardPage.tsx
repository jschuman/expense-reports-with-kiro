/**
 * DashboardPage — main page for authenticated users.
 * Fetches and displays expense reports via useReports hook.
 * Role-based title: Admin sees "All Expense Reports", User sees "My Expense Reports".
 * Displays the authenticated user's role below the page title.
 * Provides a "Create New Report" button and a "Logout" button.
 * Logout calls the auth API and redirects to /login on success.
 *
 * Requirements: 2.3, 3.3, 4.5, 4.6, 4.7, 7.4
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { useReports } from '../hooks/useReports';
import { useAuth } from '../hooks/useAuth';
import { ReportCard } from '../components/ReportCard';
import { EmptyState } from '../components/EmptyState';
import { ErrorAlert } from '../components/ErrorAlert';

export function DashboardPage() {
  const { reports, isLoading, error, handleSubmit, handleAccept, handleReject, handleDelete } = useReports();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState<string | null>(null);

  // Requirement 2.3 / 3.3: page title reflects the user's role
  const pageTitle =
    user?.role === 'Admin' ? 'All Expense Reports' : 'My Expense Reports';

  // Requirement 4.5 / 4.6: logout clears session and redirects to login
  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await logout();
      navigate('/login');
    } catch {
      setLogoutError('Logout failed. Please try again.');
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* Header row: title + role info on the left, action buttons on the right */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          {/* Requirement 2.3 / 3.3: role-based page title */}
          <Typography variant="h4" component="h1">
            {pageTitle}
          </Typography>
          {/* Requirement 7.4: display authenticated user's role */}
          {user && (
            <Typography variant="body2" color="text.secondary" data-testid="role-display">
              Logged in as {user.username} ({user.role})
            </Typography>
          )}
        </Box>

        <Box display="flex" gap={2}>
          <Button
            variant="contained"
            onClick={() => navigate('/reports/new')}
          >
            Create New Report
          </Button>
          {/* Requirement 4.7: logout button visible to all authenticated users */}
          <Button
            variant="outlined"
            onClick={handleLogout}
            data-testid="logout-button"
          >
            Logout
          </Button>
        </Box>
      </Box>

      {/* Logout error feedback */}
      {logoutError && (
        <Alert severity="error" sx={{ mb: 2 }} data-testid="logout-error">
          {logoutError}
        </Alert>
      )}

      <ErrorAlert message={error} />

      {!isLoading && !error && reports.length === 0 && <EmptyState />}

      {reports.map((report) => (
        <ReportCard
          key={report.id}
          report={report}
          currentUser={user ?? { id: 0, username: '', role: 'User' }}
          onSubmit={handleSubmit}
          onAccept={handleAccept}
          onReject={handleReject}
          onDelete={handleDelete}
        />
      ))}
    </Container>
  );
}
