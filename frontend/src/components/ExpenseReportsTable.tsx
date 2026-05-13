/**
 * ExpenseReportsTable — renders expense reports in an MUI X DataGrid
 * with sorting, filtering, role-based column visibility, and row actions.
 *
 * Requirements: 1.1–1.8, 2.1–2.10, 3.1–3.9, 4.1–4.5, 5.1, 5.6, 6.1–6.3, 7.1–7.3
 */

import { useState, useMemo } from 'react';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import type { ExpenseReportResponse } from '../types/expenseReport';
import type { UserResponse } from '../types/auth';
import {
  formatCurrency,
  formatDate,
  displayOrPlaceholder,
  getVisibleColumns,
} from '../utils/tableUtils';
import { StatusChip } from './StatusChip';
import { ActionCell } from './ActionCell';
import { RejectDialog } from './RejectDialog';
import { EmptyState } from './EmptyState';

export interface ExpenseReportsTableProps {
  reports: ExpenseReportResponse[];
  isLoading: boolean;
  currentUser: UserResponse;
  onSubmit: (reportId: number) => Promise<void>;
  onAccept: (reportId: number) => Promise<void>;
  onReject: (reportId: number, adminNotes: string) => Promise<void>;
  onEdit: (reportId: number) => void;
  onDelete: (reportId: number) => Promise<void>;
  onView: (reportId: number) => void;
}

function NoMatchOverlay() {
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      height="100%"
    >
      <Typography color="text.secondary">No matching reports</Typography>
    </Box>
  );
}

function LoadingOverlay() {
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      height="100%"
      aria-label="Loading expense reports"
    >
      <CircularProgress />
    </Box>
  );
}

export function ExpenseReportsTable({
  reports,
  isLoading,
  currentUser,
  onSubmit,
  onAccept,
  onReject,
  onEdit,
  onDelete,
  onView,
}: ExpenseReportsTableProps) {
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingReportId, setRejectingReportId] = useState<number | null>(null);

  const handleRejectClick = (reportId: number) => {
    setRejectingReportId(reportId);
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = (adminNotes: string) => {
    if (rejectingReportId !== null) {
      onReject(rejectingReportId, adminNotes);
    }
    setRejectDialogOpen(false);
    setRejectingReportId(null);
  };

  const handleRejectClose = () => {
    setRejectDialogOpen(false);
    setRejectingReportId(null);
  };

  const allColumns: GridColDef[] = useMemo(
    () => [
      {
        field: 'title',
        headerName: 'Title',
        flex: 2,
        minWidth: 200,
        type: 'string',
      },
      {
        field: 'total_amount',
        headerName: 'Amount',
        width: 130,
        type: 'number',
        renderCell: (params) => formatCurrency(params.value),
        valueFormatter: (value: number) => value,
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 180,
        type: 'singleSelect',
        valueOptions: ['In Progress', 'Submitted', 'Scheduled for Payment', 'Rejected'],
        renderCell: (params) => <StatusChip status={params.value} />,
      },
      {
        field: 'owner_username',
        headerName: 'Owner',
        width: 140,
        type: 'string',
      },
      {
        field: 'created_at',
        headerName: 'Created',
        width: 180,
        type: 'dateTime',
        valueGetter: (value: string) => new Date(value),
        renderCell: (params) => formatDate(params.value),
      },
      {
        field: 'reimbursable_from_client',
        headerName: 'Reimbursable',
        width: 130,
        type: 'singleSelect',
        valueOptions: [true, false],
        valueFormatter: (value: boolean) => (value ? 'Yes' : 'No'),
        renderCell: (params) => (params.value ? 'Yes' : 'No'),
      },
      {
        field: 'client',
        headerName: 'Client',
        width: 140,
        type: 'string',
        renderCell: (params) => displayOrPlaceholder(params.value),
      },
      {
        field: 'admin_notes',
        headerName: 'Admin Notes',
        flex: 1,
        minWidth: 130,
        type: 'string',
        renderCell: (params) => displayOrPlaceholder(params.value),
      },
      {
        field: 'actions',
        headerName: 'Actions',
        width: 200,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (params) => (
          <ActionCell
            report={params.row}
            currentUser={currentUser}
            onSubmit={onSubmit}
            onAccept={onAccept}
            onReject={handleRejectClick}
            onEdit={onEdit}
            onDelete={onDelete}
            onView={onView}
          />
        ),
      },
    ],
    [currentUser, onSubmit, onAccept, onEdit, onDelete, onView]
  );

  const isAdmin = currentUser.role === 'Admin';
  const columns = useMemo(
    () => getVisibleColumns(allColumns, isAdmin),
    [allColumns, isAdmin]
  );

  return (
    <>
      <DataGrid
        rows={reports}
        columns={columns}
        loading={isLoading}
        getRowId={(row) => row.id}
        disableRowSelectionOnClick
        sortingOrder={['asc', 'desc', null]}
        slots={{
          noRowsOverlay: EmptyState,
          noResultsOverlay: NoMatchOverlay,
          loadingOverlay: LoadingOverlay,
        }}
        slotProps={{
          loadingOverlay: { 'aria-label': 'Loading expense reports' } as Record<string, string>,
        }}
        initialState={{
          sorting: { sortModel: [] },
          filter: { filterModel: { items: [] } },
        }}
      />
      <RejectDialog
        open={rejectDialogOpen}
        onClose={handleRejectClose}
        onConfirm={handleRejectConfirm}
      />
    </>
  );
}
