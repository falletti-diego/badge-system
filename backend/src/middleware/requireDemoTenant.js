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
 * On success, attaches the looked-up row to req.demoClient (currently
 * { is_demo, demo_contact_email }) so a downstream handler (e.g.
 * POST /demo/contact, which needs demo_contact_email for its notification
 * email) can reuse it without a second redundant is_demo query.
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
      'SELECT is_demo, demo_contact_email FROM clients WHERE id = $1',
      [clientId]
    );
    const client = clientResult.rows[0];

    if (!client || client.is_demo !== true) {
      logger.warn({ action: 'require_demo_tenant_forbidden', client_id: clientId });
      return next(new ForbiddenError('This endpoint is only available for demo tenants'));
    }

    req.demoClient = client;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireDemoTenant };
