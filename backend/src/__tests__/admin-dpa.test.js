'use strict';

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
}));

const { pool } = require('../db/pool');

beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
afterAll(() => { process.env.DISABLE_AUTH = 'true'; });

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const ADMIN_UUID = '550e8400-e29b-41d4-a716-446655440010';

const ADMIN_TOKEN = makeToken({ user_id: ADMIN_UUID, client_id: CLIENT_ID, role: 'admin', name: 'Admin Test' });
const MANAGER_TOKEN = makeToken({ user_id: '550e8400-e29b-41d4-a716-446655440020', client_id: CLIENT_ID, role: 'manager', site_id: '550e8400-e29b-41d4-a716-446655440030', name: 'Manager Test' });

const app = require('../app');

// ─── POST /api/v1/admin/dpa-acknowledgement ───────────────────────────────────

describe('POST /api/v1/admin/dpa-acknowledgement', () => {
  beforeEach(() => jest.resetAllMocks());

  it('admin creates DPA acknowledgement → 201 with dpa data', async () => {
    pool.query
      .mockResolvedValueOnce({                    // INSERT dpa_acknowledgements RETURNING
        rows: [{
          id: '550e8400-e29b-41d4-a716-dpa0000001',
          client_id: CLIENT_ID,
          dpa_version: '2.0',
          accepted_at: '2026-06-21T10:00:00.000Z',
          accepted_by: 'Mario Rossi - Direttore HR',
          notes: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });         // logAudit INSERT audit_log (best-effort)

    const res = await request(app)
      .post('/api/v1/admin/dpa-acknowledgement')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ accepted_by: 'Mario Rossi - Direttore HR', notes: null });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.dpa_version).toBe('2.0');
    expect(res.body.data.accepted_by).toBe('Mario Rossi - Direttore HR');
  });

  it('missing accepted_by → 400', async () => {
    const res = await request(app)
      .post('/api/v1/admin/dpa-acknowledgement')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('accepted_by too short (1 char) → 400', async () => {
    const res = await request(app)
      .post('/api/v1/admin/dpa-acknowledgement')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ accepted_by: 'X' });

    expect(res.status).toBe(400);
  });

  it('manager role → 403 FORBIDDEN', async () => {
    const res = await request(app)
      .post('/api/v1/admin/dpa-acknowledgement')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`)
      .send({ accepted_by: 'Manager Person' });

    expect(res.status).toBe(403);
  });

  it('no token → 401', async () => {
    const res = await request(app)
      .post('/api/v1/admin/dpa-acknowledgement')
      .send({ accepted_by: 'Someone' });

    expect(res.status).toBe(401);
  });
});

// ─── GET /api/v1/admin/dpa-acknowledgements ───────────────────────────────────

describe('GET /api/v1/admin/dpa-acknowledgements', () => {
  beforeEach(() => jest.resetAllMocks());

  it('admin gets DPA history → 200 with rows + latest_acknowledgement', async () => {
    const row = {
      id: '550e8400-e29b-41d4-a716-dpa0000001',
      client_id: CLIENT_ID,
      dpa_version: '2.0',
      accepted_at: '2026-06-21T10:00:00.000Z',
      accepted_by: 'Mario Rossi',
      notes: null,
    };
    pool.query.mockResolvedValueOnce({ rows: [row] });

    const res = await request(app)
      .get('/api/v1/admin/dpa-acknowledgements')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.latest_acknowledgement.dpa_version).toBe('2.0');
    expect(res.body.returned).toBe(1);
  });

  it('admin with empty history → 200 with empty array + latest_acknowledgement=null', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/v1/admin/dpa-acknowledgements')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.latest_acknowledgement).toBeNull();
  });

  it('manager → 403', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dpa-acknowledgements')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`);

    expect(res.status).toBe(403);
  });
});
