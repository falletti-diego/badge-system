/**
 * Shifts Routes — Planning & Scheduling
 * GET /api/shifts/:siteId - Fetch shift planning for store
 * POST /api/shifts/:siteId - Save/update shift planning
 * GET /api/shifts/my-schedule - Get employee's own shifts
 * GET /api/shifts/:siteId/export - Export planning to PDF/CSV
 */

const express = require('express');
const pino = require('pino');
const { pool } = require('../db/pool');
const { createValidationMiddleware, GetShiftsSchema, GetMyScheduleSchema, PostShiftsSchema, ExportShiftsSchema } = require('../middleware/validation');
const { withTransaction } = require('../middleware/db-transaction');
const { requireAuth } = require('../middleware/auth');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors');

const router = express.Router();
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// =====================================================
// GET /api/shifts/my-schedule — Employee's own shifts
// =====================================================
// Employee can only see their own shifts
// Returns: shifts_data for logged-in employee
// IMPORTANT: This route must come BEFORE /:siteId to match first

router.get('/my-schedule/:dummy?', requireAuth, createValidationMiddleware(GetMyScheduleSchema), async (req, res, next) => {
  const { month, year } = req.validated.query;
  const userRole = req.user.role;
  const userEmployeeId = req.user.employee_id;

  try {
    // 1. Only employees can access their own schedule
    if (userRole !== 'employee' || !userEmployeeId) {
      throw new ForbiddenError('Only employees can view their personal schedule', 'EMPLOYEE_ONLY');
    }

    // 2. Get employee's assigned sites to find their shifts
    const employeeResult = await pool.query(
      'SELECT id, assigned_sites FROM employees WHERE id = $1::uuid',
      [userEmployeeId]
    );

    if (employeeResult.rows.length === 0) {
      throw new NotFoundError('Employee not found', 'EMPLOYEE_NOT_FOUND');
    }

    const assignedSites = employeeResult.rows[0].assigned_sites;

    // 3. For each assigned site, fetch shifts containing this employee
    let employeeShifts = {};
    if (assignedSites && assignedSites.length > 0) {
      const shiftsResult = await pool.query(
        `SELECT shifts_data FROM shifts
         WHERE site_id = ANY($1::uuid[])
         AND month = $2 AND year = $3`,
        [assignedSites, month, year]
      );

      // Merge all shifts_data and extract only this employee's shifts
      shiftsResult.rows.forEach(row => {
        if (row.shifts_data[userEmployeeId]) {
          employeeShifts = { ...employeeShifts, ...row.shifts_data[userEmployeeId] };
        }
      });
    }

    logger.info({
      message: 'Employee schedule fetched',
      employee_id: userEmployeeId,
      month,
      year,
      shift_count: Object.keys(employeeShifts).length,
    });

    res.json({
      data: {
        shifts_data: employeeShifts,
        metadata: { month, year, shift_count: Object.keys(employeeShifts).length },
      },
      message: 'Your shift schedule retrieved successfully',
    });

  } catch (err) {
    next(err);
  }
});

// =====================================================
// GET /api/shifts/:siteId/export — Export planning
// =====================================================
// Manager can export shifts to PDF or CSV
// Query params: format=pdf|csv
// IMPORTANT: This route must come BEFORE /:siteId to match first

