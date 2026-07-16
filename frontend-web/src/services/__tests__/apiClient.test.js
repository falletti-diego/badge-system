import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import apiClient from '../apiClient';

/**
 * Regression coverage for the code-review finding on commit 5b695ef/ec9db24
 * (Task 7 — self-service demo landing page): the request interceptor used to
 * unconditionally attach `Authorization: Bearer <token>` from localStorage to
 * every outgoing request, including the public POST /demo/start. Because the
 * backend's global compositeAuthMiddleware (optionalAuth + checkRevoked)
 * runs before every route regardless of whether that route requires auth, a
 * stale-but-revoked token left over from an earlier, unrelated session would
 * make checkRevoked reject the request with 401 SESSION_REVOKED — which then
 * triggered apiClient's auto-refresh-and-hard-redirect-to-/login flow,
 * bouncing an anonymous demo visitor off the public landing page entirely.
 *
 * Fix: the request interceptor now skips attaching Authorization for a
 * short allow-list of public, no-auth endpoints (currently just
 * /api/v1/demo/start). This test intercepts the outgoing request via a
 * custom axios adapter (no network call is made) and asserts the header is
 * present/absent as expected.
 */

function captureConfigAdapter() {
  let captured;
  const adapter = (config) => {
    captured = config;
    return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
  };
  return { adapter, getCaptured: () => captured };
}

describe('apiClient request interceptor — Authorization header', () => {
  beforeEach(() => {
    localStorage.removeItem('badge_auth_token');
  });

  test('does NOT attach a stale Authorization header to the public POST /demo/start call', async () => {
    localStorage.setItem('badge_auth_token', 'stale-revoked-token');
    const { adapter, getCaptured } = captureConfigAdapter();

    await apiClient.post('/api/v1/demo/start', { email: 'prospect@example.com' }, { adapter });

    expect(getCaptured().headers.Authorization).toBeUndefined();
  });

  test('still attaches Authorization for a regular authenticated endpoint', async () => {
    localStorage.setItem('badge_auth_token', 'valid-token');
    const { adapter, getCaptured } = captureConfigAdapter();

    await apiClient.get('/api/v1/presences', { adapter });

    expect(getCaptured().headers.Authorization).toBe('Bearer valid-token');
  });

  test('does not attach Authorization to /demo/start when no token is stored either', async () => {
    const { adapter, getCaptured } = captureConfigAdapter();

    await apiClient.post('/api/v1/demo/start', { email: 'prospect@example.com' }, { adapter });

    expect(getCaptured().headers.Authorization).toBeUndefined();
  });
});

/**
 * Regression coverage for Task 8 (Gap 2): a demo session's token refresh
 * failing with DEMO_EXPIRED (either directly via POST /auth/refresh, or
 * transitively because POST /demo/switch-role or /demo/contact's own 401
 * triggers a refresh attempt that itself hits the same DEMO_EXPIRED check —
 * see requireDemoTenant.js) must redirect to /demo-expired, not /login,
 * since a demo visitor never had credentials to log back in with.
 *
 * The second, pre-existing interceptor in lib/axiosInterceptor.js branches
 * on error.response.data.code, but every real backend error shape here uses
 * `.error` (e.g. `{ error: 'DEMO_EXPIRED' }') — so that interceptor never
 * actually matches anything and the real behavior lives entirely in
 * apiClient.js's own interceptor, which is what these tests exercise.
 */
describe('apiClient response interceptor — DEMO_EXPIRED redirect (Task 8)', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.resetModules();
    localStorage.setItem('badge_auth_token', 'expired-demo-token');
    localStorage.setItem('badge_refresh_token', 'expired-demo-refresh');
    delete window.location;
    window.location = { ...originalLocation, href: '/dashboard', pathname: '/dashboard' };
  });

  afterEach(() => {
    window.location = originalLocation;
    vi.doUnmock('../authService');
  });

  test('redirects to /demo-expired when the refresh attempt fails with DEMO_EXPIRED', async () => {
    vi.doMock('../authService', () => ({
      default: {
        refreshAccessToken: vi.fn().mockRejectedValue({
          response: { status: 401, data: { error: 'DEMO_EXPIRED', message: 'This demo has expired' } },
        }),
      },
    }));

    // Re-import apiClient fresh so its lazy `await import('./authService')`
    // picks up the mock registered above.
    const { default: freshApiClient } = await import('../apiClient');

    let capturedStatus = 401;
    const adapter = (config) => {
      if (config.url === '/api/v1/presences') {
        return Promise.reject({
          config,
          response: { status: capturedStatus, data: { error: 'DEMO_EXPIRED' } },
        });
      }
      return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
    };

    await expect(freshApiClient.get('/api/v1/presences', { adapter })).rejects.toBeTruthy();

    expect(window.location.href).toBe('/demo-expired');
    expect(localStorage.getItem('badge_auth_token')).toBeNull();
    expect(localStorage.getItem('badge_refresh_token')).toBeNull();
  });

  test('still redirects to /login for a non-demo refresh failure (e.g. SESSION_REVOKED)', async () => {
    vi.doMock('../authService', () => ({
      default: {
        refreshAccessToken: vi.fn().mockRejectedValue({
          response: { status: 401, data: { error: 'SESSION_REVOKED', message: 'Session revoked' } },
        }),
      },
    }));

    const { default: freshApiClient } = await import('../apiClient');

    const adapter = (config) => {
      if (config.url === '/api/v1/presences') {
        return Promise.reject({
          config,
          response: { status: 401, data: { error: 'SESSION_REVOKED' } },
        });
      }
      return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
    };

    await expect(freshApiClient.get('/api/v1/presences', { adapter })).rejects.toBeTruthy();

    expect(window.location.href).toBe('/login');
  });
});
