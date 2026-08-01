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

describe('POST /api/v1/checkins — active employee guard (Task 3)', () => {
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
      console.warn(`[checkins-active-employee.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Checkins Active Employee Guard Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('checkins-active-employee-client')]
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

  async function makeEmployee(clientId, siteId, { active = true, role = 'employee' } = {}) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, active)
       VALUES ($1, $2, 'Checkin Test Employee', $3, ARRAY[$4]::uuid[], $5)
       RETURNING id`,
      [clientId, uniqueEmail('checkins-active-employee'), role, siteId, active]
    );
    return result.rows[0].id;
  }

  function tokenFor({ client_id, role, employee_id }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign(
      { user_id: 'test-user', client_id, role, employee_id, name: 'Test' },
      privateKey,
      { algorithm: 'RS256', expiresIn: '1h' }
    );
  }

  let clientId, siteId;

  beforeEach(async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    siteId = await makeSite(clientId);
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('rejects check-in with 403 CHECKIN_EMPLOYEE_INACTIVE when employee.active = false', async () => {
    if (!dbAvailable) return;
    const employeeId = await makeEmployee(clientId, siteId, { active: false, role: 'employee' });
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: employeeId, site_id: siteId, type: 'IN' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CHECKIN_EMPLOYEE_INACTIVE');
  });

  it('still allows check-in for an active employee (no regression)', async () => {
    if (!dbAvailable) return;
    const employeeId = await makeEmployee(clientId, siteId, { active: true, role: 'employee' });
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: employeeId, site_id: siteId, type: 'IN' });

    expect(res.status).toBe(201);
  });
});
