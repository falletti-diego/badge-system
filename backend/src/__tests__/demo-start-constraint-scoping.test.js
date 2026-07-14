'use strict';

/**
 * Unit test (mocked pool) proving the 23505 handler in routes/demo.js is
 * actually scoped to CLIENTS_EMAIL_UNIQUE_CONSTRAINT ('clients_email_key')
 * and not "any 23505 anywhere in the transaction". A 23505 raised under a
 * *different* constraint name (e.g. from seedDemoTenant's own inserts) must
 * propagate as a genuine error, not be silently swallowed and misrouted
 * into the resume path.
 *
 * Real end-to-end behavior (the actual clients.email race) is covered
 * against a real database in demo-start.test.js; this test exists purely
 * to make the "correctly scoped, not a blanket catch" claim self-verifying
 * without needing to fabricate a second real unique constraint violation.
 */

const request = require('supertest');

jest.mock('../db/pool', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../db/redis', () => ({
  deleteCacheByPattern: jest.fn().mockResolvedValue(undefined),
  redisClient: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('../middleware/rateLimiter', () => ({
  apiLimiter: (req, res, next) => next(),
  authLimiter: (req, res, next) => next(),
  csvLimiter: (req, res, next) => next(),
  demoStartLimiter: (req, res, next) => next(),
}));

const { pool } = require('../db/pool');
const app = require('../app');

describe('POST /api/v1/demo/start — 23505 constraint scoping', () => {
  beforeEach(() => {
    pool.query.mockReset();
    pool.connect.mockReset();
  });

  it('does not treat a 23505 on an unrelated constraint as the email race — propagates as a real error', async () => {
    // Pre-check: no existing client for this email.
    pool.query.mockImplementation((sql) => {
      if (typeof sql === 'string' && sql.includes('SELECT id, is_demo FROM clients')) {
        return Promise.resolve({ rows: [] });
      }
      if (typeof sql === 'string' && sql.includes('SELECT COUNT(*)::int AS n FROM clients')) {
        return Promise.resolve({ rows: [{ n: 0 }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const mockClient = {
      query: jest.fn((sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return Promise.resolve();
        }
        if (typeof sql === 'string' && sql.includes('INSERT INTO clients')) {
          const err = new Error('duplicate key value violates unique constraint "some_other_constraint"');
          err.code = '23505';
          err.constraint = 'some_other_constraint';
          return Promise.reject(err);
        }
        return Promise.resolve({ rows: [] });
      }),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(mockClient);

    const res = await request(app)
      .post('/api/v1/demo/start')
      .send({ email: 'unrelated-constraint@example.com' });

    // Must NOT be treated as a successful resume (200) — it's a genuine,
    // unhandled error that should propagate past the 23505 branch.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.data).toBeUndefined();

    // Transaction was rolled back, connection released — no leaked client.
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });
});
