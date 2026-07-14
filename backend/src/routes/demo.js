/**
 * Demo Routes — Ambiente Demo Self-Service (Task 3 of 9)
 *
 * POST /api/v1/demo/start — public, unauthenticated, rate-limited.
 * Creates (or resumes) a self-service demo tenant from just an email
 * address, seeds it with realistic sample data (demoSeed.js), and returns
 * a login-shaped response `{ token, refresh_token, user, resumed }` so the
 * frontend can reuse the same authService.setSession(...) flow used by a
 * normal login — including transparently renewing the session past the
 * 15-minute access-token window via the existing POST /api/v1/auth/refresh.
 *
 * Security-sensitive: this is a public POST endpoint that creates database
 * rows and issues JWTs from nothing but caller-supplied input. See the
 * plan's Checkpoint 3 for the full threat list this file defends against:
 *   - body-shape injection (only `email` accepted — see DemoStartSchema)
 *   - brute-force / resource exhaustion (demoStartLimiter, MAX_ACTIVE_DEMOS)
 *   - existing-email enumeration (generic message for real customer emails)
 *   - UNIQUE-constraint race condition on clients.email (23505 fallback)
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const pino = require('pino');
const { v4: uuid } = require('uuid');
const { createValidationMiddleware, DemoStartSchema, DemoSwitchRoleSchema } = require('../middleware/validation');
const { ConflictError, ForbiddenError, InternalServerError, NotFoundError } = require('../utils/errors');
const { pool } = require('../db/pool');
const { seedDemoTenant } = require('../utils/demoSeed');
const { logAudit } = require('../middleware/audit');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Same JWT config as routes/auth.js — required envs are already validated
// fail-fast at auth.js load time (auth.js is always required before this
// file in app.js), so we don't duplicate that check here.
const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n');
const JWT_ALGORITHM = 'RS256';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

// Deliberately prudent default for a db.t3.micro — see plan Checkpoint 3.
const MAX_ACTIVE_DEMOS = parseInt(process.env.MAX_ACTIVE_DEMOS || '20', 10);

// Bound as a query parameter (`now() + $N::interval`) at both call sites
// below rather than string-interpolated into SQL text — single source of
// truth for the trial length, with no string ever spliced into a query.
const DEMO_TENANT_EXPIRY_DAYS = '7 days';
// Postgres auto-generated name for `email VARCHAR(100) NOT NULL UNIQUE` on
// clients — verified against the actual schema (`\d clients`). Scoping the
// 23505 catch to this specific constraint (rather than any 23505 raised
// anywhere in the transaction, e.g. from seedDemoTenant's own inserts)
// prevents an unrelated unique-violation from being misrouted into "resume".
const CLIENTS_EMAIL_UNIQUE_CONSTRAINT = 'clients_email_key';

/**
 * Builds the login-shaped { token, refresh_token, user } triple for a demo
 * admin employee, mirroring routes/auth.js POST /login's token payload,
 * refresh-token issuance, and user response shape exactly — a self-service
 * demo is meant to run unattended for the full 7-day trial, so it needs the
 * same renewable-session mechanics as a real login, not just a 15-minute
 * access token with no way to recover it.
 *
 * @param {{ id: string, email: string, name: string, role: string, site_id?: string|null }} admin
 * @param {string} clientId
 */
async function issueDemoSession(admin, clientId) {
  const tokenPayload = {
    user_id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    client_id: clientId,
    employee_id: admin.id,
  };
  if (admin.site_id) tokenPayload.site_id = admin.site_id;

  const token = jwt.sign(tokenPayload, JWT_PRIVATE_KEY, {
    algorithm: JWT_ALGORITHM,
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });

  // Refresh token with jti, mirroring routes/auth.js POST /login (S.32.7
  // token rotation) — this is what lets POST /api/v1/auth/refresh silently
  // renew a demo session past the 15-minute access-token window.
  const jti = uuid();
  const refreshPayload = { user_id: admin.id, type: 'refresh', jti };
  const refresh_token = jwt.sign(refreshPayload, JWT_PRIVATE_KEY, {
    algorithm: JWT_ALGORITHM,
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });

  // Best-effort jti tracking (same pattern and same tradeoff as auth.js's
  // POST /login): enables /auth/refresh's replay-detection for this
  // session, but a tracking failure must never block demo access — the
  // demo session still starts, refresh just falls back to its
  // backward-compatible no-jti path if this row never landed.
  try {
    await pool.query(
      'INSERT INTO used_tokens (user_id, jti) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [admin.id, jti]
    );
  } catch (jtiErr) {
    logger.warn({
      action: 'jti_tracking_failed',
      user_id: admin.id,
      error: jtiErr.message,
    });
  }

  const user = {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    employee_id: admin.id,
  };
  if (admin.site_id) user.site_id = admin.site_id;

  return { token, refresh_token, user };
}

