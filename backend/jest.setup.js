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

// S.32.7 added checkRevoked as an app-level middleware that issues a
// `revoked_tokens` SELECT before every authenticated route. Route tests written
// before S.32.7 mock pool.query as an ordered sequence and don't account for
// that leading query, so every sequence shifts by one and the route reads
// `undefined.rows` → 500. Globally neutralize checkRevoked to a pass-through so
// those route tests exercise only their own queries. The two suites that test
// checkRevoked itself opt out via `jest.unmock(...)` at the top of the file.
jest.mock('./src/middleware/checkRevoked', () => (req, res, next) => next());
