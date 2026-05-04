/**
 * useReports hook — manages expense report state.
 * Fetches reports on mount via listReports(), exposes createReport and
 * status-lifecycle action handlers (submit, accept, reject, update, delete).
 */

import { useState, useEffect } from 'react';
import type { ExpenseReportCreate, ExpenseReportResponse, ExpenseReportUpdate } from '../types/expenseReport';
import * as reportsApi from '../api/reports';

interface UseReportsReturn {
  reports: ExpenseReportResponse[];
  isLoading: boolean;
  error: string | null;
  createReport: (data: ExpenseReportCreate) => Promise<ExpenseReportResponse>;
  handleSubmit: (reportId: number) => Promise<void>;
  handleAccept: (reportId: number) => Promise<void>;
  handleReject: (reportId: number, adminNotes: string) => Promise<void>;
  handleUpdate: (reportId: number, data: ExpenseReportUpdate) => Promise<void>;
  handleDelete: (reportId: number) => Promise<void>;
}

export function useReports(): UseReportsReturn {
  const [reports, setReports] = useState<ExpenseReportResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    reportsApi.listReports().then((data) => {
      if (cancelled) return;
      setReports(data);
      setIsLoading(false);
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to load reports';
      setError(message);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function createReport(data: ExpenseReportCreate): Promise<ExpenseReportResponse> {
    const newReport = await reportsApi.createReport(data);
    setReports((prev) => [...prev, newReport]);
    return newReport;
  }

  /**
   * Submits a report (In Progress → Submitted, or Rejected → Submitted).
   * Updates the matching report in local state on success.
   */
  async function handleSubmit(reportId: number): Promise<void> {
    const updated = await reportsApi.submitReport(reportId);
    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? updated : r)),
    );
  }

  /**
   * Accepts a submitted report (Submitted → Scheduled for Payment).
   * Updates the matching report in local state on success.
   */
  async function handleAccept(reportId: number): Promise<void> {
    const updated = await reportsApi.acceptReport(reportId);
    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? updated : r)),
    );
  }

  /**
   * Rejects a submitted report (Submitted → Rejected) with admin notes.
   * Updates the matching report in local state on success.
   */
  async function handleReject(reportId: number, adminNotes: string): Promise<void> {
    const updated = await reportsApi.rejectReport(reportId, adminNotes);
    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? updated : r)),
    );
  }

  /**
   * Updates editable fields on a report (In Progress or Rejected state).
   * Updates the matching report in local state on success.
   */
  async function handleUpdate(reportId: number, data: ExpenseReportUpdate): Promise<void> {
    const updated = await reportsApi.updateReport(reportId, data);
    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? updated : r)),
    );
  }

  /**
   * Deletes a report (In Progress or Rejected state).
   * Removes the report from local state on success.
   */
  async function handleDelete(reportId: number): Promise<void> {
    await reportsApi.deleteReport(reportId);
    setReports((prev) => prev.filter((r) => r.id !== reportId));
  }

  return {
    reports,
    isLoading,
    error,
    createReport,
    handleSubmit,
    handleAccept,
    handleReject,
    handleUpdate,
    handleDelete,
  };
}
