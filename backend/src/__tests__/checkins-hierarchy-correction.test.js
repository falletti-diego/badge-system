'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../db/pool', () => ({ pool: { query: jest.fn(), connect: jest.fn() } }));
jest.mock('../db/redis', () => ({ deleteCacheByPattern: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../middleware/rateLimiter', () => ({
  apiLimiter: (req, res, next) => next(),
  authLimiter: (req, res, next) => next(),
  csvLimiter: (req, res, next) => next(),
  demoStartLimiter: (req, res, next) => next(),
  onboardingInviteLimiter: (req, res, next) => next(),
  pushTokenLimiter: (req, res, next) => next(),
}));

const { pool } = require('../db/pool');
const app = require('../app');

beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
afterAll(() => { process.env.DISABLE_AUTH = 'true'; });

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const CHECKIN_ID = '550e8400-e29b-41d4-a716-446655440300';
const MGR_ID = '550e8400-e29b-41d4-a716-446655440301';
const SENIOR_ID = '550e8400-e29b-41d4-a716-446655440302';
const OTHER_SENIOR_ID = '550e8400-e29b-41d4-a716-446655440303';
const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440304';
const DIRECTOR_ID = '550e8400-e29b-41d4-a716-446655440305';
const EMPLOYEE_ID = '550e8400-e29b-41d4-a716-446655440306';
const ADMIN_TOKEN = makeToken({ user_id: ADMIN_ID, client_id: CLIENT_ID, role: 'admin' });

function mockClientQuery({ checkinEmployeeId, checkinRole, checkinReportsToId }) {
  return jest.fn().mockImplementation((sql) => {
    const s = sql.trim().toUpperCase();
    if (s.startsWith('BEGIN') || s.startsWith('COMMIT') || s.startsWith('ROLLBACK') || s.startsWith('SET LOCAL')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('FROM CHECKINS C') && s.includes('JOIN EMPLOYEES')) {
      return Promise.resolve({
        rows: [{
          id: CHECKIN_ID, employee_id: checkinEmployeeId, site_id: null,
          type: 'IN', timestamp: new Date().toISOString(),
          employee_role: checkinRole, employee_reports_to_id: checkinReportsToId,
        }],
      });
    }
    return Promise.resolve({ rows: [{ id: CHECKIN_ID, employee_id: checkinEmployeeId, type: 'IN', timestamp: new Date().toISOString() }] });
  });
}

beforeEach(() => jest.clearAllMocks());

