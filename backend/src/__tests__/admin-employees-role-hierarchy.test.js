'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../db/pool', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../middleware/rateLimiter', () => ({
  apiLimiter: (req, res, next) => next(),
  authLimiter: (req, res, next) => next(),
  csvLimiter: (req, res, next) => next(),
  demoStartLimiter: (req, res, next) => next(),
  onboardingInviteLimiter: (req, res, next) => next(),
}));

const { pool } = require('../db/pool');
const app = require('../app');

beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
afterAll(() => { process.env.DISABLE_AUTH = 'true'; });

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const DIRECTOR_ID = '550e8400-e29b-41d4-a716-446655440200';
const SENIOR_ID = '550e8400-e29b-41d4-a716-446655440201';
const MANAGER_ID = '550e8400-e29b-41d4-a716-446655440202';
const ADMIN_TOKEN = makeToken({ user_id: 'admin-1', client_id: CLIENT_ID, role: 'admin' });

beforeEach(() => jest.clearAllMocks());

function mockQueryDispatch(handlers) {
  pool.query.mockImplementation((sql, params) => {
    const s = sql.trim().toUpperCase();
    for (const [match, handler] of handlers) {
      if (s.includes(match)) return Promise.resolve(handler(params));
    }
    return Promise.resolve({ rows: [] });
  });
}

describe('POST /api/admin/employees — role hierarchy', () => {
  it('accepts role senior_manager with a valid director reports_to_id', async () => {
    mockQueryDispatch([
      ['FROM CLIENTS', () => ({ rows: [{ id: CLIENT_ID }] })],
      ['FROM EMPLOYEES', (params) => {
        // approver lookup: director exists, active
        if (params.includes(DIRECTOR_ID)) return { rows: [{ id: DIRECTOR_ID, role: 'director' }] };
        return { rows: [] };
      }],
      ['INSERT INTO EMPLOYEES', () => ({
        rows: [{
          id: SENIOR_ID, client_id: CLIENT_ID, email: 'sm@test.local', name: 'Senior Manager',
          role: 'senior_manager', reports_to_id: DIRECTOR_ID, created_at: new Date().toISOString(),
        }],
      })],
    ]);

    const res = await request(app)
      .post('/api/admin/employees')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        email: 'sm@test.local', name: 'Senior Manager', role: 'senior_manager',
        reports_to_id: DIRECTOR_ID,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('senior_manager');
    expect(res.body.data.reports_to_id).toBe(DIRECTOR_ID);
  });

  it('rejects reports_to_id pointing at a lower-level role (a manager cannot approve a senior_manager)', async () => {
    mockQueryDispatch([
      ['FROM CLIENTS', () => ({ rows: [{ id: CLIENT_ID }] })],
      ['FROM EMPLOYEES', () => ({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440202', role: 'manager' }] })],
    ]);

    const res = await request(app)
      .post('/api/admin/employees')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        email: 'sm2@test.local', name: 'Senior Manager 2', role: 'senior_manager',
        reports_to_id: '550e8400-e29b-41d4-a716-446655440202',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REPORTS_TO_ASSIGNMENT');
  });

  it('rejects reports_to_id on an employee role (only manager/senior_manager may set it)', async () => {
    const res = await request(app)
      .post('/api/admin/employees')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        email: 'e1@test.local', name: 'Employee One', role: 'employee',
        assigned_sites: [], reports_to_id: SENIOR_ID,
      });

    expect(res.status).toBe(400);
  });

  it('rejects reports_to_id on a director (isolates the reports_to_id refine — director needs no assigned_sites/manager_id, so this 400 can only come from the reports_to_id refine)', async () => {
    const res = await request(app)
      .post('/api/admin/employees')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        email: 'dir2@test.local', name: 'Director Two', role: 'director',
        reports_to_id: SENIOR_ID,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
    expect(res.body.details.some((d) => d.field === 'body.reports_to_id')).toBe(true);
  });

  it('allows senior_manager/director with no reports_to_id (falls back to admin, per design)', async () => {
    mockQueryDispatch([
      ['FROM CLIENTS', () => ({ rows: [{ id: CLIENT_ID }] })],
      ['INSERT INTO EMPLOYEES', () => ({
        rows: [{
          id: DIRECTOR_ID, client_id: CLIENT_ID, email: 'dir@test.local', name: 'Director',
          role: 'director', reports_to_id: null, created_at: new Date().toISOString(),
        }],
      })],
    ]);

    const res = await request(app)
      .post('/api/admin/employees')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ email: 'dir@test.local', name: 'Director', role: 'director' });

    expect(res.status).toBe(201);
    expect(res.body.data.reports_to_id).toBeNull();
  });
});

