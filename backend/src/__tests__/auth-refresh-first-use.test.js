'use strict';

/**
 * Regression test: POST /api/v1/auth/refresh must succeed on the FIRST
 * refresh attempt for a real (DB-backed, non-@badge.local) employee login.
 *
 * Reproduces the bug documented in
 * docs/superpowers/plans/2026-07-14-refresh-replay-detection-hotfix.md:
 * commit 6abb03f (14 Jun 2026) re-added a best-effort `used_tokens` INSERT
 * at login time to close a concurrency hole, but POST /refresh's replay
 * check still treats *finding* that row as proof of replay — so the very
 * first refresh for any real customer login is rejected with 401
 * SESSION_REVOKED. Soft-skips without a reachable local Postgres, same
 * pattern as demoSeed.test.js / demo-start.test.js.
 */

const { Pool } = require('pg');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'badge_system_test',
});

let dbAvailable = true;
let app;

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    dbAvailable = false;
    // eslint-disable-next-line no-console
    console.warn(`auth-refresh-first-use.test.js: no reachable Postgres (${err.message}) — soft-skipping real-DB tests.`);
    return;
  }
  app = require('../app');
});

afterAll(async () => {
  await pool.end();
});

describe('POST /auth/refresh — first-use regression (real DB, real login, real employee)', () => {
  const TEST_EMAIL = 'auth-refresh-first-use-regression@example.test';
  let clientId;
  let employeeId;
  const PASSWORD = 'RegressionTest123!';

  beforeAll(async () => {
    if (!dbAvailable) return;
    // Use the app's own password helper (bcryptjs, cost 12), not a raw
    // bcrypt call — this codebase uses bcryptjs (see src/auth/password.js),
    // not the native bcrypt module, and hashPassword() enforces the same
    // MIN_LENGTH/cost invariants login verification expects.
    const { hashPassword } = require('../auth/password');
    const passwordHash = await hashPassword(PASSWORD);

    const clientResult = await pool.query(
      `INSERT INTO clients (id, name, email, plan)
       VALUES (uuid_generate_v4(), 'Auth Refresh Regression Test Client', $1, 'basic')
       RETURNING id`,
      [`client-${TEST_EMAIL}`]
    );
    clientId = clientResult.rows[0].id;

    const siteResult = await pool.query(
      `INSERT INTO sites (id, client_id, name, location, qr_code_content)
       VALUES (uuid_generate_v4(), $1, 'Test Site', 'Test Location', $2)
       RETURNING id`,
      [clientId, `qr-${TEST_EMAIL}`]
    );
    const siteId = siteResult.rows[0].id;

    const employeeResult = await pool.query(
      `INSERT INTO employees (id, client_id, email, name, role, site_id, password_hash)
       VALUES (uuid_generate_v4(), $1, $2, 'Regression Test Employee', 'employee', $3, $4)
       RETURNING id`,
      [clientId, TEST_EMAIL, siteId, passwordHash]
    );
    employeeId = employeeResult.rows[0].id;
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    // employees/sites cascade from clients (ON DELETE CASCADE) — one DELETE is enough.
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('succeeds on the very first refresh attempt immediately after login', async () => {
    if (!dbAvailable) return;

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: PASSWORD, client_id: clientId });

    expect(loginRes.status).toBe(200);
    expect(typeof loginRes.body.data.refresh_token).toBe('string');

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: loginRes.body.data.refresh_token });

    // This is the exact bug: today this responds 401 SESSION_REVOKED
    // instead of 200 with a newly rotated token pair.
    expect(refreshRes.status).toBe(200);
    expect(typeof refreshRes.body.data.token).toBe('string');
    expect(typeof refreshRes.body.data.refresh_token).toBe('string');

    const decodedNewAccess = jwt.decode(refreshRes.body.data.token);
    expect(decodedNewAccess.user_id).toBe(employeeId);
    expect(decodedNewAccess.client_id).toBe(clientId);
  });

  it('rejects reuse of an already-rotated (consumed) refresh token as a replay', async () => {
    if (!dbAvailable) return;

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: PASSWORD, client_id: clientId });
    expect(loginRes.status).toBe(200);
    const originalRefreshToken = loginRes.body.data.refresh_token;

    // First refresh: consumes (rotates) the original token. Must succeed.
    const firstRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: originalRefreshToken });
    expect(firstRefresh.status).toBe(200);

    // Replaying the SAME (now-consumed) original token again must be
    // rejected as a replay, not silently accepted a second time.
    const replayAttempt = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: originalRefreshToken });
    expect(replayAttempt.status).toBe(401);
    expect(replayAttempt.body.error).toBe('SESSION_REVOKED');
  });
});
