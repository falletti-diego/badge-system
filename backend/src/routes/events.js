/**
 * Event Request Routes (Eventi/Training)
 * POST /api/v1/events/request — Create event request
 * GET /api/v1/events/pending — Get pending requests for approval
 * PUT /api/v1/events/:id/approve — Approve or reject event request
 * GET /api/v1/events/my-requests — Get employee's own requests
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/pool');
const { createValidationMiddleware, PostEventRequestSchema, ApproveEventRequestSchema, GetApprovedEventsSchema, GetMyEventRequestsSchema } = require('../middleware/validation');
const { logAudit } = require('../middleware/audit');
const { withTransaction } = require('../middleware/db-transaction');
const { requireAuth } = require('../middleware/auth');
const { invalidateSignatureIfExists } = require('../utils/timesheetSignature');
const { isAdminEquivalent } = require('../utils/roles');
const {
  lockEventConflictScope, findConflictingCheckin, findConflictingSmartWorking,
  findConflictingLeaveRange, findConflictingIllnessRange,
} = require('../utils/eventConflict');
const { NotFoundError, ValidationError, ForbiddenError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');

const router = express.Router();

// =====================================================
// POST /api/v1/events/request — Create event request
// =====================================================

router.post('/request', requireAuth, createValidationMiddleware(PostEventRequestSchema), async (req, res, next) => {
  const { event_date, start_time, end_time, description } = req.validated.body;
  const userId = req.user.user_id;
  const clientId = req.user.client_id;

  try {
    const result = await withTransaction(async (client) => {
      // 1. Verify user exists and belongs to this client
      const userResult = await client.query(
        'SELECT id, client_id FROM employees WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1',
        [userId, clientId]
      );

      if (userResult.rows.length === 0) {
        throw new NotFoundError('User not found or not assigned to your organization', 'USER_NOT_FOUND');
      }

      // 2. Conflict check: block if the employee already has any presence/absence
      // record for this date (checkin, pending/approved leave, active illness,
      // smart-working day, or another pending/approved event request).
      await lockEventConflictScope(client, { clientId, employeeId: userId, date: event_date });
      const conflictResult = await client.query(
        `SELECT 1 FROM checkins WHERE employee_id = $1::uuid AND timestamp::date = $2::date
         UNION ALL
         SELECT 1 FROM leave_requests WHERE user_id = $1::uuid AND status IN ('PENDING', 'APPROVED')
           AND $2::date BETWEEN start_date AND end_date
         UNION ALL
         SELECT 1 FROM illnesses WHERE employee_id = $1::uuid AND cancelled_at IS NULL
           AND $2::date BETWEEN start_date AND end_date
         UNION ALL
         SELECT 1 FROM smart_working_days WHERE employee_id = $1::uuid AND date = $2::date
         UNION ALL
         SELECT 1 FROM event_requests WHERE user_id = $1::uuid AND status IN ('PENDING', 'APPROVED')
           AND event_date = $2::date
         LIMIT 1`,
        [userId, event_date]
      );

      if (conflictResult.rows.length > 0) {
        throw new ConflictError('Esiste già una presenza o un\'assenza registrata per questa data', 'EVENT_DATE_CONFLICT');
      }

      // 3. Create event request
      const requestId = uuidv4();
      const insertResult = await client.query(
        `INSERT INTO event_requests
         (id, client_id, user_id, event_date, start_time, end_time, description, status, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5::time, $6::time, $7, 'PENDING', NOW(), NOW())
         RETURNING id, client_id, user_id, event_date::text AS event_date, start_time, end_time,
                   description, status, approved_by, approved_at, rejection_reason, created_at, updated_at`,
        [requestId, clientId, userId, event_date, start_time, end_time, description]
      );

      const eventRequest = insertResult.rows[0];

      // 4. Log audit trail
      await logAudit(client, {
        action: 'event_request_created',
        entity: 'event_request',
        entityId: eventRequest.id,
        clientId,
        oldValue: null,
        newValue: { event_date, start_time, end_time, description, status: 'PENDING' },
        userId,
      });

      return eventRequest;
    });

    logger.info({
      action: 'event_request_created',
      event_request_id: result.id,
      user_id: userId,
      event_date,
    });

    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// GET /api/v1/events/pending — Get pending requests (manager approves employees, admin approves all)
// =====================================================

router.get('/pending', requireAuth, async (req, res, next) => {
  const userId = req.user.user_id;
  const clientId = req.user.client_id;
  const role = req.user.role;
  const siteId = req.user.site_id;

  try {
    let query = `
      SELECT
        r.id, r.client_id, r.user_id, r.event_date::text AS event_date, r.start_time, r.end_time,
        r.description, r.status, r.approved_by, r.approved_at, r.rejection_reason,
        r.created_at, r.updated_at,
        e.name as employee_name, e.email as employee_email
      FROM event_requests r
      JOIN employees e ON r.user_id = e.id AND e.active = true
      WHERE r.status = 'PENDING' AND r.client_id = $1::uuid
    `;

    const params = [clientId];

    if (isAdminEquivalent(role)) {
      // No additional filter.
    } else if (role === 'manager' && siteId) {
      query += ' AND $2::uuid = ANY(e.assigned_sites)';
      params.push(siteId);
    } else {
      throw new ForbiddenError('You do not have permission to view pending event requests', 'FORBIDDEN');
    }

    query += ' ORDER BY r.created_at DESC LIMIT 100';

    const result = await pool.query(query, params);

    logger.info({
      action: 'pending_events_viewed',
      user_id: userId,
      role,
      count: result.rows.length,
    });

    res.status(200).json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// PUT /api/v1/events/:id/approve — Approve or reject event request
// =====================================================

router.put('/:id/approve', requireAuth, createValidationMiddleware(ApproveEventRequestSchema), async (req, res, next) => {
  const { id } = req.validated.params;
  const { status, rejection_reason } = req.validated.body;
  const userId = req.user.user_id;
  const clientId = req.user.client_id;
  const role = req.user.role;
  const siteId = req.user.site_id;

  try {
    if (!isAdminEquivalent(role) && !(role === 'manager' && siteId)) {
      throw new ForbiddenError('You do not have permission to approve event requests', 'FORBIDDEN');
    }

    const result = await withTransaction(async (client) => {
      const eventResult = await client.query(
        `SELECT id, client_id, user_id, event_date::text AS event_date, start_time, end_time,
                description, status, approved_by, approved_at, rejection_reason, created_at, updated_at
         FROM event_requests WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1`,
        [id, clientId]
      );

      if (eventResult.rows.length === 0) {
        throw new NotFoundError('Event request not found', 'EVENT_REQUEST_NOT_FOUND');
      }

      const eventRequest = eventResult.rows[0];

      if (role === 'manager') {
        const employeeResult = await client.query(
          'SELECT assigned_sites FROM employees WHERE id = $1::uuid LIMIT 1',
          [eventRequest.user_id]
        );

        if (employeeResult.rows.length === 0) {
          throw new NotFoundError('Employee not found', 'EMPLOYEE_NOT_FOUND');
        }

        const employeeAssignedSites = employeeResult.rows[0].assigned_sites || [];
        if (!employeeAssignedSites.includes(siteId)) {
          logger.warn({
            action: 'event_approval_unauthorized',
            approver_id: userId,
            approver_site: siteId,
            employee_assigned_sites: employeeAssignedSites,
          });
          throw new ForbiddenError('You can only approve requests for employees in your store', 'FORBIDDEN');
        }
      }

      if (eventRequest.status !== 'PENDING') {
        throw new ValidationError('Event request has already been processed', { code: 'ALREADY_PROCESSED' });
      }

      if (status === 'APPROVED') {
        await lockEventConflictScope(client, { clientId, employeeId: eventRequest.user_id, date: eventRequest.event_date });
        const conflictingCheckin = await findConflictingCheckin(client, { clientId, employeeId: eventRequest.user_id, date: eventRequest.event_date });
        if (conflictingCheckin) {
          throw new ConflictError(
            'Impossibile approvare: esiste già un check-in registrato per questa data',
            'EVENT_DATE_CONFLICT',
            {
              conflicting_checkin_id: conflictingCheckin.id,
              conflicting_checkin_timestamp: conflictingCheckin.timestamp,
              conflicting_checkin_type: conflictingCheckin.type,
            }
          );
        }

        const conflictingSmartWorking = await findConflictingSmartWorking(client, { clientId, employeeId: eventRequest.user_id, date: eventRequest.event_date });
        if (conflictingSmartWorking) {
          throw new ConflictError(
            'Impossibile approvare: il dipendente ha già dichiarato Smart Working per questa data',
            'EVENT_DATE_CONFLICT',
            { conflicting_smart_working_id: conflictingSmartWorking.id }
          );
        }

        // Design spec 2026-08-25: mutua esclusione Evento/Ferie/Malattia —
        // un evento è sempre un giorno singolo, quindi startDate === endDate.
        const conflictingLeaves = await findConflictingLeaveRange(client, {
          clientId, employeeId: eventRequest.user_id, startDate: eventRequest.event_date, endDate: eventRequest.event_date,
        });
        if (conflictingLeaves.length > 0) {
          throw new ConflictError(
            'Impossibile approvare: esiste già una ferie per questa data',
            'EVENT_DATE_CONFLICT'
          );
        }

        const conflictingIllnesses = await findConflictingIllnessRange(client, {
          clientId, employeeId: eventRequest.user_id, startDate: eventRequest.event_date, endDate: eventRequest.event_date,
        });
        if (conflictingIllnesses.length > 0) {
          throw new ConflictError(
            'Impossibile approvare: il dipendente ha già comunicato una malattia per questa data',
            'EVENT_DATE_CONFLICT'
          );
        }
      }

      const updateResult = await client.query(
        `UPDATE event_requests
         SET status = $1, approved_by = $2::uuid, approved_at = NOW(), rejection_reason = $3, updated_at = NOW()
         WHERE id = $4::uuid AND status = 'PENDING'
         RETURNING id, client_id, user_id, event_date::text AS event_date, start_time, end_time,
                   description, status, approved_by, approved_at, rejection_reason, created_at, updated_at`,
        [status, userId, rejection_reason || null, id]
      );

      if (updateResult.rows.length === 0) {
        throw new ValidationError('Event request has already been processed', { code: 'ALREADY_PROCESSED' });
      }

      const updatedEvent = updateResult.rows[0];

      // Approving an event changes ore_totali/buoni_pasto for that month
      // exactly like a checkin correction does (see buildEventDailyEntries
      // in presences.js) — invalidate any already-signed timesheet for that
      // month so it doesn't silently go stale, same as checkins.js does for
      // corrections. Unconditional + only on APPROVED: rejecting a request
      // never changes computed hours, and the call is a safe no-op if
      // nothing is signed for that month.
      if (status === 'APPROVED') {
        // updatedEvent.event_date is ::text-cast in the RETURNING clause above
        // (a plain 'YYYY-MM-DD' string), so it's already safe to pass straight
        // through to invalidateSignatureIfExists's UTC-based month/year math —
        // no local-vs-UTC ambiguity, same convention presences.js already uses.
        await invalidateSignatureIfExists(client, updatedEvent.user_id, updatedEvent.event_date);
      }

      await logAudit(client, {
        action: 'event_request_approved',
        entity: 'event_request',
        entityId: updatedEvent.id,
        clientId,
        oldValue: { status: 'PENDING', approved_by: null, approved_at: null },
        newValue: {
          status,
          approved_by: userId,
          approved_at: updatedEvent.approved_at,
          rejection_reason: rejection_reason || null,
        },
        userId,
      });

      return updatedEvent;
    });

    logger.info({
      action: 'event_request_approved',
      event_request_id: result.id,
      approver_id: userId,
      status,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// GET /api/v1/events/my-requests — Get employee's own event requests
// =====================================================

router.get('/my-requests', requireAuth, createValidationMiddleware(GetMyEventRequestsSchema), async (req, res, next) => {
  const { date_from, date_to } = req.validated.query;
  const userId = req.user.user_id;
  const clientId = req.user.client_id;

  try {
    const params = [userId, clientId];
    let query = `SELECT id, client_id, user_id, event_date::text AS event_date, start_time, end_time,
              description, status, approved_by, approved_at, rejection_reason, created_at, updated_at
       FROM event_requests
       WHERE user_id = $1::uuid AND client_id = $2::uuid`;

    if (date_from) {
      params.push(date_from);
      query += ` AND event_date >= $${params.length}::date`;
    }
    if (date_to) {
      params.push(date_to);
      query += ` AND event_date <= $${params.length}::date`;
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await pool.query(query, params);

    logger.info({
      action: 'my_events_viewed',
      user_id: userId,
      count: result.rows.length,
    });

    res.status(200).json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// GET /api/v1/events/approved — Approved events for the dashboard presences view
// Employee is self-scoped like presences.js's /my-summary (not /summary,
// which forbids the employee role outright). Manager scoping mirrors
// /summary's own events sub-query: employees assigned to their site
// (assigned_sites, not employees.site_id — see the assigned_sites fix
// elsewhere in this file for why site_id alone is unreliable). Admin/viewer
// see everything client-wide, with optional site_id/employee_id filters.
// =====================================================

router.get('/approved', requireAuth, createValidationMiddleware(GetApprovedEventsSchema), async (req, res, next) => {
  const { site_id, employee_id, date_from, date_to } = req.validated.query;
  const clientId = req.user.client_id;
  const role = req.user.role;
  const userSiteId = req.user.site_id;
  const userEmployeeId = req.user.employee_id;

  try {
    const params = [clientId];
    let query = `
      SELECT er.id, er.user_id, er.event_date::text AS event_date, er.start_time, er.end_time,
             er.description, e.name AS employee_name
      FROM event_requests er
      JOIN employees e ON e.id = er.user_id AND e.active = true
      WHERE er.client_id = $1::uuid AND er.status = 'APPROVED'
    `;

    if (role === 'employee') {
      if (!userEmployeeId) {
        throw new ForbiddenError('Your account has no employee profile — cannot access this endpoint', 'NO_EMPLOYEE_PROFILE');
      }
      if (employee_id && employee_id !== userEmployeeId) {
        throw new ForbiddenError('You can only access your own data', 'FORBIDDEN_EMPLOYEE');
      }
      params.push(userEmployeeId);
      query += ` AND er.user_id = $${params.length}::uuid`;
    } else if (role === 'manager') {
      if (!userSiteId) {
        throw new ForbiddenError('Manager has no assigned site', 'NO_SITE_ASSIGNED');
      }
      if (site_id && site_id !== userSiteId) {
        throw new ForbiddenError('You can only access data for your assigned site', 'FORBIDDEN_SITE');
      }
      params.push(userSiteId);
      query += ` AND $${params.length}::uuid = ANY(e.assigned_sites)`;
      if (employee_id) {
        params.push(employee_id);
        query += ` AND er.user_id = $${params.length}::uuid`;
      }
    } else if (role === 'admin' || role === 'viewer') {
      if (site_id) {
        params.push(site_id);
        query += ` AND $${params.length}::uuid = ANY(e.assigned_sites)`;
      }
      if (employee_id) {
        params.push(employee_id);
        query += ` AND er.user_id = $${params.length}::uuid`;
      }
    } else {
      throw new ForbiddenError(`Unauthorized role: ${role}`, 'UNAUTHORIZED_ROLE');
    }

    if (date_from) {
      params.push(date_from);
      query += ` AND er.event_date >= $${params.length}::date`;
    }
    if (date_to) {
      params.push(date_to);
      query += ` AND er.event_date <= $${params.length}::date`;
    }

    query += ' ORDER BY er.event_date DESC LIMIT 500';

    const result = await pool.query(query, params);

    res.status(200).json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
