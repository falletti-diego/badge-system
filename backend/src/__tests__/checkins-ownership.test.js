'use strict';

/**
 * Tests for S.32.1 — Ownership check on POST /api/checkins
 * employee/manager: solo self check-in; admin: chiunque nel tenant.
 * Spec: docs/superpowers/specs/2026-06-12-checkin-ownership-design.md
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// ─── Mocks (stesso pattern di checkins-geofence.test.js) ─────────────────────

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

// Disable global DISABLE_AUTH bypass so JWT role checks work
beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
afterAll(() => { process.env.DISABLE_AUTH = 'true'; });

// ─── Token helpers ────────────────────────────────────────────────────────────

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const CLIENT_ID   = '550e8400-e29b-41d4-a716-446655440001';
const SITE_ID     = '550e8400-e29b-41d4-a716-446655440010';
const EMP_A_ID    = '550e8400-e29b-41d4-a716-446655440100';
const EMP_B_ID    = '550e8400-e29b-41d4-a716-446655440101';

const EMP_A_TOKEN = makeToken({ user_id: EMP_A_ID, client_id: CLIENT_ID, role: 'employee', employee_id: EMP_A_ID });
// Employee senza employee_id nel token (es. demo maria/lucia)
const EMP_NOPROFILE_TOKEN = makeToken({ user_id: 'user-mvp-maria', client_id: CLIENT_ID, role: 'employee' });
const MGR_TOKEN   = makeToken({ user_id: EMP_A_ID, client_id: CLIENT_ID, role: 'manager', employee_id: EMP_A_ID, site_id: SITE_ID });
const MGR_NOPROFILE_TOKEN = makeToken({ user_id: 'user-mvp-pino', client_id: CLIENT_ID, role: 'manager' });
const ADMIN_TOKEN = makeToken({ user_id: 'admin-uuid-1', client_id: CLIENT_ID, role: 'admin' });

const app = require('../app');
const logger = require('../utils/logger');

// ─── Mock helper: SQL-based dispatch (l'ordine BEGIN/COMMIT non conta) ────────

function mockClientQuery(targetEmployeeId) {
  return jest.fn().mockImplementation((sql) => {
    const s = sql.trim().toUpperCase();
    if (s.startsWith('BEGIN') || s.startsWith('COMMIT') || s.startsWith('ROLLBACK')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('FROM EMPLOYEES WHERE ID') && s.includes('AND CLIENT_ID')) {
      return Promise.resolve({ rows: [{ id: targetEmployeeId, client_id: CLIENT_ID }] });
    }
    if (s.includes('FROM SITES')) {
      // geofence disattivato — il test non riguarda il GPS
      return Promise.resolve({
        rows: [{
          id: SITE_ID,
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
      return Promise.resolve({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440999',
          employee_id: targetEmployeeId,
          site_id: SITE_ID,
          type: 'IN',
          timestamp: new Date().toISOString(),
          created_at: new Date().toISOString(),
        }],
      });
    }
    return Promise.resolve({ rows: [] }); // audit_log e altro
  });
}

function mockHappyPath(targetEmployeeId) {
  pool.connect.mockResolvedValue({
    query: mockClientQuery(targetEmployeeId),
    release: jest.fn(),
  });
}

function postCheckin(token, employeeId) {
  return request(app)
    .post('/api/v1/checkins')
    .set('Authorization', `Bearer ${token}`)
    .send({ employee_id: employeeId, site_id: SITE_ID, type: 'IN' });
}

beforeEach(() => jest.clearAllMocks());

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/checkins — ownership (S.32.1)', () => {
  it('employee crea check-in per sé stesso → 201', async () => {
    mockHappyPath(EMP_A_ID);
    const res = await postCheckin(EMP_A_TOKEN, EMP_A_ID);
    expect(res.status).toBe(201);
    expect(res.body.data.employee_id).toBe(EMP_A_ID);
  });

  it('employee crea check-in per un collega → 403 CHECKIN_OWNERSHIP', async () => {
    mockHappyPath(EMP_B_ID);
    const res = await postCheckin(EMP_A_TOKEN, EMP_B_ID);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CHECKIN_OWNERSHIP');
    // Il guard deve rifiutare PRIMA di qualunque accesso al DB
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('employee senza employee_id nel token → 403 CHECKIN_NO_EMPLOYEE_PROFILE', async () => {
    mockHappyPath(EMP_A_ID);
    const res = await postCheckin(EMP_NOPROFILE_TOKEN, EMP_A_ID);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CHECKIN_NO_EMPLOYEE_PROFILE');
  });

  it('manager crea check-in per sé stesso → 201 (flusso Session 13 intatto)', async () => {
    mockHappyPath(EMP_A_ID);
    const res = await postCheckin(MGR_TOKEN, EMP_A_ID);
    expect(res.status).toBe(201);
  });

  it('manager crea check-in per un altro dipendente → 403 CHECKIN_OWNERSHIP', async () => {
    mockHappyPath(EMP_B_ID);
    const res = await postCheckin(MGR_TOKEN, EMP_B_ID);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CHECKIN_OWNERSHIP');
  });

  it('manager senza employee_id nel token → 403 CHECKIN_NO_EMPLOYEE_PROFILE', async () => {
    mockHappyPath(EMP_A_ID);
    const res = await postCheckin(MGR_NOPROFILE_TOKEN, EMP_A_ID);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CHECKIN_NO_EMPLOYEE_PROFILE');
  });

  it('admin crea check-in per qualunque dipendente del tenant → 201', async () => {
    mockHappyPath(EMP_B_ID);
    const res = await postCheckin(ADMIN_TOKEN, EMP_B_ID);
    expect(res.status).toBe(201);
    expect(res.body.data.employee_id).toBe(EMP_B_ID);
  });

  it('la violazione emette logger.warn con action checkin_ownership_violation', async () => {
    mockHappyPath(EMP_B_ID);
    const warnSpy = jest.spyOn(logger, 'warn');
    await postCheckin(EMP_A_TOKEN, EMP_B_ID);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'checkin_ownership_violation', attempted_employee_id: EMP_B_ID })
    );
    warnSpy.mockRestore();
  });
});
