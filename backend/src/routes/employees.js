/**
 * Employees API Routes
 * GET /api/employees — List all employees for authenticated client
 * GET /api/employees/:id — Get single employee by ID
 */

const express = require('express');
const pino = require('pino');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { NotFoundError } = require('../utils/errors');

const router = express.Router();
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * GET /api/employees
 * List employees (filtered by authenticated user's client_id)
 * Query params: limit, offset
 */
router.get('/', requireAuth, async (req, res, next) => {
  const { limit = 50, offset = 0 } = req.query;
  const clientId = req.user.client_id;

  try {
    // Query employees with pagination
    const query = `
      SELECT
        id,
        client_id,
        email,
        name,
        phone,
        assigned_sites,
        created_at,
        updated_at
      FROM employees
      WHERE client_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [clientId, parseInt(limit, 10), parseInt(offset, 10)]);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total FROM employees
      WHERE client_id = $1::uuid
    `;
    const countResult = await pool.query(countQuery, [clientId]);
    const total = parseInt(countResult.rows[0].total, 10);

    logger.info({
      action: 'list_employees',
      client_id: clientId,
      count: result.rows.length,
      total,
    });

    res.json({
      data: result.rows,
      pagination: {
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        total,
        hasMore: parseInt(offset, 10) + parseInt(limit, 10) < total,
      },
    });
  } catch (err) {
    logger.error({
      action: 'list_employees_error',
      error: err.message,
      code: err.code,
    });
    next(err);
  }
});

/**
 * GET /api/employees/:id
 * Get single employee by ID
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  const { id } = req.params;
  const clientId = req.user.client_id;

  try {
    const query = `
      SELECT
        id,
        client_id,
        email,
        name,
        phone,
        assigned_sites,
        created_at,
        updated_at
      FROM employees
      WHERE id = $1::uuid AND client_id = $2::uuid
    `;

    const result = await pool.query(query, [id, clientId]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Employee not found', 'EMPLOYEE_NOT_FOUND');
    }

    logger.info({
      action: 'get_employee',
      employee_id: id,
      client_id: clientId,
    });

    res.json({
      data: result.rows[0],
    });
  } catch (err) {
    logger.error({
      action: 'get_employee_error',
      employee_id: id,
      error: err.message,
      code: err.code,
    });
    next(err);
  }
});

module.exports = router;
