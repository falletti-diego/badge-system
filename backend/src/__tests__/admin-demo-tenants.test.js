'use strict';

/**
 * Mocked-pool RBAC tests for GET /api/admin/demo-tenants (Task 9 of 9 —
 * Ambiente Demo Self-Service).
 *
 * Mirrors admin-viewers.test.js's convention for the fast, mocked-pool RBAC
 * matrix. The real-database, real-demo-tenant behavior (correct fields,
 * ordering by demo_expires_at ASC, and the "admin of a demo tenant" 403
 * case using a genuinely seeded demo tenant) is covered separately in
 * admin-demo-tenants-integration.test.js, which mirrors demo-start.test.js's
 * soft-skip real-Postgres pattern.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

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

const { pool } = require('../db/pool');

beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
afterAll(() => { process.env.DISABLE_AUTH = 'true'; });

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const REAL_CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const DEMO_CLIENT_ID = '550e8400-e29b-41d4-a716-446655440002';
const SITE_ID = '550e8400-e29b-41d4-a716-446655440010';

const REAL_ADMIN_TOKEN = makeToken({ user_id: 'admin-uuid-1', client_id: REAL_CLIENT_ID, role: 'admin', name: 'Admin' });
const DEMO_ADMIN_TOKEN = makeToken({ user_id: 'demo-admin-uuid-1', client_id: DEMO_CLIENT_ID, role: 'admin', name: 'Demo Admin' });
const MANAGER_TOKEN = makeToken({ user_id: 'mgr-uuid-1', client_id: REAL_CLIENT_ID, role: 'manager', site_id: SITE_ID, name: 'Manager' });
const VIEWER_TOKEN = makeToken({ user_id: 'viewer-uuid-1', client_id: REAL_CLIENT_ID, role: 'viewer', name: 'Commercialista' });

const app = require('../app');

describe('GET /api/admin/demo-tenants', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('real admin gets the demo tenant list → 200', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ is_demo: false }] }) // caller client_id check
      .mockResolvedValueOnce({
        rows: [
          {
            id: DEMO_CLIENT_ID,
            demo_contact_email: 'demo1@example.invalid',
            created_at: new Date().toISOString(),
            demo_expires_at: new Date().toISOString(),
          },
        ],
      });

    const res = await request(app)
      .get('/api/v1/admin/demo-tenants')
      .set('Authorization', `Bearer ${REAL_ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: DEMO_CLIENT_ID,
      demo_contact_email: 'demo1@example.invalid',
    });
    expect(res.body.returned).toBe(1);
  });

  it('admin of a demo tenant → 403 (blanket admin gate closes but this route rejects on its own is_demo check)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ is_demo: true }] }); // caller client_id check

    const res = await request(app)
      .get('/api/v1/admin/demo-tenants')
      .set('Authorization', `Bearer ${DEMO_ADMIN_TOKEN}`);

    expect(res.status).toBe(403);
  });

  it('manager → 403 (blocked by shared blanket admin gate, before reaching this route)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/demo-tenants')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`);

    expect(res.status).toBe(403);
  });

  it('viewer → 403', async () => {
    const res = await request(app)
      .get('/api/v1/admin/demo-tenants')
      .set('Authorization', `Bearer ${VIEWER_TOKEN}`);

    expect(res.status).toBe(403);
  });

  it('no token → 401', async () => {
    const res = await request(app).get('/api/v1/admin/demo-tenants');

    expect(res.status).toBe(401);
  });

  it('caller client_id not found in clients table → 403 (fail closed)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // caller client_id lookup returns nothing

    const res = await request(app)
      .get('/api/v1/admin/demo-tenants')
      .set('Authorization', `Bearer ${REAL_ADMIN_TOKEN}`);

    expect(res.status).toBe(403);
  });
});
