'use strict';

const { generateInviteToken, verifyInviteToken } = require('../utils/inviteTokens');

describe('inviteTokens', () => {
  let pool;
  beforeEach(() => {
    pool = { query: jest.fn() };
  });

  test('generateInviteToken returns a raw token and its hash, distinct from each other', () => {
    const { rawToken, tokenHash } = generateInviteToken();
    expect(rawToken).toHaveLength(43); // 32 byte base64url, no padding
    expect(tokenHash).not.toEqual(rawToken);
  });

  test('generateInviteToken sets expiresAt 7 days from now', () => {
    const before = Date.now();
    const { expiresAt } = generateInviteToken();
    const diffDays = (expiresAt.getTime() - before) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 1);
  });

  test('verifyInviteToken returns the row for a valid, unused, unexpired token', async () => {
    const { rawToken, tokenHash } = generateInviteToken();
    const row = {
      id: 'inv-1',
      client_id: 'client-1',
      email: 'admin@cliente.it',
      token_hash: tokenHash,
      used_at: null,
      expires_at: new Date(Date.now() + 86400000),
    };
    pool.query.mockResolvedValue({ rows: [row] });
    const result = await verifyInviteToken(pool, rawToken);
    expect(result).toEqual(row);
  });

  test('verifyInviteToken returns null when the token does not match any row', async () => {
    const { rawToken: unrelatedToken } = generateInviteToken();
    const { tokenHash } = generateInviteToken();
    pool.query.mockResolvedValue({
      rows: [{ id: 'inv-1', token_hash: tokenHash, used_at: null, expires_at: new Date(Date.now() + 86400000) }],
    });
    const result = await verifyInviteToken(pool, unrelatedToken);
    expect(result).toBeNull();
  });

  test('verifyInviteToken returns null for an expired token (query already filters expires_at > now())', async () => {
    // La query SQL filtra già "expires_at > now()" — un token scaduto non compare mai
    // tra le righe candidate restituite dal DB, quindi non c'è nulla con cui confrontare l'hash.
    pool.query.mockResolvedValue({ rows: [] });
    const { rawToken } = generateInviteToken();
    const result = await verifyInviteToken(pool, rawToken);
    expect(result).toBeNull();
  });

  test('verifyInviteToken returns null for an already-used token (query already filters used_at IS NULL)', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const { rawToken } = generateInviteToken();
    const result = await verifyInviteToken(pool, rawToken);
    expect(result).toBeNull();
  });
});
