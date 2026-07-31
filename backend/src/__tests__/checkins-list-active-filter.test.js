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

describe('GET /api/v1/checkins — active employee filter (Task 2)', () => {
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
      console.warn(`[checkins-list-active-filter.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Checkins List Active Filter Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('checkins-active-filter-client')]
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

  async function makeEmployee(clientId, { active = true, role = 'employee' } = {}) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, active)
       VALUES ($1, $2, 'Checkin Test Employee', $3, '{}', $4)
       RETURNING id`,
      [clientId, uniqueEmail('checkins-active-filter-employee'), role, active]
    );
    return result.rows[0].id;
  }

  async function makeCheckin(clientId, siteId, employeeId, createdBy) {
    await pool.query(
      `INSERT INTO checkins (employee_id, site_id, timestamp, type, created_by, client_id)
       VALUES ($1, $2, NOW(), 'IN', $3, $4)`,
      [employeeId, siteId, createdBy, clientId]
    );
  }

  function tokenFor({ client_id, role }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign({ user_id: 'test-user', client_id, role, name: 'Test' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
  }

  let clientId, siteId, adminId;

  beforeEach(async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    siteId = await makeSite(clientId);
    adminId = await makeEmployee(clientId, { role: 'admin' });
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('shows a deactivated employee_name as null instead of leaking the deactivated employee name', async () => {
    if (!dbAvailable) return;
    const inactiveId = await makeEmployee(clientId, { active: false });
    await makeCheckin(clientId, siteId, inactiveId, adminId);

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .get('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const row = res.body.data.find((r) => r.employee_id === inactiveId);
    expect(row).toBeDefined();
    expect(row.employee_name).toBeNull();
  });

  it('still shows employee_name for an active employee', async () => {
    if (!dbAvailable) return;
    const activeId = await makeEmployee(clientId, { active: true });
    await makeCheckin(clientId, siteId, activeId, adminId);

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .get('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const row = res.body.data.find((r) => r.employee_id === activeId);
    expect(row).toBeDefined();
    expect(row.employee_name).toBe('Checkin Test Employee');
  });
});
