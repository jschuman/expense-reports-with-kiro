/**
 * RejectDialog — MUI Dialog for an admin to provide rejection notes.
 *
 * Props:
 *  - open: controls dialog visibility
 *  - onClose: called when the dialog is dismissed (Cancel or backdrop click)
 *  - onConfirm(adminNotes: string): called with the trimmed notes on Confirm
 *
 * The Confirm button is disabled until admin_notes contains at least one
 * non-whitespace character. State is reset when the dialog closes.
 *
 * Requirements: 6.1, 6.2, 6.3
 */

import { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';

interface RejectDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (adminNotes: string) => void;
}

export function RejectDialog({ open, onClose, onConfirm }: RejectDialogProps) {
  const [adminNotes, setAdminNotes] = useState('');

  // Reset the field whenever the dialog opens so stale input is never reused.
  useEffect(() => {
    if (open) {
      setAdminNotes('');
    }
  }, [open]);

  const isConfirmDisabled = adminNotes.trim() === '';

  function handleConfirm() {
    if (isConfirmDisabled) return;
    onConfirm(adminNotes.trim());
    setAdminNotes('');
  }

  function handleCancel() {
    setAdminNotes('');
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleCancel} fullWidth maxWidth="sm">
      <DialogTitle>Reject Expense Report</DialogTitle>

      <DialogContent>
        <TextField
          autoFocus
          label="Reason for rejection"
          placeholder="Provide a reason so the owner can correct and resubmit"
          multiline
          minRows={3}
          fullWidth
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
          inputProps={{ 'aria-label': 'admin notes' }}
          sx={{ mt: 1 }}
        />
      </DialogContent>

      <DialogActions>
        <Button onClick={handleCancel} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="error"
          disabled={isConfirmDisabled}
        >
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}
