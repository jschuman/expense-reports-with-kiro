/**
 * StatusHistoryTable — renders a read-only table of status audit log entries.
 * Each row shows a color-coded StatusChip and a human-readable formatted date.
 * No sorting, filtering, pagination, or interactive controls.
 */

import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

import { StatusChip } from './StatusChip';
import { formatUtcDate } from '../utils/formatDate';
import type { StatusAuditLogEntry } from '../types/expenseReport';

interface StatusHistoryTableProps {
  entries: StatusAuditLogEntry[];
}

export function StatusHistoryTable({ entries }: StatusHistoryTableProps) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableCell>Status</TableCell>
          <TableCell>Date</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell>
              <StatusChip status={entry.status} />
            </TableCell>
            <TableCell>{formatUtcDate(entry.changed_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