router.get('/:siteId/export', requireAuth, createValidationMiddleware(ExportShiftsSchema), async (req, res, next) => {
  const { siteId } = req.params;
  const { month, year, format } = req.validated.query;
  const clientId = req.user.client_id;
  const userRole = req.user.role;
  const userSiteId = req.user.site_id;

  try {
    // 1. Verify site belongs to client
    const siteResult = await pool.query(
      'SELECT id, name FROM sites WHERE id = $1::uuid AND client_id = $2::uuid',
      [siteId, clientId]
    );

    if (siteResult.rows.length === 0) {
      throw new NotFoundError('Site not found', 'SITE_NOT_FOUND');
    }

    // 2. Authorization check
    if (userRole === 'manager') {
      if (!userSiteId || userSiteId !== siteId) {
        throw new ForbiddenError('You can only export your assigned store', 'NOT_ASSIGNED_TO_SITE');
      }
    }

    // 3. Fetch shifts data
    const shiftsResult = await pool.query(
      `SELECT shifts_data FROM shifts
       WHERE site_id = $1::uuid AND month = $2 AND year = $3`,
      [siteId, month, year]
    );

    const shiftsData = shiftsResult.rows[0]?.shifts_data || {};

    // 4. Fetch employees for context
    const employeesResult = await pool.query(
      `SELECT id, name FROM employees WHERE client_id = $1::uuid
       ORDER BY name ASC`,
      [clientId]
    );

    const employeeMap = {};
    employeesResult.rows.forEach(emp => {
      employeeMap[emp.id] = emp.name;
    });

    // For MVP, just return the data as JSON
    // PDF/CSV generation will be done in Task #6
    logger.info({
      message: 'Shifts planning exported',
      site_id: siteId,
      month,
      year,
      format,
      user_id: req.user.user_id,
    });

    res.json({
      data: {
        shifts_data: shiftsData,
        employees: employeeMap,
        site_name: siteResult.rows[0].name,
        month,
        year,
        format,
      },
      message: `Shifts planning exported as ${format.toUpperCase()} (generation in progress)`,
    });

  } catch (err) {
    next(err);
  }
});

// =====================================================
// GET /api/shifts/:siteId — Fetch shift planning
// =====================================================
// Manager or Admin can fetch planning for their assigned store
// Returns: shifts_data, employees list, site details
// IMPORTANT: This generic route must come AFTER specific routes

router.get('/:siteId', requireAuth, createValidationMiddleware(GetShiftsSchema), async (req, res, next) => {
  const { siteId } = req.params;
  const { month, year } = req.validated.query;
  const clientId = req.user.client_id;
  const userRole = req.user.role;
  const userSiteId = req.user.site_id;

  try {
    // 1. Verify site belongs to client
    const siteResult = await pool.query(
      'SELECT id, name, location FROM sites WHERE id = $1::uuid AND client_id = $2::uuid',
      [siteId, clientId]
    );

    if (siteResult.rows.length === 0) {
      throw new NotFoundError('Site not found', 'SITE_NOT_FOUND');
    }

    const site = siteResult.rows[0];

    // 2. Authorization: Manager must be assigned to this site (store managers only)
    // Admins (no site_id) can access all stores
    if (userRole === 'manager') {
      if (!userSiteId || userSiteId !== siteId) {
        throw new ForbiddenError('You can only access your assigned store', 'NOT_ASSIGNED_TO_SITE');
      }
    }

    // 3. Fetch existing shifts for this site + month/year
    const shiftsResult = await pool.query(
      `SELECT shifts_data FROM shifts
       WHERE site_id = $1::uuid AND month = $2 AND year = $3`,
      [siteId, month, year]
    );

    const shiftsData = shiftsResult.rows[0]?.shifts_data || {};

    // 4. Fetch employees assigned to this site only
    const employeesResult = await pool.query(
      `SELECT DISTINCT e.id, e.name, e.email
       FROM employees e
       WHERE e.client_id = $1::uuid
       AND $2::uuid = ANY(e.assigned_sites)
       ORDER BY e.name ASC`,
      [clientId, siteId]
    );

    const employees = employeesResult.rows;

    logger.info({
      message: 'Shifts planning fetched',
      site_id: siteId,
      month,
      year,
      employee_count: employees.length,
      user_id: req.user.user_id,
    });

    res.json({
      data: {
        shifts_data: shiftsData,
        employees,
        site: { id: site.id, name: site.name, location: site.location },
        metadata: { month, year, employee_count: employees.length },
      },
      message: 'Shifts planning retrieved successfully',
    });

  } catch (err) {
    next(err);
  }
});

