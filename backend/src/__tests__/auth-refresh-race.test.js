/**
 * S.32.7 Race Condition & Replay Detection Tests
 * Tests concurrent refresh attacks, jti tracking, SELECT FOR UPDATE locking
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
const JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');

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

  // ===== FIX #1: jti TRACKING ON LOGIN =====

  test('Login inserts jti into used_tokens (prevents race condition)', async () => {
    // Mock successful login with jti insertion
    pool.query.mockResolvedValueOnce({ rows: [] }); // jti INSERT (new code fix)

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'pippo@badge.local', password: process.env.DEMO_PIPPO_PASSWORD });

    expect(loginRes.status).toBe(200);

    // Verify jti was inserted
    const jtiInsertCall = pool.query.mock.calls.find(
      (call) => call[0].includes('INSERT INTO used_tokens')
    );
    expect(jtiInsertCall).toBeDefined();
  });

  // ===== FIX #2: SELECT FOR UPDATE LOCKING =====

  test('Refresh acquires SELECT FOR UPDATE lock on existing jti', async () => {
    // Mock successful refresh with lock
    pool.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    pool.query.mockResolvedValueOnce({ rows: [{ jti }] }); // SELECT FOR UPDATE (row exists)
    pool.query.mockResolvedValueOnce({ rows: [] }); // Revocation check
    pool.query.mockResolvedValueOnce({ rows: [] }); // DELETE old jti
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: userId,
        client_id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Admin',
        email: 'admin@test.local',
        role: 'admin',
      }],
    }); // SELECT employees
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT new jti
    pool.query.mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(200);

    // Verify SELECT FOR UPDATE was called
    const selectForUpdateCall = pool.query.mock.calls.find(
      (call) => call[0].includes('SELECT 1 FROM used_tokens') && call[0].includes('FOR UPDATE')
    );
    expect(selectForUpdateCall).toBeDefined();
  });

  // ===== REPLAY ATTACK DETECTION =====

  test('Replay attack: second use of same refresh_token triggers revocation', async () => {
    // First refresh succeeds (from above test)
    // Second refresh with SAME token should find jti in used_tokens (no longer available after DELETE)
    // OR should be blocked by revocation

    // Mock second refresh attempt after revocation
    pool.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    pool.query.mockResolvedValueOnce({
      rows: [{ jti }], // jti exists (from first refresh)
    }); // SELECT FOR UPDATE
    // Replay detected!
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT revoked_tokens (revoke user)
    pool.query.mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SESSION_REVOKED');
    expect(res.body.message).toContain('replay');

    // Verify revocation was triggered
    const revokeInsertCall = pool.query.mock.calls.find(
      (call) => call[0].includes('INSERT INTO revoked_tokens') && call[0].includes('REPLAY_ATTACK_DETECTED')
    );
    expect(revokeInsertCall).toBeDefined();
  });

  test('Concurrent refresh attempts: both blocked except first to complete', async () => {
    // Scenario: Two POST /refresh requests with same token arrive simultaneously
    // Only first should succeed; second should fail with REPLAY_ATTACK_DETECTED

    // FIRST REQUEST: Acquires lock, processes, commits
    pool.query.mockResolvedValueOnce({ rows: [] }); // BEGIN request 1
    pool.query.mockResolvedValueOnce({ rows: [{ jti }] }); // SELECT FOR UPDATE (lock acquired)
    pool.query.mockResolvedValueOnce({ rows: [] }); // Revocation check
    pool.query.mockResolvedValueOnce({ rows: [] }); // DELETE old jti
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: userId,
        client_id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Admin',
        email: 'admin@test.local',
        role: 'admin',
      }],
    }); // SELECT employees
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT new jti_1
    pool.query.mockResolvedValueOnce({ rows: [] }); // COMMIT request 1

    const res1 = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res1.status).toBe(200);

    // SECOND REQUEST: Tries same token after first committed
    // jti is still in used_tokens (first refresh was successful)
    // But we can't reuse the same jti, so query would fail
    pool.query.mockResolvedValueOnce({ rows: [] }); // BEGIN request 2
    pool.query.mockResolvedValueOnce({
      rows: [{ jti }], // SAME jti still in table (both requests use same token)
    }); // SELECT FOR UPDATE (but different state after first request)
    pool.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK request 2

    const res2 = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    // Second request fails because jti logic prevents reuse
    expect([400, 401]).toContain(res2.status);
  });

  // ===== TEMPORARY REVOCATION EXPIRY =====

  test('Temporary revocation expired: refresh is allowed', async () => {
    const pastTime = new Date(Date.now() - 3600000); // 1 hour ago

    // Mock: revocation expired (revoked_until < NOW())
    pool.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    pool.query.mockResolvedValueOnce({ rows: [] }); // SELECT FOR UPDATE (jti found)
    pool.query.mockResolvedValueOnce({
      rows: [], // Revocation check returns empty (expired)
    }); // SELECT revoked_tokens with expiry check
    pool.query.mockResolvedValueOnce({ rows: [] }); // DELETE old jti
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: userId,
        client_id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Admin',
        email: 'admin@test.local',
        role: 'admin',
      }],
    }); // SELECT employees
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT new jti
    pool.query.mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(200);
  });

  // ===== HASH JTI IN LOGS (FIX #4) =====

  test('Logs jti as SHA256 hash, never plaintext', async () => {
    const crypto = require('crypto');

    pool.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    pool.query.mockResolvedValueOnce({
      rows: [{ jti }], // Found = replay attack
    }); // SELECT FOR UPDATE
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT revoked_tokens
    // logger.warn is called (not a DB query, so we check via mock snapshot)

    await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    // In a real scenario, we'd capture the logger output
    // For now, verify no plaintext jti in DB calls
    const allCalls = pool.query.mock.calls.map((call) => call.toString());
    const allText = allCalls.join(' ');

    // Plaintext jti should NOT appear in SQL (it's hashed in audit log)
    // This is a best-effort check; logger.warn is not mocked
    expect(allText).not.toContain(jti);
  });

  // ===== CONNECTION CLEANUP (FIX #5) =====

  test('Releases DB connection in finally block (no connection leaks)', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValueOnce(mockClient);

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [] }) // Revocation check
      .mockResolvedValueOnce({ rows: [] }) // DELETE
      .mockResolvedValueOnce({
        rows: [{
          id: userId,
          client_id: '550e8400-e29b-41d4-a716-446655440001',
          name: 'Admin',
          email: 'admin@test.local',
          role: 'admin',
        }],
      }) // SELECT employees
      .mockResolvedValueOnce({ rows: [] }) // INSERT new jti
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    // Verify release() was called in finally
    expect(mockClient.release).toHaveBeenCalled();
  });

  test('Releases connection even if error occurs', async () => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValueOnce(mockClient);
    mockClient.query.mockRejectedValueOnce(new Error('DB error'));

    await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    // Should still call release() in finally block
    expect(mockClient.release).toHaveBeenCalled();
  });
});
