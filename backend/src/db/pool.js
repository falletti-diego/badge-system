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
  min: parseInt(process.env.DB_POOL_MIN || '1', 10),
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 60000, // Increased for RDS cold starts
  statement_timeout: 30000,
  application_name: 'badge-system-api',
  // DB_SSL_REJECT_UNAUTHORIZED defaults to true in production.
  // Set to 'false' ONLY as a temporary escape hatch if your RDS CA cert isn't
  // in the system trust store — and only after confirming the network path is
  // private (VPC-only). Never set false on a public endpoint.
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : false,
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
 * Test database connection with retry logic (exponential backoff)
 * Helps with AWS RDS cold starts which can take 10-20s
 */
async function testConnection(maxRetries = 5, initialDelayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info({
        message: 'Testing database connection',
        attempt,
        maxRetries,
      });

      const client = await pool.connect();
      try {
        const result = await client.query('SELECT NOW()');
        logger.info({
          message: 'Database connection successful',
          timestamp: result.rows[0].now,
          attempt,
        });
        return true;
      } catch (err) {
        logger.error({
          message: 'Database query failed',
          error: err.message || err.toString(),
          code: err.code,
          attempt,
        });
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      const isLastAttempt = attempt === maxRetries;
      const delayMs = initialDelayMs * Math.pow(2, attempt - 1); // exponential backoff

      if (isLastAttempt) {
        logger.error({
          message: 'Database connection failed after all retries',
          error: err.message || err.toString(),
          code: err.code,
          attempt,
          maxRetries,
          stack: err.stack,
        });
        throw err;
      }

      logger.warn({
        message: 'Database connection failed, will retry',
        error: err.message,
        code: err.code,
        attempt,
        nextRetryInMs: delayMs,
      });

      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
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
