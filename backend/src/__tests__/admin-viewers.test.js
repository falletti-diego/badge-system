'use strict';

/**
 * Tests for viewer (commercialista) account management
 * POST /api/admin/viewers — create viewer account
 * GET  /api/admin/viewers — list viewer accounts
 * RBAC: viewer can access presences, cannot access corrections/admin
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock('../db/redis', () => ({
  deleteCacheByPattern: jest.fn(),
  redisClient: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('../middleware/rateLimiter', () => ({
  apiLimiter: (req, res, next) => next(),
  authLimiter: (req, res, next) => next(),
  csvLimiter: (req, res, next) => next(),
  demoStartLimiter: (req, res, next) => next(),
}));

jest.mock('../auth/password', () => ({
  hashPassword: jest.fn(async () => '$2b$12$fakehash'),
  verifyPassword: jest.fn(async () => true),
}));

const { pool } = require('../db/pool');

// Disable auth bypass so JWT role checks work
beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
afterAll(() => { process.env.DISABLE_AUTH = 'true'; });

// ─── Token helpers ────────────────────────────────────────────────────────────

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const SITE_ID   = '550e8400-e29b-41d4-a716-446655440010';

const ADMIN_TOKEN = makeToken({ user_id: 'admin-uuid-1', client_id: CLIENT_ID, role: 'admin', name: 'Admin' });
const MANAGER_TOKEN = makeToken({ user_id: 'mgr-uuid-1', client_id: CLIENT_ID, role: 'manager', site_id: SITE_ID, name: 'Manager' });
const VIEWER_TOKEN = makeToken({ user_id: 'viewer-uuid-1', client_id: CLIENT_ID, role: 'viewer', name: 'Commercialista' });

const app = require('../app');

// ─── POST /api/admin/viewers ──────────────────────────────────────────────────

describe('POST /api/admin/viewers', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('admin creates viewer → 201 with temp_password', async () => {
    pool.query
      .mockResolvedValueOnce({ rowCount: 1 }) // client check
      .mockResolvedValueOnce({
        rows: [{
          id: 'viewer-new-uuid',
          client_id: CLIENT_ID,
          email: 'commercialista@studio.it',
          name: 'Mario Bianchi',
          role: 'viewer',
          created_at: new Date().toISOString(),
        }],
      }); // INSERT
    // logAudit best-effort
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/v1/admin/viewers')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ client_id: CLIENT_ID, email: 'commercialista@studio.it', name: 'Mario Bianchi' });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('viewer');
    expect(typeof res.body.temp_password).toBe('string');
    expect(res.body.temp_password.length).toBeGreaterThan(6);
  });

  it('manager cannot create viewer → 403', async () => {
    const res = await request(app)
      .post('/api/v1/admin/viewers')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`)
      .send({ client_id: CLIENT_ID, email: 'x@test.it', name: 'Test' });

    expect(res.status).toBe(403);
  });

  it('viewer cannot create viewer → 403', async () => {
    const res = await request(app)
      .post('/api/v1/admin/viewers')
      .set('Authorization', `Bearer ${VIEWER_TOKEN}`)
      .send({ client_id: CLIENT_ID, email: 'x@test.it', name: 'Test' });

    expect(res.status).toBe(403);
  });

  it('no token → 401', async () => {
    const res = await request(app)
      .post('/api/v1/admin/viewers')
      .send({ client_id: CLIENT_ID, email: 'x@test.it', name: 'Test' });

    expect(res.status).toBe(401);
  });

  it('missing required fields → 400', async () => {
    const res = await request(app)
      .post('/api/v1/admin/viewers')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ client_id: CLIENT_ID }); // missing email and name

    expect(res.status).toBe(400);
  });

  it('client not found → 400', async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0 }); // client check fails

    const res = await request(app)
      .post('/api/v1/admin/viewers')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ client_id: CLIENT_ID, email: 'x@test.it', name: 'Test' });

    expect(res.status).toBe(400);
  });

  it('duplicate email → 400', async () => {
    pool.query
      .mockResolvedValueOnce({ rowCount: 1 }) // client check OK
      .mockRejectedValueOnce({ code: '23505' }); // unique violation

    const res = await request(app)
      .post('/api/v1/admin/viewers')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ client_id: CLIENT_ID, email: 'dup@test.it', name: 'Dup' });

    expect(res.status).toBe(400);
  });
});

// ─── GET /api/admin/viewers ───────────────────────────────────────────────────

describe('GET /api/admin/viewers', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('admin gets viewer list → 200', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 'v1', client_id: CLIENT_ID, email: 'a@b.it', name: 'A B', role: 'viewer', created_at: new Date().toISOString(), client_name: 'Acme' },
      ],
    });

    const res = await request(app)
      .get('/api/v1/admin/viewers')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].role).toBe('viewer');
  });

  it('manager → 403', async () => {
    const res = await request(app)
      .get('/api/v1/admin/viewers')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`);

    expect(res.status).toBe(403);
  });
});

// ─── RBAC for viewer role ─────────────────────────────────────────────────────

describe('viewer RBAC', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('viewer can access GET /api/checkins → 200', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })          // main query
      .mockResolvedValueOnce({ rows: [{ total: '0' }] });        // count query

    const res = await request(app)
      .get('/api/v1/checkins')
      .set('Authorization', `Bearer ${VIEWER_TOKEN}`);

    expect(res.status).toBe(200);
  });

  it('viewer can access GET /api/export/csv → 200', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/api/v1/export/csv')
      .set('Authorization', `Bearer ${VIEWER_TOKEN}`);

    expect(res.status).toBe(200);
  });

  it('viewer cannot make corrections PUT /api/checkins/:id → 403', async () => {
    const checkinId = '550e8400-e29b-41d4-a716-446655440099';

    const res = await request(app)
      .put(`/api/v1/checkins/${checkinId}`)
      .set('Authorization', `Bearer ${VIEWER_TOKEN}`)
      .send({ correction_note: 'test' });

    expect(res.status).toBe(403);
  });

  it('viewer cannot access admin panel POST /api/admin/clients → 403', async () => {
    const res = await request(app)
      .post('/api/v1/admin/clients')
      .set('Authorization', `Bearer ${VIEWER_TOKEN}`)
      .send({ name: 'Test', email: 'test@test.it' });

    expect(res.status).toBe(403);
  });
});
