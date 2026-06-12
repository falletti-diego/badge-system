/**
 * useTokenRefresh Hook (S.32.7 Task 5)
 *
 * React hook for managing JWT token refresh flow.
 * Provides token read/write from localStorage and handles token expiry/revocation.
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const TOKEN_KEY = 'badge_auth_token';
const REFRESH_TOKEN_KEY = 'badge_refresh_token';

// Get API base URL - defer window access to runtime
const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return window.API_CONFIG?.API_URL ?? import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
  }
  return import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
};

/**
 * Hook for managing JWT token refresh flow
 *
 * Returns:
 * - accessToken: current access token from localStorage
 * - setTokens(tokens): update both access_token and refresh_token in localStorage
 * - refreshToken(): async function to call POST /api/auth/refresh
 */
export function useTokenRefresh() {
  const navigate = useNavigate();
  const [accessToken, setAccessToken] = useState(() => {
    return localStorage.getItem(TOKEN_KEY);
  });

  /**
   * Store both access token and refresh token in localStorage
   * Updates local state and localStorage simultaneously
   */
  const setTokens = useCallback(({ access_token, refresh_token }) => {
    if (access_token) {
      localStorage.setItem(TOKEN_KEY, access_token);
      setAccessToken(access_token);
    }
    if (refresh_token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token);
    }
  }, []);

  /**
   * Refresh the access token using the refresh token
   *
   * Returns:
   * - {access_token, refresh_token} on success
   * - null on failure (401 SESSION_REVOKED, network error, etc.)
   *
   * Handles:
   * - 401 SESSION_REVOKED: clears tokens and redirects to /login
   * - 401 UNAUTHORIZED: clears tokens on failure
   * - Network errors: clears tokens gracefully
   */
  const refreshToken = useCallback(async () => {
    try {
      const refresh_token = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!refresh_token) {
        console.warn('[useTokenRefresh] No refresh token available');
        navigate('/login');
        return null;
      }

      const apiBaseUrl = getApiBaseUrl();
      const url = `${apiBaseUrl}/api/auth/refresh`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': accessToken ? `Bearer ${accessToken}` : '',
        },
        body: JSON.stringify({ refresh_token }),
      });

      // Success: return new tokens
      if (response.ok) {
        const result = await response.json();
        const newTokens = {
          access_token: result.data?.token || result.data?.access_token,
          refresh_token: result.data?.refresh_token,
        };

        if (!newTokens.access_token) {
          throw new Error('Missing access token in response');
        }

        console.log('[useTokenRefresh] Token refresh successful');
        return newTokens;
      }

      // 401: Handle revocation or token expiry
      if (response.status === 401) {
        const error = await response.json();
        const code = error.code || 'UNAUTHORIZED';

        console.error('[useTokenRefresh] 401 Response:', code, error.message);

        // Clear tokens on any 401
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        setAccessToken(null);

        // If SESSION_REVOKED, redirect to login
        if (code === 'SESSION_REVOKED') {
          console.warn('[useTokenRefresh] Session revoked, redirecting to /login');
          navigate('/login');
        }

        return null;
      }

      // Other errors (500, 403, etc.)
      const errorData = await response.json().catch(() => ({}));
      console.error('[useTokenRefresh] Refresh failed:', response.status, errorData);

      // Clear tokens on any other error
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      setAccessToken(null);

      return null;
    } catch (err) {
      // Network error or other exceptions
      console.error('[useTokenRefresh] Exception during token refresh:', err.message);

      // Clear tokens on network error
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      setAccessToken(null);

      // Optionally redirect to login on critical errors
      navigate('/login');

      return null;
    }
  }, [accessToken, navigate]);

  return {
    accessToken,
    setTokens,
    refreshToken,
  };
}
