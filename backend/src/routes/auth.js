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

// MVP: Hardcoded demo credentials (5 test accounts)
const DEMO_USERS = [
  {
    email: 'pippo',
    password: 'pippo01',
    id: 'user-mvp-pippo',
    name: 'Pippo',
    role: 'admin',
    client_id: 'client-1',
  },
  {
    email: 'pino',
    password: 'pino01',
    id: 'user-mvp-pino',
    name: 'Pino',
    role: 'manager',
    client_id: 'client-1',
  },
  {
    email: 'diego',
    password: 'diego01',
    id: 'user-mvp-diego',
    name: 'Diego',
    role: 'manager',
    client_id: 'client-1',
  },
  {
    email: 'maria',
    password: 'maria01',
    id: 'user-mvp-maria',
    name: 'Maria',
    role: 'employee',
    client_id: 'client-1',
  },
  {
    email: 'lucia',
    password: 'lucia01',
    id: 'user-mvp-lucia',
    name: 'Lucia',
    role: 'employee',
    client_id: 'client-1',
  },
];

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
    // MVP: Check against hardcoded demo credentials (5 test accounts)
    const user = DEMO_USERS.find((u) => u.email === email && u.password === password);

    if (!user) {
      throw new ValidationError('Email or password is incorrect', {
        field: 'credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        user_id: user.id,
        email: user.email,
        role: user.role,
        client_id: user.client_id,
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    logger.info({
      action: 'user_login',
      email,
      name: user.name,
      user_id: user.id,
      role: user.role,
      timestamp: new Date().toISOString(),
    });

    res.json({
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
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
