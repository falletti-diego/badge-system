/**
 * Unit Tests: Custom Error Classes
 */

const {
  ApiError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  InternalServerError,
} = require('../utils/errors');

describe('Error Classes', () => {
  describe('ApiError (base class)', () => {
    test('sets code, message, statusCode', () => {
      const err = new ApiError('MY_CODE', 'something went wrong', 503);
      expect(err.code).toBe('MY_CODE');
      expect(err.message).toBe('something went wrong');
      expect(err.statusCode).toBe(503);
      expect(err instanceof Error).toBe(true);
    });

    test('defaults statusCode to 500', () => {
      const err = new ApiError('ERR', 'msg');
      expect(err.statusCode).toBe(500);
    });

    test('has a stack trace', () => {
      const err = new ApiError('ERR', 'msg');
      expect(err.stack).toBeDefined();
    });
  });

  describe('ValidationError', () => {
    test('is a 400 VALIDATION_ERROR', () => {
      const err = new ValidationError('Invalid email');
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.message).toBe('Invalid email');
      expect(err.details).toBeNull();
    });

    test('attaches details when provided', () => {
      const details = { field: 'email', code: 'INVALID_FORMAT' };
      const err = new ValidationError('Bad input', details);
      expect(err.details).toEqual(details);
    });

    test('instanceof ApiError', () => {
      expect(new ValidationError('x') instanceof ApiError).toBe(true);
    });
  });

  describe('NotFoundError', () => {
    test('is a 404 NOT_FOUND by default', () => {
      const err = new NotFoundError('Employee not found');
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.message).toBe('Employee not found');
    });

    test('accepts custom code', () => {
      const err = new NotFoundError('Site missing', 'SITE_NOT_FOUND');
      expect(err.code).toBe('SITE_NOT_FOUND');
    });
  });

  describe('UnauthorizedError', () => {
    test('is a 401 UNAUTHORIZED by default', () => {
      const err = new UnauthorizedError('Token expired');
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
    });

    test('accepts custom code', () => {
      const err = new UnauthorizedError('msg', 'TOKEN_EXPIRED');
      expect(err.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('ForbiddenError', () => {
    test('is a 403 FORBIDDEN', () => {
      const err = new ForbiddenError('Not allowed');
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('FORBIDDEN');
    });
  });

  describe('ConflictError', () => {
    test('is a 409 CONFLICT', () => {
      const err = new ConflictError('Duplicate entry');
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('CONFLICT');
    });
  });

  describe('RateLimitError', () => {
    test('is a 429 with default message and retryAfter', () => {
      const err = new RateLimitError();
      expect(err.statusCode).toBe(429);
      expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(err.retryAfter).toBe(60);
    });

    test('accepts custom retryAfter', () => {
      const err = new RateLimitError('Too many requests', 120);
      expect(err.retryAfter).toBe(120);
    });
  });

  describe('InternalServerError', () => {
    test('is a 500 INTERNAL_ERROR', () => {
      const err = new InternalServerError();
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe('INTERNAL_ERROR');
    });

    test('accepts requestId', () => {
      const err = new InternalServerError('DB failure', 'req-123');
      expect(err.requestId).toBe('req-123');
    });
  });
});
