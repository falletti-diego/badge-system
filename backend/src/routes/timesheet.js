'use strict';

const express = require('express');
const { pool } = require('../db/pool');
const { createValidationMiddleware, PostTimesheetSignSchema } = require('../middleware/validation');
const { requireAuth } = require('../middleware/auth');
const { ForbiddenError, ValidationError } = require('../utils/errors');
const { calculateDailyHours, aggregateMonthly } = require('../utils/hours');
const { logAudit } = require('../middleware/audit');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/sign', requireAuth, createValidationMiddleware(PostTimesheetSignSchema), async (req, res, next) => {
  const { month, year } = req.validated.body;
  const { client_id, employee_id, user_id } = req.user;

  if (!employee_id) {
    return next(new ForbiddenError('Your account has no employee profile', 'NO_EMPLOYEE_PROFILE'));
  }

  // Fix #2: blocco server-side, non solo lato UI — un client malevolo/bugato
  // non deve poter firmare un mese ancora in corso (snapshot incompleto, e i
  // check-in futuri non hanno modo di invalidare una firma sul mese corrente
  // finché il mese stesso non è "chiuso").
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  if (year > currentYear || (year === currentYear && month >= currentMonth)) {
    return next(new ValidationError('Cannot sign the current or a future month', { code: 'CANNOT_SIGN_CURRENT_MONTH' }));
  }

  try {
    const dateFrom = new Date(Date.UTC(year, month - 1, 1));
    const dateTo = new Date(Date.UTC(year, month, 1));

    const checkinsResult = await pool.query(
      `SELECT id, employee_id, timestamp, type FROM checkins
       WHERE client_id = $1::uuid AND employee_id = $2::uuid
         AND timestamp >= $3 AND timestamp < $4
       ORDER BY timestamp ASC`,
      [client_id, employee_id, dateFrom.toISOString(), dateTo.toISOString()]
    );

    const clientResult = await pool.query(
      'SELECT meal_voucher_hours FROM clients WHERE id = $1::uuid LIMIT 1',
      [client_id]
    );
    const mealVoucherHours = clientResult.rows[0]?.meal_voucher_hours ?? 5.0;

    const dailyEntries = calculateDailyHours(checkinsResult.rows);
    const monthlyAgg = aggregateMonthly(dailyEntries, Number(mealVoucherHours));
    const agg = monthlyAgg.get(employee_id) || {
      ore_totali: 0, ore_ordinarie: 0, ore_straordinarie: 0, buoni_pasto: 0, giorni_presenti: 0,
    };

    const upsertResult = await pool.query(
      `INSERT INTO timesheet_signatures
         (employee_id, client_id, month, year, status, signed_at, ore_totali, ore_ordinarie, ore_straordinarie, giorni_presenti, buoni_pasto)
       VALUES ($1, $2, $3, $4, 'signed', NOW(), $5, $6, $7, $8, $9)
       ON CONFLICT (employee_id, month, year)
       DO UPDATE SET status = 'signed', signed_at = NOW(),
         ore_totali = EXCLUDED.ore_totali, ore_ordinarie = EXCLUDED.ore_ordinarie,
         ore_straordinarie = EXCLUDED.ore_straordinarie, giorni_presenti = EXCLUDED.giorni_presenti,
         buoni_pasto = EXCLUDED.buoni_pasto
       RETURNING id, status, signed_at`,
      [employee_id, client_id, month, year, agg.ore_totali, agg.ore_ordinarie, agg.ore_straordinarie, agg.giorni_presenti, agg.buoni_pasto]
    );

    const signature = upsertResult.rows[0];

    await logAudit(pool, {
      action: 'timesheet_signed',
      entity: 'timesheet_signature',
      entityId: signature.id,
      clientId: client_id,
      oldValue: null,
      newValue: { employee_id, month, year, ...agg },
      userId: user_id,
    }).catch((err) => logger.warn({ action: 'audit_log_failed', error: err.message }));

    res.status(201).json({ success: true, data: signature });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
