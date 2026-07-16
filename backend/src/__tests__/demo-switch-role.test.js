'use strict';

/**
 * Integration tests: POST /api/v1/demo/switch-role (Task 4 of 9 — Ambiente
 * Demo Self-Service)
 *
 * Real-Postgres integration tests, mirroring demo-start.test.js's soft-skip
 * pattern (dbAvailable), since this route's fail-closed guard and session
 * hygiene depend on genuine transactional behavior (BEGIN/COMMIT, real
 * used_tokens rows) that a mocked pool cannot meaningfully verify.
 *
 * Checkpoint 4 (plan) — the most security-critical checkpoint of the whole
 * feature — is fully covered here:
 *   1. Real (non-demo) customer JWT -> 403, no token leaked.
 *   2. Invalid `role` value -> 400.
 *   3. New token's client_id always equals the caller's original client_id.
 *   4. No-op: switching to the currently-active role -> 200, not an error.
 *   5. Previous role's refresh_token is deliberately left usable after a
 *      switch (not proactively invalidated) — see routes/demo.js's doc
 *      comment above POST /switch-role for why a code-review-found race
 *      condition ruled out proactive session-hygiene cleanup here.
 *   6. All 3 roles reachable, correct employee_id per role, audit logged.
 */

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('POST /api/v1/demo/switch-role (real database)', () => {
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
        `[demo-switch-role.test] Skipping real-DB tests — could not connect to ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}: ${err.message}`
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

  async function cleanupByEmail(email) {
    await probePool.query('DELETE FROM clients WHERE email = $1', [email]);
  }

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  async function startDemo(label) {
    const email = uniqueEmail(label);
    const res = await request(app).post('/api/v1/demo/start').send({ email });
    expect(res.status).toBe(200);
    return { email, body: res.body.data };
  }

  // ----------------------------------------------------------------
  // Checkpoint 4.1 — fail-closed guard against real customer JWTs
  // ----------------------------------------------------------------

  it('refuses a JWT belonging to a real (non-demo) customer with 403 and leaks no token', async () => {
    if (!dbAvailable) return;
    const email = uniqueEmail('real-customer-switch');

    const realClient = await probePool.query(
      "INSERT INTO clients (id, name, email, plan) VALUES (uuid_generate_v4(), 'Real Co', $1, 'starter') RETURNING id",
      [email]
    );
    const realClientId = realClient.rows[0].id;

    const empEmail = uniqueEmail('real-employee-switch');
    const realEmployee = await probePool.query(
      `INSERT INTO employees (id, client_id, email, name, role)
       VALUES (uuid_generate_v4(), $1, $2, 'Real Admin', 'admin') RETURNING id`,
      [realClientId, empEmail]
    );
    const realEmployeeId = realEmployee.rows[0].id;

    const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    const realToken = jwt.sign(
      {
        user_id: realEmployeeId,
        name: 'Real Admin',
        email: empEmail,
        role: 'admin',
        client_id: realClientId,
        employee_id: realEmployeeId,
      },
      JWT_PRIVATE_KEY,
      { algorithm: 'RS256', expiresIn: '15m' }
    );

    try {
      const res = await request(app)
        .post('/api/v1/demo/switch-role')
        .set('Authorization', `Bearer ${realToken}`)
        .send({ role: 'manager' });

      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body).toLowerCase()).not.toContain('token');
      expect(JSON.stringify(res.body)).not.toContain(realClientId);
    } finally {
      await probePool.query('DELETE FROM clients WHERE id = $1', [realClientId]);
    }
  });

  // ----------------------------------------------------------------
  // Checkpoint 4.2 — invalid role value
  // ----------------------------------------------------------------

  it('rejects an invalid role value with 400', async () => {
    if (!dbAvailable) return;
    const { email, body } = await startDemo('invalid-role');

    try {
      const res = await request(app)
        .post('/api/v1/demo/switch-role')
        .set('Authorization', `Bearer ${body.token}`)
        .send({ role: 'superadmin' });

      expect(res.status).toBe(400);
    } finally {
      await cleanupByEmail(email);
    }
  });

  // ----------------------------------------------------------------
  // Checkpoint 4.3 — client_id never changes
  // ----------------------------------------------------------------

  it('always issues a token with the same client_id as the caller, for every role', async () => {
    if (!dbAvailable) return;
    const { email, body } = await startDemo('client-id-stable');
    const originalClientId = jwt.decode(body.token).client_id;

    try {
      for (const role of ['manager', 'employee', 'admin']) {
        const res = await request(app)
          .post('/api/v1/demo/switch-role')
          .set('Authorization', `Bearer ${body.token}`)
          .send({ role });

        expect(res.status).toBe(200);
        const decoded = jwt.decode(res.body.data.token);
        expect(decoded.client_id).toBe(originalClientId);
        expect(decoded.role).toBe(role);
      }
    } finally {
      await cleanupByEmail(email);
    }
  });

  // ----------------------------------------------------------------
  // Checkpoint 4.4 — no-op same-role switch
  // ----------------------------------------------------------------

  it('returns a clean 200 (no error) when switching to the role already active', async () => {
    if (!dbAvailable) return;
    const { email, body } = await startDemo('noop-same-role');

    try {
      const res = await request(app)
        .post('/api/v1/demo/switch-role')
        .set('Authorization', `Bearer ${body.token}`)
        .send({ role: 'admin' });

      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('admin');
      const decoded = jwt.decode(res.body.data.token);
      expect(decoded.role).toBe('admin');

      // The no-op's own freshly-issued refresh_token must itself remain
      // usable — there's no cleanup step to accidentally delete it, but
      // this guards against a future regression re-introducing one.
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: res.body.data.refresh_token });
      expect(refreshRes.status).toBe(200);
    } finally {
      await cleanupByEmail(email);
    }
  });

  // ----------------------------------------------------------------
  // Checkpoint 4.5 — previous role's refresh token deliberately left valid
  // ----------------------------------------------------------------

  it('does not invalidate the previous role session — old refresh_token still works after a switch', async () => {
    // Deliberate design choice, not an oversight: an earlier version of
    // this route proactively deleted the previous role's used_tokens row,
    // but code review found this could race with a concurrent, legitimate
    // POST /auth/refresh for the same user_id and delete a session it had
    // just legitimately rotated, causing a false replay-detected lockout.
    // The plan itself frames this cleanup as non-critical hygiene, not a
    // security requirement, so the tradeoff was resolved by leaving the
    // previous role's refresh token to expire naturally instead. See
    // PROJECT_DECISIONS.md Session 63 for the full analysis.
    if (!dbAvailable) return;
    const { email, body } = await startDemo('session-hygiene');
    const oldRefreshToken = body.refresh_token;

    try {
      const switchRes = await request(app)
        .post('/api/v1/demo/switch-role')
        .set('Authorization', `Bearer ${body.token}`)
        .send({ role: 'manager' });
      expect(switchRes.status).toBe(200);

      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: oldRefreshToken });

      expect(refreshRes.status).toBe(200);
    } finally {
      await cleanupByEmail(email);
    }
  });

  // ----------------------------------------------------------------
  // Checkpoint 4.6 — correct per-role employee + audit log
  // ----------------------------------------------------------------

  it('switches to each of the 3 roles, returning the correct demo employee for that tenant, and audit-logs demo_role_switch', async () => {
    if (!dbAvailable) return;
    const { email, body } = await startDemo('all-roles');
    const clientId = jwt.decode(body.token).client_id;

    try {
      const employeesByRole = await probePool.query(
        'SELECT id, role FROM employees WHERE client_id = $1',
        [clientId]
      );
      const expectedIdByRole = {};
      for (const row of employeesByRole.rows) {
        expectedIdByRole[row.role] = row.id;
      }

      let currentToken = body.token;
      for (const role of ['manager', 'employee', 'admin']) {
        const res = await request(app)
          .post('/api/v1/demo/switch-role')
          .set('Authorization', `Bearer ${currentToken}`)
          .send({ role });

        expect(res.status).toBe(200);
        expect(res.body.data.user.role).toBe(role);
        expect(res.body.data.user.employee_id).toBe(expectedIdByRole[role]);
        const decoded = jwt.decode(res.body.data.token);
        expect(decoded.role).toBe(role);
        expect(decoded.employee_id).toBe(expectedIdByRole[role]);

        currentToken = res.body.data.token;
      }

      const audit = await probePool.query(
        "SELECT action FROM audit_log WHERE entity_id = $1 AND action = 'demo_role_switch'",
        [clientId]
      );
      expect(audit.rows.length).toBeGreaterThanOrEqual(3);
    } finally {
      await cleanupByEmail(email);
    }
  });

  // ----------------------------------------------------------------
  // Code-review follow-up (Task 6 of 9): switch-role must not bypass
  // DEMO_EXPIRED. Before requireDemoTenant.js was extended to check
  // demo_expires_at, a demo tenant past its trial (but still within the
  // cleanup script's 7-day grace period) could call this route every
  // ~14 minutes to renew its session indefinitely without ever going
  // through POST /auth/refresh, defeating the soft-expiry Task 6 added
  // there. Verifies the shared guard now catches this route too.
  // ----------------------------------------------------------------

  it('rejects switch-role with 401 DEMO_EXPIRED when the tenant demo_expires_at has passed, issuing no new token', async () => {
    if (!dbAvailable) return;
    const { email, body } = await startDemo('switch-role-demo-expired');
    const clientId = jwt.decode(body.token).client_id;

    try {
      await probePool.query(
        `UPDATE clients SET demo_expires_at = now() - interval '1 day' WHERE id = $1`,
        [clientId]
      );

      const res = await request(app)
        .post('/api/v1/demo/switch-role')
        .set('Authorization', `Bearer ${body.token}`)
        .send({ role: 'manager' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('DEMO_EXPIRED');
      expect(res.body.data).toBeUndefined();
    } finally {
      await cleanupByEmail(email);
    }
  });
});