/**
 * Resume path: extend an existing demo tenant's expiry, re-issue its admin
 * JWT, and audit-log `demo_tenant_resumed`. Used both for the "found an
 * existing is_demo=true client up front" case and for the 23505
 * race-condition fallback (a concurrent request created the tenant between
 * our pre-check and our own INSERT).
 *
 * Runs its own short-lived transaction so the expiry UPDATE and audit log
 * are atomic, even though the caller may have already opened (and rolled
 * back) an unrelated transaction for the "new tenant" attempt.
 *
 * @param {string} clientId
 */
async function resumeDemoTenant(clientId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updateResult = await client.query(
      `UPDATE clients SET demo_expires_at = now() + $2::interval
       WHERE id = $1
       RETURNING id`,
      [clientId, DEMO_TENANT_EXPIRY_DAYS]
    );

    if (updateResult.rows.length === 0) {
      // Should not happen (clientId came from our own lookup moments ago),
      // but fail closed rather than issuing a token for a nonexistent tenant.
      await client.query('ROLLBACK');
      throw new InternalServerError('Demo tenant could not be resumed');
    }

    const adminResult = await client.query(
      `SELECT id, email, name, role, site_id
       FROM employees
       WHERE client_id = $1 AND role = 'admin'
       LIMIT 1`,
      [clientId]
    );

    const admin = adminResult.rows[0];
    if (!admin) {
      // Data-integrity guard: an is_demo=true client with no admin employee
      // means seeding never completed. Fail closed rather than issue a
      // token with no employee_id.
      await client.query('ROLLBACK');
      throw new InternalServerError('Demo tenant admin account not found');
    }

    const { token, refresh_token, user } = await issueDemoSession(admin, clientId);

    await logAudit(client, {
      action: 'demo_tenant_resumed',
      entity: 'client',
      entityId: clientId,
      newValue: { client_id: clientId },
      userId: admin.id,
    });

    await client.query('COMMIT');

    return { token, refresh_token, user };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore rollback error, original error is what matters */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * POST /demo/start
 * Body: { email }
 */
router.post('/start', createValidationMiddleware(DemoStartSchema), async (req, res, next) => {
  const { email } = req.validated.body;

  try {
    // ---- Pre-check: does this email already exist? (UX only — see below) ----
    // Deliberately checked BEFORE the active-demo cap: resuming an existing
    // demo tenant does not create a new active demo (it was already counted
    // by the cap query below), so a caller resuming their own tenant must
    // never be blocked just because the system happens to be at capacity.
    const existingResult = await pool.query(
      'SELECT id, is_demo FROM clients WHERE email = $1',
      [email]
    );
    const existing = existingResult.rows[0];

    if (existing && !existing.is_demo) {
      // Real (non-demo) client email — generic message, no tenant created.
      // This doesn't hide *whether* the email exists (a resume-vs-refuse
      // design can't avoid that — a 200 vs. this branch already signals
      // it); it only avoids revealing *which type* of account it is, so a
      // caller can't distinguish "real customer" from any other refusal
      // reason via the response body.
      throw new ConflictError(
        'Questo indirizzo è già registrato — contattaci se hai bisogno di aiuto',
        'EMAIL_ALREADY_REGISTERED'
      );
    }

    if (existing && existing.is_demo) {
      const { token, refresh_token, user } = await resumeDemoTenant(existing.id);
      return res.json({ data: { token, refresh_token, user, resumed: true } });
    }

    // ---- Global active-demo cap (resource guard for db.t3.micro) ----
    // Only checked on the genuine "new tenant" path — resumes (above) don't
    // add to the active-demo count, so they must never be blocked by it.
    const capResult = await pool.query(
      'SELECT COUNT(*)::int AS n FROM clients WHERE is_demo = true AND demo_expires_at > now()'
    );
    if (capResult.rows[0].n >= MAX_ACTIVE_DEMOS) {
      logger.warn({ action: 'demo_start_cap_exceeded', activeDemos: capResult.rows[0].n, maxActiveDemos: MAX_ACTIVE_DEMOS });
      throw new ConflictError(
        'Troppe demo attive al momento, riprova più tardi o contattaci',
        'TOO_MANY_ACTIVE_DEMOS'
      );
    }

    // ---- New tenant path ----
    // The pre-check above is a best-effort UX shortcut for the common case;
    // it does NOT close the race window between two near-simultaneous
    // requests for the same email. The real safety net is the catch below,
    // which detects the UNIQUE-constraint violation on clients.email and
    // falls back to the same resume path instead of propagating a raw
    // Postgres error / generic 500.
    const client = await pool.connect();
    // Set when the concurrent-insert race is detected below: signals that
    // the caller should fall back to resumeDemoTenant() for `raceWinnerId`
    // *after* this transaction's client has been released, rather than
    // inside the try/catch (avoids double-releasing the same PoolClient).
    let raceWinnerEmail = null;
    try {
      await client.query('BEGIN');
      let newClientId = null;

      try {
        const insertResult = await client.query(
          `INSERT INTO clients (id, name, email, plan, is_demo, demo_expires_at, demo_contact_email)
           VALUES (uuid_generate_v4(), $1, $2, 'demo', true, now() + $3::interval, $2)
           RETURNING id`,
          ['Demo Tenant', email, DEMO_TENANT_EXPIRY_DAYS]
        );
        newClientId = insertResult.rows[0].id;
      } catch (insertErr) {
        if (insertErr.code === '23505' && insertErr.constraint === CLIENTS_EMAIL_UNIQUE_CONSTRAINT) {
          // Race: a concurrent request for the same email committed between
          // our pre-check and this INSERT. Roll back our half-open
          // transaction and fall back to resume — never propagate a raw
          // Postgres error to the caller. The actual resume happens after
          // this try/catch/finally releases `client` (newClientId stays
          // null, so the block below is skipped naturally).
          await client.query('ROLLBACK');
          raceWinnerEmail = email;
        } else {
          throw insertErr;
        }
      }

      if (newClientId) {
        const seedResult = await seedDemoTenant(newClientId, client);
        const admin = seedResult.employees.admin;

        await logAudit(client, {
          action: 'demo_tenant_created',
          entity: 'client',
          entityId: newClientId,
          newValue: { email, client_id: newClientId, site_id: seedResult.site.id },
          userId: admin.id,
        });

        await client.query('COMMIT');

        logger.info({
          action: 'demo_tenant_created',
          client_id: newClientId,
          checkins: seedResult.counts.checkins,
        });

        const { token, refresh_token, user } = await issueDemoSession(admin, newClientId);
        res.json({ data: { token, refresh_token, user, resumed: false } });
      }
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {
        /* ignore rollback error, original error is what matters */
      }
      throw err;
    } finally {
      client.release();
    }

    if (raceWinnerEmail) {
      const winnerResult = await pool.query(
        'SELECT id FROM clients WHERE email = $1',
        [raceWinnerEmail]
      );
      const winner = winnerResult.rows[0];
      if (!winner) {
        // Extremely unlikely (would mean the row was deleted between the
        // unique_violation and this re-query) — fail closed.
        throw new InternalServerError('Demo tenant creation conflict could not be resolved');
      }
      const { token, refresh_token, user } = await resumeDemoTenant(winner.id);
      res.json({ data: { token, refresh_token, user, resumed: true } });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /demo/switch-role
 * Requires requireAuth (valid JWT for the current demo session).
 *
 * Fail-closed guard (non-negotiable — see plan Checkpoint 4): before doing
 * anything else, verify the caller's own client_id has is_demo = true. This
 * endpoint must NEVER be able to re-issue a JWT for a real tenant's
 * employees, so the guard is the very first thing this handler does, and a
 * failure here returns 403 immediately with no further work.
 *
 * Body: { role: 'admin'|'manager'|'employee' } (Zod enum — see
 * DemoSwitchRoleSchema — no other value accepted).
 *
 * Looks up the demo employee with that role WITHIN THE SAME client_id as
 * the caller (never cross-tenant — demoSeed.js guarantees every demo
 * tenant has exactly one employee per role), issues a fresh JWT for them
 * via the same issueDemoSession() helper POST /demo/start uses (so the new
 * session gets the same used_tokens jti tracking / refresh mechanics).
 *
 * If the requested role is the caller's current role, this is a no-op:
 * still re-issues an equivalent token, no special-cased response — the
 * frontend doesn't need to handle a different shape for this case.
 *
 * Session hygiene: after issuing the new role's token, the previous role's
 * refresh session is invalidated via a targeted
 * `DELETE FROM used_tokens WHERE user_id = $1` (previous role's
 * employee_id) — NOT by reusing POST /auth/revoke-session's permanent
 * revoked_tokens logic (see plan's resolved design decision: that would
 * risk a demo visitor's later real Admin session being permanently
 * revoked by a stale revoked_tokens row keyed on the same employee_id).
 * The DELETE is scoped and self-contained: if the old refresh token is
 * ever replayed, POST /auth/refresh's replay-detection (an absent
 * used_tokens row = already consumed) correctly rejects it with 401.
 */
router.post('/switch-role', requireAuth, createValidationMiddleware(DemoSwitchRoleSchema), async (req, res, next) => {
  const { role } = req.validated.body;
  const { client_id: clientId, user_id: previousUserId } = req.user;

  try {
    // ---- Fail-closed guard: caller's own tenant must be a demo tenant ----
    const clientResult = await pool.query(
      'SELECT is_demo FROM clients WHERE id = $1',
      [clientId]
    );
    const callerClient = clientResult.rows[0];
    if (!callerClient || callerClient.is_demo !== true) {
      logger.warn({ action: 'demo_switch_role_forbidden', client_id: clientId });
      throw new ForbiddenError('This endpoint is only available for demo tenants');
    }

    // ---- Find the target-role employee, scoped to the SAME client_id ----
    const employeeResult = await pool.query(
      'SELECT id, email, name, role, site_id FROM employees WHERE client_id = $1 AND role = $2 LIMIT 1',
      [clientId, role]
    );
    const targetEmployee = employeeResult.rows[0];
    if (!targetEmployee) {
      // Data-integrity guard: demoSeed.js guarantees one employee per role,
      // so this should not happen — fail closed rather than issue a
      // malformed token.
      throw new NotFoundError(`No demo employee found for role "${role}" in this tenant`);
    }

    const { token, refresh_token, user } = await issueDemoSession(targetEmployee, clientId);

    // ---- Session hygiene: invalidate the previous role's refresh session ----
    // Targeted delete only — see function doc comment above for why this is
    // NOT a call into revoke-session's revoked_tokens logic.
    try {
      await pool.query('DELETE FROM used_tokens WHERE user_id = $1', [previousUserId]);
    } catch (cleanupErr) {
      logger.warn({
        action: 'demo_switch_role_session_cleanup_failed',
        user_id: previousUserId,
        error: cleanupErr.message,
      });
      // Best-effort — do not block the role switch itself on this cleanup.
    }

    await logAudit(pool, {
      action: 'demo_role_switch',
      entity: 'client',
      entityId: clientId,
      newValue: { role, employee_id: targetEmployee.id, previous_user_id: previousUserId },
      userId: targetEmployee.id,
    });

    logger.info({
      action: 'demo_role_switch',
      client_id: clientId,
      previous_user_id: previousUserId,
      new_role: role,
      new_user_id: targetEmployee.id,
    });

    res.json({ data: { token, refresh_token, user } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.issueDemoSession = issueDemoSession;
