/**
 * Audit Log Helper
 * Records check-in modifications to audit_log table
 *
 * NOTE: audit_log schema has no client_id column and user_id is UUID referencing employees.
 * logAudit is best-effort: errors are logged but do NOT abort the calling transaction.
 * user_id is only stored when it is a valid UUID (i.e. employee users); managers use NULL.
 */

const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function logAudit(client, {
  action,
  entity,
  entityId,
  clientId, // kept in signature for call-site compatibility, not used in INSERT
  oldValue,
  newValue,
  userId = 'system',
}) {
  if (!action || !entity || !entityId || !newValue) {
    logger.warn({ action: 'audit_log_skip', reason: 'missing required params', entityId });
    return;
  }

  // user_id is UUID referencing employees — only store when caller passes a valid UUID
  const auditUserId = UUID_REGEX.test(userId) ? userId : null;

  try {
    await client.query(
      `INSERT INTO audit_log (action, entity, entity_id, old_value, new_value, user_id, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        action,
        entity,
        entityId,
        oldValue ? JSON.stringify(oldValue) : null,
        JSON.stringify(newValue),
        auditUserId,
      ]
    );

    logger.debug({ action: 'audit_log_created', auditAction: action, entityId, userId: auditUserId });
  } catch (err) {
    // Best-effort: audit failure must not abort the main business transaction
    logger.error({ action: 'audit_log_error', error: err.message, entityId });
  }
}

module.exports = { logAudit };
