'use strict';

/**
 * Integration tests for RBAC on GET /api/checkins and GET /api/export/csv (S.32.2)
 * Uses real RS256 tokens with different claims to verify fail-closed behavior
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../db/pool', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../db/redis', () => ({
  deleteCacheByPattern: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../middleware/rateLimiter', () => ({
  apiLimiter: (req, res, next) => next(),
  authLimiter: (req, res, next) => next(),
  csvLimiter: (req, res, next) => next(),
  demoStartLimiter: (req, res, next) => next(),
}));

const { pool } = require('../db/pool');
const app = require('../app');

// Disable global DISABLE_AUTH so JWT role checks work
beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
afterAll(() => { process.env.DISABLE_AUTH = 'true'; });

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const SITE_ID_A = '550e8400-e29b-41d4-a716-446655440012';
const SITE_ID_B = 'e1337fab-ba3f-4332-bb06-57c9df15b067';
const EMP_ID_A = '550e8400-e29b-41d4-a716-446655440100';
const EMP_ID_B = '239ec99f-3204-45ca-bce2-793f52442ec6';

// Tokens
const tokenEmpWithId = makeToken({ user_id: EMP_ID_A, client_id: CLIENT_ID, role: 'employee', employee_id: EMP_ID_A });
const tokenEmpNoId = makeToken({ user_id: 'emp-without-id', client_id: CLIENT_ID, role: 'employee' });
const tokenMgrWithSiteA = makeToken({ user_id: 'mgr-1', client_id: CLIENT_ID, role: 'manager', site_id: SITE_ID_A });
const tokenMgrWithSiteB = makeToken({ user_id: 'mgr-2', client_id: CLIENT_ID, role: 'manager', site_id: SITE_ID_B });
const tokenMgrNoSite = makeToken({ user_id: 'mgr-3', client_id: CLIENT_ID, role: 'manager' });
const tokenAdmin = makeToken({ user_id: 'admin-1', client_id: CLIENT_ID, role: 'admin' });

function mockPoolQuerySuccess(rows = []) {
  pool.query.mockImplementation((sql) => {
    const s = sql.trim().toUpperCase();
    if (s.startsWith('BEGIN') || s.startsWith('COMMIT') || s.startsWith('ROLLBACK')) return Promise.resolve({ rows: [] });
    if (s.includes('COUNT(*)')) return Promise.resolve({ rows: [{ total: '0' }] });
    if (s.includes('SELECT') && s.includes('CHECKINS')) return Promise.resolve({ rows: rows || [] });
    return Promise.resolve({ rows: [] });
  });
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/checkins — RBAC with buildScopedFilters (S.32.2)', () => {
  it('employee with employee_id → 200 OK', async () => {
    mockPoolQuerySuccess();
    const res = await request(app)
      .get('/api/v1/checkins')
      .set('Authorization', `Bearer ${tokenEmpWithId}`);
    expect(res.status).toBe(200);
  });

  it('employee without employee_id → 403 NO_EMPLOYEE_PROFILE', async () => {
    const res = await request(app)
      .get('/api/v1/checkins')
      .set('Authorization', `Bearer ${tokenEmpNoId}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NO_EMPLOYEE_PROFILE');
  });

  it('manager with site_id → 200 OK', async () => {
    mockPoolQuerySuccess();
    const res = await request(app)
      .get('/api/v1/checkins')
      .set('Authorization', `Bearer ${tokenMgrWithSiteA}`);
    expect(res.status).toBe(200);
  });

  it('manager without site_id → 403 NO_SITE_ASSIGNED', async () => {
    const res = await request(app)
      .get('/api/v1/checkins')
      .set('Authorization', `Bearer ${tokenMgrNoSite}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NO_SITE_ASSIGNED');
  });

  it('manager filtering for own site → 200 OK', async () => {
    mockPoolQuerySuccess();
    const res = await request(app)
      .get(`/api/v1/checkins?site_id=${SITE_ID_A}`)
      .set('Authorization', `Bearer ${tokenMgrWithSiteA}`);
    expect(res.status).toBe(200);
  });

  it('manager filtering for other site → 403 FORBIDDEN_SITE', async () => {
    const res = await request(app)
      .get(`/api/v1/checkins?site_id=${SITE_ID_B}`)
      .set('Authorization', `Bearer ${tokenMgrWithSiteA}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_SITE');
  });

  it('admin with any filter → 200 OK', async () => {
    mockPoolQuerySuccess();
    const res = await request(app)
      .get(`/api/v1/checkins?site_id=${SITE_ID_A}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/export/csv — RBAC with buildScopedFilters (S.32.2)', () => {
  it('employee without employee_id → 403 FORBIDDEN_ROLE', async () => {
    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${tokenEmpNoId}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_ROLE');
  });

  it('manager without site_id → 403 NO_SITE_ASSIGNED', async () => {
    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${tokenMgrNoSite}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NO_SITE_ASSIGNED');
  });

  it('manager with site_id → 200 OK', async () => {
    mockPoolQuerySuccess();
    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${tokenMgrWithSiteA}`);
    expect(res.status).toBe(200);
  });

  it('admin → 200 OK', async () => {
    mockPoolQuerySuccess();
    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
  });
});
