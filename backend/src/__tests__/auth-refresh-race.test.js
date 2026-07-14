/**
 * S.32.7 Race Condition & Replay Detection Tests
 * Tests concurrent refresh attacks, jti tracking, SELECT FOR UPDATE locking
 *
 * DESIGN (corrected 2026-07-14, see
 * docs/superpowers/plans/2026-07-14-refresh-replay-detection-hotfix.md):
 * - LOGIN (DB users only): INSERT jti into used_tokens
 * - FIRST REFRESH: SELECT FOR UPDATE jti (finds row from login) -> proceed,
 *   DELETE jti, INSERT new jti, COMMIT
 * - SECOND REFRESH (same, now-consumed token): SELECT FOR UPDATE jti
 *   (finds nothing - was deleted by first refresh) -> REPLAY DETECTED
 * - Demo (@badge.local) users: jti is never inserted at login, and the
 *   replay check is skipped entirely for them (see demoUser guard in
 *   routes/auth.js) — they are not subject to this check at all.
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

  test('Refresh succeeds when jti IS found in used_tokens (first use of token, inserted by login)', async () => {
    // Scenario: jti exists both in the token payload AND in the DB (inserted
    // at login) -- this is the current, valid, not-yet-consumed token.
    const mockClient = createMockClient([
      { rows: [] }, // BEGIN
      { rows: [{ jti }] }, // SELECT FOR UPDATE (jti found - fresh token from login)
      { rows: [] }, // SELECT revoked_tokens (not revoked)
      { rows: [] }, // DELETE old jti (row existed, now consumed)
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

  test('Replay attack: reusing an already-consumed token finds no jti and revokes', async () => {
    // Scenario: jti was already deleted (consumed) by an earlier refresh,
    // so a second use of the exact same token finds nothing -> REPLAY
    const mockClient = createMockClient([
      { rows: [] }, // BEGIN
      { rows: [] }, // SELECT FOR UPDATE (not found! = already consumed = REPLAY)
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
    // First concurrent request: SELECT FOR UPDATE finds the current valid
    // jti (from login) and acquires the row lock while it's still present.
    const mockClient1 = createMockClient([
      { rows: [] }, // BEGIN
      { rows: [{ jti }] }, // SELECT FOR UPDATE (found - lock acquired on the current jti)
      { rows: [] }, // SELECT revoked_tokens
      { rows: [] }, // DELETE old jti (consumed)
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

    // Second concurrent request: by the time its lock is granted, the first
    // request has already deleted (consumed) the row -- SELECT FOR UPDATE
    // now finds nothing, correctly flagging this as a replay.
    const mockClient2 = createMockClient([
      { rows: [] }, // BEGIN
      { rows: [] }, // SELECT FOR UPDATE (not found - already consumed by first request)
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
      { rows: [{ jti }] }, // SELECT FOR UPDATE (found - not a replay, proceed to revoke check)
      { rows: [{ revoked_at: new Date().toISOString() }] }, // SELECT revoked_tokens (FOUND)
      { rows: [] }, // COMMIT
    ]);
    pool.connect.mockResolvedValueOnce(mockClient);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SESSION_REVOKED');
    expect(res.body.message).toBe('User session revoked');
    expect(mockClient.release).toHaveBeenCalled();
  });

  test('Connection released in finally block', async () => {
    const mockClient = createMockClient([
      { rows: [] }, // BEGIN
      { rows: [{ jti }] }, // SELECT FOR UPDATE (found - valid, proceed through full flow)
      { rows: [] }, // SELECT revoked_tokens
      { rows: [] }, // DELETE (consumed)
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
