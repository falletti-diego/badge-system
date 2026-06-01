/**
 * Database Transaction Wrapper
 * Ensures ACID compliance for complex operations (e.g., update + audit)
 */

const pino = require('pino');
const { pool } = require('../db/pool');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Execute a callback within a database transaction
 * Automatically handles BEGIN/COMMIT/ROLLBACK
 *
 * @param {Function} callback - Async function that receives database client
 * @returns {Promise<*>} - Result from callback
 * @throws {Error} - If transaction fails, error is thrown after ROLLBACK
 */
async function withTransaction(callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({
      action: 'transaction_error',
      error: err.message,
      code: err.code,
    });
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  withTransaction,
};
