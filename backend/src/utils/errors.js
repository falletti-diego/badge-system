/**
 * Custom Error Classes for standardized error handling
 * All API errors extend ApiError and provide code + statusCode
 */

class ApiError extends Error {
  constructor(code, message, statusCode = 500) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends ApiError {
  constructor(message, details = null) {
    super('VALIDATION_ERROR', message, 400);
    this.name = 'ValidationError';
    this.details = details;
  }
}

class NotFoundError extends ApiError {
  constructor(message, code = 'NOT_FOUND') {
    super(code, message, 404);
    this.name = 'NotFoundError';
  }
}

class UnauthorizedError extends ApiError {
  constructor(message, code = 'UNAUTHORIZED') {
    super(code, message, 401);
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends ApiError {
  constructor(message, code = 'FORBIDDEN') {
    super(code, message, 403);
    this.name = 'ForbiddenError';
  }
}

class ConflictError extends ApiError {
  constructor(message, code = 'CONFLICT') {
    super(code, message, 409);
    this.name = 'ConflictError';
  }
}

class RateLimitError extends ApiError {
  constructor(message = 'Too many requests, please retry after 60 seconds', retryAfter = 60) {
    super('RATE_LIMIT_EXCEEDED', message, 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

class InternalServerError extends ApiError {
  constructor(message = 'Internal server error', requestId = null) {
    super('INTERNAL_ERROR', message, 500);
    this.name = 'InternalServerError';
    this.requestId = requestId;
  }
}

module.exports = {
  ApiError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  InternalServerError,
};
