/**
 * useAuth hook — manages authentication state.
 * Restores session on mount via getSession(), exposes login/logout actions.
 * On any 401 from a protected call, clears state (redirect handled by ProtectedRoute).
 */

import { useState, useEffect } from 'react';
import type { UserResponse, LoginRequest } from '../types/auth';
import { ApiError } from '../api/client';
import * as authApi from '../api/auth';

interface UseAuthReturn {
  user: UserResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<UserResponse>;
  logout: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    authApi.getSession().then((sessionUser) => {
      if (cancelled) return;
      if (sessionUser) {
        setUser(sessionUser);
        setIsAuthenticated(true);
      }
      setIsLoading(false);
    }).catch(() => {
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function login(credentials: LoginRequest): Promise<UserResponse> {
    try {
      const loggedInUser = await authApi.login(credentials);
      setUser(loggedInUser);
      setIsAuthenticated(true);
      return loggedInUser;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setIsAuthenticated(false);
      }
      throw err;
    }
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setIsAuthenticated(false);
    }
  }

  return { user, isAuthenticated, isLoading, login, logout };
}
