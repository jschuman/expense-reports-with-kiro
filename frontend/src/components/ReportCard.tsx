/**
 * ReportCard — displays a single expense report as an MUI Card.
 * Shows title, purpose, total_amount (formatted as currency), and status chip.
 */

import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import type { ExpenseReportResponse } from '../types/expenseReport';

interface ReportCardProps {
  report: ExpenseReportResponse;
}

export function ReportCard({ report }: ReportCardProps) {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(report.total_amount);

  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" component="h2" gutterBottom>
          {report.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {report.purpose}
        </Typography>
        <Typography variant="body1" fontWeight="medium" sx={{ mt: 1 }}>
          {formattedAmount}
        </Typography>
        <Chip
          label={report.status}
          size="small"
          color="default"
          sx={{ mt: 1 }}
        />
      </CardContent>
    </Card>
  );
}
