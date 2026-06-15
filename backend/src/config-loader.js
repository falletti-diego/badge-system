/**
 * Configuration Loader
 * Load environment variables from .env.{NODE_ENV} and .env files
 * Call this BEFORE any module reads process.env
 *
 * Usage:
 *  require('./src/config-loader');  // Call first!
 *  // Now process.env is populated
 */

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Ensure NODE_ENV is set (default to development)
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

const NODE_ENV = process.env.NODE_ENV;
const envFilePath = path.join(__dirname, '..', `.env.${NODE_ENV}`);
const envLocalPath = path.join(__dirname, '..', '.env');

console.log(`[config-loader] Environment: ${NODE_ENV}`);

// Load environment-specific defaults first
if (fs.existsSync(envFilePath)) {
  const result = dotenv.config({ path: envFilePath });
  if (result.error) {
    console.error(`[config-loader] Error loading ${envFilePath}:`, result.error.message);
  } else {
    console.log(`[config-loader] ✅ Loaded ${envFilePath} (${Object.keys(result.parsed).length} vars)`);
  }
} else {
  console.warn(`[config-loader] ⚠️  File not found: ${envFilePath}`);
}

// Then override with .env (for personal/CI-specific settings)
if (fs.existsSync(envLocalPath)) {
  const result = dotenv.config({ path: envLocalPath });
  if (result.error) {
    console.warn('[config-loader] Note: .env not found or error reading it');
  } else if (Object.keys(result.parsed).length > 0) {
    console.log(`[config-loader] ✅ Loaded .env (${Object.keys(result.parsed).length} overrides)`);
  }
}

module.exports = true; // Indicate success
