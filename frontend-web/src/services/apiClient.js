/**
 * Axios API Client Configuration
 * Centralized HTTP client with auth interceptor and error handling
 */

import axios from 'axios';

// ?? (not ||) so that empty string '' is preserved as "same-origin" for Netlify proxy
const API_BASE_URL = window.API_CONFIG?.API_URL ?? import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
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
    const token = localStorage.getItem('badge_auth_token');
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
 * Response interceptor: auto-refresh access token on 401, then retry once.
 * If refresh fails (expired or missing), redirect to /login.
 */
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;
    const originalRequest = error.config;

    if (status === 401 && !originalRequest._retried && originalRequest.url !== '/api/auth/refresh') {
      if (isRefreshing) {
        // Queue concurrent requests while a refresh is in flight
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retried = true;
      isRefreshing = true;

      try {
        // Lazy import to avoid circular dep at module load time
        const authService = (await import('./authService')).default;
        const newToken = await authService.refreshAccessToken();
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        localStorage.removeItem('badge_auth_token');
        localStorage.removeItem('badge_refresh_token');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (status === 403) {
      console.error('Access denied:', message);
    } else if (status >= 500) {
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
  localStorage.setItem('badge_auth_token', token);
};

/**
 * Helper function to clear token
 */
export const clearToken = () => {
  localStorage.removeItem('badge_auth_token');
  localStorage.removeItem('auth_token');
};
