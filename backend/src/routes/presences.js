'use strict';

/**
 * Presences Summary Routes
 * GET /api/presences/summary — monthly per-employee summary with hours and meal vouchers
 */

const express = require('express');
const { pool } = require('../db/pool');
const { createValidationMiddleware, GetPresencesSummarySchema, GetPresencesTrendSchema } = require('../middleware/validation');
const { requireAuth } = require('../middleware/auth');
const { ForbiddenError } = require('../utils/errors');
const { calculateDailyHours, aggregateMonthly, toUtcDateString } = require('../utils/hours');
const { resolveSiteId } = require('../utils/resolvers');
const { buildTrendDays } = require('../utils/trendStats');

const router = express.Router();

// =====================================================
// GET /api/presences/summary?month=6&year=2026
// =====================================================

router.get('/summary', requireAuth, createValidationMiddleware(GetPresencesSummarySchema), async (req, res, next) => {
  const { month, year } = req.validated.query;
  const { client_id, role, site_id: managerSiteId } = req.user;

  // RBAC: employee cannot access this endpoint
  if (role === 'employee') {
    return next(new ForbiddenError('Employees cannot access the monthly summary', 'FORBIDDEN_ROLE'));
  }

  try {
    // Date range for the requested month (full UTC month)
    const dateFrom = new Date(Date.UTC(year, month - 1, 1));
    const dateTo = new Date(Date.UTC(year, month, 1)); // exclusive upper bound

    // Build the check-ins query
    // - admin / viewer: all employees for the client
    // - manager: only employees assigned to manager's site
    // FAIL-CLOSED RBAC: manager without site_id throws 403 instead of bypassing filter
    const params = [client_id, dateFrom.toISOString(), dateTo.toISOString()];
    let employeeFilter = '';

    if (role === 'manager') {
      if (!managerSiteId) {
        return next(new ForbiddenError('Manager has no assigned site', 'NO_SITE_ASSIGNED'));
      }
      params.push(managerSiteId);
      employeeFilter = `AND ci.site_id = $${params.length}::uuid`;
    }

    // Fetch all check-ins for the period, sorted by (employee_id, timestamp)
    const checkinsResult = await pool.query(
      `SELECT ci.id, ci.employee_id, ci.timestamp, ci.type,
              e.name AS employee_name, e.external_employee_id AS matricola,
              e.id AS emp_id
       FROM checkins ci
       JOIN employees e ON e.id = ci.employee_id
       WHERE ci.client_id = $1::uuid
         AND ci.timestamp >= $2
         AND ci.timestamp < $3
         ${employeeFilter}
       ORDER BY ci.employee_id, ci.timestamp ASC`,
      params
    );

    // Fetch meal_voucher_hours for this client
    const clientResult = await pool.query(
      'SELECT meal_voucher_hours FROM clients WHERE id = $1::uuid LIMIT 1',
      [client_id]
    );
    const mealVoucherHours = clientResult.rows[0]?.meal_voucher_hours ?? 5.0;

    // Build a map of employee_id → { name, matricola }
    const employeeMeta = new Map();
    for (const row of checkinsResult.rows) {
      if (!employeeMeta.has(row.employee_id)) {
        employeeMeta.set(row.employee_id, { name: row.employee_name, matricola: row.matricola });
      }
    }

    // If manager with no check-ins yet but has employees at the site,
    // we still need to list them (fetch separately)
    if (role === 'manager' && checkinsResult.rows.length === 0) {
      const empResult = await pool.query(
        `SELECT id, name, external_employee_id AS matricola FROM employees
         WHERE client_id = $1::uuid AND $2::uuid = ANY(assigned_sites) AND role = 'employee'
         ORDER BY name`,
        [client_id, managerSiteId]
      );
      for (const row of empResult.rows) {
        employeeMeta.set(row.id, { name: row.name, matricola: row.matricola });
      }
    }

    // Compute daily hours
    const dailyEntries = calculateDailyHours(checkinsResult.rows);
    const monthlyAgg = aggregateMonthly(dailyEntries, Number(mealVoucherHours));

    // Build response — include all employees (even those with 0 hours) for admin/viewer
    // For manager: only employees from the site
    let allEmployeeIds;
    if (role === 'admin' || role === 'viewer') {
      // Get all employees for the client
      const allEmps = await pool.query(
        `SELECT id, name, external_employee_id AS matricola FROM employees
         WHERE client_id = $1::uuid AND role != 'viewer' AND role != 'admin' AND role != 'manager'
         ORDER BY name`,
        [client_id]
      );
      allEmployeeIds = allEmps.rows;
      for (const row of allEmployeeIds) {
        if (!employeeMeta.has(row.id)) {
          employeeMeta.set(row.id, { name: row.name, matricola: row.matricola });
        }
      }
    } else {
      // manager: use employees that appear in check-ins or at the site
      allEmployeeIds = Array.from(employeeMeta.entries()).map(([id, meta]) => ({ id, ...meta }));
    }

    const employees = [];
    const seenIds = new Set();

    for (const [empId, meta] of employeeMeta) {
      if (seenIds.has(empId)) continue;
      seenIds.add(empId);

      const agg = monthlyAgg.get(empId) || {
        ore_totali: 0,
        ore_ordinarie: 0,
        ore_straordinarie: 0,
        buoni_pasto: 0,
        giorni_presenti: 0,
        presenze_aperte: 0,
      };

      employees.push({
        id: empId,
        name: meta.name,
        matricola: meta.matricola || null,
        giorni_presenti: agg.giorni_presenti,
        ore_totali: agg.ore_totali,
        ore_ordinarie: agg.ore_ordinarie,
        ore_straordinarie: agg.ore_straordinarie,
        buoni_pasto: agg.buoni_pasto,
        presenze_aperte: agg.presenze_aperte,
      });
    }

    // Sort by name
    employees.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const totals = employees.reduce(
      (acc, e) => ({
        ore_totali: Math.round((acc.ore_totali + e.ore_totali) * 100) / 100,
        ore_ordinarie: Math.round((acc.ore_ordinarie + e.ore_ordinarie) * 100) / 100,
        ore_straordinarie: Math.round((acc.ore_straordinarie + e.ore_straordinarie) * 100) / 100,
        buoni_pasto: acc.buoni_pasto + e.buoni_pasto,
        giorni_presenti: acc.giorni_presenti + e.giorni_presenti,
      }),
      { ore_totali: 0, ore_ordinarie: 0, ore_straordinarie: 0, buoni_pasto: 0, giorni_presenti: 0 }
    );

    res.json({
      success: true,
      data: {
        period: { month, year },
        meal_voucher_threshold_hours: Number(mealVoucherHours),
        employees,
        totals,
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// GET /api/presences/trend — ultimi 30 giorni, 4 metriche aggregate
// =====================================================

router.get('/trend', requireAuth, createValidationMiddleware(GetPresencesTrendSchema), async (req, res, next) => {
  const { site_id } = req.validated.query;
  const { client_id, role, site_id: managerSiteId } = req.user;

  if (role === 'employee') {
    return next(new ForbiddenError('Employees cannot access trend charts', 'FORBIDDEN_ROLE'));
  }

  try {
    let resolvedSiteId;
    if (role === 'manager') {
      if (!managerSiteId) {
        return next(new ForbiddenError('Manager has no assigned site', 'NO_SITE_ASSIGNED'));
      }
      resolvedSiteId = managerSiteId;
    } else if (site_id) {
      resolvedSiteId = await resolveSiteId(site_id, client_id);
    }

    const today = new Date();
    const dateTo = toUtcDateString(today);
    const fromDate = new Date(today);
    fromDate.setUTCDate(fromDate.getUTCDate() - 29);
    const dateFrom = toUtcDateString(fromDate);

    // Dipendenti attivi nello scope (solo ruolo 'employee', mai manager/admin/viewer)
    const employeesQuery = resolvedSiteId
      ? 'SELECT id FROM employees WHERE client_id = $1::uuid AND role = \'employee\' AND $2::uuid = ANY(assigned_sites)'
      : 'SELECT id FROM employees WHERE client_id = $1::uuid AND role = \'employee\'';
    const employeesParams = resolvedSiteId ? [client_id, resolvedSiteId] : [client_id];
    const employeesResult = await pool.query(employeesQuery, employeesParams);
    const activeEmployeeIds = employeesResult.rows.map((r) => r.id);

    // Check-ins nel range, scoped per client + sede opzionale
    const checkinsParams = [client_id, `${dateFrom}T00:00:00.000Z`, `${dateTo}T23:59:59.999Z`];
    let siteFilter = '';
    if (resolvedSiteId) {
      checkinsParams.push(resolvedSiteId);
      siteFilter = `AND site_id = $${checkinsParams.length}::uuid`;
    }
    const checkinsResult = await pool.query(
      `SELECT employee_id, timestamp, type FROM checkins
       WHERE client_id = $1::uuid AND timestamp >= $2 AND timestamp <= $3 ${siteFilter}
       ORDER BY employee_id, timestamp ASC`,
      checkinsParams
    );
    const dailyHourEntries = calculateDailyHours(checkinsResult.rows);

    // Ferie approvate e malattie attive nel range, scoped ai dipendenti attivi.
    // NOTA: start_date/end_date castati a ::text — node-pg interpreta DATE come
    // mezzanotte locale del server, che poi shifterebbe di un giorno in JSON
    // (vedi PROJECT_DECISIONS.md Session 55 per il bug reale già trovato).
    let leaveRows = [];
    let illnessRows = [];
    if (activeEmployeeIds.length > 0) {
      const leaveResult = await pool.query(
        `SELECT user_id, start_date::text AS start_date, end_date::text AS end_date
         FROM leave_requests
         WHERE client_id = $1::uuid AND status = 'APPROVED'
           AND start_date <= $3::date AND end_date >= $2::date
           AND user_id = ANY($4::uuid[])`,
        [client_id, dateFrom, dateTo, activeEmployeeIds]
      );
      leaveRows = leaveResult.rows;

      const illnessResult = await pool.query(
        `SELECT employee_id, start_date::text AS start_date, end_date::text AS end_date
         FROM illnesses
         WHERE client_id = $1::uuid AND cancelled_at IS NULL
           AND start_date <= $3::date AND end_date >= $2::date
           AND employee_id = ANY($4::uuid[])`,
        [client_id, dateFrom, dateTo, activeEmployeeIds]
      );
      illnessRows = illnessResult.rows;
    }

    const days = buildTrendDays({
      dateFrom,
      dateTo,
      dailyHourEntries,
      activeEmployeeIds,
      leaveRows,
      illnessRows,
    });

    res.json({ data: { date_from: dateFrom, date_to: dateTo, days } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
