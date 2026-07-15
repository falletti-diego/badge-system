#!/usr/bin/env node
/**
 * cleanup-expired-demos.js
 *
 * Deletes self-service demo tenants (clients.is_demo = true) whose
 * demo_expires_at is more than 7 days in the past (a 7-day grace period
 * past the nominal expiry, matching the plan's Checkpoint 6). Deleting the
 * `clients` row cascades automatically to every child table keyed on
 * client_id (sites, employees, checkins, leave_requests, illnesses,
 * demo_contact_requests — all declared `client_id ... ON DELETE CASCADE`,
 * see backend/src/db/schema.sql and migrations 028-030), so a single
 * DELETE is sufficient.
 *
 * One exception, not a cascade path: `checkins.created_by` references
 * `employees(id) ON DELETE RESTRICT`, not CASCADE (see schema.sql line
 * ~83). This never actually blocks the delete in practice: every
 * `INSERT INTO checkins` in this codebase sets `created_by` to an
 * employee_id belonging to the SAME client (demoSeed.js does this too —
 * see the checkins loop, `created_by = $2` = the row's own employee_id),
 * so `checkins.employee_id`'s CASCADE removes the row before its
 * `created_by` RESTRICT constraint could ever be evaluated against a
 * still-existing employee row. Flagging this explicitly because a naive
 * reading of "every child table cascades" would be wrong if that
 * same-client invariant on created_by were ever violated.
 *
 * Run once a day via EventBridge Scheduler / SSM Run Command on the
 * existing EC2 instance (infra setup out of scope for this script).
 *
 * Usage:
 *   node scripts/cleanup-expired-demos.js [--dry-run]
 *
 * Env vars required: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 */
'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const { logAudit } = require('../src/middleware/audit');

const GRACE_PERIOD_DAYS = 7;

/**
 * Deletes expired demo tenants (is_demo=true AND demo_expires_at older than
 * the 7-day grace period) and audit-logs each deletion.
 *
 * Idempotent by construction: if no rows match, DELETE...RETURNING simply
 * returns zero rows and this resolves cleanly with no error — running it
 * twice in a row with nothing new to delete is a clean no-op both times
 * (test matrix row 9).
 *
 * @param {import('pg').Pool|import('pg').PoolClient} pool
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<{ deletedCount: number, deletedClientIds: string[] }>}
 */
async function cleanupExpiredDemos(pool, options = {}) {
  const { dryRun = false } = options;

  if (dryRun) {
    const countResult = await pool.query(
      `SELECT id FROM clients WHERE is_demo = true AND demo_expires_at < now() - $1::interval`,
      [`${GRACE_PERIOD_DAYS} days`]
    );
    return { deletedCount: countResult.rows.length, deletedClientIds: countResult.rows.map((r) => r.id) };
  }

  // Log AFTER a successful DELETE, using RETURNING rows -- only log what
  // actually got deleted, never log a deletion that didn't happen (e.g. if
  // the DELETE affects 0 rows). audit_log has no FK to clients (see
  // schema.sql), so this ordering (delete first, then audit-log
  // referencing the now-gone client id) is safe either way -- the audit
  // row is never cascade-deleted.
  const deleteResult = await pool.query(
    `DELETE FROM clients
     WHERE is_demo = true AND demo_expires_at < now() - $1::interval
     RETURNING id, demo_contact_email`,
    [`${GRACE_PERIOD_DAYS} days`]
  );

  const deletedClientIds = [];
  for (const row of deleteResult.rows) {
    deletedClientIds.push(row.id);
    await logAudit(pool, {
      action: 'demo_tenant_cleanup',
      entity: 'client',
      entityId: row.id,
      newValue: { client_id: row.id, demo_contact_email: row.demo_contact_email || null },
      userId: 'system',
    });
  }

  return { deletedCount: deleteResult.rowCount, deletedClientIds };
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    const { deletedCount, deletedClientIds } = await cleanupExpiredDemos(pool, { dryRun });

    if (deletedCount === 0) {
      console.log('0 expired demo tenants found. Nothing to delete.');
    } else if (dryRun) {
      console.log(`[DRY RUN] Would delete ${deletedCount} expired demo tenant(s): ${deletedClientIds.join(', ')}`);
    } else {
      console.log(`Deleted ${deletedCount} expired demo tenant(s): ${deletedClientIds.join(', ')}`);
    }
  } finally {
    await pool.end();
  }
}

module.exports = { cleanupExpiredDemos };

if (require.main === module) {
  run().catch((err) => {
    console.error('cleanup-expired-demos failed:', err.message);
    process.exit(1);
  });
}
