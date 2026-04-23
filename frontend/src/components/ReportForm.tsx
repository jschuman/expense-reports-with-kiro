/**
 * ReportForm — controlled MUI form for creating an expense report.
 * Validates with expenseReportCreateSchema (Zod) on submit.
 * Displays inline FormHelperText errors per field on validation failure.
 */

import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { expenseReportCreateSchema, type ExpenseReportFormData } from '../types/schemas';

interface ReportFormProps {
  onSubmit: (data: ExpenseReportFormData) => Promise<void>;
  isSubmitting: boolean;
}

interface FieldErrors {
  title?: string;
  purpose?: string;
  total_amount?: string;
}

export function ReportForm({ onSubmit, isSubmitting }: ReportFormProps) {
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const rawData = {
      title,
      purpose,
      total_amount: totalAmount === '' ? NaN : Number(totalAmount),
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
        id="purpose"
        label="Purpose"
        fullWidth
        margin="normal"
        multiline
        minRows={3}
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        error={Boolean(errors.purpose)}
        helperText={errors.purpose ?? ' '}
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
