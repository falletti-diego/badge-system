'use strict';

/**
 * Migration Runner
 * Reads SQL migration files from ../migrations/, checks schema_migrations table
 * for which have been applied, and runs unapplied ones in transaction.
 *
 * Exit codes:
 * 0 = success (all migrations applied or up-to-date)
 * 1 = error (migration failed)
 * 2 = cannot connect to database
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'badge_system',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

const logger = console; // In production, use Pino

async function ensureSchemaTable() {
  /**
   * Bootstrap: create schema_migrations table if it doesn't exist.
   * This is idempotent — IF NOT EXISTS prevents errors on subsequent runs.
   */
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      execution_time_ms INT,
      checksum VARCHAR(64)
    );
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_filename
      ON schema_migrations(filename);
  `;

  try {
    await pool.query(createTableSQL);
    logger.info('[migrations] schema_migrations table ready');
  } catch (err) {
    logger.error('[migrations] Failed to create schema_migrations table', {
      error: err.message,
      code: err.code,
    });
    process.exit(2);
  }
}

async function getAppliedMigrations() {
  /**
   * Query schema_migrations to get list of already-applied migrations.
   */
  try {
    const result = await pool.query(
      'SELECT filename FROM schema_migrations ORDER BY applied_at ASC'
    );
    return new Set(result.rows.map(r => r.filename));
  } catch (err) {
    logger.error('[migrations] Failed to query schema_migrations', {
      error: err.message,
      code: err.code,
    });
    process.exit(2);
  }
}

async function getMigrationFiles() {
  /**
   * Read all .sql files from migrations directory.
   * Sort alphabetically/numerically so 001_*, 002_*, ... 013_* are in order.
   */
  const migrationsDir = path.join(__dirname, '..', 'migrations');

  try {
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
    return files;
  } catch (err) {
    logger.error('[migrations] Failed to read migrations directory', {
      error: err.message,
      dir: migrationsDir,
    });
    process.exit(1);
  }
}

async function applyMigration(filename) {
  /**
   * Apply single migration in transaction.
   * On error, transaction rolls back and migration is NOT recorded.
   */
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const filepath = path.join(migrationsDir, filename);

  let migrationSQL;
  try {
    migrationSQL = fs.readFileSync(filepath, 'utf8');
  } catch (err) {
    logger.error('[migrations] Failed to read migration file', {
      error: err.message,
      filename,
      filepath,
    });
    return false;
  }

  const client = await pool.connect();
  const startTime = Date.now();

  try {
    // Begin transaction
    await client.query('BEGIN');
    logger.info(`[migrations] Applying migration: ${filename}`);

    // Execute migration SQL
    await client.query(migrationSQL);

    // Record in schema_migrations
    await client.query(
      'INSERT INTO schema_migrations (filename, execution_time_ms) VALUES ($1, $2)',
      [filename, Date.now() - startTime]
    );

    // Commit transaction
    await client.query('COMMIT');
    logger.info(`[migrations] ✓ Migration applied: ${filename} (${Date.now() - startTime}ms)`);
    return true;
  } catch (err) {
    // Rollback on error
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error('[migrations] Rollback failed', { error: rollbackErr.message });
    }

    logger.error('[migrations] ✗ Migration failed', {
      filename,
      error: err.message,
      detail: err.detail || 'No details',
    });
    return false;
  } finally {
    client.release();
  }
}

async function runMigrations() {
  /**
   * Main runner: get applied, get all, apply missing.
   */
  try {
    // Step 1: Ensure schema_migrations table exists
    await ensureSchemaTable();

    // Step 2: Get list of already-applied migrations
    const applied = await getAppliedMigrations();
    logger.info(`[migrations] Already applied: ${applied.size} migration(s)`);

    // Step 3: Get all migration files
    const allFiles = await getMigrationFiles();
    logger.info(`[migrations] Found ${allFiles.length} total migration file(s)`);

    // Step 4: Apply unapplied migrations
    const unapplied = allFiles.filter(f => !applied.has(f));
    if (unapplied.length === 0) {
      logger.info('[migrations] No unapplied migrations. Database is up-to-date.');
      return true;
    }

    logger.info(`[migrations] Applying ${unapplied.length} unapplied migration(s)...`);
    let allSuccess = true;
    for (const filename of unapplied) {
      const success = await applyMigration(filename);
      if (!success) {
        allSuccess = false;
        break; // Stop on first failure
      }
    }

    return allSuccess;
  } catch (err) {
    logger.error('[migrations] Unexpected error', { error: err.message });
    return false;
  } finally {
    await pool.end();
  }
}

// Run migrations and exit with appropriate code
(async () => {
  const success = await runMigrations();
  process.exit(success ? 0 : 1);
})();
