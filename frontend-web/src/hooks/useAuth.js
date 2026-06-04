import { useEffect, useState } from 'react';
import authService from '../services/authService';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get user data from authService (stored in localStorage during login)
    const userData = authService.getUser();
    if (userData) {
      // Add additional fields from authService methods
      const enhancedUser = {
        ...userData,
        role: authService.getUserRole(),
        site_id: authService.getSiteId(),
        employee_id: authService.getEmployeeId(),
      };
      setUser(enhancedUser);
    }
    setLoading(false);
  }, []);

  return { user, loading };
};
