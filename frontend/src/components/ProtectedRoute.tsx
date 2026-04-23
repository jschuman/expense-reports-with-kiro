/**
 * ProtectedRoute — guards routes that require authentication.
 * While session is loading, renders nothing.
 * If not authenticated, redirects to /login.
 * Otherwise renders the nested route via <Outlet />.
 */

import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
