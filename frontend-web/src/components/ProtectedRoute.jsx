import { Navigate } from 'react-router-dom';
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
  const { user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
