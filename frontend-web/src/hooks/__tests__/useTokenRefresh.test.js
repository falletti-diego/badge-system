/**
 * useTokenRefresh Hook Tests (S.32.7 Task 5)
 *
 * Tests for token refresh hook that manages JWT token read/write from localStorage
 * and handles token expiry/revocation scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock localStorage before importing the hook
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = localStorageMock;

// Mock useNavigate from react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Now import the hook after mocks are set up
import { useTokenRefresh } from '../useTokenRefresh';

describe('useTokenRefresh Hook (S.32.7 Task 5)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('1. Reading tokens from localStorage', () => {
    it('1.1: Returns accessToken from localStorage on initialization', () => {
      localStorage.setItem('badge_auth_token', 'token-123');

      const { result } = renderHook(() => useTokenRefresh());
      expect(result.current.accessToken).toBe('token-123');
    });

    it('1.2: Returns null when no token in localStorage', () => {
      const { result } = renderHook(() => useTokenRefresh());
      expect(result.current.accessToken).toBeNull();
    });
  });

  describe('2. Setting tokens to localStorage', () => {
    it('2.1: setTokens stores access_token in localStorage', () => {
      const { result } = renderHook(() => useTokenRefresh());

      act(() => {
        result.current.setTokens({ access_token: 'new-access-123' });
      });

      expect(localStorage.getItem('badge_auth_token')).toBe('new-access-123');
    });

    it('2.2: setTokens stores refresh_token in localStorage', () => {
      const { result } = renderHook(() => useTokenRefresh());

      act(() => {
        result.current.setTokens({
          access_token: 'new-access-123',
          refresh_token: 'new-refresh-456',
        });
      });

      expect(localStorage.getItem('badge_refresh_token')).toBe('new-refresh-456');
    });

    it('2.3: setTokens updates both tokens atomically', () => {
      const { result } = renderHook(() => useTokenRefresh());

      act(() => {
        result.current.setTokens({
          access_token: 'access-token-new',
          refresh_token: 'refresh-token-new',
        });
      });

      expect(localStorage.getItem('badge_auth_token')).toBe('access-token-new');
      expect(localStorage.getItem('badge_refresh_token')).toBe('refresh-token-new');
    });

    it('2.4: setTokens only updates provided tokens (partial update)', () => {
      localStorage.setItem('badge_auth_token', 'old-access');
      localStorage.setItem('badge_refresh_token', 'old-refresh');

      const { result } = renderHook(() => useTokenRefresh());

      act(() => {
        result.current.setTokens({ refresh_token: 'new-refresh' });
      });

      expect(localStorage.getItem('badge_auth_token')).toBe('old-access');
      expect(localStorage.getItem('badge_refresh_token')).toBe('new-refresh');
    });
  });

  describe('3. Refreshing tokens via API', () => {
    it('3.1: refreshToken calls POST /api/auth/refresh endpoint', async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                token: 'refreshed-access-token',
                refresh_token: 'refreshed-refresh-token',
              },
            }),
        })
      );

      globalThis.fetch = mockFetch;
      localStorage.setItem('badge_refresh_token', 'old-refresh-token');

      const { result } = renderHook(() => useTokenRefresh());

      let newTokens;
      await act(async () => {
        newTokens = await result.current.refreshToken();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/refresh'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );

      expect(newTokens).toEqual({
        access_token: 'refreshed-access-token',
        refresh_token: 'refreshed-refresh-token',
      });
    });

    it('3.2: refreshToken includes refresh_token in request body', async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                token: 'new-token',
                refresh_token: 'new-refresh',
              },
            }),
        })
      );

      globalThis.fetch = mockFetch;
      localStorage.setItem('badge_refresh_token', 'my-refresh-token-123');

      const { result } = renderHook(() => useTokenRefresh());

      await act(async () => {
        await result.current.refreshToken();
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.refresh_token).toBe('my-refresh-token-123');
    });

    it('3.3: refreshToken returns null when no refresh_token in localStorage', async () => {
      const { result } = renderHook(() => useTokenRefresh());

      let returnValue;
      await act(async () => {
        returnValue = await result.current.refreshToken();
      });

      expect(returnValue).toBeNull();
    });

    it('3.4: refreshToken returns tokens object on success', async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                token: 'access-token-new',
                refresh_token: 'refresh-token-new',
              },
            }),
        })
      );

      globalThis.fetch = mockFetch;
      localStorage.setItem('badge_refresh_token', 'refresh-123');

      const { result } = renderHook(() => useTokenRefresh());

      let returnValue;
      await act(async () => {
        returnValue = await result.current.refreshToken();
      });

      expect(returnValue).toEqual({
        access_token: 'access-token-new',
        refresh_token: 'refresh-token-new',
      });
    });
  });

  describe('4. Handling 401 SESSION_REVOKED responses', () => {
    it('4.1: refreshToken returns null on 401 SESSION_REVOKED', async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () =>
            Promise.resolve({
              code: 'SESSION_REVOKED',
              message: 'Session has been revoked',
            }),
        })
      );

      globalThis.fetch = mockFetch;
      localStorage.setItem('badge_refresh_token', 'refresh-123');

      const { result } = renderHook(() => useTokenRefresh());

      let returnValue;
      await act(async () => {
        returnValue = await result.current.refreshToken();
      });

      expect(returnValue).toBeNull();
    });

    it('4.2: refreshToken clears tokens on SESSION_REVOKED', async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () =>
            Promise.resolve({
              code: 'SESSION_REVOKED',
            }),
        })
      );

      globalThis.fetch = mockFetch;
      localStorage.setItem('badge_auth_token', 'token-to-clear');
      localStorage.setItem('badge_refresh_token', 'refresh-to-clear');

      const { result } = renderHook(() => useTokenRefresh());

      await act(async () => {
        await result.current.refreshToken();
      });

      expect(localStorage.getItem('badge_auth_token')).toBeNull();
      expect(localStorage.getItem('badge_refresh_token')).toBeNull();
    });

    it('4.3: refreshToken clears tokens on any 401 error', async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () =>
            Promise.resolve({
              code: 'UNAUTHORIZED',
              message: 'Invalid token',
            }),
        })
      );

      globalThis.fetch = mockFetch;
      localStorage.setItem('badge_auth_token', 'expired-token');
      localStorage.setItem('badge_refresh_token', 'expired-refresh');

      const { result } = renderHook(() => useTokenRefresh());

      await act(async () => {
        await result.current.refreshToken();
      });

      expect(localStorage.getItem('badge_auth_token')).toBeNull();
      expect(localStorage.getItem('badge_refresh_token')).toBeNull();
    });
  });

  describe('5. Error handling in token refresh', () => {
    it('5.1: refreshToken handles network errors gracefully', async () => {
      const mockFetch = vi.fn(() =>
        Promise.reject(new Error('Network error'))
      );

      globalThis.fetch = mockFetch;
      localStorage.setItem('badge_refresh_token', 'refresh-123');

      const { result } = renderHook(() => useTokenRefresh());

      let returnValue;
      await act(async () => {
        returnValue = await result.current.refreshToken();
      });

      expect(returnValue).toBeNull();
      expect(localStorage.getItem('badge_auth_token')).toBeNull();
    });

    it('5.2: refreshToken handles malformed response', async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.reject(new Error('Invalid JSON')),
        })
      );

      globalThis.fetch = mockFetch;
      localStorage.setItem('badge_refresh_token', 'refresh-123');

      const { result } = renderHook(() => useTokenRefresh());

      let returnValue;
      await act(async () => {
        returnValue = await result.current.refreshToken();
      });

      expect(returnValue).toBeNull();
    });
  });

  describe('6. Integration tests', () => {
    it('6.1: Full flow - login, check token, then refresh', async () => {
      const { result } = renderHook(() => useTokenRefresh());

      // Simulate login
      act(() => {
        result.current.setTokens({
          access_token: 'initial-access-token',
          refresh_token: 'initial-refresh-token',
        });
      });

      expect(localStorage.getItem('badge_auth_token')).toBe('initial-access-token');
      expect(localStorage.getItem('badge_refresh_token')).toBe('initial-refresh-token');

      // Simulate refresh
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                token: 'refreshed-access-token',
                refresh_token: 'refreshed-refresh-token',
              },
            }),
        })
      );

      globalThis.fetch = mockFetch;

      let newTokens;
      await act(async () => {
        newTokens = await result.current.refreshToken();
      });

      expect(newTokens).not.toBeNull();
      expect(newTokens.access_token).toBe('refreshed-access-token');

      // Store refreshed tokens
      act(() => {
        result.current.setTokens(newTokens);
      });

      expect(localStorage.getItem('badge_refresh_token')).toBe('refreshed-refresh-token');
    });

    it('6.2: Revocation flow - after SESSION_REVOKED, tokens are cleared', async () => {
      const { result } = renderHook(() => useTokenRefresh());

      // Initial state
      act(() => {
        result.current.setTokens({
          access_token: 'user-access-token',
          refresh_token: 'user-refresh-token',
        });
      });

      expect(localStorage.getItem('badge_auth_token')).toBe('user-access-token');

      // API returns SESSION_REVOKED
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () =>
            Promise.resolve({
              code: 'SESSION_REVOKED',
              message: 'Your session has been revoked',
            }),
        })
      );

      globalThis.fetch = mockFetch;

      let returnValue;
      await act(async () => {
        returnValue = await result.current.refreshToken();
      });

      expect(returnValue).toBeNull();
      expect(localStorage.getItem('badge_auth_token')).toBeNull();
      expect(localStorage.getItem('badge_refresh_token')).toBeNull();
    });
  });
});
