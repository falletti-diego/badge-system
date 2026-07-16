'use strict';

const { requireSuperadmin } = require('../middleware/requireSuperadmin');

describe('requireSuperadmin middleware', () => {
  function makeReqRes(role) {
    const req = { user: { role } };
    const res = {};
    const next = jest.fn();
    return { req, res, next };
  }

  it('calls next() with no error when role is superadmin', () => {
    const { req, res, next } = makeReqRes('superadmin');
    requireSuperadmin(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(err) with a 403 ForbiddenError when role is admin', () => {
    const { req, res, next } = makeReqRes('admin');
    requireSuperadmin(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('SUPERADMIN_REQUIRED');
  });

  it('calls next(err) with a 403 ForbiddenError when role is manager', () => {
    const { req, res, next } = makeReqRes('manager');
    requireSuperadmin(req, res, next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });
});
