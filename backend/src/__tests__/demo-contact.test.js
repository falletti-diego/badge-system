'use strict';

/**
 * Integration tests: POST /api/v1/demo/contact (Task 5 of 9 — Ambiente
 * Demo Self-Service)
 *
 * Real-Postgres integration tests, mirroring demo-switch-role.test.js's
 * soft-skip pattern (dbAvailable) — this route's fail-closed
 * requireDemoTenant guard and DB persistence depend on genuine
 * transactional/query behavior that a mocked pool cannot meaningfully
 * verify. The one external dependency that IS mocked is utils/email.js
 * (the SES wrapper) — no test in this file should ever make a real AWS
 * call.
 *
 * Checkpoint 5 (plan) — the most important behavior of this route — is
 * covered here: a message must be saved BEFORE the SES send is attempted,
 * and an SES failure must never surface as a 500 to the caller (it must
 * still return a clean success with the message already durably saved).
 */

jest.mock('../utils/email', () => ({
  sendEmail: jest.fn(),
}));

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { sendEmail } = require('../utils/email');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('POST /api/v1/demo/contact (real database, mocked SES)', () => {
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
        `[demo-contact.test] Skipping real-DB tests — could not connect to ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}: ${err.message}`
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

  beforeEach(() => {
    sendEmail.mockReset();
  });

  async function cleanupByEmail(email) {
    await probePool.query('DELETE FROM clients WHERE email = $1', [email]);
  }

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  async function startDemo(label) {
    const email = uniqueEmail(label);
    const res = await request(app).post('/api/v1/demo/start').send({ email });
    expect(res.status).toBe(200);
    return { email, body: res.body.data };
  }

  // ----------------------------------------------------------------
  // Checkpoint 5.1 — success path
  // ----------------------------------------------------------------

  it('saves the message and sends a notification email with the prospect email + message', async () => {
    if (!dbAvailable) return;
    sendEmail.mockResolvedValue({ MessageId: 'ok-1' });
    const { email, body } = await startDemo('contact-success');
    const clientId = jwt.decode(body.token).client_id;

    try {
      const res = await request(app)
        .post('/api/v1/demo/contact')
        .set('Authorization', `Bearer ${body.token}`)
        .send({ message: 'Vorrei parlare con voi del piano enterprise.' });

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);

      const rows = await probePool.query(
        'SELECT client_id, message FROM demo_contact_requests WHERE client_id = $1',
        [clientId]
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].message).toBe('Vorrei parlare con voi del piano enterprise.');

      expect(sendEmail).toHaveBeenCalledTimes(1);
      const [sentArgs] = sendEmail.mock.calls[0];
      expect(sentArgs.to).toBe(process.env.DEMO_CONTACT_NOTIFY_EMAIL);
      expect(sentArgs.text).toContain(email); // real prospect email, not employee@demo.local
      expect(sentArgs.text).toContain('Vorrei parlare con voi del piano enterprise.');
    } finally {
      await cleanupByEmail(email);
    }
  });

  // ----------------------------------------------------------------
  // Checkpoint 5.2 — SES failure never produces a 500, message still saved
  // ----------------------------------------------------------------

  it('still saves the message and returns a clean success when SES send fails', async () => {
    if (!dbAvailable) return;
    sendEmail.mockRejectedValue(new Error('SES throttled'));
    const { email, body } = await startDemo('contact-ses-fail');
    const clientId = jwt.decode(body.token).client_id;

    try {
      const res = await request(app)
        .post('/api/v1/demo/contact')
        .set('Authorization', `Bearer ${body.token}`)
        .send({ message: 'Messaggio che non arriverà via email.' });

      expect(res.status).not.toBe(500);
      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);

      const rows = await probePool.query(
        'SELECT message FROM demo_contact_requests WHERE client_id = $1',
        [clientId]
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0].message).toBe('Messaggio che non arriverà via email.');
    } finally {
      await cleanupByEmail(email);
    }
  });

  // ----------------------------------------------------------------
  // Checkpoint 5.3 — fail-closed guard: real (non-demo) tenant gets 403
  // ----------------------------------------------------------------

  it('refuses a JWT belonging to a real (non-demo) customer with 403, saves nothing, sends nothing', async () => {
    if (!dbAvailable) return;
    const email = uniqueEmail('real-customer-contact');

    const realClient = await probePool.query(
      "INSERT INTO clients (id, name, email, plan) VALUES (uuid_generate_v4(), 'Real Co', $1, 'starter') RETURNING id",
      [email]
    );
    const realClientId = realClient.rows[0].id;

    const empEmail = uniqueEmail('real-employee-contact');
    const realEmployee = await probePool.query(
      `INSERT INTO employees (id, client_id, email, name, role)
       VALUES (uuid_generate_v4(), $1, $2, 'Real Admin', 'admin') RETURNING id`,
      [realClientId, empEmail]
    );
    const realEmployeeId = realEmployee.rows[0].id;

    const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    const realToken = jwt.sign(
      {
        user_id: realEmployeeId,
        name: 'Real Admin',
        email: empEmail,
        role: 'admin',
        client_id: realClientId,
        employee_id: realEmployeeId,
      },
      JWT_PRIVATE_KEY,
      { algorithm: 'RS256', expiresIn: '15m' }
    );

    try {
      const res = await request(app)
        .post('/api/v1/demo/contact')
        .set('Authorization', `Bearer ${realToken}`)
        .send({ message: 'Should never be saved.' });

      expect(res.status).toBe(403);

      const rows = await probePool.query(
        'SELECT id FROM demo_contact_requests WHERE client_id = $1',
        [realClientId]
      );
      expect(rows.rows).toHaveLength(0);
      expect(sendEmail).not.toHaveBeenCalled();
    } finally {
      await probePool.query('DELETE FROM clients WHERE id = $1', [realClientId]);
    }
  });

  // ----------------------------------------------------------------
  // Checkpoint 5.4 — malformed body
  // ----------------------------------------------------------------

  it('rejects a body missing message with 400', async () => {
    if (!dbAvailable) return;
    const { email, body } = await startDemo('contact-missing-message');

    try {
      const res = await request(app)
        .post('/api/v1/demo/contact')
        .set('Authorization', `Bearer ${body.token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(sendEmail).not.toHaveBeenCalled();
    } finally {
      await cleanupByEmail(email);
    }
  });

  it('rejects a body with an injected extra field (client_id) with 400', async () => {
    if (!dbAvailable) return;
    const { email, body } = await startDemo('contact-extra-field');

    try {
      const res = await request(app)
        .post('/api/v1/demo/contact')
        .set('Authorization', `Bearer ${body.token}`)
        .send({ message: 'hello', client_id: '550e8400-e29b-41d4-a716-446655440001' });

      expect(res.status).toBe(400);
    } finally {
      await cleanupByEmail(email);
    }
  });

  it('rejects an empty-string message with 400', async () => {
    if (!dbAvailable) return;
    const { email, body } = await startDemo('contact-empty-message');

    try {
      const res = await request(app)
        .post('/api/v1/demo/contact')
        .set('Authorization', `Bearer ${body.token}`)
        .send({ message: '' });

      expect(res.status).toBe(400);
    } finally {
      await cleanupByEmail(email);
    }
  });
});
