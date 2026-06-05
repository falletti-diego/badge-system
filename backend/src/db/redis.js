/**
 * Redis Connection Pool
 * Manages connection to Redis for caching layer
 * Gracefully handles missing Redis (fallback to database)
 */

const redis = require('redis');
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

let redisClient = null;
let isConnected = false;

/**
 * Initialize Redis connection
 * Returns null if REDIS_URL is not configured (optional feature)
 */
async function initializeRedis() {
  const REDIS_URL = process.env.REDIS_URL;

  if (!REDIS_URL) {
    logger.info('Redis disabled: REDIS_URL not configured');
    return null;
  }

  try {
    redisClient = redis.createClient({
      url: REDIS_URL,
      socket: {
        // Stop retrying after 3 attempts so connect() rejects and startup continues
        reconnectStrategy: (retries) => {
          if (retries >= 3) return new Error('Redis unavailable after 3 attempts');
          return Math.min(retries * 500, 2000);
        },
        connectTimeout: 5000,
      },
    });

    redisClient.on('error', (err) => {
      logger.error({
        action: 'redis_error',
        error: err.message,
      });
    });

    redisClient.on('connect', () => {
      logger.info('Connected to Redis');
      isConnected = true;
    });

    redisClient.on('disconnect', () => {
      logger.warn('Disconnected from Redis');
      isConnected = false;
    });

    await redisClient.connect();
    return redisClient;
  } catch (err) {
    logger.warn({
      action: 'redis_connection_failed',
      error: err.message,
      message: 'Continuing without Redis (caching disabled)',
    });
    return null;
  }
}

/**
 * Get Redis client (cached)
 */
function getRedis() {
  return redisClient;
}

/**
 * Check if Redis is available
 */
function isRedisAvailable() {
  return isConnected && redisClient !== null;
}

/**
 * Get value from Redis cache
 * @param {string} key - Cache key
 * @returns {Promise<string|null>} - Cached value or null if not found
 */
async function getCache(key) {
  if (!isRedisAvailable()) {
    return null;
  }

  try {
    const value = await redisClient.get(key);
    if (value) {
      logger.debug({
        action: 'cache_hit',
        key,
      });
    }
    return value;
  } catch (err) {
    logger.warn({
      action: 'cache_get_error',
      key,
      error: err.message,
    });
    return null;
  }
}

/**
 * Set value in Redis cache with TTL
 * @param {string} key - Cache key
 * @param {string} value - Value to cache (should be JSON string)
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<boolean>} - Success indicator
 */
async function setCache(key, value, ttl = 300) {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    await redisClient.setEx(key, ttl, value);
    logger.debug({
      action: 'cache_set',
      key,
      ttl,
    });
    return true;
  } catch (err) {
    logger.warn({
      action: 'cache_set_error',
      key,
      error: err.message,
    });
    return false;
  }
}

/**
 * Delete cache key(s)
 * Supports pattern matching with wildcard
 * @param {string|string[]} keys - Cache key(s) to delete
 * @returns {Promise<number>} - Number of keys deleted
 */
async function deleteCache(keys) {
  if (!isRedisAvailable()) {
    return 0;
  }

  try {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    if (keyArray.length === 0) return 0;

    const deleted = await redisClient.del(keyArray);
    logger.debug({
      action: 'cache_delete',
      count: deleted,
    });
    return deleted;
  } catch (err) {
    logger.warn({
      action: 'cache_delete_error',
      error: err.message,
    });
    return 0;
  }
}

/**
 * Delete cache keys by pattern (e.g., "checkins:*")
 * @param {string} pattern - Pattern to match (uses Redis SCAN)
 * @returns {Promise<number>} - Number of keys deleted
 */
async function deleteCacheByPattern(pattern) {
  if (!isRedisAvailable()) {
    return 0;
  }

  try {
    let cursor = 0;
    let totalDeleted = 0;

    // Use SCAN to iterate through keys matching pattern
    do {
      const result = await redisClient.scan(cursor, {
        MATCH: pattern,
        COUNT: 100,
      });

      cursor = result.cursor;
      const keys = result.keys;

      if (keys.length > 0) {
        const deleted = await redisClient.del(keys);
        totalDeleted += deleted;
      }
    } while (cursor !== 0);

    logger.debug({
      action: 'cache_delete_pattern',
      pattern,
      count: totalDeleted,
    });

    return totalDeleted;
  } catch (err) {
    logger.warn({
      action: 'cache_delete_pattern_error',
      pattern,
      error: err.message,
    });
    return 0;
  }
}

/**
 * Close Redis connection
 */
async function closeRedis() {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis connection closed');
    } catch (err) {
      logger.error({
        action: 'redis_close_error',
        error: err.message,
      });
    }
  }
}

module.exports = {
  initializeRedis,
  getRedis,
  isRedisAvailable,
  getCache,
  setCache,
  deleteCache,
  deleteCacheByPattern,
  closeRedis,
};
