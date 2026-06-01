/**
 * Check-ins Routes
 * POST /api/checkins - Create check-in
 * GET /api/checkins - List check-ins (with filters)
 * PUT /api/checkins/:id - Correct check-in (within 15 min window)
 */

const express = require('express');
const pino = require('pino');
const { pool } = require('../db/pool');
const { createValidationMiddleware, PostCheckinSchema, GetCheckinsSchema, PutCheckinSchema } = require('../middleware/validation');
const { logAudit } = require('../middleware/audit');
const { withTransaction } = require('../middleware/db-transaction');

const router = express.Router();
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// =====================================================
// POST /api/checkins — Create check-in
// =====================================================

router.post('/', createValidationMiddleware(PostCheckinSchema), async (req, res, next) => {
  const { employee_id, site_id, type } = req.validated.body;

  try {
    const result = await withTransaction(async (client) => {
      // 1. Verify employee exists
      const employeeResult = await client.query(
        'SELECT id, client_id FROM employees WHERE id = $1::uuid LIMIT 1',
        [employee_id]
      );

      if (employeeResult.rows.length === 0) {
        const err = new Error('Employee not found');
        err.statusCode = 404;
        throw err;
      }

      const clientId = employeeResult.rows[0].client_id;

      // 2. Verify site exists
      const siteResult = await client.query(
        'SELECT id FROM sites WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1',
        [site_id, clientId]
      );

      if (siteResult.rows.length === 0) {
        const err = new Error('Site not found or not assigned to client');
        err.statusCode = 404;
        throw err;
      }

      // 3. Verify employee is assigned to site
      const assignmentResult = await client.query(
        `SELECT 1 FROM employees
         WHERE id = $1::uuid AND $2::uuid = ANY(assigned_sites)`,
        [employee_id, site_id]
      );

      if (assignmentResult.rows.length === 0) {
        const err = new Error('Employee is not assigned to this site');
        err.statusCode = 400;
        throw err;
      }

      // 4. Create check-in
      const checkinResult = await client.query(
        `INSERT INTO checkins (
          employee_id, site_id, client_id, type, timestamp, created_by, created_at
        ) VALUES ($1, $2, $3, $4, NOW(), $5, NOW())
        RETURNING id, employee_id, site_id, type, timestamp, created_at`,
        [employee_id, site_id, clientId, type, 'system']
      );

      const checkin = checkinResult.rows[0];

      // 5. Log audit trail
      // TODO: Fix audit log type mismatch (Phase 2)
      // await logAudit(client, {
      //   action: 'checkin_created',
      //   entityId: checkin.id,
      //   clientId,
      //   oldValue: null,
      //   newValue: {
      //     employee_id,
      //     site_id,
      //     type,
      //     timestamp: checkin.timestamp,
      //   },
      //   userId: 'system',
      // });

      return checkin;
    });

    logger.info({
      action: 'checkin_created',
      checkin_id: result.id,
      employee_id,
      site_id,
      type,
    });

    res.status(201).json({
      data: result,
      message: 'Check-in created successfully',
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        error: err.message,
      });
    }
    next(err);
  }
});

// =====================================================
// GET /api/checkins — List check-ins with filters
// =====================================================

router.get('/', createValidationMiddleware(GetCheckinsSchema), async (req, res, next) => {
  const { client_id, site_id, employee_id, date_from, date_to, limit, offset } = req.validated.query;

  try {
    // Build WHERE clause dynamically
    const whereClauses = ['c.client_id = $1::uuid'];
    const params = [client_id];
    let paramCount = 1;

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

    // Add pagination params
    paramCount++;
    params.push(limit);
    const limitParam = paramCount;

    paramCount++;
    params.push(offset);
    const offsetParam = paramCount;

    const whereClause = whereClauses.join(' AND ');

    // Query data with employee and site details
    const query = `
      SELECT
        c.id,
        c.employee_id,
        c.site_id,
        c.type,
        c.timestamp,
        c.created_at,
        c.modified_at,
        c.modified_by,
        e.name as employee_name,
        e.email as employee_email,
        s.name as site_name
      FROM checkins c
      LEFT JOIN employees e ON c.employee_id = e.id
      LEFT JOIN sites s ON c.site_id = s.id
      WHERE ${whereClause}
      ORDER BY c.timestamp DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const result = await pool.query(query, params);

    // Get total count (without pagination)
    const countQuery = `
      SELECT COUNT(*) as total FROM checkins c
      WHERE ${whereClause}
    `;
    const countParams = params.slice(0, paramCount - 2);
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total, 10);

    logger.info({
      action: 'list_checkins',
      client_id,
      filters: { site_id, employee_id, date_from, date_to },
      count: result.rows.length,
      total,
    });

    res.json({
      data: result.rows,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + limit < total,
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// PUT /api/checkins/:id — Correct check-in (within 15 min)
// =====================================================

router.put('/:id', createValidationMiddleware(PutCheckinSchema), async (req, res, next) => {
  const { id } = req.validated.params;
  const { type: newType } = req.validated.body;

  try {
    const result = await withTransaction(async (client) => {
      // 1. Find check-in
      const checkinResult = await client.query(
        `SELECT id, employee_id, site_id, client_id, type, timestamp
         FROM checkins WHERE id = $1::uuid`,
        [id]
      );

      if (checkinResult.rows.length === 0) {
        const err = new Error('Check-in not found');
        err.statusCode = 404;
        throw err;
      }

      const checkin = checkinResult.rows[0];
      const oldType = checkin.type;

      // 2. Verify within 15-minute window
      const now = new Date();
      const createdAt = new Date(checkin.timestamp);
      const diffMinutes = (now - createdAt) / (1000 * 60);

      if (diffMinutes > 15) {
        const err = new Error(`Cannot modify check-in: outside 15-minute correction window (${Math.floor(diffMinutes)} minutes old)`);
        err.statusCode = 400;
        throw err;
      }

      // 3. Skip update if type is unchanged
      if (oldType === newType) {
        return checkin;
      }

      // 4. Update check-in
      const updateResult = await client.query(
        `UPDATE checkins
         SET type = $1, modified_at = NOW(), modified_by = $2
         WHERE id = $3::uuid
         RETURNING id, employee_id, site_id, type, timestamp, modified_at, modified_by`,
        [newType, 'system', id]
      );

      const updated = updateResult.rows[0];

      // 5. Log audit trail
      // TODO: Fix audit log type mismatch (Phase 2)
      // await logAudit(client, {
      //   action: 'checkin_corrected',
      //   entityId: id,
      //   clientId: checkin.client_id,
      //   oldValue: {
      //     type: oldType,
      //   },
      //   newValue: {
      //     type: newType,
      //     modified_at: updated.modified_at,
      //   },
      //   userId: 'system',
      // });

      return updated;
    });

    logger.info({
      action: 'checkin_corrected',
      checkin_id: result.id,
      old_type: req.validated.body.type === result.type ? null : 'changed',
    });

    res.json({
      data: result,
      message: 'Check-in corrected successfully',
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        error: err.message,
      });
    }
    next(err);
  }
});

module.exports = router;
