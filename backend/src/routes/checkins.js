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

// Helper: resolve employee/site ID from name OR UUID, scoped to client
async function resolveEmployeeId(nameOrId, clientId) {
  if (!nameOrId) return undefined;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(nameOrId)) return nameOrId;
  const result = await pool.query(
    'SELECT id FROM employees WHERE name = $1 AND client_id = $2::uuid LIMIT 1',
    [nameOrId, clientId]
  );
  return result.rows[0]?.id;
}

async function resolveSiteId(nameOrId, clientId) {
  if (!nameOrId) return undefined;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(nameOrId)) return nameOrId;
  const result = await pool.query(
    'SELECT id FROM sites WHERE name = $1 AND client_id = $2::uuid LIMIT 1',
    [nameOrId, clientId]
  );
  return result.rows[0]?.id;
}

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
      // Use employee_id as created_by: mock user IDs are non-UUID strings,
      // but employee_id is always a valid UUID for self check-ins.
      const checkinResult = await client.query(
        `INSERT INTO checkins (
          employee_id, site_id, client_id, type, timestamp, created_by, created_at
        ) VALUES ($1, $2, $3, $4, NOW(), $5, NOW())
        RETURNING id, employee_id, site_id, type, timestamp, created_at`,
        [employee_id, site_id, clientId, type, employee_id]
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
  const userRole = req.user.role;
  const userEmployeeId = req.user.employee_id;
  const userSiteId = req.user.site_id;

  try {
    // Resolve IDs from names if needed — always scoped to caller's client
    const resolvedSiteId = site_id ? await resolveSiteId(site_id, clientId) : undefined;
    const resolvedEmployeeId = employee_id ? await resolveEmployeeId(employee_id, clientId) : undefined;

    // Build WHERE clause dynamically — client_id is mandatory and always first
    const whereClauses = [];
    const params = [];
    let paramCount = 0;

    // Mandatory tenant isolation — never removed
    paramCount++;
    whereClauses.push(`c.client_id = $${paramCount}::uuid`);
    params.push(clientId);

    // IMPORTANT: If user is an employee, they can only see their own checkins
    if (userRole === 'employee' && userEmployeeId) {
      paramCount++;
      whereClauses.push(`c.employee_id = $${paramCount}::uuid`);
      params.push(userEmployeeId);
    }

    // IMPORTANT: If user is a manager assigned to a specific store, filter by that store
    if (userRole === 'manager' && userSiteId) {
      paramCount++;
      whereClauses.push(`c.site_id = $${paramCount}::uuid`);
      params.push(userSiteId);
    }

    if (resolvedSiteId) {
      paramCount++;
      whereClauses.push(`c.site_id = $${paramCount}::uuid`);
      params.push(resolvedSiteId);
    }

    if (resolvedEmployeeId) {
      paramCount++;
      whereClauses.push(`c.employee_id = $${paramCount}::uuid`);
      params.push(resolvedEmployeeId);
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

    const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

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
        c.modified_by_name,
        c.correction_note,
        e.name as employee_name,
        e.email as employee_email,
        s.name as site_name
      FROM checkins c
      LEFT JOIN employees e ON c.employee_id = e.id
      LEFT JOIN sites s ON c.site_id = s.id
      ${whereClause}
      ORDER BY c.timestamp DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const result = await pool.query(query, params);

    // Get total count (without pagination)
    const countQuery = `
      SELECT COUNT(*) as total FROM checkins c
      ${whereClause}
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
  const userRole = req.user.role;
  const userEmployeeId = req.user.employee_id;
  const userSiteId = req.user.site_id;

  try {
    // Resolve IDs from names if needed — always scoped to caller's client
    const resolvedSiteId = site_id ? await resolveSiteId(site_id, clientId) : undefined;
    const resolvedEmployeeId = employee_id ? await resolveEmployeeId(employee_id, clientId) : undefined;

    // Build WHERE clause — client_id is mandatory and always first
    const whereClauses = [];
    const params = [];
    let paramCount = 0;

    // Mandatory tenant isolation — never removed
    paramCount++;
    whereClauses.push(`c.client_id = $${paramCount}::uuid`);
    params.push(clientId);

    // IMPORTANT: If user is an employee, they can only see their own stats
    if (userRole === 'employee' && userEmployeeId) {
      paramCount++;
      whereClauses.push(`c.employee_id = $${paramCount}::uuid`);
      params.push(userEmployeeId);
    }

    // IMPORTANT: If user is a manager assigned to a specific store, filter by that store
    if (userRole === 'manager' && userSiteId) {
      paramCount++;
      whereClauses.push(`c.site_id = $${paramCount}::uuid`);
      params.push(userSiteId);
    }

    if (resolvedSiteId) {
      paramCount++;
      whereClauses.push(`c.site_id = $${paramCount}::uuid`);
      params.push(resolvedSiteId);
    }

    if (resolvedEmployeeId) {
      paramCount++;
      whereClauses.push(`c.employee_id = $${paramCount}::uuid`);
      params.push(resolvedEmployeeId);
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

    // Query statistics
    const statsQuery = `
      SELECT
        COUNT(*) as total_checkins,
        COUNT(DISTINCT employee_id) as unique_employees,
        COUNT(CASE WHEN type = 'IN' THEN 1 END) as checkins_in,
        COUNT(CASE WHEN type = 'OUT' THEN 1 END) as checkins_out
      FROM checkins c
      ${whereClause}
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
// PUT /api/checkins/:id — Correct check-in (within 7 days)
// =====================================================

router.put('/:id', requireAuth, createValidationMiddleware(PutCheckinSchema), async (req, res, next) => {
  const { id } = req.validated.params;
  const { type: newType, timestamp: newTimestamp, correction_note } = req.validated.body;
  const clientId = req.user.client_id;
  const correctorName = req.user.name || req.user.email || req.user.user_id;

  try {
    const result = await withTransaction(async (client) => {
      // 1. Find check-in and verify ownership via employee.client_id
      const checkinResult = await client.query(
        `SELECT c.id, c.employee_id, c.site_id, c.type, c.timestamp
         FROM checkins c
         JOIN employees e ON c.employee_id = e.id
         WHERE c.id = $1::uuid AND e.client_id = $2::uuid`,
        [id, clientId]
      );

      if (checkinResult.rows.length === 0) {
        throw new NotFoundError('Check-in not found or not assigned to your organization', 'CHECKIN_NOT_FOUND');
      }

      const checkin = checkinResult.rows[0];

      // 2a. Manager can only edit check-ins for their own site
      const userSiteId = req.user.site_id;
      if (req.user.role === 'manager' && userSiteId && checkin.site_id !== userSiteId) {
        throw new NotFoundError('Check-in not found or not assigned to your organization', 'CHECKIN_NOT_FOUND');
      }

      // 2. Verify within 7-day correction window
      const now = new Date();
      const checkinDate = new Date(checkin.timestamp);
      const diffDays = (now - checkinDate) / (1000 * 60 * 60 * 24);

      if (diffDays > 7) {
        throw new ValidationError(
          `Cannot modify check-in: outside 7-day correction window (${Math.floor(diffDays)} days old)`,
          { field: 'checkin_id', code: 'CORRECTION_WINDOW_EXPIRED' }
        );
      }

      // 3. Build dynamic SET clause — only update provided fields
      const oldValues = { type: checkin.type, timestamp: checkin.timestamp };
      const setClauses = ['modified_at = NOW()', 'modified_by_name = $1'];
      const updateParams = [correctorName];
      let paramIdx = 2;

      if (newType !== undefined && newType !== checkin.type) {
        setClauses.push(`type = $${paramIdx++}`);
        updateParams.push(newType);
      }

      if (newTimestamp !== undefined) {
        setClauses.push(`timestamp = $${paramIdx++}`);
        updateParams.push(new Date(newTimestamp));
      }

      if (correction_note !== undefined) {
        setClauses.push(`correction_note = $${paramIdx++}`);
        updateParams.push(correction_note);
      }

      updateParams.push(id); // last param: WHERE id = $N
      const whereParam = paramIdx;

      const updateResult = await client.query(
        `UPDATE checkins
         SET ${setClauses.join(', ')}
         WHERE id = $${whereParam}::uuid
         RETURNING id, employee_id, site_id, type, timestamp, modified_at, modified_by_name, correction_note`,
        updateParams
      );

      const updated = updateResult.rows[0];

      // 4. Log audit trail
      const newValues = { type: updated.type, timestamp: updated.timestamp };
      if (correction_note) newValues.correction_note = correction_note;

      await logAudit(client, {
        action: 'checkin_corrected',
        entity: 'checkin',
        entityId: id,
        clientId: clientId,
        oldValue: oldValues,
        newValue: { ...newValues, modified_by: correctorName },
        userId: req.user.user_id,
      });

      return { updated, oldValues };
    });

    const { updated, oldValues } = result;

    logger.info({
      action: 'checkin_corrected',
      checkin_id: updated.id,
      corrector: correctorName,
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
