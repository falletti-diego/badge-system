'use strict';

/**
 * Integration test: logAudit() populates audit_log.client_id (finding #6).
 * Real-Postgres, same dbAvailable soft-skip pattern used across this codebase's
 * real-DB tests (cleanup-expired-demos.test.js, admin-sites-scoping.test.js).
 *
 * Task 5 (commit 30fda3d) added the nullable client_id column + index to
 * audit_log; this test verifies Task 6 wires logAudit() to actually populate it
 * instead of discarding the caller-supplied client id.
 */

const { Pool } = require('pg');
const { v4: uuid } = require('uuid');
const { logAudit } = require('../middleware/audit');
const { DEMO_USERS } = require('../__fixtures__/demo-users');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('logAudit — client_id scoping (finding #6)', () => {
  jest.setTimeout(30000);

  let pool;
  let dbAvailable = false;

  const admin = DEMO_USERS.find((u) => u.role === 'admin');
  const employee = DEMO_USERS.find((u) => u.role === 'employee');

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[audit-client-scope.test] Skipping — could not connect: ${err.message}`);
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('popola client_id nella riga audit_log quando fornito (dentro una transazione)', async () => {
    if (!dbAvailable) return;

    const entityId = uuid();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await logAudit(client, {
        action: 'test_action',
        entity: 'checkin',
        entityId,
        clientId: admin.client_id,
        oldValue: null,
        newValue: { foo: 'bar' },
        userId: employee.employee_id,
      });
      const row = await client.query(
        'SELECT client_id FROM audit_log WHERE entity_id = $1 ORDER BY id DESC LIMIT 1',
        [entityId]
      );
      expect(row.rows[0].client_id).toBe(admin.client_id);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('popola client_id nella riga audit_log quando fornito (pool diretto, no transazione)', async () => {
    if (!dbAvailable) return;

    const entityId = uuid();
    await logAudit(pool, {
      action: 'test_action',
      entity: 'checkin',
      entityId,
      clientId: admin.client_id,
      oldValue: null,
      newValue: { foo: 'bar' },
      userId: employee.employee_id,
    });
    const row = await pool.query(
      'SELECT client_id FROM audit_log WHERE entity_id = $1 ORDER BY id DESC LIMIT 1',
      [entityId]
    );
    expect(row.rows[0].client_id).toBe(admin.client_id);
    // Cleanup — this row is a real INSERT (no transaction to roll back).
    await pool.query('DELETE FROM audit_log WHERE entity_id = $1', [entityId]);
  });
});
