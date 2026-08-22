'use strict';

// Verifica isolata (email mockata, non SES reale) che /apply scelga il
// template email giusto in base al tipo di credenziale restituita da
// applyDiff: "welcome" per un nuovo assunto, "bentornato" (con reset
// password) per un dipendente riattivato. admin-employeeSync-apply.test.js
// copre già il resto del comportamento di /apply senza mockare l'email.

const mockSendEmail = jest.fn().mockResolvedValue(undefined);
jest.mock('../utils/email', () => {
  const actual = jest.requireActual('../utils/email');
  return { ...actual, sendEmail: mockSendEmail };
});

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

describe('POST /api/v1/admin/employee-sync/apply — email di riattivazione', () => {
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
      console.warn(`[admin-employeeSync-apply-reactivation-email.test] Skipping — could not connect: ${err.message}`);
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

  beforeEach(() => {
    mockSendEmail.mockClear();
  });

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  async function makeClient() {
    const result = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Admin EmployeeSync Reactivation Email Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('admin-employeesync-reactivation-email-client')]
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

  // Dal 2026-08-19 un nuovo dipendente nel wizard richiede manager_email
  // valorizzato su un manager attivo della stessa sede — vedi computeDiff.js.
  async function makeManager(clientId, siteId, email) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, site_id, assigned_sites)
       VALUES ($1, $2, 'Manager Reactivation Test', 'manager', $3, ARRAY[$3]::uuid[])
       RETURNING id`,
      [clientId, email, siteId]
    );
    return result.rows[0].id;
  }

  it('sends a "bentornato" email (not the first-time welcome one) when reactivating an employee', async () => {
    if (!dbAvailable) return;

    const clientId = await makeClient();
    const torinoId = await makeSite(clientId, 'Torino');
    const managerEmail = uniqueEmail('reactivation-manager');
    await makeManager(clientId, torinoId, managerEmail);
    const email = uniqueEmail('riattivato-email-test');
    const token = tokenFor({ client_id: clientId, role: 'admin' });

    // 1. Crea il dipendente (nuovo -> email di benvenuto "creato").
    const createBuffer = await buildFile([
      ['Da Riattivare', email, '', 'dipendente', 'Torino', '', 'Attivo', '2026-01-01', '', managerEmail],
    ]);
    await request(app).post('/api/v1/admin/employee-sync/apply').set('Authorization', `Bearer ${token}`).attach('file', createBuffer, 'test.xlsx');
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0].text).toMatch(/creato/i);
    mockSendEmail.mockClear();

    // 2. Disattiva il dipendente (Stato=Inattivo esplicito nel file — la sola
    // omissione della riga sarebbe un'"anomalia", non una rimozione).
    const removeBuffer = await buildFile([
      ['Da Riattivare', email, '', 'dipendente', 'Torino', '', 'Inattivo', '2026-01-01', '2026-08-01'],
    ]);
    await request(app).post('/api/v1/admin/employee-sync/apply').set('Authorization', `Bearer ${token}`).attach('file', removeBuffer, 'test.xlsx');
    expect(mockSendEmail).not.toHaveBeenCalled();

    // 3. Riattiva lo stesso dipendente -> email "bentornato", non "creato".
    // manager_email non è obbligatorio qui (dipendente già esistente, ramo
    // "riattivati" — grandfathered, non "nuovi"), ma lo includiamo comunque
    // per realismo.
    const reactivateBuffer = await buildFile([
      ['Da Riattivare', email, '', 'dipendente', 'Torino', '', 'Attivo', '2026-01-01', '', managerEmail],
    ]);
    const res = await request(app).post('/api/v1/admin/employee-sync/apply').set('Authorization', `Bearer ${token}`).attach('file', reactivateBuffer, 'test.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.riattivati).toHaveLength(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const sentEmail = mockSendEmail.mock.calls[0][0];
    expect(sentEmail.to).toBe(email);
    expect(sentEmail.text).toMatch(/riattivat/i);
    expect(sentEmail.text).not.toMatch(/creato/i);

    await pool.query('DELETE FROM employees WHERE email = $1', [email]);
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });
});
