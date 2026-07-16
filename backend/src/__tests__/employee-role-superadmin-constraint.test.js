'use strict';

const { Pool } = require('pg');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('employees.role CHECK constraint (migration 031)', () => {
  let pool;
  let dbAvailable = false;
  let clientId;

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[employee-role-superadmin-constraint.test] Skipping — could not connect: ${err.message}`);
      return;
    }
    const clientResult = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Role Constraint Test Co', $1, 'starter', false)
       RETURNING id`,
      [`role-constraint-${Date.now()}@example.invalid`]
    );
    clientId = clientResult.rows[0].id;
  });

  afterAll(async () => {
    if (dbAvailable) {
      await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
      await pool.end();
    }
  });

  it('accepts role = superadmin', async () => {
    if (!dbAvailable) return;
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites)
       VALUES ($1, $2, 'Superadmin Test', 'superadmin', '{}')
       RETURNING id, role`,
      [clientId, `superadmin-test-${Date.now()}@example.invalid`]
    );
    expect(result.rows[0].role).toBe('superadmin');
    await pool.query('DELETE FROM employees WHERE id = $1', [result.rows[0].id]);
  });

  it('still rejects an arbitrary invalid role string', async () => {
    if (!dbAvailable) return;
    await expect(
      pool.query(
        `INSERT INTO employees (client_id, email, name, role, assigned_sites)
         VALUES ($1, $2, 'Invalid Role Test', 'not_a_real_role', '{}')`,
        [clientId, `invalid-role-test-${Date.now()}@example.invalid`]
      )
    ).rejects.toThrow(/violates check constraint/);
  });
});
