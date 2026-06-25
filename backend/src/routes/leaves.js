/**
 * Leave Management Routes
 * POST /api/v1/leave/request — Create leave request
 * GET /api/v1/leave/pending — Get pending requests for approval
 * PUT /api/v1/leave/:id/approve — Approve or reject leave request
 * GET /api/v1/leave/my-requests — Get employee's own requests
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/pool');
const { createValidationMiddleware, PostLeaveRequestSchema, ApproveLeaveSchema } = require('../middleware/validation');
const { logAudit } = require('../middleware/audit');
const { withTransaction } = require('../middleware/db-transaction');
const { requireAuth } = require('../middleware/auth');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const { deleteCacheByPattern } = require('../db/redis');
const logger = require('../utils/logger');

const router = express.Router();

// =====================================================
// POST /api/v1/leave/request — Create leave request
// =====================================================

router.post('/request', requireAuth, createValidationMiddleware(PostLeaveRequestSchema), async (req, res, next) => {
  const { leave_type, start_date, end_date, motivation } = req.validated.body;
  const userId = req.user.user_id;
  const clientId = req.user.client_id;

  try {
    // Ensure start_date and end_date are Date objects
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    // Calculate num_days (inclusive: from start to end inclusive)
    const timeDiff = endDate.getTime() - startDate.getTime();
    const numDays = Math.floor(timeDiff / (1000 * 60 * 60 * 24)) + 1;

    const result = await withTransaction(async (client) => {
      // 1. Verify user exists and belongs to this client
      const userResult = await client.query(
        'SELECT id, client_id FROM employees WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1',
        [userId, clientId]
      );

      if (userResult.rows.length === 0) {
        throw new NotFoundError('User not found or not assigned to your organization', 'USER_NOT_FOUND');
      }

      // 2. Check saldo if vacation (not MALATTIA)
      if (leave_type !== 'MALATTIA') {
        const year = startDate.getFullYear();
        const saldoResult = await client.query(
          `SELECT remaining_days FROM leave_saldi
           WHERE user_id = $1::uuid AND leave_type = $2 AND year = $3
           LIMIT 1`,
          [userId, leave_type, year]
        );

        if (saldoResult.rows.length === 0 || saldoResult.rows[0].remaining_days < numDays) {
          const availableDays = saldoResult.rows.length > 0 ? saldoResult.rows[0].remaining_days : 0;
          throw new ValidationError(
            `Insufficient ${leave_type} balance. Requested: ${numDays} days, Available: ${availableDays} days`,
            {
              field: 'leave_type',
              code: 'INSUFFICIENT_SALDO',
              requested_days: numDays,
              available_days: availableDays,
            }
          );
        }
      }

      // 3. Create leave request
      const requestId = uuidv4();
      const leaveResult = await client.query(
        `INSERT INTO leave_requests
         (id, client_id, user_id, leave_type, start_date, end_date, num_days, motivation, status, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::date, $6::date, $7, $8, 'PENDING', NOW(), NOW())
         RETURNING *`,
        [requestId, clientId, userId, leave_type, start_date, end_date, numDays, motivation || null]
      );

      const leaveRequest = leaveResult.rows[0];

      // 4. Log audit trail
      await logAudit(client, {
        action: 'leave_request_created',
        entity: 'leave_request',
        entityId: leaveRequest.id,
        clientId,
        oldValue: null,
        newValue: {
          leave_type,
          start_date,
          end_date,
          num_days: numDays,
          motivation,
          status: 'PENDING',
        },
        userId,
      });

      return leaveRequest;
    });

    logger.info({
      action: 'leave_request_created',
      leave_request_id: result.id,
      user_id: userId,
      leave_type,
      num_days: numDays,
    });

    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// GET /api/v1/leave/pending — Get pending requests (manager approves employees, admin approves all)
// =====================================================

router.get('/pending', requireAuth, async (req, res, next) => {
  const userId = req.user.user_id;
  const clientId = req.user.client_id;
  const role = req.user.role;
  const siteId = req.user.site_id;

  try {
    let query = `
      SELECT
        r.id, r.client_id, r.user_id, r.leave_type, r.start_date, r.end_date,
        r.num_days, r.motivation, r.certificate_url, r.status, r.approved_by,
        r.approved_at, r.rejection_reason, r.created_at, r.updated_at,
        e.name as employee_name, e.email as employee_email
      FROM leave_requests r
      JOIN employees e ON r.user_id = e.id
      WHERE r.status = 'PENDING' AND r.client_id = $1::uuid
    `;

    const params = [clientId];

    // RBAC: Admin sees all pending requests; managers only see their own store.
    if (role === 'admin') {
      // No additional filter.
    } else if (role === 'manager' && siteId) {
      query += ' AND e.site_id = $2::uuid';
      params.push(siteId);
    } else {
      throw new ForbiddenError('You do not have permission to view pending leave requests', 'FORBIDDEN');
    }

    query += ' ORDER BY r.created_at DESC LIMIT 100';

    const result = await pool.query(query, params);

    logger.info({
      action: 'pending_leaves_viewed',
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
// PUT /api/v1/leave/:id/approve — Approve or reject leave request
// =====================================================

router.put('/:id/approve', requireAuth, createValidationMiddleware(ApproveLeaveSchema), async (req, res, next) => {
  const { id } = req.validated.params;
  const { status, rejection_reason } = req.validated.body;
  const userId = req.user.user_id;
  const clientId = req.user.client_id;
  const role = req.user.role;
  const siteId = req.user.site_id;

  try {
    if (role !== 'admin' && !(role === 'manager' && siteId)) {
      throw new ForbiddenError('You do not have permission to approve leave requests', 'FORBIDDEN');
    }

    const result = await withTransaction(async (client) => {
      // 1. Fetch the leave request
      const leaveResult = await client.query(
        'SELECT * FROM leave_requests WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1',
        [id, clientId]
      );

      if (leaveResult.rows.length === 0) {
        throw new NotFoundError('Leave request not found', 'LEAVE_REQUEST_NOT_FOUND');
      }

      const leaveRequest = leaveResult.rows[0];

      // 2. RBAC: Manager approves employee requests in their store, Admin approves all
      if (role === 'manager') {
        // Manager can only approve employees from their store
        const employeeResult = await client.query(
          'SELECT site_id FROM employees WHERE id = $1::uuid LIMIT 1',
          [leaveRequest.user_id]
        );

        if (employeeResult.rows.length === 0) {
          throw new NotFoundError('Employee not found', 'EMPLOYEE_NOT_FOUND');
        }

        if (employeeResult.rows[0].site_id !== siteId) {
          logger.warn({
            action: 'leave_approval_unauthorized',
            approver_id: userId,
            approver_site: siteId,
            employee_site: employeeResult.rows[0].site_id,
          });
          throw new ForbiddenError('You can only approve requests for employees in your store', 'FORBIDDEN');
        }
      }

      if (leaveRequest.status !== 'PENDING') {
        throw new ValidationError('Leave request has already been processed', { code: 'ALREADY_PROCESSED' });
      }

      // 3. Update leave request status
      const updateResult = await client.query(
        `UPDATE leave_requests
         SET status = $1, approved_by = $2::uuid, approved_at = NOW(), rejection_reason = $3, updated_at = NOW()
         WHERE id = $4::uuid AND status = 'PENDING'
         RETURNING *`,
        [status, userId, rejection_reason || null, id]
      );

      if (updateResult.rows.length === 0) {
        throw new ValidationError('Leave request has already been processed', { code: 'ALREADY_PROCESSED' });
      }

      const updatedLeave = updateResult.rows[0];

      // 4. If APPROVED: update saldo (if not MALATTIA) and delete conflicting shifts
      if (status === 'APPROVED') {
        // Update saldo if not MALATTIA (sick leave doesn't reduce balance)
        if (leaveRequest.leave_type !== 'MALATTIA') {
          const year = new Date(leaveRequest.start_date).getFullYear();
          await client.query(
            `UPDATE leave_saldi
             SET used_days = used_days + $1, updated_at = NOW()
             WHERE user_id = $2::uuid AND leave_type = $3 AND year = $4`,
            [leaveRequest.num_days, leaveRequest.user_id, leaveRequest.leave_type, year]
          );
        }

        // Delete conflicting shifts (hard block on approved leaves)
        // TODO: Adapt to shifts_data JSONB structure in database
        // await client.query(
        //   `DELETE FROM shifts
        //    WHERE employee_id = $1::uuid
        //    AND date >= $2::date AND date <= $3::date`,
        //   [leaveRequest.user_id, leaveRequest.start_date, leaveRequest.end_date]
        // );
      }

      // 5. Log audit trail
      await logAudit(client, {
        action: 'leave_request_approved',
        entity: 'leave_request',
        entityId: updatedLeave.id,
        clientId,
        oldValue: {
          status: 'PENDING',
          approved_by: null,
          approved_at: null,
        },
        newValue: {
          status,
          approved_by: userId,
          approved_at: updatedLeave.approved_at,
          rejection_reason: rejection_reason || null,
        },
        userId,
      });

      return updatedLeave;
    });

    logger.info({
      action: 'leave_request_approved',
      leave_request_id: result.id,
      approver_id: userId,
      status,
      leave_type: result.leave_type,
    });

    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// GET /api/v1/leave/my-requests — Get employee's own leave requests
// =====================================================

router.get('/my-requests', requireAuth, async (req, res, next) => {
  const userId = req.user.user_id;
  const clientId = req.user.client_id;

  try {
    const result = await pool.query(
      `SELECT *
       FROM leave_requests
       WHERE user_id = $1::uuid AND client_id = $2::uuid
       ORDER BY created_at DESC LIMIT 100`,
      [userId, clientId]
    );

    logger.info({
      action: 'my_leaves_viewed',
      user_id: userId,
      count: result.rows.length,
    });

    res.status(200).json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// GET /api/v1/leave/approved — Get approved leave requests (for planning integration)
// =====================================================

router.get('/approved', requireAuth, async (req, res, next) => {
  const userId = req.user.user_id;
  const clientId = req.user.client_id;
  const role = req.user.role;
  const siteId = req.user.site_id;

  try {
    let query = `
      SELECT
        r.id, r.client_id, r.user_id, r.leave_type, r.start_date, r.end_date,
        r.num_days, r.status, r.approved_by, r.approved_at, r.created_at,
        e.name as employee_name, e.email as employee_email
      FROM leave_requests r
      JOIN employees e ON r.user_id = e.id
      WHERE r.status = 'APPROVED' AND r.client_id = $1::uuid
    `;

    const params = [clientId];

    // RBAC: Admin sees all approved requests; managers see store employees; employees see own
    if (role === 'admin') {
      // No additional filter
    } else if (role === 'manager' && siteId) {
      query += ' AND e.site_id = $2::uuid';
      params.push(siteId);
    } else if (role === 'employee' || role === 'viewer') {
      query += ' AND r.user_id = $2::uuid';
      params.push(userId);
    } else {
      throw new ForbiddenError('You do not have permission to view approved leave requests', 'FORBIDDEN');
    }

    query += ' ORDER BY r.start_date ASC LIMIT 500';

    const result = await pool.query(query, params);

    logger.info({
      action: 'approved_leaves_viewed',
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
// GET /api/v1/leave/all — Get all leave requests (admin only, for AdminLeaveManagement)
// =====================================================

router.get('/all', requireAuth, async (req, res, next) => {
  const userId = req.user.user_id;
  const clientId = req.user.client_id;
  const role = req.user.role;

  try {
    // RBAC: Only admin can view all leave requests
    if (role !== 'admin') {
      throw new ForbiddenError('You do not have permission to view all leave requests', 'FORBIDDEN');
    }

    let query = `
      SELECT
        r.id, r.client_id, r.user_id, r.leave_type, r.start_date, r.end_date,
        r.num_days, r.motivation, r.certificate_url, r.status, r.approved_by,
        r.approved_at, r.rejection_reason, r.created_at, r.updated_at,
        e.name as employee_name, e.email as employee_email, e.id as employee_id
      FROM leave_requests r
      JOIN employees e ON r.user_id = e.id
      WHERE r.client_id = $1::uuid
    `;

    const params = [clientId];
    let paramIndex = 2;

    // Optional filters
    const { status, employee_id, start_date, end_date } = req.query;

    if (status) {
      query += ` AND r.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (employee_id) {
      query += ` AND r.user_id = $${paramIndex}::uuid`;
      params.push(employee_id);
      paramIndex++;
    }

    if (start_date) {
      query += ` AND r.start_date >= $${paramIndex}::date`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      query += ` AND r.end_date <= $${paramIndex}::date`;
      params.push(end_date);
      paramIndex++;
    }

    query += ' ORDER BY r.created_at DESC LIMIT 500';

    const result = await pool.query(query, params);

    logger.info({
      action: 'all_leaves_viewed',
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
// GET /api/v1/leave/admin/saldi — Get all employee saldi (admin only)
// =====================================================

router.get('/admin/saldi', requireAuth, async (req, res, next) => {
  const userId = req.user.user_id;
  const clientId = req.user.client_id;
  const role = req.user.role;

  try {
    // RBAC: Only admin can view all saldi
    if (role !== 'admin') {
      throw new ForbiddenError('You do not have permission to view employee saldi', 'FORBIDDEN');
    }

    const result = await pool.query(
      `SELECT user_id, leave_type, year, total_days, used_days, remaining_days
       FROM leave_saldi
       WHERE client_id = $1::uuid
       ORDER BY user_id, leave_type, year DESC`,
      [clientId]
    );

    // Transform to nested object: { employee_id: { FERIE_1: N, FERIE_2: N, ... } }
    const saldiByEmployee = {};
    result.rows.forEach(row => {
      if (!saldiByEmployee[row.user_id]) {
        saldiByEmployee[row.user_id] = {};
      }
      // Use remaining_days for current year; aggregate all years
      saldiByEmployee[row.user_id][row.leave_type] = row.remaining_days;
    });

    logger.info({
      action: 'admin_saldi_viewed',
      user_id: userId,
      role,
      count: Object.keys(saldiByEmployee).length,
    });

    res.status(200).json({ data: saldiByEmployee });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// GET /api/v1/leave/balance — Employee's own leave saldi (current year)
// All roles can call this; returns only the caller's own saldi
// =====================================================

router.get('/balance', requireAuth, async (req, res, next) => {
  const userId = req.user.user_id;
  const clientId = req.user.client_id;
  const year = new Date().getFullYear();

  try {
    const result = await pool.query(
      `SELECT leave_type, year, total_days, used_days, remaining_days
       FROM leave_saldi
       WHERE user_id = $1::uuid AND client_id = $2::uuid AND year = $3
       ORDER BY leave_type`,
      [userId, clientId, year]
    );

    logger.info({
      action: 'leave_balance_viewed',
      user_id: userId,
      year,
      count: result.rows.length,
    });

    res.status(200).json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
