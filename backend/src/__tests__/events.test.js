/**
 * API Tests: Event Request Endpoints (Eventi/Training)
 * Uses mocked database for deterministic testing — mirrors leaves.test.js.
 */

jest.mock('../middleware/rateLimiter', () => {
  const passThrough = (req, res, next) => next();
  return { apiLimiter: passThrough, authLimiter: passThrough, csvLimiter: passThrough, demoStartLimiter: passThrough, onboardingInviteLimiter: passThrough };
});

jest.mock('../db/redis', () => ({
  initializeRedis: jest.fn().mockResolvedValue(null),
  closeRedis: jest.fn().mockResolvedValue(undefined),
  isRedisAvailable: jest.fn().mockReturnValue(false),
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  deleteCacheByPattern: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../middleware/db-transaction', () => ({
  withTransaction: jest.fn(async (cb) => {
    const { pool } = require('../db/pool');
    const mockClient = { query: pool.query, release: jest.fn() };
    return await cb(mockClient);
  }),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { pool: mockPool } = require('../db/pool');

const TEST_CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const TEST_SITE_ID = '550e8400-e29b-41d4-a716-446655440010';
const TEST_EMPLOYEE_ID = '550e8400-e29b-41d4-a716-446655440100';
const TEST_MANAGER_ID = '550e8400-e29b-41d4-a716-446655440101';
const TEST_ADMIN_ID = '550e8400-e29b-41d4-a716-446655440102';
const TEST_EVENT_ID = '550e8400-e29b-41d4-a716-446655440200';

const makeToken = (claims = {}) => jwt.sign(
  { user_id: TEST_ADMIN_ID, client_id: TEST_CLIENT_ID, role: 'admin', ...claims },
  process.env.JWT_PRIVATE_KEY,
  { algorithm: 'RS256', expiresIn: '15m' }
);

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Event Request API Endpoints — Validation', () => {
  describe('POST /api/v1/events/request', () => {
    it('should return 400 for missing event_date', async () => {
      const res = await request(app)
        .post('/api/v1/events/request')
        .send({ start_time: '08:00', end_time: '18:00', description: 'Conferenza di settore' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 for invalid time format', async () => {
      const res = await request(app)
        .post('/api/v1/events/request')
        .send({
          event_date: todayISO(),
          start_time: '8:00',
          end_time: '18:00',
          description: 'Conferenza di settore',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 when end_time is not after start_time', async () => {
      const res = await request(app)
        .post('/api/v1/events/request')
        .send({
          event_date: todayISO(),
          start_time: '18:00',
          end_time: '08:00',
          description: 'Conferenza di settore',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 for description shorter than 10 characters', async () => {
      const res2 = await request(app)
        .post('/api/v1/events/request')
        .send({ event_date: todayISO(), start_time: '08:00', end_time: '18:00', description: 'corta' });

      expect(res2.status).toBe(400);
      expect(res2.body.error).toBe('Validation Error');
    });

    it('should return 400 for event_date more than 7 days in the past', async () => {
      const tenDaysAgo = new Date();
      tenDaysAgo.setUTCDate(tenDaysAgo.getUTCDate() - 10);
      const res = await request(app)
        .post('/api/v1/events/request')
        .send({
          event_date: tenDaysAgo.toISOString().split('T')[0],
          start_time: '08:00',
          end_time: '18:00',
          description: 'Conferenza di settore',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });
  });
});

describe('Event Request API Endpoints — Conflict Detection', () => {
  const originalDisableAuth = process.env.DISABLE_AUTH;
  beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
  afterAll(() => { process.env.DISABLE_AUTH = originalDisableAuth; });

  it('rejects the request with 409 when a conflicting record exists for that date', async () => {
    const employeeToken = makeToken({ user_id: TEST_EMPLOYEE_ID, role: 'employee' });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_EMPLOYEE_ID, client_id: TEST_CLIENT_ID }] }) // employee lookup
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // conflict found

    const res = await request(app)
      .post('/api/v1/events/request')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ event_date: todayISO(), start_time: '08:00', end_time: '18:00', description: 'Conferenza di settore' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('creates the request when no conflict exists', async () => {
    const employeeToken = makeToken({ user_id: TEST_EMPLOYEE_ID, role: 'employee' });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_EMPLOYEE_ID, client_id: TEST_CLIENT_ID }] }) // employee lookup
      .mockResolvedValueOnce({ rows: [] }) // no conflict
      .mockResolvedValueOnce({ rows: [{ id: TEST_EVENT_ID, status: 'PENDING' }] }); // insert

    const res = await request(app)
      .post('/api/v1/events/request')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ event_date: todayISO(), start_time: '08:00', end_time: '18:00', description: 'Conferenza di settore' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(TEST_EVENT_ID);
  });
});

describe('Event Request API Endpoints — Response Structure', () => {
  describe('GET /api/v1/events/pending', () => {
    it('should return 200 with array for pending requests', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: TEST_EVENT_ID, user_id: TEST_EMPLOYEE_ID, employee_name: 'John Doe', status: 'PENDING' }],
      });

      const res = await request(app).get('/api/v1/events/pending');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/events/my-requests', () => {
    it('should return 200 with array for my requests', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: TEST_EVENT_ID, user_id: TEST_EMPLOYEE_ID, status: 'PENDING' }],
      });

      const res = await request(app).get('/api/v1/events/my-requests');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});

