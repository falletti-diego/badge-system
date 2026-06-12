/**
 * Authentication Routes
 * POST /api/auth/login - User login (MVP: hardcoded credentials)
 * POST /api/auth/logout - User logout (frontend-side, optional endpoint)
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const pino = require('pino');
const { createValidationMiddleware, LoginSchema } = require('../middleware/validation');
const { ValidationError, ForbiddenError, NotFoundError } = require('../utils/errors');
const { verifyPassword, hashPassword } = require('../auth/password');
const { requireAuth } = require('../middleware/auth');
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
// Passwords are read from environment variables only — never hardcoded in source.
// If an env var is not set, that account is effectively disabled (no match possible).
// Set DEMO_*_PASSWORD in .env (dev) or EC2 --env-file (prod) — see .env.example.
const DEMO_USERS = [
  {
    email: 'pippo@badge.local',
    password: process.env.DEMO_PIPPO_PASSWORD,
    id: 'user-mvp-pippo',
    name: 'Pippo',
    role: 'admin',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
  },
  {
    email: 'pino@badge.local',
    password: process.env.DEMO_PINO_PASSWORD,
    id: 'user-mvp-pino',
    name: 'Pino',
    role: 'manager',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
    site_id: 'e1337fab-ba3f-4332-bb06-57c9df15b067', // Milano
  },
  {
    email: 'diego@badge.local',
    password: process.env.DEMO_DIEGO_PASSWORD,
    id: 'user-mvp-diego',
    name: 'Diego',
    role: 'manager',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
    site_id: '550e8400-e29b-41d4-a716-446655440012', // Torino
    employee_id: '550e8400-e29b-41d4-a716-446655440200',
  },
  {
    email: 'maria@badge.local',
    password: process.env.DEMO_MARIA_PASSWORD,
    id: 'user-mvp-maria',
    name: 'Maria',
    role: 'employee',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
    employee_id: '239ec99f-3204-45ca-bce2-793f52442ec6', // Maria Rossi (real employee in Torino with check-ins)
  },
  // Lucia removed — no corresponding employee record in the database
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
      // If omitted, guard against silent wrong-tenant login: reject when multiple tenants share the email.
      const params = client_id ? [email, client_id] : [email];
      const clientFilter = client_id ? 'AND client_id = $2' : '';
      const result = await pool.query(
        `SELECT id, client_id, email, name, role, site_id, password_hash, must_change_password
         FROM employees
         WHERE email = $1 AND password_hash IS NOT NULL ${clientFilter}
         ORDER BY created_at ASC
         LIMIT 2`,
        params
      );

      // If two employees across different tenants share this email and no client_id was given,
      // refuse to guess — require the caller to disambiguate.
      if (!client_id && result.rows.length > 1) {
        throw new ValidationError('Multiple accounts found for this email. Provide client_id to disambiguate.', {
          field: 'client_id',
          code: 'CLIENT_ID_REQUIRED',
        });
      }
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
            must_change_password: dbEmployee.must_change_password || false,
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
        must_change_password: user.must_change_password || false,
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
      // Step 2: DB lookup for real customers created via admin panel.
      // Guard against non-UUID user_id values (e.g. legacy 'user-mvp-*' strings from
      // tokens issued before the S.1 fix) — pg throws a 22P02 UUID cast error otherwise.
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_REGEX.test(decoded.user_id)) {
        logger.warn({ action: 'refresh_invalid_user_id_format', user_id: decoded.user_id });
        return res.status(401).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
      }

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

/**
 * POST /api/auth/change-password
 * Change password for authenticated employee
 * Requires: old_password, new_password
 * Returns: new access token with must_change_password = false
 */
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { old_password, new_password } = req.body;
    const { employee_id, role } = req.user;

    // Only employees and managers with employee_id can change password
    if (!employee_id) {
      return next(new ForbiddenError('Only employees can change their password'));
    }

    if (!old_password || !new_password) {
      return next(new ValidationError('old_password and new_password required'));
    }

    if (new_password.length < 8) {
      return next(new ValidationError('New password must be at least 8 characters'));
    }

    if (old_password === new_password) {
      return next(new ValidationError('New password must be different from old password'));
    }

    // Fetch employee with password hash
    const empResult = await pool.query(
      'SELECT id, password_hash FROM employees WHERE id = $1::uuid',
      [employee_id]
    );

    if (empResult.rows.length === 0) {
      return next(new NotFoundError('Employee not found'));
    }

    const employee = empResult.rows[0];

    // Verify old password matches
    const passwordMatch = await verifyPassword(old_password, employee.password_hash);
    if (!passwordMatch) {
      return next(new ValidationError('Current password is incorrect'));
    }

    // Hash new password
    const newPasswordHash = await hashPassword(new_password);

    // Update database
    await pool.query(
      'UPDATE employees SET password_hash = $1, must_change_password = false WHERE id = $2::uuid',
      [newPasswordHash, employee_id]
    );

    // Generate new JWT token with must_change_password = false
    const tokenPayload = {
      user_id: req.user.user_id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      client_id: req.user.client_id,
      employee_id: employee_id,
      must_change_password: false,
    };
    if (req.user.site_id) tokenPayload.site_id = req.user.site_id;

    const token = jwt.sign(tokenPayload, JWT_PRIVATE_KEY, {
      algorithm: JWT_ALGORITHM,
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    logger.info({
      action: 'password_changed',
      user_id: req.user.user_id,
      email: req.user.email,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({
      success: true,
      data: { token }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
