/**
 * DashboardPage — main page for authenticated users.
 * Fetches and displays expense reports via useReports hook.
 * Role-based title: Admin sees "All Expense Reports", User sees "My Expense Reports".
 * Displays the authenticated user's role below the page title.
 * Provides a "Create New Report" button and a "Logout" button.
 * Logout calls the auth API and redirects to /login on success.
 *
 * Action handlers wired to ExpenseReportsTable via useReports:
 *  - onSubmit  → handleSubmitWithCheck (In Progress / Rejected → Submitted, with attachment check)
 *  - onAccept  → handleAccept  (Submitted → Scheduled for Payment)
 *  - onReject  → handleReject  (Submitted → Rejected, requires admin notes)
 *  - onEdit    → navigate to /reports/:id/edit
 *  - onDelete  → handleDelete  (removes report)
 *  - onView    → navigate to /reports/:id (read-only detail page)
 *
 * Requirements: 1.1, 2.3, 3.1, 4.1, 4.2, 4.3, 4.5, 4.6, 4.7, 5.1, 5.7, 6.1, 7.3, 7.4, 8.3, 10.1
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { useReports } from '../hooks/useReports';
import { useAuth } from '../hooks/useAuth';
import { ExpenseReportsTable } from '../components/ExpenseReportsTable';
import { ErrorAlert } from '../components/ErrorAlert';
import { MissingAttachmentWarningDialog } from '../components/MissingAttachmentWarningDialog';
import { listLines } from '../api/expenseLines';
import { getAttachmentMetadata } from '../api/attachments';

export function DashboardPage() {
  const {
    reports,
    isLoading,
    error,
    handleSubmit,
    handleAccept,
    handleReject,
    handleDelete,
  } = useReports();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Missing-attachment warning dialog state
  const [pendingSubmitReportId, setPendingSubmitReportId] = useState<number | null>(null);
  const [missingCount, setMissingCount] = useState(0);
  const [warningOpen, setWarningOpen] = useState(false);

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

  /**
   * Navigates to the edit page for the given report.
   * Requirements: 2.3, 7.3 — owner can edit In Progress / Rejected reports.
   */
  const handleEdit = useCallback(
    (reportId: number) => {
      navigate(`/reports/${reportId}/edit`);
    },
    [navigate],
  );

  /**
   * Intercepts the submit action to check for missing attachments.
   * Requirements: 5.1-5.6.
   */
  const handleSubmitWithCheck = useCallback(
    async (reportId: number) => {
      setSubmitError(null);
      try {
        const lines = await listLines(reportId);

        if (lines.length === 0) {
          setSubmitError('A report must have at least one expense line before it can be submitted.');
          return;
        }

        const total = lines.reduce((sum, l) => sum + l.amount, 0);
        if (total <= 0) {
          setSubmitError('A report total must be greater than $0.00 before it can be submitted.');
          return;
        }

        const results = await Promise.allSettled(
          lines.map((line) => getAttachmentMetadata(reportId, line.id)),
        );

        const missing = results.filter((r) => r.status === 'rejected').length;

        if (missing > 0) {
          setMissingCount(missing);
          setPendingSubmitReportId(reportId);
          setWarningOpen(true);
        } else {
          await handleSubmit(reportId);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to submit report';
        setSubmitError(message);
      }
    },
    [handleSubmit],
  );

  const handleAddAttachments = useCallback(() => {
    setWarningOpen(false);
    if (pendingSubmitReportId !== null) {
      navigate(`/reports/${pendingSubmitReportId}/edit`);
    }
    setPendingSubmitReportId(null);
  }, [navigate, pendingSubmitReportId]);

  const handleSubmitWithout = useCallback(async () => {
    setWarningOpen(false);
    if (pendingSubmitReportId !== null) {
      try {
        await handleSubmit(pendingSubmitReportId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to submit report';
        setSubmitError(message);
      }
    }
    setPendingSubmitReportId(null);
  }, [handleSubmit, pendingSubmitReportId]);

  /**
   * Navigates to the read-only detail page for the given report.
   * Used for non-editable statuses (Submitted, Scheduled for Payment) and admin views.
   */
  const handleView = useCallback(
    (reportId: number) => {
      navigate(`/reports/${reportId}`);
    },
    [navigate],
  );

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
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

      {submitError && (
        <Alert severity="error" sx={{ mb: 2 }} data-testid="submit-error" onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      <ErrorAlert message={error} />

      {/* Requirements: 1.1, 4.1, 4.2, 5.7, 6.1
          ExpenseReportsTable replaces the card-based list with an MUI X DataGrid.
          Action handlers and user context are passed as props. */}
      <ExpenseReportsTable
        reports={reports}
        isLoading={isLoading}
        currentUser={user ?? { id: 0, username: '', role: 'User' }}
        onSubmit={handleSubmitWithCheck}
        onAccept={handleAccept}
        onReject={handleReject}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onView={handleView}
      />

      {/* Missing attachment warning dialog — shown before submission */}
      <MissingAttachmentWarningDialog
        open={warningOpen}
        missingCount={missingCount}
        onAddAttachments={handleAddAttachments}
        onSubmitWithout={handleSubmitWithout}
      />
    </Container>
  );
}
