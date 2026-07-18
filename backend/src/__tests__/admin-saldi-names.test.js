'use strict';

/**
 * GET /api/v1/leave/admin/saldi — il payload deve includere il nome del
 * dipendente (JOIN employees), anche per dipendenti senza alcuna richiesta
 * ferie (bug code-review 2026-07-17: il frontend mostrava "Employee 550e8400").
 *
 * Real-Postgres integration test, same pattern as admin-clients-scoping.test.js:
 * dbAvailable soft-skip, real JWT signing, real rows via SQL — no mocks.
 */

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('GET /api/v1/leave/admin/saldi — employee name', () => {
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
      console.warn(`[admin-saldi-names.test] Skipping — could not connect: ${err.message}`);
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

  let clientId, employeeId, email;
  const currentYear = new Date().getFullYear();

  beforeEach(async () => {
    if (!dbAvailable) return;
    email = uniqueEmail('saldi-names');

    const clientResult = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Saldi Names Test Co', $1, 'starter', false)
       RETURNING id`,
      [email]
    );
    clientId = clientResult.rows[0].id;

    const employeeResult = await pool.query(
      `INSERT INTO employees (id, client_id, email, name)
       VALUES (uuid_generate_v4(), $1, $2, 'Mario Saldi Test')
       RETURNING id`,
      [clientId, uniqueEmail('mario-saldi')]
    );
    employeeId = employeeResult.rows[0].id;

    // Saldo row WITHOUT any leave_requests row for this employee.
    await pool.query(
      `INSERT INTO leave_saldi (id, client_id, user_id, leave_type, year, total_days, used_days)
       VALUES (uuid_generate_v4(), $1, $2, 'FERIE_1', $3, 15, 0)`,
      [clientId, employeeId, currentYear]
    );
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM leave_saldi WHERE client_id = $1', [clientId]);
    await pool.query('DELETE FROM employees WHERE client_id = $1', [clientId]);
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('includes the employee name for an employee with a saldo but zero leave_requests', async () => {
    if (!dbAvailable) return;
    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .get('/api/v1/leave/admin/saldi')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const entry = res.body.data[employeeId];
    expect(entry).toBeDefined();
    expect(entry.name).toBe('Mario Saldi Test');
    expect(entry.FERIE_1).toBe(15);
  });
});
