'use strict';

/**
 * Body-shape validation tests for POST /api/v1/demo/start (Task 3 of 9).
 *
 * These use a mocked pool because a validation failure (rejected by
 * DemoStartSchema.strict()) never reaches the database — the validation
 * middleware short-circuits before any pool.query call. Real end-to-end
 * behavior (tenant creation, resume, race condition, cap) is covered by
 * demo-start.test.js against a real database.
 *
 * Checkpoint 3 requirement under test: "Verificare che nessun campo diverso
 * da email sia accettato dal body (niente client_id, role, ecc. iniettabili
 * dal chiamante)."
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

describe('POST /api/v1/demo/start — body validation', () => {
  beforeEach(() => {
    pool.query.mockReset();
    pool.connect.mockReset();
  });

  it('rejects a body with an injected client_id field', async () => {
    const res = await request(app)
      .post('/api/v1/demo/start')
      .send({ email: 'demo@example.com', client_id: '550e8400-e29b-41d4-a716-446655440001' });

    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects a body with an injected role field', async () => {
    const res = await request(app)
      .post('/api/v1/demo/start')
      .send({ email: 'demo@example.com', role: 'admin' });

    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects a body with an injected is_demo field', async () => {
    const res = await request(app)
      .post('/api/v1/demo/start')
      .send({ email: 'demo@example.com', is_demo: false });

    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects a missing email', async () => {
    const res = await request(app).post('/api/v1/demo/start').send({});
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects an invalid email format', async () => {
    const res = await request(app).post('/api/v1/demo/start').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('accepts a body with only a valid email (passes validation, reaches the DB layer)', async () => {
    // We only assert that validation passes and pool.query was reached —
    // the mock returns undefined rows, so the route will error out past
    // validation, which is fine: this test is about the validator, not the
    // full DB flow (covered in demo-start.test.js).
    pool.query.mockResolvedValue({ rows: [{ n: 0 }] });
    const res = await request(app).post('/api/v1/demo/start').send({ email: 'demo@example.com' });

    expect(res.status).not.toBe(400);
    expect(pool.query).toHaveBeenCalled();
  });
});
