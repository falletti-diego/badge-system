/**
 * Tests: Export API — GET /api/export/csv
 * Pool is mocked. Real JWT tokens for role-based RBAC tests.
 */

jest.mock('../middleware/rateLimiter', () => {
  const passThrough = (req, res, next) => next();
  return { apiLimiter: passThrough, authLimiter: passThrough, csvLimiter: passThrough };
});

jest.mock('../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../db/redis', () => ({
  initializeRedis: jest.fn().mockResolvedValue(null),
  closeRedis: jest.fn().mockResolvedValue(undefined),
  isRedisAvailable: jest.fn().mockReturnValue(false),
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  deleteCacheByPattern: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { pool } = require('../db/pool');

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const SITE_ID   = '550e8400-e29b-41d4-a716-446655440010';
const OTHER_SITE = '550e8400-e29b-41d4-a716-446655440099';
const EMP_ID    = '550e8400-e29b-41d4-a716-446655440100';

beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
afterAll(() => {
  process.env.DISABLE_AUTH = 'true';
  jest.clearAllMocks();
});
beforeEach(() => { jest.clearAllMocks(); });

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const adminToken    = () => signToken({ user_id: 'admin-1', client_id: CLIENT_ID, role: 'admin' });
const managerToken  = () => signToken({ user_id: 'mgr-1',   client_id: CLIENT_ID, role: 'manager', site_id: SITE_ID });
const employeeToken = () => signToken({ user_id: 'emp-1',   client_id: CLIENT_ID, role: 'employee', employee_id: EMP_ID });

const SAMPLE_ROWS = [
  {
    employee_name: 'Mario Rossi',
    employee_email: 'mario@test.com',
    site_name: 'Torino Store',
    timestamp: new Date('2026-06-01T09:00:00Z'),
    type: 'IN',
    modified_at: null,
    modified_by: null,
  },
  {
    employee_name: 'Mario Rossi',
    employee_email: 'mario@test.com',
    site_name: 'Torino Store',
    timestamp: new Date('2026-06-01T18:00:00Z'),
    type: 'OUT',
    modified_at: null,
    modified_by: null,
  },
];

// =====================================================
// GET /api/export/csv — RBAC
// =====================================================

describe('GET /api/export/csv — RBAC', () => {
  test('employee role → 403', async () => {
    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${employeeToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_ROLE');
  });

  test('no token → 401', async () => {
    const res = await request(app).get('/api/v1/export/csv');
    expect(res.status).toBe(401);
  });

  test('manager trying to export different site → 403', async () => {
    // resolvedSiteId (OTHER_SITE as UUID) !== managerToken site_id (SITE_ID)
    const res = await request(app)
      .get(`/api/v1/export/csv?site_id=${OTHER_SITE}`)
      .set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_SITE');
  });
});

// =====================================================
// GET /api/export/csv — Happy paths
// =====================================================

describe('GET /api/export/csv — success', () => {
  test('admin gets CSV with all checkins → text/csv response', async () => {
    pool.query.mockResolvedValueOnce({ rows: SAMPLE_ROWS });

    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment.*\.csv/);
    expect(res.headers['x-total-count']).toBe('2');
    expect(res.text).toContain('Employee Name');
    expect(res.text).toContain('Mario Rossi');
    expect(res.text).toContain('IN');
  });

  test('admin gets CSV with date filters', async () => {
    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_ROWS[0]] });

    const res = await request(app)
      .get('/api/v1/export/csv?date_from=2026-06-01&date_to=2026-06-30')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.headers['x-total-count']).toBe('1');
  });

  test('manager exports their own site → scoped to site_id', async () => {
    pool.query.mockResolvedValueOnce({ rows: SAMPLE_ROWS });

    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${managerToken()}`);

    expect(res.status).toBe(200);
    // Verify that the pool.query was called with manager's site_id in params
    const [, params] = pool.query.mock.calls[0];
    expect(params).toContain(SITE_ID);
  });

  test('empty result → empty CSV with headers only', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.headers['x-total-count']).toBe('0');
    expect(res.text).toContain('Employee Name');
  });

  test('truncated result → X-Truncated: true header', async () => {
    // Return 50001 rows to trigger truncation (LIMIT 50001 → slice to 50000)
    const manyRows = Array.from({ length: 50001 }, (_, i) => ({
      employee_name: `Emp ${i}`,
      employee_email: `emp${i}@test.com`,
      site_name: 'Torino Store',
      timestamp: new Date(),
      type: i % 2 === 0 ? 'IN' : 'OUT',
      modified_at: null,
      modified_by: null,
    }));
    pool.query.mockResolvedValueOnce({ rows: manyRows });

    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.headers['x-truncated']).toBe('true');
    expect(res.headers['x-total-count']).toBe('50000');
  });

  test('admin filters by employee_id UUID directly', async () => {
    pool.query.mockResolvedValueOnce({ rows: [SAMPLE_ROWS[0]] });

    const res = await request(app)
      .get(`/api/v1/export/csv?employee_id=${EMP_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    const [, params] = pool.query.mock.calls[0];
    expect(params).toContain(EMP_ID);
  });
});

// =====================================================
// escapeCsvField — formula injection prevention
// =====================================================

describe('escapeCsvField — formula injection via CSV content', () => {
  test('fields starting with = are prefixed with single quote in output', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        employee_name: '=HYPERLINK("evil.com","click")',
        employee_email: 'attacker@test.com',
        site_name: 'Torino Store',
        timestamp: new Date(),
        type: 'IN',
        modified_at: null,
        modified_by: null,
      }],
    });

    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    // The = formula should be escaped with a leading single quote
    expect(res.text).toContain('\'=HYPERLINK');
  });

  test('fields starting with + are escaped', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        employee_name: '+cmd|/C calc',
        employee_email: 'attacker@test.com',
        site_name: 'Site',
        timestamp: new Date(),
        type: 'IN',
        modified_at: null,
        modified_by: null,
      }],
    });

    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain('\'+cmd');
  });
});
