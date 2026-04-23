/**
 * CreateReportPage — page for creating a new expense report.
 * Renders ReportForm wired to useReports().createReport.
 * On success: navigates to the Dashboard (/). On API error: shows ErrorAlert.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useReports } from '../hooks/useReports';
import { ReportForm } from '../components/ReportForm';
import { ErrorAlert } from '../components/ErrorAlert';
import type { ExpenseReportFormData } from '../types/schemas';

export function CreateReportPage() {
  const { createReport } = useReports();
  const navigate = useNavigate();

  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(data: ExpenseReportFormData) {
    setApiError(null);
    setIsSubmitting(true);

    try {
      await createReport(data);
      navigate('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create report';
      setApiError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Box mb={3}>
        <Typography variant="h4" component="h1">
          Create New Report
        </Typography>
      </Box>

      <ErrorAlert message={apiError} />

      <ReportForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
    </Container>
  );
}
