/**
 * DashboardPage — main page for authenticated users.
 * Fetches and displays the user's expense reports via useReports hook.
 * Shows EmptyState when no reports exist, ErrorAlert on fetch error.
 * Provides a "Create New Report" button that navigates to /reports/new.
 */

import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useReports } from '../hooks/useReports';
import { ReportCard } from '../components/ReportCard';
import { EmptyState } from '../components/EmptyState';
import { ErrorAlert } from '../components/ErrorAlert';

export function DashboardPage() {
  const { reports, isLoading, error } = useReports();
  const navigate = useNavigate();

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          My Expense Reports
        </Typography>
        <Button
          variant="contained"
          onClick={() => navigate('/reports/new')}
        >
          Create New Report
        </Button>
      </Box>

      <ErrorAlert message={error} />

      {!isLoading && !error && reports.length === 0 && <EmptyState />}

      {reports.map((report) => (
        <ReportCard key={report.id} report={report} />
      ))}
    </Container>
  );
}
