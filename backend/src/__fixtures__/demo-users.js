/**
 * SINGLE SOURCE OF TRUTH for Demo Accounts
 *
 * This file defines all demo/test user accounts used by:
 * - routes/auth.js (login with hardcoded credentials)
 * - middleware/auth.js (DISABLE_AUTH fallback)
 * - tests (__tests__/auth.*.js)
 *
 * CRITICAL: All UUIDs must be valid format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
 * and match the database schema (type uuid for client_id, site_id, employee_id).
 *
 * This prevents the "client-1" UUID error where hardcoded strings fail PostgreSQL queries.
 */

const DEMO_USERS = [
  {
    // Admin user — full system access
    email: 'pippo@badge.local',
    password: process.env.DEMO_PIPPO_PASSWORD,
    id: '550e8400-e29b-41d4-a716-446655440010', // ✅ VALID UUID (admin)
    name: 'Pippo',
    role: 'admin',
    client_id: '550e8400-e29b-41d4-a716-446655440001', // ✅ VALID UUID
  },
  {
    // Manager user — store-specific access
    email: 'pino@badge.local',
    password: process.env.DEMO_PINO_PASSWORD,
    id: '550e8400-e29b-41d4-a716-446655440011', // ✅ VALID UUID (pino)
    name: 'Pino',
    role: 'manager',
    client_id: '550e8400-e29b-41d4-a716-446655440001', // ✅ VALID UUID (same client)
    site_id: '550e8400-e29b-41d4-a716-446655440011', // Milano Store ✅ VALID UUID (matches database)
  },
  {
    // Employee user — minimal access
    email: 'maria@badge.local',
    password: process.env.DEMO_MARIA_PASSWORD,
    id: '239ec99f-3204-45ca-bce2-793f52442ec6', // ✅ VALID UUID (real planning employee record)
    name: 'Maria',
    role: 'employee',
    client_id: '550e8400-e29b-41d4-a716-446655440001', // ✅ VALID UUID (same client)
    employee_id: '239ec99f-3204-45ca-bce2-793f52442ec6', // Maria Rossi ✅ matches planning employee id
  },
  // Note: Lucia removed — no corresponding employee record in database
];

/**
 * Get default admin user for DISABLE_AUTH fallback
 * @returns {object} Admin user with valid UUIDs
 */
function getDefaultAdminUser() {
  const admin = DEMO_USERS.find(u => u.role === 'admin');
  if (!admin) {
    throw new Error('FATAL: No admin user found in DEMO_USERS');
  }
  return admin;
}

/**
 * Validate that all DEMO_USERS have valid UUID format for database fields
 * @returns {boolean} true if all UUIDs valid, throws otherwise
 * @throws {Error} if any UUID is invalid
 */
function validateDemoUserUUIDs() {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uuidFields = ['client_id', 'site_id', 'employee_id'];

  DEMO_USERS.forEach(user => {
    uuidFields.forEach(field => {
      const value = user[field];
      if (value && !uuidRegex.test(value)) {
        throw new Error(
          `FATAL: ${user.email} has invalid ${field}: "${value}" (not a valid UUID format)`
        );
      }
    });
  });

  return true;
}

module.exports = {
  DEMO_USERS,
  getDefaultAdminUser,
  validateDemoUserUUIDs,
};
