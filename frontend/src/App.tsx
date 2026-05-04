/**
 * App — root component that configures React Router.
 *
 * Public routes:
 *   /login  → LoginPage
 *
 * Protected routes (require authentication via ProtectedRoute):
 *   /            → DashboardPage
 *   /reports/new → CreateReportPage
 *
 * Any unmatched path redirects to /.
 */

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CreateReportPage } from './pages/CreateReportPage';
import { EditReportPage } from './pages/EditReportPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/reports/new" element={<CreateReportPage />} />
          <Route path="/reports/:reportId/edit" element={<EditReportPage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
