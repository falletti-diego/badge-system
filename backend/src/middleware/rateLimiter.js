/**
 * Rate Limiting Middleware
 * Protects API from DDoS, brute-force attacks, and resource exhaustion
 * Uses express-rate-limit with in-memory store (MVP)
 * For production at scale, use Redis store with express-rate-limit
 */

const rateLimit = require('express-rate-limit');
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);

/**
 * General API rate limiter (100 req/min per user or IP)
 * Keyed by user_id if authenticated, else by IP
 */
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS, // 1 minute
  max: RATE_LIMIT_MAX_REQUESTS, // 100 requests per window
  standardHeaders: false, // Don't send X-RateLimit-* headers automatically
  skip: (req) => {
    // Skip rate limiting for /health endpoint
    if (req.path === '/health') return true;
    return false;
  },
  keyGenerator: (req, res) => {
    // Rate limit by user_id if authenticated, else by IP
    return req.user?.user_id || req.ip;
  },
  handler: (req, res) => {
    const retryAfter = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);

    logger.warn({
      action: 'rate_limit_exceeded',
      user_id: req.user?.user_id,
      ip: req.ip,
      path: req.path,
      method: req.method,
    });

    res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests, please retry after ${retryAfter} seconds`,
      statusCode: 429,
      retryAfter,
    });

    res.set('Retry-After', retryAfter.toString());
  },
});

/**
 * Auth rate limiter (5 req/min per IP for login attempts)
 * Tighter limit to prevent brute-force attacks
 */
const authLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS, // 1 minute
  max: 5, // 5 attempts per minute
  standardHeaders: false,
  keyGenerator: (req, res) => req.ip,
  handler: (req, res) => {
    const retryAfter = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);

    logger.warn({
      action: 'auth_rate_limit_exceeded',
      ip: req.ip,
      endpoint: req.path,
    });

    res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Too many login attempts, please retry after ${retryAfter} seconds`,
      statusCode: 429,
      retryAfter,
    });

    res.set('Retry-After', retryAfter.toString());
  },
});

/**
 * CSV export rate limiter (10 req/min per user)
 * Heavier operation deserves lower limit
 */
const csvLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS, // 1 minute
  max: 10, // 10 exports per minute
  standardHeaders: false,
  keyGenerator: (req, res) => req.user?.user_id || req.ip,
  handler: (req, res) => {
    const retryAfter = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);

    logger.warn({
      action: 'csv_export_rate_limit_exceeded',
      user_id: req.user?.user_id,
      ip: req.ip,
    });

    res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Too many export requests, please retry after ${retryAfter} seconds`,
      statusCode: 429,
      retryAfter,
    });

    res.set('Retry-After', retryAfter.toString());
  },
});

module.exports = {
  apiLimiter,
  authLimiter,
  csvLimiter,
};
