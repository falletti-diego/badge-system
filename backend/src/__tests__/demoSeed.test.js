'use strict';

/**
 * Tests: demoSeed.js — Ambiente Demo Self-Service (Task 2)
 *
 * Two layers:
 *   1. Pure unit tests for the internal date/pairing helpers — deterministic,
 *      no DB required, always run.
 *   2. A real-database integration test that calls seedDemoTenant() against
 *      an actual Postgres instance and asserts on real row counts and real
 *      date ranges (per plan Checkpoint 2: "funzione testata isolatamente,
 *      verifica conteggio righe generate"). This intentionally does NOT use
 *      a mocked pool — the whole point is to prove the generated SQL is
 *      schema-valid and produces non-empty data.
 *
 *      seedDemoTenant() itself never manages BEGIN/COMMIT/ROLLBACK (that's
 *      the caller's job — see demoSeed.js JSDoc), so each test here owns its
 *      own transaction explicitly: `pool.connect()` -> `BEGIN` -> call the
 *      function -> `ROLLBACK` -> `release()`. This both matches how the
 *      real (not-yet-built) POST /demo/start route will call it, and means
 *      every test cleans up after itself via rollback rather than manual
 *      DELETE statements.
 *
 *      Layer 2 soft-skips (passes trivially with a console warning) when no
 *      Postgres instance is reachable at the configured connection, so it
 *      does not break `npm test` in environments without a live DB (e.g.
 *      the current CI pipeline, which does not provision a Postgres
 *      service). Run it for real locally by pointing DB_* env vars at a
 *      database that has the current schema applied, e.g.:
 *
 *        DB_HOST=localhost DB_PORT=5432 DB_USER=<you> DB_PASSWORD= DB_NAME=badge_system \
 *          NODE_ENV=test npx jest src/__tests__/demoSeed.test.js
 */

const { Pool } = require('pg');
const { seedDemoTenant, _internal } = require('../utils/demoSeed');
const { getWeekdaysInRange, findConsecutiveRun, buildCheckinPairs, toUtcDateString } = _internal;

// ============================================================
// Layer 1: pure helper unit tests (no DB)
// ============================================================

describe('demoSeed internal helpers (pure, no DB)', () => {
  describe('getWeekdaysInRange', () => {
    it('excludes weekends and includes the reference date when it is a weekday', () => {
      // 2026-07-13 is a Monday
      const ref = new Date('2026-07-13T12:00:00.000Z');
      const dates = getWeekdaysInRange(9, ref); // 10 calendar days back to back incl ref
      expect(dates).toContain('2026-07-13');
      expect(dates).not.toContain('2026-07-11'); // Saturday
      expect(dates).not.toContain('2026-07-12'); // Sunday
      // ascending order
      for (let i = 1; i < dates.length; i++) {
        expect(new Date(dates[i]).getTime()).toBeGreaterThan(new Date(dates[i - 1]).getTime());
      }
    });

    it('never returns a Saturday or Sunday across a larger range', () => {
      const ref = new Date('2026-07-13T00:00:00.000Z');
      const dates = getWeekdaysInRange(34, ref);
      for (const d of dates) {
        const dow = new Date(`${d}T00:00:00.000Z`).getUTCDay();
        expect(dow).not.toBe(0);
        expect(dow).not.toBe(6);
      }
    });
  });

  describe('findConsecutiveRun', () => {
    it('finds a true back-to-back run of the requested length', () => {
      const ref = new Date('2026-07-13T00:00:00.000Z');
      const dates = getWeekdaysInRange(34, ref);
      const run = findConsecutiveRun(dates, 3, 0);
      expect(run).not.toBeNull();
      const d1 = new Date(`${run.startDate}T00:00:00.000Z`);
      const d2 = new Date(`${run.endDate}T00:00:00.000Z`);
      expect(Math.round((d2 - d1) / 86400000)).toBe(2); // 3 consecutive days span 2 days
    });

    it('returns null when no run of that length fits after minIndex', () => {
      const dates = ['2026-07-13', '2026-07-14'];
      const run = findConsecutiveRun(dates, 5, 0);
      expect(run).toBeNull();
    });
  });

  describe('buildCheckinPairs', () => {
    it('produces one IN and one OUT per non-absent date', () => {
      const dates = ['2026-07-06', '2026-07-07', '2026-07-08'];
      const rows = buildCheckinPairs(dates, new Set(['2026-07-07']));
      expect(rows).toHaveLength(4); // 2 days * 2 (IN/OUT), 1 day skipped
      expect(rows.filter((r) => r.type === 'IN')).toHaveLength(2);
      expect(rows.filter((r) => r.type === 'OUT')).toHaveLength(2);
      expect(rows.some((r) => r.timestamp.startsWith('2026-07-07'))).toBe(false);
    });

    it('sprinkles at least one overtime (20:00) checkout across enough days', () => {
      const dates = getWeekdaysInRange(34, new Date('2026-07-13T00:00:00.000Z'));
      const rows = buildCheckinPairs(dates, new Set());
      const overtimeOuts = rows.filter((r) => r.type === 'OUT' && r.timestamp.includes('T20:00:00'));
      expect(overtimeOuts.length).toBeGreaterThan(0);
    });
  });

  describe('toUtcDateString', () => {
    it('formats a Date as YYYY-MM-DD', () => {
      expect(toUtcDateString(new Date('2026-07-13T15:30:00.000Z'))).toBe('2026-07-13');
    });
  });
});

