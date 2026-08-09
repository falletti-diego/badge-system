#!/usr/bin/env node
/**
 * checkin-gps-retention.js
 * Nullifica checkin_latitude/checkin_longitude per check-in più vecchi di
 * RETENTION_DAYS (default: 90 giorni) — GDPR Art. 5(1)(e), promessa esplicita
 * di GPSConsentDialog (mobile). A differenza di audit-log-retention.js, la
 * RIGA di check-in resta (serve per lo storico presenze/ore) — solo le
 * coordinate vengono nullificate.
 *
 * Usage:
 *   node scripts/checkin-gps-retention.js [--dry-run]
 *
 * Env vars required: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 */
'use strict';

require('dotenv').config();
const { Pool } = require('pg');

const RETENTION_DAYS = parseInt(process.env.CHECKIN_GPS_RETENTION_DAYS || '90', 10);
const DRY_RUN = process.argv.includes('--dry-run');

async function runRetention({ pool, retentionDays, dryRun }) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffISO = cutoff.toISOString();

  const countResult = await pool.query(
    'SELECT COUNT(*) FROM checkins WHERE timestamp < $1 AND checkin_latitude IS NOT NULL',
    [cutoffISO]
  );
  const count = parseInt(countResult.rows[0].count, 10);

  if (dryRun) {
    console.log(`[DRY RUN] Would nullify GPS coordinates on ${count} checkins older than ${cutoffISO} (${retentionDays} days)`);
    return { wouldUpdate: count };
  }

  if (count === 0) {
    console.log(`No checkins with GPS coordinates older than ${retentionDays} days. Nothing to update.`);
    return { updated: 0 };
  }

  const result = await pool.query(
    `UPDATE checkins SET checkin_latitude = NULL, checkin_longitude = NULL
     WHERE timestamp < $1 AND checkin_latitude IS NOT NULL`,
    [cutoffISO]
  );
  console.log(`Nullified GPS coordinates on ${result.rowCount} checkins older than ${cutoffISO}`);
  return { updated: result.rowCount };
}

async function run() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : false,
  });

  try {
    await runRetention({ pool, retentionDays: RETENTION_DAYS, dryRun: DRY_RUN });
  } finally {
    await pool.end();
  }
}

module.exports = { runRetention };

if (require.main === module) {
  run().catch((err) => {
    console.error('Retention script failed:', err.message);
    process.exit(1);
  });
}
