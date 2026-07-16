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

describe('RBAC scoping: /api/v1/admin/sites', () => {
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
      console.warn(`[admin-sites-scoping.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Sites Scoping Co', $1, 'starter', false)
       RETURNING id`,
      [email]
    );
    return result.rows[0].id;
  }

  async function makeSite(clientId, name) {
    const qrContent = `badge://test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await pool.query(
      `INSERT INTO sites (id, client_id, name, qr_code_content)
       VALUES (uuid_generate_v4(), $1, $2, $3)
       RETURNING id`,
      [clientId, name, qrContent]
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

  let clientA, clientB, siteA, siteB;

  beforeEach(async () => {
    if (!dbAvailable) return;
    clientA = await makeClient(uniqueEmail('sites-scoping-a'));
    clientB = await makeClient(uniqueEmail('sites-scoping-b'));
    siteA = await makeSite(clientA, 'Site A');
    siteB = await makeSite(clientB, 'Site B');
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = ANY($1::uuid[])', [[clientA, clientB]]);
  });

  it('GET /admin/sites: admin sees ONLY their own sites, query client_id param is ignored', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/admin/sites?client_id=${clientB}`) // attempt to request another tenant's sites
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((s) => s.id)).toEqual([siteA]);
  });

  it('GET /admin/sites: superadmin sees all sites when no filter given', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'superadmin' });
    const res = await request(app).get('/api/v1/admin/sites').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining([siteA, siteB]));
  });

  it('POST /admin/sites: admin creating a site with a foreign client_id is silently forced to their own tenant', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/sites')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientB, name: 'Injected Site' }); // attempt to create a site for clientB
    expect(res.status).toBe(201);
    expect(res.body.data.client_id).toBe(clientA); // forced to caller's own tenant, not clientB
    await pool.query('DELETE FROM sites WHERE id = $1', [res.body.data.id]);
  });

  it('POST /admin/sites: superadmin can create a site for an arbitrary client_id', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'superadmin' });
    const res = await request(app)
      .post('/api/v1/admin/sites')
      .set('Authorization', `Bearer ${token}`)
      .send({ client_id: clientB, name: 'Superadmin Site' });
    expect(res.status).toBe(201);
    expect(res.body.data.client_id).toBe(clientB);
    await pool.query('DELETE FROM sites WHERE id = $1', [res.body.data.id]);
  });

  it('DELETE /admin/sites/:id: admin cannot delete another tenant\'s site (400)', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app)
      .delete(`/api/v1/admin/sites/${siteB}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400); // matches existing ValidationError('Site not found') behavior, unchanged
    const check = await pool.query('SELECT id FROM sites WHERE id = $1', [siteB]);
    expect(check.rowCount).toBe(1); // still exists
  });

  it('DELETE /admin/sites/:id: admin CAN delete their own site', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app)
      .delete(`/api/v1/admin/sites/${siteA}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('DELETE /admin/sites/:id: superadmin can delete any site', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientA, role: 'superadmin' });
    const res = await request(app)
      .delete(`/api/v1/admin/sites/${siteB}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
