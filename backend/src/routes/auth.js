/**
 * Authentication Routes
 * POST /api/auth/login - User login (MVP: hardcoded credentials)
 * POST /api/auth/logout - User logout (frontend-side, optional endpoint)
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const pino = require('pino');
const { createValidationMiddleware, LoginSchema } = require('../middleware/validation');
const { ValidationError } = require('../utils/errors');
const { verifyPassword } = require('../auth/password');
const { pool } = require('../db/pool');

const router = express.Router();
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

if (!process.env.JWT_PRIVATE_KEY) {
  throw new Error('FATAL: JWT_PRIVATE_KEY environment variable is required — server cannot start without it');
}
if (!process.env.JWT_PUBLIC_KEY) {
  throw new Error('FATAL: JWT_PUBLIC_KEY environment variable is required — server cannot start without it');
}
// RS256: private key signs tokens, public key verifies (asymmetric — token cannot be forged without the private key)
const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
const JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');
const JWT_ALGORITHM = 'RS256';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

// Internal Dataxiom accounts — restricted to @badge.local domain only.
// These are never exposed to real customers and cannot collide with real employee emails.
// @employee.it accounts were removed: they now authenticate via the DB path (migration 007
// set their bcrypt password_hash, so they no longer need a plaintext fallback here).
const DEMO_USERS = [
  {
    email: 'pippo@badge.local',
    password: 'pippo01',
    id: 'user-mvp-pippo',
    name: 'Pippo',
    role: 'admin',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
  },
  {
    email: 'pino@badge.local',
    password: 'pino01',
    id: 'user-mvp-pino',
    name: 'Pino',
    role: 'manager',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
  },
  {
    email: 'diego@badge.local',
    password: 'Diego1975',
    id: 'user-mvp-diego',
    name: 'Diego',
    role: 'manager',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
    site_id: '550e8400-e29b-41d4-a716-446655440012',
    employee_id: '550e8400-e29b-41d4-a716-446655440200',
  },
  {
    email: 'maria@badge.local',
    password: 'maria01',
    id: 'user-mvp-maria',
    name: 'Maria',
    role: 'employee',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
  },
  {
    email: 'lucia@badge.local',
    password: 'lucia01',
    id: 'user-mvp-lucia',
    name: 'Lucia',
    role: 'employee',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
  },
];

// DEMO_USERS is only consulted for @badge.local emails — never for real-world domains.
const BADGE_LOCAL_DOMAIN = '@badge.local';

/**
 * POST /api/auth/login
 * Login with email and password (MVP: hardcoded demo account)
 *
 * Request:
 * {
 *   "email": "demo@badge.it",
 *   "password": "demo123"
 * }
 *
 * Response (200):
 * {
 *   "data": {
 *     "token": "eyJhbGciOiJIUzI1NiIs...",
 *     "user": {
 *       "id": "user-mvp-demo",
 *       "email": "demo@badge.it",
 *       "role": "admin"
 *     }
 *   }
 * }
 */
