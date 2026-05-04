/**
 * EditReportPage — page for editing an existing expense report.
 *
 * Fetches the report by ID from the reports list (already loaded in useReports),
 * pre-fills all editable fields, and calls handleUpdate on submit.
 * On success: navigates back to the Dashboard (/). On API error: shows ErrorAlert.
 *
 * Only reachable for reports in "In Progress" or "Rejected" state — the backend
 * enforces this; the frontend redirects to / if the report is not found.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Container from '@mui/material/Container';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useReports } from '../hooks/useReports';
import { useClients } from '../hooks/useClients';
import { ErrorAlert } from '../components/ErrorAlert';
import { expenseReportUpdateSchema } from '../types/schemas';

interface FieldErrors {
  title?: string;
  description?: string;
  total_amount?: string;
  client?: string;
}

export function EditReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const { reports, handleUpdate } = useReports();
  const { clients, isLoading: clientsLoading } = useClients();
  const navigate = useNavigate();

  const report = reports.find((r) => r.id === Number(reportId));

  // Pre-fill state from the existing report
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [reimbursableFromClient, setReimbursableFromClient] = useState(false);
  const [client, setClient] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Populate fields once the report is available
  useEffect(() => {
    if (report) {
      setTitle(report.title);
      setDescription(report.description ?? '');
      setTotalAmount(String(report.total_amount));
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
      total_amount: totalAmount === '' ? undefined : Number(totalAmount),
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
      await handleUpdate(Number(reportId), result.data);
      navigate('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update report';
      setApiError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!report) {
    return null; // redirect effect will fire
  }

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
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
        <TextField
          id="total_amount"
          label="Total Amount"
          fullWidth
          margin="normal"
          type="number"
          value={totalAmount}
          onChange={(e) => setTotalAmount(e.target.value)}
          error={Boolean(errors.total_amount)}
          helperText={errors.total_amount ?? ' '}
          disabled={isSubmitting}
          inputProps={{ min: 0, step: 'any' }}
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
    </Container>
  );
}
