/**
 * Middleware: Check for revoked user sessions
 * Enforces revocations on every API request (AFTER @requireAuth)
 *
 * S.32.7 Task 4: Universal Session Revocation Enforcement
 *
 * Purpose:
 * - Ensures revoked users cannot access ANY API endpoint
 * - Checks revoked_tokens table for active revocations
 * - Returns 401 SESSION_REVOKED if user is revoked
 * - Logs REVOKED_TOKEN_ATTEMPT in audit_log
 * - Supports temporary revocations via revoked_until with auto-expiry
 *
 * Assumptions:
 * - Runs AFTER @requireAuth middleware (user_id guaranteed in req.user)
 * - Database pool is available at require('../db/pool').pool
 * - Audit logging is handled locally (no need for audit middleware after this)
 *
 * Fixes:
 * - Fix #1: Atomic revocation check with SELECT (no race conditions)
 * - Fix #2: Only log security events (REVOKED_TOKEN_ATTEMPT), not routine checks
 * - Fix #3: Temporary revocation support via revoked_until with auto-expiry
 * - Fix #4: Log jti_hash (never plaintext jti)
 * - Fix #5: Parameterized queries prevent SQL injection
 */

const pino = require('pino');
const { pool } = require('../db/pool');
const { SessionRevokedError, InternalServerError } = require('../utils/errors');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Middleware: checkRevoked()
 * Checks if authenticated user has an active revocation
 * Safely skips unauthenticated requests (no req.user)
 *
 * @param {Request} req - Express request with optional req.user.user_id
 * @param {Response} res - Express response
 * @param {Function} next - Express next() callback
 */
async function checkRevoked(req, res, next) {
  try {
    // Skip if no user context (unauthenticated endpoint like POST /login)
    if (!req.user || !req.user.user_id) {
      return next();
    }

    // Extract user context from req.user (from @requireAuth middleware)
    const { user_id } = req.user;
    const jti_hash = req.user.jti_hash || null; // From JWT (hashed jti)

    // Query revoked_tokens table
    // Check: (revoked_until IS NULL) OR (revoked_until > NOW())
    // This means: permanent revoke OR temporary revoke still active
    // If revoked_until < NOW(), revocation has expired (not included in results)
    const result = await pool.query(
      `SELECT revoked_at, reason, revoked_by
       FROM revoked_tokens
       WHERE user_id = $1
       AND (revoked_until IS NULL OR revoked_until > NOW())
       LIMIT 1`,
      [user_id]
    );

    // If user is revoked (safely handle any result structure)
    // In tests with mocks, result might be undefined, which is safe (treat as not revoked)
    if (result?.rows?.length > 0) {
      const { reason, revoked_by } = result.rows[0];

      // Fix #2: Log security event (REVOKED_TOKEN_ATTEMPT)
      // Only log on actual revocation attempt, not routine checks
      try {
        await pool.query(
          `INSERT INTO audit_log (action, entity, user_id, jti_hash, timestamp)
           VALUES ('REVOKED_TOKEN_ATTEMPT', $1, $2, $3, NOW())`,
          ['user', user_id, jti_hash]
        );
      } catch (auditErr) {
        // Log audit error but don't block the revocation response
        logger.warn({
          action: 'audit_log_insert_failed',
          error: auditErr.message,
          user_id,
        });
      }

      // Return 401 SESSION_REVOKED
      return next(new SessionRevokedError(
        `User revocation active${reason ? ': ' + reason : ''}`
      ));
    }

    // User not revoked, proceed to next middleware/route
    next();
  } catch (err) {
    // Database error during revocation check
    logger.error({
      action: 'checkRevoked_middleware_error',
      error: err.message,
      user_id: req.user?.user_id,
      stack: err.stack,
    });

    // Return 500 on database errors (fail-closed for security)
    next(new InternalServerError('Failed to verify session status'));
  }
}

module.exports = checkRevoked;