router.post('/login', createValidationMiddleware(LoginSchema), async (req, res, next) => {
  const { email, password, client_id } = req.validated.body;

  try {
    let user = null;

    if (email.endsWith(BADGE_LOCAL_DOMAIN)) {
      // Step 1: @badge.local emails — internal Dataxiom accounts only.
      // These never exist in customer DBs so plaintext comparison is safe here.
      const demoUser = DEMO_USERS.find((u) => u.email === email && u.password === password);
      if (demoUser) {
        user = {
          id: demoUser.id,
          name: demoUser.name,
          email: demoUser.email,
          role: demoUser.role,
          client_id: demoUser.client_id,
          employee_id: demoUser.employee_id || null,
          site_id: demoUser.site_id || null,
        };
      }
    } else {
      // Step 2: DB lookup — all non-badge.local emails (real customers + @employee.it demo accounts).
      // If client_id is provided, filter by it to prevent cross-tenant identity collision.
      const params = client_id ? [email, client_id] : [email];
      const clientFilter = client_id ? 'AND client_id = $2' : '';
      const result = await pool.query(
        `SELECT id, client_id, email, name, role, site_id, password_hash
         FROM employees
         WHERE email = $1 AND password_hash IS NOT NULL ${clientFilter}
         ORDER BY created_at ASC
         LIMIT 1`,
        params
      );
      const dbEmployee = result.rows[0];
      if (dbEmployee) {
        const valid = await verifyPassword(password, dbEmployee.password_hash);
        if (valid) {
          user = {
            id: dbEmployee.id,
            name: dbEmployee.name,
            email: dbEmployee.email,
            role: dbEmployee.role,
            client_id: dbEmployee.client_id,
            employee_id: dbEmployee.id,
            site_id: dbEmployee.site_id || null,
          };
        }
      }
    }

    if (!user) {
      throw new ValidationError('Email or password is incorrect', {
        field: 'credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    // Generate JWT token
    const tokenPayload = {
      user_id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      client_id: user.client_id,
    };
    if (user.employee_id) tokenPayload.employee_id = user.employee_id;
    if (user.site_id) tokenPayload.site_id = user.site_id;

    const token = jwt.sign(tokenPayload, JWT_PRIVATE_KEY, {
      algorithm: JWT_ALGORITHM,
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });
    const refreshPayload = { user_id: user.id, type: 'refresh' };
    const refresh_token = jwt.sign(refreshPayload, JWT_PRIVATE_KEY, {
      algorithm: JWT_ALGORITHM,
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    logger.info({
      action: 'user_login',
      email,
      name: user.name,
      user_id: user.id,
      role: user.role,
      employee_id: user.employee_id || null,
      site_id: user.site_id || null,
      timestamp: new Date().toISOString(),
    });

    const userResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    if (user.employee_id) userResponse.employee_id = user.employee_id;
    if (user.site_id) userResponse.site_id = user.site_id;

    res.json({
      data: {
        token,
        refresh_token,
        user: userResponse,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/refresh
 * Exchange a valid refresh token for a new access token (15min)
 */
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'MISSING_REFRESH_TOKEN', message: 'refresh_token is required' });
  }

  try {
    const decoded = jwt.verify(refresh_token, JWT_PUBLIC_KEY, { algorithms: [JWT_ALGORITHM] });

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'INVALID_TOKEN_TYPE', message: 'Token is not a refresh token' });
    }

    // Step 1: Check DEMO_USERS (internal accounts)
    const demoUser = DEMO_USERS.find((u) => u.id === decoded.user_id);

    let tokenPayload;

    if (demoUser) {
      tokenPayload = {
        user_id: demoUser.id,
        name: demoUser.name,
        email: demoUser.email,
        role: demoUser.role,
        client_id: demoUser.client_id,
      };
      if (demoUser.employee_id) tokenPayload.employee_id = demoUser.employee_id;
      if (demoUser.site_id) tokenPayload.site_id = demoUser.site_id;
    } else {
      // Step 2: DB lookup for real customers created via admin panel
      const result = await pool.query(
        `SELECT id, client_id, email, name, role, site_id
         FROM employees
         WHERE id = $1`,
        [decoded.user_id]
      );
      const dbEmployee = result.rows[0];
      if (!dbEmployee) {
        logger.warn({ action: 'refresh_user_not_found', user_id: decoded.user_id });
        return res.status(401).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
      }
      tokenPayload = {
        user_id: dbEmployee.id,
        name: dbEmployee.name,
        email: dbEmployee.email,
        role: dbEmployee.role,
        client_id: dbEmployee.client_id,
        employee_id: dbEmployee.id,
      };
      if (dbEmployee.site_id) tokenPayload.site_id = dbEmployee.site_id;
    }

    const token = jwt.sign(tokenPayload, JWT_PRIVATE_KEY, {
      algorithm: JWT_ALGORITHM,
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    logger.info({ action: 'token_refreshed', user_id: decoded.user_id });

    res.json({ data: { token } });
  } catch (err) {
    logger.warn({ action: 'refresh_token_invalid', error: err.message });
    res.status(401).json({ error: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired' });
  }
});

/**
 * POST /api/auth/logout (optional)
 * Frontend will clear localStorage, but can call this endpoint for audit logging
 */
router.post('/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_PUBLIC_KEY, { algorithms: [JWT_ALGORITHM] });
      logger.info({
        action: 'user_logout',
        user_id: decoded.user_id,
        email: decoded.email,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn({ action: 'logout_invalid_token', error: err.message });
    }
  }

  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
