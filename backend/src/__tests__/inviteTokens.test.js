'use strict';

const { generateInviteToken, consumeInviteToken } = require('../utils/inviteTokens');

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

  test('consumeInviteToken performs a single atomic UPDATE...RETURNING (not a separate SELECT+UPDATE)', async () => {
    const { rawToken, tokenHash } = generateInviteToken();
    const row = {
      id: 'inv-1', client_id: 'client-1', email: 'admin@cliente.it',
      token_hash: tokenHash, used_at: new Date(), expires_at: new Date(Date.now() + 86400000),
    };
    pool.query.mockResolvedValue({ rows: [row] });

    const result = await consumeInviteToken(pool, rawToken);

    expect(result).toEqual(row);
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE invite_tokens/i);
    expect(sql).toMatch(/SET used_at = now\(\)/i);
    expect(sql).toMatch(/token_hash = \$1/i);
    expect(sql).toMatch(/used_at IS NULL/i);
    expect(sql).toMatch(/expires_at > now\(\)/i);
    expect(params).toEqual([tokenHash]);
  });

  test('consumeInviteToken returns null when the token is already used, expired, or nonexistent (0 rows affected)', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const { rawToken } = generateInviteToken();
    const result = await consumeInviteToken(pool, rawToken);
    expect(result).toBeNull();
  });

  test('a second concurrent consumeInviteToken call for the same token gets null (simulated: second query call returns 0 rows)', async () => {
    const { rawToken, tokenHash } = generateInviteToken();
    const row = { id: 'inv-1', client_id: 'client-1', email: 'admin@cliente.it', token_hash: tokenHash };
    pool.query
      .mockResolvedValueOnce({ rows: [row] }) // prima richiesta: reclama il token
      .mockResolvedValueOnce({ rows: [] }); // seconda richiesta concorrente: 0 righe, già used_at

    const first = await consumeInviteToken(pool, rawToken);
    const second = await consumeInviteToken(pool, rawToken);

    expect(first).toEqual(row);
    expect(second).toBeNull();
  });
});
