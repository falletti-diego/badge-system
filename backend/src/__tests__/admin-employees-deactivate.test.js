'use strict';

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('DELETE /api/v1/admin/employees/:id — soft deactivation (Task 4)', () => {
  jest.setTimeout(30000);

  let pool;
  let dbAvailable = false;
  let request;
  let app;

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[admin-employees-deactivate.test] Skipping — could not connect: ${err.message}`);
    }
    if (dbAvailable) {
      request = require('supertest');
      app = require('../app');
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      const { closePool } = require('../db/pool');
      await closePool();
    }
    if (pool) await pool.end();
  });

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  async function makeClient() {
    const result = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Admin Employees Deactivate Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('admin-employees-deactivate-client')]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId, name, { active = true } = {}) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, active)
       VALUES ($1, $2, $3, 'employee', '{}', $4)
       RETURNING id`,
      [clientId, uniqueEmail('admin-employees-deactivate-employee'), name, active]
    );
    return result.rows[0].id;
  }

  function tokenFor({ client_id, role }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign({ user_id: 'test-user', client_id, role, name: 'Test' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
  }

  let clientId;

  beforeEach(async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('sets active=false and exit_date=today instead of deleting the row', async () => {
    if (!dbAvailable) return;
    const employeeId = await makeEmployee(clientId, 'Deactivate Me');

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .delete(`/api/v1/admin/employees/${employeeId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const dbResult = await pool.query(
      'SELECT active, exit_date FROM employees WHERE id = $1',
      [employeeId]
    );
    expect(dbResult.rowCount).toBe(1);
    expect(dbResult.rows[0].active).toBe(false);
    expect(dbResult.rows[0].exit_date).not.toBeNull();

    await pool.query('DELETE FROM employees WHERE id = $1', [employeeId]);
  });

  it('returns 404 when attempting to deactivate an already-inactive employee', async () => {
    if (!dbAvailable) return;
    const employeeId = await makeEmployee(clientId, 'Already Inactive', { active: false });

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .delete(`/api/v1/admin/employees/${employeeId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);

    await pool.query('DELETE FROM employees WHERE id = $1', [employeeId]);
  });
});
