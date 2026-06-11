'use strict';

/**
 * Tests for CSV export formats: Zucchetti and TeamSystem
 * Tests the formatter utility functions and the format=zucchetti|teamsystem query param
 */

const request = require('supertest');

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../utils/resolvers', () => ({
  resolveEmployeeId: jest.fn(async (id) => id),
  resolveSiteId: jest.fn(async (id) => id),
}));

jest.mock('../db/redis', () => ({
  deleteCacheByPattern: jest.fn(),
  redisClient: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('../middleware/rateLimiter', () => ({
  apiLimiter: (req, res, next) => next(),
  authLimiter: (req, res, next) => next(),
  csvLimiter: (req, res, next) => next(),
}));

const { pool } = require('../db/pool');

// Disable auth bypass so JWT role checks work
beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
afterAll(() => { process.env.DISABLE_AUTH = 'true'; });

// ─── Test JWT helpers ─────────────────────────────────────────────────────────

const jwt = require('jsonwebtoken');

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const ADMIN_TOKEN = makeToken({
  user_id: 'admin-uuid-001',
  client_id: '550e8400-e29b-41d4-a716-446655440001',
  role: 'admin',
  name: 'Admin Test',
});

const VIEWER_TOKEN = makeToken({
  user_id: 'viewer-uuid-001',
  client_id: '550e8400-e29b-41d4-a716-446655440001',
  role: 'viewer',
  name: 'Commercialista Test',
});

// ─── Sample check-in rows ─────────────────────────────────────────────────────

function makeRows() {
  return [
    {
      employee_name: 'Mario Rossi',
      employee_email: 'mario@test.it',
      matricola: '001',
      site_name: 'Torino Store',
      timestamp: new Date('2026-06-01T08:30:00.000Z'),
      type: 'IN',
      modified_at: null,
      modified_by: null,
    },
    {
      employee_name: 'Mario Rossi',
      employee_email: 'mario@test.it',
      matricola: '001',
      site_name: 'Torino Store',
      timestamp: new Date('2026-06-01T17:00:00.000Z'),
      type: 'OUT',
      modified_at: null,
      modified_by: null,
    },
    {
      employee_name: 'Anna Ferrari',
      employee_email: 'anna@test.it',
      matricola: '002',
      site_name: 'Torino Store',
      timestamp: new Date('2026-06-01T09:00:00.000Z'),
      type: 'IN',
      modified_at: null,
      modified_by: null,
    },
  ];
}

// ─── App ──────────────────────────────────────────────────────────────────────

const app = require('../app');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/export/csv — format param', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('defaults to generic format when format not specified', async () => {
    pool.query.mockResolvedValueOnce({ rows: makeRows().slice(0, 2), rowCount: 2 });

    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/presenze_/);
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toContain('Employee Name');
  });

  it('viewer role can access CSV export', async () => {
    pool.query.mockResolvedValueOnce({ rows: makeRows(), rowCount: 3 });

    const res = await request(app)
      .get('/api/v1/export/csv?format=zucchetti')
      .set('Authorization', `Bearer ${VIEWER_TOKEN}`);

    expect(res.status).toBe(200);
  });

  describe('format=zucchetti', () => {
    it('returns semicolon-delimited file with Zucchetti headers', async () => {
      pool.query.mockResolvedValueOnce({ rows: makeRows(), rowCount: 3 });

      const res = await request(app)
        .get('/api/v1/export/csv?format=zucchetti')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/zucchetti_/);
      const lines = res.text.trim().split('\n');
      expect(lines[0]).toContain('Matricola;Cognome;Nome;Data;OraEntrata;OraUscita;OreOrdinarie;OreStraordinarie');
    });

    it('groups IN/OUT pairs into one row per day per employee', async () => {
      pool.query.mockResolvedValueOnce({ rows: makeRows(), rowCount: 3 });

      const res = await request(app)
        .get('/api/v1/export/csv?format=zucchetti')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      const lines = res.text.trim().split('\n').filter(Boolean);
      // header + 1 row for Mario (has IN+OUT), Anna has only IN → skipped
      expect(lines.length).toBe(2);
      expect(lines[1]).toContain('001'); // matricola
      expect(lines[1]).toContain('Rossi'); // cognome
      expect(lines[1]).toContain('Mario'); // nome
    });

    it('formats date as DD/MM/YYYY', async () => {
      pool.query.mockResolvedValueOnce({ rows: makeRows().slice(0, 2), rowCount: 2 });

      const res = await request(app)
        .get('/api/v1/export/csv?format=zucchetti')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      const lines = res.text.trim().split('\n');
      expect(lines[1]).toContain('01/06/2026');
    });

    it('calculates OreOrdinarie and OreStraordinarie (8h threshold)', async () => {
      // Mario works 8.5h (08:30 to 17:00 = 8.5h)
      pool.query.mockResolvedValueOnce({ rows: makeRows().slice(0, 2), rowCount: 2 });

      const res = await request(app)
        .get('/api/v1/export/csv?format=zucchetti')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      const dataLine = res.text.trim().split('\n')[1];
      // 8.5h: OreOrdinarie=8,00 OreStraordinarie=0,30
      expect(dataLine).toContain('8,00');
      expect(dataLine).toContain('0,30');
    });

    it('omits rows where employee has no OUT (open presence)', async () => {
      pool.query.mockResolvedValueOnce({ rows: [makeRows()[2]], rowCount: 1 }); // only Anna IN

      const res = await request(app)
        .get('/api/v1/export/csv?format=zucchetti')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      const lines = res.text.trim().split('\n').filter(Boolean);
      // Only header, no data rows
      expect(lines.length).toBe(1);
    });

    it('uses empty string for matricola when not set', async () => {
      const rowsNoMatricola = makeRows().slice(0, 2).map(r => ({ ...r, matricola: null }));
      pool.query.mockResolvedValueOnce({ rows: rowsNoMatricola, rowCount: 2 });

      const res = await request(app)
        .get('/api/v1/export/csv?format=zucchetti')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      const lines = res.text.trim().split('\n');
      // First field (matricola) should be empty
      expect(lines[1].startsWith(';')).toBe(true);
    });
  });

  describe('format=teamsystem', () => {
    it('returns semicolon-delimited file with TeamSystem headers', async () => {
      pool.query.mockResolvedValueOnce({ rows: makeRows(), rowCount: 3 });

      const res = await request(app)
        .get('/api/v1/export/csv?format=teamsystem')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/teamsystem_/);
      const lines = res.text.trim().split('\n');
      expect(lines[0]).toContain('Matricola;Data;Tipo;Ora');
    });

    it('generates one row per timbratura with E for IN and U for OUT', async () => {
      pool.query.mockResolvedValueOnce({ rows: makeRows(), rowCount: 3 });

      const res = await request(app)
        .get('/api/v1/export/csv?format=teamsystem')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      const lines = res.text.trim().split('\n').filter(Boolean);
      // header + 3 rows (Mario IN, Mario OUT, Anna IN)
      expect(lines.length).toBe(4);

      // First row: Mario IN → tipo E
      expect(lines[1]).toContain(';E;');
      // Second row: Mario OUT → tipo U
      expect(lines[2]).toContain(';U;');
    });

    it('formats date as DD/MM/YYYY', async () => {
      pool.query.mockResolvedValueOnce({ rows: [makeRows()[0]], rowCount: 1 });

      const res = await request(app)
        .get('/api/v1/export/csv?format=teamsystem')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      const lines = res.text.trim().split('\n');
      expect(lines[1]).toContain('01/06/2026');
    });

    it('formats time as HH:MM', async () => {
      pool.query.mockResolvedValueOnce({ rows: [makeRows()[0]], rowCount: 1 });

      const res = await request(app)
        .get('/api/v1/export/csv?format=teamsystem')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      const lines = res.text.trim().split('\n');
      expect(lines[1]).toMatch(/\d{2}:\d{2}$/);
    });
  });

  it('returns 400 for invalid format value', async () => {
    const res = await request(app)
      .get('/api/v1/export/csv?format=invalid')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(400);
  });
});
