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

describe('RBAC scoping: /api/v1/admin/employees', () => {
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
      console.warn(`[admin-employees-scoping.test] Skipping — could not connect: ${err.message}`);
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

  async function makeClient(email) {
    const result = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Employees Scoping Co', $1, 'starter', false)
       RETURNING id`,
      [email]
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

  function tokenFor({ client_id, role }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign({ user_id: 'test-user', client_id, role, name: 'Test' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
  }

  let clientA, clientB, siteA;

  beforeEach(async () => {
    if (!dbAvailable) return;
    clientA = await makeClient(uniqueEmail('employees-scoping-a'));
    clientB = await makeClient(uniqueEmail('employees-scoping-b'));
    siteA = await makeSite(clientA);
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = ANY($1::uuid[])', [[clientA, clientB]]);
  });

  it('POST /admin/employees: admin creating with a foreign client_id is silently forced to their own tenant', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        client_id: clientB, // attempt to inject a foreign tenant
        email: uniqueEmail('injected-employee'),
        name: 'Injected Employee',
        role: 'employee',
        assigned_sites: [siteA],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.client_id).toBe(clientA);
    await pool.query('DELETE FROM employees WHERE id = $1', [res.body.data.id]);
  });

  it('POST /admin/employees: admin without client_id in body creates employee in own tenant (201)', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        // client_id omitted entirely
        email: uniqueEmail('no-client-id-employee'),
        name: 'No Client Id Employee',
        role: 'employee',
        assigned_sites: [siteA],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.client_id).toBe(clientA);
    await pool.query('DELETE FROM employees WHERE id = $1', [res.body.data.id]);
  });

  it('POST /admin/employees: superadmin without client_id in body gets 400 CLIENT_ID_REQUIRED', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'superadmin' });
    const res = await request(app)
      .post('/api/v1/admin/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: uniqueEmail('superadmin-no-client-id'),
        name: 'Superadmin No Client Id',
        role: 'employee',
        assigned_sites: [siteA],
      });
    expect(res.status).toBe(400);
    expect(res.body.details?.code).toBe('CLIENT_ID_REQUIRED');
  });

  it('GET /admin/employees: admin sees ONLY their own employees, query client_id param is ignored', async () => {
    if (!dbAvailable) return;
    const empEmail = uniqueEmail('employees-scoping-own');
    const empResult = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites)
       VALUES ($1, $2, 'Own Employee', 'employee', $3::uuid[])
       RETURNING id`,
      [clientA, empEmail, [siteA]]
    );
    const otherEmail = uniqueEmail('employees-scoping-other');
    await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites)
       VALUES ($1, $2, 'Other Employee', 'employee', '{}')`,
      [clientB, otherEmail]
    );

    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/admin/employees?client_id=${clientB}`) // attempt to request another tenant's employees
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((e) => e.id)).toEqual([empResult.rows[0].id]);
  });

  it('GET /admin/employees: superadmin can filter by an arbitrary client_id', async () => {
    if (!dbAvailable) return;
    const otherEmail = uniqueEmail('employees-scoping-superadmin');
    await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites)
       VALUES ($1, $2, 'Superadmin View Employee', 'employee', '{}')`,
      [clientB, otherEmail]
    );

    const token = tokenFor({ client_id: clientA, role: 'superadmin' });
    const res = await request(app)
      .get(`/api/v1/admin/employees?client_id=${clientB}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((e) => e.client_id === clientB)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('POST /admin/employees/import: superadmin without client_id in body is rejected with 400', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'superadmin' });
    const csvContent = 'email,name,phone,role,site_name\nemp@test.com,Emp,123,employee,\n';
    const res = await request(app)
      .post('/api/v1/admin/employees/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csvContent), 'employees.csv');
    // No client_id field attached — superadmin must still specify a target tenant
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/client_id/);
    expect(res.body.details?.code).toBe('CLIENT_ID_REQUIRED');
  });
});
