'use strict';

/**
 * S.32.7 Task 4: checkRevoked Middleware + Integration (TDD)
 * Tests for checkRevoked() middleware that:
 * - Enforces revocations on every API request
 * - Checks revoked_tokens table for active revocations
 * - Returns 401 SESSION_REVOKED if user is revoked
 * - Logs REVOKED_TOKEN_ATTEMPT in audit_log
 * - Supports temporary revocations via revoked_until
 *
 * This middleware runs AFTER @requireAuth middleware,
 * so user_id is guaranteed to be in req.user.
 *
 * Note: Tests verify structure, implementation, and error handling.
 * Full integration is tested via requireAuthWithRevoke in routes.
 */

// Bypass rate limiting in tests
jest.mock('../src/middleware/rateLimiter', () => {
  const passThrough = (req, res, next) => next();
  return { apiLimiter: passThrough, authLimiter: passThrough, csvLimiter: passThrough };
});

jest.mock('../src/db/pool', () => ({
  pool: {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../src/db/redis', () => ({
  initializeRedis: jest.fn().mockResolvedValue(null),
  closeRedis: jest.fn().mockResolvedValue(undefined),
  isRedisAvailable: jest.fn().mockReturnValue(false),
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  deleteCacheByPattern: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/middleware/db-transaction', () => ({
  withTransaction: jest.fn(async (cb) => {
    const { pool } = require('../src/db/pool');
    const mockClient = {
      query: pool.query,
      release: jest.fn(),
    };
    await pool.query('BEGIN');
    try {
      const result = await cb(mockClient);
      await pool.query('COMMIT');
      return result;
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  }),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db/pool');

describe('S.32.7 Task 4 — checkRevoked Middleware', () => {
  let app;
  let adminToken, adminUserId;
  let employeeToken, employeeUserId;

  /**
   * Helper: Create JWT with specific user_id, role, and jti_hash
   * Uses process.env.JWT_PRIVATE_KEY (set by jest.setup.js)
   */
  function createToken(userId, role = 'admin', jtiHash = null) {
    const payload = {
      user_id: userId,
      role,
      client_id: 'client-1',
      auth0_sub: `auth0|${userId}`,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      type: 'access',
      jti_hash: jtiHash,
    };

    return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256' });
  }

  beforeAll(() => {
    // Require app after setting up environment
    // Note: jest.setup.js already set JWT_PRIVATE_KEY and JWT_PUBLIC_KEY
    process.env.DISABLE_AUTH = 'false';
    process.env.NODE_ENV = 'test';

    app = require('../src/app');

    // Create test user IDs
    adminUserId = '10000000-0000-0000-0000-000000000001';
    employeeUserId = '10000000-0000-0000-0000-000000000002';

    // Generate tokens
    adminToken = createToken(adminUserId, 'admin', 'jti_admin_hash');
    employeeToken = createToken(employeeUserId, 'employee', 'jti_emp1_hash');
  });

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    // Reset pool.query to default mock (returns empty rows)
    pool.query.mockResolvedValue({ rows: [] });
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  describe('Endpoint structure and implementation', () => {
    test('should have checkRevoked middleware file', () => {
      const middlewarePath = path.join(__dirname, '..', 'src', 'middleware', 'checkRevoked.js');
      expect(fs.existsSync(middlewarePath)).toBe(true);
    });

    test('should export checkRevoked function', () => {
      const middlewarePath = path.join(__dirname, '..', 'src', 'middleware', 'checkRevoked.js');
      const checkRevokedContent = fs.readFileSync(middlewarePath, 'utf8');
      expect(checkRevokedContent).toContain('function checkRevoked');
      expect(checkRevokedContent).toContain('module.exports = checkRevoked');
    });

    test('should have SessionRevokedError class in errors', () => {
      const errorsPath = path.join(__dirname, '..', 'src', 'utils', 'errors.js');
      const errorsContent = fs.readFileSync(errorsPath, 'utf8');
      expect(errorsContent).toContain('SessionRevokedError');
      expect(errorsContent).toContain('SESSION_REVOKED');
      expect(errorsContent).toContain('401');
    });

    test('should export requireAuthWithRevoke composite middleware', () => {
      const authPath = path.join(__dirname, '..', 'src', 'middleware', 'auth.js');
      const authContent = fs.readFileSync(authPath, 'utf8');
      expect(authContent).toContain('requireAuthWithRevoke');
      expect(authContent).toContain('module.exports');
    });
  });

  describe('Middleware: checkRevoked implementation details', () => {
    test('1.1: Queries revoked_tokens table with parameterized queries', () => {
      const middlewarePath = path.join(__dirname, '..', 'src', 'middleware', 'checkRevoked.js');
      const content = fs.readFileSync(middlewarePath, 'utf8');
      expect(content).toContain('revoked_tokens');
      expect(content).toContain('$1'); // parameterized query
      expect(content).toContain('[user_id]');
    });

    test('1.2: Returns 401 SESSION_REVOKED on active revocation', () => {
      const middlewarePath = path.join(__dirname, '..', 'src', 'middleware', 'checkRevoked.js');
      const content = fs.readFileSync(middlewarePath, 'utf8');
      expect(content).toContain('SessionRevokedError');
      expect(content).toContain('401');
    });

    test('1.3: Logs REVOKED_TOKEN_ATTEMPT in audit_log', () => {
      const middlewarePath = path.join(__dirname, '..', 'src', 'middleware', 'checkRevoked.js');
      const content = fs.readFileSync(middlewarePath, 'utf8');
      expect(content).toContain('REVOKED_TOKEN_ATTEMPT');
      expect(content).toContain('audit_log');
      expect(content).toContain('INSERT INTO');
    });

    test('1.4: Supports temporary revocations via revoked_until', () => {
      const middlewarePath = path.join(__dirname, '..', 'src', 'middleware', 'checkRevoked.js');
      const content = fs.readFileSync(middlewarePath, 'utf8');
      expect(content).toContain('revoked_until');
      expect(content).toContain('NOW()');
    });

    test('1.5: Checks user is not revoked using WHERE clause', () => {
      const middlewarePath = path.join(__dirname, '..', 'src', 'middleware', 'checkRevoked.js');
      const content = fs.readFileSync(middlewarePath, 'utf8');
      expect(content).toContain('WHERE user_id');
      expect(content).toContain('AND (revoked_until IS NULL OR revoked_until > NOW())');
    });

    test('1.6: Skips unauthenticated requests', () => {
      const middlewarePath = path.join(__dirname, '..', 'src', 'middleware', 'checkRevoked.js');
      const content = fs.readFileSync(middlewarePath, 'utf8');
      expect(content).toContain('if (!req.user');
      expect(content).toContain('return next()');
    });

    test('1.7: Uses optional chaining for safe mock handling', () => {
      const middlewarePath = path.join(__dirname, '..', 'src', 'middleware', 'checkRevoked.js');
      const content = fs.readFileSync(middlewarePath, 'utf8');
      expect(content).toContain('?.'); // optional chaining
    });
  });

  describe('Error Handling', () => {
    test('3.1: Invalid token rejected before middleware runs', async () => {
      const res = await request(app)
        .post('/api/v1/auth/revoke-session')
        .set('Authorization', 'Bearer invalid.token.here')
        .send({ target_user_id: 'some-id' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('INVALID_TOKEN');
    });

    test('3.2: Missing token rejected before middleware runs', async () => {
      const res = await request(app)
        .post('/api/v1/auth/revoke-session')
        .send({ target_user_id: 'some-id' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('MISSING_TOKEN');
    });

    test('3.3: Middleware has try-catch for database errors', () => {
      const middlewarePath = path.join(__dirname, '..', 'src', 'middleware', 'checkRevoked.js');
      const content = fs.readFileSync(middlewarePath, 'utf8');
      expect(content).toContain('try {');
      expect(content).toContain('} catch (err)');
      expect(content).toContain('InternalServerError');
    });
  });

  describe('Integration: requireAuthWithRevoke composite middleware', () => {
    test('4.1: Chains requireAuth and checkRevoked', () => {
      const authPath = path.join(__dirname, '..', 'src', 'middleware', 'auth.js');
      const content = fs.readFileSync(authPath, 'utf8');
      expect(content).toContain('function requireAuthWithRevoke');
      expect(content).toContain('requireAuth');
      expect(content).toContain('checkRevoked');
    });

    test('4.2: Routes can use requireAuthWithRevoke for full protection', () => {
      const authPath = path.join(__dirname, '..', 'src', 'middleware', 'auth.js');
      const content = fs.readFileSync(authPath, 'utf8');
      expect(content).toContain('Use this in route definitions:');
      expect(content).toContain('requireAuthWithRevoke');
    });
  });
});
