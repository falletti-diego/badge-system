/**
 * Sites API Routes
 * GET /api/sites — List sites for authenticated user's client
 */

const express = require('express');
const pino = require('pino');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { ForbiddenError } = require('../utils/errors');

const router = express.Router();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

/**
 * GET /api/sites
 * Returns sites scoped to the authenticated user's client.
 * - admin: all sites for their client_id
 * - manager: only their assigned site (site_id from JWT)
 * - employee: 403 (employees have no need to list sites)
 */
router.get('/', requireAuth, async (req, res, next) => {
  const { client_id, role, site_id } = req.user;

  try {
    if (role === 'employee') {
      return next(new ForbiddenError('Employees cannot access site list'));
    }

    let query;
    let params;

    if (role === 'admin') {
      // Admin sees all sites for their client
      query = `
        SELECT id, client_id, name, location, qr_code_content, created_at, updated_at
        FROM sites
        WHERE client_id = $1::uuid
        ORDER BY name ASC
      `;
      params = [client_id];
    } else {
      // Manager sees only their assigned site
      if (!site_id) {
        return res.json({ data: [] });
      }
      query = `
        SELECT id, client_id, name, location, qr_code_content, created_at, updated_at
        FROM sites
        WHERE client_id = $1::uuid AND id = $2::uuid
      `;
      params = [client_id, site_id];
    }

    const result = await pool.query(query, params);

    logger.info({
      action: 'sites_list',
      role,
      client_id,
      count: result.rows.length,
    });

    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
