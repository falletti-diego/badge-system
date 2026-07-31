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

  it('backfills hiring_date for existing employees', async () => {
    if (!dbAvailable) return;
    const res = await pool.query(
      `SELECT COUNT(*) FROM employees WHERE active = true AND hiring_date IS NULL`
    );
    expect(Number(res.rows[0].count)).toBe(0);
  });
});
