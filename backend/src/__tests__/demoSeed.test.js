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
  let demoClientId;

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
    if (dbAvailable && demoClientId) {
      // clients row cascades to sites/employees/checkins/leave_requests/illnesses
      await pool.query('DELETE FROM clients WHERE id = $1', [demoClientId]);
    }
    if (pool) {
      await pool.end();
    }
  });

  it('creates 1 site, 3 employees (admin/manager/employee), and non-empty check-in/leave/illness history relative to today', async () => {
    if (!dbAvailable) {
      return;
    }

    const clientResult = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo, demo_expires_at)
       VALUES (uuid_generate_v4(), 'Demo Test Tenant', $1, 'demo', true, NOW() + INTERVAL '7 days')
       RETURNING id`,
      [`demo-test-${Date.now()}@example.invalid`]
    );
    demoClientId = clientResult.rows[0].id;

    const result = await seedDemoTenant(demoClientId, pool);

    // --- shape of the returned summary ---
    expect(result.site).toBeDefined();
    expect(result.employees.admin.role).toBe('admin');
    expect(result.employees.manager.role).toBe('manager');
    expect(result.employees.employee.role).toBe('employee');
    expect(result.counts.checkins).toBeGreaterThan(0);
    expect(result.counts.leaveRequests).toBeGreaterThan(0);
    expect(result.counts.illnesses).toBeGreaterThan(0);

    // --- real row counts, queried independently of the function's own return value ---
    const sitesCount = await pool.query('SELECT COUNT(*)::int AS n FROM sites WHERE client_id = $1', [demoClientId]);
    expect(sitesCount.rows[0].n).toBe(1);

    const employeesCount = await pool.query(
      'SELECT COUNT(*)::int AS n FROM employees WHERE client_id = $1',
      [demoClientId]
    );
    expect(employeesCount.rows[0].n).toBe(3);

    const roleCounts = await pool.query(
      'SELECT role, COUNT(*)::int AS n FROM employees WHERE client_id = $1 GROUP BY role',
      [demoClientId]
    );
    const rolesSeen = roleCounts.rows.map((r) => r.role).sort();
    expect(rolesSeen).toEqual(['admin', 'employee', 'manager']);

    const checkinsCount = await pool.query(
      'SELECT COUNT(*)::int AS n FROM checkins WHERE client_id = $1',
      [demoClientId]
    );
    expect(checkinsCount.rows[0].n).toBeGreaterThan(0);

    const leaveCount = await pool.query(
      'SELECT COUNT(*)::int AS n FROM leave_requests WHERE client_id = $1',
      [demoClientId]
    );
    expect(leaveCount.rows[0].n).toBeGreaterThan(0);

    const illnessCount = await pool.query(
      'SELECT COUNT(*)::int AS n FROM illnesses WHERE client_id = $1',
      [demoClientId]
    );
    expect(illnessCount.rows[0].n).toBeGreaterThan(0);

    // --- critical: check-in dates actually fall within the last ~35 days from now ---
    const dateRange = await pool.query(
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
    const leaveRows = await pool.query(
      'SELECT approved_by, approved_at, status FROM leave_requests WHERE client_id = $1',
      [demoClientId]
    );
    for (const row of leaveRows.rows) {
      expect(row.status).toBe('APPROVED');
      expect(row.approved_by).not.toBeNull();
      expect(row.approved_at).not.toBeNull();
    }
  });

  it('is idempotent-safe to call twice for two different clients without UUID/constraint collisions', async () => {
    if (!dbAvailable) {
      return;
    }

    const clientResult = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo, demo_expires_at)
       VALUES (uuid_generate_v4(), 'Demo Test Tenant 2', $1, 'demo', true, NOW() + INTERVAL '7 days')
       RETURNING id`,
      [`demo-test-2-${Date.now()}@example.invalid`]
    );
    const secondClientId = clientResult.rows[0].id;

    try {
      const result = await seedDemoTenant(secondClientId, pool);
      expect(result.counts.checkins).toBeGreaterThan(0);
    } finally {
      await pool.query('DELETE FROM clients WHERE id = $1', [secondClientId]);
    }
  });
});