describe('PATCH /api/admin/employees/:id/role', () => {
  it('promotes a manager to senior_manager with no reports_to_id', async () => {
    mockQueryDispatch([
      ['FROM EMPLOYEES', (params) => {
        if (params.includes(MANAGER_ID)) return { rows: [{ id: MANAGER_ID, role: 'manager', reports_to_id: null }] };
        return { rows: [] };
      }],
      ['UPDATE EMPLOYEES', () => ({
        rows: [{ id: MANAGER_ID, client_id: CLIENT_ID, name: 'Mgr', email: 'mgr@test.local', role: 'senior_manager', reports_to_id: null }],
      })],
    ]);

    const res = await request(app)
      .patch(`/api/admin/employees/${MANAGER_ID}/role`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'senior_manager' });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('senior_manager');
  });

  it('promotes a manager directly to director (skip-level)', async () => {
    mockQueryDispatch([
      ['FROM EMPLOYEES', (params) => {
        if (params.includes(MANAGER_ID)) return { rows: [{ id: MANAGER_ID, role: 'manager', reports_to_id: null }] };
        return { rows: [] };
      }],
      ['UPDATE EMPLOYEES', () => ({
        rows: [{ id: MANAGER_ID, client_id: CLIENT_ID, name: 'Mgr', email: 'mgr@test.local', role: 'director', reports_to_id: null }],
      })],
    ]);

    const res = await request(app)
      .patch(`/api/admin/employees/${MANAGER_ID}/role`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'director' });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('director');
  });

  it('promotes a senior_manager to director with a valid reports_to_id', async () => {
    mockQueryDispatch([
      ['FROM EMPLOYEES', (params) => {
        if (params.includes(SENIOR_ID) && params.length === 2) return { rows: [{ id: SENIOR_ID, role: 'senior_manager', reports_to_id: null }] };
        if (params.includes(DIRECTOR_ID)) return { rows: [{ id: DIRECTOR_ID, role: 'director', reports_to_id: null }] };
        return { rows: [] };
      }],
      ['UPDATE EMPLOYEES', () => ({
        rows: [{ id: SENIOR_ID, client_id: CLIENT_ID, name: 'SM', email: 'sm@test.local', role: 'director', reports_to_id: DIRECTOR_ID }],
      })],
    ]);

    const res = await request(app)
      .patch(`/api/admin/employees/${SENIOR_ID}/role`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'director', reports_to_id: DIRECTOR_ID });

    expect(res.status).toBe(200);
    expect(res.body.data.reports_to_id).toBe(DIRECTOR_ID);
  });

  it('rejects role "manager" as a target (schema-level, never a valid promotion target)', async () => {
    const res = await request(app)
      .patch(`/api/admin/employees/${MANAGER_ID}/role`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'manager' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('rejects a non-promotion (senior_manager targeting senior_manager, same level)', async () => {
    mockQueryDispatch([
      ['FROM EMPLOYEES', () => ({ rows: [{ id: SENIOR_ID, role: 'senior_manager', reports_to_id: null }] })],
    ]);

    const res = await request(app)
      .patch(`/api/admin/employees/${SENIOR_ID}/role`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'senior_manager' });

    expect(res.status).toBe(400);
    expect(res.body.details?.code).toBe('ROLE_NOT_A_PROMOTION');
  });

  it('rejects changing role for a director (no valid promotion from here)', async () => {
    mockQueryDispatch([
      ['FROM EMPLOYEES', () => ({ rows: [{ id: DIRECTOR_ID, role: 'director', reports_to_id: null }] })],
    ]);

    const res = await request(app)
      .patch(`/api/admin/employees/${DIRECTOR_ID}/role`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'senior_manager' });

    expect(res.status).toBe(400);
    expect(res.body.details?.code).toBe('ROLE_CHANGE_NOT_ALLOWED');
  });

  it('returns 404 for a non-existent or cross-tenant employee id', async () => {
    mockQueryDispatch([
      ['FROM EMPLOYEES', () => ({ rows: [] })],
    ]);

    const res = await request(app)
      .patch(`/api/admin/employees/${MANAGER_ID}/role`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'senior_manager' });

    expect(res.status).toBe(404);
  });

  it('rejects a reports_to_id that would create a cycle', async () => {
    mockQueryDispatch([
      ['FROM EMPLOYEES', (params) => {
        if (params.includes(MANAGER_ID) && params.length === 2) return { rows: [{ id: MANAGER_ID, role: 'manager', reports_to_id: null }] };
        // L'approvatore scelto (SENIOR_ID) riporta già a MANAGER_ID — la
        // riga che si sta modificando — un ciclo diretto a due.
        if (params.includes(SENIOR_ID)) return { rows: [{ id: SENIOR_ID, role: 'senior_manager', reports_to_id: MANAGER_ID }] };
        return { rows: [] };
      }],
    ]);

    const res = await request(app)
      .patch(`/api/admin/employees/${MANAGER_ID}/role`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'senior_manager', reports_to_id: SENIOR_ID });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cycle/);
  });

  it('forces reports_to_id to null when target role is director, even if the body sends one', async () => {
    mockQueryDispatch([
      ['FROM EMPLOYEES', (params) => {
        if (params.includes(SENIOR_ID) && params.length === 2) return { rows: [{ id: SENIOR_ID, role: 'senior_manager', reports_to_id: null }] };
        return { rows: [] };
      }],
      ['UPDATE EMPLOYEES', (params) => ({
        rows: [{ id: SENIOR_ID, client_id: CLIENT_ID, name: 'SM', email: 'sm@test.local', role: 'director', reports_to_id: params[1] }],
      })],
    ]);

    const res = await request(app)
      .patch(`/api/admin/employees/${SENIOR_ID}/role`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'director', reports_to_id: DIRECTOR_ID }); // deve essere ignorato

    expect(res.status).toBe(200);
    expect(res.body.data.reports_to_id).toBeNull();
  });
});
