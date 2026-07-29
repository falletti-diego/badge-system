'use strict';

const crypto = require('crypto');

const TOKEN_TTL_DAYS = 7;

// SHA-256, non bcrypt: rawToken è già 256 bit di entropia casuale (crypto.randomBytes),
// non un segreto umano debole — bcrypt (costoso, pensato per rallentare il bruteforce
// su password) qui aggiungerebbe solo blocco sincrono dell'event loop e costringerebbe
// a uno scan lineare invece di un lookup diretto indicizzato. SHA-256 permette un
// WHERE token_hash = $1 con indice UNIQUE, O(1) invece di O(n) sugli inviti attivi.
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function generateInviteToken() {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { rawToken, tokenHash, expiresAt };
}

async function verifyInviteToken(db, rawToken) {
  const { rows } = await db.query(
    'SELECT * FROM invite_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()',
    [hashToken(rawToken)]
  );
  return rows[0] || null;
}

module.exports = { generateInviteToken, verifyInviteToken };
