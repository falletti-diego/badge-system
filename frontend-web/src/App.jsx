/**
 * Main App Component
 * Sets up routing and layout for Badge System Dashboard
 */

import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import DashboardPage from './features/dashboard/pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import TryDemoPage from './pages/TryDemoPage';
import DemoExpiredPage from './pages/DemoExpiredPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import ProtectedRoute from './components/ProtectedRoute';
import { PlanningPage } from './features/planning/pages/PlanningPage';
import { EmployeeShiftsPage } from './features/planning/pages/EmployeeShiftsPage';
import { CorrectionsPage } from './features/corrections/pages/CorrectionsPage';
import { SitesPage } from './features/sites/pages/SitesPage';
import { AdminPage } from './features/admin/pages/AdminPage';
import { EmployeeLeaveRequest } from './features/leave/pages/EmployeeLeaveRequest';
import { ManagerLeaveRequest } from './features/leave/pages/ManagerLeaveRequest';
import { AdminLeaveManagement } from './features/leave/pages/AdminLeaveManagement';
import { EmployeeIllnessReport } from './features/illness/pages/EmployeeIllnessReport';
import { ManagerIllnessReport } from './features/illness/pages/ManagerIllnessReport';
import { AdminIllnessManagement } from './features/illness/pages/AdminIllnessManagement';
import SummaryPage from './pages/SummaryPage';
import { useTokenRefresh } from './hooks/useTokenRefresh';
import { setupAxiosInterceptor } from './lib/axiosInterceptor';
import apiClient from './services/apiClient';

// Create Material-UI theme with design system colors
const theme = createTheme({
  palette: {
    primary: {
      main: '#1E3A5F',
    },
    secondary: {
      main: '#2D7049',
    },
    success: {
      main: '#2D7049',
    },
    error: {
      main: '#C0392B',
    },
    warning: {
      main: '#B45309',
    },
    info: {
      main: '#1E3A5F',
    },
    background: {
      default: '#F5F2ED',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#2A2520',
      secondary: '#6B625A',
    },
  },
  typography: {
    fontFamily: '"DM Sans", sans-serif',
    h1: {
      fontFamily: '"Cormorant", serif',
      fontSize: '2.75rem',
      fontWeight: 700,
    },
    h2: {
      fontFamily: '"Cormorant", serif',
      fontSize: '2rem',
      fontWeight: 700,
    },
    h3: {
      fontFamily: '"Cormorant", serif',
      fontSize: '1.5rem',
      fontWeight: 700,
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 4,
  },
});

/**
 * PasswordChangeGuard Component
 * Watches for must_change_password flag and redirects to /change-password
 * Allows access to /change-password and /login only when password change is required
 */
export function PasswordChangeGuard({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Get must_change_password flag from localStorage
    const mustChangePassword = localStorage.getItem('badge_must_change_password') === 'true';

    // If password must be changed but user is NOT on /change-password, /login,
    // or the public self-service demo pages (/prova-demo and /demo-expired
    // must stay reachable by any anonymous visitor, even one with a stale
    // must_change_password flag left over from an earlier real session on
    // the same browser)
    if (
      mustChangePassword &&
      !location.pathname.startsWith('/change-password') &&
      location.pathname !== '/login' &&
      location.pathname !== '/prova-demo' &&
      location.pathname !== '/demo-expired'
    ) {
      // Force redirect to /change-password (fail-closed, Opzione A)
      navigate('/change-password', { replace: true });
    }
  }, [location.pathname, navigate]);

  return children;
}

function AppRouter() {
  const tokenRefresh = useTokenRefresh();

  // Setup axios interceptor for automatic token refresh on 401
  useEffect(() => {
    setupAxiosInterceptor(apiClient, () => tokenRefresh);
  }, [tokenRefresh]);

  return (
    <PasswordChangeGuard>
      <Routes>
        {/* Auth Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />

        {/* Public self-service demo landing page — no ProtectedRoute wrapper */}
        <Route path="/prova-demo" element={<TryDemoPage />} />

        {/* Public demo-expired page — shown when DEMO_EXPIRED is detected by
            apiClient.js's interceptor; no valid session exists by then, so
            this must be reachable without ProtectedRoute too */}
        <Route path="/demo-expired" element={<DemoExpiredPage />} />

          {/* Protected Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />

          {/* Planning Routes */}
          <Route
            path="/planning"
            element={
              <ProtectedRoute requiredRoles={['manager', 'admin']}>
                <PlanningPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/planning/my-schedule"
            element={
              <ProtectedRoute requiredRole="employee">
                <EmployeeShiftsPage />
              </ProtectedRoute>
            }
          />

          {/* Corrections Route */}
          <Route
            path="/corrections"
            element={
              <ProtectedRoute requiredRoles={['manager', 'admin']}>
                <CorrectionsPage />
              </ProtectedRoute>
            }
          />

          {/* Leave Request Route */}
          <Route
            path="/leave/request"
            element={
              <ProtectedRoute requiredRole="employee">
                <EmployeeLeaveRequest />
              </ProtectedRoute>
            }
          />

          {/* Manager Leave Request Route */}
          <Route
            path="/leave/my-request"
            element={
              <ProtectedRoute requiredRole="manager">
                <ManagerLeaveRequest />
              </ProtectedRoute>
            }
          />

          {/* Admin: Sites & QR Code management */}
          <Route
            path="/admin/sites"
            element={
              <ProtectedRoute requiredRole="admin">
                <SitesPage />
              </ProtectedRoute>
            }
          />

          {/* Admin panel: onboarding clienti/sedi/dipendenti */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminPage />
              </ProtectedRoute>
            }
          />

          {/* Admin: Leave Management */}
          <Route
            path="/admin/leave"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminLeaveManagement />
              </ProtectedRoute>
            }
          />

          {/* Manager: Report Illness */}
          <Route
            path="/illnesses/manager-report"
            element={
              <ProtectedRoute requiredRole="manager">
                <ManagerIllnessReport />
              </ProtectedRoute>
            }
          />

          {/* Employee: Report Illness */}
          <Route
            path="/illnesses/report"
            element={
              <ProtectedRoute requiredRole="employee">
                <EmployeeIllnessReport />
              </ProtectedRoute>
            }
          />

          {/* Admin: Illness Management */}
          <Route
            path="/admin/illnesses"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminIllnessManagement />
              </ProtectedRoute>
            }
          />

          {/* Monthly summary: admin, manager, viewer */}
          <Route
            path="/summary"
            element={
              <ProtectedRoute requiredRoles={['admin', 'manager', 'viewer']}>
                <SummaryPage />
              </ProtectedRoute>
            }
          />

        {/* Redirect unknown routes to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </PasswordChangeGuard>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <AppRouter />
      </Router>
    </ThemeProvider>
  );
}

export default App;
