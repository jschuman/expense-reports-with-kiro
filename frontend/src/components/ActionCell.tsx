import React from 'react';
import IconButton from '@mui/material/IconButton';
import Visibility from '@mui/icons-material/Visibility';
import Edit from '@mui/icons-material/Edit';
import Delete from '@mui/icons-material/Delete';
import Send from '@mui/icons-material/Send';
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
  submit: { icon: <Send fontSize="small" />, label: 'Submit' },
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

  const handlers: Record<ActionType, () => void> = {
    view: () => onView(report.id),
    edit: () => onEdit(report.id),
    delete: () => onDelete(report.id),
    submit: () => onSubmit(report.id),
    accept: () => onAccept(report.id),
    reject: () => onReject(report.id),
  };

  return (
    <>
      {actions.map((action) => {
        const config = actionConfig[action];
        return (
          <IconButton
            key={action}
            size="small"
            aria-label={`${config.label} ${report.title}`}
            onClick={handlers[action]}
          >
            {config.icon}
          </IconButton>
        );
      })}
    </>
  );
}
