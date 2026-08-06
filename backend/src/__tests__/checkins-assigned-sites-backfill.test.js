'use strict';

/**
 * Verifica end-to-end (non solo asserzioni SQL) che il trigger della
 * migration 038 chiuda davvero il bug originale: un employee inserito con
 * site_id valorizzato ma assigned_sites vuoto — il path storicamente rotto
 * di migration 018/019a — riesce comunque a fare check-in, perché il
 * trigger lo corregge automaticamente all'INSERT.
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

describe('POST /api/v1/checkins — employee inserito con site_id ma assigned_sites vuoto (migration 038)', () => {
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
      console.warn(`[checkins-assigned-sites-backfill test] Skipping — could not connect: ${err.message}`);
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

  function tokenFor({ client_id, role, employee_id }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign(
      { user_id: 'test-user', client_id, role, employee_id, name: 'Test' },
      privateKey,
      { algorithm: 'RS256', expiresIn: '1h' }
    );
  }

  let clientId;

  afterEach(async () => {
    if (!dbAvailable || !clientId) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('un employee inserito passando SOLO site_id (assigned_sites di default) riesce comunque a fare check-in', async () => {
    if (!dbAvailable) return;

    const clientRow = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Backfill E2E Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('backfill-e2e-client')]
    );
    clientId = clientRow.rows[0].id;

    const siteRow = await pool.query(
      `INSERT INTO sites (id, client_id, name, qr_code_content)
       VALUES (uuid_generate_v4(), $1, 'Backfill E2E Site', $2)
       RETURNING id`,
      [clientId, `badge://backfill-e2e-${Date.now()}`]
    );
    const siteId = siteRow.rows[0].id;

    // Simula esattamente il path storicamente rotto: solo site_id, MAI
    // assigned_sites (colonna omessa dall'INSERT, resta al default '{}').
    // Se il trigger della migration 038 funziona, la riga risulterà
    // comunque con site_id incluso in assigned_sites subito dopo l'insert.
    const empRow = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, site_id)
       VALUES ($1, $2, 'Backfill E2E Employee', 'employee', $3)
       RETURNING id, assigned_sites`,
      [clientId, uniqueEmail('backfill-e2e-employee'), siteId]
    );
    const employeeId = empRow.rows[0].id;

    expect(empRow.rows[0].assigned_sites).toEqual([siteId]);

    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: employeeId, site_id: siteId, type: 'IN' });

    expect(res.status).toBe(201);
  });
});
