/**
 * Check-ins Routes
 * POST /api/checkins - Create check-in
 * GET /api/checkins - List check-ins (with filters)
 * PUT /api/checkins/:id - Correct check-in (within 15 min window)
 */

const express = require('express');
const { pool } = require('../db/pool');
const { createValidationMiddleware, PostCheckinSchema, GetCheckinsSchema, PutCheckinSchema, GetStatsSchema } = require('../middleware/validation');
const { logAudit } = require('../middleware/audit');
const { withTransaction } = require('../middleware/db-transaction');
const { requireAuth } = require('../middleware/auth');
const { NotFoundError, ValidationError, ForbiddenError, GeofenceError, ConflictError } = require('../utils/errors');
const { haversineDistance } = require('../utils/geo');
const { deleteCacheByPattern } = require('../db/redis');
const { resolveEmployeeId, resolveSiteId } = require('../utils/resolvers');
const { buildScopedFilters } = require('../utils/queryScope');
const logger = require('../utils/logger');

const router = express.Router();

// =====================================================
// POST /api/checkins — Create check-in
// =====================================================

// A check-in is only ever "offline" if the client backdated it via occurred_at.
// is_offline is NEVER read from client input (security review, 2026-07-22):
// a client cannot be trusted to self-report this, since it drives an audit trail
// and a manager-facing dashboard badge — both meant to be trustworthy signals.
// OFFLINE_SYNC_THRESHOLD_MS tolerates normal request latency without flagging
// ordinary online check-ins as offline.
const OFFLINE_SYNC_THRESHOLD_MS = 60 * 1000;

