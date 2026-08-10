'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../db/pool', () => ({ pool: { query: jest.fn() } }));
jest.mock('../db/redis', () => ({ deleteCacheByPattern: jest.fn(), redisClient: { get: jest.fn(), set: jest.fn() } }));
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

const EMPLOYEE_ID = '11111111-1111-1111-1111-111111111111';
const CLIENT_ID = '22222222-2222-2222-2222-222222222222';

describe('POST /api/v1/timesheet/sign', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rifiuta la firma del mese corrente con 400 CANNOT_SIGN_CURRENT_MONTH (fix #2)', async () => {
    const token = makeToken({ user_id: EMPLOYEE_ID, employee_id: EMPLOYEE_ID, client_id: CLIENT_ID, role: 'employee' });
    const now = new Date();

    const res = await request(app)
      .post('/api/v1/timesheet/sign')
      .set('Authorization', `Bearer ${token}`)
      .send({ month: now.getUTCMonth() + 1, year: now.getUTCFullYear() });

    expect(res.status).toBe(400);
    expect(res.body.details?.code || res.body.error).toBe('CANNOT_SIGN_CURRENT_MONTH');
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('firma un mese passato: calcola lo snapshot e fa upsert (fix #1, idempotente)', async () => {
    const token = makeToken({ user_id: EMPLOYEE_ID, employee_id: EMPLOYEE_ID, client_id: CLIENT_ID, role: 'employee' });

    pool.query
      .mockResolvedValueOnce({ rows: [] }) // check-ins del mese (vuoto: snapshot a 0)
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: 6 }] }) // meal voucher config
      .mockResolvedValueOnce({ rows: [{ id: 'sig-1', status: 'signed', signed_at: '2026-08-10T10:00:00Z' }] }) // upsert
      .mockResolvedValue({ rows: [] }); // fallback (audit SAVEPOINT/INSERT/RELEASE)

    const res = await request(app)
      .post('/api/v1/timesheet/sign')
      .set('Authorization', `Bearer ${token}`)
      .send({ month: 6, year: 2026 });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('signed');

    const upsertCall = pool.query.mock.calls[2];
    expect(upsertCall[0]).toMatch(/ON CONFLICT \(employee_id, month, year\)/i);
  });

  it('rifiuta con 403 un account senza profilo dipendente', async () => {
    const token = makeToken({ user_id: 'admin-1', client_id: CLIENT_ID, role: 'admin' });

    const res = await request(app)
      .post('/api/v1/timesheet/sign')
      .set('Authorization', `Bearer ${token}`)
      .send({ month: 6, year: 2026 });

    expect(res.status).toBe(403);
  });
});
