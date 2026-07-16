'use strict';

/**
 * Middleware: requireSuperadmin
 *
 * Fail-closed guard for the /api/admin/* sub-routes that must remain
 * exclusive to Dataxiom staff: cross-tenant onboarding (create/list/delete
 * any client, create sites/employees for an arbitrary client_id) and
 * viewing the demo-tenants list. Must run after requireAuth AND after
 * routes/admin.js's shared blanket gate (which accepts both 'admin' and
 * 'superadmin' so both roles enter the /api/admin namespace) — this
 * middleware narrows further to 'superadmin' only, mounted explicitly on
 * the specific routes that need it.
 *
 * See docs/superpowers/specs/2026-07-16-admin-rbac-tenant-scoping-design.md.
 */

const { ForbiddenError } = require('../utils/errors');

function requireSuperadmin(req, res, next) {
  if (req.user.role !== 'superadmin') {
    return next(new ForbiddenError('This operation requires Dataxiom staff access', 'SUPERADMIN_REQUIRED'));
  }
  next();
}

module.exports = { requireSuperadmin };
