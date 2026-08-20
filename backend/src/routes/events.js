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
const { createValidationMiddleware, PostEventRequestSchema, ApproveEventRequestSchema } = require('../middleware/validation');
const { logAudit } = require('../middleware/audit');
const { withTransaction } = require('../middleware/db-transaction');
const { requireAuth } = require('../middleware/auth');
const { invalidateSignatureIfExists } = require('../utils/timesheetSignature');
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
        throw new ConflictError('A presence or absence is already recorded for this date', 'EVENT_DATE_CONFLICT');
      }

      // 3. Create event request
      const requestId = uuidv4();
      const insertResult = await client.query(
        `INSERT INTO event_requests
         (id, client_id, user_id, event_date, start_time, end_time, description, status, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5::time, $6::time, $7, 'PENDING', NOW(), NOW())
         RETURNING *`,
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
        r.id, r.client_id, r.user_id, r.event_date, r.start_time, r.end_time,
        r.description, r.status, r.approved_by, r.approved_at, r.rejection_reason,
        r.created_at, r.updated_at,
        e.name as employee_name, e.email as employee_email
      FROM event_requests r
      JOIN employees e ON r.user_id = e.id AND e.active = true
      WHERE r.status = 'PENDING' AND r.client_id = $1::uuid
    `;

    const params = [clientId];

    if (role === 'admin') {
      // No additional filter.
    } else if (role === 'manager' && siteId) {
      query += ' AND e.site_id = $2::uuid';
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
    if (role !== 'admin' && !(role === 'manager' && siteId)) {
      throw new ForbiddenError('You do not have permission to approve event requests', 'FORBIDDEN');
    }

    const result = await withTransaction(async (client) => {
      const eventResult = await client.query(
        'SELECT * FROM event_requests WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1',
        [id, clientId]
      );

      if (eventResult.rows.length === 0) {
        throw new NotFoundError('Event request not found', 'EVENT_REQUEST_NOT_FOUND');
      }

      const eventRequest = eventResult.rows[0];

      if (role === 'manager') {
        const employeeResult = await client.query(
          'SELECT site_id FROM employees WHERE id = $1::uuid LIMIT 1',
          [eventRequest.user_id]
        );

        if (employeeResult.rows.length === 0) {
          throw new NotFoundError('Employee not found', 'EMPLOYEE_NOT_FOUND');
        }

        if (employeeResult.rows[0].site_id !== siteId) {
          logger.warn({
            action: 'event_approval_unauthorized',
            approver_id: userId,
            approver_site: siteId,
            employee_site: employeeResult.rows[0].site_id,
          });
          throw new ForbiddenError('You can only approve requests for employees in your store', 'FORBIDDEN');
        }
      }

      if (eventRequest.status !== 'PENDING') {
        throw new ValidationError('Event request has already been processed', { code: 'ALREADY_PROCESSED' });
      }

      const updateResult = await client.query(
        `UPDATE event_requests
         SET status = $1, approved_by = $2::uuid, approved_at = NOW(), rejection_reason = $3, updated_at = NOW()
         WHERE id = $4::uuid AND status = 'PENDING'
         RETURNING *`,
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
        // updatedEvent.event_date (a DATE column) is parsed by pg into a JS
        // Date at LOCAL midnight of that calendar day, not UTC midnight —
        // invalidateSignatureIfExists does UTC-based month/year math, so
        // reading it back with UTC getters would misattribute the 1st of a
        // month to the previous month under any non-UTC server timezone
        // (verified: Europe/Rome parses '2026-06-01' to 2026-05-31T22:00Z).
        // Local getters correctly invert the local-midnight construction
        // regardless of server timezone — same fix as presences.js already
        // applies via an explicit ::text cast in SQL, done here in JS since
        // this value only needs to be re-threaded through invalidateSignatureIfExists.
        const ed = updatedEvent.event_date;
        const eventDateText = ed instanceof Date
          ? `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')}`
          : String(ed).slice(0, 10);
        await invalidateSignatureIfExists(client, updatedEvent.user_id, eventDateText);
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

router.get('/my-requests', requireAuth, async (req, res, next) => {
  const userId = req.user.user_id;
  const clientId = req.user.client_id;

  try {
    const result = await pool.query(
      `SELECT *
       FROM event_requests
       WHERE user_id = $1::uuid AND client_id = $2::uuid
       ORDER BY created_at DESC LIMIT 100`,
      [userId, clientId]
    );

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

module.exports = router;
