'use strict';

/**
 * Migration 035 — employee lifecycle columns (active, hiring_date, exit_date).
 *
 * Real-Postgres test, same pattern as admin-clients-scoping.test.js:
 * dbAvailable soft-skip, own Pool with the repo's standard
 * DB_HOST/DB_PORT/... fallback-to-localhost convention (src/db/pool.js has no
 * defaults and relies on config-loader, which jest.setup.js does not invoke).
 */

const { Pool } = require('pg');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('migration 035 — employee lifecycle columns', () => {
  let pool;
  let dbAvailable = false;

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[migration-035 test] DB unavailable, skipping: ${err.message}`);
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('adds active/hiring_date/exit_date with correct defaults', async () => {
    if (!dbAvailable) return;
    const cols = await pool.query(
      `SELECT column_name, data_type, column_default
       FROM information_schema.columns
       WHERE table_name = 'employees' AND column_name IN ('active', 'hiring_date', 'exit_date')`
    );
    const byName = Object.fromEntries(cols.rows.map((r) => [r.column_name, r]));
    expect(byName.active.data_type).toBe('boolean');
    expect(byName.active.column_default).toMatch(/true/);
    expect(byName.hiring_date.data_type).toBe('date');
    expect(byName.exit_date.data_type).toBe('date');
  });

  // The previous version of this test asserted a GLOBAL invariant — "no
  // active employee anywhere in the shared test DB has a NULL hiring_date"
  // — which was never actually true as an ongoing invariant: hiring_date has
  // no NOT NULL/DB-level constraint (migration 035 only backfilled it once,
  // for rows that existed at that moment), and application code explicitly
  // treats a NULL hiring_date as valid for legacy employees (see the
  // "hiring_date NULL ... never blocks" comment in checkins.js). The
  // assertion only ever passed by coincidence, when no other concurrently-
  // running test file happened to have an in-flight active+NULL-hiring_date
  // employee at that exact instant — and broke for real the first time a
  // test left one behind (or two real-DB test files raced under Jest's
  // default parallel workers, both hitting the shared DB at once). Rewritten
  // to test the actual backfill SQL in isolation, scoped to rows this test
  // itself creates and cleans up — asserting what migration 035 actually
  // guarantees (the UPDATE statement's own behavior), not a permanent
  // property of a live, continuously-written-to shared table.
  it('backfill UPDATE sets hiring_date to the Europe/Rome calendar date of created_at, for a row with hiring_date IS NULL', async () => {
    if (!dbAvailable) return;
    const clientId = await makeClient(pool);
    try {
      const employeeId = await makeEmployeeWithHiringDate(pool, clientId, null);

      // Exact statement from migrations/035_employee_lifecycle.sql (fixed
      // 2026-09-12, see CLAUDE.md Pattern 6), scoped to this test's own
      // client so it can never touch another test's data.
      await pool.query(
        `UPDATE employees SET hiring_date = (created_at AT TIME ZONE 'Europe/Rome')::date
         WHERE hiring_date IS NULL AND client_id = $1`,
        [clientId]
      );

      const res = await pool.query(
        `SELECT hiring_date, (created_at AT TIME ZONE 'Europe/Rome')::date AS created_date
         FROM employees WHERE id = $1`,
        [employeeId]
      );
      expect(res.rows[0].hiring_date).not.toBeNull();
      expect(res.rows[0].hiring_date).toEqual(res.rows[0].created_date);
    } finally {
      await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
    }
  });

  it('backfill UPDATE never overwrites an already-set hiring_date (idempotent, matches the WHERE hiring_date IS NULL guard)', async () => {
    if (!dbAvailable) return;
    const clientId = await makeClient(pool);
    try {
      const explicitHiringDate = '2020-01-15';
      const employeeId = await makeEmployeeWithHiringDate(pool, clientId, explicitHiringDate);

      await pool.query(
        `UPDATE employees SET hiring_date = (created_at AT TIME ZONE 'Europe/Rome')::date
         WHERE hiring_date IS NULL AND client_id = $1`,
        [clientId]
      );

      const res = await pool.query(
        'SELECT hiring_date::text AS hiring_date FROM employees WHERE id = $1',
        [employeeId]
      );
      expect(res.rows[0].hiring_date).toBe(explicitHiringDate);
    } finally {
      await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
    }
  });

  // Regression test for the timezone bug found 2026-09-12 while designing
  // the CI check for CLAUDE.md Pattern 6: the original migration cast
  // created_at (TIMESTAMPTZ) to ::date with NO explicit timezone, which
  // evaluates in the DB SESSION's timezone (UTC on AWS RDS by default) —
  // not Europe/Rome, the calendar an employee's "creation day" is actually
  // meant in. During the ~00:00-02:00 Europe/Rome window this silently
  // backdated hiring_date by one day. Forces the session to UTC explicitly,
  // matching production, so it reproduces (and proves the fix for) the bug
  // regardless of the local machine's own timezone (same technique as
  // eventConflict-timezone.test.js and queryScope-timezone.test.js).
  it('backfill UPDATE uses the Europe/Rome calendar day, not the UTC one, for an employee created just after Rome midnight', async () => {
    if (!dbAvailable) return;
    const client = await pool.connect();
    let clientId;
    try {
      await client.query('SET timezone = \'UTC\'');
      clientId = await makeClient(client);

      // 2026-08-22T00:30:00+02:00 (Rome, CEST) == 2026-08-21T22:30:00Z. A
      // UTC-session `created_at::date` cast would wrongly backdate this to
      // 2026-08-21.
      const employeeResult = await client.query(
        `INSERT INTO employees (client_id, email, name, role, active, hiring_date, created_at)
         VALUES ($1, $2, 'Migration 035 TZ Regression Employee', 'employee', true, NULL, '2026-08-22T00:30:00+02:00'::timestamptz)
         RETURNING id`,
        [clientId, `migration-035-tz-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`]
      );
      const employeeId = employeeResult.rows[0].id;

      await client.query(
        `UPDATE employees SET hiring_date = (created_at AT TIME ZONE 'Europe/Rome')::date
         WHERE hiring_date IS NULL AND client_id = $1`,
        [clientId]
      );

      const res = await client.query('SELECT hiring_date::text AS hiring_date FROM employees WHERE id = $1', [employeeId]);
      expect(res.rows[0].hiring_date).toBe('2026-08-22');
    } finally {
      if (clientId) await client.query('DELETE FROM clients WHERE id = $1', [clientId]);
      client.release();
    }
  });
});

async function makeClient(pool) {
  const email = `migration-035-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  const result = await pool.query(
    `INSERT INTO clients (id, name, email, plan, is_demo)
     VALUES (uuid_generate_v4(), 'Migration 035 Regression Co', $1, 'starter', false)
     RETURNING id`,
    [email]
  );
  return result.rows[0].id;
}

async function makeEmployeeWithHiringDate(pool, clientId, hiringDate) {
  const email = `migration-035-employee-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  const result = await pool.query(
    `INSERT INTO employees (client_id, email, name, role, active, hiring_date)
     VALUES ($1, $2, 'Migration 035 Regression Employee', 'employee', true, $3)
     RETURNING id`,
    [clientId, email, hiringDate]
  );
  return result.rows[0].id;
}
