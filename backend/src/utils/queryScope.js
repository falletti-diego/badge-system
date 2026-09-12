'use strict';

/**
 * Query scope builder for RBAC — fail-closed validation + WHERE clause generation
 * Used by checkins GET, checkins/stats, export, and presences routes.
 *
 * Validates user claims (role, employee_id, site_id) and throws 403 if validation fails.
 * Returns { whereClauses: [...], params: [...] } ready for SQL interpolation.
 */

const { ForbiddenError } = require('./errors');
const { isAdminEquivalent } = require('./roles');

/**
 * Build scoped WHERE clauses and params for the user's role and filters.
 *
 * @param {object} user - req.user (client_id, role, employee_id, site_id)
 * @param {object} filters - { siteId, employeeId, dateFrom, dateTo } (already resolved to UUIDs)
 * @param {string} alias - SQL table alias (e.g., 'c' for checkins, 'ci' for checkins inner join)
 * @returns {object} { whereClauses: [...], params: [...] }
 * @throws {ForbiddenError} if validation fails
 */
function buildScopedFilters(user, filters = {}, alias = 'c') {
  const { client_id, role, employee_id, site_id } = user;
  const { employeeId, siteId, dateFrom, dateTo } = filters;

  const whereClauses = [];
  const params = [];
  let paramCount = 0;

  // ─── Mandatory: client_id isolation (always first) ──────────────────

  paramCount++;
  whereClauses.push(`${alias}.client_id = $${paramCount}::uuid`);
  params.push(client_id);

  // ─── Role-based validation and filtering ──────────────────────────

  if (role === 'employee') {
    // Employee: must have employee_id in token; can only see own data
    if (!employee_id) {
      throw new ForbiddenError(
        'Your account has no employee profile — cannot access this endpoint',
        'NO_EMPLOYEE_PROFILE'
      );
    }

    // If filter specifies a different employee, reject
    if (employeeId && employeeId !== employee_id) {
      throw new ForbiddenError(
        'You can only access your own data',
        'FORBIDDEN_EMPLOYEE'
      );
    }

    // Apply employee_id filter
    paramCount++;
    whereClauses.push(`${alias}.employee_id = $${paramCount}::uuid`);
    params.push(employee_id);
  } else if (role === 'manager') {
    // Manager: must have site_id in token; can only see own site
    if (!site_id) {
      throw new ForbiddenError(
        'Manager has no assigned site',
        'NO_SITE_ASSIGNED'
      );
    }

    // If filter specifies a different site, reject
    if (siteId && siteId !== site_id) {
      throw new ForbiddenError(
        'You can only access data for your assigned site',
        'FORBIDDEN_SITE'
      );
    }

    // Apply site_id filter (default to manager's site if not specified)
    const scopeSiteId = siteId || site_id;
    paramCount++;
    whereClauses.push(`${alias}.site_id = $${paramCount}::uuid`);
    params.push(scopeSiteId);
  } else if (isAdminEquivalent(role) || role === 'viewer') {
    // Admin-equivalent (admin/superadmin/senior_manager/director) + viewer:
    // no role-based filtering; apply explicit filters if provided
    if (siteId) {
      paramCount++;
      whereClauses.push(`${alias}.site_id = $${paramCount}::uuid`);
      params.push(siteId);
    }

    if (employeeId) {
      paramCount++;
      whereClauses.push(`${alias}.employee_id = $${paramCount}::uuid`);
      params.push(employeeId);
    }
  } else {
    // Unknown role: fail-closed
    throw new ForbiddenError(
      `Unauthorized role: ${role}`,
      'UNAUTHORIZED_ROLE'
    );
  }

  // ─── Optional: date range (applied to all roles) ──────────────────
  //
  // ${alias}.timestamp is TIMESTAMPTZ; comparing it against a bare DATE
  // parameter relies on Postgres's implicit DATE→TIMESTAMPTZ cast, which
  // interprets midnight in the DB SESSION's timezone (UTC on AWS RDS by
  // default, never overridden anywhere in this codebase) — not Europe/Rome,
  // the calendar the dateFrom/dateTo query params are actually expressed in.
  // During the ~00:00-02:00 Europe/Rome window this silently drops/admits
  // the wrong rows. Same bug class already fixed twice elsewhere (commit
  // 615fcbf, 2026-08-18; commit 89986b3, 2026-08-22) — here the boundary
  // itself is built as an explicit Europe/Rome instant.
  //
  // IMPORTANT: `date AT TIME ZONE zone` alone does NOT do what it looks
  // like it does — Postgres first implicitly casts the bare DATE to
  // TIMESTAMPTZ (interpreting midnight in the SESSION timezone, the exact
  // bug we're fixing), then AT TIME ZONE converts that instant to `zone`'s
  // wall-clock as a plain timestamp. The explicit `::timestamp` cast in
  // between is required: it produces a timezone-naive midnight first, which
  // AT TIME ZONE then correctly reinterprets as Europe/Rome wall-clock and
  // converts to a real instant (verified manually against a live session
  // with timezone=UTC — omitting the `::timestamp` cast silently reproduces
  // the original bug instead of fixing it).
  //
  // Keeps the comparison index-friendly (the column itself is never
  // wrapped in a function, unlike eventConflict.js's
  // `(c.timestamp AT TIME ZONE ...)::date` point-lookup — this filter scans
  // ranges on checkins/export, where an index on `timestamp` matters).

  if (dateFrom) {
    paramCount++;
    whereClauses.push(`${alias}.timestamp >= ($${paramCount}::date::timestamp AT TIME ZONE 'Europe/Rome')`);
    params.push(dateFrom);
  }

  if (dateTo) {
    paramCount++;
    whereClauses.push(`${alias}.timestamp < (($${paramCount}::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Europe/Rome')`);
    params.push(dateTo);
  }

  return { whereClauses, params };
}

module.exports = { buildScopedFilters };
