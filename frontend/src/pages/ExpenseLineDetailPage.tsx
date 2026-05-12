/**
 * ExpenseLineDetailPage — form page for creating and editing expense lines.
 *
 * Create mode (/reports/:reportId/lines/new): empty form; on submit calls createLine;
 * on success navigates to /reports/${reportId}/edit.
 *
 * Edit mode (/reports/:reportId/lines/:lineId/edit): fetches lines via useExpenseLines,
 * finds the matching line, pre-populates the form; on submit calls updateLine;
 * on success navigates to /reports/${reportId}/edit.
 *
 * Client-side validation mirrors Pydantic rules. Server 422 errors are displayed as
 * field-level messages; other server errors (409) are displayed as an Alert.
 *
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.2, 3.3, 3.4, 3.5, 3.8
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useExpenseLines } from '../hooks/useExpenseLines';
import { ApiError } from '../api/client';
import { getAttachmentMetadata } from '../api/attachments';
import { AttachmentUploadComponent } from '../components/AttachmentUploadComponent';
import { AttachmentDisplayComponent } from '../components/AttachmentDisplayComponent';
import type { AttachmentMetadata, AttachmentUploadError } from '../types/attachments';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldErrors {
  description?: string;
  amount?: string;
  incurred_date?: string;
}

type ValidationErrorItem = {
  loc: string[];
  msg: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Attempts to parse a FastAPI 422 detail JSON string into field-level error messages.
 * Returns null if parsing fails or no recognised field errors are present.
 */
function parseFieldErrors(message: string): FieldErrors | null {
  try {
    const items = JSON.parse(message) as ValidationErrorItem[];
    if (!Array.isArray(items)) return null;
    const errors: FieldErrors = {};
    for (const item of items) {
      const field = item.loc[item.loc.length - 1] as keyof FieldErrors;
      if (field && Object.prototype.hasOwnProperty.call({ description: 0, amount: 0, incurred_date: 0 }, field) && !errors[field]) {
        errors[field] = item.msg;
      }
    }
    return Object.keys(errors).length > 0 ? errors : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExpenseLineDetailPage() {
  const { reportId, lineId } = useParams<{ reportId: string; lineId?: string }>();
  const navigate = useNavigate();

  const reportIdNum = Number(reportId);
  const lineIdNum = lineId !== undefined ? Number(lineId) : undefined;
  const isEditMode = lineIdNum !== undefined;

  const { lines, isLoading, handleCreate, handleUpdate } = useExpenseLines(reportIdNum);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [incurredDate, setIncurredDate] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Attachment state — only relevant in edit mode
  const [attachmentMetadata, setAttachmentMetadata] = useState<AttachmentMetadata | null>(null);

  const fetchAttachment = useCallback(async () => {
    if (!isEditMode || lineIdNum === undefined) return;
    try {
      const metadata = await getAttachmentMetadata(reportIdNum, lineIdNum);
      setAttachmentMetadata(metadata);
    } catch (err) {
      // 404 means no attachment exists yet — treat as null, not an error
      if (err instanceof ApiError && err.status === 404) {
        setAttachmentMetadata(null);
      }
      // Other errors are silently ignored; the display component handles its own errors
    }
  }, [isEditMode, reportIdNum, lineIdNum]);

  // Fetch attachment metadata on mount (edit mode only)
  useEffect(() => {
    void fetchAttachment();
  }, [fetchAttachment]);

  const existingLine = isEditMode ? lines.find((l) => l.id === lineIdNum) : undefined;

  // Pre-populate form in edit mode once the line is available
  useEffect(() => {
    if (existingLine) {
      setDescription(existingLine.description);
      setAmount(String(existingLine.amount));
      setIncurredDate(existingLine.incurred_date);
    }
  }, [existingLine]);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!description.trim()) {
      errors.description = 'Description is required';
    }
    const amountNum = Number(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      errors.amount = 'Amount must be greater than 0';
    }
    if (!incurredDate) {
      errors.incurred_date = 'Date is required';
    }
    return errors;
  }

  function handleAttachmentUploadSuccess(metadata: AttachmentMetadata) {
    setAttachmentMetadata(metadata);
  }

  function handleAttachmentUploadError(_error: AttachmentUploadError) {
    // AttachmentUploadComponent displays its own inline error; nothing extra needed.
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    const formData = {
      description: description.trim(),
      amount: Number(amount),
      incurred_date: incurredDate,
    };

    try {
      if (isEditMode && lineIdNum !== undefined) {
        await handleUpdate(lineIdNum, formData);
      } else {
        await handleCreate(formData);
      }
      navigate(`/reports/${reportId}/edit`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const parsed = parseFieldErrors(err.message);
        if (parsed) {
          setFieldErrors(parsed);
          return;
        }
      }
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setServerError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Show spinner while loading in edit mode
  if (isEditMode && isLoading) {
    return (
      <Container sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Box mb={3}>
        <Typography variant="h4" component="h1">
          {isEditMode ? 'Edit Expense Line' : 'Add Expense Line'}
        </Typography>
      </Box>

      {serverError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {serverError}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
        <TextField
          id="description"
          label="Description"
          fullWidth
          margin="normal"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={Boolean(fieldErrors.description)}
          helperText={fieldErrors.description ?? ' '}
          disabled={isSubmitting}
          required
        />
        <TextField
          id="amount"
          label="Amount"
          fullWidth
          margin="normal"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={Boolean(fieldErrors.amount)}
          helperText={fieldErrors.amount ?? ' '}
          disabled={isSubmitting}
          required
          inputProps={{ min: 0.01, step: 'any' }}
        />
        <TextField
          id="incurred_date"
          label="Date"
          fullWidth
          margin="normal"
          type="date"
          value={incurredDate}
          onChange={(e) => setIncurredDate(e.target.value)}
          error={Boolean(fieldErrors.incurred_date)}
          helperText={fieldErrors.incurred_date ?? ' '}
          disabled={isSubmitting}
          required
          InputLabelProps={{ shrink: true }}
        />

        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isEditMode ? 'Save Changes' : 'Add Line'}
          </Button>
          <Button
            type="button"
            variant="outlined"
            onClick={() => navigate(`/reports/${reportId}/edit`)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </Box>
      </Box>

      {/* Attachment section — only available after the line has been saved */}
      {isEditMode && lineIdNum !== undefined && (
        <Box sx={{ mt: 4 }} data-testid="attachment-section">
          <Divider sx={{ mb: 3 }} />
          <Typography variant="h6" gutterBottom>
            Attachment
          </Typography>

          <Box sx={{ mb: 3 }}>
            <AttachmentDisplayComponent
              reportId={reportIdNum}
              lineId={lineIdNum}
              attachment={attachmentMetadata}
              onRefresh={fetchAttachment}
            />
          </Box>

          <AttachmentUploadComponent
            reportId={reportIdNum}
            lineId={lineIdNum}
            onUploadSuccess={handleAttachmentUploadSuccess}
            onUploadError={handleAttachmentUploadError}
          />
        </Box>
      )}
    </Container>
  );
}
