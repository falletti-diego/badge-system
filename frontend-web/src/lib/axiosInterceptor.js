/**
 * Axios Response Interceptor for Token Refresh (S.32.7 Task 5)
 *
 * Handles 401 responses by:
 * - Detecting SESSION_REVOKED (permanent) → clear tokens + redirect to /login
 * - Detecting UNAUTHORIZED (token expired) → auto-refresh + retry request
 * - Queuing concurrent requests during refresh to prevent race conditions
 */

let isRefreshing = false;
let failedQueue = [];

/**
 * Process queued requests after token refresh completes
 * Either reject all with error, or retry all with new token
 */
const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  isRefreshing = false;
  failedQueue = [];
};

/**
 * Setup axios interceptor to handle 401 responses with automatic token refresh
 *
 * Usage in App.js:
 * ```
 * import { setupAxiosInterceptor } from './lib/axiosInterceptor';
 * import apiClient from './services/apiClient';
 * import { useTokenRefresh } from './hooks/useTokenRefresh';
 *
 * export function App() {
 *   const tokenRefresh = useTokenRefresh();
 *
 *   useEffect(() => {
 *     setupAxiosInterceptor(apiClient, () => tokenRefresh);
 *   }, [tokenRefresh]);
 *   // ...
 * }
 * ```
 *
 * @param {AxiosInstance} axiosInstance - Axios instance to setup interceptor on
 * @param {Function} useTokenRefreshHook - Function that returns useTokenRefresh() hook result
 */
export function setupAxiosInterceptor(axiosInstance, useTokenRefreshHook) {
  axiosInstance.interceptors.response.use(
    // Success responses pass through unchanged
    (response) => response,

    // Error handler
    async (error) => {
      const status = error.response?.status;
      const errorCode = error.response?.data?.code || 'UNKNOWN';
      const originalRequest = error.config;

      // If not 401, return error as-is (let caller handle)
      if (status !== 401) {
        return Promise.reject(error);
      }

      // === Case 1: SESSION_REVOKED (permanent revocation) ===
      if (errorCode === 'SESSION_REVOKED') {
        console.warn('[axiosInterceptor] SESSION_REVOKED detected, clearing tokens and redirecting');

        // Clear all stored tokens
        localStorage.removeItem('badge_auth_token');
        localStorage.removeItem('badge_refresh_token');

        // Redirect to login (this terminates the request)
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }

        return Promise.reject(error);
      }

      // === Case 2: UNAUTHORIZED or TOKEN_EXPIRED (token needs refresh) ===
      if (errorCode === 'UNAUTHORIZED' || errorCode === 'TOKEN_EXPIRED') {
        // Don't retry the refresh endpoint itself (would cause infinite loop)
        if (originalRequest.url?.includes('/auth/refresh')) {
          return Promise.reject(error);
        }

        // Prevent multiple simultaneous refresh attempts
        if (isRefreshing) {
          // Queue this request to be retried after refresh completes
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then((newToken) => {
            // Update authorization header with new token
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return axiosInstance(originalRequest);
          });
        }

        // Mark refresh as in-flight
        isRefreshing = true;
        originalRequest._retried = true;

        try {
          // Get token refresh hook
          const tokenRefreshHook = useTokenRefreshHook();
          const { refreshToken, setTokens } = tokenRefreshHook;

          // Attempt token refresh
          const newTokens = await refreshToken();

          // If refresh failed (returns null), process queue with error
          if (!newTokens) {
            const refreshError = new Error('Token refresh failed');
            processQueue(refreshError, null);
            return Promise.reject(error);
          }

          // Token refresh succeeded
          console.log('[axiosInterceptor] Token refresh successful, retrying original request');

          // Update default authorization header for future requests
          axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${newTokens.access_token}`;

          // Update current request's authorization header
          originalRequest.headers.Authorization = `Bearer ${newTokens.access_token}`;

          // Process all queued requests with new token
          processQueue(null, newTokens.access_token);

          // Retry the original request with new token
          return axiosInstance(originalRequest);
        } catch (refreshError) {
          // Token refresh threw an exception
          console.error('[axiosInterceptor] Token refresh exception:', refreshError.message);

          // Process queued requests with error
          processQueue(refreshError, null);

          return Promise.reject(refreshError);
        }
      }

      // === Case 3: Other 401 errors ===
      // (invalid token, malformed JWT, etc. - don't attempt refresh)
      console.error('[axiosInterceptor] 401 with code:', errorCode);
      return Promise.reject(error);
    }
  );
}
