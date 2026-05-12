/**
 * EditReportPage — page for editing an existing expense report and managing its line items.
 *
 * Fetches the report by ID from the reports list (already loaded in useReports),
 * pre-fills all editable fields, and calls handleUpdate on submit.
 * On success: navigates back to the Dashboard (/). On API error: shows ErrorAlert.
 *
 * Also displays the expense lines table with add/edit/delete controls.
 * Line totals are shown read-only.
 *
 * Only reachable for reports in "In Progress" or "Rejected" state — the backend
 * enforces this; the frontend redirects to / if the report is not found.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableFooter from '@mui/material/TableFooter';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { useReports } from '../hooks/useReports';
import { useClients } from '../hooks/useClients';
import { useExpenseLines } from '../hooks/useExpenseLines';
import { ErrorAlert } from '../components/ErrorAlert';
import { expenseReportUpdateSchema } from '../types/schemas';
import { formatIncurredDate } from '../utils/formatDate';
import { getAttachmentMetadata, downloadAttachment } from '../api/attachments';
import type { AttachmentMetadata } from '../types/attachments';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(amount);
}

interface FieldErrors {
  title?: string;
  description?: string;
  client?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const { reports, handleUpdate } = useReports();
  const { clients, isLoading: clientsLoading } = useClients();
  const navigate = useNavigate();

  const reportIdNum = Number(reportId);
  const report = reports.find((r) => r.id === reportIdNum);

  const {
    lines,
    isLoading: linesLoading,
    error: linesError,
    handleDelete: handleDeleteLine,
  } = useExpenseLines(reportIdNum);

  // Report form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reimbursableFromClient, setReimbursableFromClient] = useState(false);
  const [client, setClient] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Line delete dialog state
  const [deleteLineId, setDeleteLineId] = useState<number | null>(null);
  const [deleteLineError, setDeleteLineError] = useState<string | null>(null);
  const [attachmentMap, setAttachmentMap] = useState<Record<number, AttachmentMetadata | null>>({});

  const fetchAttachments = useCallback(async () => {
    if (lines.length === 0) return;
    const results = await Promise.allSettled(
      lines.map((line) => getAttachmentMetadata(reportIdNum, line.id)),
    );
    const map: Record<number, AttachmentMetadata | null> = {};
    results.forEach((result, i) => {
      const lineId = lines[i].id;
      map[lineId] = result.status === 'fulfilled' ? result.value : null;
    });
    setAttachmentMap(map);
  }, [lines, reportIdNum]);

  useEffect(() => {
    void fetchAttachments();
  }, [fetchAttachments]);

  // Populate fields once the report is available
  useEffect(() => {
    if (report) {
      setTitle(report.title);
      setDescription(report.description ?? '');
      setReimbursableFromClient(report.reimbursable_from_client);
      setClient(report.client ?? '');
    }
  }, [report]);

  // If the report isn't found (e.g. navigated directly with a bad ID), go home
  useEffect(() => {
    if (reports.length > 0 && !report) {
      navigate('/');
    }
  }, [reports, report, navigate]);

  function handleReimbursableChange(checked: boolean) {
    setReimbursableFromClient(checked);
    if (!checked) setClient('');
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiError(null);

    const rawData = {
      title: title || undefined,
      description: description || undefined,
      reimbursable_from_client: reimbursableFromClient,
      client: reimbursableFromClient && client ? client : undefined,
    };

    const result = expenseReportUpdateSchema.safeParse(rawData);

    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      await handleUpdate(reportIdNum, result.data);
      navigate('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update report';
      setApiError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmDeleteLine() {
    if (deleteLineId === null) return;
    try {
      setDeleteLineError(null);
      await handleDeleteLine(deleteLineId);
      setDeleteLineId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete line';
      setDeleteLineError(message);
      setDeleteLineId(null);
    }
  }

  if (!report) {
    return null; // redirect effect will fire
  }

  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box mb={3}>
        <Typography variant="h4" component="h1">
          Edit Report
        </Typography>
      </Box>

      <ErrorAlert message={apiError} />

      <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
        <TextField
          id="title"
          label="Title"
          fullWidth
          margin="normal"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={Boolean(errors.title)}
          helperText={errors.title ?? ' '}
          disabled={isSubmitting}
          inputProps={{ maxLength: 255 }}
        />
        <TextField
          id="description"
          label="Description"
          fullWidth
          margin="normal"
          multiline
          minRows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={Boolean(errors.description)}
          helperText={errors.description ?? ' '}
          disabled={isSubmitting}
        />
        <FormControlLabel
          control={
            <Checkbox
              id="reimbursable_from_client"
              checked={reimbursableFromClient}
              onChange={(e) => handleReimbursableChange(e.target.checked)}
              disabled={isSubmitting}
            />
          }
          label="Reimbursable from client"
          sx={{ mt: 1 }}
        />
        {reimbursableFromClient && (
          <FormControl
            fullWidth
            margin="normal"
            error={Boolean(errors.client)}
            disabled={isSubmitting || clientsLoading}
          >
            <InputLabel id="client-label">Client</InputLabel>
            <Select
              labelId="client-label"
              id="client"
              value={client}
              label="Client"
              onChange={(e) => setClient(e.target.value)}
            >
              {clients.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>{errors.client ?? ' '}</FormHelperText>
          </FormControl>
        )}
        <Box display="flex" gap={2} mt={2}>
          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </Button>
          <Button
            variant="outlined"
            fullWidth
            disabled={isSubmitting}
            onClick={() => navigate('/')}
          >
            Cancel
          </Button>
        </Box>
      </Box>

      {/* Expense Lines Section */}
      <Divider sx={{ my: 4 }} />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Expense Lines</Typography>
        <Button
          variant="contained"
          size="small"
          onClick={() => navigate(`/reports/${reportId}/lines/new`)}
        >
          Add Line
        </Button>
      </Box>

      <ErrorAlert message={linesError ?? deleteLineError} />

      {linesLoading ? (
        <CircularProgress />
      ) : lines.length === 0 ? (
        <Typography color="text.secondary">No expense lines yet. Click Add Line to get started.</Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Description</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {attachmentMap[line.id] ? (
                        <IconButton
                          size="small"
                          aria-label="download attachment"
                          onClick={() => void downloadAttachment(reportIdNum, line.id)}
                          sx={{ p: 0 }}
                        >
                          <AttachFileIcon fontSize="small" color="action" />
                        </IconButton>
                      ) : (
                        <Box sx={{ width: 20 }} />
                      )}
                      {line.description}
                    </Box>
                  </TableCell>
                  <TableCell>{formatCurrency(line.amount)}</TableCell>
                  <TableCell>{formatIncurredDate(line.incurred_date)}</TableCell>
                  <TableCell>
                    <IconButton
                      aria-label="edit line"
                      size="small"
                      onClick={() => navigate(`/reports/${reportId}/lines/${line.id}/edit`)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      aria-label="delete line"
                      size="small"
                      onClick={() => setDeleteLineId(line.id)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>
                  <Typography variant="body2" fontWeight="medium">
                    Total: {formatCurrency(subtotal)}
                  </Typography>
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      )}

      {/* Delete line confirmation dialog */}
      <Dialog open={deleteLineId !== null} onClose={() => setDeleteLineId(null)}>
        <DialogTitle>Delete Expense Line</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this expense line? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteLineId(null)}>Cancel</Button>
          <Button onClick={confirmDeleteLine} color="error" autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

