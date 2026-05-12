/**
 * AttachmentDisplayComponent
 *
 * Shows the current attachment for an expense report line.  When an attachment
 * is present it displays the file name, size and upload timestamp together with
 * Download and Delete action buttons.  When no attachment exists the buttons
 * are disabled and a placeholder message is shown.
 *
 * A confirmation dialog is presented before the delete action is executed.
 *
 * Props:
 *  - reportId / lineId  — identify the target line
 *  - attachment         — current AttachmentMetadata, or null when none exists
 *  - onRefresh          — called after a successful delete so the parent can
 *                         reload the attachment state
 */

import { useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';

import { deleteAttachment, downloadAttachment } from '../api/attachments';
import type { AttachmentMetadata } from '../types/attachments';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AttachmentDisplayComponentProps {
  reportId: number;
  lineId: number;
  attachment: AttachmentMetadata | null;
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AttachmentDisplayComponent({
  reportId,
  lineId,
  attachment,
  onRefresh,
}: AttachmentDisplayComponentProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleDownload = useCallback(async () => {
    try {
      await downloadAttachment(reportId, lineId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Download failed. Please try again.';
      setErrorMessage(message);
    }
  }, [reportId, lineId]);

  const handleDeleteClick = useCallback(() => {
    setConfirmOpen(true);
  }, []);

  const handleDeleteCancel = useCallback(() => {
    setConfirmOpen(false);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    setConfirmOpen(false);
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await deleteAttachment(reportId, lineId);
      setIsDeleting(false);
      onRefresh();
    } catch (err) {
      setIsDeleting(false);
      const message =
        err instanceof Error ? err.message : 'Delete failed. Please try again.';
      setErrorMessage(message);
    }
  }, [reportId, lineId, onRefresh]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const hasAttachment = attachment !== null;

  return (
    <Box>
      {/* Metadata or placeholder */}
      {hasAttachment ? (
        <Box data-testid="attachment-info" sx={{ mb: 1 }}>
          <Typography variant="body2" fontWeight="bold" data-testid="attachment-filename">
            {attachment.file_name}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" data-testid="attachment-filesize">
            {formatBytes(attachment.file_size)}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" data-testid="attachment-date">
            Uploaded {formatDate(attachment.created_at)}
          </Typography>
        </Box>
      ) : (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 1 }}
          data-testid="no-attachment-message"
        >
          No attachment uploaded.
        </Typography>
      )}

      {/* Action buttons */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<DownloadIcon />}
          disabled={!hasAttachment}
          onClick={handleDownload}
          data-testid="download-button"
        >
          Download
        </Button>

        <Button
          variant="outlined"
          size="small"
          color="error"
          startIcon={<DeleteIcon />}
          disabled={!hasAttachment || isDeleting}
          onClick={handleDeleteClick}
          data-testid="delete-button"
        >
          {isDeleting ? 'Deleting…' : 'Delete'}
        </Button>
      </Box>

      {/* Error message */}
      {errorMessage !== null && (
        <Alert severity="error" sx={{ mt: 2 }} data-testid="error-message">
          {errorMessage}
        </Alert>
      )}

      {/* Confirmation dialog */}
      <Dialog
        open={confirmOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-confirm-title"
        data-testid="confirm-dialog"
      >
        <DialogTitle id="delete-confirm-title">Delete attachment?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete{' '}
            <strong>{attachment?.file_name ?? 'this attachment'}</strong>? This action cannot
            be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} data-testid="cancel-delete-button">
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            autoFocus
            data-testid="confirm-delete-button"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
