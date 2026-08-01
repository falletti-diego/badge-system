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

describe('GET /api/v1/admin/employee-sync/template', () => {
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
      console.warn(`[admin-employeeSync-template.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Admin EmployeeSync Template Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('admin-employeesync-template-client')]
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

  async function makeEmployee(clientId, name, { active = true, siteId = null, assignedSites = [], role = 'employee' } = {}) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, active, site_id, hiring_date)
       VALUES ($1, $2, $3, $4, $5::uuid[], $6, $7, '2024-01-10')
       RETURNING id`,
      [clientId, uniqueEmail('admin-employeesync-template-employee'), name, role, assignedSites, active, siteId]
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

  let clientId;

  beforeEach(async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('returns an xlsx with only active employees and existing sites for the client', async () => {
    if (!dbAvailable) return;

    const siteId = await makeSite(clientId, 'Sede Test Attiva');
    await makeEmployee(clientId, 'Dipendente Attivo', { active: true, siteId });
    await makeEmployee(clientId, 'Dipendente Disattivato', { active: false, siteId });

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .get('/api/v1/admin/employee-sync/template')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);

    const wsDip = wb.getWorksheet('Dipendenti');
    expect(wsDip).toBeDefined();
    const dipNames = [];
    wsDip.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      dipNames.push(row.getCell(1).value);
    });
    expect(dipNames).toContain('Dipendente Attivo');
    expect(dipNames).not.toContain('Dipendente Disattivato');

    const wsSedi = wb.getWorksheet('Sedi');
    expect(wsSedi).toBeDefined();
    const sedeNames = [];
    wsSedi.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      sedeNames.push(row.getCell(1).value);
    });
    expect(sedeNames).toContain('Sede Test Attiva');
  });

  it('fills the sede column from assigned_sites when site_id is null (typical employee row)', async () => {
    if (!dbAvailable) return;

    const siteId = await makeSite(clientId, 'Sede Solo Assigned');
    await makeEmployee(clientId, 'Dipendente Solo Assigned Sites', { active: true, siteId: null, assignedSites: [siteId] });

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .get('/api/v1/admin/employee-sync/template')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const wsDip = wb.getWorksheet('Dipendenti');
    let sedeForRow = null;
    wsDip.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (row.getCell(1).value === 'Dipendente Solo Assigned Sites') sedeForRow = row.getCell(5).value;
    });
    expect(sedeForRow).toBe('Sede Solo Assigned');
  });

  it('excludes admin/viewer accounts, which are not site-based staff and have no site to report', async () => {
    if (!dbAvailable) return;

    await makeEmployee(clientId, 'Account Admin Cliente', { active: true, role: 'admin' });
    await makeEmployee(clientId, 'Account Viewer Cliente', { active: true, role: 'viewer' });

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .get('/api/v1/admin/employee-sync/template')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const dipNames = [];
    wb.getWorksheet('Dipendenti').eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      dipNames.push(row.getCell(1).value);
    });
    expect(dipNames).not.toContain('Account Admin Cliente');
    expect(dipNames).not.toContain('Account Viewer Cliente');
  });

  it('rejects superadmin requests without an explicit client_id', async () => {
    if (!dbAvailable) return;

    const token = tokenFor({ client_id: clientId, role: 'superadmin' });
    const res = await request(app)
      .get('/api/v1/admin/employee-sync/template')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});
