/**
 * Authentication Middleware
 * Verifies JWT tokens and provides user context
 */

const jwt = require('jsonwebtoken');
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Extract Bearer token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} - Token or null if invalid format
 */
function extractToken(authHeader) {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  return parts[1];
}

/**
 * Verify JWT token and extract user info
 * @param {string} token - JWT token
 * @returns {object|null} - Decoded token or null if invalid
 */
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return null; // Token expired
    }
    if (err.name === 'JsonWebTokenError') {
      return null; // Invalid signature or format
    }
    throw err; // Other errors
  }
}

/**
 * Middleware: Require authentication
 * Verifies JWT token and attaches user context to req.user
 * Returns 401 if token is missing, invalid, or expired
 */
function requireAuth(req, res, next) {
  try {
    // MVP: Skip auth if DISABLE_AUTH=true
    if (process.env.DISABLE_AUTH === 'true') {
      req.user = {
        user_id: 'mvp-user-1',
        client_id: 'client-1',
        role: 'admin',
      };
      return next();
    }

    const authHeader = req.get('Authorization');
    const token = extractToken(authHeader);

    if (!token) {
      return res.status(401).json({
        error: 'MISSING_TOKEN',
        message: 'Missing or invalid Authorization header',
        statusCode: 401,
      });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Token is invalid or expired',
        statusCode: 401,
      });
    }

    // Attach user info to request
    req.user = {
      user_id: decoded.user_id,
      auth0_sub: decoded.auth0_sub,
      client_id: decoded.client_id,
      role: decoded.role,
      iat: decoded.iat,
      exp: decoded.exp,
    };

    // Include employee_id if present (for employee role users)
    if (decoded.employee_id) {
      req.user.employee_id = decoded.employee_id;
    }

    logger.debug({
      action: 'auth_verified',
      user_id: req.user.user_id,
      client_id: req.user.client_id,
    });

    next();
  } catch (err) {
    logger.error({
      action: 'auth_middleware_error',
      error: err.message,
    });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
      statusCode: 500,
    });
  }
}

/**
 * Middleware: Optional authentication
 * Verifies JWT if present, but doesn't require it
 * Attaches user context if valid, otherwise leaves req.user undefined
 */
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.get('Authorization');
    const token = extractToken(authHeader);

    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        req.user = {
          user_id: decoded.user_id,
          auth0_sub: decoded.auth0_sub,
          client_id: decoded.client_id,
          role: decoded.role,
        };
      }
    }

    next();
  } catch (err) {
    logger.error({
      action: 'optional_auth_error',
      error: err.message,
    });
    next(); // Continue even if auth fails
  }
}

module.exports = {
  requireAuth,
  optionalAuth,
  verifyToken,
  extractToken,
};
