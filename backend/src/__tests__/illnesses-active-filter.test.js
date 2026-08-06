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

describe('GET /api/v1/illnesses/(by-date-range|admin|manager) — active employee filter (Task 2)', () => {
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
      console.warn(`[illnesses-active-filter.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Illnesses Active Filter Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('illnesses-active-filter-client')]
    );
    return result.rows[0].id;
  }

  async function makeSite(clientId) {
    const qrContent = `badge://test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await pool.query(
      `INSERT INTO sites (id, client_id, name, qr_code_content)
       VALUES (uuid_generate_v4(), $1, 'Site', $2)
       RETURNING id`,
      [clientId, qrContent]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId, name, { active = true, role = 'employee', siteId } = {}) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, active, site_id)
       VALUES ($1, $2, $3, $4, '{}', $5, $6)
       RETURNING id`,
      [clientId, uniqueEmail('illnesses-active-filter-employee'), name, role, active, siteId || null]
    );
    return result.rows[0].id;
  }

  async function makeIllness(clientId, employeeId, createdBy) {
    const todayStr = new Date().toISOString().slice(0, 10);
    await pool.query(
      `INSERT INTO illnesses (client_id, employee_id, start_date, end_date, num_days, reason, created_by)
       VALUES ($1, $2, $3::date, $3::date, 1, 'test', $4)`,
      [clientId, employeeId, todayStr, createdBy]
    );
    return todayStr;
  }

  function tokenFor({ client_id, role, site_id }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign({ user_id: 'test-user', client_id, role, site_id, name: 'Test' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
  }

  let clientId, siteId, adminId;

  beforeEach(async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    siteId = await makeSite(clientId);
    adminId = await makeEmployee(clientId, 'Admin', { role: 'admin' });
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('GET /by-date-range excludes an illness belonging to a deactivated employee', async () => {
    if (!dbAvailable) return;
    const inactiveId = await makeEmployee(clientId, 'Inactive By Range Emp', { active: false });
    const dateStr = await makeIllness(clientId, inactiveId, adminId);

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/illnesses/by-date-range?start_date=${dateStr}&end_date=${dateStr}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.find((r) => r.employee_id === inactiveId)).toBeUndefined();
  });

  it('GET /admin excludes an illness belonging to a deactivated employee', async () => {
    if (!dbAvailable) return;
    const inactiveId = await makeEmployee(clientId, 'Inactive Admin Illness Emp', { active: false });
    await makeIllness(clientId, inactiveId, adminId);

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .get('/api/v1/illnesses/admin')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.find((r) => r.employee_id === inactiveId)).toBeUndefined();
  });

  it('GET /manager excludes an illness belonging to a deactivated site employee', async () => {
    if (!dbAvailable) return;
    const managerId = await makeEmployee(clientId, 'Manager', { role: 'manager', siteId });
    const inactiveId = await makeEmployee(clientId, 'Inactive Manager Illness Emp', { active: false, siteId });
    await makeIllness(clientId, inactiveId, adminId);

    const token = tokenFor({ client_id: clientId, role: 'manager', site_id: siteId });
    const res = await request(app)
      .get('/api/v1/illnesses/manager')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.find((r) => r.employee_id === inactiveId)).toBeUndefined();
    void managerId;
  });
});
