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

// Both /apply and /export-history are exercised in a single top-level
// describe (rather than one per endpoint) so beforeAll/afterAll run exactly
// once for the whole file — the shared singleton pool from ../db/pool is
// closed via closePool() in afterAll, and a second describe block calling
// closePool() again would leave later tests hitting a closed pool.
describe('employee-sync /apply and /export-history', () => {
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
      console.warn(`[admin-employeeSync-apply.test] Skipping — could not connect: ${err.message}`);
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

  async function makeClient(label = 'admin-employeesync-apply-client') {
    const result = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Admin EmployeeSync Apply Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail(label)]
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

  function binaryParser(res, callback) {
    res.setEncoding('binary');
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      callback(null, Buffer.from(data, 'binary'));
    });
  }

  describe('POST /api/v1/admin/employee-sync/apply', () => {
    let clientId;

    beforeEach(async () => {
      if (!dbAvailable) return;
      clientId = await makeClient();
    });

    afterEach(async () => {
      if (!dbAvailable) return;
      await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
    });

    it('creates a new employee end-to-end', async () => {
      if (!dbAvailable) return;

      await makeSite(clientId, 'Torino');
      const email = uniqueEmail('nuovo-apply-test');

      const buffer = await buildFile([
        ['Nuovo Assunto', email, '', 'dipendente', 'Torino', '', 'Attivo', '2026-07-01', ''],
      ]);

      const token = tokenFor({ client_id: clientId, role: 'admin' });
      const res = await request(app)
        .post('/api/v1/admin/employee-sync/apply')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', buffer, 'test.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.data.nuovi).toHaveLength(1);

      // Cast to text in SQL to avoid JS Date/timezone conversion pitfalls
      // when comparing a DATE column value.
      const dbRes = await pool.query(
        'SELECT active, hiring_date::text AS hiring_date FROM employees WHERE email = $1',
        [email]
      );
      expect(dbRes.rows).toHaveLength(1);
      expect(dbRes.rows[0].active).toBe(true);
      expect(dbRes.rows[0].hiring_date).toBe('2026-07-01');

      await pool.query('DELETE FROM employees WHERE email = $1', [email]);
    });

    it('creates a site declared only in the Sedi sheet, and assigns the employee to it (not null)', async () => {
      if (!dbAvailable) return;

      // Nessuna sede pre-esistente: "Bologna" esiste SOLO nel foglio Sedi del file.
      const email = uniqueEmail('nuova-sede-apply-test');
      const buffer = await buildFile(
        [['Nuovo Assunto', email, '', 'dipendente', 'Bologna', '', 'Attivo', '2026-07-01', '']],
        [['Bologna', 'Via Test 1', '', '', '']]
      );

      const token = tokenFor({ client_id: clientId, role: 'admin' });
      const res = await request(app)
        .post('/api/v1/admin/employee-sync/apply')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', buffer, 'test.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.data.errors).toEqual([]);

      const siteRes = await pool.query('SELECT id FROM sites WHERE client_id = $1 AND name = $2', [clientId, 'Bologna']);
      expect(siteRes.rows).toHaveLength(1);

      const empRes = await pool.query('SELECT site_id, assigned_sites FROM employees WHERE email = $1', [email]);
      expect(empRes.rows[0].site_id).toBe(siteRes.rows[0].id);
      expect(empRes.rows[0].assigned_sites).toEqual([siteRes.rows[0].id]);

      await pool.query('DELETE FROM employees WHERE email = $1', [email]);
    });

    it('preview never creates a site, even when the file declares one not yet in the DB', async () => {
      if (!dbAvailable) return;

      const email = uniqueEmail('nuova-sede-preview-test');
      const buffer = await buildFile(
        [['Nuovo Assunto', email, '', 'dipendente', 'Bologna', '', 'Attivo', '2026-07-01', '']],
        [['Bologna', 'Via Test 1', '', '', '']]
      );

      const token = tokenFor({ client_id: clientId, role: 'admin' });
      const res = await request(app)
        .post('/api/v1/admin/employee-sync/preview')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', buffer, 'test.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.data.errors).toEqual([]);
      expect(res.body.data.nuovi).toHaveLength(1);

      const siteRes = await pool.query('SELECT id FROM sites WHERE client_id = $1 AND name = $2', [clientId, 'Bologna']);
      expect(siteRes.rows).toHaveLength(0); // preview non deve MAI scrivere
    });

    it('rejects apply for a client the admin does not own (RBAC)', async () => {
      if (!dbAvailable) return;

      const otherClientId = await makeClient('admin-employeesync-apply-other-client');
      await makeSite(otherClientId, 'Torino');
      const email = uniqueEmail('rbac-apply-test');

      const buffer = await buildFile([
        ['Estraneo', email, '', 'dipendente', 'Torino', '', 'Attivo', '2026-07-01', ''],
      ]);

      // token is scoped to `clientId`, but the request tries to pass otherClientId
      // in the form body — for role 'admin', resolveTenantScope ignores it and
      // always operates on the admin's own client_id.
      const token = tokenFor({ client_id: clientId, role: 'admin' });
      const res = await request(app)
        .post('/api/v1/admin/employee-sync/apply')
        .set('Authorization', `Bearer ${token}`)
        .field('client_id', otherClientId)
        .attach('file', buffer, 'test.xlsx');

      expect(res.status).toBe(200);

      const otherCount = await countEmployees(otherClientId);
      expect(otherCount).toBe(0);

      await pool.query('DELETE FROM employees WHERE email = $1', [email]);
      await pool.query('DELETE FROM clients WHERE id = $1', [otherClientId]);
    });
  });

  describe('GET /api/v1/admin/employee-sync/export-history', () => {
    it('includes both active and deactivated employees with the correct Stato', async () => {
      if (!dbAvailable) return;

      const clientId = await makeClient('export-history-client');
      const activeEmail = uniqueEmail('export-active');
      const inactiveEmail = uniqueEmail('export-inactive');

      await pool.query(
        `INSERT INTO employees (client_id, email, name, role, active, hiring_date, password_hash)
         VALUES ($1, $2, 'Attivo Test', 'employee', true, '2026-01-01', 'x')`,
        [clientId, activeEmail]
      );
      await pool.query(
        `INSERT INTO employees (client_id, email, name, role, active, hiring_date, exit_date, password_hash)
         VALUES ($1, $2, 'Inattivo Test', 'employee', false, '2025-01-01', '2026-06-01', 'x')`,
        [clientId, inactiveEmail]
      );

      const token = tokenFor({ client_id: clientId, role: 'admin' });
      const res = await request(app)
        .get('/api/v1/admin/employee-sync/export-history')
        .set('Authorization', `Bearer ${token}`)
        .buffer(true)
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body);
      const ws = wb.getWorksheet('Storico Dipendenti');
      const emails = [];
      const rowsByEmail = {};
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const email = row.getCell(2).value;
        emails.push(email);
        rowsByEmail[email] = row.getCell(5).value;
      });

      expect(emails).toContain(activeEmail);
      expect(emails).toContain(inactiveEmail);
      expect(rowsByEmail[activeEmail]).toBe('Attivo');
      expect(rowsByEmail[inactiveEmail]).toBe('Inattivo');

      await pool.query('DELETE FROM employees WHERE client_id = $1', [clientId]);
      await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
    });
  });
});
