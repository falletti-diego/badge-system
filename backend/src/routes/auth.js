/**
 * Authentication Routes
 * POST /api/auth/login - Exchange Auth0 token for JWT
 * POST /api/auth/refresh - Rotate refresh token
 * POST /api/auth/logout - Revoke token (optional)
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const pino = require('pino');
const { pool } = require('../db/pool');
const { createValidationMiddleware } = require('../middleware/validation');
const { requireAuth } = require('../middleware/auth');
const { withTransaction } = require('../middleware/db-transaction');
const { z } = require('zod');

const router = express.Router();
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '30m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

// Validation schemas
const LoginSchema = z.object({
  body: z.object({
    auth0_token: z.string().min(1, 'auth0_token is required'),
  }),
});

const RefreshSchema = z.object({
  body: z.object({
    refresh_token: z.string().min(1, 'refresh_token is required'),
  }),
});

// =====================================================
// POST /api/auth/login — Exchange Auth0 token for JWT
// =====================================================

router.post('/login', createValidationMiddleware(LoginSchema), async (req, res, next) => {
  const { auth0_token } = req.validated.body;

  try {
    // In production: verify auth0_token with Auth0 API
    // For MVP: assume token is valid and contains user info
    // TODO: Add actual Auth0 verification (Phase 2)
    let auth0User;
    try {
      auth0User = JSON.parse(Buffer.from(auth0_token.split('.')[1], 'base64').toString());
    } catch (err) {
      return res.status(400).json({
        error: 'INVALID_TOKEN',
        message: 'Invalid token format',
        statusCode: 400,
      });
    }

    const { sub, email } = auth0User;

    if (!sub || !email) {
      return res.status(400).json({
        error: 'INVALID_TOKEN',
        message: 'Token missing required claims (sub, email)',
        statusCode: 400,
      });
    }

    const result = await pool.query(
      'SELECT id, client_id, role FROM users WHERE auth0_sub = $1 LIMIT 1',
      [sub]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'USER_NOT_FOUND',
        message: 'User not found. Please contact your administrator.',
        statusCode: 401,
      });
    }

    const user = result.rows[0];

    // Sign access token
    const accessToken = jwt.sign(
      {
        user_id: user.id,
        auth0_sub: sub,
        client_id: user.client_id,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    // Sign refresh token
    const refreshToken = jwt.sign(
      {
        user_id: user.id,
        type: 'refresh',
      },
      JWT_REFRESH_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRY }
    );

    // Store refresh token in database
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, expiresAt]
    );

    logger.info({
      action: 'login_success',
      user_id: user.id,
      client_id: user.client_id,
    });

    res.json({
      accessToken,
      refreshToken,
      expiresIn: 1800, // 30 minutes in seconds
      tokenType: 'Bearer',
    });
  } catch (err) {
    logger.error({
      action: 'login_error',
      error: err.message,
    });
    next(err);
  }
});

// =====================================================
// POST /api/auth/refresh — Rotate refresh token
// =====================================================

router.post('/refresh', createValidationMiddleware(RefreshSchema), async (req, res, next) => {
  const { refresh_token } = req.validated.body;

  try {
    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refresh_token, JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({
        error: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired',
        statusCode: 401,
      });
    }

    const userId = decoded.user_id;

    // Check if refresh token exists and is not revoked
    const tokenResult = await pool.query(
      'SELECT id FROM refresh_tokens WHERE token = $1 AND revoked_at IS NULL LIMIT 1',
      [refresh_token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(401).json({
        error: 'REFRESH_TOKEN_REVOKED',
        message: 'Refresh token has been revoked',
        statusCode: 401,
      });
    }

    // Get user info
    const userResult = await pool.query(
      'SELECT id, client_id, role, auth0_sub FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        error: 'USER_NOT_FOUND',
        message: 'User not found',
        statusCode: 401,
      });
    }

    const user = userResult.rows[0];

    // Generate new access token
    const newAccessToken = jwt.sign(
      {
        user_id: user.id,
        auth0_sub: user.auth0_sub,
        client_id: user.client_id,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    // Optionally generate new refresh token (token rotation)
    const newRefreshToken = jwt.sign(
      {
        user_id: user.id,
        type: 'refresh',
      },
      JWT_REFRESH_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRY }
    );

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Store new refresh token and revoke old one (atomic transaction)
    await withTransaction(async (client) => {
      await client.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = $1',
        [refresh_token]
      );
      await client.query(
        'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [user.id, newRefreshToken, expiresAt]
      );
    });

    logger.info({
      action: 'refresh_token_rotated',
      user_id: user.id,
      client_id: user.client_id,
    });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 1800,
      tokenType: 'Bearer',
    });
  } catch (err) {
    logger.error({
      action: 'refresh_error',
      error: err.message,
    });
    next(err);
  }
});

// =====================================================
// POST /api/auth/logout — Revoke refresh token
// =====================================================

router.post('/logout', requireAuth, async (req, res, next) => {
  const { refresh_token } = req.body;

  try {
    if (!refresh_token) {
      return res.status(400).json({
        error: 'MISSING_REFRESH_TOKEN',
        message: 'refresh_token is required',
        statusCode: 400,
      });
    }

    // Revoke refresh token
    await pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = $1 AND user_id = $2',
      [refresh_token, req.user.user_id]
    );

    logger.info({
      action: 'logout_success',
      user_id: req.user.user_id,
    });

    res.json({
      message: 'Logged out successfully',
    });
  } catch (err) {
    logger.error({
      action: 'logout_error',
      error: err.message,
    });
    next(err);
  }
});

module.exports = router;