describe('Event Request API Endpoints — Security Regression Tests', () => {
  const originalDisableAuth = process.env.DISABLE_AUTH;
  beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
  afterAll(() => { process.env.DISABLE_AUTH = originalDisableAuth; });

  describe('GET /api/v1/events/pending', () => {
    it('should fail closed for roles that are not admin or assigned manager', async () => {
      const viewerToken = makeToken({ user_id: '550e8400-e29b-41d4-a716-446655440300', role: 'viewer' });

      const res = await request(app)
        .get('/api/v1/events/pending')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should return manager scoped pending requests (own store employees)', async () => {
      const managerToken = makeToken({
        role: 'manager',
        site_id: TEST_SITE_ID,
        user_id: TEST_MANAGER_ID,
      });

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_EVENT_ID,
          user_id: TEST_EMPLOYEE_ID,
          status: 'PENDING',
          employee_name: 'Maria Rossi',
        }],
      });

      const res = await request(app)
        .get('/api/v1/events/pending')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('e.site_id = $2::uuid'),
        [TEST_CLIENT_ID, TEST_SITE_ID]
      );
    });
  });

  describe('PUT /api/v1/events/:id/approve', () => {
    it('should not reveal processed status to callers without approval permission', async () => {
      const viewerToken = makeToken({ user_id: '550e8400-e29b-41d4-a716-446655440300', role: 'viewer' });

      const res = await request(app)
        .put(`/api/v1/events/${TEST_EVENT_ID}/approve`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should reject already processed requests before mutating anything', async () => {
      const adminToken = makeToken();
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_EVENT_ID, client_id: TEST_CLIENT_ID, user_id: TEST_EMPLOYEE_ID,
          event_date: todayISO(), start_time: '08:00:00', end_time: '18:00:00', status: 'APPROVED',
        }],
      });

      const res = await request(app)
        .put(`/api/v1/events/${TEST_EVENT_ID}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe('Event request has already been processed');
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('should reject stale concurrent approvals when atomic PENDING update affects no rows', async () => {
      const adminToken = makeToken();
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_EVENT_ID,
            client_id: TEST_CLIENT_ID,
            user_id: TEST_EMPLOYEE_ID,
            event_date: todayISO(),
            start_time: '08:00:00',
            end_time: '18:00:00',
            status: 'PENDING',
          }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put(`/api/v1/events/${TEST_EVENT_ID}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe('Event request has already been processed');
      expect(mockPool.query).toHaveBeenCalledTimes(2);
      expect(mockPool.query.mock.calls[1][0]).toContain('WHERE id = $4::uuid AND status = \'PENDING\'');
    });
  });
});
