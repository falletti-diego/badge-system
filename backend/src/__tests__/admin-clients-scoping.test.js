'use strict';

/**
 * Integration tests: RBAC cross-tenant scoping on /api/v1/admin/clients
 * (Task 4 of the admin-rbac-tenant-scoping plan).
 *
 * Real-Postgres tests, same pattern as admin-demo-tenants-integration.test.js:
 * dbAvailable soft-skip, real JWT signing, real rows via SQL — no mocks.
 */

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('RBAC scoping: /api/v1/admin/clients', () => {
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
      console.warn(`[admin-clients-scoping.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Scoping Test Co', $1, 'starter', false)
       RETURNING id`,
      [email]
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

  let clientA, clientB, emailA, emailB;

  beforeEach(async () => {
    if (!dbAvailable) return;
    emailA = uniqueEmail('clients-scoping-a');
    emailB = uniqueEmail('clients-scoping-b');
    clientA = await makeClient(emailA);
    clientB = await makeClient(emailB);
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = ANY($1::uuid[])', [[clientA, clientB]]);
  });

  it('GET /admin/clients: admin sees ONLY their own client, not others', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app).get('/api/v1/admin/clients').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(clientA);
  });

  it('GET /admin/clients: superadmin sees all clients, including both test clients', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'superadmin' });
    const res = await request(app).get('/api/v1/admin/clients').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([clientA, clientB]));
  });

  it('POST /admin/clients: admin gets 403 SUPERADMIN_REQUIRED', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Co', email: uniqueEmail('new-co'), plan: 'starter' });
    expect(res.status).toBe(403);
    expect(res.body.error?.code || res.body.error || res.body.code).toBe('SUPERADMIN_REQUIRED');
  });

  it('POST /admin/clients: superadmin can create a new client', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'superadmin' });
    const newEmail = uniqueEmail('new-co-superadmin');
    const res = await request(app)
      .post('/api/v1/admin/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Co', email: newEmail, plan: 'starter' });
    expect(res.status).toBe(201);
    await pool.query('DELETE FROM clients WHERE email = $1', [newEmail]);
  });

  it('DELETE /admin/clients/:id: admin gets 403 SUPERADMIN_REQUIRED, even for their own client', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app)
      .delete(`/api/v1/admin/clients/${clientA}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('DELETE /admin/clients/:id: superadmin can delete any client', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'superadmin' });
    const res = await request(app)
      .delete(`/api/v1/admin/clients/${clientB}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
