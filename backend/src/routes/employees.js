/**
 * Employees API Routes
 * GET /api/employees — List all employees for authenticated client
 * GET /api/employees/:id — Get single employee by ID
 */

const express = require('express');
const pino = require('pino');
const { pool } = require('../db/pool');

const router = express.Router();
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * GET /api/employees
 * List employees (filtered by client_id for multi-tenant)
 * Query params: client_id, limit, offset
 */
router.get('/', async (req, res, next) => {
  const { client_id, limit = 50, offset = 0 } = req.query;

  // For MVP, client_id is required to prevent data leakage
  if (!client_id) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'client_id query parameter is required',
    });
  }

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

    const result = await pool.query(query, [client_id, parseInt(limit, 10), parseInt(offset, 10)]);

    logger.info({
      action: 'list_employees',
      client_id,
      count: result.rows.length,
    });

    res.json({
      data: result.rows,
      pagination: {
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        total: result.rows.length,
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
router.get('/:id', async (req, res, next) => {
  const { id } = req.params;
  const { client_id } = req.query;

  if (!client_id) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'client_id query parameter is required',
    });
  }

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

    const result = await pool.query(query, [id, client_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Employee not found',
      });
    }

    logger.info({
      action: 'get_employee',
      employee_id: id,
      client_id,
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
