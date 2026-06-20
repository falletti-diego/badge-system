/**
 * Authentication Routes
 * POST /api/auth/login - User login (MVP: hardcoded credentials)
 * POST /api/auth/logout - User logout (frontend-side, optional endpoint)
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const pino = require('pino');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
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
    id: '550e8400-e29b-41d4-a716-446655440010', // Valid UUID for admin Pippo
    name: 'Pippo',
    role: 'admin',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
  },
  {
    email: 'pino@badge.local',
    password: process.env.DEMO_PINO_PASSWORD,
    id: '550e8400-e29b-41d4-a716-446655440011', // Valid UUID for manager Pino
    name: 'Pino',
    role: 'manager',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
    site_id: '550e8400-e29b-41d4-a716-446655440011', // Milano Store (matches database)
  },
  {
    email: 'maria@badge.local',
    password: process.env.DEMO_MARIA_PASSWORD,
    id: '239ec99f-3204-45ca-bce2-793f52442ec6', // Valid UUID for employee Maria (real planning record)
    name: 'Maria',
    role: 'employee',
    client_id: '550e8400-e29b-41d4-a716-446655440001',
    employee_id: '239ec99f-3204-45ca-bce2-793f52442ec6', // Maria Rossi — real employee id (matches planning)
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

    // Generate refresh token with jti for S.32.7 token rotation
    const jti = uuid();
    const refreshPayload = { user_id: user.id, type: 'refresh', jti };
    const refresh_token = jwt.sign(refreshPayload, JWT_PRIVATE_KEY, {
      algorithm: JWT_ALGORITHM,
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    // S.32.7 Fix #1: Track jti in used_tokens to enable race condition protection
    // This allows POST /auth/refresh to detect concurrent refresh attempts
    // (best-effort: if this fails, login still succeeds, refresh will detect via normal flow)
    if (user.id && !email.endsWith(BADGE_LOCAL_DOMAIN)) {
      // Only track for DB users (not demo users) — demo users don't need race protection
      // because DISABLE_AUTH always returns same tokens
      try {
        await pool.query(
          'INSERT INTO used_tokens (user_id, jti) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [user.id, jti]
        );
      } catch (jtiErr) {
        logger.warn({
          action: 'jti_tracking_failed',
          user_id: user.id,
          error: jtiErr.message,
        });
        // Continue with login even if jti tracking fails (best-effort)
      }
    }

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
 * S.32.7 Task 2: Token rotation with reuse detection
 *
 * Request body: { refresh_token }
 * Response: { data: { token (access), refresh_token (new refresh) } }
 *
 * Security fixes implemented:
 * - Fix #1: SELECT FOR UPDATE prevents concurrent refresh race condition
 * - Fix #2: Audit logging only for security events (replays, revokes), not routine refreshes
 * - Fix #3: Temporary revoke support via revoked_until with expiry check
 * - Fix #4: jti stored as SHA256 hash in audit logs (no plaintext token exposure)
 * - Fix #5: Try-finally ensures connection release even on error
 *
 * Token rotation: old jti deleted, new jti generated with new tokens
 * Replay detection: if old jti appears in used_tokens, user is revoked (Model 1 blacklist)
 */
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'MISSING_REFRESH_TOKEN', message: 'refresh_token is required' });
  }

  let client;
  try {
    // Decode JWT to extract jti_old and user_id
    let decoded;
    try {
      decoded = jwt.verify(refresh_token, JWT_PUBLIC_KEY, { algorithms: [JWT_ALGORITHM] });
    } catch (err) {
      logger.warn({ action: 'refresh_token_invalid', error: err.message });
      return res.status(401).json({ error: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired' });
    }

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'INVALID_TOKEN_TYPE', message: 'Token is not a refresh token' });
    }

    const jti_old = decoded.jti;
    const user_id = decoded.user_id;

    // First check if this is a demo user (no DB queries needed)
    const demoUser = DEMO_USERS.find((u) => u.id === user_id);

    // Fix #5: Get explicit connection for transaction control (try-finally cleanup)
    // Only connect to DB if needed (non-demo users or if jti needs to be checked/recorded)
    const needsDbConnection = !demoUser || jti_old;

    if (needsDbConnection) {
      try {
        client = await pool.connect();
      } catch (err) {
        logger.error({ action: 'db_connection_error', error: err.message });
        return res.status(500).json({ error: 'SERVER_ERROR', message: 'Database connection failed' });
      }
    }

    if (!demoUser) {
      // Guard against non-UUID user_id values
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_REGEX.test(user_id)) {
        if (client) client.release();
        return res.status(401).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
      }
    }

    try {
      // Only execute DB transactions if we have a client connection
      if (client) {
        // Fix #5: Use explicit transaction for atomicity
        await client.query('BEGIN');

        // Fix #1: SELECT FOR UPDATE prevents concurrent refresh race condition
        // Only check replay if jti is present (backward compatibility with legacy tokens)
        if (jti_old) {
          const replayCheck = await client.query(
            'SELECT 1 FROM used_tokens WHERE jti = $1 FOR UPDATE',
            [jti_old]
          );

          if (replayCheck.rows.length > 0) {
            // REPLAY DETECTED: Revoke the user to prevent further damage
            await client.query(
              `INSERT INTO revoked_tokens (user_id, revoked_at, reason, revoked_until)
               VALUES ($1, NOW(), $2, NULL)
               ON CONFLICT (user_id) DO UPDATE SET revoked_at = NOW(), revoked_until = NULL`,
              [user_id, 'REPLAY_ATTACK_DETECTED']
            );

            // Fix #4: Hash the jti for audit logging (no plaintext token exposure)
            const jti_hash = crypto.createHash('sha256').update(jti_old).digest('hex');
            logger.warn({
              action: 'REPLAY_ATTACK_DETECTED',
              user_id,
              jti_hash,
              timestamp: new Date().toISOString(),
            });

            await client.query('COMMIT');
            return res.status(401).json({ error: 'SESSION_REVOKED', message: 'Token replay detected, session revoked' });
          }
        }

        // Fix #3: Check if user is revoked (permanent or temporary revoke within window)
        const revokeCheck = await client.query(
          `SELECT revoked_at FROM revoked_tokens
           WHERE user_id = $1 AND (revoked_until IS NULL OR revoked_until > NOW())`,
          [user_id]
        );

        if (revokeCheck.rows.length > 0) {
          await client.query('COMMIT');
          return res.status(401).json({ error: 'SESSION_REVOKED', message: 'User session revoked' });
        }

        // Delete old jti from used_tokens (before generating new token) if jti exists
        if (jti_old) {
          await client.query('DELETE FROM used_tokens WHERE jti = $1', [jti_old]);
        }
      }

      // Build token payload (Check DEMO_USERS first, then database)
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
        const result = await client.query(
          `SELECT id, client_id, email, name, role, site_id
           FROM employees
           WHERE id = $1`,
          [user_id]
        );
        const dbEmployee = result.rows[0];
        if (!dbEmployee) {
          await client.query('COMMIT');
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

      // Generate new jti (Fix #1: prevent replay by using new unique jti)
      const jti_new = uuid();

      // Generate new access token (15m) and refresh token (7d) with new jti
      const token = jwt.sign(tokenPayload, JWT_PRIVATE_KEY, {
        algorithm: JWT_ALGORITHM,
        expiresIn: ACCESS_TOKEN_EXPIRY,
      });

      const refreshPayload = { ...tokenPayload, type: 'refresh', jti: jti_new };
      const newRefreshToken = jwt.sign(refreshPayload, JWT_PRIVATE_KEY, {
        algorithm: JWT_ALGORITHM,
        expiresIn: REFRESH_TOKEN_EXPIRY,
      });

      // Insert new jti into used_tokens (if DB connection available)
      if (client) {
        await client.query(
          `INSERT INTO used_tokens (user_id, jti)
           VALUES ($1, $2)`,
          [user_id, jti_new]
        );
        await client.query('COMMIT');
      }

      // Fix #2: Only log security events, not routine refreshes
      // (Routine refreshes are expected and don't need audit trail)
      // Actual audit logging for token events happens in requireAuth middleware

      res.json({
        data: {
          token,
          refresh_token: newRefreshToken,
        },
      });
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        logger.error({ action: 'rollback_error', error: rollbackErr.message });
      }
      throw err;
    }
  } catch (err) {
    logger.error({ action: 'refresh_error', error: err.message, stack: err.stack });
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Refresh failed, please try again' });
  } finally {
    // Fix #5: Always release connection in finally block (no connection leaks)
    if (client) {
      try {
        client.release();
      } catch (releaseErr) {
        logger.error({ action: 'connection_release_error', error: releaseErr.message });
      }
    }
  }
});

