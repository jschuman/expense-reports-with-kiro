/**
 * ExpenseReportDetailPage — shows a single expense report with its line items.
 *
 * Displays report header (title, status chip, description, total_amount,
 * reimbursable/client info) and an expense lines table.
 *
 * When the report is editable (status "In Progress" or "Rejected") and the
 * current user is the owner, shows Add/Edit/Delete controls.
 *
 * Requirements: 2.1, 2.2, 2.8, 3.1, 3.2, 3.8, 4.1, 4.2, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import { useState, useEffect, useCallback, Fragment } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableFooter from '@mui/material/TableFooter';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { useAuth } from '../hooks/useAuth';
import { useExpenseLines } from '../hooks/useExpenseLines';
import { useReports } from '../hooks/useReports';
import { ErrorAlert } from '../components/ErrorAlert';
import { formatIncurredDate } from '../utils/formatDate';
import { getAttachmentMetadata } from '../api/attachments';
import { AttachmentDisplayComponent } from '../components/AttachmentDisplayComponent';
import type { AttachmentMetadata } from '../types/attachments';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EDITABLE_STATUSES = new Set(['In Progress', 'Rejected']);

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(amount);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExpenseReportDetailPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();

  const { reports, isLoading: reportsLoading } = useReports();
  const { user } = useAuth();

  const reportIdNum = Number(reportId);
  const {
    lines,
    isLoading: linesLoading,
    error: linesError,
    handleDelete,
  } = useExpenseLines(reportIdNum);

  const [deleteLineId, setDeleteLineId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [attachmentMap, setAttachmentMap] = useState<Record<number, AttachmentMetadata | null>>({});

  const report = reports.find((r) => r.id === reportIdNum);

  const isAdmin = user?.role === 'Admin';

  const canEdit =
    report !== undefined &&
    EDITABLE_STATUSES.has(report.status) &&
    user !== null &&
    user.id === report.owner_id;

  const fetchAttachmentsForAdmin = useCallback(async () => {
    if (!isAdmin || lines.length === 0) return;
    const results = await Promise.allSettled(
      lines.map((line) => getAttachmentMetadata(reportIdNum, line.id)),
    );
    const map: Record<number, AttachmentMetadata | null> = {};
    results.forEach((result, i) => {
      const lineId = lines[i].id;
      map[lineId] = result.status === 'fulfilled' ? result.value : null;
    });
    setAttachmentMap(map);
  }, [isAdmin, lines, reportIdNum]);

  useEffect(() => {
    void fetchAttachmentsForAdmin();
  }, [fetchAttachmentsForAdmin]);

  const refreshAttachment = useCallback(
    async (lineId: number) => {
      try {
        const metadata = await getAttachmentMetadata(reportIdNum, lineId);
        setAttachmentMap((prev) => ({ ...prev, [lineId]: metadata }));
      } catch {
        setAttachmentMap((prev) => ({ ...prev, [lineId]: null }));
      }
    },
    [reportIdNum],
  );

  async function confirmDelete() {
    if (deleteLineId === null) return;
    try {
      setDeleteError(null);
      await handleDelete(deleteLineId);
      setDeleteLineId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete line';
      setDeleteError(message);
      setDeleteLineId(null);
    }
  }

  // Show spinner while the reports list is still loading
  if (reportsLoading) {
    return (
      <Container sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  // Report not found (404 / access denied)
  if (!report) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">Report not found.</Alert>
      </Container>
    );
  }

  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);

  return (
    <Container sx={{ mt: 4 }}>
      <Box sx={{ mb: 2 }}>
        <Button variant="text" onClick={() => navigate('/')}>
          ← Back to Dashboard
        </Button>
      </Box>

      {/* Report header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Typography variant="h4">{report.title}</Typography>
          <Chip label={report.status} />
        </Box>

        {report.description && (
          <Typography variant="body1" sx={{ mb: 1 }}>
            {report.description}
          </Typography>
        )}

        <Typography variant="body2">
          <strong>Total:</strong> {formatCurrency(report.total_amount)}
        </Typography>

        <Typography variant="body2">
          <strong>Reimbursable:</strong> {report.reimbursable_from_client ? 'Yes' : 'No'}
        </Typography>

        {report.reimbursable_from_client && report.client && (
          <Typography variant="body2">
            <strong>Client:</strong> {report.client}
          </Typography>
        )}
      </Box>

      {/* Lines section header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h5">Expense Lines</Typography>
        {canEdit && (
          <Button
            variant="contained"
            onClick={() => navigate(`/reports/${reportId}/lines/new`)}
          >
            Add
          </Button>
        )}
      </Box>

      <ErrorAlert message={linesError ?? deleteError} />

      {linesLoading ? (
        <CircularProgress />
      ) : lines.length === 0 ? (
        <Typography>No expense lines yet.</Typography>
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Description</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Date</TableCell>
                {canEdit && <TableCell>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line) => (
                <Fragment key={line.id}>
                  <TableRow>
                    <TableCell>{line.description}</TableCell>
                    <TableCell>{formatCurrency(line.amount)}</TableCell>
                    <TableCell>{formatIncurredDate(line.incurred_date)}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <IconButton
                          aria-label="edit"
                          onClick={() =>
                            navigate(`/reports/${reportId}/lines/${line.id}/edit`)
                          }
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          aria-label="delete"
                          onClick={() => setDeleteLineId(line.id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                  {isAdmin && (
                    <TableRow data-testid={`attachment-row-${line.id}`}>
                      <TableCell colSpan={canEdit ? 4 : 3} sx={{ pt: 0 }}>
                        <AttachmentDisplayComponent
                          reportId={reportIdNum}
                          lineId={line.id}
                          attachment={attachmentMap[line.id] ?? null}
                          onRefresh={() => void refreshAttachment(line.id)}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>
                  <strong>Subtotal</strong>
                </TableCell>
                <TableCell>{formatCurrency(subtotal)}</TableCell>
                <TableCell />
                {canEdit && <TableCell />}
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteLineId !== null} onClose={() => setDeleteLineId(null)}>
        <DialogTitle>Delete Expense Line</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this expense line? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteLineId(null)}>Cancel</Button>
          <Button color="error" onClick={confirmDelete}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
