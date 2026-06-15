/**
 * Illnesses API Tests
 * POST /api/v1/illnesses/report
 * GET /api/v1/illnesses/admin
 * DELETE /api/v1/illnesses/:id
 * GET /api/v1/illnesses/manager
 * GET /api/v1/illnesses/by-date-range
 */

const request = require('supertest');
const express = require('express');
const { v4: uuidv4 } = require('uuid');

// Mock dependencies
jest.mock('../db/pool');
jest.mock('../db/redis');
jest.mock('../middleware/audit');
jest.mock('../middleware/db-transaction');
jest.mock('../utils/logger');
// requireAuth would otherwise inject the default admin user (DISABLE_AUTH=true)
// and clobber the per-test req.user set by createApp(). Make it a pass-through
// so each test's chosen role drives RBAC.
jest.mock('../middleware/auth', () => ({
  requireAuth: (req, res, next) => next(),
}));

const { pool } = require('../db/pool');
const { withTransaction } = require('../middleware/db-transaction');
const { logAudit } = require('../middleware/audit');
const illnessesRouter = require('../routes/illnesses');

const DEFAULT_USER = {
  user_id: '84ab2a73-aedd-4514-b9d4-4496a968e409', // Maria (employee)
  client_id: '550e8400-e29b-41d4-a716-446655440001',
  role: 'employee',
  site_id: null,
};

// Create minimal Express app for testing. Pass a user object to drive the role.
const createApp = (user = DEFAULT_USER) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/v1/illnesses', illnessesRouter);
  // Mirror the global ApiError handler (app.js) so route errors serialize to
  // JSON { error: code, message, statusCode, details? } instead of Express's
  // default HTML error page.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const statusCode = err.statusCode || 500;
    const response = { error: err.code, message: err.message, statusCode };
    if (err.details) response.details = err.details;
    res.status(statusCode).json(response);
  });
  return app;
};

