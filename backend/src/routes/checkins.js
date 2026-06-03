/**
 * Check-ins Routes
 * POST /api/checkins - Create check-in
 * GET /api/checkins - List check-ins (with filters)
 * PUT /api/checkins/:id - Correct check-in (within 15 min window)
 */

const express = require('express');
const pino = require('pino');
const { pool } = require('../db/pool');
const { createValidationMiddleware, PostCheckinSchema, GetCheckinsSchema, PutCheckinSchema, GetStatsSchema } = require('../middleware/validation');
const { logAudit } = require('../middleware/audit');
const { withTransaction } = require('../middleware/db-transaction');
const { requireAuth } = require('../middleware/auth');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { deleteCacheByPattern } = require('../db/redis');

const router = express.Router();
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// =====================================================
// POST /api/checkins — Create check-in
// =====================================================

router.post('/', requireAuth, createValidationMiddleware(PostCheckinSchema), async (req, res, next) => {
  const { employee_id, site_id, type } = req.validated.body;
  const clientId = req.user.client_id;

  try {
    const result = await withTransaction(async (client) => {
      // 1. Verify employee exists and belongs to authenticated client
      const employeeResult = await client.query(
        'SELECT id, client_id FROM employees WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1',
        [employee_id, clientId]
      );

      if (employeeResult.rows.length === 0) {
        throw new NotFoundError('Employee not found or not assigned to your organization', 'EMPLOYEE_NOT_FOUND');
      }

      // 2. Verify site exists
      const siteResult = await client.query(
        'SELECT id FROM sites WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1',
        [site_id, clientId]
      );

      if (siteResult.rows.length === 0) {
        throw new NotFoundError('Site not found or not assigned to your organization', 'SITE_NOT_FOUND');
      }

      // 3. Verify employee is assigned to site
      const assignmentResult = await client.query(
        `SELECT 1 FROM employees
         WHERE id = $1::uuid AND $2::uuid = ANY(assigned_sites)`,
        [employee_id, site_id]
      );

      if (assignmentResult.rows.length === 0) {
        throw new ValidationError('Employee is not assigned to this site', {
          field: 'employee_id',
          code: 'NOT_ASSIGNED_TO_SITE',
        });
      }

      // 4. Create check-in
      const checkinResult = await client.query(
        `INSERT INTO checkins (
          employee_id, site_id, client_id, type, timestamp, created_by, created_at
        ) VALUES ($1, $2, $3, $4, NOW(), $5, NOW())
        RETURNING id, employee_id, site_id, type, timestamp, created_at`,
        [employee_id, site_id, clientId, type, req.user.user_id]
      );

      const checkin = checkinResult.rows[0];

      // 5. Log audit trail
      await logAudit(client, {
        action: 'checkin_created',
        entity: 'checkin',
        entityId: checkin.id,
        clientId,
        oldValue: null,
        newValue: {
          employee_id,
          site_id,
          type,
          timestamp: checkin.timestamp,
        },
        userId: req.user.user_id,
      });

      return checkin;
    });

    logger.info({
      action: 'checkin_created',
      checkin_id: result.id,
      employee_id,
      site_id,
      type,
    });

    // Invalidate cache for this client's checkins
    deleteCacheByPattern(`cache:api:checkins:client:${clientId}:*`).catch((err) => {
      logger.warn({
        action: 'cache_invalidation_error',
        error: err.message,
      });
    });

    res.status(201).json({
      data: result,
      message: 'Check-in created successfully',
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// GET /api/checkins — List check-ins with filters
// =====================================================

router.get('/', requireAuth, createValidationMiddleware(GetCheckinsSchema), async (req, res, next) => {
  const { site_id, employee_id, date_from, date_to, limit, offset } = req.validated.query;
  const clientId = req.user.client_id;

  try {
    // Build WHERE clause dynamically
    const whereClauses = ['c.client_id = $1::uuid'];
    const params = [clientId];
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
      client_id: clientId,
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
// GET /api/checkins/stats — Dashboard KPI statistics
// =====================================================

router.get('/stats', requireAuth, createValidationMiddleware(GetStatsSchema), async (req, res, next) => {
  const { site_id, employee_id, date_from, date_to } = req.validated.query;
  const clientId = req.user.client_id;

  try {
    // Build WHERE clause
    const whereClauses = ['c.client_id = $1::uuid'];
    const params = [clientId];
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

    const whereClause = whereClauses.join(' AND ');

    // Query statistics
    const statsQuery = `
      SELECT
        COUNT(*) as total_checkins,
        COUNT(DISTINCT employee_id) as unique_employees,
        COUNT(CASE WHEN type = 'IN' THEN 1 END) as checkins_in,
        COUNT(CASE WHEN type = 'OUT' THEN 1 END) as checkins_out
      FROM checkins c
      WHERE ${whereClause}
    `;

    const statsResult = await pool.query(statsQuery, params);
    const stats = statsResult.rows[0];

    logger.info({
      action: 'get_stats',
      client_id: clientId,
      filters: { site_id, employee_id, date_from, date_to },
      total_checkins: stats.total_checkins,
    });

    res.json({
      data: {
        total_checkins: parseInt(stats.total_checkins, 10),
        unique_employees: parseInt(stats.unique_employees, 10),
        checkin_types: {
          IN: parseInt(stats.checkins_in, 10),
          OUT: parseInt(stats.checkins_out, 10),
        },
        date_range: {
          from: date_from || 'all-time',
          to: date_to || 'all-time',
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// PUT /api/checkins/:id — Correct check-in (within 15 min)
// =====================================================

router.put('/:id', requireAuth, createValidationMiddleware(PutCheckinSchema), async (req, res, next) => {
  const { id } = req.validated.params;
  const { type: newType } = req.validated.body;
  const clientId = req.user.client_id;

  try {
    const result = await withTransaction(async (client) => {
      // 1. Find check-in and verify ownership
      const checkinResult = await client.query(
        `SELECT id, employee_id, site_id, client_id, type, timestamp
         FROM checkins WHERE id = $1::uuid AND client_id = $2::uuid`,
        [id, clientId]
      );

      if (checkinResult.rows.length === 0) {
        throw new NotFoundError('Check-in not found or not assigned to your organization', 'CHECKIN_NOT_FOUND');
      }

      const checkin = checkinResult.rows[0];
      const oldType = checkin.type;

      // 2. Verify within 15-minute window
      const now = new Date();
      const createdAt = new Date(checkin.timestamp);
      const diffMinutes = (now - createdAt) / (1000 * 60);

      if (diffMinutes > 15) {
        throw new ValidationError(
          `Cannot modify check-in: outside 15-minute correction window (${Math.floor(diffMinutes)} minutes old)`,
          { field: 'checkin_id', code: 'CORRECTION_WINDOW_EXPIRED' }
        );
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
        [newType, req.user.user_id, id]
      );

      const updated = updateResult.rows[0];

      // 5. Log audit trail
      await logAudit(client, {
        action: 'checkin_corrected',
        entity: 'checkin',
        entityId: id,
        clientId: checkin.client_id,
        oldValue: {
          type: oldType,
        },
        newValue: {
          type: newType,
          modified_at: updated.modified_at,
        },
        userId: req.user.user_id,
      });

      return { updated, oldType };
    });

    const { updated, oldType } = result;

    logger.info({
      action: 'checkin_corrected',
      checkin_id: updated.id,
      old_type: oldType,
    });

    // Invalidate cache for this client's checkins
    deleteCacheByPattern(`cache:api:checkins:client:${clientId}:*`).catch((err) => {
      logger.warn({
        action: 'cache_invalidation_error',
        error: err.message,
      });
    });

    res.json({
      data: updated,
      message: 'Check-in corrected successfully',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
