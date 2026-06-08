#!/usr/bin/env node
/**
 * GDPR Data Retention Cleanup
 *
 * Deletes records past their legal retention period:
 *   - checkins: 12 months (configurable via RETENTION_MONTHS env)
 *   - audit_log: 7 years (Italian legal requirement for business records)
 *
 * Usage:
 *   node /app/scripts/audit-log-retention.js           # live run
 *   node /app/scripts/audit-log-retention.js --dry-run # preview only
 *
 * Runs daily at 02:00 UTC via AWS EventBridge Scheduler → SSM Run Command:
 *   docker exec badge-system-api node /app/scripts/audit-log-retention.js
 */

'use strict';

const { Pool } = require('pg');
const pino = require('pino');

const DRY_RUN = process.argv.includes('--dry-run');
const RETENTION_MONTHS = parseInt(process.env.RETENTION_MONTHS || '12', 10);
const AUDIT_RETENTION_YEARS = 7;

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { script: 'audit-log-retention', dry_run: DRY_RUN },
});

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 2,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

async function countRecords(client, table, cutoffInterval) {
  const result = await client.query(
    `SELECT COUNT(*) AS count FROM ${table} WHERE timestamp < NOW() - INTERVAL '${cutoffInterval}'`
  );
  return parseInt(result.rows[0].count, 10);
}

async function countAuditRecords(client, cutoffInterval) {
  const result = await client.query(
    `SELECT COUNT(*) AS count FROM audit_log WHERE timestamp < NOW() - INTERVAL '${cutoffInterval}'`
  );
  return parseInt(result.rows[0].count, 10);
}

async function run() {
  const client = await pool.connect();
  const summary = { checkins_deleted: 0, audit_log_deleted: 0, errors: [] };

  try {
    logger.info({ msg: 'Starting retention cleanup', dry_run: DRY_RUN });

    const checkinsInterval = `${RETENTION_MONTHS} months`;
    const auditInterval = `${AUDIT_RETENTION_YEARS} years`;

    // --- checkins ---
    const checkinsCount = await countRecords(client, 'checkins', checkinsInterval);
    logger.info({
      msg: 'checkins eligible for deletion',
      count: checkinsCount,
      older_than: checkinsInterval,
    });

    if (!DRY_RUN && checkinsCount > 0) {
      const result = await client.query(
        `DELETE FROM checkins WHERE timestamp < NOW() - INTERVAL '${checkinsInterval}'`
      );
      summary.checkins_deleted = result.rowCount;
      logger.info({ msg: 'checkins deleted', count: result.rowCount });
    }

    // --- audit_log ---
    const auditCount = await countAuditRecords(client, auditInterval);
    logger.info({
      msg: 'audit_log eligible for deletion',
      count: auditCount,
      older_than: auditInterval,
    });

    if (!DRY_RUN && auditCount > 0) {
      const result = await client.query(
        `DELETE FROM audit_log WHERE timestamp < NOW() - INTERVAL '${auditInterval}'`
      );
      summary.audit_log_deleted = result.rowCount;
      logger.info({ msg: 'audit_log deleted', count: result.rowCount });
    }

    logger.info({ msg: 'Retention cleanup complete', summary, dry_run: DRY_RUN });
  } catch (err) {
    logger.error({ msg: 'Retention cleanup failed', error: err.message });
    summary.errors.push(err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }

  return summary;
}

run().catch((err) => {
  logger.error({ msg: 'Fatal error', error: err.message });
  process.exit(1);
});
