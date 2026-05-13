/**
 * StatusChip — renders a color-coded MUI Chip for expense report status values.
 */

import Chip from '@mui/material/Chip';

interface StatusChipProps {
  status: string;
}

function getChipColor(status: string): 'default' | 'primary' | 'success' | 'error' {
  switch (status) {
    case 'Submitted':
      return 'primary';
    case 'Scheduled for Payment':
      return 'success';
    case 'Rejected':
      return 'error';
    default:
      return 'default';
  }
}

export function StatusChip({ status }: StatusChipProps) {
  return <Chip label={status} color={getChipColor(status)} size="small" />;
}
