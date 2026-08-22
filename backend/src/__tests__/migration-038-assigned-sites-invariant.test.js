'use strict';

/**
 * Migration 038 — invariante site_id ⊆ assigned_sites (trigger + backfill).
 *
 * Real-Postgres test, stesso pattern di migration-035-employee-lifecycle.test.js:
 * dbAvailable soft-skip, Pool con fallback DB_HOST/DB_PORT/... a localhost
 * (src/db/pool.js non ha default e dipende da config-loader, non invocato
 * da jest.setup.js).
 */

const { Pool } = require('pg');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('migration 038 — invariante site_id ⊆ assigned_sites', () => {
  let pool;
  let dbAvailable = false;

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[migration-038 test] DB unavailable, skipping: ${err.message}`);
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('backfill: la riga storicamente rotta maria@badge.local (migration 018) ha site_id in assigned_sites', async () => {
    if (!dbAvailable) return;
    const res = await pool.query(
      'SELECT site_id, assigned_sites FROM employees WHERE email = \'maria@badge.local\''
    );
    expect(res.rows.length).toBe(1);
    const { site_id, assigned_sites } = res.rows[0];
    expect(site_id).not.toBeNull();
    expect(assigned_sites).toContain(site_id);
  });

  it('backfill idempotente: rieseguire la stessa UPDATE non modifica più nulla', async () => {
    if (!dbAvailable) return;
    const res = await pool.query(
      `UPDATE employees
       SET assigned_sites = array_append(assigned_sites, site_id)
       WHERE site_id IS NOT NULL AND NOT (site_id = ANY(assigned_sites))`
    );
    expect(res.rowCount).toBe(0);
  });

  it('trigger su INSERT: site_id non incluso in assigned_sites viene aggiunto automaticamente', async () => {
    if (!dbAvailable) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const clientRow = await client.query(
        `INSERT INTO clients (id, name, email, plan, is_demo)
         VALUES (uuid_generate_v4(), 'Trigger Test Co', $1, 'starter', false)
         RETURNING id`,
        [`trigger-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`]
      );
      const clientId = clientRow.rows[0].id;
      const siteRow = await client.query(
        `INSERT INTO sites (id, client_id, name, qr_code_content)
         VALUES (uuid_generate_v4(), $1, 'Trigger Test Site', $2)
         RETURNING id`,
        [clientId, `badge://trigger-test-${Date.now()}-${Math.random().toString(36).slice(2)}`]
      );
      const siteId = siteRow.rows[0].id;

      const empRow = await client.query(
        `INSERT INTO employees (client_id, email, name, role, site_id, assigned_sites)
         VALUES ($1, $2, 'Trigger Test Employee', 'employee', $3, ARRAY[]::uuid[])
         RETURNING assigned_sites`,
        [clientId, `trigger-test-emp-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`, siteId]
      );

      expect(empRow.rows[0].assigned_sites).toEqual([siteId]);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });

  it('trigger su UPDATE: cambiare site_id aggiunge il nuovo sito SENZA rimuovere quelli già presenti (multi-sede)', async () => {
    if (!dbAvailable) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const clientRow = await client.query(
        `INSERT INTO clients (id, name, email, plan, is_demo)
         VALUES (uuid_generate_v4(), 'Trigger Test Co 2', $1, 'starter', false)
         RETURNING id`,
        [`trigger-test-2-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`]
      );
      const clientId = clientRow.rows[0].id;
      const site1 = await client.query(
        `INSERT INTO sites (id, client_id, name, qr_code_content)
         VALUES (uuid_generate_v4(), $1, 'Site Roma', $2) RETURNING id`,
        [clientId, `badge://trigger-test-roma-${Date.now()}-${Math.random().toString(36).slice(2)}`]
      );
      const site2 = await client.query(
        `INSERT INTO sites (id, client_id, name, qr_code_content)
         VALUES (uuid_generate_v4(), $1, 'Site Milano', $2) RETURNING id`,
        [clientId, `badge://trigger-test-milano-${Date.now()}-${Math.random().toString(36).slice(2)}`]
      );
      const site3 = await client.query(
        `INSERT INTO sites (id, client_id, name, qr_code_content)
         VALUES (uuid_generate_v4(), $1, 'Site Torino', $2) RETURNING id`,
        [clientId, `badge://trigger-test-torino-${Date.now()}-${Math.random().toString(36).slice(2)}`]
      );
      const roma = site1.rows[0].id, milano = site2.rows[0].id, torino = site3.rows[0].id;

      const empRow = await client.query(
        `INSERT INTO employees (client_id, email, name, role, site_id, assigned_sites)
         VALUES ($1, $2, 'Multi Site Employee', 'manager', $3, ARRAY[$3, $4]::uuid[])
         RETURNING id`,
        [clientId, `multi-site-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`, roma, milano]
      );
      const empId = empRow.rows[0].id;

      const updated = await client.query(
        'UPDATE employees SET site_id = $1 WHERE id = $2 RETURNING assigned_sites',
        [torino, empId]
      );

      const finalSites = updated.rows[0].assigned_sites;
      expect(finalSites).toContain(roma);
      expect(finalSites).toContain(milano);
      expect(finalSites).toContain(torino);
      expect(finalSites.length).toBe(3);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });

  it('site_id NULL (admin/superadmin) non causa errori dal trigger', async () => {
    if (!dbAvailable) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const clientRow = await client.query(
        `INSERT INTO clients (id, name, email, plan, is_demo)
         VALUES (uuid_generate_v4(), 'Trigger Test Co 3', $1, 'starter', false)
         RETURNING id`,
        [`trigger-test-3-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`]
      );
      const clientId = clientRow.rows[0].id;

      const empRow = await client.query(
        `INSERT INTO employees (client_id, email, name, role, site_id, assigned_sites)
         VALUES ($1, $2, 'Admin No Site', 'admin', NULL, ARRAY[]::uuid[])
         RETURNING site_id, assigned_sites`,
        [clientId, `admin-no-site-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`]
      );

      expect(empRow.rows[0].site_id).toBeNull();
      expect(empRow.rows[0].assigned_sites).toEqual([]);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });

  // Follow-up fix (commit 50e3126) added COALESCE NULL-safety in the trigger
  // for the case where assigned_sites itself is NULL (not just empty). This
  // covers that specific regression: without COALESCE, `site_id = ANY(NULL)`
  // and `array_append(NULL, site_id)` would misbehave (NULL result or error).
  it('trigger su INSERT: assigned_sites NULL con site_id valorizzato viene normalizzato a [site_id]', async () => {
    if (!dbAvailable) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const clientRow = await client.query(
        `INSERT INTO clients (id, name, email, plan, is_demo)
         VALUES (uuid_generate_v4(), 'Trigger Test Co 4', $1, 'starter', false)
         RETURNING id`,
        [`trigger-test-4-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`]
      );
      const clientId = clientRow.rows[0].id;
      const siteRow = await client.query(
        `INSERT INTO sites (id, client_id, name, qr_code_content)
         VALUES (uuid_generate_v4(), $1, 'Trigger Test Site 4', $2)
         RETURNING id`,
        [clientId, `badge://trigger-test-4-${Date.now()}-${Math.random().toString(36).slice(2)}`]
      );
      const siteId = siteRow.rows[0].id;

      const empRow = await client.query(
        `INSERT INTO employees (client_id, email, name, role, site_id, assigned_sites)
         VALUES ($1, $2, 'Null Assigned Sites Employee', 'employee', $3, NULL)
         RETURNING assigned_sites`,
        [clientId, `null-assigned-sites-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`, siteId]
      );

      expect(empRow.rows[0].assigned_sites).toEqual([siteId]);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });
});
