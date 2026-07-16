'use strict';

/**
 * Integration tests: GET /api/v1/admin/demo-tenants (Task 9 of 9 — Ambiente
 * Demo Self-Service)
 *
 * Real-Postgres integration tests, mirroring demo-start.test.js's soft-skip
 * pattern (dbAvailable): this is the automated version of Checkpoint 9's
 * "verifica manuale con almeno 2-3 tenant demo di test" — creates several
 * real demo tenants directly via SQL, plus one real (non-demo) tenant whose
 * admin is used as the caller, and asserts the endpoint's response shape,
 * field values, and demo_expires_at ASC ordering against genuine rows.
 *
 * Also covers the RBAC gap this task closes: a demo tenant's own seeded
 * "admin" role employee (created via POST /api/v1/demo/start, exactly the
 * way a real demo session would) must get 403 from this endpoint, even
 * though routes/admin.js's shared blanket gate only checks role === 'admin'
 * and would otherwise let it through.
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

describe('GET /api/v1/admin/demo-tenants (real database)', () => {
  jest.setTimeout(30000);

  let probePool;
  let dbAvailable = false;
  let request;
  let app;

  beforeAll(async () => {
    probePool = new Pool(dbConfig);
    try {
      await probePool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[admin-demo-tenants-integration.test] Skipping real-DB tests — could not connect to ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}: ${err.message}`
      );
    }

    if (dbAvailable) {
      request = require('supertest');
      app = require('../app');
    }
  });

  afterAll(async () => {
    if (probePool) await probePool.end();
    if (dbAvailable) {
      const { closePool } = require('../db/pool');
      await closePool();
    }
  });

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  async function cleanupByEmail(email) {
    await probePool.query('DELETE FROM clients WHERE email = $1', [email]);
  }

  async function makeRealAdminClient(email) {
    const result = await probePool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Real Co', $1, 'starter', false)
       RETURNING id`,
      [email]
    );
    return result.rows[0].id;
  }

  function tokenFor({ user_id, client_id, role }) {
    // Signed the same way routes/auth.js's POST /login signs its access
    // token (RS256, JWT_PRIVATE_KEY from env) — see admin-viewers.test.js's
    // makeToken() for the same convention.
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign({ user_id, client_id, role, name: 'Test' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
  }

  it('lists real demo tenants ordered by demo_expires_at ASC, and excludes real (non-demo) tenants', async () => {
    if (!dbAvailable) return;

    const realEmail = uniqueEmail('demo-tenants-real-admin');
    const demoEmails = [
      uniqueEmail('demo-tenants-a'),
      uniqueEmail('demo-tenants-b'),
      uniqueEmail('demo-tenants-c'),
    ];

    try {
      const realClientId = await makeRealAdminClient(realEmail);

      // 3 demo tenants via the real POST /demo/start flow (genuine seeded
      // tenants, not hand-inserted rows) with deliberately different
      // expiries so ASC ordering is observably meaningful.
      const demoClientIds = [];
      for (const email of demoEmails) {
        const res = await request(app).post('/api/v1/demo/start').send({ email });
        expect(res.status).toBe(200);
        demoClientIds.push(jwt.decode(res.body.data.token).client_id);
      }

      // Stagger expiries: a (soonest), b, c (latest) — independent of
      // insertion order, to prove the endpoint sorts rather than relies on
      // creation order.
      await probePool.query(
        'UPDATE clients SET demo_expires_at = now() + interval \'1 day\' WHERE id = $1',
        [demoClientIds[0]]
      );
      await probePool.query(
        'UPDATE clients SET demo_expires_at = now() + interval \'3 days\' WHERE id = $1',
        [demoClientIds[1]]
      );
      await probePool.query(
        'UPDATE clients SET demo_expires_at = now() + interval \'5 days\' WHERE id = $1',
        [demoClientIds[2]]
      );

      const token = tokenFor({ user_id: 'real-admin-user', client_id: realClientId, role: 'superadmin' });

      const res = await request(app)
        .get('/api/v1/admin/demo-tenants')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const ourRows = res.body.data.filter((row) => demoClientIds.includes(row.id));
      expect(ourRows).toHaveLength(3);
      expect(ourRows.map((r) => r.id)).toEqual(demoClientIds); // ASC by demo_expires_at

      for (let i = 0; i < ourRows.length; i++) {
        expect(ourRows[i].demo_contact_email).toBe(demoEmails[i]);
        expect(ourRows[i]).toHaveProperty('created_at');
        expect(ourRows[i]).toHaveProperty('demo_expires_at');
      }

      // No real (non-demo) tenant leaks into this list.
      expect(res.body.data.find((row) => row.id === realClientId)).toBeUndefined();
    } finally {
      await cleanupByEmail(realEmail);
      for (const email of demoEmails) {
        await cleanupByEmail(email);
      }
    }
  });

  it('a demo tenant\'s own admin (role=admin, client_id=demo tenant) gets 403, not the list', async () => {
    if (!dbAvailable) return;

    const demoEmail = uniqueEmail('demo-tenants-selfview');

    try {
      const startRes = await request(app).post('/api/v1/demo/start').send({ email: demoEmail });
      expect(startRes.status).toBe(200);
      expect(startRes.body.data.user.role).toBe('admin');

      const res = await request(app)
        .get('/api/v1/admin/demo-tenants')
        .set('Authorization', `Bearer ${startRes.body.data.token}`);

      expect(res.status).toBe(403);
    } finally {
      await cleanupByEmail(demoEmail);
    }
  });

  it('a REAL (non-demo) tenant\'s plain admin (role=admin) also gets 403 — only superadmin may view this list', async () => {
    if (!dbAvailable) return;

    const realEmail = uniqueEmail('demo-tenants-real-plain-admin');
    try {
      const realClientId = await makeRealAdminClient(realEmail);
      const token = tokenFor({ user_id: 'real-plain-admin-user', client_id: realClientId, role: 'admin' });

      const res = await request(app)
        .get('/api/v1/admin/demo-tenants')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    } finally {
      await cleanupByEmail(realEmail);
    }
  });
});
