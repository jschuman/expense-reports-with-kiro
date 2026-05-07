/**
 * useExpenseLines hook — manages expense line state for a specific report.
 * Fetches lines on mount and after each mutation via refetch().
 * Exposes refetch so parent components can refresh the report's total_amount after a line mutation.
 */

import { useState, useEffect } from 'react';
import type {
  ExpenseLineCreate,
  ExpenseLineResponse,
  ExpenseLineUpdate,
} from '../types/expenseReport';
import * as expenseLinesApi from '../api/expenseLines';

interface UseExpenseLinesReturn {
  lines: ExpenseLineResponse[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  handleCreate: (data: ExpenseLineCreate) => Promise<ExpenseLineResponse>;
  handleUpdate: (lineId: number, data: ExpenseLineUpdate) => Promise<void>;
  handleDelete: (lineId: number) => Promise<void>;
}

export function useExpenseLines(reportId: number): UseExpenseLinesReturn {
  const [lines, setLines] = useState<ExpenseLineResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetches lines for the report.
   * Called on mount and after each mutation.
   */
  async function fetchLines() {
    try {
      setIsLoading(true);
      setError(null);
      const data = await expenseLinesApi.listLines(reportId);
      setLines(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load lines';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await fetchLines();
      } catch {
        // Error is already handled in fetchLines
      }
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [reportId]);

  /**
   * Refetch lines for the report.
   * Exposed so parent components can refresh after mutations.
   */
  function refetch() {
    fetchLines();
  }

  /**
   * Creates a new expense line for the report.
   * Triggers refetch on success.
   */
  async function handleCreate(data: ExpenseLineCreate): Promise<ExpenseLineResponse> {
    const newLine = await expenseLinesApi.createLine(reportId, data);
    await refetch();
    return newLine;
  }

  /**
   * Updates an existing expense line.
   * Triggers refetch on success.
   */
  async function handleUpdate(lineId: number, data: ExpenseLineUpdate): Promise<void> {
    await expenseLinesApi.updateLine(reportId, lineId, data);
    await refetch();
  }

  /**
   * Deletes an expense line.
   * Triggers refetch on success.
   */
  async function handleDelete(lineId: number): Promise<void> {
    await expenseLinesApi.deleteLine(reportId, lineId);
    await refetch();
  }

  return {
    lines,
    isLoading,
    error,
    refetch,
    handleCreate,
    handleUpdate,
    handleDelete,
  };
}
