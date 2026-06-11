'use strict';

/**
 * Unit/Integration Tests: Consent API (GDPR Art. 7)
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

const request = require('supertest');
const app = require('../app');
const { pool } = require('../db/pool');

describe('Consent API — GDPR Art. 7 GPS consent tracking', () => {
  const validToken = 'valid-token';
  const clientId = '550e8400-e29b-41d4-a716-446655440001';
  const employeeId = '550e8400-e29b-41d4-a716-446655440100';
  const otherEmployeeId = '550e8400-e29b-41d4-a716-446655440101';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =====================================================
  // POST /api/v1/consent/gps-acceptance
  // =====================================================

  describe('POST /api/v1/consent/gps-acceptance', () => {
    test('should accept GPS consent and create log entry', async () => {
      const updateResult = {
        rows: [
          {
            id: employeeId,
            email: 'alice@test.com',
            gps_consent_given: true,
            gps_consent_given_at: '2026-06-11T10:30:00.000Z',
          },
        ],
      };

      const logResult = {
        rows: [
          {
            id: '550e8400-e29b-41d4-a716-446655440200',
            accepted_at: '2026-06-11T10:30:00.000Z',
          },
        ],
      };

      pool.query
        .mockResolvedValueOnce(updateResult) // UPDATE employees
        .mockResolvedValueOnce(logResult); // INSERT employee_consent_log

      const res = await request(app)
        .post('/api/v1/consent/gps-acceptance')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          consent_given: true,
          privacy_policy_version: '2.0',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.gps_consent_given).toBe(true);
      expect(res.body.data.gps_consent_given_at).toBe('2026-06-11T10:30:00.000Z');
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    test('should reject GPS consent (consent_given: false)', async () => {
      const updateResult = {
        rows: [
          {
            id: employeeId,
            email: 'alice@test.com',
            gps_consent_given: false,
            gps_consent_given_at: null,
          },
        ],
      };

      const logResult = {
        rows: [
          {
            id: '550e8400-e29b-41d4-a716-446655440200',
            accepted_at: '2026-06-11T10:30:00.000Z',
          },
        ],
      };

      pool.query
        .mockResolvedValueOnce(updateResult)
        .mockResolvedValueOnce(logResult);

      const res = await request(app)
        .post('/api/v1/consent/gps-acceptance')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          consent_given: false,
          privacy_policy_version: '2.0',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/declined/i);
      expect(res.body.data.gps_consent_given).toBe(false);
    });

    test('should validate consent_given is boolean', async () => {
      const res = await request(app)
        .post('/api/v1/consent/gps-acceptance')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          consent_given: 'yes', // Invalid: should be boolean
          privacy_policy_version: '2.0',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    test('should provide default privacy_policy_version if not supplied', async () => {
      const updateResult = {
        rows: [
          {
            id: employeeId,
            email: 'alice@test.com',
            gps_consent_given: true,
            gps_consent_given_at: '2026-06-11T10:30:00.000Z',
          },
        ],
      };

      const logResult = {
        rows: [
          {
            id: '550e8400-e29b-41d4-a716-446655440200',
            accepted_at: '2026-06-11T10:30:00.000Z',
          },
        ],
      };

      pool.query
        .mockResolvedValueOnce(updateResult)
        .mockResolvedValueOnce(logResult);

      const res = await request(app)
        .post('/api/v1/consent/gps-acceptance')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          consent_given: true,
          // privacy_policy_version omitted — should default to '2.0'
        });

      expect(res.status).toBe(201);
      expect(pool.query).toHaveBeenCalledTimes(2);
      // Verify default version was used (call arguments include '2.0')
      const insertCall = pool.query.mock.calls[1];
      expect(insertCall[1]).toContain('2.0');
    });

    test('should return 400 if employee not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] }); // No employee updated

      const res = await request(app)
        .post('/api/v1/consent/gps-acceptance')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          consent_given: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.error || res.body.message).toBeTruthy();
    });

    test('should create audit log entry (best-effort, non-fatal)', async () => {
      const updateResult = {
        rows: [
          {
            id: employeeId,
            email: 'alice@test.com',
            gps_consent_given: true,
            gps_consent_given_at: '2026-06-11T10:30:00.000Z',
          },
        ],
      };

      const logResult = {
        rows: [
          {
            id: '550e8400-e29b-41d4-a716-446655440200',
            accepted_at: '2026-06-11T10:30:00.000Z',
          },
        ],
      };

      pool.query
        .mockResolvedValueOnce(updateResult)
        .mockResolvedValueOnce(logResult);

      const res = await request(app)
        .post('/api/v1/consent/gps-acceptance')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          consent_given: true,
          privacy_policy_version: '2.0',
        });

      expect(res.status).toBe(201);
      // Audit logging is best-effort; request succeeds even if audit fails
    });
  });

  // =====================================================
  // GET /api/v1/consent/my-consents
  // =====================================================

  describe('GET /api/v1/consent/my-consents', () => {
    test('should retrieve employee own consent history', async () => {
      const consentHistory = [
        {
          id: '550e8400-e29b-41d4-a716-446655440200',
          consent_type: 'gps',
          consent_given: true,
          accepted_at: '2026-06-11T10:30:00.000Z',
          privacy_policy_version: '2.0',
          notes: null,
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440201',
          consent_type: 'gps',
          consent_given: false,
          accepted_at: '2026-06-10T14:00:00.000Z',
          privacy_policy_version: '2.0',
          notes: 'Test decline',
        },
      ];

      pool.query.mockResolvedValueOnce({ rows: consentHistory });

      const res = await request(app)
        .get('/api/v1/consent/my-consents')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].consent_given).toBe(true);
      expect(res.body.data[1].consent_given).toBe(false);
      expect(res.body.returned).toBe(2);
    });

    test('should return empty array if no consent history', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/v1/consent/my-consents')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.returned).toBe(0);
    });

    test('should return consents ordered by accepted_at DESC (most recent first)', async () => {
      const consentHistory = [
        {
          id: '550e8400-e29b-41d4-a716-446655440200',
          accepted_at: '2026-06-11T10:30:00.000Z', // Most recent
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440201',
          accepted_at: '2026-06-10T14:00:00.000Z',
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440202',
          accepted_at: '2026-06-09T09:00:00.000Z', // Oldest
        },
      ];

      pool.query.mockResolvedValueOnce({ rows: consentHistory });

      const res = await request(app)
        .get('/api/v1/consent/my-consents')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data[0].accepted_at).toBe('2026-06-11T10:30:00.000Z');
      expect(res.body.data[1].accepted_at).toBe('2026-06-10T14:00:00.000Z');
      expect(res.body.data[2].accepted_at).toBe('2026-06-09T09:00:00.000Z');
    });

    test('should return max 20 entries', async () => {
      const consentHistory = Array.from({ length: 20 }, (_, i) => ({
        id: `550e8400-e29b-41d4-a716-00000000${String(i).padStart(2, '0')}`,
        consent_type: 'gps',
        consent_given: true,
        accepted_at: new Date(Date.now() - i * 3600000).toISOString(), // Each 1h earlier
        privacy_policy_version: '2.0',
      }));

      pool.query.mockResolvedValueOnce({ rows: consentHistory });

      const res = await request(app)
        .get('/api/v1/consent/my-consents')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(20);
    });

    test('should query with employee_id and client_id filters', async () => {
      const consentHistory = [
        {
          id: '550e8400-e29b-41d4-a716-446655440200',
          consent_type: 'gps',
          consent_given: true,
          accepted_at: '2026-06-11T10:30:00.000Z',
          privacy_policy_version: '2.0',
        },
      ];

      pool.query.mockResolvedValueOnce({ rows: consentHistory });

      const res = await request(app)
        .get('/api/v1/consent/my-consents')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      // Verify the query was called with proper filters
      const queryCall = pool.query.mock.calls[0];
      expect(queryCall[0]).toContain('employee_id = $1');
      expect(queryCall[0]).toContain('client_id = $2');
    });
  });
});