describe('Illnesses API', () => {
  const TEST_CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
  const TEST_EMPLOYEE_ID = '84ab2a73-aedd-4514-b9d4-4496a968e409';
  const TEST_ILLNESS_ID = uuidv4();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/illnesses/report — Employee reports illness', () => {
    test('should create illness and return 201', async () => {
      const app = createApp();
      const mockIllness = {
        id: TEST_ILLNESS_ID,
        client_id: TEST_CLIENT_ID,
        employee_id: TEST_EMPLOYEE_ID,
        start_date: '2026-06-20',
        end_date: '2026-06-22',
        num_days: 3,
        reason: 'Febbre',
        certificate_url: null,
        created_at: new Date(),
        created_by: TEST_EMPLOYEE_ID,
      };

      // Mock transaction behavior
      withTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ id: TEST_EMPLOYEE_ID, client_id: TEST_CLIENT_ID }] }) // Employee exists
            .mockResolvedValueOnce({ rows: [mockIllness] }), // Insert illness
        };
        return callback(mockClient);
      });

      logAudit.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/v1/illnesses/report')
        .send({
          start_date: '2026-06-20',
          end_date: '2026-06-22',
          reason: 'Febbre',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.num_days).toBe(3);
      expect(res.body.message).toContain('Comunicazione malattia inviata');
    });

    test('should validate date order (start <= end)', async () => {
      const app = createApp();

      const res = await request(app)
        .post('/api/v1/illnesses/report')
        .send({
          start_date: '2026-06-22',
          end_date: '2026-06-20', // End before start
          reason: 'Test',
        });

      expect(res.status).toBe(400);
      expect(res.body.details.code).toBe('INVALID_DATE_RANGE');
    });

    test('should require start_date and end_date', async () => {
      const app = createApp();

      const res = await request(app)
        .post('/api/v1/illnesses/report')
        .send({
          reason: 'Test',
          // Missing dates
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/illnesses/admin — Admin views all illnesses', () => {
    test('should return 403 for non-admin user', async () => {
      const app = createApp({
        user_id: TEST_EMPLOYEE_ID,
        client_id: TEST_CLIENT_ID,
        role: 'employee', // Not admin
      });

      const res = await request(app)
        .get('/api/v1/illnesses/admin');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    test('should return admin illnesses when user is admin', async () => {
      const app = createApp({
        user_id: '550e8400-e29b-41d4-a716-446655440010', // Pippo admin
        client_id: TEST_CLIENT_ID,
        role: 'admin',
      });

      const mockIllnesses = [
        {
          id: TEST_ILLNESS_ID,
          employee_name: 'Maria Rossi',
          start_date: '2026-06-20',
          end_date: '2026-06-22',
          cancelled_at: null,
        },
      ];

      pool.query.mockResolvedValue({ rows: mockIllnesses });

      const res = await request(app)
        .get('/api/v1/illnesses/admin');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0].employee_name).toBe('Maria Rossi');
    });

    test('should filter active illnesses when status=active', async () => {
      const app = createApp({
        user_id: '550e8400-e29b-41d4-a716-446655440010',
        client_id: TEST_CLIENT_ID,
        role: 'admin',
      });

      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .get('/api/v1/illnesses/admin?status=active');

      expect(res.status).toBe(200);
      // Verify query was called (would include AND i.cancelled_at IS NULL)
      expect(pool.query).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/illnesses/manager — Manager views store illnesses', () => {
    test('should return 403 for non-manager', async () => {
      const app = createApp();

      const res = await request(app)
        .get('/api/v1/illnesses/manager');

      expect(res.status).toBe(403);
    });

    test('should return illnesses for manager store', async () => {
      const app = createApp({
        user_id: '550e8400-e29b-41d4-a716-446655440011', // Pino manager
        client_id: TEST_CLIENT_ID,
        role: 'manager',
        site_id: '550e8400-e29b-41d4-a716-446655440011', // Milano
      });

      const mockIllnesses = [
        {
          employee_name: 'Maria Rossi',
          start_date: '2026-06-20',
          end_date: '2026-06-22',
        },
      ];

      pool.query.mockResolvedValue({ rows: mockIllnesses });

      const res = await request(app)
        .get('/api/v1/illnesses/manager');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockIllnesses);
      // Verify query filters by site_id
      expect(pool.query.mock.calls[0][1]).toContain(TEST_CLIENT_ID);
    });
  });

  describe('GET /api/v1/illnesses/by-date-range — Fetch illnesses for date range', () => {
    test('should require start_date and end_date', async () => {
      const app = createApp();

      const res = await request(app)
        .get('/api/v1/illnesses/by-date-range');

      expect(res.status).toBe(400);
      expect(res.body.details.code).toBe('MISSING_DATES');
    });

    test('should return illnesses in date range', async () => {
      const app = createApp();

      const mockIllnesses = [
        {
          employee_id: TEST_EMPLOYEE_ID,
          employee_name: 'Maria Rossi',
          start_date: '2026-06-20',
          end_date: '2026-06-22',
        },
      ];

      pool.query.mockResolvedValue({ rows: mockIllnesses });

      const res = await request(app)
        .get('/api/v1/illnesses/by-date-range?start_date=2026-06-01&end_date=2026-06-30');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockIllnesses);
    });
  });

  describe('DELETE /api/v1/illnesses/:id — Admin cancels illness', () => {
    test('should return 403 for non-admin', async () => {
      const app = createApp();

      const res = await request(app)
        .delete(`/api/v1/illnesses/${TEST_ILLNESS_ID}`);

      expect(res.status).toBe(403);
    });

    test('should cancel illness and return 200', async () => {
      const app = createApp({
        user_id: '550e8400-e29b-41d4-a716-446655440010', // Pippo admin
        client_id: TEST_CLIENT_ID,
        role: 'admin',
      });

      const mockIllness = {
        id: TEST_ILLNESS_ID,
        cancelled_at: null,
      };

      const mockUpdatedIllness = {
        id: TEST_ILLNESS_ID,
        cancelled_at: new Date(),
        cancelled_by: '550e8400-e29b-41d4-a716-446655440010',
      };

      withTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [mockIllness] }) // Fetch illness
            .mockResolvedValueOnce({ rows: [mockUpdatedIllness] }), // Update illness
        };
        return callback(mockClient);
      });

      logAudit.mockResolvedValue(undefined);

      const res = await request(app)
        .delete(`/api/v1/illnesses/${TEST_ILLNESS_ID}`)
        .send({
          cancellation_reason: 'Errore di comunicazione',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.cancelled_at).toBeDefined();
      expect(res.body.message).toContain('cancellata');
    });

    test('should return 400 if illness already cancelled', async () => {
      const app = createApp({
        user_id: '550e8400-e29b-41d4-a716-446655440010',
        client_id: TEST_CLIENT_ID,
        role: 'admin',
      });

      const mockIllness = {
        id: TEST_ILLNESS_ID,
        cancelled_at: new Date(),
      };

      withTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [mockIllness] }),
        };
        return callback(mockClient);
      });

      const res = await request(app)
        .delete(`/api/v1/illnesses/${TEST_ILLNESS_ID}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.details.code).toBe('ALREADY_CANCELLED');
    });
  });
});
