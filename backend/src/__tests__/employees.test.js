/**
 * Unit Tests: Employees API (GET /api/employees)
 * Pool and Redis are mocked — no real DB connection required.
 * DISABLE_AUTH=true (from jest.setup.js) bypasses JWT validation.
 */

jest.mock('../middleware/rateLimiter', () => {
  const passThrough = (req, res, next) => next();
  return { apiLimiter: passThrough, authLimiter: passThrough, csvLimiter: passThrough, demoStartLimiter: passThrough };
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

const request = require('supertest');
const app = require('../app');
const { pool } = require('../db/pool');

const TEST_CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const TEST_SITE_ID = '550e8400-e29b-41d4-a716-446655440010';

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// GET /api/employees
// =====================================================

describe('GET /api/employees', () => {
  const mockEmployees = [
    {
      id: '550e8400-e29b-41d4-a716-446655440100',
      client_id: TEST_CLIENT_ID,
      email: 'alice@torino.it',
      name: 'Alice Rossi',
      phone: null,
      assigned_sites: [TEST_SITE_ID],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  test('returns 200 with employee list', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: mockEmployees }) // data
      .mockResolvedValueOnce({ rows: [{ total: '1' }] }); // count

    const res = await request(app).get('/api/v1/employees');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.pagination).toHaveProperty('total', 1);
  });

  test('returns 200 with empty list', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] });

    const res = await request(app).get('/api/v1/employees');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  test('returns 400 for invalid limit', async () => {
    const res = await request(app).get('/api/v1/employees').query({ limit: 9999 });
    expect(res.status).toBe(400);
  });

  test('supports pagination params', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: mockEmployees })
      .mockResolvedValueOnce({ rows: [{ total: '1' }] });

    const res = await request(app).get('/api/v1/employees').query({ limit: 5, offset: 0 });

    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(5);
    expect(res.body.pagination.offset).toBe(0);
  });
});

// =====================================================
// GET /api/employees/:id
// =====================================================

describe('GET /api/employees/:id', () => {
  const TEST_EMP_ID = '550e8400-e29b-41d4-a716-446655440100';

  test('returns 200 for existing employee', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: TEST_EMP_ID,
        client_id: TEST_CLIENT_ID,
        email: 'alice@torino.it',
        name: 'Alice Rossi',
        phone: null,
        assigned_sites: [TEST_SITE_ID],
      }],
    });

    const res = await request(app).get(`/api/v1/employees/${TEST_EMP_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(TEST_EMP_ID);
    expect(res.body.data.name).toBe('Alice Rossi');
  });

  test('returns 404 for non-existent employee', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/api/v1/employees/${TEST_EMP_ID}`);

    expect(res.status).toBe(404);
  });

  test('returns 404 for random unknown UUID', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const unknownId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).get(`/api/v1/employees/${unknownId}`);
    expect(res.status).toBe(404);
  });
});
