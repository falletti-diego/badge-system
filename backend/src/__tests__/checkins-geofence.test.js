'use strict';

/**
 * Tests for FASE 10 — Geofencing
 * POST /api/checkins with geofence_enabled sites
 * PUT /api/admin/sites/:id (geofence settings)
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
}));

const { pool } = require('../db/pool');

// Disable global DISABLE_AUTH bypass so JWT role checks work.
// Enable GEOFENCING_ENABLED for these tests (feature is on hold by default in MVP).
// Save/restore GEOFENCING_ENABLED so CI env state is not corrupted for subsequent test files.
let _savedGeofencingEnabled;
beforeAll(() => {
  process.env.DISABLE_AUTH = 'false';
  _savedGeofencingEnabled = process.env.GEOFENCING_ENABLED;
  process.env.GEOFENCING_ENABLED = 'true';
});
afterAll(() => {
  process.env.DISABLE_AUTH = 'true';
  if (_savedGeofencingEnabled === undefined) {
    delete process.env.GEOFENCING_ENABLED;
  } else {
    process.env.GEOFENCING_ENABLED = _savedGeofencingEnabled;
  }
});

// ─── Token helpers ────────────────────────────────────────────────────────────

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const SITE_ID   = '550e8400-e29b-41d4-a716-446655440010';
const EMP_ID    = '550e8400-e29b-41d4-a716-446655440100';

const EMP_TOKEN   = makeToken({ user_id: EMP_ID, client_id: CLIENT_ID, role: 'employee', employee_id: EMP_ID });
const ADMIN_TOKEN = makeToken({ user_id: 'admin-uuid-1', client_id: CLIENT_ID, role: 'admin' });

const app = require('../app');

// ─── Geofence test constants ──────────────────────────────────────────────────

const SITE_LAT = 45.4654;
const SITE_LNG = 9.1859;
const SITE_RADIUS = 150;

// ~50m north — inside 150m radius
const INSIDE_LAT = SITE_LAT + 0.00045;
const INSIDE_LNG = SITE_LNG;

// ~500m north — outside 150m radius
const OUTSIDE_LAT = SITE_LAT + 0.0045;
const OUTSIDE_LNG = SITE_LNG;

// ─── Mock helper ─────────────────────────────────────────────────────────────
//
// Uses SQL-based dispatch so call order (BEGIN/COMMIT/ROLLBACK) doesn't matter.

function makeClientQuery({ geofenceEnabled = true, geofencingFeatureEnabled = true, assignmentHits = true, checkinRow }) {
  const siteRow = {
    id: SITE_ID,
    geofence_enabled: geofenceEnabled,
    geofencing_feature_enabled: geofencingFeatureEnabled,
    latitude: geofenceEnabled ? SITE_LAT : null,
    longitude: geofenceEnabled ? SITE_LNG : null,
    geofence_radius_meters: SITE_RADIUS,
  };

  return jest.fn().mockImplementation((sql) => {
    const s = sql.trim().toUpperCase();
    if (s.startsWith('BEGIN') || s.startsWith('COMMIT') || s.startsWith('ROLLBACK')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('FROM EMPLOYEES WHERE ID') && s.includes('AND CLIENT_ID')) {
      return Promise.resolve({ rows: [{ id: EMP_ID, client_id: CLIENT_ID }] });
    }
    // matches both old "FROM SITES WHERE" and new "FROM SITES S JOIN ... WHERE"
    if (s.includes('FROM SITES')) {
      return Promise.resolve({ rows: [siteRow] });
    }
    if (s.includes('ANY(ASSIGNED_SITES)')) {
      return Promise.resolve({ rows: assignmentHits ? [{ '?column?': 1 }] : [] });
    }
    if (s.startsWith('INSERT INTO CHECKINS')) {
      return Promise.resolve({ rows: checkinRow ? [checkinRow] : [] });
    }
    // audit_log + anything else
    return Promise.resolve({ rows: [] });
  });
}

// ─── POST /api/checkins — geofence disabled ────────────────────────────────────

describe('POST /api/checkins — geofence disabled', () => {
  // clearAllMocks: keeps mockResolvedValue on deleteCacheByPattern (resetAllMocks would break it)
  beforeEach(() => jest.clearAllMocks());

  it('creates check-in without coordinates when geofence is off', async () => {
    const checkinRow = { id: 'ci-uuid-1', employee_id: EMP_ID, site_id: SITE_ID, type: 'IN', timestamp: new Date(), created_at: new Date() };
    pool.connect.mockResolvedValue({ query: makeClientQuery({ geofenceEnabled: false, checkinRow }), release: jest.fn() });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({ employee_id: EMP_ID, site_id: SITE_ID, type: 'IN' });

    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
  });

  it('accepts coordinates even when geofence is off', async () => {
    const checkinRow = { id: 'ci-uuid-2', employee_id: EMP_ID, site_id: SITE_ID, type: 'OUT', timestamp: new Date(), created_at: new Date() };
    pool.connect.mockResolvedValue({ query: makeClientQuery({ geofenceEnabled: false, checkinRow }), release: jest.fn() });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({ employee_id: EMP_ID, site_id: SITE_ID, type: 'OUT', latitude: INSIDE_LAT, longitude: INSIDE_LNG });

    expect(res.status).toBe(201);
  });
});

// ─── POST /api/checkins — geofence enabled ────────────────────────────────────

describe('POST /api/checkins — geofence enabled', () => {
  beforeEach(() => jest.clearAllMocks());

  it('missing coordinates → 400 GEOFENCE_COORDINATES_REQUIRED', async () => {
    pool.connect.mockResolvedValue({ query: makeClientQuery({ geofenceEnabled: true, checkinRow: null }), release: jest.fn() });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({ employee_id: EMP_ID, site_id: SITE_ID, type: 'IN' });

    expect(res.status).toBe(400);
    expect(res.body.details?.code).toBe('GEOFENCE_COORDINATES_REQUIRED');
  });

  it('inside radius → 201 Created', async () => {
    const checkinRow = { id: 'ci-uuid-3', employee_id: EMP_ID, site_id: SITE_ID, type: 'IN', timestamp: new Date(), created_at: new Date() };
    pool.connect.mockResolvedValue({ query: makeClientQuery({ geofenceEnabled: true, checkinRow }), release: jest.fn() });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({ employee_id: EMP_ID, site_id: SITE_ID, type: 'IN', latitude: INSIDE_LAT, longitude: INSIDE_LNG });

    expect(res.status).toBe(201);
  });

  it('outside radius → 403 OUTSIDE_GEOFENCE with distance info', async () => {
    pool.connect.mockResolvedValue({ query: makeClientQuery({ geofenceEnabled: true, checkinRow: null }), release: jest.fn() });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({ employee_id: EMP_ID, site_id: SITE_ID, type: 'IN', latitude: OUTSIDE_LAT, longitude: OUTSIDE_LNG });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('OUTSIDE_GEOFENCE');
    expect(res.body.details.distance_meters).toBeGreaterThan(SITE_RADIUS);
    expect(res.body.details.max_meters).toBe(SITE_RADIUS);
  });

  it('coordinates out of range (lat > 90) → 400 validation error', async () => {
    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({ employee_id: EMP_ID, site_id: SITE_ID, type: 'IN', latitude: 91, longitude: 9.1 });

    expect(res.status).toBe(400);
  });
});

// ─── PUT /api/admin/sites/:id ─────────────────────────────────────────────────

describe('PUT /api/admin/sites/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  const SITE_UUID = '550e8400-e29b-41d4-a716-446655440010';

  it('no auth → 401', async () => {
    const res = await request(app)
      .put(`/api/v1/admin/sites/${SITE_UUID}`)
      .send({ geofence_enabled: true, geofence_radius_meters: 200 });
    expect(res.status).toBe(401);
  });

  it('non-admin role → 403 ADMIN_REQUIRED', async () => {
    const managerToken = makeToken({ user_id: 'mgr-1', client_id: CLIENT_ID, role: 'manager', site_id: SITE_UUID });
    const res = await request(app)
      .put(`/api/v1/admin/sites/${SITE_UUID}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ geofence_enabled: true, geofence_radius_meters: 200 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ADMIN_REQUIRED');
  });

  it('invalid UUID in :id → 400', async () => {
    const res = await request(app)
      .put('/api/v1/admin/sites/not-a-uuid')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ geofence_enabled: true, geofence_radius_meters: 200 });
    expect(res.status).toBe(400);
  });

  it('radius too small (< 50m) → 400', async () => {
    const res = await request(app)
      .put(`/api/v1/admin/sites/${SITE_UUID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ geofence_enabled: true, geofence_radius_meters: 10 });
    expect(res.status).toBe(400);
  });

  it('missing geofence_enabled → 400', async () => {
    const res = await request(app)
      .put(`/api/v1/admin/sites/${SITE_UUID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ latitude: 45.4, longitude: 9.1, geofence_radius_meters: 150 }); // missing geofence_enabled
    expect(res.status).toBe(400);
  });

  it('admin enables geofence → 200', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{
          id: SITE_UUID,
          name: 'Milano Centrale',
          latitude: 45.4654,
          longitude: 9.1859,
          geofence_radius_meters: 200,
          geofence_enabled: true,
        }],
        rowCount: 1,
      })
      .mockResolvedValue({ rows: [] }); // audit log

    const res = await request(app)
      .put(`/api/v1/admin/sites/${SITE_UUID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ latitude: 45.4654, longitude: 9.1859, geofence_radius_meters: 200, geofence_enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.geofence_enabled).toBe(true);
    expect(res.body.data.geofence_radius_meters).toBe(200);
  });

  it('admin disables geofence (null lat/lng) → 200', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{
          id: SITE_UUID,
          name: 'Milano Centrale',
          latitude: null,
          longitude: null,
          geofence_radius_meters: 150,
          geofence_enabled: false,
        }],
        rowCount: 1,
      })
      .mockResolvedValue({ rows: [] });

    const res = await request(app)
      .put(`/api/v1/admin/sites/${SITE_UUID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ latitude: null, longitude: null, geofence_radius_meters: 150, geofence_enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.data.geofence_enabled).toBe(false);
  });
});

// ─── POST /api/checkins — geofencing_feature_enabled = false ─────────────────
// When the client disables geofencing at org level, site-level geofence_enabled
// is ignored and check-in always succeeds regardless of GPS.

describe('POST /api/checkins — client geofencing feature disabled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore redis mock — resetAllMocks() in the PUT describe above wipes it
    require('../db/redis').deleteCacheByPattern.mockResolvedValue(undefined);
  });

  it('site has geofence ON but client feature OFF → check-in without GPS → 201', async () => {
    // geofencingFeatureEnabled=false means client disabled the feature entirely;
    // even though geofenceEnabled=true on the site, the check is skipped.
    const checkinRow = { id: 'ci-feat-1', employee_id: EMP_ID, site_id: SITE_ID, type: 'IN', timestamp: new Date(), created_at: new Date() };
    pool.connect.mockResolvedValue({
      query: makeClientQuery({ geofenceEnabled: true, geofencingFeatureEnabled: false, checkinRow }),
      release: jest.fn(),
    });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({ employee_id: EMP_ID, site_id: SITE_ID, type: 'IN' }); // no GPS

    expect(res.status).toBe(201);
  });

  it('site has geofence ON, client feature ON, no GPS → 400 (original behavior)', async () => {
    pool.connect.mockResolvedValue({
      query: makeClientQuery({ geofenceEnabled: true, geofencingFeatureEnabled: true, checkinRow: null }),
      release: jest.fn(),
    });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({ employee_id: EMP_ID, site_id: SITE_ID, type: 'IN' }); // no GPS

    expect(res.status).toBe(400);
    expect(res.body.details?.code).toBe('GEOFENCE_COORDINATES_REQUIRED');
  });
});
