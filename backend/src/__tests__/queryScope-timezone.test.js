'use strict';

/**
 * Regression test for a timezone bug in buildScopedFilters()'s dateFrom/dateTo
 * range filter: comparing checkins.timestamp (TIMESTAMPTZ) against a bare
 * DATE parameter relies on Postgres's implicit DATE→TIMESTAMPTZ cast, which
 * interprets midnight in the DB SESSION's timezone (UTC on AWS RDS by
 * default) — not Europe/Rome, the calendar the date_from/date_to query
 * params (GET /checkins, /checkins/stats, /export/csv) are actually
 * expressed in. During the ~00:00-02:00 Europe/Rome window this silently
 * drops/admits the wrong rows, including on the payroll export path.
 *
 * Same bug class already fixed twice elsewhere in this codebase (commit
 * 615fcbf, 2026-08-18; commit 89986b3, 2026-08-22) — see CLAUDE.md Pattern 6.
 *
 * The local test Postgres instance happens to already run with session
 * timezone Europe/Rome (inherited from the OS default), which would mask
 * this bug. This test forces the connection's session timezone to UTC
 * explicitly — matching production's actual default — so it reproduces
 * (and proves the fix for) the bug regardless of the local machine's own
 * timezone.
 */

const { Pool } = require('pg');
const { buildScopedFilters } = require('../utils/queryScope');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('buildScopedFilters — dateFrom/dateTo timezone regression (UTC session vs Europe/Rome date)', () => {
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
      console.warn(`[queryScope-timezone.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'QueryScope TZ Regression Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('queryscope-tz-client')]
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
       VALUES ($1, $2, 'QueryScope TZ Regression Employee', 'employee', true)
       RETURNING id`,
      [clientId, uniqueEmail('queryscope-tz-employee')]
    );
    return result.rows[0].id;
  }

  async function makeCheckin(client, clientId, employeeId, siteId, timestampIso) {
    await client.query(
      `INSERT INTO checkins (employee_id, site_id, client_id, type, timestamp, created_by, created_at)
       VALUES ($1, $2, $3, 'IN', $4::timestamptz, $1, NOW())`,
      [employeeId, siteId, clientId, timestampIso]
    );
  }

  async function countMatching(client, clientId, employeeId, dateFrom, dateTo) {
    const { whereClauses, params } = buildScopedFilters(
      { client_id: clientId, role: 'admin' },
      { employeeId, dateFrom, dateTo },
      'c'
    );
    const result = await client.query(
      `SELECT COUNT(*)::int AS n FROM checkins c WHERE ${whereClauses.join(' AND ')}`,
      params
    );
    return result.rows[0].n;
  }

  it('includes a checkin made at 00:30 Europe/Rome when date_from=that day, even under a UTC session (the AWS RDS default)', async () => {
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
      // A UTC session doing the implicit DATE('2026-08-22')→TIMESTAMPTZ cast
      // would get 2026-08-22T00:00:00Z — LATER than this checkin — and the
      // buggy `>=` filter would wrongly exclude it from a date_from=2026-08-22
      // query, even though it's clearly within the Rome calendar day.
      await makeCheckin(client, clientId, employeeId, siteId, '2026-08-22T00:30:00+02:00');

      const count = await countMatching(client, clientId, employeeId, '2026-08-22', '2026-08-22');

      expect(count).toBe(1);
    } finally {
      // Unconditional cleanup — must run even if the assertion above throws
      // (see eventConflict-timezone.test.js for why this matters: a failing
      // RED-phase run would otherwise leave orphaned rows in the shared test
      // DB that spuriously fail unrelated global-invariant tests).
      if (clientId) await client.query('DELETE FROM clients WHERE id = $1', [clientId]);
      client.release();
    }
  });

  it('excludes a checkin on the adjacent Europe/Rome calendar day, even under a UTC session (no false positive)', async () => {
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

      const count = await countMatching(client, clientId, employeeId, '2026-08-22', '2026-08-22');

      expect(count).toBe(0);
    } finally {
      if (clientId) await client.query('DELETE FROM clients WHERE id = $1', [clientId]);
      client.release();
    }
  });

  it('includes a checkin made at 23:50 Europe/Rome when date_to=that day, even under a UTC session (upper boundary)', async () => {
    if (!dbAvailable) return;
    const client = await pool.connect();
    let clientId;
    try {
      await client.query('SET timezone = \'UTC\'');

      clientId = await makeClientRow(client);
      const siteId = await makeSite(client, clientId);
      const employeeId = await makeEmployee(client, clientId);

      // 2026-08-22T23:50:00+02:00 (Rome, CEST) == 2026-08-22T21:50:00Z.
      // The buggy `< $dateTo::date + INTERVAL '1 day'` upper bound, cast in
      // a UTC session, would resolve to 2026-08-23T00:00:00Z — this checkin
      // (21:50Z) would still pass that buggy check by coincidence, so the
      // meaningful regression is the date_from case above; this test proves
      // the upper boundary isn't accidentally too strict after the fix.
      await makeCheckin(client, clientId, employeeId, siteId, '2026-08-22T23:50:00+02:00');

      const count = await countMatching(client, clientId, employeeId, '2026-08-22', '2026-08-22');

      expect(count).toBe(1);
    } finally {
      if (clientId) await client.query('DELETE FROM clients WHERE id = $1', [clientId]);
      client.release();
    }
  });
});
