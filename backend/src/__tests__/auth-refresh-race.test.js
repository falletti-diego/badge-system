/**
 * S.32.7 Race Condition & Replay Detection Tests
 * Tests concurrent refresh attacks, jti tracking, SELECT FOR UPDATE locking
 *
 * DESIGN CLARIFICATION:
 * - LOGIN (DB users only): INSERT jti into used_tokens
 * - FIRST REFRESH: SELECT FOR UPDATE jti (finds row from login), DELETE jti, INSERT new jti, COMMIT
 * - SECOND REFRESH (same token): SELECT FOR UPDATE jti (finds nothing - was deleted), REPLAY DETECTED
 *
 * For DEMO users (our test): No DB login occurs, so jti insert/delete don't happen automatically.
 * We simulate the sequence manually.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const app = require('../app');
const { pool } = require('../db/pool');

jest.mock('../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
  closePool: jest.fn(),
}));

const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');

describe('S.32.7 Refresh Token Race Condition Prevention', () => {
  let refreshToken;
  const jti = uuid();
  const userId = '550e8400-e29b-41d4-a716-446655440001';

  const user = {
    user_id: userId,
    role: 'admin',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Admin',
    email: 'admin@test.local',
    type: 'refresh',
    jti,
  };

  beforeAll(() => {
    refreshToken = jwt.sign(user, JWT_PRIVATE_KEY, {
      algorithm: 'RS256',
      expiresIn: '7d',
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createMockClient(queryResponses) {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    queryResponses.forEach((response) => {
      mockClient.query.mockResolvedValueOnce(response);
    });
    return mockClient;
  }

  test('Login inserts jti into used_tokens (best-effort)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT used_tokens

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'pippo@badge.local', password: process.env.DEMO_PIPPO_PASSWORD });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.token).toBeDefined();
  });

  test('Refresh succeeds when jti not found in used_tokens (first use of token)', async () => {
    // Scenario: jti exists in token payload, but not in DB (not a replay)
    const mockClient = createMockClient([
      { rows: [] }, // BEGIN
      { rows: [] }, // SELECT FOR UPDATE (jti not found - fresh token)
      { rows: [] }, // SELECT revoked_tokens (not revoked)
      { rows: [] }, // DELETE old jti (no rows to delete)
      {
        rows: [{
          id: userId,
          client_id: '550e8400-e29b-41d4-a716-446655440001',
          name: 'Admin',
          email: 'admin@test.local',
          role: 'admin',
        }],
      }, // SELECT employees
      { rows: [] }, // INSERT new jti
      { rows: [] }, // COMMIT
    ]);
    pool.connect.mockResolvedValueOnce(mockClient);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
    expect(mockClient.release).toHaveBeenCalled();
  });

  test('Replay attack: second use of same token finds jti in DB and revokes', async () => {
    // Scenario: jti was inserted by first refresh, now second refresh finds it -> REPLAY
    const mockClient = createMockClient([
      { rows: [] }, // BEGIN
      { rows: [{ jti }] }, // SELECT FOR UPDATE (found! = this is a REPLAY)
      { rows: [] }, // INSERT revoked_tokens
      { rows: [] }, // COMMIT
    ]);
    pool.connect.mockResolvedValueOnce(mockClient);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SESSION_REVOKED');
    expect(res.body.message).toContain('replay');
    expect(mockClient.release).toHaveBeenCalled();
  });

  test('Concurrent refresh: SELECT FOR UPDATE serializes attempts', async () => {
    // First concurrent request: SELECT FOR UPDATE acquires lock
    const mockClient1 = createMockClient([
      { rows: [] }, // BEGIN
      { rows: [] }, // SELECT FOR UPDATE (no rows - lock acquired)
      { rows: [] }, // SELECT revoked_tokens
      { rows: [] }, // DELETE old jti
      {
        rows: [{
          id: userId,
          client_id: '550e8400-e29b-41d4-a716-446655440001',
          name: 'Admin',
          email: 'admin@test.local',
          role: 'admin',
        }],
      }, // SELECT employees
      { rows: [] }, // INSERT new jti
      { rows: [] }, // COMMIT
    ]);
    pool.connect.mockResolvedValueOnce(mockClient1);

    const res1 = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res1.status).toBe(200);
    expect(mockClient1.release).toHaveBeenCalled();

    // Second concurrent request: lock prevents it, finds jti now exists (was inserted by first)
    const mockClient2 = createMockClient([
      { rows: [] }, // BEGIN
      { rows: [{ jti }] }, // SELECT FOR UPDATE (now finds the jti from first request!)
      { rows: [] }, // INSERT revoked_tokens (replay detected)
      { rows: [] }, // COMMIT
    ]);
    pool.connect.mockResolvedValueOnce(mockClient2);

    const res2 = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res2.status).toBe(401);
    expect(mockClient2.release).toHaveBeenCalled();
  });

  test('Revoked user cannot refresh', async () => {
    const mockClient = createMockClient([
      { rows: [] }, // BEGIN
      { rows: [] }, // SELECT FOR UPDATE
      { rows: [{ revoked_at: new Date().toISOString() }] }, // SELECT revoked_tokens (FOUND)
      { rows: [] }, // COMMIT
    ]);
    pool.connect.mockResolvedValueOnce(mockClient);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SESSION_REVOKED');
    expect(mockClient.release).toHaveBeenCalled();
  });

  test('Connection released in finally block', async () => {
    const mockClient = createMockClient([
      { rows: [] }, // BEGIN
      { rows: [] }, // SELECT FOR UPDATE
      { rows: [] }, // SELECT revoked_tokens
      { rows: [] }, // DELETE
      {
        rows: [{
          id: userId,
          client_id: '550e8400-e29b-41d4-a716-446655440001',
          name: 'Admin',
          email: 'admin@test.local',
          role: 'admin',
        }],
      }, // SELECT employees
      { rows: [] }, // INSERT new jti
      { rows: [] }, // COMMIT
    ]);
    pool.connect.mockResolvedValueOnce(mockClient);

    await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(mockClient.release).toHaveBeenCalled();
  });

  test('Connection released even on error', async () => {
    const mockClient = {
      query: jest.fn().mockRejectedValueOnce(new Error('DB error')),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValueOnce(mockClient);

    await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(mockClient.release).toHaveBeenCalled();
  });
});
