#!/usr/bin/env node

/**
 * Configuration Validation Script
 * Validates that all required environment variables are set before app startup
 * Usage: NODE_ENV=development node scripts/validate-env.js
 */

// Load configuration first (loads .env.{NODE_ENV} and .env files)
require('../src/config-loader');

const path = require('path');
const fs = require('fs');

const NODE_ENV = process.env.NODE_ENV || 'development';

// Required variables by environment
const REQUIRED_VARS = {
  common: [
    'NODE_ENV',
    'PORT',
    'LOG_LEVEL',
    'APP_NAME',
    'DATABASE_URL',
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'JWT_PRIVATE_KEY',
    'JWT_PUBLIC_KEY',
    'CORS_ORIGIN',
    'DISABLE_AUTH',
    'SEED_TEST_DATA',
  ],
  production: [
    'SENTRY_DSN',
    'AWS_REGION',
    'AWS_S3_BUCKET',
  ],
  development: [],
  test: [],
};

// Combine common + environment-specific requirements
const requiredVars = [
  ...REQUIRED_VARS.common,
  ...(REQUIRED_VARS[NODE_ENV] || []),
];

console.log(`\n📋 Validating environment: ${NODE_ENV.toUpperCase()}`);
console.log('─'.repeat(60));

const missing = [];
const present = [];

for (const varName of requiredVars) {
  const value = process.env[varName];
  if (!value) {
    missing.push(varName);
    console.log(`  ❌ ${varName} — MISSING`);
  } else {
    // Show masked version for sensitive vars
    if (['DATABASE_URL', 'JWT_PRIVATE_KEY', 'JWT_PUBLIC_KEY', 'JWT_REFRESH_SECRET'].includes(varName)) {
      console.log(`  ✅ ${varName} — ***masked***`);
    } else {
      console.log(`  ✅ ${varName} — ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
    }
    present.push(varName);
  }
}

console.log('─'.repeat(60));
console.log(`\n📊 Summary:`);
console.log(`  Present: ${present.length}/${requiredVars.length}`);
console.log(`  Missing: ${missing.length}/${requiredVars.length}`);

if (missing.length > 0) {
  console.log(`\n🔴 VALIDATION FAILED — Missing required variables:`);
  missing.forEach(v => console.log(`    - ${v}`));
  console.log(`\n💡 Fix: Check .env.${NODE_ENV} and .env files for missing variables\n`);
  process.exit(1);
}

console.log(`\n✅ VALIDATION PASSED — All required variables are set\n`);
process.exit(0);
