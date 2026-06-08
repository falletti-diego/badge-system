import apiClient from './apiClient';
const TOKEN_KEY = 'badge_auth_token';
const REFRESH_TOKEN_KEY = 'badge_refresh_token';
const USER_KEY = 'badge_user';
const EMPLOYEE_ID_KEY = 'badge_employee_id';
const SITE_ID_KEY = 'badge_site_id';

/**
 * Authentication Service
 * Handles login, logout, token management
 */
const authService = {
  /**
   * Login with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise} Response with token and user data
   */
  async login(email, password) {
    try {
      const response = await apiClient.post('/api/auth/login', {
        email,
        password,
      });

      if (response.data.data && response.data.data.token) {
        const { token, refresh_token, user } = response.data.data;
        localStorage.setItem(TOKEN_KEY, token);
        if (refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        // Store employee_id if present (for employee role users)
        if (user.employee_id) {
          localStorage.setItem(EMPLOYEE_ID_KEY, user.employee_id);
        } else {
          localStorage.removeItem(EMPLOYEE_ID_KEY);
        }
        // Store site_id if present (for manager role users assigned to specific store)
        if (user.site_id) {
          localStorage.setItem(SITE_ID_KEY, user.site_id);
        } else {
          localStorage.removeItem(SITE_ID_KEY);
        }
      }

      return response.data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },

  /**
   * Logout user
   * Clears token and user data from localStorage
   * Optionally calls backend logout endpoint for audit logging
   */
  async logout() {
    const token = this.getToken();

    // Optional: Call backend logout endpoint for audit logging
    if (token) {
      try {
        await apiClient.post('/api/auth/logout', {});
      } catch (error) {
        console.warn('Logout endpoint call failed:', error);
        // Continue with local cleanup even if endpoint fails
      }
    }

    // Clear localStorage
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(EMPLOYEE_ID_KEY);
    localStorage.removeItem(SITE_ID_KEY);
  },

  /**
   * Get stored token from localStorage
   * @returns {string|null} JWT token or null if not found
   */
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  /**
   * Get stored user data from localStorage
   * @returns {object|null} User object or null if not found
   */
  getUser() {
    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  },

  getRefreshToken() {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  /**
   * Use the refresh token to get a new access token (called by apiClient interceptor).
   * Returns the new access token string, or throws if refresh fails.
   */
  async refreshAccessToken() {
    const refresh_token = this.getRefreshToken();
    if (!refresh_token) throw new Error('No refresh token');
    const response = await apiClient.post('/api/auth/refresh', { refresh_token });
    const { token } = response.data.data;
    localStorage.setItem(TOKEN_KEY, token);
    return token;
  },

  /**
   * Check if user is authenticated
   * @returns {boolean} True if token exists
   */
  isAuthenticated() {
    return !!this.getToken();
  },

  /**
   * Get employee ID from localStorage (for employee role users)
   * @returns {string|null} Employee ID or null if not found
   */
  getEmployeeId() {
    return localStorage.getItem(EMPLOYEE_ID_KEY);
  },

  /**
   * Get site ID from localStorage (for manager role users assigned to store)
   * @returns {string|null} Site ID or null if not found
   */
  getSiteId() {
    return localStorage.getItem(SITE_ID_KEY);
  },

  /**
   * Get user role from localStorage
   * @returns {string|null} User role (admin, manager, employee) or null if not found
   */
  getUserRole() {
    const user = this.getUser();
    return user?.role || null;
  },

  /**
   * Check if user is an employee
   * @returns {boolean} True if user role is 'employee'
   */
  isEmployee() {
    return this.getUserRole() === 'employee';
  },

};
// Interceptors are handled by apiClient — no setup needed here

export default authService;
