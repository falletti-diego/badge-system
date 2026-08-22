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
      [clientId, name, `QR_${name}_${Date.now()}_${Math.random().toString(36).slice(2)}`]
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
    ws.addRow(['nome_completo', 'email', 'telefono', 'ruolo', 'sede', 'matricola', 'stato', 'data_assunzione', 'data_uscita', 'manager_email']);
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

  // Dal 2026-08-19 un nuovo dipendente nel wizard richiede manager_email
  // valorizzato su un manager attivo della stessa sede — vedi computeDiff.js.
  async function makeManager(clientId, siteId, email) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, site_id, assigned_sites)
       VALUES ($1, $2, 'Manager Preview Test', 'manager', $3, ARRAY[$3]::uuid[])
       RETURNING id`,
      [clientId, email, siteId]
    );
    return result.rows[0].id;
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

    const torinoId = await makeSite(clientId, 'Torino');
    const managerEmail = uniqueEmail('preview-manager');
    await makeManager(clientId, torinoId, managerEmail);
    const before = await countEmployees(clientId);

    const buffer = await buildFile([
      ['Nuovo Assunto', 'nuovo-preview-test@x.it', '', 'dipendente', 'Torino', '', 'Attivo', '2026-07-01', '', managerEmail],
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

  it('does not flag an admin/viewer account as an anomalia — they are out of scope for this wizard', async () => {
    if (!dbAvailable) return;

    await makeSite(clientId, 'Torino');
    await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, active)
       VALUES ($1, $2, 'Account Admin', 'admin', '{}', true)`,
      [clientId, uniqueEmail('admin-employeesync-preview-adminacct')]
    );

    const buffer = await buildFile([]); // file vuoto, nessun dipendente operativo dichiarato

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/employee-sync/preview')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'test.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.anomalie).toEqual([]);
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

  it('flags manager_email that does not match any existing manager for the client', async () => {
    if (!dbAvailable) return;

    await makeSite(clientId, 'Torino');

    const buffer = await buildFile([
      ['Dipendente Con Manager', 'con-manager-preview-test@x.it', '', 'dipendente', 'Torino', '', 'Attivo', '2026-07-01', '', 'manager-inesistente@x.it'],
    ]);

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/employee-sync/preview')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'test.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.errors.some((e) => e.includes('manager-inesistente@x.it'))).toBe(true);
    expect(res.body.data.nuovi).toEqual([]);
  });

  it('accepts manager_email that matches an existing manager for the client', async () => {
    if (!dbAvailable) return;

    const siteId = await makeSite(clientId, 'Torino');
    const managerEmail = uniqueEmail('admin-employeesync-preview-manager');
    await pool.query(
      `INSERT INTO employees (client_id, email, name, role, site_id, assigned_sites, active)
       VALUES ($1, $2, 'Manager Esistente', 'manager', $3, $4, true)`,
      [clientId, managerEmail, siteId, [siteId]]
    );

    const buffer = await buildFile([
      ['Dipendente Con Manager', 'con-manager-valido-preview-test@x.it', '', 'dipendente', 'Torino', '', 'Attivo', '2026-07-01', '', managerEmail],
    ]);

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/employee-sync/preview')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'test.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.errors).toEqual([]);
    expect(res.body.data.nuovi).toHaveLength(1);
  });

  it('accepts manager_email matching an existing manager whose DB email is mixed-case', async () => {
    if (!dbAvailable) return;

    const siteId = await makeSite(clientId, 'Torino');
    // Simula un manager creato via form admin, dove l'email non ha alcuna
    // garanzia di essere lowercase (nessun .toLowerCase() nello schema Zod,
    // nessun vincolo DB) — vedi contratto documentato in validate.js:
    // existingManagerEmails deve contenere email lowercased perché
    // manager_email nel foglio Excel è sempre normalizzato lowercase da
    // parseTemplate.js (normEmail).
    const mixedCaseManagerEmail = `Manager-${Date.now()}-${Math.random().toString(36).slice(2)}@Example.IT`;
    await pool.query(
      `INSERT INTO employees (client_id, email, name, role, site_id, assigned_sites, active)
       VALUES ($1, $2, 'Manager Mixed Case', 'manager', $3, $4, true)`,
      [clientId, mixedCaseManagerEmail, siteId, [siteId]]
    );

    const buffer = await buildFile([
      ['Dipendente Con Manager Mixed Case', 'con-manager-mixedcase-preview-test@x.it', '', 'dipendente', 'Torino', '', 'Attivo', '2026-07-01', '', mixedCaseManagerEmail.toLowerCase()],
    ]);

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/employee-sync/preview')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'test.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.errors).toEqual([]);
    expect(res.body.data.nuovi).toHaveLength(1);
  });

  it('rejects manager_email pointing to a DEACTIVATED manager, same error channel as an unknown manager_email', async () => {
    if (!dbAvailable) return;

    const siteId = await makeSite(clientId, 'Torino');
    const managerEmail = uniqueEmail('admin-employeesync-preview-inactive-manager');
    await pool.query(
      `INSERT INTO employees (client_id, email, name, role, site_id, assigned_sites, active)
       VALUES ($1, $2, 'Manager Disattivato', 'manager', $3, $4, false)`,
      [clientId, managerEmail, siteId, [siteId]]
    );

    const buffer = await buildFile([
      ['Dipendente Con Manager Disattivato', 'con-manager-inattivo-preview-test@x.it', '', 'dipendente', 'Torino', '', 'Attivo', '2026-07-01', '', managerEmail],
    ]);

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/employee-sync/preview')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'test.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.errors.some((e) => e.includes(managerEmail))).toBe(true);
    expect(res.body.data.nuovi).toEqual([]);
  });

  it('rejects manager_email pointing to a manager on a DIFFERENT site', async () => {
    if (!dbAvailable) return;

    await makeSite(clientId, 'Torino');
    const milanoSiteId = await makeSite(clientId, 'Milano');
    const managerEmail = uniqueEmail('admin-employeesync-preview-wrongsite-manager');
    await pool.query(
      `INSERT INTO employees (client_id, email, name, role, site_id, assigned_sites, active)
       VALUES ($1, $2, 'Manager Milano', 'manager', $3, $4, true)`,
      [clientId, managerEmail, milanoSiteId, [milanoSiteId]]
    );

    const buffer = await buildFile(
      [['Dipendente Torino Con Manager Milano', 'con-manager-wrongsite-preview-test@x.it', '', 'dipendente', 'Torino', '', 'Attivo', '2026-07-01', '', managerEmail]],
      [['Torino', '', '', '', ''], ['Milano', '', '', '', '']]
    );

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/employee-sync/preview')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'test.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.errors.some((e) => e.includes(managerEmail))).toBe(true);
    expect(res.body.data.nuovi).toEqual([]);
  });

  it('handles a file that is not a valid xlsx with a clear error, not a 500 crash', async () => {
    if (!dbAvailable) return;

    const token = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .post('/api/v1/admin/employee-sync/preview')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('not,a,real,xlsx,file\n1,2,3,4,5'), 'test.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.errors.length).toBeGreaterThan(0);
  });
});
