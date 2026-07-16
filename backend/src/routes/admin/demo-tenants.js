'use strict';

/**
 * GET /api/admin/demo-tenants (Task 9 of 9 — Ambiente Demo Self-Service)
 *
 * Read-only operational visibility for Dataxiom staff: lists active/expiring
 * demo tenants so they don't need SSH + psql to check demo status. No
 * "extend"/"cancel now" action here — plan explicitly defers that to a
 * future evolution.
 *
 * RBAC: this router is mounted behind routes/admin.js's blanket
 * `role === 'admin'` gate, but that gate alone is not enough here. A demo
 * tenant's seeded "admin" role employee (see utils/demoSeed.js, and
 * POST /demo/switch-role) also has role === 'admin' and would otherwise
 * pass straight through and see every other demo tenant's contact email
 * and expiry — a cross-tenant data leak. This route adds its own extra
 * check, rejecting any caller whose own client_id resolves to is_demo=true,
 * so only a REAL tenant's admin can see this list. Deliberately not reusing
 * middleware/requireDemoTenant.js (inverse polarity — that one REQUIRES
 * is_demo=true) and deliberately not touching the shared blanket gate in
 * routes/admin.js (other admin sub-routes rely on it as-is).
 */

const express = require('express');
const { pool } = require('../../db/pool');
const { ForbiddenError } = require('../../utils/errors');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { client_id } = req.user;

    const callerClient = await pool.query('SELECT is_demo FROM clients WHERE id = $1', [client_id]);
    if (callerClient.rows.length === 0 || callerClient.rows[0].is_demo === true) {
      return next(new ForbiddenError('This endpoint is only available to a real tenant admin', 'ADMIN_REQUIRED'));
    }

    const result = await pool.query(
      `SELECT id, demo_contact_email, created_at, demo_expires_at
       FROM clients
       WHERE is_demo = true
       ORDER BY demo_expires_at ASC`
    );

    res.json({ success: true, data: result.rows, returned: result.rows.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
