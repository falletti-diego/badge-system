'use strict';

/**
 * Integration tests for CORS middleware
 * Verifies that CORS headers are correctly applied based on parsed origins
 */

const request = require('supertest');

jest.mock('../db/pool', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../db/redis', () => ({
  initializeRedis: jest.fn().mockResolvedValue(undefined),
  deleteCacheByPattern: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../middleware/rateLimiter', () => ({
  apiLimiter: (req, res, next) => next(),
  authLimiter: (req, res, next) => next(),
  csvLimiter: (req, res, next) => next(),
  demoStartLimiter: (req, res, next) => next(),
  onboardingInviteLimiter: (req, res, next) => next(),
  pushTokenLimiter: (req, res, next) => next(),
}));

describe('CORS middleware integration', () => {
  let app;

  beforeEach(() => {
    // Clear module cache to reload app with fresh CORS config
    jest.resetModules();
    // Must set CORS_ORIGIN before requiring app
    process.env.CORS_ORIGIN = 'https://test-origin.com, https://another-origin.com';
    app = require('../app');
  });

  afterEach(() => {
    delete process.env.CORS_ORIGIN;
  });

  it('allows preflight request from whitelisted origin', async () => {
    const res = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'https://test-origin.com')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://test-origin.com');
  });

  it('allows preflight request from another whitelisted origin', async () => {
    const res = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'https://another-origin.com')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://another-origin.com');
  });

  it('blocks preflight request from non-whitelisted origin', async () => {
    const res = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'https://evil.com')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    // CORS library does NOT include allow-origin header if origin is not whitelisted
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('includes credentials in CORS headers', async () => {
    const res = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'https://test-origin.com')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  // Regression test for finding #13 gap: the backend sets a custom
  // X-Truncated response header (see routes/export.js) that
  // ExportButton.jsx reads client-side to warn about truncated CSV
  // exports. Per the Fetch/CORS spec, custom response headers are
  // invisible to browser JS on cross-origin responses unless the server
  // lists them in Access-Control-Expose-Headers. Without this, the
  // truncation warning silently never fires in production (Netlify
  // dashboard <-> EC2 API is cross-origin), even though supertest-only
  // tests (no real browser CORS enforcement) and mocked frontend tests
  // (never go through a real fetch/XHR) can't catch it.
  it('exposes X-Truncated so browser JS can read it on cross-origin responses', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://test-origin.com');

    expect(res.headers['access-control-expose-headers']).toContain('X-Truncated');
  });
});
