/**
 * Smart Working API Tests
 * POST /api/v1/smart-working
 * GET /api/v1/smart-working/my-history
 */

const request = require('supertest');
const express = require('express');
const { v4: uuidv4 } = require('uuid');

jest.mock('../db/pool');
jest.mock('../middleware/audit');
jest.mock('../middleware/db-transaction');
jest.mock('../utils/logger');
jest.mock('../middleware/auth', () => ({
  requireAuth: (req, res, next) => next(),
}));

const { pool } = require('../db/pool');
const { withTransaction } = require('../middleware/db-transaction');
const smartWorkingRouter = require('../routes/smartWorking');

const TEST_CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const TEST_EMPLOYEE_ID = '84ab2a73-aedd-4514-b9d4-4496a968e409';

const DEFAULT_USER = {
  user_id: TEST_EMPLOYEE_ID,
  employee_id: TEST_EMPLOYEE_ID,
  client_id: TEST_CLIENT_ID,
  role: 'employee',
};

const createApp = (user = DEFAULT_USER) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/v1/smart-working', smartWorkingRouter);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const statusCode = err.statusCode || 500;
    const response = { error: err.code, message: err.message, statusCode };
    if (err.details) response.details = err.details;
    res.status(statusCode).json(response);
  });
  return app;
};

describe('Smart Working API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/smart-working — declare today', () => {
    test('creates a smart working day and returns 201', async () => {
      const mockRow = {
        id: uuidv4(),
        employee_id: TEST_EMPLOYEE_ID,
        date: '2026-07-12',
        created_at: new Date(),
      };

      withTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn().mockResolvedValueOnce({ rows: [mockRow] }),
        };
        return callback(mockClient);
      });

      const app = createApp();
      const res = await request(app).post('/api/v1/smart-working').send({});

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.employee_id).toBe(TEST_EMPLOYEE_ID);
      expect(res.body.message).toMatch(/Smart Working/);
    });

    test('rejects a duplicate declaration for the same day with a clean 409, not a 500', async () => {
      const uniqueViolation = new Error('duplicate key value violates unique constraint');
      uniqueViolation.code = '23505';

      withTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn().mockRejectedValueOnce(uniqueViolation),
        };
        return callback(mockClient);
      });

      const app = createApp();
      const res = await request(app).post('/api/v1/smart-working').send({});

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('ALREADY_DECLARED_TODAY');
      expect(res.body.message).not.toMatch(/duplicate key/i);
    });

    test('rejects when the account has no employee profile (fail-closed)', async () => {
      const app = createApp({ user_id: 'admin-1', client_id: TEST_CLIENT_ID, role: 'admin', employee_id: null });
      const res = await request(app).post('/api/v1/smart-working').send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('SMART_WORKING_NO_EMPLOYEE_PROFILE');
      expect(withTransaction).not.toHaveBeenCalled();
    });

    test('ignores a client-supplied date and employee_id — server always uses its own values', async () => {
      const mockRow = {
        id: uuidv4(),
        employee_id: TEST_EMPLOYEE_ID,
        date: '2026-07-12',
        created_at: new Date(),
      };
      let capturedQuery;
      let capturedParams;

      withTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn().mockImplementationOnce((query, params) => {
            capturedQuery = query;
            capturedParams = params;
            return Promise.resolve({ rows: [mockRow] });
          }),
        };
        return callback(mockClient);
      });

      const app = createApp();
      await request(app)
        .post('/api/v1/smart-working')
        .send({ date: '2020-01-01', employee_id: 'some-other-uuid' });

      // The INSERT must use CURRENT_DATE server-side and the authenticated employee_id only —
      // the attacker-supplied date/employee_id in the body must never reach the query.
      expect(capturedQuery).toMatch(/CURRENT_DATE/);
      expect(capturedParams).toEqual([TEST_CLIENT_ID, TEST_EMPLOYEE_ID]);
    });
  });

  describe('GET /api/v1/smart-working/my-history', () => {
    test('returns only the authenticated employee\'s own days', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: uuidv4(), date: '2026-07-10', created_at: new Date() }],
      });

      const app = createApp();
      const res = await request(app).get('/api/v1/smart-working/my-history');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);

      // Verify the query scopes strictly by the authenticated employee_id
      const [, params] = pool.query.mock.calls[0];
      expect(params).toContain(TEST_EMPLOYEE_ID);
    });

    test('ignores a client-supplied employee_id in the query string (fail-closed)', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const app = createApp();
      await request(app).get('/api/v1/smart-working/my-history?employee_id=some-other-uuid');

      const [, params] = pool.query.mock.calls[0];
      // The other employee's id must never appear in the query params — only the
      // authenticated user's own employee_id (from req.user, not req.query) is used.
      expect(params).not.toContain('some-other-uuid');
      expect(params).toContain(TEST_EMPLOYEE_ID);
    });

    test('rejects when the account has no employee profile (fail-closed)', async () => {
      const app = createApp({ user_id: 'admin-1', client_id: TEST_CLIENT_ID, role: 'admin', employee_id: null });
      const res = await request(app).get('/api/v1/smart-working/my-history');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('SMART_WORKING_NO_EMPLOYEE_PROFILE');
    });
  });
});
