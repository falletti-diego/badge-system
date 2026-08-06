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

describe('GET /api/v1/employees(/:id) — active employee filter (Task 2)', () => {
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
      console.warn(`[employees-active-filter.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Employees Active Filter Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('employees-active-filter-client')]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId, name, { active = true } = {}) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, active)
       VALUES ($1, $2, $3, 'employee', '{}', $4)
       RETURNING id`,
      [clientId, uniqueEmail('employees-active-filter-employee'), name, active]
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

  it('GET / excludes deactivated employees from the list and pagination total', async () => {
    if (!dbAvailable) return;
    const activeId = await makeEmployee(clientId, 'Active List Emp');
    const inactiveId = await makeEmployee(clientId, 'Inactive List Emp', { active: false });

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((e) => e.id);
    expect(ids).toContain(activeId);
    expect(ids).not.toContain(inactiveId);
    expect(res.body.pagination.total).toBe(1);
  });

  it('GET /:id returns 404 for a deactivated employee', async () => {
    if (!dbAvailable) return;
    const inactiveId = await makeEmployee(clientId, 'Inactive Detail Emp', { active: false });

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/employees/${inactiveId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('GET /:id still returns 200 for an active employee', async () => {
    if (!dbAvailable) return;
    const activeId = await makeEmployee(clientId, 'Active Detail Emp');

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/employees/${activeId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(activeId);
  });
});
