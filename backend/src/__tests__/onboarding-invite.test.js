'use strict';

/**
 * Integration tests: POST /api/v1/onboarding/invite/:token/accept (Task 5,
 * onboarding self-service). Real-Postgres, stesso pattern di
 * admin-clients-scoping.test.js: dbAvailable soft-skip, righe reali via SQL.
 */

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { generateInviteToken } = require('../utils/inviteTokens');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('POST /api/v1/onboarding/invite/:token/accept', () => {
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
      console.warn(`[onboarding-invite.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Invite Test Co', $1, 'starter', false)
       RETURNING id`,
      [email]
    );
    return result.rows[0].id;
  }

  async function makeInvite(clientId, email, { expired = false, used = false } = {}) {
    const { rawToken, tokenHash } = generateInviteToken();
    const expiresAt = expired ? new Date(Date.now() - 1000) : new Date(Date.now() + 86400000);
    await pool.query(
      `INSERT INTO invite_tokens (client_id, email, token_hash, expires_at, used_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [clientId, email, tokenHash, expiresAt, used ? new Date() : null]
    );
    return rawToken;
  }

  let clientId, clientEmail;

  beforeEach(async () => {
    if (!dbAvailable) return;
    clientEmail = uniqueEmail('invite-client');
    clientId = await makeClient(clientEmail);
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM employees WHERE client_id = $1', [clientId]);
    await pool.query('DELETE FROM invite_tokens WHERE client_id = $1', [clientId]);
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('accepts a valid token: creates the admin employee, consumes the token, returns a working JWT', async () => {
    if (!dbAvailable) return;
    const rawToken = await makeInvite(clientId, clientEmail);

    const res = await request(app)
      .post(`/api/v1/onboarding/invite/${rawToken}/accept`)
      .send({ name: 'Mario Admin', password: 'Passw0rd!2026' });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.refresh_token).toBeTruthy();
    expect(res.body.data.user.email).toBe(clientEmail);
    expect(res.body.data.user.role).toBe('admin');
    // A freshly-accepted invite always belongs to a brand-new client with no
    // sites yet (invites are only issued at client creation, see
    // admin/clients.js) — tells LoginPage.jsx to redirect to
    // /admin/onboarding on any later re-login before the wizard is run.
    expect(res.body.data.user.has_sites).toBe(false);

    const employee = await pool.query('SELECT * FROM employees WHERE client_id = $1', [clientId]);
    expect(employee.rows).toHaveLength(1);
    expect(employee.rows[0].name).toBe('Mario Admin');
    expect(employee.rows[0].must_change_password).toBe(false);

    // employee_id deve essere presente e coincidere col soggetto del token,
    // esattamente come POST /auth/login — altrimenti endpoint gated su
    // req.user.employee_id (smartWorking.js, checkins.js, illnesses.js)
    // tratterebbero il nuovo admin come privo di profilo dipendente.
    expect(res.body.data.user.employee_id).toBe(employee.rows[0].id);
    const decoded = jwt.decode(res.body.data.token);
    expect(decoded.employee_id).toBe(employee.rows[0].id);

    const invite = await pool.query('SELECT used_at FROM invite_tokens WHERE client_id = $1', [clientId]);
    expect(invite.rows[0].used_at).not.toBeNull();

    const audit = await pool.query(
      'SELECT * FROM audit_log WHERE entity = \'employee\' AND entity_id = $1',
      [employee.rows[0].id]
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].action).toBe('onboarding_invite_accepted');
  });

  it('rejects an expired token with 404, creates no employee row', async () => {
    if (!dbAvailable) return;
    const rawToken = await makeInvite(clientId, clientEmail, { expired: true });

    const res = await request(app)
      .post(`/api/v1/onboarding/invite/${rawToken}/accept`)
      .send({ name: 'Mario Admin', password: 'Passw0rd!2026' });

    expect(res.status).toBe(404);
    const employee = await pool.query('SELECT * FROM employees WHERE client_id = $1', [clientId]);
    expect(employee.rows).toHaveLength(0);
  });

  it('rejects an already-used token with 404, creates no second employee row', async () => {
    if (!dbAvailable) return;
    const rawToken = await makeInvite(clientId, clientEmail, { used: true });

    const res = await request(app)
      .post(`/api/v1/onboarding/invite/${rawToken}/accept`)
      .send({ name: 'Mario Admin', password: 'Passw0rd!2026' });

    expect(res.status).toBe(404);
    const employee = await pool.query('SELECT * FROM employees WHERE client_id = $1', [clientId]);
    expect(employee.rows).toHaveLength(0);
  });

  it('rejects a nonexistent token with 404', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/onboarding/invite/not-a-real-token-at-all/accept')
      .send({ name: 'Mario Admin', password: 'Passw0rd!2026' });
    expect(res.status).toBe(404);
  });

  it('rejects a password shorter than 8 characters with 400, token not consumed', async () => {
    if (!dbAvailable) return;
    const rawToken = await makeInvite(clientId, clientEmail);

    const res = await request(app)
      .post(`/api/v1/onboarding/invite/${rawToken}/accept`)
      .send({ name: 'Mario Admin', password: 'short' });

    expect(res.status).toBe(400);
    const invite = await pool.query('SELECT used_at FROM invite_tokens WHERE client_id = $1', [clientId]);
    expect(invite.rows[0].used_at).toBeNull();
  });

  it('only one of two concurrent accept requests for the same token succeeds', async () => {
    if (!dbAvailable) return;
    const rawToken = await makeInvite(clientId, clientEmail);

    const [resA, resB] = await Promise.all([
      request(app).post(`/api/v1/onboarding/invite/${rawToken}/accept`).send({ name: 'Admin A', password: 'Passw0rd!2026' }),
      request(app).post(`/api/v1/onboarding/invite/${rawToken}/accept`).send({ name: 'Admin B', password: 'Passw0rd!2026' }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 404]);

    const employee = await pool.query('SELECT * FROM employees WHERE client_id = $1', [clientId]);
    expect(employee.rows).toHaveLength(1); // mai due employee creati per lo stesso invito
  });
});
