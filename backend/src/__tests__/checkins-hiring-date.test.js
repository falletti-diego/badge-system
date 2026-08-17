'use strict';

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { todayInTimeZone, dateInTimeZone } = require('../utils/date');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('POST /api/v1/checkins — hiring_date guard', () => {
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
      console.warn(`[checkins-hiring-date.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Checkins Hiring Date Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('checkins-hiring-date-client')]
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

  async function makeEmployee(clientId, siteId, hiringDate) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, active, hiring_date)
       VALUES ($1, $2, 'Checkin Hiring Date Employee', 'employee', ARRAY[$3]::uuid[], true, $4)
       RETURNING id`,
      [clientId, uniqueEmail('checkins-hiring-date'), siteId, hiringDate]
    );
    return result.rows[0].id;
  }

  function tokenFor({ client_id, role, employee_id }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign(
      { user_id: 'test-user', client_id, role, employee_id, name: 'Test' },
      privateKey,
      { algorithm: 'RS256', expiresIn: '1h' }
    );
  }

  let clientId, siteId;

  beforeEach(async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    siteId = await makeSite(clientId);
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('rejects check-in with 403 EMPLOYMENT_NOT_STARTED when hiring_date is in the future', async () => {
    if (!dbAvailable) return;
    const tomorrow = dateInTimeZone(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const employeeId = await makeEmployee(clientId, siteId, tomorrow);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: employeeId, site_id: siteId, type: 'IN' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('EMPLOYMENT_NOT_STARTED');
    expect(res.body.details.hiring_date).toBe(tomorrow);
  });

  it('allows check-in when hiring_date is today', async () => {
    if (!dbAvailable) return;
    const today = todayInTimeZone();
    const employeeId = await makeEmployee(clientId, siteId, today);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: employeeId, site_id: siteId, type: 'IN' });

    expect(res.status).toBe(201);
  });

  it('rejects backdated offline check-in with 403 EMPLOYMENT_NOT_STARTED when occurred_at is before hiring_date (today)', async () => {
    if (!dbAvailable) return;
    const today = todayInTimeZone();
    const employeeId = await makeEmployee(clientId, siteId, today);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });
    // 30h in the past: within the 48h offline window, but its Europe/Rome date
    // is guaranteed to fall before "today" — proves the guard now uses occurred_at
    // (the effective event date) instead of the server's current date.
    const occurredAt = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employee_id: employeeId,
        site_id: siteId,
        type: 'IN',
        occurred_at: occurredAt,
        client_uuid: '55555555-5555-5555-5555-555555555555',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('EMPLOYMENT_NOT_STARTED');
    expect(res.body.details.hiring_date).toBe(today);
  });

  it('allows check-in when hiring_date is NULL (legacy employee, no regression)', async () => {
    if (!dbAvailable) return;
    const employeeId = await makeEmployee(clientId, siteId, null);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: employeeId, site_id: siteId, type: 'IN' });

    expect(res.status).toBe(201);
  });
});
