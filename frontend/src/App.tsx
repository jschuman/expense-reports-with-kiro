/**
 * App — root component that configures React Router.
 *
 * Public routes:
 *   /login  → LoginPage
 *
 * Protected routes (require authentication via ProtectedRoute):
 *   /                                       → DashboardPage
 *   /reports/new                            → CreateReportPage
 *   /reports/:reportId                      → ExpenseReportDetailPage (read-only view)
 *   /reports/:reportId/edit                 → EditReportPage (includes lines management)
 *   /reports/:reportId/lines/new            → ExpenseLineDetailPage
 *   /reports/:reportId/lines/:lineId/edit   → ExpenseLineDetailPage
 *
 * Any unmatched path redirects to /.
 */

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CreateReportPage } from './pages/CreateReportPage';
import { EditReportPage } from './pages/EditReportPage';
import { ExpenseReportDetailPage } from './pages/ExpenseReportDetailPage';
import { ExpenseLineDetailPage } from './pages/ExpenseLineDetailPage';

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
          <Route path="/reports/:reportId" element={<ExpenseReportDetailPage />} />
          <Route path="/reports/:reportId/edit" element={<EditReportPage />} />
          <Route path="/reports/:reportId/lines/new" element={<ExpenseLineDetailPage />} />
          <Route path="/reports/:reportId/lines/:lineId/edit" element={<ExpenseLineDetailPage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
