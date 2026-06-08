// Jest setup: generate real RSA key pair for RS256 tests
// Keys are generated fresh each test run — never stored or committed
const { generateKeyPairSync } = require('crypto');

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

process.env.JWT_PRIVATE_KEY = privateKey;
process.env.JWT_PUBLIC_KEY = publicKey;
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-jest-only';
process.env.NODE_ENV = 'test';
