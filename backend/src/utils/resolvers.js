const { pool } = require('../db/pool');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveEmployeeId(nameOrId, clientId) {
  if (!nameOrId) return undefined;
  if (UUID_REGEX.test(nameOrId)) return nameOrId;
  const result = await pool.query(
    'SELECT id FROM employees WHERE name = $1 AND client_id = $2::uuid LIMIT 1',
    [nameOrId, clientId]
  );
  return result.rows[0]?.id;
}

async function resolveSiteId(nameOrId, clientId) {
  if (!nameOrId) return undefined;
  if (UUID_REGEX.test(nameOrId)) return nameOrId;
  const result = await pool.query(
    'SELECT id FROM sites WHERE name = $1 AND client_id = $2::uuid LIMIT 1',
    [nameOrId, clientId]
  );
  return result.rows[0]?.id;
}

module.exports = { resolveEmployeeId, resolveSiteId };
