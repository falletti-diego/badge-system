'use strict';

const bcryptjs = require('bcryptjs');

// MASVS-AUTH: cost 12 = 2^12 bcrypt iterations (OWASP minimum is 10)
const SALT_COST = 12;
const MIN_LENGTH = 8;

/**
 * Hash a plaintext password for storage.
 * Never store or log the plaintext — only call this right before INSERT.
 */
async function hashPassword(plaintext) {
  if (!plaintext || plaintext.length < MIN_LENGTH) {
    throw new Error(`Password must be at least ${MIN_LENGTH} characters`);
  }
  const salt = await bcryptjs.genSalt(SALT_COST);
  return bcryptjs.hash(plaintext, salt);
}

/**
 * Verify a plaintext password against a stored bcrypt hash.
 * Timing-safe: bcrypt.compare uses constant-time comparison internally.
 */
async function verifyPassword(plaintext, hash) {
  return bcryptjs.compare(plaintext, hash);
}

module.exports = { hashPassword, verifyPassword };
