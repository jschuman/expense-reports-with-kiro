/**
 * ReportCard — displays a single expense report as an MUI Card.
 * Shows all report fields: title, description, total_amount (formatted as currency),
 * status chip, owner_username, created_at (formatted as local time), reimbursable_from_client,
 * client, and admin_notes. Optional fields display "—" when null or empty.
 *
 * Requirements: 1.3, 2.3, 3.5, 4.3, 5.7, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5
 */

import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Box from '@mui/material/Box';
import type { ExpenseReportResponse } from '../types/expenseReport';
import { formatUtcDate } from '../utils/formatDate';

interface ReportCardProps {
  report: ExpenseReportResponse;
}

/** Returns the value if non-empty, otherwise the placeholder "—". */
function displayOrPlaceholder(value: string | null | undefined): string {
  return value && value.trim() !== '' ? value : '—';
}

export function ReportCard({ report }: ReportCardProps) {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(report.total_amount);

  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        {/* Title */}
        <Typography variant="h6" component="h2" gutterBottom>
          {report.title}
        </Typography>

        <Divider sx={{ my: 1 }} />

        {/* Description */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Description
          </Typography>
          <Typography variant="body2">
            {displayOrPlaceholder(report.description)}
          </Typography>
        </Box>

        {/* Total Amount */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Amount
          </Typography>
          <Typography variant="body1" fontWeight="medium">
            {formattedAmount}
          </Typography>
        </Box>

        {/* Status */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Status
          </Typography>
          <Chip label={report.status} size="small" color="default" />
        </Box>

        <Divider sx={{ my: 1 }} />

        {/* Owner */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Owner
          </Typography>
          <Typography variant="body2">{report.owner_username}</Typography>
        </Box>

        {/* Created At */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Created
          </Typography>
          <Typography variant="body2">{formatUtcDate(report.created_at)}</Typography>
        </Box>

        <Divider sx={{ my: 1 }} />

        {/* Reimbursable From Client */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Reimbursable
          </Typography>
          <Typography variant="body2">
            {report.reimbursable_from_client ? 'Yes' : 'No'}
          </Typography>
        </Box>

        {/* Client */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Client
          </Typography>
          <Typography variant="body2">
            {displayOrPlaceholder(report.client)}
          </Typography>
        </Box>

        <Divider sx={{ my: 1 }} />

        {/* Admin Notes */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Admin Notes
          </Typography>
          <Typography variant="body2">
            {displayOrPlaceholder(report.admin_notes)}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
