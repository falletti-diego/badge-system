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
