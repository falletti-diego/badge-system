'use strict';

/**
 * Unit tests for middleware/requireDemoTenant.js (Task 5 of 9 — Ambiente
 * Demo Self-Service).
 *
 * Extracted from the inline guard originally written for POST
 * /demo/switch-role (Task 4) — see routes/demo.js's doc comment on that
 * route. This middleware is now shared by /demo/switch-role and the new
 * /demo/contact route.
 *
 * Fail-closed guard: must call next(ForbiddenError) — never next() — when
 * the caller's client_id does not resolve to an is_demo=true row (missing
 * client_id, no matching client, or a real customer's client).
 *
 * Uses a mocked pool (no real DB needed) since this only exercises the
 * middleware's own control flow, mirroring demo-start-validation.test.js's
 * mocked-pool pattern.
 */

jest.mock('../db/pool', () => ({
  pool: { query: jest.fn() },
}));

const { pool } = require('../db/pool');
const { requireDemoTenant } = require('../middleware/requireDemoTenant');
const { ForbiddenError } = require('../utils/errors');

describe('requireDemoTenant middleware', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  function makeReq(clientId) {
    return { user: { client_id: clientId } };
  }

  it('calls next() with no error when the caller client has is_demo = true', async () => {
    pool.query.mockResolvedValue({ rows: [{ is_demo: true, demo_contact_email: 'prospect@example.com' }] });
    const req = makeReq('11111111-1111-1111-1111-111111111111');
    const next = jest.fn();

    await requireDemoTenant(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // no arguments = success
  });

  it('attaches the looked-up client row to req.demoClient so callers can reuse it', async () => {
    pool.query.mockResolvedValue({ rows: [{ is_demo: true, demo_contact_email: 'prospect@example.com' }] });
    const req = makeReq('11111111-1111-1111-1111-111111111111');
    const next = jest.fn();

    await requireDemoTenant(req, {}, next);

    expect(req.demoClient).toEqual({ is_demo: true, demo_contact_email: 'prospect@example.com' });
  });

  it('fails closed with ForbiddenError when the client is a real (non-demo) tenant', async () => {
    pool.query.mockResolvedValue({ rows: [{ is_demo: false, demo_contact_email: null }] });
    const req = makeReq('22222222-2222-2222-2222-222222222222');
    const next = jest.fn();

    await requireDemoTenant(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
  });

  it('fails closed with ForbiddenError when the client_id does not exist', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const req = makeReq('33333333-3333-3333-3333-333333333333');
    const next = jest.fn();

    await requireDemoTenant(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
  });

  it('propagates unexpected DB errors to next() rather than throwing', async () => {
    const dbErr = new Error('connection lost');
    pool.query.mockRejectedValue(dbErr);
    const req = makeReq('44444444-4444-4444-4444-444444444444');
    const next = jest.fn();

    await requireDemoTenant(req, {}, next);

    expect(next).toHaveBeenCalledWith(dbErr);
  });
});
