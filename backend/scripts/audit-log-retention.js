#!/usr/bin/env node
/**
 * audit-log-retention.js
 * Delete audit_log records older than RETENTION_DAYS (default: 2555 = 7 years, GDPR).
 * Run monthly via cron or AWS EventBridge Scheduler.
 *
 * Usage:
 *   node scripts/audit-log-retention.js [--dry-run]
 *
 * Env vars required: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 */
'use strict';

require('dotenv').config();
const { Pool } = require('pg');

const RETENTION_DAYS = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '2555', 10); // 7 years
const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const cutoffISO = cutoff.toISOString();

    // Count before delete
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM audit_log WHERE timestamp < $1',
      [cutoffISO]
    );
    const count = parseInt(countResult.rows[0].count, 10);

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would delete ${count} audit_log records older than ${cutoffISO} (${RETENTION_DAYS} days)`);
    } else if (count === 0) {
      console.log(`No audit_log records older than ${RETENTION_DAYS} days. Nothing to delete.`);
    } else {
      const result = await pool.query(
        'DELETE FROM audit_log WHERE timestamp < $1',
        [cutoffISO]
      );
      console.log(`Deleted ${result.rowCount} audit_log records older than ${cutoffISO}`);
    }
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Retention script failed:', err.message);
  process.exit(1);
});
