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

describe('POST /admin/clients + PUT /admin/settings — geofencing Art.4 confirmation gate (S.28)', () => {
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
      console.warn(`[admin-settings-geofencing-gate.test] Skipping — could not connect: ${err.message}`);
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

  function tokenFor({ client_id, role }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign({ user_id: 'test-user', client_id, role, name: 'Test' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
  }

  let clientId;

  afterEach(async () => {
    if (!dbAvailable || !clientId) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
    clientId = undefined;
  });

  it('defaults geofencing_feature_enabled to false for a newly created client', async () => {
    if (!dbAvailable) return;
    const superToken = tokenFor({ client_id: 'unused', role: 'superadmin' });
    const res = await request(app)
      .post('/api/v1/admin/clients')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'Gate Test Co', email: uniqueEmail('gate-test-client'), plan: 'starter' });

    clientId = res.body.data?.id;
    expect(res.status).toBe(201);

    const row = await pool.query('SELECT geofencing_feature_enabled FROM clients WHERE id = $1', [clientId]);
    expect(row.rows[0].geofencing_feature_enabled).toBe(false);
  });

  it('rejects turning geofencing on without geofencing_art4_confirmed', async () => {
    if (!dbAvailable) return;
    const superToken = tokenFor({ client_id: 'unused', role: 'superadmin' });
    const createRes = await request(app)
      .post('/api/v1/admin/clients')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'Gate Reject Co', email: uniqueEmail('gate-reject-client'), plan: 'starter' });
    clientId = createRes.body.data.id;

    const adminToken = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ geofencing_feature_enabled: true });

    expect(res.status).toBe(400);

    const row = await pool.query('SELECT geofencing_feature_enabled FROM clients WHERE id = $1', [clientId]);
    expect(row.rows[0].geofencing_feature_enabled).toBe(false);
  });

  it('allows turning geofencing on with geofencing_art4_confirmed and logs a dedicated audit entry', async () => {
    if (!dbAvailable) return;
    const superToken = tokenFor({ client_id: 'unused', role: 'superadmin' });
    const createRes = await request(app)
      .post('/api/v1/admin/clients')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'Gate Confirm Co', email: uniqueEmail('gate-confirm-client'), plan: 'starter' });
    clientId = createRes.body.data.id;

    const adminToken = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ geofencing_feature_enabled: true, geofencing_art4_confirmed: true });

    expect(res.status).toBe(200);
    expect(res.body.data.geofencing_feature_enabled).toBe(true);

    const audit = await pool.query(
      `SELECT * FROM audit_log
       WHERE entity_id = $1 AND action = 'geofencing_art4_confirmed'
       ORDER BY timestamp DESC LIMIT 1`,
      [clientId]
    );
    expect(audit.rows.length).toBe(1);
  });

  it('does not require confirmation when the flag is already true and only meal_voucher_hours changes', async () => {
    if (!dbAvailable) return;
    const superToken = tokenFor({ client_id: 'unused', role: 'superadmin' });
    const createRes = await request(app)
      .post('/api/v1/admin/clients')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'Gate Noop Co', email: uniqueEmail('gate-noop-client'), plan: 'starter' });
    clientId = createRes.body.data.id;

    const adminToken = tokenFor({ client_id: clientId, role: 'admin' });
    await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ geofencing_feature_enabled: true, geofencing_art4_confirmed: true });

    const res = await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ geofencing_feature_enabled: true, meal_voucher_hours: 6 });

    expect(res.status).toBe(200);
  });
});
