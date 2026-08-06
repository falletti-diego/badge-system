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

describe('GET /api/v1/leave/(pending|approved|all|admin/saldi) — active employee filter (Task 2)', () => {
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
      console.warn(`[leaves-active-filter.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Leaves Active Filter Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('leaves-active-filter-client')]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId, name, { active = true, role = 'employee' } = {}) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, active)
       VALUES ($1, $2, $3, $4, '{}', $5)
       RETURNING id`,
      [clientId, uniqueEmail('leaves-active-filter-employee'), name, role, active]
    );
    return result.rows[0].id;
  }

  async function makeLeaveRequest(clientId, userId, { status = 'PENDING', approvedBy } = {}) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const result = await pool.query(
      `INSERT INTO leave_requests (client_id, user_id, leave_type, start_date, end_date, num_days, status, approved_by, approved_at)
       VALUES ($1, $2, 'FERIE_1', $3::date, $3::date, 1, $4::varchar, $5, CASE WHEN $4::varchar = 'APPROVED' THEN NOW() ELSE NULL END)
       RETURNING id`,
      [clientId, userId, todayStr, status, approvedBy || null]
    );
    return result.rows[0].id;
  }

  async function makeLeaveSaldo(clientId, userId) {
    await pool.query(
      `INSERT INTO leave_saldi (client_id, user_id, leave_type, year, total_days, used_days)
       VALUES ($1, $2, 'FERIE_1', $3, 20, 0)`,
      [clientId, userId, new Date().getFullYear()]
    );
  }

  function tokenFor({ client_id, role }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign({ user_id: 'test-user', client_id, role, name: 'Test' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
  }

  let clientId, adminId;

  beforeEach(async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    adminId = await makeEmployee(clientId, 'Admin', { role: 'admin' });
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('GET /pending excludes requests from a deactivated employee', async () => {
    if (!dbAvailable) return;
    const inactiveId = await makeEmployee(clientId, 'Inactive Pending Emp', { active: false });
    await makeLeaveRequest(clientId, inactiveId, { status: 'PENDING' });

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .get('/api/v1/leave/pending')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.find((r) => r.user_id === inactiveId)).toBeUndefined();
  });

  it('GET /approved excludes requests from a deactivated employee', async () => {
    if (!dbAvailable) return;
    const inactiveId = await makeEmployee(clientId, 'Inactive Approved Emp', { active: false });
    await makeLeaveRequest(clientId, inactiveId, { status: 'APPROVED', approvedBy: adminId });

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .get('/api/v1/leave/approved')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.find((r) => r.user_id === inactiveId)).toBeUndefined();
  });

  it('GET /all excludes requests from a deactivated employee', async () => {
    if (!dbAvailable) return;
    const inactiveId = await makeEmployee(clientId, 'Inactive All Emp', { active: false });
    await makeLeaveRequest(clientId, inactiveId, { status: 'PENDING' });

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .get('/api/v1/leave/all')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.find((r) => r.user_id === inactiveId)).toBeUndefined();
  });

  it('GET /admin/saldi excludes a deactivated employee', async () => {
    if (!dbAvailable) return;
    const inactiveId = await makeEmployee(clientId, 'Inactive Saldi Emp', { active: false });
    await makeLeaveSaldo(clientId, inactiveId);

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .get('/api/v1/leave/admin/saldi')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[inactiveId]).toBeUndefined();
  });
});
