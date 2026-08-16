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

describe('POST /api/v1/admin/employees — new fields (Sede/Matricola/Data assunzione/Manager)', () => {
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
      console.warn(`[admin-employees-create-fields.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Employees Create Fields Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('admin-employees-create-fields-client')]
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

  async function makeManager(clientId, siteId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, site_id, assigned_sites)
       VALUES ($1, $2, 'Manager Test', 'manager', $3, ARRAY[$3]::uuid[])
       RETURNING id`,
      [clientId, uniqueEmail('admin-employees-create-fields-manager'), siteId]
    );
    return result.rows[0].id;
  }

  function adminToken(clientId) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign({ user_id: 'test-admin', client_id: clientId, role: 'admin', name: 'Admin' }, privateKey, {
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

  it('creates an employee with matricola, hiring_date, and manager_id', async () => {
    if (!dbAvailable) return;
    const managerId = await makeManager(clientId, siteId);
    const token = adminToken(clientId);

    const res = await request(app)
      .post('/api/v1/admin/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: uniqueEmail('new-employee'),
        name: 'Nuovo Dipendente',
        role: 'employee',
        client_id: clientId,
        site_id: siteId,
        assigned_sites: [siteId],
        external_employee_id: 'MAT001',
        hiring_date: new Date().toISOString().slice(0, 10),
        manager_id: managerId,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.external_employee_id).toBe('MAT001');
    expect(res.body.data.manager_id).toBe(managerId);
  });

  it('rejects a duplicate matricola for the same client with 409 DUPLICATE_MATRICOLA', async () => {
    if (!dbAvailable) return;
    const token = adminToken(clientId);
    const shared = { role: 'employee', client_id: clientId, site_id: siteId, assigned_sites: [siteId], external_employee_id: 'DUP001' };

    const first = await request(app).post('/api/v1/admin/employees').set('Authorization', `Bearer ${token}`)
      .send({ ...shared, email: uniqueEmail('dup-1'), name: 'Primo' });
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/v1/admin/employees').set('Authorization', `Bearer ${token}`)
      .send({ ...shared, email: uniqueEmail('dup-2'), name: 'Secondo' });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('DUPLICATE_MATRICOLA');
  });

  it('rejects manager_id belonging to a different site with 400 INVALID_MANAGER_ASSIGNMENT', async () => {
    if (!dbAvailable) return;
    const otherSiteId = await makeSite(clientId);
    const managerOnOtherSite = await makeManager(clientId, otherSiteId);
    const token = adminToken(clientId);

    const res = await request(app)
      .post('/api/v1/admin/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: uniqueEmail('mismatched-manager'),
        name: 'Dipendente',
        role: 'employee',
        client_id: clientId,
        site_id: siteId,
        assigned_sites: [siteId],
        manager_id: managerOnOtherSite,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_MANAGER_ASSIGNMENT');
  });

  it('creates an employee with no manager_id (optional, site with no manager yet)', async () => {
    if (!dbAvailable) return;
    const token = adminToken(clientId);

    const res = await request(app)
      .post('/api/v1/admin/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: uniqueEmail('no-manager'),
        name: 'Senza Manager',
        role: 'employee',
        client_id: clientId,
        site_id: siteId,
        assigned_sites: [siteId],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.manager_id).toBeNull();
  });
});
