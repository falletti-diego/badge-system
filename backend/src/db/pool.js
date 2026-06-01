/**
 * PostgreSQL Connection Pool
 * Manages reusable connections to RDS database
 */

const { Pool } = require('pg');
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Parse DATABASE_URL or use individual connection parameters
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000, // 30s query timeout
  application_name: 'badge-system-api',
});

// Event handlers for pool
pool.on('connect', () => {
  logger.debug('New client connected to database');
});

pool.on('error', (err) => {
  logger.error({
    message: 'Unexpected error on idle client',
    error: err.message,
    code: err.code,
  });
});

pool.on('remove', () => {
  logger.debug('Client removed from pool');
});

/**
 * Test database connection on startup
 */
async function testConnection() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW()');
    logger.info({
      message: 'Database connection successful',
      timestamp: result.rows[0].now,
    });
    return true;
  } catch (err) {
    logger.error({
      message: 'Database connection failed',
      error: err.message,
    });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Graceful shutdown of pool
 */
async function closePool() {
  await pool.end();
  logger.info('Database pool closed');
}

module.exports = {
  pool,
  testConnection,
  closePool,
};
