/**
 * Rate Limiting Middleware
 * Protects API from DDoS, brute-force attacks, and resource exhaustion.
 *
 * Store strategy (C4 fix):
 *   - When Redis is available: counters survive container restarts/crashes.
 *   - When Redis is unavailable: graceful fallback to in-memory Map.
 * This eliminates the window where a container crash resets all counters,
 * which could be exploited for brute-force against /api/auth/login.
 */

const rateLimit = require('express-rate-limit');
const pino = require('pino');
const { getRedis, isRedisAvailable } = require('../db/redis');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);

/**
 * Hybrid rate-limit store: Redis when available, in-memory fallback otherwise.
 * Uses the redis client already initialised by initializeRedis() so no extra
 * connection or dependency is required.
 *
 * @param {string} prefix   - Namespace prefix to avoid key collisions between limiters
 * @param {number} windowMs - Sliding window duration in milliseconds (used for TTL)
 */
function createHybridStore(prefix, windowMs) {
  const ttlSeconds = Math.ceil(windowMs / 1000);
  // In-memory fallback: Map<key, { count, expiresAt }>
  const memStore = new Map();

  // Periodic cleanup of expired in-memory entries (avoids unbounded Map growth)
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memStore) {
      if (v.expiresAt <= now) memStore.delete(k);
    }
  }, windowMs);
  // Unreferenced timer must not prevent process exit
  if (cleanupInterval.unref) cleanupInterval.unref();

  return {
    async increment(key) {
      const redisKey = `rl:${prefix}:${key}`;

      if (isRedisAvailable()) {
        try {
          const client = getRedis();
          // INCR + EXPIRE in a pipeline — atomic enough for rate limiting
          const count = await client.incr(redisKey);
          if (count === 1) {
            // First hit in this window: set expiry
            await client.expire(redisKey, ttlSeconds);
          }
          return {
            totalHits: count,
            resetTime: new Date(Date.now() + windowMs),
          };
        } catch (err) {
          logger.warn({ action: 'rate_limit_redis_error', error: err.message, key });
          // Fall through to memory fallback on Redis error
        }
      }

      // Memory fallback
      const now = Date.now();
      const entry = memStore.get(key);
      if (!entry || entry.expiresAt <= now) {
        memStore.set(key, { count: 1, expiresAt: now + windowMs });
        return { totalHits: 1, resetTime: new Date(now + windowMs) };
      }
      entry.count += 1;
      return { totalHits: entry.count, resetTime: new Date(entry.expiresAt) };
    },

    async decrement(key) {
      if (isRedisAvailable()) {
        try {
          await getRedis().decr(`rl:${prefix}:${key}`);
          return;
        } catch (err) {
          logger.warn({ action: 'rate_limit_redis_decr_error', error: err.message });
        }
      }
      const entry = memStore.get(key);
      if (entry && entry.count > 0) entry.count -= 1;
    },

    async resetKey(key) {
      if (isRedisAvailable()) {
        try {
          await getRedis().del(`rl:${prefix}:${key}`);
          return;
        } catch (err) {
          logger.warn({ action: 'rate_limit_redis_reset_error', error: err.message });
        }
      }
      memStore.delete(key);
    },
  };
}

/**
 * General API rate limiter (100 req/min per user or IP)
 * Keyed by user_id if authenticated, else by IP
 * SKIP in test environment (NODE_ENV === 'test')
 */
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: false,
  store: createHybridStore('api', RATE_LIMIT_WINDOW_MS),
  skip: (req) => req.path === '/health' || process.env.NODE_ENV === 'test',
  keyGenerator: (req) => req.user?.user_id || req.ip,
  handler: (req, res) => {
    const retryAfter = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);

    logger.warn({
      action: 'rate_limit_exceeded',
      user_id: req.user?.user_id,
      ip: req.ip,
      path: req.path,
      method: req.method,
    });

    res.set('Retry-After', retryAfter.toString());
    res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests, please retry after ${retryAfter} seconds`,
      statusCode: 429,
      retryAfter,
    });
  },
});

/**
 * Auth rate limiter (5 req/min per IP) — brute-force protection for login
 * SKIP in test environment (NODE_ENV === 'test')
 */
const authLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: 5,
  standardHeaders: false,
  store: createHybridStore('auth', RATE_LIMIT_WINDOW_MS),
  skip: (req) => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    const retryAfter = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);

    logger.warn({
      action: 'auth_rate_limit_exceeded',
      ip: req.ip,
      endpoint: req.path,
    });

    res.set('Retry-After', retryAfter.toString());
    res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Too many login attempts, please retry after ${retryAfter} seconds`,
      statusCode: 429,
      retryAfter,
    });
  },
});

/**
 * CSV export rate limiter (10 req/min per user) — heavier operation
 * SKIP in test environment (NODE_ENV === 'test')
 */
const csvLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: 10,
  standardHeaders: false,
  store: createHybridStore('csv', RATE_LIMIT_WINDOW_MS),
  skip: (req) => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => req.user?.user_id || req.ip,
  handler: (req, res) => {
    const retryAfter = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);

    logger.warn({
      action: 'csv_export_rate_limit_exceeded',
      user_id: req.user?.user_id,
      ip: req.ip,
    });

    res.set('Retry-After', retryAfter.toString());
    res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Too many export requests, please retry after ${retryAfter} seconds`,
      statusCode: 429,
      retryAfter,
    });
  },
});

module.exports = {
  apiLimiter,
  authLimiter,
  csvLimiter,
};
