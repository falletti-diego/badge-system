/**
 * Axios API Client Configuration
 * Centralized HTTP client with auth interceptor and error handling
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_TIMEOUT = parseInt(import.meta.env.VITE_API_TIMEOUT || '30000', 10);

/**
 * Initialize API client with default configuration
 */
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor: Add authorization token
 */
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token') || 'test-token-mvp-12345';
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor: Handle errors
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;

    if (status === 401) {
      // Unauthorized: clear token and redirect to login (avoid redirect loop)
      localStorage.removeItem('auth_token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    } else if (status === 403) {
      // Forbidden
      console.error('Access denied:', message);
    } else if (status >= 500) {
      // Server error
      console.error('Server error:', status, message);
    }

    return Promise.reject(error);
  }
);

export default apiClient;

/**
 * Helper function to set mock token
 */
export const setMockToken = (token = 'test-token-mvp-12345') => {
  localStorage.setItem('auth_token', token);
};

/**
 * Helper function to clear token
 */
export const clearToken = () => {
  localStorage.removeItem('auth_token');
};
