'use strict';

/**
 * Tests for Offline Mode — Fase A (backend)
 * POST /api/checkins with occurred_at / client_uuid / is_offline
 * See docs/superpowers/plans/2026-07-19-offline-mode.md
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
}));

const { pool } = require('../db/pool');

// Disable global DISABLE_AUTH bypass so JWT role checks work (same pattern as checkins-geofence.test.js).
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

// ─── Mock helper ─────────────────────────────────────────────────────────────
//
// Uses SQL-based dispatch so call order (BEGIN/COMMIT/ROLLBACK) doesn't matter.
// existingByUuid: { [client_uuid]: rowToReturnAsDuplicate } — simulates a checkin
// already present with that client_uuid (idempotent dedup path).
// insertShouldThrowUniqueViolation: simulates the race where two concurrent syncs
// both pass the dedup SELECT, then the INSERT itself hits the UNIQUE index.

function makeClientQuery({ existingByUuid = {}, insertShouldThrowUniqueViolation = false } = {}) {
  const insertCalls = [];
  const auditCalls = [];
  let insertAttempts = 0;

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
    if (s.includes('SELECT') && s.includes('FROM CHECKINS') && s.includes('CLIENT_UUID')) {
      const [uuid] = params;
      const existing = existingByUuid[uuid];
      return Promise.resolve({ rows: existing ? [existing] : [] });
    }
    if (s.startsWith('INSERT INTO CHECKINS')) {
      insertAttempts += 1;
      if (insertShouldThrowUniqueViolation && insertAttempts === 1) {
        const err = new Error('duplicate key value violates unique constraint "idx_checkins_client_uuid"');
        err.code = '23505';
        throw err;
      }
      insertCalls.push(params);
      const [employee_id, site_id, , type, , , , occurred_at, client_uuid, is_offline] = params;
      const row = {
        id: `ci-uuid-${insertCalls.length}`,
        employee_id,
        site_id,
        type,
        timestamp: occurred_at || new Date().toISOString(),
        created_at: new Date().toISOString(),
        client_uuid: client_uuid || null,
        is_offline: is_offline === true,
      };
      return Promise.resolve({ rows: [row] });
    }
    if (s.startsWith('INSERT INTO AUDIT_LOG')) {
      auditCalls.push(params);
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: [] });
  });

  return { fn, insertCalls, auditCalls };
}

function isoMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}
function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

// ─── A2 — Zod schema: occurred_at / client_uuid / is_offline ────────────────

describe('POST /api/checkins — offline fields (schema)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accepta occurred_at entro la finestra 48h', async () => {
    const { fn } = makeClientQuery();
    pool.connect.mockResolvedValue({ query: fn, release: jest.fn() });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({
        employee_id: EMP_ID, site_id: SITE_ID, type: 'IN',
        occurred_at: isoHoursAgo(1),
        client_uuid: '11111111-1111-1111-1111-111111111111',
        is_offline: true,
      });

    expect(res.status).toBe(201);
  });

  it('rifiuta occurred_at più vecchio di 48h', async () => {
    const { fn } = makeClientQuery();
    pool.connect.mockResolvedValue({ query: fn, release: jest.fn() });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({
        employee_id: EMP_ID, site_id: SITE_ID, type: 'IN',
        occurred_at: isoHoursAgo(49),
        client_uuid: '22222222-2222-2222-2222-222222222222',
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('OFFLINE_TIMESTAMP_OUT_OF_WINDOW');
  });

  it('rifiuta occurred_at nel futuro oltre 5 minuti', async () => {
    const { fn } = makeClientQuery();
    pool.connect.mockResolvedValue({ query: fn, release: jest.fn() });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({
        employee_id: EMP_ID, site_id: SITE_ID, type: 'IN',
        occurred_at: isoMinutesAgo(-10),
        client_uuid: '33333333-3333-3333-3333-333333333333',
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('OFFLINE_TIMESTAMP_OUT_OF_WINDOW');
  });

  it('rifiuta client_uuid non-UUID', async () => {
    const { fn } = makeClientQuery();
    pool.connect.mockResolvedValue({ query: fn, release: jest.fn() });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({
        employee_id: EMP_ID, site_id: SITE_ID, type: 'IN',
        client_uuid: 'not-a-uuid',
      });

    expect(res.status).toBe(400);
  });

  it('POST senza i nuovi campi funziona come prima (retrocompatibilità)', async () => {
    const { fn } = makeClientQuery();
    pool.connect.mockResolvedValue({ query: fn, release: jest.fn() });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({ employee_id: EMP_ID, site_id: SITE_ID, type: 'IN' });

    expect(res.status).toBe(201);
  });
});

// ─── A3 — route: INSERT con occurred_at + risposta idempotente ─────────────

describe('POST /api/checkins — offline dedup (route)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('salva occurred_at come timestamp e is_offline=true', async () => {
    const { fn, insertCalls } = makeClientQuery();
    pool.connect.mockResolvedValue({ query: fn, release: jest.fn() });

    const occurredAt = isoHoursAgo(1);
    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({
        employee_id: EMP_ID, site_id: SITE_ID, type: 'IN',
        occurred_at: occurredAt,
        client_uuid: '44444444-4444-4444-4444-444444444444',
        is_offline: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.is_offline).toBe(true);
    expect(new Date(res.body.data.timestamp).getTime()).toBe(new Date(occurredAt).getTime());
    expect(insertCalls).toHaveLength(1);
  });

  it('due POST con lo stesso client_uuid creano UNA riga: il secondo risponde 200 deduplicated:true', async () => {
    const clientUuid = '55555555-5555-5555-5555-555555555555';
    const existingRow = {
      id: 'ci-existing-1', employee_id: EMP_ID, site_id: SITE_ID, type: 'IN',
      timestamp: isoHoursAgo(2), created_at: isoHoursAgo(2), client_uuid: clientUuid, is_offline: true,
    };

    // First call: no existing row yet, INSERT happens.
    const { fn: fnFirst, insertCalls } = makeClientQuery({ existingByUuid: {} });
    pool.connect.mockResolvedValue({ query: fnFirst, release: jest.fn() });

    const payload = {
      employee_id: EMP_ID, site_id: SITE_ID, type: 'IN',
      occurred_at: isoHoursAgo(2), client_uuid: clientUuid, is_offline: true,
    };
    const res1 = await request(app).post('/api/v1/checkins').set('Authorization', `Bearer ${EMP_TOKEN}`).send(payload);
    expect(res1.status).toBe(201);
    expect(insertCalls).toHaveLength(1);

    // Second call: dedup SELECT now finds the existing row → 200 deduplicated, no second INSERT.
    const { fn: fnSecond, insertCalls: insertCallsSecond } = makeClientQuery({ existingByUuid: { [clientUuid]: existingRow } });
    pool.connect.mockResolvedValue({ query: fnSecond, release: jest.fn() });

    const res2 = await request(app).post('/api/v1/checkins').set('Authorization', `Bearer ${EMP_TOKEN}`).send(payload);
    expect(res2.status).toBe(200);
    expect(res2.body.deduplicated).toBe(true);
    expect(res2.body.data.id).toBe('ci-existing-1');
    expect(insertCallsSecond).toHaveLength(0);
  });

  it('gestisce la race sul vincolo UNIQUE (23505): ri-seleziona e risponde deduplicated:true', async () => {
    const clientUuid = '66666666-6666-6666-6666-666666666666';
    const existingRow = {
      id: 'ci-race-1', employee_id: EMP_ID, site_id: SITE_ID, type: 'IN',
      timestamp: isoHoursAgo(1), created_at: isoHoursAgo(1), client_uuid: clientUuid, is_offline: true,
    };

    // Dedup SELECT finds nothing (race: the other request hasn't committed yet),
    // but the INSERT itself throws 23505. Route must catch it, re-SELECT, and
    // respond as deduplicated using the now-committed row.
    const { fn } = makeClientQuery({ insertShouldThrowUniqueViolation: true, existingByUuid: { [clientUuid]: existingRow } });
    pool.connect.mockResolvedValue({ query: fn, release: jest.fn() });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({
        employee_id: EMP_ID, site_id: SITE_ID, type: 'IN',
        occurred_at: isoHoursAgo(1), client_uuid: clientUuid, is_offline: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.deduplicated).toBe(true);
    expect(res.body.data.id).toBe('ci-race-1');
  });

  it('audit log include is_offline nel newValue', async () => {
    const { fn, auditCalls } = makeClientQuery();
    pool.connect.mockResolvedValue({ query: fn, release: jest.fn() });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({
        employee_id: EMP_ID, site_id: SITE_ID, type: 'IN',
        occurred_at: isoHoursAgo(1),
        client_uuid: '77777777-7777-7777-7777-777777777777',
        is_offline: true,
      });

    expect(res.status).toBe(201);
    expect(auditCalls).toHaveLength(1);
    const newValue = JSON.parse(auditCalls[0][4]);
    expect(newValue.is_offline).toBe(true);
  });
});
