'use strict';

/**
 * Integration tests: POST /api/v1/admin/onboarding/{preview,apply} (Task 7,
 * onboarding self-service). Real-Postgres, stesso pattern di
 * admin-clients-scoping.test.js — righe reali via SQL, SES mockata.
 */

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');

const mockSend = jest.fn().mockResolvedValue({ MessageId: 'test' });
jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  SendEmailCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('POST /api/v1/admin/onboarding/{preview,apply}', () => {
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
      console.warn(`[admin-onboarding.test] Skipping — could not connect: ${err.message}`);
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

  async function makeClient(email) {
    const result = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Onboarding Wizard Test Co', $1, 'starter', false)
       RETURNING id`,
      [email]
    );
    return result.rows[0].id;
  }

  function tokenFor({ client_id, role }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign({ user_id: 'test-user', client_id, role, name: 'Test Admin' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
  }

  /** Costruisce un workbook .xlsx in memoria con lo schema atteso da parseWorkbook.js. */
  async function buildWorkbook({ email_referente, siteName = 'Sede Test', employeeSite = null }) {
    const wb = new ExcelJS.Workbook();

    const azienda = wb.addWorksheet('Azienda');
    azienda.addRow(['ragione_sociale', 'email_referente', 'ore_min_buono_pasto']);
    azienda.addRow(['Onboarding Wizard Test Co', email_referente, 5]);

    const sedi = wb.addWorksheet('Sedi');
    sedi.addRow(['nome_sede', 'indirizzo', 'latitudine', 'longitudine', 'raggio_geofence_m']);
    sedi.addRow([siteName, 'Via Test 1', '', '', '']);

    const dip = wb.addWorksheet('Dipendenti');
    dip.addRow(['nome_completo', 'email', 'telefono', 'ruolo', 'sede', 'matricola', 'ferie_giorni', 'permessi_giorni', 'exfestivita_giorni']);
    dip.addRow(['Mario Rossi', uniqueEmail('wizard-emp'), '', 'dipendente', employeeSite ?? siteName, '', 20, 8, 4]);

    return wb.xlsx.writeBuffer();
  }

  let clientId, clientEmail;

  beforeEach(async () => {
    mockSend.mockClear();
    if (!dbAvailable) return;
    clientEmail = uniqueEmail('onboarding-wizard-client');
    clientId = await makeClient(clientEmail);
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM leave_saldi WHERE client_id = $1', [clientId]);
    await pool.query('DELETE FROM employees WHERE client_id = $1', [clientId]);
    await pool.query('DELETE FROM sites WHERE client_id = $1', [clientId]);
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('preview with a valid Excel returns a diff and writes nothing to the DB', async () => {
    if (!dbAvailable) return;
    const buffer = await buildWorkbook({ email_referente: clientEmail });
    const token = tokenFor({ client_id: clientId, role: 'admin' });

    const res = await request(app)
      .post('/api/v1/admin/onboarding/preview')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'onboarding.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.errors).toEqual([]);
    expect(res.body.data.summary.dipendenti_creati).toBe(1);
    expect(res.body.data.summary.sedi).toBe(1);

    const employees = await pool.query('SELECT * FROM employees WHERE client_id = $1', [clientId]);
    const sites = await pool.query('SELECT * FROM sites WHERE client_id = $1', [clientId]);
    expect(employees.rows).toHaveLength(0);
    expect(sites.rows).toHaveLength(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('preview with a missing site reports the error, writes nothing', async () => {
    if (!dbAvailable) return;
    const buffer = await buildWorkbook({ email_referente: clientEmail, employeeSite: 'Sede Inesistente' });
    const token = tokenFor({ client_id: clientId, role: 'admin' });

    const res = await request(app)
      .post('/api/v1/admin/onboarding/preview')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'onboarding.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.errors.some((e) => e.includes('Sede Inesistente'))).toBe(true);

    const employees = await pool.query('SELECT * FROM employees WHERE client_id = $1', [clientId]);
    expect(employees.rows).toHaveLength(0);
  });

  it('apply creates rows and sends a welcome email only to the new employee', async () => {
    if (!dbAvailable) return;
    const buffer = await buildWorkbook({ email_referente: clientEmail });
    const token = tokenFor({ client_id: clientId, role: 'admin' });

    const res = await request(app)
      .post('/api/v1/admin/onboarding/apply')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'onboarding.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.summary.dipendenti_creati).toBe(1);
    expect(res.body.data.failedEmails).toEqual([]);
    expect(mockSend).toHaveBeenCalledTimes(1);

    const employees = await pool.query('SELECT * FROM employees WHERE client_id = $1', [clientId]);
    expect(employees.rows).toHaveLength(1);
    expect(employees.rows[0].must_change_password).toBe(true);
  });

  it('apply commits data even if the welcome email fails to send, reports it in failedEmails', async () => {
    if (!dbAvailable) return;
    mockSend.mockRejectedValueOnce(new Error('SES throttled'));
    const buffer = await buildWorkbook({ email_referente: clientEmail });
    const token = tokenFor({ client_id: clientId, role: 'admin' });

    const res = await request(app)
      .post('/api/v1/admin/onboarding/apply')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'onboarding.xlsx');

    expect(res.status).toBe(200); // mai un 500 per un problema email
    expect(res.body.data.failedEmails).toHaveLength(1);

    const employees = await pool.query('SELECT * FROM employees WHERE client_id = $1', [clientId]);
    expect(employees.rows).toHaveLength(1); // dati comunque commitati
    // failedEmails include l'id dipendente (non solo l'email), necessario al
    // frontend per proporre "Rigenera credenziali" senza ri-eseguire l'import.
    expect(res.body.data.failedEmails[0]).toEqual({
      id: employees.rows[0].id,
      email: employees.rows[0].email,
    });
  });

  it('admin gets 403 without ADMIN_REQUIRED role', async () => {
    if (!dbAvailable) return;
    const buffer = await buildWorkbook({ email_referente: clientEmail });
    const token = tokenFor({ client_id: clientId, role: 'employee' });

    const res = await request(app)
      .post('/api/v1/admin/onboarding/preview')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'onboarding.xlsx');

    expect(res.status).toBe(403);
  });
});
