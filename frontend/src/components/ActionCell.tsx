import React, { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Visibility from '@mui/icons-material/Visibility';
import Edit from '@mui/icons-material/Edit';
import Delete from '@mui/icons-material/Delete';
import AssignmentTurnedIn from '@mui/icons-material/AssignmentTurnedIn';
import CheckCircle from '@mui/icons-material/CheckCircle';
import Block from '@mui/icons-material/Block';
import type { ExpenseReportResponse } from '../types/expenseReport';
import type { UserResponse } from '../types/auth';
import { getRowActions, type ActionType } from '../utils/tableUtils';

export interface ActionCellProps {
  report: ExpenseReportResponse;
  currentUser: UserResponse;
  onSubmit: (reportId: number) => void;
  onAccept: (reportId: number) => void;
  onReject: (reportId: number) => void;
  onEdit: (reportId: number) => void;
  onDelete: (reportId: number) => void;
  onView: (reportId: number) => void;
}

const actionConfig: Record<ActionType, { icon: React.ReactElement; label: string }> = {
  view: { icon: <Visibility fontSize="small" />, label: 'View' },
  edit: { icon: <Edit fontSize="small" />, label: 'Edit' },
  delete: { icon: <Delete fontSize="small" />, label: 'Delete' },
  submit: { icon: <AssignmentTurnedIn fontSize="small" />, label: 'Submit' },
  accept: { icon: <CheckCircle fontSize="small" />, label: 'Accept' },
  reject: { icon: <Block fontSize="small" />, label: 'Reject' },
};

export function ActionCell({
  report,
  currentUser,
  onSubmit,
  onAccept,
  onReject,
  onEdit,
  onDelete,
  onView,
}: ActionCellProps) {
  const actions = getRowActions(report, currentUser);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handlers: Record<ActionType, () => void> = {
    view: () => onView(report.id),
    edit: () => onEdit(report.id),
    delete: () => setConfirmOpen(true),
    submit: () => onSubmit(report.id),
    accept: () => onAccept(report.id),
    reject: () => onReject(report.id),
  };

  return (
    <>
      {actions.map((action) => {
        const config = actionConfig[action];
        return (
          <Tooltip key={action} title={config.label}>
            <IconButton
              size="small"
              aria-label={`${config.label} ${report.title}`}
              onClick={handlers[action]}
            >
              {config.icon}
            </IconButton>
          </Tooltip>
        );
      })}

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Delete Report</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete &ldquo;{report.title}&rdquo;? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button
            color="error"
            onClick={() => {
              setConfirmOpen(false);
              onDelete(report.id);
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
