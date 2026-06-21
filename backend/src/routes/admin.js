'use strict';

const express = require('express');
const { z } = require('zod');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { ValidationError, ForbiddenError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');
const { logAudit } = require('../middleware/audit');

const clientsRouter = require('./admin/clients');
const sitesRouter = require('./admin/sites');
const employeesRouter = require('./admin/employees');
const viewersRouter = require('./admin/viewers');
const settingsRouter = require('./admin/settings');

const router = express.Router();

// All admin routes require auth
router.use(requireAuth);

// =====================================================
// GET /api/admin/debug/employee-assignment/:employeeId
// Accessible to admin or manager — registered BEFORE the admin-only middleware.
// =====================================================
router.get('/debug/employee-assignment/:employeeId', async (req, res, next) => {
  const { employeeId } = req.params;
  const { client_id, role } = req.user;

  if (!z.string().uuid().safeParse(employeeId).success) {
    return next(new ValidationError('Invalid employee id'));
  }

  if (role !== 'admin' && role !== 'manager') {
    return next(new ForbiddenError('Admin or manager access required'));
  }

  try {
    const empResult = await pool.query(
      `SELECT id, client_id, email, name, role, assigned_sites
       FROM employees
       WHERE id = $1::uuid AND client_id = $2::uuid`,
      [employeeId, client_id]
    );

    if (empResult.rows.length === 0) {
      return next(new NotFoundError('Employee not found', 'EMPLOYEE_NOT_FOUND'));
    }

    const employee = empResult.rows[0];

    const sitesResult = await pool.query(
      'SELECT id, name FROM sites WHERE client_id = $1 ORDER BY name ASC',
      [client_id]
    );

    const assignmentTests = [];
    for (const site of sitesResult.rows) {
      const testResult = await pool.query(
        `SELECT
          site_id,
          is_assigned,
          raw_assigned_sites,
          any_result
        FROM (
          SELECT
            $2::uuid as site_id,
            $2::uuid = ANY($1::uuid[]) as is_assigned,
            $1::uuid[] as raw_assigned_sites,
            $1::uuid[] as any_result
        ) t`,
        [employee.assigned_sites || [], site.id]
      );

      assignmentTests.push({
        site_id: site.id,
        site_name: site.name,
        is_assigned: testResult.rows[0]?.is_assigned || false,
        details: testResult.rows[0],
      });
    }

    const rawCheckResult = await pool.query(
      `SELECT
        assigned_sites,
        assigned_sites IS NULL as is_null,
        array_length(assigned_sites, 1) as array_length,
        assigned_sites::text as assigned_sites_text
       FROM employees
       WHERE id = $1::uuid`,
      [employeeId]
    );

    res.json({
      debug_info: {
        timestamp: new Date().toISOString(),
        client_id: client_id,
        employee_id: employeeId,
      },
      employee: {
        id: employee.id,
        email: employee.email,
        name: employee.name,
        role: employee.role,
        assigned_sites: employee.assigned_sites,
        assigned_sites_type: typeof employee.assigned_sites,
        assigned_sites_is_array: Array.isArray(employee.assigned_sites),
        assigned_sites_length: Array.isArray(employee.assigned_sites) ? employee.assigned_sites.length : null,
      },
      sites: sitesResult.rows.map((s, idx) => ({
        site_id: s.id,
        site_name: s.name,
        assignment_test: assignmentTests[idx],
      })),
      raw_database_check: rawCheckResult.rows[0],
      diagnosis: generateDiagnosis(employee, assignmentTests),
    });
  } catch (err) {
    logger.error({ action: 'debug_error', error: err.message, stack: err.stack });
    next(err);
  }
});

// All routes below are admin-only
router.use((req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(new ForbiddenError('Admin access required', 'ADMIN_REQUIRED'));
  }
  next();
});

// Mount sub-routers
router.use('/clients', clientsRouter);
router.use('/sites', sitesRouter);
router.use('/employees', employeesRouter);
router.use('/viewers', viewersRouter);
router.use('/settings', settingsRouter);

// =====================================================
// POST /api/admin/dpa-acknowledgement
// DPA routes use hyphen-separated paths — kept inline (cannot mount at /dpa)
// =====================================================
router.post('/dpa-acknowledgement', async (req, res, next) => {
  try {
    const { client_id } = req.user;
    const { accepted_by, notes } = req.body;

    if (!accepted_by || typeof accepted_by !== 'string' || accepted_by.trim().length < 2) {
      return next(new ValidationError('accepted_by must be a non-empty string (name/title)'));
    }

    const dpaVersion = '2.0';

    const result = await pool.query(
      `INSERT INTO dpa_acknowledgements (client_id, dpa_version, accepted_by, notes, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, client_id, dpa_version, accepted_at, accepted_by, notes`,
      [client_id, dpaVersion, accepted_by.trim(), notes || null, req.user.user_id]
    );

    await logAudit(pool, {
      action: 'dpa_acknowledged',
      entity: 'dpa_acknowledgements',
      entity_id: result.rows[0].id,
      old_value: null,
      new_value: JSON.stringify({
        client_id,
        dpa_version: dpaVersion,
        accepted_by: accepted_by.trim(),
        accepted_at: result.rows[0].accepted_at,
      }),
      user_id: req.user.user_id,
      client_id,
    }).catch((err) => logger.warn('Audit log DPA acknowledgement failed:', err));

    res.status(201).json({
      success: true,
      message: 'DPA acknowledged successfully',
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

router.get('/dpa-acknowledgements', async (req, res, next) => {
  try {
    const { client_id } = req.user;

    const result = await pool.query(
      `SELECT id, client_id, dpa_version, accepted_at, accepted_by, notes
       FROM dpa_acknowledgements
       WHERE client_id = $1
       ORDER BY accepted_at DESC
       LIMIT 10`,
      [client_id]
    );

    const latest = result.rows.length > 0 ? result.rows[0] : null;

    res.json({
      success: true,
      data: result.rows,
      latest_acknowledgement: latest,
      returned: result.rows.length,
    });
  } catch (err) {
    next(err);
  }
});

// --- Helper (used only by debug route above) ---

function generateDiagnosis(employee, assignmentTests) {
  const issues = [];

  if (!employee.assigned_sites) {
    issues.push('🔴 assigned_sites is NULL - should be an array');
  } else if (!Array.isArray(employee.assigned_sites)) {
    issues.push('🔴 assigned_sites is not an array - type: ' + typeof employee.assigned_sites);
  } else if (employee.assigned_sites.length === 0) {
    issues.push('🟠 assigned_sites is EMPTY array - no sites assigned');
  }

  const failedTests = assignmentTests.filter(t => !t.is_assigned);
  if (failedTests.length === assignmentTests.length && assignmentTests.length > 0) {
    issues.push('🔴 ANY(assigned_sites) fails for ALL sites - array/query issue');
  }

  if (issues.length === 0) {
    issues.push('✅ No obvious issues found - check mobile app QR code scanning logic');
  }

  return {
    issues,
    summary: issues.join('\n'),
    assignment_tests_passed: assignmentTests.filter(t => t.is_assigned).length + '/' + assignmentTests.length,
  };
}

module.exports = router;
