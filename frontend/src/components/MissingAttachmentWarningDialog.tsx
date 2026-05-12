/**
 * MissingAttachmentWarningDialog
 *
 * Modal dialog shown when a user attempts to submit an expense report that has
 * one or more lines without attachments.
 *
 * The dialog shows the count of lines missing attachments and offers two
 * choices:
 *  - "Add Attachments" → closes dialog and returns the user to the editor
 *  - "Submit Without Attachments" → proceeds with submission as-is
 *
 * Props:
 *  - open                — controls dialog visibility
 *  - missingCount        — number of lines without attachments
 *  - onAddAttachments    — called when "Add Attachments" is clicked
 *  - onSubmitWithout     — called when "Submit Without Attachments" is clicked
 *
 * Requirements: 5.2, 5.3, 5.4, 5.5
 */

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Box from '@mui/material/Box';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MissingAttachmentWarningDialogProps {
  open: boolean;
  missingCount: number;
  onAddAttachments: () => void;
  onSubmitWithout: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MissingAttachmentWarningDialog({
  open,
  missingCount,
  onAddAttachments,
  onSubmitWithout,
}: MissingAttachmentWarningDialogProps) {
  const lineWord = missingCount === 1 ? 'line is' : 'lines are';

  return (
    <Dialog
      open={open}
      aria-labelledby="missing-attachment-dialog-title"
      data-testid="missing-attachment-dialog"
    >
      <DialogTitle id="missing-attachment-dialog-title">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon color="warning" />
          Missing Attachments
        </Box>
      </DialogTitle>

      <DialogContent>
        <DialogContentText data-testid="missing-attachment-message">
          {missingCount} expense report {lineWord} missing{' '}
          {missingCount === 1 ? 'an attachment' : 'attachments'}. Would you like to add
          attachments before submitting?
        </DialogContentText>
      </DialogContent>

      <DialogActions>
        <Button
          onClick={onAddAttachments}
          variant="contained"
          data-testid="add-attachments-button"
        >
          Add Attachments
        </Button>
        <Button
          onClick={onSubmitWithout}
          color="warning"
          data-testid="submit-without-button"
        >
          Submit Without Attachments
        </Button>
      </DialogActions>
    </Dialog>
  );
}
