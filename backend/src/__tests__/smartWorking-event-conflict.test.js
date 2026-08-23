'use strict';

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { todayInTimeZone } = require('../utils/date');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('POST /api/v1/smart-working — event conflict guard', () => {
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
      console.warn(`[smartWorking-event-conflict.test] Skipping — could not connect: ${err.message}`);
    }
    if (dbAvailable) {
      request = require('supertest');
      app = require('../app');
    }
  });

  afterAll(async () => {
    // Nota: closePool() non va chiamato qui — il secondo describe (PUT approve)
    // più sotto richiede lo stesso `app`/pool condiviso; chiuderlo due volte
    // fa fallire la seconda suite. Chiuso una sola volta nell'ultimo describe.
    if (pool) await pool.end();
  });

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  async function makeClient() {
    const result = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'SmartWorking Event Conflict Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('smartworking-event-conflict-client')]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, active)
       VALUES ($1, $2, 'SmartWorking Event Conflict Employee', 'employee', true)
       RETURNING id`,
      [clientId, uniqueEmail('smartworking-event-conflict')]
    );
    return result.rows[0].id;
  }

  async function makeEventRequest(clientId, employeeId, eventDate, status) {
    await pool.query(
      `INSERT INTO event_requests (id, client_id, user_id, event_date, start_time, end_time, description, status)
       VALUES (uuid_generate_v4(), $1, $2, $3::date, '08:00', '18:00', 'Corso di formazione', $4)`,
      [clientId, employeeId, eventDate, status]
    );
  }

  function tokenFor({ client_id, role, employee_id }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign(
      { user_id: employee_id, client_id, role, employee_id, name: 'Test' },
      privateKey,
      { algorithm: 'RS256', expiresIn: '1h' }
    );
  }

  let clientId;

  afterEach(async () => {
    if (!dbAvailable || !clientId) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('rejects with 409 EVENT_DATE_CONFLICT when a PENDING event exists for today', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeEventRequest(clientId, employeeId, todayInTimeZone(), 'PENDING');
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/smart-working')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('rejects with 409 EVENT_DATE_CONFLICT when an APPROVED event exists for today', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeEventRequest(clientId, employeeId, todayInTimeZone(), 'APPROVED');
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/smart-working')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('allows Smart Working when the only event for today is REJECTED', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeEventRequest(clientId, employeeId, todayInTimeZone(), 'REJECTED');
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/smart-working')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(201);
  });

  it('allows Smart Working when no event exists for today (no regression)', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/smart-working')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(201);
  });
});

describe('PUT /api/v1/events/:id/approve — smart working conflict guard', () => {
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
      console.warn(`[smartWorking-event-conflict PUT approve] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'SmartWorking Approve Conflict Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('smartworking-approve-conflict-client')]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId, siteId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, active)
       VALUES ($1, $2, 'SmartWorking Approve Conflict Employee', 'employee', ARRAY[$3]::uuid[], true)
       RETURNING id`,
      [clientId, uniqueEmail('smartworking-approve-conflict'), siteId]
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

  async function makeEventRequest(clientId, employeeId, eventDate) {
    const result = await pool.query(
      `INSERT INTO event_requests (id, client_id, user_id, event_date, start_time, end_time, description, status)
       VALUES (uuid_generate_v4(), $1, $2, $3::date, '08:00', '18:00', 'Corso di formazione', 'PENDING')
       RETURNING id`,
      [clientId, employeeId, eventDate]
    );
    return result.rows[0].id;
  }

  async function makeSmartWorkingDay(clientId, employeeId, date) {
    await pool.query(
      `INSERT INTO smart_working_days (client_id, employee_id, date, created_by)
       VALUES ($1, $2, $3::date, $2)`,
      [clientId, employeeId, date]
    );
  }

  // event_requests.approved_by REFERENCES employees(id) — the approving admin must be a
  // real employee row, not just an arbitrary UUID, or the approval INSERT ... UPDATE fails
  // with a foreign key violation (23503).
  async function makeAdminEmployee(clientId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, active)
       VALUES ($1, $2, 'SmartWorking Approve Conflict Admin', 'admin', true)
       RETURNING id`,
      [clientId, uniqueEmail('smartworking-approve-conflict-admin')]
    );
    return result.rows[0].id;
  }

  function tokenFor({ client_id, role, user_id }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign({ user_id: user_id || crypto.randomUUID(), client_id, role, name: 'Test Admin' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
  }

  let clientId;

  afterEach(async () => {
    if (!dbAvailable || !clientId) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('rejects approval with 409 EVENT_DATE_CONFLICT when the employee already declared Smart Working for the event date', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const siteId = await makeSite(clientId);
    const employeeId = await makeEmployee(clientId, siteId);
    const today = todayInTimeZone();
    const eventId = await makeEventRequest(clientId, employeeId, today);
    await makeSmartWorkingDay(clientId, employeeId, today);
    const adminId = await makeAdminEmployee(clientId);
    const adminToken = tokenFor({ client_id: clientId, role: 'admin', user_id: adminId });

    const res = await request(app)
      .put(`/api/v1/events/${eventId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('allows approval when no Smart Working day exists for the event date (no regression)', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const siteId = await makeSite(clientId);
    const employeeId = await makeEmployee(clientId, siteId);
    const eventId = await makeEventRequest(clientId, employeeId, todayInTimeZone());
    const adminId = await makeAdminEmployee(clientId);
    const adminToken = tokenFor({ client_id: clientId, role: 'admin', user_id: adminId });

    const res = await request(app)
      .put(`/api/v1/events/${eventId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(200);
  });
});
