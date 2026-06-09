/**
 * Unit Tests: Auth Middleware (requireAuth, verifyToken, extractToken)
 */

const jwt = require('jsonwebtoken');
const { requireAuth, verifyToken, extractToken } = require('../middleware/auth');

// Disable auth bypass for these tests so requireAuth actually validates tokens
beforeEach(() => {
  process.env.DISABLE_AUTH = 'false';
});

afterAll(() => {
  process.env.DISABLE_AUTH = 'true';
});

// =====================================================
// extractToken
// =====================================================

describe('extractToken()', () => {
  test('returns null when header is undefined', () => {
    expect(extractToken(undefined)).toBeNull();
  });

  test('returns null when header is empty', () => {
    expect(extractToken('')).toBeNull();
  });

  test('returns null for header without Bearer prefix', () => {
    expect(extractToken('Basic abc123')).toBeNull();
  });

  test('returns null for malformed single-word header', () => {
    expect(extractToken('token-only')).toBeNull();
  });

  test('returns token from valid Bearer header', () => {
    expect(extractToken('Bearer mytoken123')).toBe('mytoken123');
  });
});

// =====================================================
// verifyToken
// =====================================================

describe('verifyToken()', () => {
  const makeToken = (payload = {}, opts = {}) =>
    jwt.sign(payload, process.env.JWT_PRIVATE_KEY, {
      algorithm: 'RS256',
      expiresIn: '1h',
      ...opts,
    });

  test('returns decoded payload for valid token', () => {
    const token = makeToken({ user_id: 'u1', role: 'admin' });
    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded.user_id).toBe('u1');
    expect(decoded.role).toBe('admin');
  });

  test('returns null for expired token', () => {
    const token = makeToken({ user_id: 'u1' }, { expiresIn: '0s' });
    // Wait a tick so the token is actually expired
    jest.advanceTimersByTime ? jest.useRealTimers() : undefined;
    const decoded = verifyToken(token);
    expect(decoded).toBeNull();
  });

  test('returns null for token signed with wrong key', () => {
    // Sign with a different private key that won't match the public key in env
    const { generateKeyPairSync } = require('crypto');
    const { privateKey: wrongKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const token = jwt.sign({ user_id: 'u1' }, wrongKey, { algorithm: 'RS256', expiresIn: '1h' });
    expect(verifyToken(token)).toBeNull();
  });

  test('returns null for completely invalid string', () => {
    expect(verifyToken('not.a.jwt')).toBeNull();
  });
});

// =====================================================
// requireAuth middleware
// =====================================================

describe('requireAuth middleware', () => {
  const makeReq = (authHeader) => ({ get: () => authHeader });
  const makeRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };
  const makeToken = (payload = {}) =>
    jwt.sign(
      {
        user_id: 'u1',
        client_id: '550e8400-e29b-41d4-a716-446655440001',
        role: 'admin',
        ...payload,
      },
      process.env.JWT_PRIVATE_KEY,
      { algorithm: 'RS256', expiresIn: '1h' }
    );

  test('DISABLE_AUTH=true bypasses validation and injects mock user', () => {
    process.env.DISABLE_AUTH = 'true';
    const req = makeReq(undefined);
    const res = makeRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeDefined();
    expect(req.user.role).toBe('admin');
    process.env.DISABLE_AUTH = 'false';
  });

  test('returns 401 when Authorization header is missing', () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'MISSING_TOKEN' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 for malformed Authorization header', () => {
    const req = makeReq('InvalidHeader');
    const res = makeRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 401 for invalid/expired token', () => {
    const req = makeReq('Bearer not.a.valid.token');
    const res = makeRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'INVALID_TOKEN' })
    );
  });

  test('calls next() and sets req.user for valid token', () => {
    const token = makeToken({ role: 'manager', site_id: 'site-1', employee_id: 'emp-1' });
    const req = makeReq(`Bearer ${token}`);
    req.user = undefined;
    const res = makeRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user.user_id).toBe('u1');
    expect(req.user.role).toBe('manager');
    expect(req.user.site_id).toBe('site-1');
    expect(req.user.employee_id).toBe('emp-1');
  });

  test('sets client_id on req.user from token', () => {
    const token = makeToken();
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = jest.fn();
    requireAuth(req, res, next);
    expect(req.user.client_id).toBe('550e8400-e29b-41d4-a716-446655440001');
  });
});
