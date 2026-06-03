import axios from 'axios';

const API_URL = window.API_CONFIG?.API_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000';
const TOKEN_KEY = 'badge_auth_token';
const USER_KEY = 'badge_user';

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
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        email,
        password,
      });

      if (response.data.data && response.data.data.token) {
        const { token, user } = response.data.data;
        // Store token in localStorage
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
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
        await axios.post(
          `${API_URL}/api/auth/logout`,
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
      } catch (error) {
        console.warn('Logout endpoint call failed:', error);
        // Continue with local cleanup even if endpoint fails
      }
    }

    // Clear localStorage
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
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

  /**
   * Check if user is authenticated
   * @returns {boolean} True if token exists
   */
  isAuthenticated() {
    return !!this.getToken();
  },

  /**
   * Set Authorization header for all future axios requests
   * Call this after successful login or on app initialization
   */
  setupInterceptors() {
    // Add Authorization header to all requests
    axios.interceptors.request.use(
      (config) => {
        const token = this.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Handle 401 responses (token expired or invalid)
    axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          console.error('❌ 401 UNAUTHORIZED!', {
            path: error.config?.url,
            token: this.getToken() ? 'EXISTS' : 'MISSING',
            response: error.response?.data,
          });
          // Token expired or invalid
          this.logout();
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  },
};

// Setup interceptors on module load
authService.setupInterceptors();

export default authService;
