'use strict';

/**
 * Presences Summary Routes
 * GET /api/presences/summary — monthly per-employee summary with hours and meal vouchers
 */

const express = require('express');
const { pool } = require('../db/pool');
const { createValidationMiddleware, GetPresencesSummarySchema } = require('../middleware/validation');
const { requireAuth } = require('../middleware/auth');
const { ForbiddenError } = require('../utils/errors');
const { calculateDailyHours, aggregateMonthly } = require('../utils/hours');

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

module.exports = router;
