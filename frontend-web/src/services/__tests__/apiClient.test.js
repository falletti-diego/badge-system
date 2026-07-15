import { describe, test, expect, beforeEach } from 'vitest';
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
