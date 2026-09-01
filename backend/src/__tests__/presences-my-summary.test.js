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
  pushTokenLimiter: (req, res, next) => next(),
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

describe('GET /api/v1/presences/my-summary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ritorna solo i propri check-in, mai quelli di un altro dipendente (nessun employee_id accettato in query)', async () => {
    const token = makeToken({ user_id: EMPLOYEE_ID, employee_id: EMPLOYEE_ID, client_id: CLIENT_ID, role: 'employee' });

    pool.query
      .mockResolvedValueOnce({ rows: [
        { id: 'c1', employee_id: EMPLOYEE_ID, timestamp: '2026-07-01T08:00:00Z', type: 'IN' },
        { id: 'c2', employee_id: EMPLOYEE_ID, timestamp: '2026-07-01T17:00:00Z', type: 'OUT' },
      ] }) // check-ins query
      .mockResolvedValueOnce({ rows: [] }) // approved events query
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: 6 }] }) // client meal voucher config
      .mockResolvedValueOnce({ rows: [] }); // signature lookup: nessuna firma

    const res = await request(app)
      .get('/api/v1/presences/my-summary?month=7&year=2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.period).toEqual({ month: 7, year: 2026 });
    expect(res.body.data.signature).toBeNull();
    expect(pool.query.mock.calls[0][1]).toContain(EMPLOYEE_ID);
  });

  it('espone lo stato della firma quando esiste', async () => {
    const token = makeToken({ user_id: EMPLOYEE_ID, employee_id: EMPLOYEE_ID, client_id: CLIENT_ID, role: 'employee' });

    pool.query
      .mockResolvedValueOnce({ rows: [] }) // check-ins query
      .mockResolvedValueOnce({ rows: [] }) // approved events query
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: 6 }] })
      .mockResolvedValueOnce({ rows: [{ status: 'signed', signed_at: '2026-08-02T09:14:00Z' }] });

    const res = await request(app)
      .get('/api/v1/presences/my-summary?month=7&year=2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.signature).toEqual({ status: 'signed', signed_at: '2026-08-02T09:14:00Z' });
  });

  it.each(['senior_manager', 'director'])('un %s con employee_id ottiene il proprio riepilogo (self-scoped, nessun branch di ruolo)', async (role) => {
    const token = makeToken({ user_id: EMPLOYEE_ID, employee_id: EMPLOYEE_ID, client_id: CLIENT_ID, role });

    pool.query
      .mockResolvedValueOnce({ rows: [
        { id: 'c1', employee_id: EMPLOYEE_ID, timestamp: '2026-07-01T08:00:00Z', type: 'IN' },
        { id: 'c2', employee_id: EMPLOYEE_ID, timestamp: '2026-07-01T17:00:00Z', type: 'OUT' },
      ] }) // check-ins query
      .mockResolvedValueOnce({ rows: [] }) // approved events query
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: 6 }] }) // client meal voucher config
      .mockResolvedValueOnce({ rows: [] }); // signature lookup

    const res = await request(app)
      .get('/api/v1/presences/my-summary?month=7&year=2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.period).toEqual({ month: 7, year: 2026 });
    // employee_id sempre da req.user, mai da input
    expect(pool.query.mock.calls[0][1]).toContain(EMPLOYEE_ID);
  });

  it('rifiuta con 403 un account senza profilo dipendente', async () => {
    const token = makeToken({ user_id: 'admin-1', client_id: CLIENT_ID, role: 'admin' });

    const res = await request(app)
      .get('/api/v1/presences/my-summary?month=7&year=2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
