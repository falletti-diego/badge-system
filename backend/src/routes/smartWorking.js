/**
 * Smart Working Routes
 * POST /api/v1/smart-working — Employee self-declares smart working for today
 * GET /api/v1/smart-working/my-history — Employee's own smart working days
 *
 * Auto-confirmed (no manager approval), same pattern as illnesses (Malattia).
 * Unlike checkins, there is no site verification — smart working is by definition remote.
 * The date is always computed server-side (NOW()), never accepted from the client,
 * so a device with a manipulated clock/timezone cannot declare a different day.
 */

const express = require('express');
const { pool } = require('../db/pool');
const { logAudit } = require('../middleware/audit');
const { withTransaction } = require('../middleware/db-transaction');
const { requireAuth } = require('../middleware/auth');
const { ForbiddenError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');

const router = express.Router();

// =====================================================
// POST /api/v1/smart-working — Employee declares smart working for today
// =====================================================

router.post('/', requireAuth, async (req, res, next) => {
  const userId = req.user.user_id;
  // Managers have a separate employee_id (their employee record) distinct from their login user_id
  const employeeId = req.user.employee_id ?? null;
  const clientId = req.user.client_id;

  try {
    // Only accounts with an employee profile may self-declare (employee + manager both have one;
    // admin/viewer accounts typically don't — fail-closed, same guard style as checkins.js)
    if (!employeeId) {
      throw new ForbiddenError(
        'Il tuo account non ha un profilo dipendente — impossibile dichiarare Smart Working',
        'SMART_WORKING_NO_EMPLOYEE_PROFILE'
      );
    }

    const result = await withTransaction(async (client) => {
      let insertResult;
      try {
        insertResult = await client.query(
          `INSERT INTO smart_working_days (client_id, employee_id, date, created_by)
           VALUES ($1::uuid, $2::uuid, CURRENT_DATE, $2::uuid)
           RETURNING id, employee_id, date::text AS date, created_at`,
          [clientId, employeeId]
        );
      } catch (err) {
        // Postgres unique_violation — employee already declared smart working today
        if (err.code === '23505') {
          throw new ConflictError(
            'Hai già dichiarato Smart Working per oggi',
            'ALREADY_DECLARED_TODAY'
          );
        }
        throw err;
      }

      const smartWorkingDay = insertResult.rows[0];

      await logAudit(client, {
        action: 'smart_working_declared',
        entity: 'smart_working_day',
        entityId: smartWorkingDay.id,
        clientId,
        oldValue: null,
        newValue: { employee_id: employeeId, date: smartWorkingDay.date },
        userId,
      });

      return smartWorkingDay;
    });

    logger.info({
      action: 'smart_working_declared',
      smart_working_id: result.id,
      employee_id: employeeId,
      date: result.date,
    });

    res.status(201).json({
      data: result,
      message: 'Smart Working confermato per oggi',
    });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// GET /api/v1/smart-working/my-history — Employee's own smart working days
// RBAC: always scoped to req.user.employee_id — never accepts a client-supplied employee_id
// =====================================================

router.get('/my-history', requireAuth, async (req, res, next) => {
  const employeeId = req.user.employee_id ?? null;
  const clientId = req.user.client_id;
  const { date_from, date_to } = req.query;

  try {
    if (!employeeId) {
      throw new ForbiddenError(
        'Il tuo account non ha un profilo dipendente',
        'SMART_WORKING_NO_EMPLOYEE_PROFILE'
      );
    }

    const params = [clientId, employeeId];
    let query = `
      SELECT id, date::text AS date, created_at
      FROM smart_working_days
      WHERE client_id = $1::uuid AND employee_id = $2::uuid
    `;

    if (date_from) {
      params.push(date_from);
      query += ` AND date >= $${params.length}::date`;
    }
    if (date_to) {
      params.push(date_to);
      query += ` AND date <= $${params.length}::date`;
    }

    query += ' ORDER BY date DESC LIMIT 200';

    const result = await pool.query(query, params);

    res.status(200).json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
