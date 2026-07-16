/**
 * Middleware: requireDemoTenant
 *
 * Fail-closed guard shared by every demo-only route that requires an
 * authenticated session (POST /demo/switch-role, POST /demo/contact — see
 * routes/demo.js). Must run AFTER requireAuth (needs req.user.client_id).
 *
 * Extracted from POST /demo/switch-role's original inline guard (Task 4 of
 * 9 — Ambiente Demo Self-Service) per code review: the plan itself states
 * that /demo/contact reuses the same is_demo check as switch-role, so this
 * was pulled out instead of duplicating the inline query a second time.
 *
 * Verifies the caller's own client_id resolves to a client with
 * is_demo = true. This endpoint family must NEVER operate on behalf of a
 * real tenant's employees, so a missing client_id, a client_id with no
 * matching row, or is_demo !== true all fail closed with a 403 — never a
 * silent next().
 *
 * Also enforces demo_expires_at (added Task 6 of 9, code-review follow-up):
 * POST /demo/switch-role re-issues a fresh 15-minute access token + 7-day
 * refresh token on every call and never goes through POST /auth/refresh,
 * so the DEMO_EXPIRED check added there did not cover it — a demo tenant
 * within the cleanup script's 7-day grace period could call switch-role
 * every ~14 minutes to renew its session indefinitely, bypassing the
 * intended soft-expiry entirely. Checking demo_expires_at here instead of
 * duplicating the check in each route closes the gap for switch-role,
 * contact, and any future demo-authenticated route in one place. This is
 * a distinct condition from is_demo !== true ("not a demo tenant" — stays
 * a 403 ForbiddenError) — an expired demo IS a demo tenant, just one past
 * its trial window, so it gets its own 401 DEMO_EXPIRED response,
 * deliberately matching the shape POST /auth/refresh already uses for the
 * same condition (a direct res.status/json call, not next(err), so the
 * status/shape here is exact and not reinterpreted by the error-handling
 * middleware).
 *
 * On success, attaches the looked-up row to req.demoClient (currently
 * { is_demo, demo_contact_email, demo_expires_at }) so a downstream
 * handler (e.g. POST /demo/contact, which needs demo_contact_email for its
 * notification email) can reuse it without a second redundant query.
 */

const pino = require('pino');
const { pool } = require('../db/pool');
const { ForbiddenError } = require('../utils/errors');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

async function requireDemoTenant(req, res, next) {
  const clientId = req.user && req.user.client_id;

  try {
    const clientResult = await pool.query(
      'SELECT is_demo, demo_contact_email, demo_expires_at FROM clients WHERE id = $1',
      [clientId]
    );
    const client = clientResult.rows[0];

    if (!client || client.is_demo !== true) {
      logger.warn({ action: 'require_demo_tenant_forbidden', client_id: clientId });
      return next(new ForbiddenError('This endpoint is only available for demo tenants'));
    }

    // Same short-circuit pattern as routes/auth.js's POST /refresh check:
    // demo_expires_at is only ever non-null for is_demo=true rows, but the
    // null-guard is kept anyway as a defensive no-op rather than assuming
    // that invariant always holds.
    if (client.is_demo && client.demo_expires_at && new Date(client.demo_expires_at) < new Date()) {
      logger.warn({ action: 'require_demo_tenant_expired', client_id: clientId });
      return res.status(401).json({ error: 'DEMO_EXPIRED', message: 'This demo has expired' });
    }

    req.demoClient = client;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireDemoTenant };
