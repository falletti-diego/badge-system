import { Navigate } from 'react-router-dom';
import authService from '../services/authService';

/**
 * ProtectedRoute - Wrapper for routes that require authentication
 * Redirects to /login if user is not authenticated
 *
 * Usage:
 * <Routes>
 *   <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
 * </Routes>
 */
export default function ProtectedRoute({ children }) {
  const isAuthenticated = authService.isAuthenticated();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
