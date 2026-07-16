'use strict';

/**
 * Rate-limit test for demoStartLimiter (Task 3 of 9 — Ambiente Demo Self-Service).
 *
 * demoStartLimiter (like every other limiter in rateLimiter.js) has
 * `skip: (req) => process.env.NODE_ENV === 'test'`, which means rate
 * limiting is a no-op when the whole app is exercised under Jest with the
 * standard `NODE_ENV=test`. That's why other route test files mock the
 * rateLimiter module entirely rather than testing real limiting behavior
 * through it.
 *
 * To genuinely prove "the 4th request in the window is blocked" (the
 * Checkpoint 3 requirement), this file bypasses that problem by NOT going
 * through the full app: it mounts the real (unmocked) demoStartLimiter on
 * a minimal, isolated Express app and temporarily flips process.env.NODE_ENV
 * away from 'test' for the duration of the requests, so the skip condition
 * is false and the limiter actually runs. No database or Redis is touched —
 * demoStartLimiter's store falls back to in-memory when Redis isn't
 * initialized (see createHybridStore in rateLimiter.js), so this test has
 * no external dependencies.
 *
 * NODE_ENV is restored in afterAll/afterEach so no other test file in the
 * same Jest worker is affected. Each `it()` uses jest.resetModules() +
 * re-require to get a fresh demoStartLimiter instance (a fresh in-memory
 * Map), so tests don't share rate-limit state with each other.
 */

const express = require('express');
const request = require('supertest');

describe('demoStartLimiter (real middleware, isolated app)', () => {
  let originalNodeEnv;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    // Any non-'test' value defeats the `skip` condition. 'development' is
    // used elsewhere in this codebase's DISABLE_AUTH checks, so it's a safe,
    // recognized value rather than an arbitrary string.
    process.env.NODE_ENV = 'development';
    jest.resetModules();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.resetModules();
  });

  function buildApp() {
    // eslint-disable-next-line global-require
    const { demoStartLimiter } = require('../middleware/rateLimiter');
    const app = express();
    app.use(express.json());
    app.post('/demo/start', demoStartLimiter, (req, res) => res.json({ ok: true }));
    return app;
  }

  it('allows the first 3 requests from the same IP within the window', async () => {
    const app = buildApp();
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/demo/start').send({});
      expect(res.status).toBe(200);
    }
  });

  it('blocks the 4th request from the same IP within the window with 429', async () => {
    const app = buildApp();
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/demo/start').send({});
      expect(res.status).toBe(200);
    }

    const fourth = await request(app).post('/demo/start').send({});
    expect(fourth.status).toBe(429);
    expect(fourth.body.error).toBe('RATE_LIMIT_EXCEEDED');
    expect(fourth.headers['retry-after']).toBeDefined();
  });
});
