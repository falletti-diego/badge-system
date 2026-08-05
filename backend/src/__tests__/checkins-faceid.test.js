'use strict';

/**
 * Tests for faceid_verified on POST /api/checkins (finding #4, 2026-08-02)
 * The client declares whether Face ID was verified before check-in; the server
 * persists and returns it (visibility/audit, not a security control — see
 * middleware/validation.js PostCheckinSchema comment).
 * Follows the same mocked-pool pattern as checkins-offline.test.js.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock('../db/redis', () => ({
  deleteCacheByPattern: jest.fn().mockResolvedValue(undefined),
  redisClient: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('../middleware/rateLimiter', () => ({
  apiLimiter: (req, res, next) => next(),
  authLimiter: (req, res, next) => next(),
  csvLimiter: (req, res, next) => next(),
  demoStartLimiter: (req, res, next) => next(),
  onboardingInviteLimiter: (req, res, next) => next(),
}));

const { pool } = require('../db/pool');

// Disable global DISABLE_AUTH bypass so JWT role checks work (same pattern as checkins-offline.test.js).
beforeAll(() => {
  process.env.DISABLE_AUTH = 'false';
});
afterAll(() => {
  process.env.DISABLE_AUTH = 'true';
});

// ─── Token helpers ────────────────────────────────────────────────────────────

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const SITE_ID = '550e8400-e29b-41d4-a716-446655440010';
const EMP_ID = '550e8400-e29b-41d4-a716-446655440100';

const EMP_TOKEN = makeToken({ user_id: EMP_ID, client_id: CLIENT_ID, role: 'employee', employee_id: EMP_ID });

const app = require('../app');

// ─── Mock helper (SQL-based dispatch, same shape as checkins-offline.test.js) ─

function makeClientQuery() {
  const insertCalls = [];

  const fn = jest.fn().mockImplementation((sql, params = []) => {
    const s = sql.trim().toUpperCase();

    if (s.startsWith('BEGIN') || s.startsWith('COMMIT') || s.startsWith('ROLLBACK') ||
        s.startsWith('SAVEPOINT') || s.startsWith('RELEASE')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('FROM EMPLOYEES WHERE ID') && s.includes('AND CLIENT_ID')) {
      return Promise.resolve({ rows: [{ id: EMP_ID, client_id: CLIENT_ID }] });
    }
    if (s.includes('FROM SITES')) {
      return Promise.resolve({
        rows: [{
          id: SITE_ID,
          name: 'Sede Test',
          geofence_enabled: false,
          geofencing_feature_enabled: true,
          latitude: null,
          longitude: null,
          geofence_radius_meters: null,
        }],
      });
    }
    if (s.includes('ANY(ASSIGNED_SITES)')) {
      return Promise.resolve({ rows: [{ '?column?': 1 }] });
    }
    if (s.startsWith('INSERT INTO CHECKINS')) {
      insertCalls.push(params);
      const [employee_id, site_id, , type, , , , occurred_at, client_uuid, is_offline, faceid_verified] = params;
      const row = {
        id: `ci-uuid-${insertCalls.length}`,
        employee_id,
        site_id,
        type,
        timestamp: occurred_at || new Date().toISOString(),
        created_at: new Date().toISOString(),
        is_offline: is_offline === true,
        faceid_verified: faceid_verified === true,
      };
      return Promise.resolve({ rows: [row] });
    }
    if (s.startsWith('INSERT INTO AUDIT_LOG')) {
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: [] });
  });

  return { fn, insertCalls };
}

describe('POST /api/v1/checkins — faceid_verified (finding #4)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('persiste faceid_verified:false quando il client lo dichiara esplicitamente', async () => {
    const { fn, insertCalls } = makeClientQuery();
    pool.connect.mockResolvedValue({ query: fn, release: jest.fn() });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({
        employee_id: EMP_ID,
        site_id: SITE_ID,
        type: 'IN',
        faceid_verified: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.faceid_verified).toBe(false);
    const [, , , , , , , , , , insertedFaceidVerified] = insertCalls[0];
    expect(insertedFaceidVerified).toBe(false);
  });

  it('persiste faceid_verified:true quando il client lo dichiara esplicitamente', async () => {
    const { fn, insertCalls } = makeClientQuery();
    pool.connect.mockResolvedValue({ query: fn, release: jest.fn() });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({
        employee_id: EMP_ID,
        site_id: SITE_ID,
        type: 'OUT',
        faceid_verified: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.faceid_verified).toBe(true);
    const [, , , , , , , , , , insertedFaceidVerified] = insertCalls[0];
    expect(insertedFaceidVerified).toBe(true);
  });

  it('default a false quando il client non lo invia (retrocompatibilità)', async () => {
    const { fn } = makeClientQuery();
    pool.connect.mockResolvedValue({ query: fn, release: jest.fn() });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({ employee_id: EMP_ID, site_id: SITE_ID, type: 'OUT' });

    expect(res.status).toBe(201);
    expect(res.body.data.faceid_verified).toBe(false);
  });

  it('rifiuta faceid_verified non-booleano', async () => {
    const { fn } = makeClientQuery();
    pool.connect.mockResolvedValue({ query: fn, release: jest.fn() });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({ employee_id: EMP_ID, site_id: SITE_ID, type: 'IN', faceid_verified: 'yes' });

    expect(res.status).toBe(400);
  });
});
