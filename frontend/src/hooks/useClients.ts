/**
 * useClients hook — fetches and caches the list of available clients.
 * Calls GET /clients on mount and exposes loading/error state.
 */

import { useState, useEffect } from 'react';
import { listClients } from '../api/clients';

interface UseClientsReturn {
  clients: string[];
  isLoading: boolean;
  error: string | null;
}

export function useClients(): UseClientsReturn {
  const [clients, setClients] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    listClients()
      .then((data) => {
        if (cancelled) return;
        setClients(data);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load clients';
        setError(message);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { clients, isLoading, error };
}
