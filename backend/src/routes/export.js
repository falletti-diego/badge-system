/**
 * Export Routes
 * GET /api/export/csv — Export check-ins as CSV with streaming
 */

const express = require('express');
const pino = require('pino');
const { stringify } = require('csv-stringify');
const { pool } = require('../db/pool');
const { createValidationMiddleware, GetExportCsvSchema } = require('../middleware/validation');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/**
 * Escape CSV field to prevent formula injection
 * @param {*} field - Value to escape
 * @returns {string} - Escaped value
 */
function escapeCsvField(field) {
  if (field === null || field === undefined) return '';
  const stringField = String(field);
  // Escape formula characters (=, +, @, -)
  if (/^[=+@-]/.test(stringField)) {
    return '\'' + stringField;
  }
  return stringField;
}

// =====================================================
// GET /api/export/csv — Stream check-ins as CSV
// =====================================================

router.get('/', requireAuth, createValidationMiddleware(GetExportCsvSchema), async (req, res, next) => {
  const { site_id, employee_id, date_from, date_to } = req.validated.query;
  const clientId = req.user.client_id;

  try {
    // Build WHERE clause (MVP: no client_id filtering)
    const whereClauses = [];
    const params = [];
    let paramCount = 0;

    if (site_id) {
      paramCount++;
      whereClauses.push(`c.site_id = $${paramCount}::uuid`);
      params.push(site_id);
    }

    if (employee_id) {
      paramCount++;
      whereClauses.push(`c.employee_id = $${paramCount}::uuid`);
      params.push(employee_id);
    }

    if (date_from) {
      paramCount++;
      whereClauses.push(`c.timestamp >= $${paramCount}::date`);
      params.push(date_from);
    }

    if (date_to) {
      paramCount++;
      whereClauses.push(`c.timestamp < $${paramCount}::date + INTERVAL '1 day'`);
      params.push(date_to);
    }

    const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    // Query data from database FIRST (before headers)
    const query = `
      SELECT
        e.name as employee_name,
        e.email as employee_email,
        s.name as site_name,
        c.timestamp,
        c.type,
        c.modified_at,
        c.modified_by
      FROM checkins c
      LEFT JOIN employees e ON c.employee_id = e.id
      LEFT JOIN sites s ON c.site_id = s.id
      ${whereClause}
      ORDER BY c.timestamp DESC
    `;

    const result = await pool.query(query, params);

    // Set response headers AFTER successful query
    const filename = `presenze_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    logger.info({
      action: 'csv_export_started',
      client_id: clientId,
      filters: { site_id, employee_id, date_from, date_to },
      row_count: result.rows.length,
    });

    // Create CSV stringifier with error handler
    const stringifier = stringify({
      header: true,
      columns: {
        employee_name: 'Employee Name',
        employee_email: 'Email',
        site_name: 'Site',
        timestamp: 'Check-in Time',
        type: 'Type (IN/OUT)',
        modified_at: 'Last Modified',
        modified_by: 'Modified By',
      },
      cast: {
        string: (value) => escapeCsvField(value),
        boolean: (value) => value ? 'Yes' : 'No',
        object: (value) => {
          if (value === null) return '';
          return JSON.stringify(value);
        },
      },
    });

    // Handle stringifier errors
    stringifier.on('error', (err) => {
      logger.error({
        action: 'csv_stringifier_error',
        error: err.message,
        client_id: clientId,
      });
      if (!res.headersSent) {
        res.status(500).json({ error: 'CSV generation failed' });
      }
    });

    // Pipe CSV stringifier to response and write rows
    stringifier.pipe(res);
    result.rows.forEach((row) => {
      stringifier.write(row);
    });
    stringifier.end();

    logger.info({
      action: 'csv_export_completed',
      client_id: clientId,
      filters: { site_id, employee_id, date_from, date_to },
      row_count: result.rows.length,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
