/**
 * Caching Middleware
 * Provides simple cache decorator for GET endpoints
 * Generates cache key from route + query params
 * Supports cache invalidation on write operations
 */

const pino = require('pino');
const { getCache, setCache, isRedisAvailable } = require('../db/redis');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

const CACHE_ENABLED = process.env.CACHE_ENABLED === 'true';
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '300', 10);

/**
 * Generate cache key from request
 * Combines route, client_id, and all query parameters
 * @param {Express.Request} req - Express request
 * @returns {string} - Cache key
 */
function generateCacheKey(req) {
  const parts = [
    req.path.replace(/\//g, ':'),
    req.user?.client_id || 'anonymous',
  ];

  // Add all query params to key (order-independent)
  const queryKeys = Object.keys(req.query || {}).sort();
  for (const key of queryKeys) {
    const value = req.query[key];
    parts.push(`${key}=${value}`);
  }

  return `cache:${parts.join(':')}`;
}

/**
 * Cache middleware for GET requests
 * Checks cache before executing route handler
 * Stores response in cache after execution
 *
 * Usage:
 *   router.get('/', cacheMiddleware(), (req, res) => { ... })
 */
function cacheMiddleware() {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Check if caching is enabled
    if (!CACHE_ENABLED || !isRedisAvailable()) {
      return next();
    }

    const cacheKey = generateCacheKey(req);

    // Try to get from cache
    try {
      const cachedValue = await getCache(cacheKey);
      if (cachedValue) {
        const cachedData = JSON.parse(cachedValue);

        logger.debug({
          action: 'cache_middleware_hit',
          cacheKey,
          path: req.path,
        });

        // Return cached response
        return res.json(cachedData);
      }
    } catch (err) {
      // Log error but continue to normal flow
      logger.warn({
        action: 'cache_middleware_error',
        error: err.message,
      });
    }

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);

    res.json = function (data) {
      // Only cache successful 2xx responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const jsonString = JSON.stringify(data);
          setCache(cacheKey, jsonString, CACHE_TTL).catch((err) => {
            logger.warn({
              action: 'cache_set_error_in_middleware',
              error: err.message,
            });
          });

          logger.debug({
            action: 'cache_middleware_set',
            cacheKey,
            path: req.path,
            ttl: CACHE_TTL,
          });
        } catch (err) {
          logger.warn({
            action: 'cache_json_stringify_error',
            error: err.message,
          });
        }
      }

      return originalJson(data);
    };

    next();
  };
}

module.exports = {
  cacheMiddleware,
  generateCacheKey,
};
