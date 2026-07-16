'use strict';

/**
 * Integration tests: scripts/cleanup-expired-demos.js (Task 6 of 9 —
 * Ambiente Demo Self-Service).
 *
 * Real-Postgres tests against the exported cleanupExpiredDemos(pool)
 * function directly (no shelling out to the CLI script) -- same
 * dbAvailable soft-skip pattern used across this codebase's demo-* tests
 * (demoSeed.test.js, demo-start.test.js, demo-contact.test.js).
 *
 * Covers plan Checkpoint 6 + security-checklist requirements:
 *   - full lifecycle: client + all cascaded children gone after cleanup
 *   - grace period respected (< 7 days past expiry is NOT deleted)
 *   - idempotency (test matrix row 9): running twice in a row is a clean
 *     no-op the second time
 *   - real (non-demo) customers are never matched, regardless of
 *     demo_expires_at value
 *   - an audit_log row is written for each deleted tenant
 */

const { Pool } = require('pg');
const { seedDemoTenant } = require('../utils/demoSeed');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('cleanup-expired-demos.js — cleanupExpiredDemos(pool) (real database)', () => {
  jest.setTimeout(30000);

  let pool;
  let dbAvailable = false;
  let cleanupExpiredDemos;

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[cleanup-expired-demos.test] Skipping real-DB tests — could not connect to ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}: ${err.message}`
      );
    }

    if (dbAvailable) {
      ({ cleanupExpiredDemos } = require('../../scripts/cleanup-expired-demos'));
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  /**
   * Creates a demo tenant (via a fresh client/transaction, mirroring how
   * POST /demo/start creates one), then backdates demo_expires_at by
   * `daysAgo` days from now.
   */
  async function createExpiredDemoTenant(label, daysAgo) {
    const email = uniqueEmail(label);
    const dbClient = await pool.connect();
    let clientId;
    try {
      await dbClient.query('BEGIN');
      const clientResult = await dbClient.query(
        `INSERT INTO clients (id, name, email, plan, is_demo, demo_expires_at, demo_contact_email)
         VALUES (uuid_generate_v4(), 'Demo Tenant', $1, 'demo', true, now() - ($2 || ' days')::interval, $1)
         RETURNING id`,
        [email, String(daysAgo)]
      );
      clientId = clientResult.rows[0].id;
      await seedDemoTenant(clientId, dbClient);
      await dbClient.query('COMMIT');
    } catch (err) {
      await dbClient.query('ROLLBACK');
      throw err;
    } finally {
      dbClient.release();
    }
    return { clientId, email };
  }

  async function countChildren(clientId) {
    const [sites, employees, checkins, leaveRequests, illnesses, contactRequests, clients] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS n FROM sites WHERE client_id = $1', [clientId]),
      pool.query('SELECT COUNT(*)::int AS n FROM employees WHERE client_id = $1', [clientId]),
      pool.query('SELECT COUNT(*)::int AS n FROM checkins WHERE client_id = $1', [clientId]),
      pool.query('SELECT COUNT(*)::int AS n FROM leave_requests WHERE client_id = $1', [clientId]),
      pool.query('SELECT COUNT(*)::int AS n FROM illnesses WHERE client_id = $1', [clientId]),
      pool.query('SELECT COUNT(*)::int AS n FROM demo_contact_requests WHERE client_id = $1', [clientId]),
      pool.query('SELECT COUNT(*)::int AS n FROM clients WHERE id = $1', [clientId]),
    ]);
    return {
      sites: sites.rows[0].n,
      employees: employees.rows[0].n,
      checkins: checkins.rows[0].n,
      leaveRequests: leaveRequests.rows[0].n,
      illnesses: illnesses.rows[0].n,
      contactRequests: contactRequests.rows[0].n,
      clients: clients.rows[0].n,
    };
  }

  // ----------------------------------------------------------------
  // Full lifecycle — client + all cascaded children gone
  // ----------------------------------------------------------------

  it('deletes a demo tenant past the 7-day grace period, cascading to all child tables', async () => {
    if (!dbAvailable) return;
    const { clientId, email } = await createExpiredDemoTenant('cleanup-lifecycle', 10);

    try {
      const before = await countChildren(clientId);
      expect(before.clients).toBe(1);
      expect(before.sites).toBeGreaterThan(0);
      expect(before.employees).toBeGreaterThan(0);
      expect(before.checkins).toBeGreaterThan(0);

      const result = await cleanupExpiredDemos(pool);
      expect(result.deletedCount).toBeGreaterThanOrEqual(1);
      expect(result.deletedClientIds).toContain(clientId);

      const after = await countChildren(clientId);
      expect(after.clients).toBe(0);
      expect(after.sites).toBe(0);
      expect(after.employees).toBe(0);
      expect(after.checkins).toBe(0);
      expect(after.leaveRequests).toBe(0);
      expect(after.illnesses).toBe(0);
      expect(after.contactRequests).toBe(0);
    } finally {
      await pool.query('DELETE FROM clients WHERE email = $1', [email]);
    }
  });

  // ----------------------------------------------------------------
  // Grace period respected — < 7 days past expiry NOT deleted
  // ----------------------------------------------------------------

  it('does NOT delete a demo tenant still within the 7-day grace period', async () => {
    if (!dbAvailable) return;
    const { clientId, email } = await createExpiredDemoTenant('cleanup-grace-period', 3);

    try {
      const result = await cleanupExpiredDemos(pool);
      expect(result.deletedClientIds).not.toContain(clientId);

      const after = await countChildren(clientId);
      expect(after.clients).toBe(1);
    } finally {
      await pool.query('DELETE FROM clients WHERE email = $1', [email]);
    }
  });

  // ----------------------------------------------------------------
  // Idempotency (test matrix row 9)
  // ----------------------------------------------------------------

  it('is idempotent: running twice in a row is a clean no-op the second time', async () => {
    if (!dbAvailable) return;
    const { clientId, email } = await createExpiredDemoTenant('cleanup-idempotent', 10);

    try {
      const first = await cleanupExpiredDemos(pool);
      expect(first.deletedClientIds).toContain(clientId);

      await expect(cleanupExpiredDemos(pool)).resolves.toEqual(
        expect.objectContaining({ deletedClientIds: expect.not.arrayContaining([clientId]) })
      );

      const second = await cleanupExpiredDemos(pool);
      expect(second.deletedClientIds).not.toContain(clientId);
      // Second run must not throw and must complete cleanly even with zero
      // matching rows overall being common in a healthy system.
    } finally {
      await pool.query('DELETE FROM clients WHERE email = $1', [email]);
    }
  });

  // ----------------------------------------------------------------
  // Real (non-demo) customers untouched
  // ----------------------------------------------------------------

  it('never matches a real (non-demo) client, even with demo_expires_at set in the past', async () => {
    if (!dbAvailable) return;
    const email = uniqueEmail('cleanup-real-customer');
    const clientResult = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo, demo_expires_at)
       VALUES (uuid_generate_v4(), 'Real Co', $1, 'starter', false, now() - interval '30 days')
       RETURNING id`,
      [email]
    );
    const clientId = clientResult.rows[0].id;

    try {
      const result = await cleanupExpiredDemos(pool);
      expect(result.deletedClientIds).not.toContain(clientId);

      const remaining = await pool.query('SELECT COUNT(*)::int AS n FROM clients WHERE id = $1', [clientId]);
      expect(remaining.rows[0].n).toBe(1);
    } finally {
      await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
    }
  });

  // ----------------------------------------------------------------
  // Audit log written
  // ----------------------------------------------------------------

  it('writes an audit_log row for each deleted tenant', async () => {
    if (!dbAvailable) return;
    const { clientId, email } = await createExpiredDemoTenant('cleanup-audit-log', 10);

    try {
      await cleanupExpiredDemos(pool);

      const auditRows = await pool.query(
        'SELECT action, entity, entity_id FROM audit_log WHERE action = \'demo_tenant_cleanup\' AND entity_id = $1',
        [clientId]
      );
      expect(auditRows.rows).toHaveLength(1);
      expect(auditRows.rows[0].entity).toBe('client');
    } finally {
      await pool.query('DELETE FROM clients WHERE email = $1', [email]);
      await pool.query('DELETE FROM audit_log WHERE action = \'demo_tenant_cleanup\' AND entity_id = $1', [clientId]);
    }
  });
});
