'use strict';

/**
 * Regression test for the timezone bug found in code review (PR #7): comparing
 * `c.timestamp::date` (cast inside Postgres, in the DB session's timezone)
 * against a JS-computed Europe/Rome date string silently misses conflicts
 * during the ~00:00–02:00 Europe/Rome window, when the session timezone is
 * UTC (the AWS RDS default) — the calendar date still lags by one day there.
 *
 * This is exactly the bug class already fixed once in this codebase
 * (commit 615fcbf, 2026-08-18, see backend/src/routes/checkins.js:66-70).
 *
 * The local test Postgres instance happens to already run with session
 * timezone Europe/Rome (inherited from the OS default), which would mask
 * this bug in every other real-DB test in this repo. This test forces the
 * connection's session timezone to UTC explicitly — matching production's
 * actual default — so it reproduces (and proves the fix for) the bug
 * regardless of the local machine's own timezone.
 */

const { Pool } = require('pg');
const { findConflictingCheckin } = require('../utils/eventConflict');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('findConflictingCheckin — timezone regression (UTC session vs Europe/Rome date)', () => {
  jest.setTimeout(15000);

  let pool;
  let dbAvailable = false;

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[eventConflict-timezone.test] Skipping — could not connect: ${err.message}`);
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  async function makeClientRow(client) {
    const result = await client.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'EventConflict TZ Regression Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('eventconflict-tz-client')]
    );
    return result.rows[0].id;
  }

  async function makeSite(client, clientId) {
    const qrContent = `badge://test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await client.query(
      `INSERT INTO sites (id, client_id, name, qr_code_content)
       VALUES (uuid_generate_v4(), $1, 'Site', $2)
       RETURNING id`,
      [clientId, qrContent]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(client, clientId) {
    const result = await client.query(
      `INSERT INTO employees (client_id, email, name, role, active)
       VALUES ($1, $2, 'EventConflict TZ Regression Employee', 'employee', true)
       RETURNING id`,
      [clientId, uniqueEmail('eventconflict-tz-employee')]
    );
    return result.rows[0].id;
  }

  async function makeCheckin(client, clientId, employeeId, siteId, timestampIso) {
    const result = await client.query(
      `INSERT INTO checkins (employee_id, site_id, client_id, type, timestamp, created_by, created_at)
       VALUES ($1, $2, $3, 'IN', $4::timestamptz, $1, NOW())
       RETURNING id`,
      [employeeId, siteId, clientId, timestampIso]
    );
    return result.rows[0].id;
  }

  it('finds a checkin made at 00:30 Europe/Rome even when the DB session timezone is UTC (the AWS RDS default)', async () => {
    if (!dbAvailable) return;
    const client = await pool.connect();
    let clientId;
    try {
      // Simulates production: RDS Postgres defaults its session timezone to
      // UTC, unlike this developer machine's local Postgres instance.
      await client.query('SET timezone = \'UTC\'');

      clientId = await makeClientRow(client);
      const siteId = await makeSite(client, clientId);
      const employeeId = await makeEmployee(client, clientId);

      // 2026-08-22T00:30:00+02:00 (Rome, CEST) == 2026-08-21T22:30:00Z.
      // A UTC session casting this TIMESTAMPTZ to ::date directly would get
      // '2026-08-21' — one calendar day behind the Rome-local date, which is
      // what a JS-side dateInTimeZone() computation for this instant returns.
      await makeCheckin(client, clientId, employeeId, siteId, '2026-08-22T00:30:00+02:00');

      const conflict = await findConflictingCheckin(client, {
        clientId,
        employeeId,
        date: '2026-08-22', // the Europe/Rome calendar date for that instant
      });

      expect(conflict).not.toBeNull();
    } finally {
      // Unconditional cleanup — must run even if the assertion above throws,
      // otherwise a failing run leaves orphaned employees (active=true,
      // hiring_date=NULL) in the shared test DB that spuriously fail the
      // unrelated global-invariant assertion in
      // migration-035-employee-lifecycle.test.js (reproduced while writing
      // this test: the try-block-only cleanup never ran on a RED-phase
      // failure, and the next full-suite run picked up the leftover rows).
      if (clientId) await client.query('DELETE FROM clients WHERE id = $1', [clientId]);
      client.release();
    }
  });

  it('does NOT match a checkin on the adjacent Europe/Rome calendar day, even under a UTC session (no false positive)', async () => {
    if (!dbAvailable) return;
    const client = await pool.connect();
    let clientId;
    try {
      await client.query('SET timezone = \'UTC\'');

      clientId = await makeClientRow(client);
      const siteId = await makeSite(client, clientId);
      const employeeId = await makeEmployee(client, clientId);

      // 2026-08-21T20:00:00+02:00 (Rome) == 2026-08-21T18:00:00Z — squarely
      // August 21st in both timezones, no ambiguity.
      await makeCheckin(client, clientId, employeeId, siteId, '2026-08-21T20:00:00+02:00');

      const conflict = await findConflictingCheckin(client, {
        clientId,
        employeeId,
        date: '2026-08-22',
      });

      expect(conflict).toBeNull();
    } finally {
      if (clientId) await client.query('DELETE FROM clients WHERE id = $1', [clientId]);
      client.release();
    }
  });
});
