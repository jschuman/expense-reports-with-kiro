/**
 * useReports hook — manages expense report state.
 * Fetches reports on mount via listReports(), exposes createReport action.
 */

import { useState, useEffect } from 'react';
import type { ExpenseReportCreate, ExpenseReportResponse } from '../types/expenseReport';
import * as reportsApi from '../api/reports';

interface UseReportsReturn {
  reports: ExpenseReportResponse[];
  isLoading: boolean;
  error: string | null;
  createReport: (data: ExpenseReportCreate) => Promise<ExpenseReportResponse>;
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

  return { reports, isLoading, error, createReport };
}