// ============================================================
// Layer 2: real-database integration test
// ============================================================

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('seedDemoTenant (real database)', () => {
  jest.setTimeout(30000);

  let pool;
  let dbAvailable = false;

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // No reachable Postgres with this schema — soft-skip layer 2.
      // eslint-disable-next-line no-console
      console.warn(
        `[demoSeed.test] Skipping real-DB tests — could not connect to ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}: ${err.message}`
      );
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  /**
   * Inserts a throwaway `clients` row on the given (already-BEGIN'd) client
   * and returns its id. Mirrors what the real (not-yet-built) POST
   * /demo/start route will do inside its own transaction before calling
   * seedDemoTenant().
   */
  async function insertDemoClient(client, label) {
    const result = await client.query(
      `INSERT INTO clients (id, name, email, plan, is_demo, demo_expires_at)
       VALUES (uuid_generate_v4(), $1, $2, 'demo', true, NOW() + INTERVAL '7 days')
       RETURNING id`,
      [label, `${label.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`]
    );
    return result.rows[0].id;
  }

  it('creates 1 site, 3 employees (admin/manager/employee), and non-empty check-in/leave/illness history relative to today', async () => {
    if (!dbAvailable) {
      return;
    }

    // seedDemoTenant() never manages its own transaction — the caller does,
    // exactly as the future POST /demo/start route will. ROLLBACK at the end
    // both proves that contract and cleans up without manual DELETEs.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const demoClientId = await insertDemoClient(client, 'Demo Test Tenant');
      const result = await seedDemoTenant(demoClientId, client);

      // --- shape of the returned summary ---
      expect(result.site).toBeDefined();
      expect(result.employees.admin.role).toBe('admin');
      expect(result.employees.manager.role).toBe('manager');
      expect(result.employees.employee.role).toBe('employee');
      expect(result.counts.checkins).toBeGreaterThan(0);
      expect(result.counts.leaveRequests).toBeGreaterThan(0);
      expect(result.counts.illnesses).toBeGreaterThan(0);

      // --- real row counts, queried independently of the function's own return value ---
      const sitesCount = await client.query('SELECT COUNT(*)::int AS n FROM sites WHERE client_id = $1', [
        demoClientId,
      ]);
      expect(sitesCount.rows[0].n).toBe(1);

      const employeesCount = await client.query(
        'SELECT COUNT(*)::int AS n FROM employees WHERE client_id = $1',
        [demoClientId]
      );
      expect(employeesCount.rows[0].n).toBe(3);

      const roleCounts = await client.query(
        'SELECT role, COUNT(*)::int AS n FROM employees WHERE client_id = $1 GROUP BY role',
        [demoClientId]
      );
      const rolesSeen = roleCounts.rows.map((r) => r.role).sort();
      expect(rolesSeen).toEqual(['admin', 'employee', 'manager']);

      const checkinsCount = await client.query(
        'SELECT COUNT(*)::int AS n FROM checkins WHERE client_id = $1',
        [demoClientId]
      );
      expect(checkinsCount.rows[0].n).toBeGreaterThan(0);

      // admin should have SOME check-ins (cosmetic, not blank) but fewer
      // than the employee/manager, who work the full weekday range.
      const adminCheckinsCount = await client.query(
        'SELECT COUNT(*)::int AS n FROM checkins WHERE client_id = $1 AND employee_id = $2',
        [demoClientId, result.employees.admin.id]
      );
      expect(adminCheckinsCount.rows[0].n).toBeGreaterThan(0);
      expect(adminCheckinsCount.rows[0].n).toBeLessThan(checkinsCount.rows[0].n);

      const leaveCount = await client.query(
        'SELECT COUNT(*)::int AS n FROM leave_requests WHERE client_id = $1',
        [demoClientId]
      );
      expect(leaveCount.rows[0].n).toBeGreaterThan(0);

      const illnessCount = await client.query(
        'SELECT COUNT(*)::int AS n FROM illnesses WHERE client_id = $1',
        [demoClientId]
      );
      expect(illnessCount.rows[0].n).toBeGreaterThan(0);

      // --- critical: check-in dates actually fall within the last ~35 days from now ---
      const dateRange = await client.query(
        'SELECT MIN(timestamp) AS min_ts, MAX(timestamp) AS max_ts FROM checkins WHERE client_id = $1',
        [demoClientId]
      );
      const now = new Date();
      const minTs = new Date(dateRange.rows[0].min_ts);
      const maxTs = new Date(dateRange.rows[0].max_ts);
      const daysSinceMax = (now - maxTs) / 86400000;
      const daysSinceMin = (now - minTs) / 86400000;
      expect(daysSinceMax).toBeLessThanOrEqual(7); // most recent checkin should be very recent (within last week)
      expect(daysSinceMin).toBeLessThanOrEqual(40); // oldest checkin within the ~34-day generation window (+buffer)

      // approved_by/approved_at both set (CHECK constraint: both-or-neither)
      const leaveRows = await client.query(
        'SELECT approved_by, approved_at, status FROM leave_requests WHERE client_id = $1',
        [demoClientId]
      );
      for (const row of leaveRows.rows) {
        expect(row.status).toBe('APPROVED');
        expect(row.approved_by).not.toBeNull();
        expect(row.approved_at).not.toBeNull();
      }

      await client.query('ROLLBACK');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  it('does not collide across two independent tenants (different client_ids)', async () => {
    if (!dbAvailable) {
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const clientIdA = await insertDemoClient(client, 'Demo Test Tenant A');
      const clientIdB = await insertDemoClient(client, 'Demo Test Tenant B');

      const resultA = await seedDemoTenant(clientIdA, client);
      const resultB = await seedDemoTenant(clientIdB, client);

      expect(resultA.counts.checkins).toBeGreaterThan(0);
      expect(resultB.counts.checkins).toBeGreaterThan(0);
      // distinct tenants get distinct generated ids
      expect(resultA.site.id).not.toBe(resultB.site.id);
      expect(resultA.employees.admin.id).not.toBe(resultB.employees.admin.id);

      await client.query('ROLLBACK');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  it('rejects a second call for the SAME client_id with a clean UNIQUE-constraint violation (not silently duplicating data)', async () => {
    if (!dbAvailable) {
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const demoClientId = await insertDemoClient(client, 'Demo Test Tenant Dup');
      await seedDemoTenant(demoClientId, client);

      // Second call for the same client_id re-inserts the same fixed demo
      // emails (admin@demo.local etc.) for that client_id, which collides
      // with employees' UNIQUE(client_id, email) constraint — this is the
      // real, documented behavior: callers must not re-seed an existing
      // tenant, and Postgres enforces that loudly rather than silently
      // duplicating rows.
      await expect(seedDemoTenant(demoClientId, client)).rejects.toMatchObject({
        code: '23505', // unique_violation
      });

      await client.query('ROLLBACK');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
});
