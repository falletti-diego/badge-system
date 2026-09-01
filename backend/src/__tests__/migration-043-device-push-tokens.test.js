'use strict';

/**
 * Verifica i vincoli reali di device_push_tokens (CASCADE, UNIQUE, CHECK) —
 * non solo che la migrazione sia applicata, ma che si comporti come
 * dichiarato. Real Postgres, ogni riga scoped a un client_id creato da
 * QUESTO test (CLAUDE.md Pattern 5).
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/badge_system_test',
});

let dbAvailable = true;

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    dbAvailable = false;
    // eslint-disable-next-line no-console
    console.warn(`migration-043-device-push-tokens.test.js: no reachable Postgres (${err.message}) — soft-skipping real-DB tests.`);
  }
});

afterAll(async () => {
  await pool.end();
});

async function createClientAndEmployee(suffix) {
  const clientResult = await pool.query(
    'INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id',
    [`Migration 043 Test ${suffix}`, `migration043-${suffix}@example.com`]
  );
  const clientId = clientResult.rows[0].id;
  const empResult = await pool.query(
    `INSERT INTO employees (client_id, email, name, role, password_hash, active)
     VALUES ($1::uuid, $2, 'Migration Test Employee', 'employee', 'x', true) RETURNING id`,
    [clientId, `migration043-emp-${suffix}@example.com`]
  );
  return { clientId, employeeId: empResult.rows[0].id };
}

describe('device_push_tokens constraints', () => {
  it('cascades delete when the employee is deleted', async () => {
    if (!dbAvailable) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { clientId, employeeId } = await createClientAndEmployee(suffix);
    try {
      await pool.query(
        'INSERT INTO device_push_tokens (employee_id, client_id, token, platform) VALUES ($1::uuid, $2::uuid, $3, \'ios\')',
        [employeeId, clientId, `ExponentPushToken[cascade-emp-${suffix}]`]
      );

      await pool.query('DELETE FROM employees WHERE id = $1::uuid', [employeeId]);

      const row = await pool.query('SELECT id FROM device_push_tokens WHERE employee_id = $1::uuid', [employeeId]);
      expect(row.rows).toHaveLength(0);
    } finally {
      await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
    }
  });

  it('cascades delete when the client is deleted', async () => {
    if (!dbAvailable) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { clientId, employeeId } = await createClientAndEmployee(suffix);
    try {
      await pool.query(
        'INSERT INTO device_push_tokens (employee_id, client_id, token, platform) VALUES ($1::uuid, $2::uuid, $3, \'android\')',
        [employeeId, clientId, `ExponentPushToken[cascade-client-${suffix}]`]
      );

      await pool.query('DELETE FROM clients WHERE id = $1::uuid', [clientId]);

      const row = await pool.query('SELECT id FROM device_push_tokens WHERE client_id = $1::uuid', [clientId]);
      expect(row.rows).toHaveLength(0);
    } finally {
      await pool.query('DELETE FROM clients WHERE id = $1', [clientId]).catch(() => {});
    }
  });

  it('rejects a duplicate token (UNIQUE constraint)', async () => {
    if (!dbAvailable) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { clientId, employeeId } = await createClientAndEmployee(suffix);
    const token = `ExponentPushToken[unique-${suffix}]`;
    try {
      await pool.query(
        'INSERT INTO device_push_tokens (employee_id, client_id, token, platform) VALUES ($1::uuid, $2::uuid, $3, \'ios\')',
        [employeeId, clientId, token]
      );

      await expect(pool.query(
        'INSERT INTO device_push_tokens (employee_id, client_id, token, platform) VALUES ($1::uuid, $2::uuid, $3, \'ios\')',
        [employeeId, clientId, token]
      )).rejects.toThrow(/duplicate key/);
    } finally {
      await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
    }
  });

  it('rejects a platform value outside ios/android (CHECK constraint)', async () => {
    if (!dbAvailable) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { clientId, employeeId } = await createClientAndEmployee(suffix);
    try {
      await expect(pool.query(
        'INSERT INTO device_push_tokens (employee_id, client_id, token, platform) VALUES ($1::uuid, $2::uuid, $3, \'windows-phone\')',
        [employeeId, clientId, `ExponentPushToken[check-${suffix}]`]
      )).rejects.toThrow(/violates check constraint/);
    } finally {
      await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
    }
  });
});
