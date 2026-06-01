#!/usr/bin/env node

/**
 * Migration Runner
 * Executes SQL migration files against the database
 * Usage: node scripts/run-migration.js migrations/003_add_audit_log_and_indices.sql
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db/pool');
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

async function runMigration() {
  const migrationFile = process.argv[2];

  if (!migrationFile) {
    logger.error('Migration file not provided');
    logger.info('Usage: node scripts/run-migration.js <migration_file.sql>');
    process.exit(1);
  }

  const filePath = path.resolve(__dirname, `../${migrationFile}`);

  if (!fs.existsSync(filePath)) {
    logger.error({ file: filePath }, 'Migration file not found');
    process.exit(1);
  }

  try {
    const sql = fs.readFileSync(filePath, 'utf8');

    logger.info({ file: filePath }, 'Starting migration...');

    // Execute migration (single transaction)
    const result = await pool.query(sql);

    logger.info({ file: filePath, result }, 'Migration completed successfully');

    // Verify audit_log table exists
    const verifyResult = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'audit_log'"
    );

    if (verifyResult.rows.length > 0) {
      logger.info('✅ audit_log table verified');
    }

    // Verify checkins has new columns
    const columnsResult = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'checkins' AND column_name IN ('modified_at', 'modified_by')"
    );

    if (columnsResult.rows.length === 2) {
      logger.info('✅ checkins columns (modified_at, modified_by) verified');
    }

    process.exit(0);
  } catch (err) {
    logger.error({
      error: err.message,
      code: err.code,
      detail: err.detail,
      file: filePath,
    }, 'Migration failed');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