// =====================================================
// POST /api/shifts/:siteId — Save/update shift planning
// =====================================================
// Manager updates shifts for their store
// Body: { month, year, shifts_data: {employee_id: {date: shift}} }

router.post('/:siteId', requireAuth, createValidationMiddleware(PostShiftsSchema), async (req, res, next) => {
  const { siteId } = req.params;
  const { month, year, shifts_data } = req.validated.body;
  const clientId = req.user.client_id;
  const userRole = req.user.role;
  const userSiteId = req.user.site_id;
  const userId = req.user.user_id;

  try {
    // 1. Verify site belongs to client
    const siteResult = await pool.query(
      'SELECT id FROM sites WHERE id = $1::uuid AND client_id = $2::uuid',
      [siteId, clientId]
    );

    if (siteResult.rows.length === 0) {
      throw new NotFoundError('Site not found', 'SITE_NOT_FOUND');
    }

    // 2. Authorization check
    if (userRole === 'manager') {
      if (!userSiteId || userSiteId !== siteId) {
        throw new ForbiddenError('You can only update your assigned store', 'NOT_ASSIGNED_TO_SITE');
      }
    }

    // 3. Use transaction for atomic insert/update
    const { shiftsRecord, oldValue } = await withTransaction(async (client) => {
      const existingResult = await client.query(
        `SELECT id, shifts_data FROM shifts
         WHERE site_id = $1::uuid AND month = $2 AND year = $3`,
        [siteId, month, year]
      );

      const existingShiftsData = existingResult.rows[0]?.shifts_data || null;
      let record;

      if (existingResult.rows.length > 0) {
        const updateResult = await client.query(
          `UPDATE shifts
           SET shifts_data = shifts_data || $1, updated_at = NOW()
           WHERE site_id = $2::uuid AND month = $3 AND year = $4
           RETURNING id, shifts_data, updated_at`,
          [shifts_data, siteId, month, year]
        );
        record = updateResult.rows[0];
      } else {
        const insertResult = await client.query(
          `INSERT INTO shifts (client_id, site_id, month, year, shifts_data, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, NOW(), NOW())
           RETURNING id, shifts_data, created_at as updated_at`,
          [clientId, siteId, month, year, shifts_data]
        );
        record = insertResult.rows[0];
      }

      return { shiftsRecord: record, oldValue: existingShiftsData };
    });

    // 4. Create notifications for employees whose shifts changed (best-effort, outside transaction)
    const SHIFT_LABELS = { m: 'Mattino', p: 'Pomeriggio', s: 'Sera', R: 'Riposo' };
    for (const [empId, dates] of Object.entries(shifts_data)) {
      for (const [date, newShift] of Object.entries(dates)) {
        const oldShift = oldValue?.[empId]?.[date];
        if (oldShift === newShift) continue; // unchanged

        const dateFormatted = new Date(date + 'T00:00:00').toLocaleDateString('it-IT', {
          weekday: 'long', day: 'numeric', month: 'long',
        });
        const shiftLabel = SHIFT_LABELS[newShift] || newShift;
        const message = `Turno aggiornato: ${dateFormatted} → ${shiftLabel}`;

        try {
          await pool.query(
            `INSERT INTO notifications (employee_id, client_id, type, message, shift_date, new_shift, site_id)
             VALUES ($1::uuid, $2::uuid, 'shift_updated', $3, $4, $5, $6::uuid)`,
            [empId, clientId, message, date, newShift, siteId]
          );
        } catch (notifErr) {
          logger.warn({ action: 'notification_create_error', error: notifErr.message, empId, date });
        }
      }
    }

    logger.info({
      message: 'Shifts planning saved',
      site_id: siteId,
      month,
      year,
      employee_count: Object.keys(shifts_data).length,
      user_id: userId,
    });

    res.json({
      data: {
        id: shiftsRecord.id,
        shifts_data: shiftsRecord.shifts_data,
        updated_at: shiftsRecord.updated_at,
      },
      message: 'Shifts planning saved successfully',
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
