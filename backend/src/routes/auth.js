/**
 * Authentication Routes
 * POST /api/auth/login - User login (MVP: hardcoded credentials)
 * POST /api/auth/logout - User logout (frontend-side, optional endpoint)
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const pino = require('pino');
const { createValidationMiddleware, LoginSchema } = require('../middleware/validation');
const { ValidationError } = require('../utils/errors');

const router = express.Router();
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-mvp';
const TOKEN_EXPIRY = '7d'; // 7 days for MVP

// MVP: Hardcoded demo credentials
const DEMO_USER = {
  email: 'demo@badge.it',
  password: 'DemoPass2026!Badge',
  id: 'user-mvp-demo',
  role: 'admin',
  client_id: 'client-1',
};

/**
 * POST /api/auth/login
 * Login with email and password (MVP: hardcoded demo account)
 *
 * Request:
 * {
 *   "email": "demo@badge.it",
 *   "password": "demo123"
 * }
 *
 * Response (200):
 * {
 *   "data": {
 *     "token": "eyJhbGciOiJIUzI1NiIs...",
 *     "user": {
 *       "id": "user-mvp-demo",
 *       "email": "demo@badge.it",
 *       "role": "admin"
 *     }
 *   }
 * }
 */
router.post('/login', createValidationMiddleware(LoginSchema), async (req, res, next) => {
  const { email, password } = req.validated.body;

  try {
    // MVP: Check against hardcoded demo credentials
    if (email !== DEMO_USER.email || password !== DEMO_USER.password) {
      throw new ValidationError('Email or password is incorrect', {
        field: 'credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        user_id: DEMO_USER.id,
        email: DEMO_USER.email,
        role: DEMO_USER.role,
        client_id: DEMO_USER.client_id,
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    logger.info({
      action: 'user_login',
      email,
      user_id: DEMO_USER.id,
      timestamp: new Date().toISOString(),
    });

    res.json({
      data: {
        token,
        user: {
          id: DEMO_USER.id,
          email: DEMO_USER.email,
          role: DEMO_USER.role,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout (optional)
 * Frontend will clear localStorage, but can call this endpoint for audit logging
 */
router.post('/logout', (req, res) => {
  // JWT is stateless, so we just log the logout
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      logger.info({
        action: 'user_logout',
        user_id: decoded.user_id,
        email: decoded.email,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn({
        action: 'logout_invalid_token',
        error: err.message,
      });
    }
  }

  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
