'use strict';

/**
 * Integration tests: POST /api/v1/demo/start (Task 3 of 9 — Ambiente Demo Self-Service)
 *
 * These exercise the real route against a real Postgres database — no
 * mocked pool. The point of this endpoint is transactional correctness
 * (BEGIN/INSERT/COMMIT, a genuine 23505 unique-violation under a real race),
 * which a mocked pool cannot meaningfully verify. Mirrors the soft-skip
 * pattern used by demoSeed.test.js: if no reachable Postgres is configured
 * (e.g. CI without a DB service), these tests skip with a console warning
 * instead of failing the whole suite.
 *
 * Body-shape validation (rejecting extra fields, missing/invalid email) is
 * covered separately in demo-start-validation.test.js with a mocked pool,
 * since that only exercises the Zod schema and never reaches the database.
 *
 * Rate limiting (4th request blocked) is covered separately in
 * demo-start-rate-limit.test.js, which exercises demoStartLimiter directly
 * against an isolated Express app (NODE_ENV toggled so the test-env skip
 * doesn't defeat the test) — no DB involved.
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

describe('POST /api/v1/demo/start (real database)', () => {
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
        `[demo-start.test] Skipping real-DB tests — could not connect to ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}: ${err.message}`
      );
    }

    if (dbAvailable) {
      // app.js/demo.js both use src/db/pool's singleton pool, which reads
      // the same DB_* env vars config-loader has already applied — no need
      // to re-point it, just confirm it's the same target we probed above.
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

  /**
   * Deletes any clients rows (and cascading employees/sites/checkins/etc.)
   * created for the given email during a test, so tests don't leak state
   * into each other or accumulate rows across runs.
   */
  async function cleanupByEmail(email) {
    await probePool.query('DELETE FROM clients WHERE email = $1', [email]);
  }

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  // ----------------------------------------------------------------
  // New tenant creation
  // ----------------------------------------------------------------

  it('creates a new demo tenant and returns a login-shaped response', async () => {
    if (!dbAvailable) return;
    const email = uniqueEmail('new-tenant');

    try {
      const res = await request(app).post('/api/v1/demo/start').send({ email });

      expect(res.status).toBe(200);
      expect(res.body.data.resumed).toBe(false);
      expect(typeof res.body.data.token).toBe('string');
      expect(typeof res.body.data.refresh_token).toBe('string');
      expect(res.body.data.user.role).toBe('admin');
      expect(res.body.data.user.employee_id).toBeDefined();

      const decoded = jwt.decode(res.body.data.token);
      expect(decoded.role).toBe('admin');
      expect(decoded.client_id).toBeDefined();
      expect(decoded.employee_id).toBe(decoded.user_id);

      // Refresh token is a genuine, distinct refresh-typed JWT for the same user.
      const decodedRefresh = jwt.decode(res.body.data.refresh_token);
      expect(decodedRefresh.type).toBe('refresh');
      expect(decodedRefresh.user_id).toBe(decoded.user_id);
      expect(decodedRefresh.jti).toBeDefined();
      expect(res.body.data.refresh_token).not.toBe(res.body.data.token);

      // Row actually created, is_demo=true, expires ~7 days out
      const clientRow = await probePool.query(
        'SELECT id, is_demo, demo_expires_at, demo_contact_email FROM clients WHERE email = $1',
        [email]
      );
      expect(clientRow.rows).toHaveLength(1);
      expect(clientRow.rows[0].is_demo).toBe(true);
      expect(clientRow.rows[0].demo_contact_email).toBe(email);
      expect(clientRow.rows[0].id).toBe(decoded.client_id);

      // Seeded data actually exists (seedDemoTenant really ran)
      const employeesCount = await probePool.query(
        'SELECT COUNT(*)::int AS n FROM employees WHERE client_id = $1',
        [decoded.client_id]
      );
      expect(employeesCount.rows[0].n).toBe(3);

      // Audit logged
      const audit = await probePool.query(
        'SELECT action FROM audit_log WHERE entity_id = $1 AND action = \'demo_tenant_created\'',
        [decoded.client_id]
      );
      expect(audit.rows.length).toBeGreaterThan(0);
    } finally {
      await cleanupByEmail(email);
    }
  });

  /**
   * Previously skipped — blocked by a pre-existing, unrelated bug in POST
   * /api/v1/auth/refresh, not by anything in demo.js. Fixed and un-skipped,
   * see below.
   *
   * routes/auth.js POST /login writes the freshly-signed refresh token's
   * jti into `used_tokens` immediately at issuance (S.32.7 "race condition
   * fix", commit 6abb03f — "Login now inserts jti into used_tokens
   * (best-effort, non-blocking) - Prevents concurrent refresh token
   * duplication attack"). But POST /auth/refresh's replay check —
   * `if (replayCheck.rows.length > 0) { ...REPLAY DETECTED... }` — treats
   * *finding* that same jti row as proof of reuse. Since the row was just
   * written by login/issuance, the very FIRST refresh attempt for any
   * non-@badge.local user always hits this branch and gets rejected with
   * SESSION_REVOKED — the opposite of the two-line design the project's
   * own auth-refresh-race.test.js documents in its header comment
   * ("FIRST REFRESH: SELECT FOR UPDATE jti (finds row from login), DELETE
   * jti, INSERT new jti, COMMIT" — i.e. finding the row on first use
   * should proceed, not be treated as replay).
   *
   * This is not demo-specific: reproduced directly against routes/auth.js
   * POST /login + POST /refresh for a plain DB employee (no demo.js
   * involved) during this task's verification. It affects every real
   * customer login where the best-effort jti insert succeeds — i.e. the
   * common case, not an edge case.
   *
   * History: this exact bug was already found and fixed once, in commit
   * 907a6fb ("fix(S.32.7): Remove jti insert from login endpoint - unblocks
   * first refresh"), then silently reintroduced by 6abb03f for a different
   * reason (closing a FOR-UPDATE-on-no-row race window) without restoring
   * a test that exercises a real (non-@badge.local) login → refresh round
   * trip. The only test that does that today, auth.integration.test.js, is
   * gated behind `RUN_INTEGRATION=1` (skipped in normal `npm test`) and
   * always logs in as an @badge.local demo account, which skips jti
   * tracking entirely (`!email.endsWith(BADGE_LOCAL_DOMAIN)` guards the
   * insert) — so this regression has no green/red signal in CI today.
   *
   * Fixed separately in docs/superpowers/plans/2026-07-14-refresh-replay-detection-hotfix.md
   * (main commit e2d1380, merged into this branch) — POST /auth/refresh now
   * treats a *found* used_tokens row as "current, valid, unconsumed" and an
   * *absent* row as "already consumed" (replay), matching what login's
   * best-effort jti INSERT was always meant to establish. Un-skipped now
   * that the fix is present on this branch.
   */
  it('the demo refresh_token can be redeemed via POST /api/v1/auth/refresh for a new access token', async () => {
    if (!dbAvailable) return;
    const email = uniqueEmail('refresh-roundtrip');

    try {
      const startRes = await request(app).post('/api/v1/demo/start').send({ email });
      expect(startRes.status).toBe(200);
      const decoded = jwt.decode(startRes.body.data.token);

      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: startRes.body.data.refresh_token });

      expect(refreshRes.status).toBe(200);
      expect(typeof refreshRes.body.data.token).toBe('string');
      expect(typeof refreshRes.body.data.refresh_token).toBe('string');
      const decodedNewAccess = jwt.decode(refreshRes.body.data.token);
      expect(decodedNewAccess.user_id).toBe(decoded.user_id);
      expect(decodedNewAccess.client_id).toBe(decoded.client_id);
      expect(decodedNewAccess.role).toBe('admin');
    } finally {
      await cleanupByEmail(email);
    }
  });

  // ----------------------------------------------------------------
  // Duplicate email — existing ACTIVE demo (resume, no re-seed)
  // ----------------------------------------------------------------

  it('resumes an existing demo tenant for a duplicate email — no new client, extended expiry, same client_id', async () => {
    if (!dbAvailable) return;
    const email = uniqueEmail('resume');

    try {
      const first = await request(app).post('/api/v1/demo/start').send({ email });
      expect(first.status).toBe(200);
      const firstDecoded = jwt.decode(first.body.data.token);
      const firstClientId = firstDecoded.client_id;

      const beforeExpiry = (
        await probePool.query('SELECT demo_expires_at FROM clients WHERE id = $1', [firstClientId])
      ).rows[0].demo_expires_at;

      // Artificially move demo_expires_at into the near past-but-still-a-row
      // window so the extension is observably different (avoids a
      // millisecond-level flaky comparison against "now() + 7 days" twice).
      await probePool.query(
        'UPDATE clients SET demo_expires_at = now() + interval \'1 day\' WHERE id = $1',
        [firstClientId]
      );

      const second = await request(app).post('/api/v1/demo/start').send({ email });
      expect(second.status).toBe(200);
      expect(second.body.data.resumed).toBe(true);
      expect(typeof second.body.data.refresh_token).toBe('string');

      const secondDecoded = jwt.decode(second.body.data.token);
      expect(secondDecoded.client_id).toBe(firstClientId);

      // Exactly one clients row for this email — no duplicate tenant created
      const clientRows = await probePool.query('SELECT id FROM clients WHERE email = $1', [email]);
      expect(clientRows.rows).toHaveLength(1);

      // Employee/site counts unchanged — seedDemoTenant was NOT re-run
      const employeesCount = await probePool.query(
        'SELECT COUNT(*)::int AS n FROM employees WHERE client_id = $1',
        [firstClientId]
      );
      expect(employeesCount.rows[0].n).toBe(3);

      // Expiry was extended
      const afterExpiry = (
        await probePool.query('SELECT demo_expires_at FROM clients WHERE id = $1', [firstClientId])
      ).rows[0].demo_expires_at;
      expect(new Date(afterExpiry).getTime()).toBeGreaterThan(new Date(beforeExpiry).getTime());

      // Resume was audit-logged
      const audit = await probePool.query(
        'SELECT action FROM audit_log WHERE entity_id = $1 AND action = \'demo_tenant_resumed\'',
        [firstClientId]
      );
      expect(audit.rows.length).toBeGreaterThan(0);
    } finally {
      await cleanupByEmail(email);
    }
  });

  // ----------------------------------------------------------------
  // Duplicate email — existing REAL (non-demo) customer
  // ----------------------------------------------------------------

  it('refuses a real (non-demo) customer email with a generic message and creates nothing', async () => {
    if (!dbAvailable) return;
    const email = uniqueEmail('real-customer');

    // A "real" client: is_demo defaults to false.
    const realClient = await probePool.query(
      'INSERT INTO clients (id, name, email, plan) VALUES (uuid_generate_v4(), \'Real Co\', $1, \'starter\') RETURNING id',
      [email]
    );
    const realClientId = realClient.rows[0].id;

    try {
      const res = await request(app).post('/api/v1/demo/start').send({ email });

      // Refused — not 200/201, and no token pointing at the real client.
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(JSON.stringify(res.body)).not.toContain(realClientId);
      expect(JSON.stringify(res.body).toLowerCase()).not.toContain('token');

      // No employees/sites were created for the real client (no re-seed)
      const employeesCount = await probePool.query(
        'SELECT COUNT(*)::int AS n FROM employees WHERE client_id = $1',
        [realClientId]
      );
      expect(employeesCount.rows[0].n).toBe(0);

      // Still exactly one clients row for this email (the pre-existing real one)
      const clientRows = await probePool.query('SELECT id, is_demo FROM clients WHERE email = $1', [email]);
      expect(clientRows.rows).toHaveLength(1);
      expect(clientRows.rows[0].is_demo).toBe(false);
    } finally {
      await probePool.query('DELETE FROM clients WHERE id = $1', [realClientId]);
    }
  });

  // ----------------------------------------------------------------
  // Resume must not be blocked by the active-demo cap
  // ----------------------------------------------------------------

  it('still resumes an existing demo tenant even when the system is at the active-demo cap', async () => {
    if (!dbAvailable) return;

    const email = uniqueEmail('resume-at-cap');
    const fillerEmails = Array.from({ length: 20 }, (_, i) => uniqueEmail(`resume-cap-filler-${i}`));
    const newEmail = uniqueEmail('resume-cap-new');

    try {
      // Create the tenant we'll resume (this is itself 1 active demo).
      const first = await request(app).post('/api/v1/demo/start').send({ email });
      expect(first.status).toBe(200);
      const firstClientId = jwt.decode(first.body.data.token).client_id;

      // Fill up to (and past) the default cap of 20 with unrelated active demos.
      for (const fillerEmail of fillerEmails) {
        await probePool.query(
          `INSERT INTO clients (id, name, email, plan, is_demo, demo_expires_at)
           VALUES (uuid_generate_v4(), 'Cap Filler', $1, 'demo', true, now() + interval '7 days')`,
          [fillerEmail]
        );
      }
      const activeCount = await probePool.query(
        'SELECT COUNT(*)::int AS n FROM clients WHERE is_demo = true AND demo_expires_at > now()'
      );
      expect(activeCount.rows[0].n).toBeGreaterThan(20); // confirm we're genuinely over cap

      // A brand-new email must be blocked (over cap)...
      const blockedNew = await request(app).post('/api/v1/demo/start').send({ email: newEmail });
      expect(blockedNew.status).toBeGreaterThanOrEqual(400);
      expect(blockedNew.status).toBeLessThan(500);

      // ...but resuming the pre-existing tenant must still succeed.
      const resumed = await request(app).post('/api/v1/demo/start').send({ email });
      expect(resumed.status).toBe(200);
      expect(resumed.body.data.resumed).toBe(true);
      expect(jwt.decode(resumed.body.data.token).client_id).toBe(firstClientId);
    } finally {
      await cleanupByEmail(email);
      for (const fillerEmail of fillerEmails) {
        await cleanupByEmail(fillerEmail);
      }
      await cleanupByEmail(newEmail);
    }
  });

  // ----------------------------------------------------------------
  // Global active-demo cap
  // ----------------------------------------------------------------

  it('blocks new demo creation once the active-demo cap is reached, and allows the request that lands exactly on the cap', async () => {
    if (!dbAvailable) return;

    // Rather than mutating MAX_ACTIVE_DEMOS (which the route module reads
    // once at require() time — changing it mid-suite would require
    // jest.resetModules() + re-requiring app, which leaves orphaned Pool
    // handles behind and hangs Jest's exit), this test drives the real
    // default cap (20, unset MAX_ACTIVE_DEMOS) by seeding filler rows
    // directly. This also directly exercises the boundary the plan calls
    // out: the request that brings the count TO the cap must still
    // succeed; only the one that would exceed it is blocked.
    const FILLER_COUNT = 19; // + 1 real request below = 20 = the default cap
    const fillerEmails = Array.from({ length: FILLER_COUNT }, (_, i) => uniqueEmail(`cap-filler-${i}`));
    const boundaryEmail = uniqueEmail('cap-boundary');
    const blockedEmail = uniqueEmail('cap-blocked');

    try {
      // Seed filler rows directly (bypassing the route/seedDemoTenant —
      // this test is about the COUNT(*) cap check, not full tenant seeding).
      for (const fillerEmail of fillerEmails) {
        await probePool.query(
          `INSERT INTO clients (id, name, email, plan, is_demo, demo_expires_at)
           VALUES (uuid_generate_v4(), 'Cap Filler', $1, 'demo', true, now() + interval '7 days')`,
          [fillerEmail]
        );
      }

      const activeCount = await probePool.query(
        'SELECT COUNT(*)::int AS n FROM clients WHERE is_demo = true AND demo_expires_at > now()'
      );
      expect(activeCount.rows[0].n).toBe(FILLER_COUNT);

      // 20th active demo: count is 19 (< default cap of 20) — must succeed.
      const boundary = await request(app).post('/api/v1/demo/start').send({ email: boundaryEmail });
      expect(boundary.status).toBe(200);

      // 21st active demo: count is now 20 (>= default cap of 20) — must be blocked.
      const blocked = await request(app).post('/api/v1/demo/start').send({ email: blockedEmail });
      expect(blocked.status).toBeGreaterThanOrEqual(400);
      expect(blocked.status).toBeLessThan(500);

      const blockedClientRows = await probePool.query('SELECT id FROM clients WHERE email = $1', [blockedEmail]);
      expect(blockedClientRows.rows).toHaveLength(0);
    } finally {
      for (const fillerEmail of fillerEmails) {
        await cleanupByEmail(fillerEmail);
      }
      await cleanupByEmail(boundaryEmail);
      await cleanupByEmail(blockedEmail);
    }
  });

  // ----------------------------------------------------------------
  // Race condition — two near-simultaneous requests, same email
  // ----------------------------------------------------------------

  it('handles two parallel requests for the same email with exactly one tenant created and no raw 500', async () => {
    if (!dbAvailable) return;
    const email = uniqueEmail('race');

    try {
      const [resA, resB] = await Promise.all([
        request(app).post('/api/v1/demo/start').send({ email }),
        request(app).post('/api/v1/demo/start').send({ email }),
      ]);

      // Neither response is a raw/unhandled error.
      for (const res of [resA, resB]) {
        expect(res.status).not.toBe(500);
        expect(res.body).not.toHaveProperty('code', '23505');
      }

      // Both succeeded (one created, one resumed) — both are valid outcomes
      // of "clean" race handling; what must NOT happen is a raw DB error.
      expect([resA.status, resB.status]).toEqual([200, 200]);

      const clientRows = await probePool.query('SELECT id FROM clients WHERE email = $1', [email]);
      expect(clientRows.rows).toHaveLength(1);

      const clientId = clientRows.rows[0].id;
      const employeesCount = await probePool.query(
        'SELECT COUNT(*)::int AS n FROM employees WHERE client_id = $1',
        [clientId]
      );
      // Exactly one seed pass happened — 3 employees, not 6.
      expect(employeesCount.rows[0].n).toBe(3);

      const decodedA = jwt.decode(resA.body.data.token);
      const decodedB = jwt.decode(resB.body.data.token);
      expect(decodedA.client_id).toBe(clientId);
      expect(decodedB.client_id).toBe(clientId);

      // Exactly one of the two should report resumed:false (the winner);
      // the other resumed:true (the race-fallback loser).
      const resumedFlags = [resA.body.data.resumed, resB.body.data.resumed].sort();
      expect(resumedFlags).toEqual([false, true]);
    } finally {
      await cleanupByEmail(email);
    }
  });
});
