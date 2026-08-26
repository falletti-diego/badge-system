'use strict';

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { todayInTimeZone } = require('../utils/date');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('POST /api/v1/illnesses/report — "malattia vince sempre" cascade', () => {
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
      console.warn(`[illness-cascade-conflict.test] Skipping — could not connect: ${err.message}`);
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

  function addDays(dateStr, days) {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  async function makeClient() {
    const result = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Illness Cascade Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('illness-cascade-client')]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, active)
       VALUES ($1, $2, 'Illness Cascade Employee', 'employee', true)
       RETURNING id`,
      [clientId, uniqueEmail('illness-cascade')]
    );
    return result.rows[0].id;
  }

  async function makeSaldo(clientId, employeeId, leaveType, year, usedDays) {
    await pool.query(
      `INSERT INTO leave_saldi (client_id, user_id, leave_type, year, total_days, used_days)
       VALUES ($1, $2, $3, $4, 20, $5)`,
      [clientId, employeeId, leaveType, year, usedDays]
    );
  }

  async function makeApprovedLeave(clientId, employeeId, startDate, endDate, numDays) {
    const result = await pool.query(
      `INSERT INTO leave_requests (id, client_id, user_id, leave_type, start_date, end_date, num_days, status, approved_at)
       VALUES (uuid_generate_v4(), $1, $2, 'FERIE_1', $3::date, $4::date, $5, 'APPROVED', NOW())
       RETURNING id`,
      [clientId, employeeId, startDate, endDate, numDays]
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

  it('never blocks illness creation even when a PENDING event exists for the same future date', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    const futureDate = addDays(todayInTimeZone(), 3);
    await makePendingEvent(clientId, employeeId, futureDate);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/illnesses/report')
      .set('Authorization', `Bearer ${token}`)
      .send({ start_date: futureDate, end_date: futureDate });

    expect(res.status).toBe(201);
  });

  it('auto-rejects a PENDING event overlapping a future illness date', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    const futureDate = addDays(todayInTimeZone(), 3);
    const eventId = await makePendingEvent(clientId, employeeId, futureDate);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/illnesses/report')
      .set('Authorization', `Bearer ${token}`)
      .send({ start_date: futureDate, end_date: futureDate });

    expect(res.status).toBe(201);

    const check = await pool.query('SELECT status, rejection_reason FROM event_requests WHERE id = $1', [eventId]);
    expect(check.rows[0].status).toBe('REJECTED');
    expect(check.rows[0].rejection_reason).toContain('malattia');
  });

  it('auto-rejects an APPROVED future leave and reverses the saldo used_days decrement', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    const futureStart = addDays(todayInTimeZone(), 3);
    const futureEnd = addDays(todayInTimeZone(), 5);
    const year = new Date(futureStart).getFullYear();
    await makeSaldo(clientId, employeeId, 'FERIE_1', year, 3); // saldo already reflects the 3-day approved leave
    const leaveId = await makeApprovedLeave(clientId, employeeId, futureStart, futureEnd, 3);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/illnesses/report')
      .set('Authorization', `Bearer ${token}`)
      .send({ start_date: futureStart, end_date: futureEnd });

    expect(res.status).toBe(201);

    const leaveCheck = await pool.query('SELECT status FROM leave_requests WHERE id = $1', [leaveId]);
    expect(leaveCheck.rows[0].status).toBe('REJECTED');

    const saldoCheck = await pool.query(
      'SELECT used_days FROM leave_saldi WHERE user_id = $1 AND leave_type = $2 AND year = $3',
      [employeeId, 'FERIE_1', year]
    );
    expect(saldoCheck.rows[0].used_days).toBe(0); // 3 - 3 = 0, reversed correctly
  });

  it('never touches an approved leave that is entirely in the past', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    // A leave entirely before today — illness reported for a range that
    // does NOT overlap it, so this asserts the base case (no accidental
    // touch of unrelated past data), matching the design's "solo
    // oggi/futuro" decision.
    const pastStart = addDays(todayInTimeZone(), -10);
    const pastEnd = addDays(todayInTimeZone(), -8);
    const year = new Date(pastStart).getFullYear();
    await makeSaldo(clientId, employeeId, 'FERIE_1', year, 3);
    const leaveId = await makeApprovedLeave(clientId, employeeId, pastStart, pastEnd, 3);
    const futureDate = addDays(todayInTimeZone(), 3);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/illnesses/report')
      .set('Authorization', `Bearer ${token}`)
      .send({ start_date: futureDate, end_date: futureDate });

    expect(res.status).toBe(201);

    const leaveCheck = await pool.query('SELECT status FROM leave_requests WHERE id = $1', [leaveId]);
    expect(leaveCheck.rows[0].status).toBe('APPROVED'); // untouched
  });

  it('does not touch an approved leave entirely in the past even when the illness range itself spans past-to-future (clamp is real, not cosmetic)', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    // The leave sits entirely in the past, but the illness's RAW range
    // (unclamped) does overlap it — if the cascadeStart clamp were a no-op,
    // this leave would be wrongly rejected. This is the exact scenario the
    // design spec worried about: silently altering hours/meal vouchers
    // potentially already exported to payroll for a past, closed period.
    const pastStart = addDays(todayInTimeZone(), -4);
    const pastEnd = addDays(todayInTimeZone(), -2);
    const year = new Date(pastStart).getFullYear();
    await makeSaldo(clientId, employeeId, 'FERIE_1', year, 3);
    const leaveId = await makeApprovedLeave(clientId, employeeId, pastStart, pastEnd, 3);
    const illnessStart = addDays(todayInTimeZone(), -5);
    const illnessEnd = addDays(todayInTimeZone(), 3);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/illnesses/report')
      .set('Authorization', `Bearer ${token}`)
      .send({ start_date: illnessStart, end_date: illnessEnd });

    expect(res.status).toBe(201);

    const leaveCheck = await pool.query('SELECT status FROM leave_requests WHERE id = $1', [leaveId]);
    expect(leaveCheck.rows[0].status).toBe('APPROVED'); // untouched — the clamp protected it

    const saldoCheck = await pool.query(
      'SELECT used_days FROM leave_saldi WHERE user_id = $1 AND leave_type = $2 AND year = $3',
      [employeeId, 'FERIE_1', year]
    );
    expect(saldoCheck.rows[0].used_days).toBe(3); // untouched
  });

  it('rejects an approved leave that spans past-to-future, when the illness overlaps only its future portion', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    // The leave itself started before today and ends in the future — it is
    // still an active, currently-relevant record (not a closed past period),
    // so the cascade must reject it in full, the same as a fully-future leave.
    const spanningStart = addDays(todayInTimeZone(), -2);
    const spanningEnd = addDays(todayInTimeZone(), 4);
    const year = new Date(spanningStart).getFullYear();
    await makeSaldo(clientId, employeeId, 'FERIE_1', year, 7);
    const leaveId = await makeApprovedLeave(clientId, employeeId, spanningStart, spanningEnd, 7);
    const illnessStart = addDays(todayInTimeZone(), 2);
    const illnessEnd = addDays(todayInTimeZone(), 3);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/illnesses/report')
      .set('Authorization', `Bearer ${token}`)
      .send({ start_date: illnessStart, end_date: illnessEnd });

    expect(res.status).toBe(201);

    const leaveCheck = await pool.query('SELECT status FROM leave_requests WHERE id = $1', [leaveId]);
    expect(leaveCheck.rows[0].status).toBe('REJECTED');

    const saldoCheck = await pool.query(
      'SELECT used_days FROM leave_saldi WHERE user_id = $1 AND leave_type = $2 AND year = $3',
      [employeeId, 'FERIE_1', year]
    );
    expect(saldoCheck.rows[0].used_days).toBe(0); // 7 - 7 = 0, reversed in full
  });

  it('writes an audit log entry for each auto-rejected record', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    const futureDate = addDays(todayInTimeZone(), 3);
    const eventId = await makePendingEvent(clientId, employeeId, futureDate);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    await request(app)
      .post('/api/v1/illnesses/report')
      .set('Authorization', `Bearer ${token}`)
      .send({ start_date: futureDate, end_date: futureDate });

    const auditCheck = await pool.query(
      `SELECT action FROM audit_log
       WHERE entity = 'event_request' AND entity_id = $1 AND action = 'event_request_auto_rejected_by_illness'`,
      [eventId]
    );
    expect(auditCheck.rows.length).toBe(1);
  });
});
