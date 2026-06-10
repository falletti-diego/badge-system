/**
 * Integration Tests: Auth Routes (POST /api/auth/*)
 * Pool is mocked — no real DB connection required.
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
const jwt = require('jsonwebtoken');
const app = require('../app');
const { pool } = require('../db/pool');

// Auth routes don't use requireAuth — DISABLE_AUTH setting irrelevant here.
// But reset to 'false' so we test the real token paths in other routes.
beforeAll(() => {
  process.env.DISABLE_AUTH = 'false';
});
afterAll(() => {
  process.env.DISABLE_AUTH = 'true';
  jest.clearAllMocks();
});

// =====================================================
// POST /api/auth/login — badge.local (no DB)
// =====================================================

describe('POST /api/auth/login — badge.local accounts', () => {
  test('returns 200 + JWT for valid admin credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'pippo@badge.local', password: 'pippo123' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data).toHaveProperty('refresh_token');
    expect(res.body.data.user.role).toBe('admin');
    expect(res.body.data.user.email).toBe('pippo@badge.local');
  });

  test('returns 200 + JWT for valid manager credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'pino@badge.local', password: 'pino01' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('manager');
  });

  test('returns 200 for employee account (maria)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'maria@badge.local', password: 'maria01' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('employee');
  });

  test('returns 400 for wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'pippo@badge.local', password: 'wrong' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toContain('incorrect');
  });

  test('returns 400 for unknown badge.local email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'unknown@badge.local', password: 'any' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('token contains expected payload fields', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'pippo@badge.local', password: 'pippo123' });

    const decoded = jwt.verify(res.body.data.token, process.env.JWT_PUBLIC_KEY, {
      algorithms: ['RS256'],
    });
    expect(decoded.user_id).toBeDefined();
    expect(decoded.role).toBe('admin');
    expect(decoded.client_id).toBeDefined();
  });

  test('manager with site_id gets site_id in token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'diego@badge.local', password: 'diego01' });

    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.data.token, process.env.JWT_PUBLIC_KEY, {
      algorithms: ['RS256'],
    });
    expect(decoded.site_id).toBeDefined();
  });
});

// =====================================================
// POST /api/auth/login — validation errors
// =====================================================

describe('POST /api/auth/login — validation', () => {
  test('returns 400 for missing email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: 'pw' });

    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'pw' });

    expect(res.status).toBe(400);
  });

  test('returns 400 for empty password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.com', password: '' });

    expect(res.status).toBe(400);
  });

  test('returns 400 for empty body', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({});

    expect(res.status).toBe(400);
  });
});

// =====================================================
// POST /api/auth/login — DB path (mocked pool)
// =====================================================

describe('POST /api/auth/login — DB-backed accounts', () => {
  test('returns 400 for unknown non-badge.local email (empty DB result)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'user@company.com', password: 'anypassword' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

// =====================================================
// POST /api/auth/logout
// =====================================================

describe('POST /api/auth/logout', () => {
  test('returns 200 without token', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out successfully');
  });

  test('returns 200 with valid token in header', async () => {
    // First login to get a real token
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'pippo@badge.local', password: 'pippo123' });
    const token = loginRes.body.data.token;

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out successfully');
  });

  test('returns 200 even with invalid token (best-effort logout)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(200);
  });
});

// =====================================================
// POST /api/auth/refresh
// =====================================================

describe('POST /api/auth/refresh', () => {
  let refreshToken;

  beforeEach(async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'pippo@badge.local', password: 'pippo123' });
    refreshToken = loginRes.body.data.refresh_token;
  });

  test('returns 200 + new access token for valid refresh token (demo user)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('token');
  });

  test('new access token is a valid RS256 JWT', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    const decoded = jwt.verify(res.body.data.token, process.env.JWT_PUBLIC_KEY, {
      algorithms: ['RS256'],
    });
    expect(decoded.user_id).toBeDefined();
  });

  test('returns 400 for missing refresh_token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_REFRESH_TOKEN');
  });

  test('returns 401 for invalid token string', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: 'invalid.token.string' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_REFRESH_TOKEN');
  });

  test('returns 401 for access token used as refresh token', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'pippo@badge.local', password: 'pippo123' });
    const accessToken = loginRes.body.data.token; // type !== 'refresh'

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: accessToken });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_TOKEN_TYPE');
  });

  test('returns 401 for expired refresh token', async () => {
    // Sign a refresh token that expired immediately
    const expiredToken = jwt.sign(
      { user_id: 'user-mvp-pippo', type: 'refresh' },
      process.env.JWT_PRIVATE_KEY,
      { algorithm: 'RS256', expiresIn: '0s' }
    );

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: expiredToken });
    expect(res.status).toBe(401);
  });

  test('returns 401 for refresh token with non-UUID user_id not in DEMO_USERS', async () => {
    const unknownToken = jwt.sign(
      { user_id: 'unknown-non-uuid-user', type: 'refresh' },
      process.env.JWT_PRIVATE_KEY,
      { algorithm: 'RS256', expiresIn: '7d' }
    );

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: unknownToken });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('USER_NOT_FOUND');
  });
});
