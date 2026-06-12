// Jest setup: generate real RSA key pair for RS256 tests
// Keys are generated fresh each test run — never stored or committed
const { generateKeyPairSync } = require('crypto');
require('dotenv').config();

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

process.env.JWT_PRIVATE_KEY = privateKey;
process.env.JWT_PUBLIC_KEY = publicKey;
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-jest-only';
process.env.NODE_ENV = 'test';

// Demo account passwords for auth tests
process.env.DEMO_PIPPO_PASSWORD = 'pippo123';
process.env.DEMO_PINO_PASSWORD = 'pino01';
process.env.DEMO_DIEGO_PASSWORD = 'diego01';
process.env.DEMO_MARIA_PASSWORD = 'maria01';
process.env.DEMO_LUCIA_PASSWORD = 'lucia01';

// Bypass auth middleware in route tests (set per-file to override)
process.env.DISABLE_AUTH = 'true';
