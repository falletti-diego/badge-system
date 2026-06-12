/**
 * API Tests: Leave Request Endpoints
 * Tests for POST /api/v1/leave/request, GET /api/v1/leave/pending, PUT /api/v1/leave/:id/approve
 * Uses mocked database for deterministic testing.
 */

jest.mock('../middleware/rateLimiter', () => {
  const passThrough = (req, res, next) => next();
  return { apiLimiter: passThrough, authLimiter: passThrough, csvLimiter: passThrough };
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
    const mockClient = {
      query: pool.query,
      release: jest.fn(),
    };
    try {
      return await cb(mockClient);
    } catch (err) {
      throw err;
    }
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
const TEST_LEAVE_ID = '550e8400-e29b-41d4-a716-446655440200';

const makeToken = (claims = {}) => jwt.sign(
  {
    user_id: TEST_ADMIN_ID,
    client_id: TEST_CLIENT_ID,
    role: 'admin',
    ...claims,
  },
  process.env.JWT_PRIVATE_KEY,
  { algorithm: 'RS256', expiresIn: '15m' }
);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Leave Request API Endpoints — Validation', () => {
  describe('POST /api/v1/leave/request', () => {
    it('should return 400 for missing leave_type', async () => {
      const res = await request(app)
        .post('/api/v1/leave/request')
        .send({
          start_date: '2026-06-15',
          end_date: '2026-06-20',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 for invalid date format', async () => {
      const res = await request(app)
        .post('/api/v1/leave/request')
        .send({
          leave_type: 'FERIE_1',
          start_date: '15/06/2026',
          end_date: '2026-06-20',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 for end_date before start_date', async () => {
      const res = await request(app)
        .post('/api/v1/leave/request')
        .send({
          leave_type: 'FERIE_1',
          start_date: '2026-06-20',
          end_date: '2026-06-15',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 for invalid leave_type', async () => {
      const res = await request(app)
        .post('/api/v1/leave/request')
        .send({
          leave_type: 'INVALID_TYPE',
          start_date: '2026-06-15',
          end_date: '2026-06-20',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });
  });

  describe('PUT /api/v1/leave/:id/approve', () => {
    it('should return 400 for invalid status', async () => {
      const res = await request(app)
        .put(`/api/v1/leave/${TEST_LEAVE_ID}/approve`)
        .send({
          status: 'WITHDRAWN',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 for REJECTED without rejection_reason', async () => {
      const res = await request(app)
        .put(`/api/v1/leave/${TEST_LEAVE_ID}/approve`)
        .send({
          status: 'REJECTED',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 for invalid leave ID (not UUID)', async () => {
      const res = await request(app)
        .put('/api/v1/leave/not-uuid/approve')
        .send({
          status: 'APPROVED',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });
  });
});

describe('Leave Request API Endpoints — Response Structure', () => {
  describe('GET /api/v1/leave/pending', () => {
    it('should return 200 with array for pending requests', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_LEAVE_ID,
            user_id: TEST_EMPLOYEE_ID,
            employee_name: 'John Doe',
            status: 'PENDING',
          },
        ],
      });

      const res = await request(app).get('/api/v1/leave/pending');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/leave/my-requests', () => {
    it('should return 200 with array for my requests', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_LEAVE_ID,
            user_id: TEST_EMPLOYEE_ID,
            status: 'PENDING',
          },
        ],
      });

      const res = await request(app).get('/api/v1/leave/my-requests');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});

describe('Leave Request API Endpoints — Security Regression Tests', () => {
  const originalDisableAuth = process.env.DISABLE_AUTH;

  beforeAll(() => {
    process.env.DISABLE_AUTH = 'false';
  });

  afterAll(() => {
    process.env.DISABLE_AUTH = originalDisableAuth;
  });

  describe('GET /api/v1/leave/pending', () => {
    it('should fail closed for roles that are not admin or assigned manager', async () => {
      const viewerToken = makeToken({
        user_id: '550e8400-e29b-41d4-a716-446655440300',
        role: 'viewer',
      });

      const res = await request(app)
        .get('/api/v1/leave/pending')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/v1/leave/:id/approve', () => {
    it('should not reveal processed status to callers without approval permission', async () => {
      const viewerToken = makeToken({
        user_id: '550e8400-e29b-41d4-a716-446655440300',
        role: 'viewer',
      });

      const res = await request(app)
        .put(`/api/v1/leave/${TEST_LEAVE_ID}/approve`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should reject already processed requests before mutating saldo or shifts', async () => {
      const adminToken = makeToken();
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_LEAVE_ID,
          client_id: TEST_CLIENT_ID,
          user_id: TEST_EMPLOYEE_ID,
          leave_type: 'FERIE_1',
          start_date: '2026-06-15',
          end_date: '2026-06-20',
          num_days: 6,
          status: 'APPROVED',
        }],
      });

      const res = await request(app)
        .put(`/api/v1/leave/${TEST_LEAVE_ID}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe('Leave request has already been processed');
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('should reject stale concurrent approvals when atomic PENDING update affects no rows', async () => {
      const adminToken = makeToken();
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_LEAVE_ID,
            client_id: TEST_CLIENT_ID,
            user_id: TEST_EMPLOYEE_ID,
            leave_type: 'FERIE_1',
            start_date: '2026-06-15',
            end_date: '2026-06-20',
            num_days: 6,
            status: 'PENDING',
          }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put(`/api/v1/leave/${TEST_LEAVE_ID}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe('Leave request has already been processed');
      expect(mockPool.query).toHaveBeenCalledTimes(2);
      expect(mockPool.query.mock.calls[1][0]).toContain("WHERE id = $4::uuid AND status = 'PENDING'");
    });
  });
});
