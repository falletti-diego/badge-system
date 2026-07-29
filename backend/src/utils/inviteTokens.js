'use strict';

const crypto = require('crypto');
const bcryptjs = require('bcryptjs');

const TOKEN_TTL_DAYS = 7;
const SALT_COST = 12; // stesso costo di hashPassword in src/auth/password.js

function generateInviteToken() {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = bcryptjs.hashSync(rawToken, bcryptjs.genSaltSync(SALT_COST));
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { rawToken, tokenHash, expiresAt };
}

async function verifyInviteToken(db, rawToken) {
  const { rows } = await db.query(
    'SELECT * FROM invite_tokens WHERE used_at IS NULL AND expires_at > now()'
  );
  for (const row of rows) {
    if (bcryptjs.compareSync(rawToken, row.token_hash)) return row;
  }
  return null;
}

module.exports = { generateInviteToken, verifyInviteToken };
