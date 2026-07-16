'use strict';

/**
 * GET /api/admin/demo-tenants (Task 9 of 9 — Ambiente Demo Self-Service)
 *
 * Read-only operational visibility for Dataxiom staff: lists active/expiring
 * demo tenants so they don't need SSH + psql to check demo status. No
 * "extend"/"cancel now" action here — plan explicitly defers that to a
 * future evolution.
 *
 * RBAC: restricted to role === 'superadmin' only (admin-rbac-tenant-scoping
 * plan, Task 7) — no real customer, whether or not they hold role='admin'
 * on their own tenant, has any legitimate reason to see the list of demo
 * prospects. This replaces the original is_demo-based inline self-check
 * (Task 9 of Ambiente Demo Self-Service), which only closed the narrower
 * case of a demo tenant's own seeded admin — requireSuperadmin subsumes
 * that case entirely (a demo tenant's admin has role='admin', never
 * 'superadmin') while also closing the broader gap for any real tenant's
 * admin.
 */

const express = require('express');
const { pool } = require('../../db/pool');
const { requireSuperadmin } = require('../../middleware/requireSuperadmin');

const router = express.Router();

router.get('/', requireSuperadmin, async (req, res, next) => {
  try {
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
