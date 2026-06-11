/**
 * Main App Component
 * Sets up routing and layout for Badge System Dashboard
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import DashboardPage from './features/dashboard/pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import { PlanningPage } from './features/planning/pages/PlanningPage';
import { EmployeeShiftsPage } from './features/planning/pages/EmployeeShiftsPage';
import { CorrectionsPage } from './features/corrections/pages/CorrectionsPage';
import { SitesPage } from './features/sites/pages/SitesPage';
import { AdminPage } from './features/admin/pages/AdminPage';
import SummaryPage from './pages/SummaryPage';

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

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          {/* Auth Routes */}
          <Route path="/login" element={<LoginPage />} />

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
      </Router>
    </ThemeProvider>
  );
}

export default App;
