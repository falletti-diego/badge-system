/**
 * Audit Log Helper
 * Records check-in modifications to audit_log table
 */

const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Log an audit trail entry for a check-in action
 *
 * @param {PoolClient} client - Database client (for transaction)
 * @param {Object} params
 * @param {string} params.action - 'checkin_created' | 'checkin_corrected'
 * @param {string} params.entity - Entity type ('checkin', 'employee', etc.)
 * @param {string} params.entityId - Check-in UUID
 * @param {string} params.clientId - Client UUID (for multi-tenant isolation)
 * @param {Object} params.oldValue - Previous value (null for created)
 * @param {Object} params.newValue - New/current value
 * @param {string} [params.userId='system'] - User who made the change
 */
async function logAudit(client, {
  action,
  entity,
  entityId,
  clientId,
  oldValue,
  newValue,
  userId = 'system',
}) {
  if (!action || !entity || !entityId || !clientId || !newValue) {
    throw new Error('Missing required audit parameters');
  }

  try {
    const query = `
      INSERT INTO audit_log (
        action,
        entity,
        entity_id,
        client_id,
        old_value,
        new_value,
        user_id,
        timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `;

    await client.query(query, [
      action,
      entity,
      entityId,
      clientId,
      oldValue ? JSON.stringify(oldValue) : null,
      JSON.stringify(newValue),
      userId,
    ]);

    logger.debug({
      action: 'audit_log_created',
      auditAction: action,
      entityId,
      userId,
    });
  } catch (err) {
    logger.error({
      action: 'audit_log_error',
      error: err.message,
      entityId,
    });
    throw err;
  }
}

module.exports = {
  logAudit,
};
