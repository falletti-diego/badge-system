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

describe('GET /api/v1/export/csv — active employee filter (Task 2)', () => {
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
      console.warn(`[export-csv-active-filter.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Export Active Filter Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('export-active-filter-client')]
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

  async function makeEmployee(clientId, { active = true } = {}) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, active)
       VALUES ($1, $2, 'Export Test Employee', 'employee', '{}', $3)
       RETURNING id`,
      [clientId, uniqueEmail('export-active-filter-employee'), active]
    );
    return result.rows[0].id;
  }

  async function makeAdmin(clientId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, active)
       VALUES ($1, $2, 'Export Test Admin', 'admin', '{}', true)
       RETURNING id`,
      [clientId, uniqueEmail('export-active-filter-admin')]
    );
    return result.rows[0].id;
  }

  async function makeManagementTierEmployee(clientId, role) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, active)
       VALUES ($1, $2, 'Export Test Management', $3, '{}', true)
       RETURNING id`,
      [clientId, uniqueEmail(`export-active-filter-${role}`), role]
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

  let clientId, siteId, adminId, employeeId;

  beforeEach(async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    siteId = await makeSite(clientId);
    adminId = await makeAdmin(clientId);
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('excludes checkins whose employee is active=false from the CSV export rows', async () => {
    if (!dbAvailable) return;
    employeeId = await makeEmployee(clientId, { active: false });
    await makeCheckin(clientId, siteId, employeeId, adminId);

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Generic CSV format — employee_email column should not contain the deactivated employee
    const emp = await pool.query('SELECT email FROM employees WHERE id = $1', [employeeId]);
    expect(res.text).not.toContain(emp.rows[0].email);
  });

  it('still includes checkins whose employee is active=true', async () => {
    if (!dbAvailable) return;
    employeeId = await makeEmployee(clientId, { active: true });
    await makeCheckin(clientId, siteId, employeeId, adminId);

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const emp = await pool.query('SELECT email FROM employees WHERE id = $1', [employeeId]);
    expect(res.text).toContain(emp.rows[0].email);
  });

  // Regression for task_bceb920f (Session 116 role-hierarchy follow-up): a
  // senior_manager/director who badges in must not leak into the payroll
  // export, same treatment as an inactive employee above.
  it.each(['senior_manager', 'director'])(
    'excludes a %s check-in (even active) from the CSV export identity fields',
    async (role) => {
      if (!dbAvailable) return;
      const managementId = await makeManagementTierEmployee(clientId, role);
      await makeCheckin(clientId, siteId, managementId, adminId);

      const token = tokenFor({ client_id: clientId, role: 'admin' });
      const res = await request(app)
        .get('/api/v1/export/csv')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const mgmt = await pool.query('SELECT email FROM employees WHERE id = $1', [managementId]);
      expect(res.text).not.toContain(mgmt.rows[0].email);
    }
  );
});
