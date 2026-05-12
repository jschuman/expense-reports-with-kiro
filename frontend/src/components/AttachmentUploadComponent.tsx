/**
 * AttachmentUploadComponent
 *
 * Drag-and-drop / file-picker upload zone for a single expense report line
 * attachment.  Accepts the whitelisted file types (PDF, Word, Excel, Google
 * Docs / Sheets).
 *
 * Props:
 *  - reportId / lineId  — identify the target line
 *  - onUploadSuccess    — called with AttachmentMetadata after a successful upload
 *  - onUploadError      — called with AttachmentUploadError on failure
 */

import { useCallback, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import { uploadAttachment } from '../api/attachments';
import type { AttachmentMetadata, AttachmentUploadError } from '../types/attachments';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Accepted MIME types — mirrors the backend whitelist. */
const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.google-apps.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.google-apps.spreadsheet',
].join(',');

const ERROR_MESSAGES: Record<AttachmentUploadError['type'], string> = {
  INVALID_FILE_TYPE:
    'File type not allowed. Please upload a PDF, Word document, Excel spreadsheet, or Google Docs/Sheets file.',
  INVALID_CONTENT:
    'The file content does not match its declared type. Please check the file and try again.',
  FILE_TOO_LARGE: 'File exceeds the 10 MB size limit. Please choose a smaller file.',
  NOT_FOUND: 'The expense report line was not found.',
  FORBIDDEN: 'You do not have permission to upload attachments to this report.',
  UNAUTHORIZED: 'You are not authenticated. Please log in and try again.',
  NETWORK_ERROR: 'A network error occurred. Please check your connection and try again.',
  SERVER_ERROR: 'An unexpected server error occurred. Please try again later.',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AttachmentUploadComponentProps {
  reportId: number;
  lineId: number;
  onUploadSuccess: (metadata: AttachmentMetadata) => void;
  onUploadError: (error: AttachmentUploadError) => void;
}

export function AttachmentUploadComponent({
  reportId,
  lineId,
  onUploadSuccess,
  onUploadError,
}: AttachmentUploadComponentProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setErrorMessage(null);
      setIsUploading(true);
      setProgress(0);

      try {
        const metadata = await uploadAttachment(reportId, lineId, file, (pct) => {
          setProgress(pct);
        });
        setIsUploading(false);
        setProgress(0);
        onUploadSuccess(metadata);
      } catch (err) {
        setIsUploading(false);
        setProgress(0);
        const uploadError = err as AttachmentUploadError;
        const message =
          ERROR_MESSAGES[uploadError.type] ?? uploadError.message ?? 'Upload failed.';
        setErrorMessage(message);
        onUploadError(uploadError);
      }
    },
    [reportId, lineId, onUploadSuccess, onUploadError],
  );

  // -------------------------------------------------------------------------
  // Drag-and-drop handlers
  // -------------------------------------------------------------------------

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        void handleFile(file);
      }
    },
    [handleFile],
  );

  // -------------------------------------------------------------------------
  // File-picker handler
  // -------------------------------------------------------------------------

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        void handleFile(file);
      }
      // Reset input so the same file can be re-selected after an error
      e.target.value = '';
    },
    [handleFile],
  );

  const handleButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Box>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_MIME_TYPES}
        style={{ display: 'none' }}
        onChange={handleInputChange}
        aria-label="file input"
        data-testid="file-input"
      />

      {/* Drag-and-drop zone */}
      <Box
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid="drop-zone"
        sx={{
          border: '2px dashed',
          borderColor: isDragOver ? 'primary.main' : 'grey.400',
          borderRadius: 2,
          p: 3,
          textAlign: 'center',
          backgroundColor: isDragOver ? 'action.hover' : 'background.paper',
          cursor: isUploading ? 'not-allowed' : 'pointer',
          transition: 'border-color 0.2s, background-color 0.2s',
        }}
      >
        <UploadFileIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />

        <Typography variant="body1" color="text.secondary" gutterBottom>
          Drag and drop a file here, or
        </Typography>

        <Button
          variant="contained"
          onClick={handleButtonClick}
          disabled={isUploading}
          data-testid="upload-button"
        >
          Choose File
        </Button>

        <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
          Accepted: PDF, Word (.docx, .doc), Excel (.xlsx, .xls), Google Docs, Google Sheets
          &nbsp;·&nbsp; Max 10 MB
        </Typography>
      </Box>

      {/* Upload progress */}
      {isUploading && (
        <Box sx={{ mt: 2 }} data-testid="progress-indicator">
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Uploading… {progress}%
          </Typography>
          <LinearProgress
            variant="determinate"
            value={progress}
            aria-label="upload progress"
          />
        </Box>
      )}

      {/* Error message */}
      {errorMessage !== null && (
        <Alert severity="error" sx={{ mt: 2 }} data-testid="error-message">
          {errorMessage}
        </Alert>
      )}
    </Box>
  );
}
