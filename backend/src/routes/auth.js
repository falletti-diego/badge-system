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
const { DEMO_USERS } = require('../__fixtures__/demo-users');

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
      const clientFilter = client_id ? 'AND e.client_id = $2' : '';
      const result = await pool.query(
        `SELECT e.id, e.client_id, e.email, e.name, e.role, e.site_id, e.password_hash,
                e.must_change_password, e.external_employee_id,
                c.name AS client_name, s.name AS site_name
         FROM employees e
         JOIN clients c ON c.id = e.client_id
         LEFT JOIN sites s ON s.id = e.site_id
         WHERE e.email = $1 AND e.password_hash IS NOT NULL ${clientFilter}
         ORDER BY e.created_at ASC
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
            external_employee_id: dbEmployee.external_employee_id || null,
            client_name: dbEmployee.client_name || null,
            site_name: dbEmployee.site_name || null,
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
    // `email` is included so POST /refresh can tell a @badge.local demo
    // session apart from a real DB session by domain, the same signal
    // login itself just used below -- NOT by re-deriving identity from
    // `user_id` via DEMO_USERS.find(), which collides for any real
    // employee whose id happens to match a DEMO_USERS fixture entry
    // (e.g. maria.rossi@torino.it, see migrations/022_merge_maria_*).
    const jti = uuid();
    const refreshPayload = { user_id: user.id, email: user.email, type: 'refresh', jti };
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
    if (user.external_employee_id) userResponse.external_employee_id = user.external_employee_id;
    if (user.client_name) userResponse.client_name = user.client_name;
    if (user.site_name) userResponse.site_name = user.site_name;

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
 * Replay detection: absence of the current jti in used_tokens means it was
 * already consumed (or never issued) — the request is treated as a replay
 * and the session is temporarily revoked. Presence means the token is
 * still valid and unconsumed; it is deleted (consumed) here and replaced
 * with a freshly rotated jti below. Demo (@badge.local) accounts are
 * exempt — see BADGE_LOCAL_DOMAIN guard in POST /login.
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

    // Whether THIS session was issued via the @badge.local demo login path
    // (POST /login skips used_tokens tracking there — see BADGE_LOCAL_DOMAIN
    // guard above). Derived from the token's own `email` claim, NOT from
    // `demoUser` (an id-based DEMO_USERS lookup) — a real employee's id can
    // collide with a DEMO_USERS fixture id (e.g. maria.rossi@torino.it now
    // shares an id with the maria@badge.local fixture entry, see
    // migrations/022_merge_maria_badge_local_to_real_employee.sql), which
    // would otherwise falsely exempt her real, DB-authenticated session
    // from replay tracking. Refresh tokens issued before this fix may lack
    // `email` (the very first refresh_token from POST /login didn't carry
    // it); the typeof guard treats that as "not a demo session" — the safe
    // default, since normal (non-exempt) tracking is what a real user needs
    // regardless of whether `email` happens to be present.
    const isBadgeLocalSession = typeof decoded.email === 'string' && decoded.email.endsWith(BADGE_LOCAL_DOMAIN);

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

        // Fix #3: Check if user is revoked (permanent or temporary revoke
        // within window). Runs BEFORE the replay check (reordered from the
        // original): an admin revoke (POST /revoke-session) deletes the
        // user's used_tokens rows, which would otherwise make the replay
        // check below fire on legitimate grounds (row absent) and
        // overwrite a PERMANENT revoke (revoked_until=NULL) with a
        // temporary 5-minute one via its ON CONFLICT DO UPDATE — silently
        // un-revoking the user 5 minutes later. Checking revoked_tokens
        // first means a revoked user always gets the correct
        // "User session revoked" response and the revoke is never touched.
        const revokeCheck = await client.query(
          `SELECT revoked_at FROM revoked_tokens
           WHERE user_id = $1 AND (revoked_until IS NULL OR revoked_until > NOW())`,
          [user_id]
        );

        if (revokeCheck.rows.length > 0) {
          await client.query('COMMIT');
          return res.status(401).json({ error: 'SESSION_REVOKED', message: 'User session revoked' });
        }

        // Fix #1 (corrected): SELECT FOR UPDATE locks the current, valid,
        // not-yet-consumed jti row so concurrent refresh attempts of the
        // SAME token serialize instead of both succeeding. Presence of the
        // row means "this jti is the current valid token, not yet
        // consumed" (it was inserted either at login, or by a prior
        // refresh's rotation) — proceed and consume it. Absence means the
        // jti was already consumed by an earlier refresh (a genuine
        // replay) or never existed (forged/garbage jti) — reject.
        //
        // @badge.local demo sessions are exempt: POST /login deliberately
        // never inserts a used_tokens row for them (see BADGE_LOCAL_DOMAIN
        // guard above), so their jti is *always* "absent" by design —
        // applying the found/not-found check to them would reject every
        // single demo refresh as a false replay.
        if (jti_old && !isBadgeLocalSession) {
          const currentJtiCheck = await client.query(
            'SELECT 1 FROM used_tokens WHERE jti = $1 FOR UPDATE',
            [jti_old]
          );

          if (currentJtiCheck.rows.length === 0) {
            // REPLAY DETECTED: this jti was already consumed by an earlier
            // refresh, or never issued. Temporary 5-minute block (not
            // permanent — concurrent-tab false positives occur).
            await client.query(
              `INSERT INTO revoked_tokens (user_id, revoked_at, reason, revoked_until)
               VALUES ($1, NOW(), $2, NOW() + INTERVAL '5 minutes')
               ON CONFLICT (user_id) DO UPDATE SET revoked_at = NOW(), revoked_until = NOW() + INTERVAL '5 minutes'`,
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

        // Consume (delete) the current jti now that it's been validated —
        // it's about to be replaced by a freshly rotated one below.
        if (jti_old && !isBadgeLocalSession) {
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
          `SELECT e.id, e.client_id, e.email, e.name, e.role, e.site_id,
                  c.is_demo, c.demo_expires_at
           FROM employees e
           JOIN clients c ON c.id = e.client_id
           WHERE e.id = $1`,
          [user_id]
        );
        const dbEmployee = result.rows[0];
        if (!dbEmployee) {
          await client.query('COMMIT');
          return res.status(401).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
        }

        // Self-service demo tenant (Task 6 of 9 — Ambiente Demo
        // Self-Service): once demo_expires_at has passed, this refresh
        // token must be permanently unusable from here on, so the
        // frontend can show DemoExpiredPage instead of retrying forever.
        // The old jti was already consumed above (replay-check/consume
        // sequence is untouched) -- that's intentional, matching "expired"
        // semantics. Real customers have is_demo=false and
        // demo_expires_at=NULL, so this short-circuits to false for them
        // via the first two clauses without ever evaluating the Date
        // comparison.
        if (dbEmployee.is_demo && dbEmployee.demo_expires_at && new Date(dbEmployee.demo_expires_at) < new Date()) {
          await client.query('COMMIT');
          return res.status(401).json({ error: 'DEMO_EXPIRED', message: 'This demo has expired' });
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

      // Insert new jti into used_tokens (if DB connection available). Skipped
      // for @badge.local demo sessions -- POST /login never tracks their
      // jti either, so tracking it only on rotation would leave orphaned,
      // never-checked, never-cleaned rows accumulating in used_tokens for
      // every demo refresh.
      if (client) {
        if (!isBadgeLocalSession) {
          await client.query(
            `INSERT INTO used_tokens (user_id, jti)
             VALUES ($1, $2)`,
            [user_id, jti_new]
          );
        }
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
