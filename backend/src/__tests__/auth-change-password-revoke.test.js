/**
 * Security regression (audit 2026-11-14, finding 4.3):
 * POST /api/v1/auth/change-password must revoke all of the user's existing
 * sessions (delete their used_tokens) so a refresh token stolen before the
 * password change cannot outlive it — and must track the freshly-issued
 * session's own refresh jti, the same way POST /login does, so the new
 * session's refresh token still works on first use.
 *
 * Pool is mocked (no real DB), mirroring auth-revoke-session.test.js.
 */

jest.mock('../middleware/rateLimiter', () => {
  const passThrough = (req, res, next) => next();
  return { apiLimiter: passThrough, authLimiter: passThrough, csvLimiter: passThrough, demoStartLimiter: passThrough, onboardingInviteLimiter: passThrough, pushTokenLimiter: passThrough };
});

jest.mock('../db/pool', () => ({
  pool: { query: jest.fn(), connect: jest.fn(), end: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../db/redis', () => ({
  initializeRedis: jest.fn().mockResolvedValue(null),
  closeRedis: jest.fn().mockResolvedValue(undefined),
  isRedisAvailable: jest.fn().mockReturnValue(false),
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  deleteCacheByPattern: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../auth/password', () => ({
  verifyPassword: jest.fn().mockResolvedValue(true),
  hashPassword: jest.fn().mockResolvedValue('$2b$12$newlyhashedpasswordplaceholderxxxxxxxxxxxxxxxxxxxxxxxx'),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { pool } = require('../db/pool');

const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');

const USER_ID = '550e8400-e29b-41d4-a716-446655440042';

function dbUserToken() {
  return jwt.sign(
    {
      user_id: USER_ID,
      employee_id: USER_ID,
      role: 'employee',
      client_id: '550e8400-e29b-41d4-a716-446655440001',
      email: 'real.employee@store.it',
    },
    JWT_PRIVATE_KEY,
    { algorithm: 'RS256', expiresIn: '15m' }
  );
}

describe('POST /api/v1/auth/change-password — session revocation (finding 4.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DISABLE_AUTH = 'false';
  });

  it('deletes all used_tokens for the user and tracks the new session jti', async () => {
    // Query sequence the handler should drive for a DB (non-demo) user:
    //   1. SELECT id, password_hash  -> row with a non-null hash (DB user)
    //   2. UPDATE employees SET password_hash...
    //   3. DELETE FROM used_tokens WHERE user_id = $1   (revoke old sessions)
    //   4. INSERT INTO used_tokens (user_id, jti)        (track new session)
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: USER_ID, password_hash: '$2b$12$oldhashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${dbUserToken()}`)
      .send({ old_password: 'OldPassw0rd', new_password: 'BrandNewPassw0rd' });

    expect(res.status).toBe(200);

    const sql = pool.query.mock.calls.map((c) => c[0]);

    const deleteCall = pool.query.mock.calls.find(
      (c) => /DELETE\s+FROM\s+used_tokens/i.test(c[0]) && /user_id\s*=\s*\$1/i.test(c[0])
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall[1][0]).toBe(USER_ID);

    const insertCall = pool.query.mock.calls.find((c) => /INSERT\s+INTO\s+used_tokens/i.test(c[0]));
    expect(insertCall).toBeDefined();
    expect(insertCall[1][0]).toBe(USER_ID);
    // jti must be a UUID, and must match the issued refresh token's jti
    const refreshToken = res.body.data.refresh_token;
    const decodedRefresh = jwt.decode(refreshToken);
    expect(insertCall[1][1]).toBe(decodedRefresh.jti);

    // The UPDATE must precede the DELETE (don't revoke before the change lands)
    const updateIdx = sql.findIndex((s) => /UPDATE\s+employees\s+SET\s+password_hash/i.test(s));
    const deleteIdx = sql.findIndex((s) => /DELETE\s+FROM\s+used_tokens/i.test(s));
    expect(updateIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeGreaterThan(updateIdx);
  });
});
