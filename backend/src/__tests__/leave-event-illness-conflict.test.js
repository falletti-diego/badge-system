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

describe('POST /api/v1/leave/request — event/illness conflict guard', () => {
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
      console.warn(`[leave-event-illness-conflict.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Leave Conflict Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('leave-conflict-client')]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, active)
       VALUES ($1, $2, 'Leave Conflict Employee', 'employee', true)
       RETURNING id`,
      [clientId, uniqueEmail('leave-conflict')]
    );
    return result.rows[0].id;
  }

  async function makeSaldo(clientId, employeeId, leaveType, year) {
    await pool.query(
      `INSERT INTO leave_saldi (client_id, user_id, leave_type, year, total_days, used_days)
       VALUES ($1, $2, $3, $4, 20, 0)`,
      [clientId, employeeId, leaveType, year]
    );
  }

  async function makeEventRequest(clientId, employeeId, eventDate, status) {
    await pool.query(
      `INSERT INTO event_requests (id, client_id, user_id, event_date, start_time, end_time, description, status)
       VALUES (uuid_generate_v4(), $1, $2, $3::date, '08:00', '18:00', 'Corso di formazione', $4)`,
      [clientId, employeeId, eventDate, status]
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

  it('rejects with 409 EVENT_DATE_CONFLICT when a PENDING event overlaps the requested range', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeSaldo(clientId, employeeId, 'FERIE_1', 2026);
    await makeEventRequest(clientId, employeeId, '2026-09-02', 'PENDING');
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/leave/request')
      .set('Authorization', `Bearer ${token}`)
      .send({ leave_type: 'FERIE_1', start_date: '2026-09-01', end_date: '2026-09-03' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('rejects with 409 EVENT_DATE_CONFLICT when an active illness overlaps the requested range', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeSaldo(clientId, employeeId, 'FERIE_1', 2026);
    await makeIllness(clientId, employeeId, '2026-09-02', '2026-09-02');
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/leave/request')
      .set('Authorization', `Bearer ${token}`)
      .send({ leave_type: 'FERIE_1', start_date: '2026-09-01', end_date: '2026-09-03' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('allows the leave request when no conflicting event/illness exists (no regression)', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeSaldo(clientId, employeeId, 'FERIE_1', 2026);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/leave/request')
      .set('Authorization', `Bearer ${token}`)
      .send({ leave_type: 'FERIE_1', start_date: '2026-09-01', end_date: '2026-09-03' });

    expect(res.status).toBe(201);
  });

  it('allows the leave request when the only overlapping event is REJECTED', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeSaldo(clientId, employeeId, 'FERIE_1', 2026);
    await makeEventRequest(clientId, employeeId, '2026-09-02', 'REJECTED');
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/leave/request')
      .set('Authorization', `Bearer ${token}`)
      .send({ leave_type: 'FERIE_1', start_date: '2026-09-01', end_date: '2026-09-03' });

    expect(res.status).toBe(201);
  });
});

describe('PUT /api/v1/leave/:id/approve — event/illness conflict guard', () => {
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
      console.warn(`[leave approve conflict.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Leave Approve Conflict Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('leave-approve-conflict-client')]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, active)
       VALUES ($1, $2, 'Leave Approve Conflict Employee', 'employee', true)
       RETURNING id`,
      [clientId, uniqueEmail('leave-approve-conflict')]
    );
    return result.rows[0].id;
  }

  async function makeSaldo(clientId, employeeId, leaveType, year) {
    await pool.query(
      `INSERT INTO leave_saldi (client_id, user_id, leave_type, year, total_days, used_days)
       VALUES ($1, $2, $3, $4, 20, 0)`,
      [clientId, employeeId, leaveType, year]
    );
  }

  async function makePendingLeave(clientId, employeeId, startDate, endDate) {
    const result = await pool.query(
      `INSERT INTO leave_requests (id, client_id, user_id, leave_type, start_date, end_date, num_days, status)
       VALUES (uuid_generate_v4(), $1, $2, 'FERIE_1', $3::date, $4::date, 1, 'PENDING')
       RETURNING id`,
      [clientId, employeeId, startDate, endDate]
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

  async function makeIllness(clientId, employeeId, startDate, endDate) {
    await pool.query(
      `INSERT INTO illnesses (id, client_id, employee_id, start_date, end_date, num_days, created_by)
       VALUES (uuid_generate_v4(), $1, $2, $3::date, $4::date, 1, $2)`,
      [clientId, employeeId, startDate, endDate]
    );
  }

  function tokenFor({ client_id, role, employee_id, site_id }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign(
      { user_id: employee_id, client_id, role, employee_id, site_id, name: 'Test' },
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

  it('rejects approval with 409 EVENT_DATE_CONFLICT when an event now overlaps, leaving the leave PENDING', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeSaldo(clientId, employeeId, 'FERIE_1', 2026);
    const leaveId = await makePendingLeave(clientId, employeeId, '2026-09-01', '2026-09-03');
    // The event was approved AFTER the leave request was created — this is
    // exactly the race the design spec's "creazione + approvazione" decision
    // covers: creation-time check alone would have missed it.
    await makeEventRequest(clientId, employeeId, '2026-09-02', 'APPROVED');
    const adminToken = tokenFor({ client_id: clientId, role: 'admin', employee_id: employeeId });

    const res = await request(app)
      .put(`/api/v1/leave/${leaveId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');

    const check = await pool.query('SELECT status FROM leave_requests WHERE id = $1', [leaveId]);
    expect(check.rows[0].status).toBe('PENDING');
  });

  it('rejects approval with 409 EVENT_DATE_CONFLICT when an illness now overlaps, leaving the leave PENDING', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeSaldo(clientId, employeeId, 'FERIE_1', 2026);
    const leaveId = await makePendingLeave(clientId, employeeId, '2026-09-01', '2026-09-03');
    // The illness was reported AFTER the leave request was created — same
    // race as the event case above, but for the illness branch of the
    // approval-time guard (leaves.js's findConflictingIllnessRange call).
    await makeIllness(clientId, employeeId, '2026-09-02', '2026-09-02');
    const adminToken = tokenFor({ client_id: clientId, role: 'admin', employee_id: employeeId });

    const res = await request(app)
      .put(`/api/v1/leave/${leaveId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');

    const check = await pool.query('SELECT status FROM leave_requests WHERE id = $1', [leaveId]);
    expect(check.rows[0].status).toBe('PENDING');
  });

  it('allows approval when no conflicting event/illness exists (no regression)', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeSaldo(clientId, employeeId, 'FERIE_1', 2026);
    const leaveId = await makePendingLeave(clientId, employeeId, '2026-09-01', '2026-09-03');
    const adminToken = tokenFor({ client_id: clientId, role: 'admin', employee_id: employeeId });

    const res = await request(app)
      .put(`/api/v1/leave/${leaveId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
  });
});
