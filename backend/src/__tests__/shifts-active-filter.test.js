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

describe('GET /api/v1/shifts/:siteId(/export) — active employee filter (Task 2)', () => {
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
      console.warn(`[shifts-active-filter.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Shifts Active Filter Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('shifts-active-filter-client')]
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

  async function makeEmployee(clientId, siteId, name, { active = true } = {}) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, active)
       VALUES ($1, $2, $3, 'employee', $4::uuid[], $5)
       RETURNING id`,
      [clientId, uniqueEmail('shifts-active-filter-employee'), name, siteId ? [siteId] : [], active]
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

  describe('GET /:siteId/export (employees list for context)', () => {
    it('excludes a deactivated employee from the exported employee map', async () => {
      if (!dbAvailable) return;
      const activeId = await makeEmployee(clientId, siteId, 'Active Export Emp');
      const inactiveId = await makeEmployee(clientId, siteId, 'Inactive Export Emp', { active: false });

      const token = tokenFor({ client_id: clientId, role: 'admin' });
      const res = await request(app)
        .get(`/api/v1/shifts/${siteId}/export`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.employees[activeId]).toBe('Active Export Emp');
      expect(res.body.data.employees[inactiveId]).toBeUndefined();
    });
  });

  describe('GET /:siteId (employees assigned to site)', () => {
    it('excludes a deactivated employee from the site planning employees list', async () => {
      if (!dbAvailable) return;
      const activeId = await makeEmployee(clientId, siteId, 'Active Planning Emp');
      const inactiveId = await makeEmployee(clientId, siteId, 'Inactive Planning Emp', { active: false });

      const token = tokenFor({ client_id: clientId, role: 'admin' });
      const res = await request(app)
        .get(`/api/v1/shifts/${siteId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.employees.map((e) => e.id);
      expect(ids).toContain(activeId);
      expect(ids).not.toContain(inactiveId);
    });
  });
});
