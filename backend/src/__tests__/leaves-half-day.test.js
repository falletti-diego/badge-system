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

describe('POST /api/v1/leave/request — half-day support (ONB.2)', () => {
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
      console.warn(`[leaves-half-day.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Half Day Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('half-day-client')]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, active)
       VALUES ($1, $2, 'Half Day Employee', 'employee', true)
       RETURNING id`,
      [clientId, uniqueEmail('half-day-employee')]
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

  it('creates a half-day request with num_days=0.5 (number, not string) in the response', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeSaldo(clientId, employeeId, 'FERIE_1', 2026);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/leave/request')
      .set('Authorization', `Bearer ${token}`)
      .send({ leave_type: 'FERIE_1', start_date: '2026-09-20', end_date: '2026-09-20', half_day: true });

    expect(res.status).toBe(201);
    expect(res.body.data.num_days).toBe(0.5);
    expect(typeof res.body.data.num_days).toBe('number');

    const dbRow = await pool.query('SELECT num_days FROM leave_requests WHERE id = $1::uuid', [res.body.data.id]);
    expect(Number(dbRow.rows[0].num_days)).toBe(0.5);
  });

  it('a full-day request (no half_day) still gets num_days as a whole number', async () => {
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
    expect(res.body.data.num_days).toBe(3);
    expect(typeof res.body.data.num_days).toBe('number');
  });

  it('GET /balance returns total_days/used_days/remaining_days as numbers, not strings', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeSaldo(clientId, employeeId, 'FERIE_1', new Date().getFullYear());
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .get('/api/v1/leave/balance')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const row = res.body.data[0];
    expect(typeof row.total_days).toBe('number');
    expect(typeof row.used_days).toBe('number');
    expect(typeof row.remaining_days).toBe('number');
  });
});