router.post('/', requireAuth, createValidationMiddleware(PostCheckinSchema), async (req, res, next) => {
  const { employee_id, site_id, type, occurred_at, client_uuid } = req.validated.body;
  const clientId = req.user.client_id;
  const is_offline = occurred_at != null &&
    Math.abs(Date.now() - new Date(occurred_at).getTime()) > OFFLINE_SYNC_THRESHOLD_MS;

  try {
    // S.32.1: ownership check — only admins may create check-ins for other employees
    if (req.user.role !== 'admin') {
      if (!req.user.employee_id) {
        throw new ForbiddenError(
          'Your account has no employee profile — cannot create check-ins',
          'CHECKIN_NO_EMPLOYEE_PROFILE'
        );
      }
      if (req.user.employee_id !== employee_id) {
        logger.warn({
          action: 'checkin_ownership_violation',
          user_id: req.user.user_id,
          attempted_employee_id: employee_id,
        });
        throw new ForbiddenError('You can only create check-ins for yourself', 'CHECKIN_OWNERSHIP');
      }
    }

    const result = await withTransaction(async (client) => {
      // 1. Verify employee exists and belongs to authenticated client
      const employeeResult = await client.query(
        'SELECT id, client_id FROM employees WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1',
        [employee_id, clientId]
      );

      if (employeeResult.rows.length === 0) {
        throw new NotFoundError('Employee not found or not assigned to your organization', 'EMPLOYEE_NOT_FOUND');
      }

      // 2. Verify site exists and fetch geofence settings (JOIN clients for feature flag)
      const siteResult = await client.query(
        `SELECT s.id, s.name, s.geofence_enabled, s.latitude, s.longitude, s.geofence_radius_meters,
                c.geofencing_feature_enabled
         FROM sites s
         JOIN clients c ON c.id = s.client_id
         WHERE s.id = $1::uuid AND s.client_id = $2::uuid LIMIT 1`,
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

      // 3.5 Geofence check — ON HOLD (MVP): re-enable by setting GEOFENCING_ENABLED=true
      // Code is preserved for Phase 2 implementation.
      const site = siteResult.rows[0];
      const { latitude: checkinLat, longitude: checkinLng } = req.validated.body;
      const geofencingEnabled = process.env.GEOFENCING_ENABLED === 'true';
      if (geofencingEnabled && (site.geofencing_feature_enabled !== false) && site.geofence_enabled) {
        if (checkinLat == null || checkinLng == null || isNaN(checkinLat) || isNaN(checkinLng)) {
          throw new ValidationError('GPS coordinates required for check-in at this site', {
            code: 'GEOFENCE_COORDINATES_REQUIRED',
          });
        }
        const distance = haversineDistance(
          checkinLat, checkinLng,
          Number(site.latitude), Number(site.longitude)
        );
        if (distance > site.geofence_radius_meters) {
          throw new GeofenceError(distance, site.geofence_radius_meters);
        }
      }

      // 4. Create check-in
      // Use employee_id as created_by: mock user IDs are non-UUID strings,
      // but employee_id is always a valid UUID for self check-ins.
      // occurred_at (client-declared timestamp, offline mode) falls back to NOW() when absent.
      //
      // Idempotency via ON CONFLICT DO NOTHING (not a catch-23505 pattern): a duplicate
      // client_uuid simply inserts zero rows instead of throwing, so it never leaves the
      // transaction in Postgres's aborted state — a thrown 23505 here would poison every
      // later statement on this client (including a recovery SELECT) with a 25P02 error.
      const checkinResult = await client.query(
        `INSERT INTO checkins (
          employee_id, site_id, client_id, type, timestamp, created_by, created_at,
          checkin_latitude, checkin_longitude, client_uuid, is_offline
        ) VALUES ($1, $2, $3, $4, COALESCE($8::timestamptz, NOW()), $5, NOW(), $6, $7, $9, $10)
        ON CONFLICT (client_id, client_uuid) WHERE client_uuid IS NOT NULL DO NOTHING
        RETURNING id, employee_id, site_id, type, timestamp, created_at, is_offline`,
        [employee_id, site_id, clientId, type, employee_id,
          checkinLat != null ? checkinLat : null,
          checkinLng != null ? checkinLng : null,
          occurred_at || null,
          client_uuid || null,
          is_offline === true]
      );

      let checkin;
      let deduplicated = false;

      if (checkinResult.rows.length > 0) {
        checkin = checkinResult.rows[0];
      } else {
        // ON CONFLICT fired: this client_uuid was already synced for this tenant.
        // Scope the recovery SELECT to employee_id too — a client_uuid collision with a
        // DIFFERENT employee's check-in is a bug (idempotency keys must never be shared
        // across employees), not something to silently paper over by returning their data.
        deduplicated = true;
        const dup = await client.query(
          'SELECT id, employee_id, site_id, type, timestamp, created_at, is_offline FROM checkins WHERE client_id = $1::uuid AND client_uuid = $2::uuid AND employee_id = $3::uuid',
          [clientId, client_uuid, employee_id]
        );
        if (dup.rows.length === 0) {
          throw new ConflictError('client_uuid already used by a different employee', 'CHECKIN_UUID_COLLISION');
        }
        checkin = dup.rows[0];
      }

      checkin.site_name = site.name;

      // 5. Log audit trail (skip for a deduplicated retry: no new record was created)
      if (!deduplicated) {
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
            is_offline: checkin.is_offline === true,
          },
          userId: req.user.user_id,
        });
      }

      return { checkin, deduplicated };
    });

    const { checkin, deduplicated } = result;

    logger.info({
      action: deduplicated ? 'checkin_deduplicated' : 'checkin_created',
      checkin_id: checkin.id,
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

    if (deduplicated) {
      res.status(200).json({
        success: true,
        deduplicated: true,
        data: checkin,
        message: 'Check-in already synced',
      });
    } else {
      res.status(201).json({
        data: checkin,
        message: 'Check-in created successfully',
      });
    }
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

    const { whereClauses, params: scopeParams } = buildScopedFilters(
      req.user,
      { siteId: resolvedSiteId, employeeId: resolvedEmployeeId, dateFrom: date_from, dateTo: date_to },
      'c'
    );

    const params = [...scopeParams];
    const scopeParamCount = params.length;

    // Add pagination params
    params.push(limit);
    const limitParam = params.length;

    params.push(offset);
    const offsetParam = params.length;

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
        c.is_offline,
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
    const countParams = params.slice(0, scopeParamCount);
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

    const { whereClauses, params } = buildScopedFilters(
      req.user,
      { siteId: resolvedSiteId, employeeId: resolvedEmployeeId, dateFrom: date_from, dateTo: date_to },
      'c'
    );

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

  if (req.user.role === 'viewer' || req.user.role === 'employee') {
    return next(new ForbiddenError('Only managers and admins can correct check-ins', 'FORBIDDEN_ROLE'));
  }

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

    const { updated } = result;

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
