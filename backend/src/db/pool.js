/**
 * PostgreSQL Connection Pool
 * Manages reusable connections to RDS database
 */

const { Pool } = require('pg');
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Build connection config from environment variables
const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000, // 30s query timeout
  application_name: 'badge-system-api',
};

// Log connection attempt (without password)
logger.info({
  message: 'Initializing database pool',
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
});

const pool = new Pool(dbConfig);

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
  try {
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
        message: 'Database query failed',
        error: err.message || err.toString(),
        code: err.code,
        details: err,
      });
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({
      message: 'Database connection pool failed',
      error: err.message || err.toString(),
      code: err.code,
      stack: err.stack,
      details: JSON.stringify(err, null, 2),
    });
    throw err;
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
