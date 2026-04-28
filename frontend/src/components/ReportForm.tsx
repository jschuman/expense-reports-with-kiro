/**
 * ReportForm — controlled MUI form for creating an expense report.
 * Validates with expenseReportCreateSchema (Zod) on submit.
 * Displays inline FormHelperText errors per field on validation failure.
 *
 * Fields:
 *  - title (required)
 *  - description (optional, multiline)
 *  - total_amount (required, positive number)
 *  - reimbursable_from_client (boolean checkbox, default false)
 *  - client (dropdown from useClients(), required when reimbursable=true)
 */

import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import { expenseReportCreateSchema, type ExpenseReportFormData } from '../types/schemas';
import { useClients } from '../hooks/useClients';

interface ReportFormProps {
  onSubmit: (data: ExpenseReportFormData) => Promise<void>;
  isSubmitting: boolean;
}

interface FieldErrors {
  title?: string;
  description?: string;
  total_amount?: string;
  reimbursable_from_client?: string;
  client?: string;
}

export function ReportForm({ onSubmit, isSubmitting }: ReportFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [reimbursableFromClient, setReimbursableFromClient] = useState(false);
  const [client, setClient] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const { clients, isLoading: clientsLoading } = useClients();

  function handleReimbursableChange(checked: boolean) {
    setReimbursableFromClient(checked);
    // Clear client value when unchecking so stale value is not submitted
    if (!checked) {
      setClient('');
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const rawData = {
      title,
      description: description || undefined,
      total_amount: totalAmount === '' ? NaN : Number(totalAmount),
      reimbursable_from_client: reimbursableFromClient,
      client: reimbursableFromClient && client ? client : undefined,
    };

    const result = expenseReportCreateSchema.safeParse(rawData);

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
    await onSubmit(result.data);
  }

  return (
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
      <Button
        type="submit"
        variant="contained"
        fullWidth
        sx={{ mt: 2 }}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Submitting…' : 'Submit Report'}
      </Button>
    </Box>
  );
}
