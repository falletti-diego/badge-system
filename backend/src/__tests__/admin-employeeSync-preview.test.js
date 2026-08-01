'use strict';

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('POST /api/v1/admin/employee-sync/preview', () => {
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
      console.warn(`[admin-employeeSync-preview.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Admin EmployeeSync Preview Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('admin-employeesync-preview-client')]
    );
    return result.rows[0].id;
  }

  async function makeSite(clientId, name) {
    const result = await pool.query(
      `INSERT INTO sites (client_id, name, location, qr_code_content)
       VALUES ($1, $2, 'Via Test 1', $3)
       RETURNING id`,
      [clientId, name, `QR_${name}_${Date.now()}`]
    );
    return result.rows[0].id;
  }

  function tokenFor({ client_id, role }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign({ user_id: 'test-user', client_id, role, name: 'Test' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
  }

  async function buildFile(dipendenti, sedi = [['Torino', '', '', '', '']]) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Dipendenti');
    ws.addRow(['nome_completo', 'email', 'telefono', 'ruolo', 'sede', 'matricola', 'stato', 'data_assunzione', 'data_uscita']);
    for (const d of dipendenti) ws.addRow(d);
    const wsSedi = wb.addWorksheet('Sedi');
    wsSedi.addRow(['nome_sede', 'indirizzo', 'latitudine', 'longitudine', 'raggio_geofence_m']);
    for (const s of sedi) wsSedi.addRow(s);
    return wb.xlsx.writeBuffer();
  }

  async function countEmployees(clientId) {
    const result = await pool.query('SELECT COUNT(*)::int AS count FROM employees WHERE client_id = $1', [clientId]);
    return result.rows[0].count;
  }

  let clientId;

  beforeEach(async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('returns a diff with nuovi and does not write to the DB', async () => {
    if (!dbAvailable) return;

    await makeSite(clientId, 'Torino');
    const before = await countEmployees(clientId);

    const buffer = await buildFile([
      ['Nuovo Assunto', 'nuovo-preview-test@x.it', '', 'dipendente', 'Torino', '', 'Attivo', '2026-07-01', ''],
    ]);

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/employee-sync/preview')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'test.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.nuovi).toHaveLength(1);
    expect(res.body.data.nuovi[0].email).toBe('nuovo-preview-test@x.it');

    const after = await countEmployees(clientId);
    expect(after).toBe(before);
  });

  it('returns syntax errors without computing a diff when the file is invalid', async () => {
    if (!dbAvailable) return;

    await makeSite(clientId, 'Torino');

    const buffer = await buildFile([
      ['X', 'x@x.it', '', 'dipendente', 'Torino', '', 'stato-non-valido', '', ''],
    ]);

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/employee-sync/preview')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'test.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.errors.length).toBeGreaterThan(0);
    expect(res.body.data.nuovi).toEqual([]);
  });

  it('rejects superadmin requests without an explicit client_id', async () => {
    if (!dbAvailable) return;

    const buffer = await buildFile([]);
    const token = tokenFor({ client_id: clientId, role: 'superadmin' });
    const res = await request(app)
      .post('/api/v1/admin/employee-sync/preview')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'test.xlsx');

    expect(res.status).toBe(400);
  });
});
