/**
 * Audit Log Helper
 * Records check-in modifications to audit_log table
 *
 * NOTE: audit_log.client_id is nullable (Task 5, finding #6) and populated
 * from the caller-supplied clientId when available, for future tenant-scoped
 * audit queries. user_id is UUID referencing employees.
 * logAudit is best-effort: errors are logged but do NOT abort the calling transaction.
 * user_id is only stored when it is a valid UUID (i.e. employee users); managers use NULL.
 */

const logger = require('../utils/logger');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function logAudit(client, {
  action,
  entity,
  entityId,
  clientId,
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
  // client_id is UUID — only store when caller passes a valid UUID (finding #6)
  const auditClientId = UUID_REGEX.test(clientId) ? clientId : null;

  // PoolClient objects (from pool.connect() / withTransaction) have a release() method;
  // the Pool object itself does not. SAVEPOINT is only valid inside a transaction block,
  // so we use it only when we have a real transaction client.
  const inTransaction = typeof client.release === 'function';

  if (inTransaction) {
    // SAVEPOINT ensures an audit failure cannot abort the calling business transaction.
    // Without SAVEPOINT, a failed INSERT would put the pg client in aborted state,
    // causing the outer COMMIT to silently become a ROLLBACK (data loss, no error).
    try {
      await client.query('SAVEPOINT audit_log_sp');
      await client.query(
        `INSERT INTO audit_log (action, entity, entity_id, old_value, new_value, user_id, client_id, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [action, entity, entityId, oldValue ? JSON.stringify(oldValue) : null, JSON.stringify(newValue), auditUserId, auditClientId]
      );
      await client.query('RELEASE SAVEPOINT audit_log_sp');
      logger.debug({ action: 'audit_log_created', auditAction: action, entityId, userId: auditUserId });
    } catch (err) {
      try { await client.query('ROLLBACK TO SAVEPOINT audit_log_sp'); } catch (_) { /* ignore */ }
      logger.error({ action: 'audit_log_error', error: err.message, entityId });
    }
  } else {
    // Outside a transaction (pool passed directly): simple best-effort INSERT.
    try {
      await client.query(
        `INSERT INTO audit_log (action, entity, entity_id, old_value, new_value, user_id, client_id, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [action, entity, entityId, oldValue ? JSON.stringify(oldValue) : null, JSON.stringify(newValue), auditUserId, auditClientId]
      );
      logger.debug({ action: 'audit_log_created', auditAction: action, entityId, userId: auditUserId });
    } catch (err) {
      logger.error({ action: 'audit_log_error', error: err.message, entityId });
    }
  }
}

module.exports = { logAudit };