/**
 * POST /api/auth/revoke-session
 * S.32.7 Task 3: Universal revoke endpoint with RBAC
 *
 * Admin: can revoke any user
 * Manager: can revoke users at same site only
 * Employee/Viewer: forbidden
 *
 * Request body: { user_id: target_user_id }
 * Response (200): { success: true, message: "Session revoked for user..." }
 * Response (403): { error: "FORBIDDEN" }
 * Response (404): { error: "USER_NOT_FOUND" }
 *
 * Security fixes:
 * - Fix #2: Log admin actions only (session_revoked is security event)
 * - Fix #3: Support optional revoked_until expiry (permanent if NULL)
 * - Fix #5: Try-finally ensures connection release
 * - Fix #6: ON CONFLICT for idempotency (re-revoke updates timestamp)
 */
router.post('/revoke-session', requireAuth, async (req, res, next) => {
  const { user_id: target_user_id } = req.body;
  const { user_id: caller_id, role, site_id } = req.user;

  // Validation
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!target_user_id || !UUID_REGEX.test(target_user_id)) {
    return next(new ValidationError('user_id must be a valid UUID'));
  }

  let client;
  try {
    // Fix #5: Connection safety with try-finally
    client = await pool.connect();
    await client.query('BEGIN');

    try {
      // ---- RBAC Check ----
      if (role === 'admin') {
        // Admin can revoke anyone
      } else if (role === 'manager') {
        // Manager: verify target is at same site
        const targetUserResult = await client.query(
          'SELECT site_id FROM employees WHERE id = $1',
          [target_user_id]
        );
        if (targetUserResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return next(new NotFoundError('User not found'));
        }
        // Manager cannot revoke users at different sites or with no site assigned
        // (unassigned employees with site_id = NULL are not in any manager's scope)
        if (!targetUserResult.rows[0].site_id || targetUserResult.rows[0].site_id !== site_id) {
          await client.query('ROLLBACK');
          return next(new ForbiddenError('You can only revoke users at your site'));
        }
      } else {
        // Employee, viewer cannot revoke
        await client.query('ROLLBACK');
        return next(new ForbiddenError('Insufficient permissions'));
      }

      // ---- Model 1: Universal Revoke + Fix #3: optional expiry ----
      // INSERT with ON CONFLICT: idempotent (re-revoke updates timestamp)
      await client.query(
        `INSERT INTO revoked_tokens(user_id, revoked_at, revoked_by, reason, revoked_until)
         VALUES ($1, NOW(), $2, 'ADMIN_REVOKE', NULL)
         ON CONFLICT(user_id) DO UPDATE SET revoked_at=NOW(), reason='ADMIN_REVOKE'`,
        [target_user_id, caller_id]
      );

      // ---- Cleanup: delete all jti entries for this user ----
      await client.query('DELETE FROM used_tokens WHERE user_id = $1', [target_user_id]);

      // ---- Fix #2: Log admin actions only (not routine) ----
      await client.query(
        `INSERT INTO audit_log(action, user_id, details, timestamp)
         VALUES ('SESSION_REVOKED', $1, $2, NOW())`,
        [target_user_id, JSON.stringify({ revoked_by: caller_id, reason: 'ADMIN_REVOKE' })]
      );

      await client.query('COMMIT');

      logger.info({
        action: 'session_revoked',
        user_id: target_user_id,
        revoked_by: caller_id,
        role,
      });

      res.json({ success: true, message: `Session revoked for user ${target_user_id}` });

    } catch (innerErr) {
      // Fix #5: explicit rollback on error
      await client.query('ROLLBACK');
      throw innerErr;
    }

  } catch (err) {
    next(err);
  } finally {
    // Fix #5: Guarantee release
    if (client) client.release();
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

    // Verify old password matches.
    // @badge.local accounts have password_hash = NULL (password lives in env var) — verify via plaintext.
    // All other accounts use bcrypt hash from DB.
    let passwordMatch;
    if (!employee.password_hash) {
      const demoUser = DEMO_USERS.find(
        (u) => u.employee_id === employee_id || u.id === employee_id
      );
      passwordMatch = demoUser != null && demoUser.password === old_password;
    } else {
      passwordMatch = await verifyPassword(old_password, employee.password_hash);
    }
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

    // Generate refresh token
    const jti = uuid();
    const refreshPayload = { user_id: req.user.user_id, type: 'refresh', jti };
    const refresh_token = jwt.sign(refreshPayload, JWT_PRIVATE_KEY, {
      algorithm: JWT_ALGORITHM,
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    logger.info({
      action: 'password_changed',
      user_id: req.user.user_id,
      email: req.user.email,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({
      data: {
        token,
        refresh_token,
        user: {
          id: req.user.user_id,
          email: req.user.email,
          name: req.user.name,
          role: req.user.role,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
