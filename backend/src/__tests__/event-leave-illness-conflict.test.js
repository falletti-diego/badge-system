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

describe('PUT /api/v1/events/:id/approve — leave/illness conflict guard', () => {
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
      console.warn(`[event-leave-illness-conflict.test] Skipping — could not connect: ${err.message}`);
    }
    if (dbAvailable) {
      request = require('supertest');
      app = require('../app');
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  async function makeClient() {
    const result = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Event Approve Conflict Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('event-approve-conflict-client')]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, active)
       VALUES ($1, $2, 'Event Approve Conflict Employee', 'employee', true)
       RETURNING id`,
      [clientId, uniqueEmail('event-approve-conflict')]
    );
    return result.rows[0].id;
  }

  async function makePendingEvent(clientId, employeeId, eventDate) {
    const result = await pool.query(
      `INSERT INTO event_requests (id, client_id, user_id, event_date, start_time, end_time, description, status)
       VALUES (uuid_generate_v4(), $1, $2, $3::date, '08:00', '18:00', 'Corso di formazione', 'PENDING')
       RETURNING id`,
      [clientId, employeeId, eventDate]
    );
    return result.rows[0].id;
  }

  async function makeLeave(clientId, employeeId, startDate, endDate, status) {
    await pool.query(
      `INSERT INTO leave_requests (id, client_id, user_id, leave_type, start_date, end_date, num_days, status)
       VALUES (uuid_generate_v4(), $1, $2, 'FERIE_1', $3::date, $4::date, 1, $5)`,
      [clientId, employeeId, startDate, endDate, status]
    );
  }

  async function makeIllness(clientId, employeeId, startDate, endDate) {
    await pool.query(
      `INSERT INTO illnesses (id, client_id, employee_id, start_date, end_date, num_days, created_by)
       VALUES (uuid_generate_v4(), $1, $2, $3::date, $4::date, 1, $2)`,
      [clientId, employeeId, startDate, endDate]
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
    clientId = undefined;
  });

  it('rejects approval with 409 EVENT_DATE_CONFLICT when a leave now covers the event date, leaving it PENDING', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    const eventId = await makePendingEvent(clientId, employeeId, '2026-09-02');
    // The leave was approved AFTER the event request was created.
    await makeLeave(clientId, employeeId, '2026-09-01', '2026-09-03', 'APPROVED');
    const adminToken = tokenFor({ client_id: clientId, role: 'admin', employee_id: employeeId });

    const res = await request(app)
      .put(`/api/v1/events/${eventId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');

    const check = await pool.query('SELECT status FROM event_requests WHERE id = $1', [eventId]);
    expect(check.rows[0].status).toBe('PENDING');
  });

  it('rejects approval with 409 EVENT_DATE_CONFLICT when an illness now covers the event date', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    const eventId = await makePendingEvent(clientId, employeeId, '2026-09-02');
    await makeIllness(clientId, employeeId, '2026-09-02', '2026-09-02');
    const adminToken = tokenFor({ client_id: clientId, role: 'admin', employee_id: employeeId });

    const res = await request(app)
      .put(`/api/v1/events/${eventId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('allows approval when no conflicting leave/illness exists (no regression)', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    const eventId = await makePendingEvent(clientId, employeeId, '2026-09-02');
    const adminToken = tokenFor({ client_id: clientId, role: 'admin', employee_id: employeeId });

    const res = await request(app)
      .put(`/api/v1/events/${eventId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
  });
});
