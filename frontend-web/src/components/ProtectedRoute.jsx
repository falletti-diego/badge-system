import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import authService from '../services/authService';
import { useAuth } from '../hooks/useAuth';

/**
 * ProtectedRoute - Wrapper for routes that require authentication and/or specific role
 * Redirects to /login if not authenticated, /dashboard if role doesn't match
 *
 * Usage:
 * <Route path="/planning" element={<ProtectedRoute requiredRole="manager"><PlanningPage /></ProtectedRoute>} />
 */
export default function ProtectedRoute({ children, requiredRole = null }) {
  const isAuthenticated = authService.isAuthenticated();
  const { user, loading } = useAuth();

  // Wait for user data to load before checking role
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // FIXED: Check user exists before checking role (prevent dashboard access for unauthenticated users)
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
