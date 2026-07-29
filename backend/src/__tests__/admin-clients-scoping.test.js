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

// L'invito admin automatico (Task 4, onboarding self-service) invia una vera
// email SES alla creazione di un client — mockata qui perché questo file usa
// Postgres reale ma non deve mai tentare una vera chiamata AWS.
const mockSend = jest.fn().mockResolvedValue({ MessageId: 'test' });
jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  SendEmailCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

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

  // L'invio dell'invito avviene DOPO che la risposta HTTP è già stata inviata
  // (mai bloccare la creazione del client per un problema SES) — il client
  // supertest può ricevere il 201 prima che l'INSERT su invite_tokens sia
  // completato. Poll breve invece di un'attesa fissa, per restare deterministico.
  async function waitForInviteToken(email, { timeoutMs = 2000, intervalMs = 20 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await pool.query('SELECT * FROM invite_tokens WHERE email = $1', [email]);
      if (result.rows.length > 0) return result.rows[0];
      await new Promise((resolve) => { setTimeout(resolve, intervalMs); });
    }
    throw new Error(`invite_tokens row for ${email} never appeared within ${timeoutMs}ms`);
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
    mockSend.mockClear();
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
    await pool.query('DELETE FROM invite_tokens WHERE email = $1', [newEmail]);
    await pool.query('DELETE FROM clients WHERE email = $1', [newEmail]);
  });

  it('POST /admin/clients: creation still returns 201 even if the invite email fails to send', async () => {
    if (!dbAvailable) return;
    mockSend.mockRejectedValueOnce(new Error('SES throttled'));
    const token = tokenFor({ client_id: clientA, role: 'superadmin' });
    const newEmail = uniqueEmail('new-co-email-fails');
    const res = await request(app)
      .post('/api/v1/admin/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Co Email Fail', email: newEmail, plan: 'starter' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('New Co Email Fail');
    await pool.query('DELETE FROM invite_tokens WHERE email = $1', [newEmail]);
    await pool.query('DELETE FROM clients WHERE email = $1', [newEmail]);
  });

  it('POST /admin/clients: sends an invite email with a working token link', async () => {
    if (!dbAvailable) return;
    mockSend.mockResolvedValueOnce({ MessageId: 'ok' });
    const { SendEmailCommand } = require('@aws-sdk/client-ses');
    SendEmailCommand.mockClear();
    const token = tokenFor({ client_id: clientA, role: 'superadmin' });
    const newEmail = uniqueEmail('new-co-invite-link');
    await request(app)
      .post('/api/v1/admin/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Co Invite', email: newEmail, plan: 'starter' });

    const inviteRow = await waitForInviteToken(newEmail);
    expect(inviteRow.used_at).toBeNull();

    expect(mockSend).toHaveBeenCalledTimes(1);
    const sentEmail = SendEmailCommand.mock.calls[0][0];
    expect(sentEmail.Destination.ToAddresses).toEqual([newEmail]);
    expect(sentEmail.Message.Body.Text.Data).toMatch(/accetta-invito\?token=/);

    await pool.query('DELETE FROM invite_tokens WHERE email = $1', [newEmail]);
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
