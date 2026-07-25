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

// Production doesn't ship a .env.production file in the image at all — entrypoint.sh
// fetches secrets from AWS SSM at container boot and writes them to /etc/badge/.env
// (as `export KEY=value` lines, which dotenv's parser strips the `export ` prefix
// from automatically), then sources that file into PID 1's own shell before exec-ing
// into the app. That means only the app's original boot process ever sees these as
// real OS env vars — any other process in the container (e.g. a one-off
// `docker exec ... npm run migrations`) starts with an empty process.env and must
// load this file itself. Neither of the two paths above exist in production, so this
// is additive there; in dev/CI, .env.development / .env already won, and dotenv never
// overrides an already-set process.env value, so this is a no-op when the file is
// absent (dev machines) or redundant (nothing left to fill in).
const ssmBootstrapPath = '/etc/badge/.env';
if (fs.existsSync(ssmBootstrapPath)) {
  const result = dotenv.config({ path: ssmBootstrapPath });
  if (result.error) {
    console.error(`[config-loader] Error loading ${ssmBootstrapPath}:`, result.error.message);
  } else {
    console.log(`[config-loader] ✅ Loaded ${ssmBootstrapPath} (${Object.keys(result.parsed).length} vars)`);
  }
}

module.exports = true; // Indicate success
