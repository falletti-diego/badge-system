'use strict';

/**
 * Integration tests: POST /api/v1/auth/refresh — DEMO_EXPIRED (Task 6 of 9
 * — Ambiente Demo Self-Service).
 *
 * A self-service demo tenant's employees (see utils/demoSeed.js) have no
 * password_hash and email domain @demo.local — they never authenticate via
 * POST /login (unreachable for them — see routes/auth.js's `WHERE
 * password_hash IS NOT NULL` login lookup). Their sessions are only ever
 * created by POST /demo/start / POST /demo/switch-role and renewed via
 * POST /auth/refresh, which is why the DEMO_EXPIRED check lives in the
 * `!demoUser` branch of POST /refresh's employee lookup, not in POST
 * /login.
 *
 * Real-Postgres integration tests, same dbAvailable soft-skip pattern as
 * demo-contact.test.js / auth-refresh-first-use.test.js.
 */

const { Pool } = require('pg');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('POST /api/v1/auth/refresh — DEMO_EXPIRED (real database)', () => {
  jest.setTimeout(30000);

  let probePool;
  let dbAvailable = false;
  let request;
  let app;

  beforeAll(async () => {
    probePool = new Pool(dbConfig);
    try {
      await probePool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[auth-refresh-demo-expired.test] Skipping real-DB tests — could not connect to ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}: ${err.message}`
      );
    }

    if (dbAvailable) {
      request = require('supertest');
      app = require('../app');
    }
  });

  afterAll(async () => {
    if (probePool) await probePool.end();
    if (dbAvailable) {
      const { closePool } = require('../db/pool');
      await closePool();
    }
  });

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  async function cleanupByEmail(email) {
    await probePool.query('DELETE FROM clients WHERE email = $1', [email]);
  }

  async function startDemo(label) {
    const email = uniqueEmail(label);
    const res = await request(app).post('/api/v1/demo/start').send({ email });
    expect(res.status).toBe(200);
    return { email, body: res.body.data };
  }

  // ----------------------------------------------------------------
  // Demo tenant whose demo_expires_at is in the past → DEMO_EXPIRED
  // ----------------------------------------------------------------

  it('rejects refresh with 401 DEMO_EXPIRED when the demo tenant has expired', async () => {
    if (!dbAvailable) return;
    const { email, body } = await startDemo('refresh-demo-expired');
    const jwt = require('jsonwebtoken');
    const clientId = jwt.decode(body.token).client_id;

    try {
      await probePool.query(
        `UPDATE clients SET demo_expires_at = now() - interval '1 day' WHERE id = $1`,
        [clientId]
      );

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: body.refresh_token });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('DEMO_EXPIRED');
      // No raw Postgres error / stack trace ever leaks into the response.
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toMatch(/at [A-Za-z]+\.[A-Za-z]+ \(/); // stack-trace-like line
      expect(bodyStr.toLowerCase()).not.toContain('pg_');
    } finally {
      await cleanupByEmail(email);
    }
  });

  // ----------------------------------------------------------------
  // Demo tenant NOT yet expired → normal refresh succeeds (regression)
  // ----------------------------------------------------------------

  it('still succeeds normally when the demo tenant has not expired yet', async () => {
    if (!dbAvailable) return;
    const { email, body } = await startDemo('refresh-demo-not-expired');

    try {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: body.refresh_token });

      expect(res.status).toBe(200);
      expect(typeof res.body.data.token).toBe('string');
      expect(typeof res.body.data.refresh_token).toBe('string');
    } finally {
      await cleanupByEmail(email);
    }
  });

  // ----------------------------------------------------------------
  // Real (non-demo) customer regression — is_demo=false, demo_expires_at
  // NULL — must be completely unaffected by the new check.
  // ----------------------------------------------------------------

  it('CRITICAL: a real (non-demo) customer refresh is unaffected (is_demo=false, demo_expires_at NULL)', async () => {
    if (!dbAvailable) return;
    const email = uniqueEmail('refresh-real-customer-regression');
    const { hashPassword } = require('../auth/password');
    const passwordHash = await hashPassword('RegressionTest123!');

    const clientResult = await probePool.query(
      `INSERT INTO clients (id, name, email, plan)
       VALUES (uuid_generate_v4(), 'Real Customer Regression Client', $1, 'basic')
       RETURNING id`,
      [email]
    );
    const clientId = clientResult.rows[0].id;

    const siteResult = await probePool.query(
      `INSERT INTO sites (id, client_id, name, location, qr_code_content)
       VALUES (uuid_generate_v4(), $1, 'Test Site', 'Test Location', $2)
       RETURNING id`,
      [clientId, `qr-${email}`]
    );
    const siteId = siteResult.rows[0].id;

    const employeeEmail = uniqueEmail('refresh-real-customer-regression-emp');
    await probePool.query(
      `INSERT INTO employees (id, client_id, email, name, role, site_id, password_hash)
       VALUES (uuid_generate_v4(), $1, $2, 'Regression Employee', 'employee', $3, $4)`,
      [clientId, employeeEmail, siteId, passwordHash]
    );

    try {
      // Sanity: is_demo=false and demo_expires_at IS NULL by default.
      const clientRow = await probePool.query('SELECT is_demo, demo_expires_at FROM clients WHERE id = $1', [clientId]);
      expect(clientRow.rows[0].is_demo).toBe(false);
      expect(clientRow.rows[0].demo_expires_at).toBeNull();

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: employeeEmail, password: 'RegressionTest123!', client_id: clientId });
      expect(loginRes.status).toBe(200);

      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: loginRes.body.data.refresh_token });

      expect(refreshRes.status).toBe(200);
      expect(typeof refreshRes.body.data.token).toBe('string');
      expect(typeof refreshRes.body.data.refresh_token).toBe('string');
    } finally {
      await probePool.query('DELETE FROM clients WHERE id = $1', [clientId]);
    }
  });
});
