/**
 * Unit Tests: resolveTenantScope helper
 */

const { resolveTenantScope } = require('../utils/tenantScope');
const { ValidationError } = require('../utils/errors');

const ADMIN_CLIENT_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-2222-2222-222222222222';

describe('resolveTenantScope', () => {
  test('admin: ignores requested client_id, always uses own client_id', () => {
    const user = { role: 'admin', client_id: ADMIN_CLIENT_ID };
    expect(resolveTenantScope(user, OTHER_CLIENT_ID)).toBe(ADMIN_CLIENT_ID);
  });

  test('admin: no requested client_id → own client_id', () => {
    const user = { role: 'admin', client_id: ADMIN_CLIENT_ID };
    expect(resolveTenantScope(user, undefined)).toBe(ADMIN_CLIENT_ID);
  });

  test('superadmin: uses requested client_id', () => {
    const user = { role: 'superadmin', client_id: ADMIN_CLIENT_ID };
    expect(resolveTenantScope(user, OTHER_CLIENT_ID)).toBe(OTHER_CLIENT_ID);
  });

  test('superadmin: no requested client_id → throws ValidationError with CLIENT_ID_REQUIRED', () => {
    const user = { role: 'superadmin', client_id: ADMIN_CLIENT_ID };
    expect(() => resolveTenantScope(user, undefined)).toThrow(ValidationError);
    try {
      resolveTenantScope(user, undefined);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.statusCode).toBe(400);
      expect(err.details).toEqual({ field: 'client_id', code: 'CLIENT_ID_REQUIRED' });
    }
  });
});