describe('PUT /api/checkins/:id — hierarchy-aware correction', () => {
  it('blocks a manager from correcting their own check-in', async () => {
    pool.connect.mockResolvedValue({
      query: mockClientQuery({ checkinEmployeeId: MGR_ID, checkinRole: 'manager', checkinReportsToId: null }),
      release: jest.fn(),
    });
    const mgrToken = makeToken({ user_id: MGR_ID, client_id: CLIENT_ID, role: 'manager', employee_id: MGR_ID });

    const res = await request(app)
      .put(`/api/checkins/${CHECKIN_ID}`)
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ correction_note: 'oops' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_SELF_CORRECTION');
  });

  it('blocks a senior_manager who is NOT the reports_to_id target from correcting a manager', async () => {
    pool.connect.mockResolvedValue({
      query: mockClientQuery({ checkinEmployeeId: MGR_ID, checkinRole: 'manager', checkinReportsToId: SENIOR_ID }),
      release: jest.fn(),
    });
    const wrongSeniorToken = makeToken({ user_id: OTHER_SENIOR_ID, client_id: CLIENT_ID, role: 'senior_manager', employee_id: OTHER_SENIOR_ID });

    const res = await request(app)
      .put(`/api/checkins/${CHECKIN_ID}`)
      .set('Authorization', `Bearer ${wrongSeniorToken}`)
      .send({ correction_note: 'oops' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_HIERARCHY');
  });

  it('allows the exact reports_to_id senior_manager to correct their manager', async () => {
    pool.connect.mockResolvedValue({
      query: mockClientQuery({ checkinEmployeeId: MGR_ID, checkinRole: 'manager', checkinReportsToId: SENIOR_ID }),
      release: jest.fn(),
    });
    const rightSeniorToken = makeToken({ user_id: SENIOR_ID, client_id: CLIENT_ID, role: 'senior_manager', employee_id: SENIOR_ID });

    const res = await request(app)
      .put(`/api/checkins/${CHECKIN_ID}`)
      .set('Authorization', `Bearer ${rightSeniorToken}`)
      .send({ correction_note: 'approved fix' });

    expect(res.status).toBe(200);
  });

  it('allows admin to correct a manager regardless of reports_to_id', async () => {
    pool.connect.mockResolvedValue({
      query: mockClientQuery({ checkinEmployeeId: MGR_ID, checkinRole: 'manager', checkinReportsToId: null }),
      release: jest.fn(),
    });

    const res = await request(app)
      .put(`/api/checkins/${CHECKIN_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ correction_note: 'admin fix' });

    expect(res.status).toBe(200);
  });

  it('blocks a senior_manager from correcting a director (director has no reports_to_id)', async () => {
    pool.connect.mockResolvedValue({
      query: mockClientQuery({ checkinEmployeeId: DIRECTOR_ID, checkinRole: 'director', checkinReportsToId: null }),
      release: jest.fn(),
    });
    const seniorToken = makeToken({ user_id: SENIOR_ID, client_id: CLIENT_ID, role: 'senior_manager', employee_id: SENIOR_ID });

    const res = await request(app)
      .put(`/api/checkins/${CHECKIN_ID}`)
      .set('Authorization', `Bearer ${seniorToken}`)
      .send({ correction_note: 'oops' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_HIERARCHY');
  });

  it('allows admin to correct a director regardless of reports_to_id', async () => {
    pool.connect.mockResolvedValue({
      query: mockClientQuery({ checkinEmployeeId: DIRECTOR_ID, checkinRole: 'director', checkinReportsToId: null }),
      release: jest.fn(),
    });

    const res = await request(app)
      .put(`/api/checkins/${CHECKIN_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ correction_note: 'admin fix' });

    expect(res.status).toBe(200);
  });

  it('blocks a senior_manager from correcting a plain employee\'s check-in (no defined scope over regular employees — code review finding)', async () => {
    pool.connect.mockResolvedValue({
      query: mockClientQuery({ checkinEmployeeId: EMPLOYEE_ID, checkinRole: 'employee', checkinReportsToId: null }),
      release: jest.fn(),
    });
    const seniorToken = makeToken({ user_id: SENIOR_ID, client_id: CLIENT_ID, role: 'senior_manager', employee_id: SENIOR_ID });

    const res = await request(app)
      .put(`/api/checkins/${CHECKIN_ID}`)
      .set('Authorization', `Bearer ${seniorToken}`)
      .send({ correction_note: 'oops' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_ROLE');
  });

  it('blocks a director from correcting a plain employee\'s check-in', async () => {
    pool.connect.mockResolvedValue({
      query: mockClientQuery({ checkinEmployeeId: EMPLOYEE_ID, checkinRole: 'employee', checkinReportsToId: null }),
      release: jest.fn(),
    });
    const directorToken = makeToken({ user_id: DIRECTOR_ID, client_id: CLIENT_ID, role: 'director', employee_id: DIRECTOR_ID });

    const res = await request(app)
      .put(`/api/checkins/${CHECKIN_ID}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ correction_note: 'oops' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_ROLE');
  });

  it('still allows a manager to correct a plain employee\'s check-in (unaffected by the new guard)', async () => {
    pool.connect.mockResolvedValue({
      query: mockClientQuery({ checkinEmployeeId: EMPLOYEE_ID, checkinRole: 'employee', checkinReportsToId: null }),
      release: jest.fn(),
    });
    const mgrToken = makeToken({ user_id: MGR_ID, client_id: CLIENT_ID, role: 'manager', employee_id: MGR_ID });

    const res = await request(app)
      .put(`/api/checkins/${CHECKIN_ID}`)
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ correction_note: 'fix' });

    expect(res.status).toBe(200);
  });

  it('still allows admin to correct a plain employee\'s check-in (unaffected by the new guard)', async () => {
    pool.connect.mockResolvedValue({
      query: mockClientQuery({ checkinEmployeeId: EMPLOYEE_ID, checkinRole: 'employee', checkinReportsToId: null }),
      release: jest.fn(),
    });

    const res = await request(app)
      .put(`/api/checkins/${CHECKIN_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ correction_note: 'admin fix' });

    expect(res.status).toBe(200);
  });
});
