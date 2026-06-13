/**
 * S.32.7 Task 4: checkRevoked Middleware Tests
 * Tests revocation detection, temporary revocations, error handling
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
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

describe('checkRevoked Middleware (S.32.7 Task 4)', () => {
  let validToken;
  let revokedUserToken;

  const validUser = {
    user_id: '550e8400-e29b-41d4-a716-446655440001',
    role: 'admin',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Admin',
    email: 'admin@test.local',
  };

  const revokedUser = {
    user_id: '550e8400-e29b-41d4-a716-446655440099',
    role: 'employee',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Revoked',
    email: 'revoked@test.local',
  };

  beforeAll(() => {
    validToken = jwt.sign(validUser, JWT_PRIVATE_KEY, {
      algorithm: 'RS256',
      expiresIn: '15m',
    });

    revokedUserToken = jwt.sign(revokedUser, JWT_PRIVATE_KEY, {
      algorithm: 'RS256',
      expiresIn: '15m',
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===== HAPPY PATH =====

  test('Allows request if user is NOT revoked', async () => {
    // Mock: user not in revoked_tokens
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/v1/employees') // Any protected endpoint
      .set('Authorization', `Bearer ${validToken}`);

    // Should NOT be blocked by checkRevoked
    // (may fail with 403 RBAC, but not 401 SESSION_REVOKED)
    expect(res.status).not.toBe(401);
  });

  // ===== REVOCATION DETECTED =====

  test('Blocks request if user is revoked (permanent)', async () => {
    // Mock: user in revoked_tokens with NULL revoked_until (permanent)
    pool.query.mockResolvedValueOnce({
      rows: [{ reason: 'ADMIN_REVOKE', revoked_by: 'admin-id' }],
    });

    const res = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${revokedUserToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SESSION_REVOKED');
    expect(res.body.message).toContain('revocation');
  });

  test('Blocks request if user revoked temporarily and window is active', async () => {
    // Mock: revoked_until > NOW() (still active)
    const futureTime = new Date(Date.now() + 3600000); // 1 hour from now

    pool.query.mockResolvedValueOnce({
      rows: [{
        reason: 'SUSPICIOUS_ACTIVITY',
        revoked_by: 'admin-id',
        revoked_until: futureTime.toISOString(),
      }],
    });

    const res = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${revokedUserToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SESSION_REVOKED');
  });

  test('Allows request if temporary revocation has expired (revoked_until < NOW())', async () => {
    // Mock: revoked_until < NOW() (expired, not in query results)
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${revokedUserToken}`);

    // Not blocked (revocation expired)
    expect(res.status).not.toBe(401);
  });

  // ===== UNAUTHENTICATED REQUESTS =====

  test('Skips check if no token (unauthenticated endpoint)', async () => {
    // checkRevoked should skip if req.user is undefined
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@test.local', password: 'test' });

    // Should not be blocked by checkRevoked (may fail with validation error)
    expect(res.status).not.toBe(401);
  });

  // ===== AUDIT LOGGING ON REVOCATION =====

  test('Logs REVOKED_TOKEN_ATTEMPT when user tries revoked token', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ reason: 'ADMIN_REVOKE' }],
    }); // Revocation found
    pool.query.mockResolvedValueOnce({ rows: [] }); // INSERT audit_log

    await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${revokedUserToken}`);

    // Verify audit log was called
    const auditLogCall = pool.query.mock.calls.find(
      (call) => call[0].includes('INSERT INTO audit_log')
    );

    expect(auditLogCall).toBeDefined();
    expect(auditLogCall[0]).toContain('REVOKED_TOKEN_ATTEMPT');
  });

  // ===== ERROR HANDLING =====

  test('Returns 500 on database error during revocation check', async () => {
    pool.query.mockRejectedValueOnce(new Error('DB connection error'));

    const res = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
  });

  test('Continues if audit log insert fails (best-effort)', async () => {
    // User is revoked
    pool.query.mockResolvedValueOnce({
      rows: [{ reason: 'ADMIN_REVOKE' }],
    });
    // Audit log fails
    pool.query.mockRejectedValueOnce(new Error('Audit log DB error'));

    const res = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${revokedUserToken}`);

    // Should still return 401 SESSION_REVOKED (revocation is not best-effort)
    expect(res.status).toBe(401);
  });

  // ===== REVOCATION REASONS =====

  test('Includes revocation reason in error message when available', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ reason: 'REPLAY_ATTACK_DETECTED' }],
    });

    const res = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${revokedUserToken}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('REPLAY_ATTACK_DETECTED');
  });
});
