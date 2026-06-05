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
export default function ProtectedRoute({ children, requiredRole = null, requiredRoles = null }) {
  const isAuthenticated = authService.isAuthenticated();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Support both requiredRole (string) and requiredRoles (array)
  const allowed = requiredRoles ?? (requiredRole ? [requiredRole] : null);
  if (allowed && !allowed.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
