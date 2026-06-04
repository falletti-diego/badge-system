#!/usr/bin/env node
/**
 * Apply Database Schema to RDS
 * Usage: node scripts/apply-schema.js [--verify-only]
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const pino = require('pino');

const logger = pino({ level: 'info' });

// Read environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'badge-system-db.cvs80y0my080.eu-west-1.rds.amazonaws.com',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Badge2026Simple',
  database: process.env.DB_NAME || 'badge_system',
  ssl: { rejectUnauthorized: false },
  statement_timeout: 60000,
};

const verifyOnly = process.argv.includes('--verify-only');

async function applySchema() {
  const pool = new Pool(dbConfig);

  try {
    logger.info('Connecting to RDS PostgreSQL...');
    const client = await pool.connect();
    logger.info('✓ Connected to RDS');

    // Read migration file (pure SQL, no psql commands)
    const migrationPath = path.join(__dirname, '../migrations/001_create_shifts_table.sql');
    const migration = fs.readFileSync(migrationPath, 'utf8');

    if (verifyOnly) {
      logger.info('Running in VERIFY-ONLY mode (no changes)');
      // Just test connection
      const result = await client.query('SELECT version()');
      logger.info(`✓ PostgreSQL version: ${result.rows[0].version.split(',')[0]}`);

      // Check if shifts table exists
      const shiftsCheck = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'shifts' AND table_schema = 'public'
        ) as exists;
      `);

      if (shiftsCheck.rows[0].exists) {
        logger.info('✓ Shifts table already exists');
      } else {
        logger.info('⚠ Shifts table does NOT exist (migration needed)');
      }

      client.release();
      return;
    }

    logger.info('Executing migration (adding shifts table)...');

    // Execute migration (pure SQL, safe to run)
    await client.query(migration);
    logger.info('✓ Migration applied successfully');

    // Verify tables were created
    const tablesResult = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    logger.info('✓ Tables created:');
    tablesResult.rows.forEach(row => {
      logger.info(`  - ${row.table_name}`);
    });

    // Verify shifts table structure
    const shiftsResult = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'shifts'
      ORDER BY ordinal_position;
    `);

    if (shiftsResult.rowCount > 0) {
      logger.info('✓ Shifts table columns:');
      shiftsResult.rows.forEach(row => {
        logger.info(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
      });
    } else {
      logger.error('✗ Shifts table not found!');
    }

    // Count records
    const clientsCount = await client.query('SELECT COUNT(*) FROM clients');
    const sitesCount = await client.query('SELECT COUNT(*) FROM sites');
    const employeesCount = await client.query('SELECT COUNT(*) FROM employees');
    const checkinsCount = await client.query('SELECT COUNT(*) FROM checkins');
    const shiftsCount = await client.query('SELECT COUNT(*) FROM shifts');

    logger.info('✓ Test data loaded:');
    logger.info(`  - Clients: ${clientsCount.rows[0].count}`);
    logger.info(`  - Sites: ${sitesCount.rows[0].count}`);
    logger.info(`  - Employees: ${employeesCount.rows[0].count}`);
    logger.info(`  - Check-ins: ${checkinsCount.rows[0].count}`);
    logger.info(`  - Shifts: ${shiftsCount.rows[0].count}`);

    client.release();
    logger.info('✅ Schema application complete!');

  } catch (err) {
    logger.error('❌ Schema application failed:');
    logger.error(`Error: ${err.message}`);
    if (err.detail) logger.error(`Detail: ${err.detail}`);
    if (err.hint) logger.error(`Hint: ${err.hint}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applySchema();
