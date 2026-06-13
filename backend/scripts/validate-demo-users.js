#!/usr/bin/env node

/**
 * Validate Demo User Fixtures
 *
 * Ensures all DEMO_USERS have valid UUIDs that match the database schema.
 * This prevents errors like "invalid input syntax for type uuid: client-1"
 * which occur when hardcoded strings are used in UUID columns.
 *
 * Run on every startup (npm run dev, npm run test, npm start).
 * Exits with code 1 if validation fails.
 *
 * Usage:
 *   npm run validate-demo-users
 */

const { DEMO_USERS, validateDemoUserUUIDs } = require('../src/__fixtures__/demo-users');

console.log('\n📋 Validating DEMO_USERS fixtures...');
console.log('─'.repeat(60));

try {
  validateDemoUserUUIDs();

  console.log(`\n✅ All DEMO_USERS have valid UUIDs:\n`);
  DEMO_USERS.forEach(user => {
    const fields = [];
    if (user.id) fields.push(`id: ${user.id}`);
    if (user.client_id) fields.push(`client: ${user.client_id}`);
    if (user.site_id) fields.push(`site: ${user.site_id}`);
    if (user.employee_id) fields.push(`emp: ${user.employee_id}`);

    console.log(`  ${user.email.padEnd(25)} (${user.role.padEnd(10)}) ${fields.join(' | ')}`);
  });

  console.log('\n✅ VALIDATION PASSED\n');
  process.exit(0);
} catch (err) {
  console.error(`\n🔴 VALIDATION FAILED\n`);
  console.error(`  Error: ${err.message}\n`);
  console.error('💡 Fix: Ensure all client_id, site_id, employee_id are valid UUIDs');
  console.error('   Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\n');
  process.exit(1);
}
