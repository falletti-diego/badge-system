'use strict';

const { ValidationError } = require('./errors');

/**
 * Risolve il tenant su cui opera una route admin.
 * - admin: SEMPRE il proprio client_id (qualunque client_id nel body/query è ignorato)
 * - superadmin: il client_id passato nel body/query — obbligatorio, perché un
 *   superadmin non ha un tenant proprio significativo. Se assente → ValidationError
 *   (fail-closed: mai un insert con client_id undefined).
 *
 * @param {object} user - req.user (deve avere role e client_id)
 * @param {string|undefined} requestedClientId - client_id dal body/query
 * @returns {string} il client_id target
 * @throws {ValidationError} superadmin senza client_id esplicito (details.code === 'CLIENT_ID_REQUIRED')
 */
function resolveTenantScope(user, requestedClientId) {
  if (user.role !== 'superadmin') return user.client_id;
  if (!requestedClientId) {
    throw new ValidationError('client_id is required for superadmin operations', {
      field: 'client_id',
      code: 'CLIENT_ID_REQUIRED',
    });
  }
  return requestedClientId;
}

module.exports = { resolveTenantScope };
