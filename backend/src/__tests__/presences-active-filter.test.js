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

describe('GET /api/v1/presences/(summary|trend) — active employee filter (Task 2)', () => {
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
      console.warn(`[presences-active-filter.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Presences Active Filter Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('presences-active-filter-client')]
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
       VALUES ($1, $2, $3, $4, $5::uuid[], $6, $7)
       RETURNING id`,
      [clientId, uniqueEmail('presences-active-filter-employee'), name, role, siteId ? [siteId] : [], active, siteId || null]
    );
    return result.rows[0].id;
  }

  async function makeCheckin(clientId, siteId, employeeId, createdBy, timestamp) {
    await pool.query(
      `INSERT INTO checkins (employee_id, site_id, timestamp, type, created_by, client_id)
       VALUES ($1, $2, $3, 'IN', $4, $5)`,
      [employeeId, siteId, timestamp, createdBy, clientId]
    );
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

  describe('GET /summary (admin)', () => {
    it('excludes a deactivated employee who has check-ins this month', async () => {
      if (!dbAvailable) return;
      const inactiveId = await makeEmployee(clientId, 'Inactive With Checkin', { active: false });
      const now = new Date();
      await makeCheckin(clientId, siteId, inactiveId, adminId, now.toISOString());

      const token = tokenFor({ client_id: clientId, role: 'admin' });
      const res = await request(app)
        .get(`/api/v1/presences/summary?month=${now.getUTCMonth() + 1}&year=${now.getUTCFullYear()}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.employees.map((e) => e.id);
      expect(ids).not.toContain(inactiveId);
    });

    it('excludes a deactivated employee with zero check-ins this month (0-hours row)', async () => {
      if (!dbAvailable) return;
      const inactiveId = await makeEmployee(clientId, 'Inactive No Checkin', { active: false });
      const now = new Date();

      const token = tokenFor({ client_id: clientId, role: 'admin' });
      const res = await request(app)
        .get(`/api/v1/presences/summary?month=${now.getUTCMonth() + 1}&year=${now.getUTCFullYear()}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.employees.map((e) => e.id);
      expect(ids).not.toContain(inactiveId);
    });
  });

  describe('GET /summary (manager)', () => {
    it('excludes a deactivated employee at the manager site with zero check-ins', async () => {
      if (!dbAvailable) return;
      const managerId = await makeEmployee(clientId, 'Manager', { role: 'manager', siteId });
      const inactiveId = await makeEmployee(clientId, 'Inactive Site Emp', { active: false, siteId });
      const now = new Date();

      const token = tokenFor({ client_id: clientId, role: 'manager', site_id: siteId });
      const res = await request(app)
        .get(`/api/v1/presences/summary?month=${now.getUTCMonth() + 1}&year=${now.getUTCFullYear()}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.employees.map((e) => e.id);
      expect(ids).not.toContain(inactiveId);
      void managerId;
    });
  });

  describe('GET /trend', () => {
    it('does not count a deactivated employee approved leave toward absenteeism %', async () => {
      if (!dbAvailable) return;
      const inactiveId = await makeEmployee(clientId, 'Inactive Trend Emp', { active: false });
      const todayStr = new Date().toISOString().slice(0, 10);

      await pool.query(
        `INSERT INTO leave_requests (client_id, user_id, leave_type, start_date, end_date, num_days, status, approved_by, approved_at)
         VALUES ($1, $2, 'FERIE_1', $3::date, $3::date, 1, 'APPROVED', $4, NOW())`,
        [clientId, inactiveId, todayStr, adminId]
      );

      const token = tokenFor({ client_id: clientId, role: 'admin' });
      const res = await request(app)
        .get('/api/v1/presences/trend')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const todayEntry = res.body.data.days.find((d) => d.date === todayStr);
      expect(todayEntry).toBeDefined();
      expect(todayEntry.assenteismo_pct).toBe(0);
    });
  });
});
