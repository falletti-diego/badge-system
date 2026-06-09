/**
 * Unit/Integration Tests: Check-ins API
 * Pool and Redis are mocked — no real DB connection required.
 * DISABLE_AUTH=true (set in jest.setup.js) bypasses JWT validation.
 */

// Bypass rate limiting in tests
jest.mock('../middleware/rateLimiter', () => {
  const passThrough = (req, res, next) => next();
  return { apiLimiter: passThrough, authLimiter: passThrough, csvLimiter: passThrough };
});

jest.mock('../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../db/redis', () => ({
  initializeRedis: jest.fn().mockResolvedValue(null),
  closeRedis: jest.fn().mockResolvedValue(undefined),
  isRedisAvailable: jest.fn().mockReturnValue(false),
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  deleteCacheByPattern: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../middleware/db-transaction', () => ({
  withTransaction: jest.fn(async (cb) => {
    const { pool } = require('../db/pool');
    const mockClient = {
      query: pool.query,
      release: jest.fn(),
    };
    await pool.query('BEGIN');
    try {
      const result = await cb(mockClient);
      await pool.query('COMMIT');
      return result;
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  }),
}));

const request = require('supertest');
const app = require('../app');
const { pool } = require('../db/pool');

const TEST_CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const TEST_EMPLOYEE_ID = '550e8400-e29b-41d4-a716-446655440100';
const TEST_SITE_ID = '550e8400-e29b-41d4-a716-446655440010';
const TEST_CHECKIN_ID = '550e8400-e29b-41d4-a716-446655440200';

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// POST /api/checkins — Validation (no DB needed)
// =====================================================

describe('POST /api/checkins — validation', () => {
  test('rejects missing type (400)', async () => {
    const res = await request(app)
      .post('/api/checkins')
      .send({ employee_id: TEST_EMPLOYEE_ID, site_id: TEST_SITE_ID });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  test('rejects invalid employee_id UUID (400)', async () => {
    const res = await request(app)
      .post('/api/checkins')
      .send({ employee_id: 'not-a-uuid', site_id: TEST_SITE_ID, type: 'IN' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  test('rejects invalid type value (400)', async () => {
    const res = await request(app)
      .post('/api/checkins')
      .send({ employee_id: TEST_EMPLOYEE_ID, site_id: TEST_SITE_ID, type: 'MAYBE' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  test('rejects empty body (400)', async () => {
    const res = await request(app).post('/api/checkins').send({});
    expect(res.status).toBe(400);
  });
});

// =====================================================
// POST /api/checkins — Success path (mocked DB)
// =====================================================

describe('POST /api/checkins — success', () => {
  test('creates check-in and returns 201', async () => {
    // withTransaction mock calls pool.query: BEGIN, employee, site, assignment, INSERT, audit, COMMIT
    pool.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: TEST_EMPLOYEE_ID, client_id: TEST_CLIENT_ID }] }) // employee
      .mockResolvedValueOnce({ rows: [{ id: TEST_SITE_ID }] }) // site
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // assignment
      .mockResolvedValueOnce({
        rows: [{
          id: TEST_CHECKIN_ID,
          employee_id: TEST_EMPLOYEE_ID,
          site_id: TEST_SITE_ID,
          type: 'IN',
          timestamp: new Date().toISOString(),
          created_at: new Date().toISOString(),
        }],
      }) // INSERT
      .mockResolvedValueOnce({}) // audit log INSERT
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .post('/api/checkins')
      .send({ employee_id: TEST_EMPLOYEE_ID, site_id: TEST_SITE_ID, type: 'IN' });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.type).toBe('IN');
    expect(res.body.message).toBe('Check-in created successfully');
  });

  test('returns 404 when employee not found in DB', async () => {
    pool.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // employee not found
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await request(app)
      .post('/api/checkins')
      .send({ employee_id: TEST_EMPLOYEE_ID, site_id: TEST_SITE_ID, type: 'IN' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('EMPLOYEE_NOT_FOUND');
  });

  test('returns 404 when site not found', async () => {
    pool.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: TEST_EMPLOYEE_ID, client_id: TEST_CLIENT_ID }] }) // employee OK
      .mockResolvedValueOnce({ rows: [] }) // site not found
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await request(app)
      .post('/api/checkins')
      .send({ employee_id: TEST_EMPLOYEE_ID, site_id: TEST_SITE_ID, type: 'IN' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('SITE_NOT_FOUND');
  });

  test('returns 400 when employee not assigned to site', async () => {
    pool.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: TEST_EMPLOYEE_ID, client_id: TEST_CLIENT_ID }] }) // employee
      .mockResolvedValueOnce({ rows: [{ id: TEST_SITE_ID }] }) // site
      .mockResolvedValueOnce({ rows: [] }) // assignment: not assigned
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await request(app)
      .post('/api/checkins')
      .send({ employee_id: TEST_EMPLOYEE_ID, site_id: TEST_SITE_ID, type: 'IN' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

// =====================================================
// GET /api/checkins — Validation + mocked results
// =====================================================

describe('GET /api/checkins', () => {
  test('returns 200 with empty array when no checkins', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // checkins
      .mockResolvedValueOnce({ rows: [{ total: '0' }] }); // count

    const res = await request(app)
      .get('/api/checkins')
      .query({ client_id: TEST_CLIENT_ID });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toHaveProperty('total');
  });

  test('returns 200 with results and pagination', async () => {
    const mockCheckins = [
      { id: TEST_CHECKIN_ID, employee_id: TEST_EMPLOYEE_ID, type: 'IN', timestamp: new Date().toISOString() },
    ];
    pool.query
      .mockResolvedValueOnce({ rows: mockCheckins }) // data
      .mockResolvedValueOnce({ rows: [{ total: '1' }] }); // count

    const res = await request(app)
      .get('/api/checkins')
      .query({ client_id: TEST_CLIENT_ID, limit: 10, offset: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.pagination.limit).toBe(10);
  });

  test('returns 400 when date range exceeds 90 days', async () => {
    const res = await request(app)
      .get('/api/checkins')
      .query({ client_id: TEST_CLIENT_ID, date_from: '2025-01-01', date_to: '2025-05-01' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  test('returns 400 for invalid date format', async () => {
    const res = await request(app)
      .get('/api/checkins')
      .query({ client_id: TEST_CLIENT_ID, date_from: '01-01-2026' });

    expect(res.status).toBe(400);
  });
});

// =====================================================
// PUT /api/checkins/:id — Validation + mocked results
// =====================================================

describe('PUT /api/checkins/:id', () => {
  test('returns 400 for invalid UUID in path', async () => {
    const res = await request(app)
      .put('/api/checkins/not-a-uuid')
      .send({ type: 'OUT' });

    expect(res.status).toBe(400);
  });

  test('returns 404 when checkin not found', async () => {
    pool.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // checkin query → not found
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await request(app)
      .put(`/api/checkins/${TEST_CHECKIN_ID}`)
      .send({ type: 'OUT' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('CHECKIN_NOT_FOUND');
  });

  test('returns 400 when correction window has passed (>7 days)', async () => {
    const oldTimestamp = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(); // 8 days ago
    pool.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: TEST_CHECKIN_ID, type: 'IN', timestamp: oldTimestamp, site_id: TEST_SITE_ID }],
      }) // checkin found
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await request(app)
      .put(`/api/checkins/${TEST_CHECKIN_ID}`)
      .send({ type: 'OUT' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('corrects checkin within time window', async () => {
    const recentTimestamp = new Date(Date.now() - 60 * 1000).toISOString(); // 1 min ago
    pool.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: TEST_CHECKIN_ID, type: 'IN', timestamp: recentTimestamp, site_id: TEST_SITE_ID }],
      }) // fetch checkin
      .mockResolvedValueOnce({
        rows: [{
          id: TEST_CHECKIN_ID,
          type: 'OUT',
          timestamp: recentTimestamp,
          modified_at: new Date().toISOString(),
          modified_by_name: 'mvp-user-1',
          employee_id: TEST_EMPLOYEE_ID,
          site_id: TEST_SITE_ID,
          correction_note: null,
        }],
      }) // UPDATE
      .mockResolvedValueOnce({}) // audit INSERT
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .put(`/api/checkins/${TEST_CHECKIN_ID}`)
      .send({ type: 'OUT' });

    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('OUT');
    expect(res.body.data.modified_at).toBeDefined();
  });
});
