/**
 * ReportCard — displays a single expense report as an MUI Card.
 *
 * Shows all report fields: title, description, total_amount (formatted as currency),
 * status chip (color-coded), owner_username, created_at (formatted as local time),
 * reimbursable_from_client, client, and admin_notes.
 *
 * Renders conditional action buttons based on report.status and currentUser.role:
 *  - "In Progress" + owner:  Edit, Delete, Submit
 *  - "Submitted"   + admin:  View, Accept, Reject (Reject opens RejectDialog)
 *  - "Rejected"    + owner:  Edit, Delete, Submit
 *  - "Submitted" or "Scheduled for Payment" + owner: View
 *  - Admin on any non-Submitted status: View
 *
 * The View button is shown whenever the owner has no editable actions, giving
 * read-only access to the report detail and its expense lines.
 *
 * Requirements: 2.3, 3.1, 4.3, 5.1, 7.3, 7.4, 8.3, 10.1, 10.3
 */

import { useState } from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import type { ChipOwnProps } from '@mui/material/Chip';
import type { ExpenseReportResponse } from '../types/expenseReport';
import type { UserResponse } from '../types/auth';
import { formatUtcDate } from '../utils/formatDate';
import { RejectDialog } from './RejectDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportCardProps {
  report: ExpenseReportResponse;
  currentUser: UserResponse;
  onSubmit?: (reportId: number) => void;
  onAccept?: (reportId: number) => void;
  onReject?: (reportId: number, adminNotes: string) => void;
  onEdit?: (reportId: number) => void;
  onDelete?: (reportId: number) => void;
  onView?: (reportId: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the value if non-empty, otherwise the placeholder "—". */
function displayOrPlaceholder(value: string | null | undefined): string {
  return value && value.trim() !== '' ? value : '—';
}

/** Maps a status string to an MUI Chip color. */
function statusChipColor(status: string): ChipOwnProps['color'] {
  switch (status) {
    case 'In Progress':
      return 'default';
    case 'Submitted':
      return 'primary';
    case 'Scheduled for Payment':
      return 'success';
    case 'Rejected':
      return 'error';
    default:
      return 'default';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportCard({
  report,
  currentUser,
  onSubmit,
  onAccept,
  onReject,
  onEdit,
  onDelete,
  onView,
}: ReportCardProps) {
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);

  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(report.total_amount);

  const isOwner = currentUser.id === report.owner_id;
  const isAdmin = currentUser.role === 'Admin';

  // Determine which action buttons to show
  const showOwnerEditableActions =
    isOwner && (report.status === 'In Progress' || report.status === 'Rejected');
  const showAdminSubmittedActions = isAdmin && report.status === 'Submitted';

  // Show View button when the owner has no edit actions (non-editable status or admin viewing)
  const showViewButton = !showOwnerEditableActions;

  function handleRejectConfirm(adminNotes: string) {
    setRejectDialogOpen(false);
    onReject?.(report.id, adminNotes);
  }

  return (
    <>
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

          {/* Status chip */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 0.5,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Status
            </Typography>
            <Chip
              label={report.status}
              size="small"
              color={statusChipColor(report.status)}
            />
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

          {/* Admin Notes — always shown as a field label/value pair */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Admin Notes
            </Typography>
            <Typography variant="body2">
              {displayOrPlaceholder(report.admin_notes)}
            </Typography>
          </Box>

          {/* Admin Notes prominent alert — only when Rejected */}
          {report.status === 'Rejected' && report.admin_notes && (
            <Alert severity="error" sx={{ mt: 1 }} aria-label="rejection reason">
              <Typography variant="body2" fontWeight="medium">
                Rejection reason:
              </Typography>
              <Typography variant="body2">{report.admin_notes}</Typography>
            </Alert>
          )}
        </CardContent>

        {/* Action buttons */}
        {(showOwnerEditableActions || showAdminSubmittedActions || showViewButton) && (
          <CardActions sx={{ px: 2, pb: 2, gap: 1 }}>
            {showViewButton && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => onView?.(report.id)}
                aria-label="view report"
              >
                View
              </Button>
            )}

            {showOwnerEditableActions && (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => onEdit?.(report.id)}
                  aria-label="edit report"
                >
                  Edit
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  onClick={() => onDelete?.(report.id)}
                  aria-label="delete report"
                >
                  Delete
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => onSubmit?.(report.id)}
                  aria-label="submit report"
                >
                  Submit
                </Button>
              </>
            )}

            {showAdminSubmittedActions && (
              <>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  onClick={() => onAccept?.(report.id)}
                  aria-label="accept report"
                >
                  Accept
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color="error"
                  onClick={() => setRejectDialogOpen(true)}
                  aria-label="reject report"
                >
                  Reject
                </Button>
              </>
            )}
          </CardActions>
        )}
      </Card>

      {/* Reject dialog — only rendered for admins viewing submitted reports */}
      {showAdminSubmittedActions && (
        <RejectDialog
          open={rejectDialogOpen}
          onClose={() => setRejectDialogOpen(false)}
          onConfirm={handleRejectConfirm}
        />
      )}
    </>
  );
}
