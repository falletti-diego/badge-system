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
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex digest
  });

  test('generateInviteToken sets expiresAt 7 days from now', () => {
    const before = Date.now();
    const { expiresAt } = generateInviteToken();
    const diffDays = (expiresAt.getTime() - before) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 1);
  });

  test('verifyInviteToken looks up by the hash of the raw token, returns the matching row', async () => {
    const { rawToken, tokenHash } = generateInviteToken();
    const row = {
      id: 'inv-1', client_id: 'client-1', email: 'admin@cliente.it',
      token_hash: tokenHash, used_at: null, expires_at: new Date(Date.now() + 86400000),
    };
    pool.query.mockResolvedValue({ rows: [row] });

    const result = await verifyInviteToken(pool, rawToken);

    expect(result).toEqual(row);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('token_hash = $1'), [tokenHash]);
  });

  test('verifyInviteToken returns null when no row matches (query already filters hash/expiry/used_at)', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const { rawToken } = generateInviteToken();
    const result = await verifyInviteToken(pool, rawToken);
    expect(result).toBeNull();
  });
});
