/**
 * ErrorAlert — renders an MUI Alert with severity "error".
 * Returns null when message is falsy.
 */

import Alert from '@mui/material/Alert';

interface ErrorAlertProps {
  message: string | null;
}

export function ErrorAlert({ message }: ErrorAlertProps) {
  if (!message) {
    return null;
  }

  return (
    <Alert severity="error" sx={{ mt: 2 }}>
      {message}
    </Alert>
  );
}
