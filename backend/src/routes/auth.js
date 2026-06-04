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
    email: 'pippo@badge.local',
    password: 'pippo01',
    id: 'user-mvp-pippo',
    name: 'Pippo',
    role: 'admin',
    client_id: '550e8400-e29b-41d4-a716-446655440001', // Dataxiom MVP
  },
  {
    email: 'pino@badge.local',
    password: 'pino01',
    id: 'user-mvp-pino',
    name: 'Pino',
    role: 'manager',
    client_id: '550e8400-e29b-41d4-a716-446655440001', // Dataxiom MVP
  },
  {
    email: 'diego@badge.local',
    password: 'Diego1975',
    id: 'user-mvp-diego',
    name: 'Diego',
    role: 'manager',
    client_id: '550e8400-e29b-41d4-a716-446655440001', // Dataxiom MVP
    site_id: '550e8400-e29b-41d4-a716-446655440012', // Torino Store
  },
  {
    email: 'maria@badge.local',
    password: 'maria01',
    id: 'user-mvp-maria',
    name: 'Maria',
    role: 'employee',
    client_id: '550e8400-e29b-41d4-a716-446655440001', // Dataxiom MVP
  },
  {
    email: 'lucia@badge.local',
    password: 'lucia01',
    id: 'user-mvp-lucia',
    name: 'Lucia',
    role: 'employee',
    client_id: '550e8400-e29b-41d4-a716-446655440001', // Dataxiom MVP
  },
  {
    email: 'luca.verdi@employee.it',
    password: 'Luca1975',
    id: 'user-mvp-luca-verdi',
    name: 'Luca Verdi',
    role: 'employee',
    client_id: '550e8400-e29b-41d4-a716-446655440001', // Dataxiom MVP
    employee_id: '550e8400-e29b-41d4-a716-446655440102', // Database employee ID
  },
  {
    email: 'alice.neri@employee.it',
    password: 'Alice1975',
    id: 'user-mvp-alice-neri',
    name: 'Alice Neri',
    role: 'employee',
    client_id: '550e8400-e29b-41d4-a716-446655440001', // Dataxiom MVP
    employee_id: '550e8400-e29b-41d4-a716-446655440103', // Torino Store employee
  },
  {
    email: 'carlo.rossi@employee.it',
    password: 'Carlo1975',
    id: 'user-mvp-carlo-rossi',
    name: 'Carlo Rossi',
    role: 'employee',
    client_id: '550e8400-e29b-41d4-a716-446655440001', // Dataxiom MVP
    employee_id: '550e8400-e29b-41d4-a716-446655440104', // Torino Store employee
  },
  {
    email: 'paolo.sordo@employee.it',
    password: 'Paolo1975',
    id: 'user-mvp-paolo-sordo',
    name: 'Paolo Sordo',
    role: 'employee',
    client_id: '550e8400-e29b-41d4-a716-446655440001', // Dataxiom MVP
    employee_id: '550e8400-e29b-41d4-a716-446655440116', // Torino Store employee
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

    // Generate JWT token (include employee_id and site_id if present)
    const tokenPayload = {
      user_id: user.id,
      email: user.email,
      role: user.role,
      client_id: user.client_id,
    };
    if (user.employee_id) {
      tokenPayload.employee_id = user.employee_id;
    }
    if (user.site_id) {
      tokenPayload.site_id = user.site_id;
    }

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

    logger.info({
      action: 'user_login',
      email,
      name: user.name,
      user_id: user.id,
      role: user.role,
      employee_id: user.employee_id || null,
      site_id: user.site_id || null,
      timestamp: new Date().toISOString(),
    });

    const userResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    if (user.employee_id) {
      userResponse.employee_id = user.employee_id;
    }
    if (user.site_id) {
      userResponse.site_id = user.site_id;
    }

    res.json({
      data: {
        token,
        user: userResponse,
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
