'use strict';

const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse');
const { z } = require('zod');
const { randomBytes, randomUUID } = require('crypto');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { hashPassword } = require('../auth/password');
const { ValidationError, ForbiddenError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');
const { logAudit } = require('../middleware/audit');
const {
  AdminClientSchema,
  AdminSiteSchema,
  AdminEmployeeSchema,
  createValidationMiddleware,
} = require('../middleware/validation');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }); // 2MB max

// All admin routes require auth + admin role
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(new ForbiddenError('Admin access required', 'ADMIN_REQUIRED'));
  }
  next();
});

// Internal Zod schema for CSV row validation (no body wrapper needed)
// Accepts site_name (human-readable) — resolved to UUID before INSERT.
// external_employee_id is the client's own employee code (e.g. EMP001).
const CsvRowSchema = z.object({
  client_id: z.string().uuid(),
  email: z.string().email().max(100),
  name: z.string().min(2).max(100),
  phone: z.string().max(20).optional(),
  role: z.enum(['employee', 'manager']).default('employee'),
  site_name: z.string().min(1).max(100).optional().nullable(),
  external_employee_id: z.string().max(50).optional().nullable(),
});

// --- POST /api/admin/clients ---

router.post('/clients', createValidationMiddleware(AdminClientSchema), async (req, res, next) => {
  try {
    const data = req.validated.body;

    const result = await pool.query(
      `INSERT INTO clients (name, email, plan)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, plan, created_at`,
      [data.name, data.email, data.plan]
    );

    const client = result.rows[0];
    logger.info({ action: 'admin_create_client', client_id: client.id, name: client.name });
    await logAudit(pool, {
      action: 'admin_create_client',
      entity: 'client',
      entityId: client.id,
      clientId: client.id,
      oldValue: null,
      newValue: { name: client.name, email: client.email, plan: client.plan },
      userId: req.user.user_id,
    });

    res.status(201).json({ success: true, data: client });
  } catch (err) {
    if (err.code === '23505') return next(new ValidationError('Email already exists'));
    next(err);
  }
});

// --- POST /api/admin/sites ---

router.post('/sites', createValidationMiddleware(AdminSiteSchema), async (req, res, next) => {
  try {
    const data = req.validated.body;

    const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1', [data.client_id]);
    if (clientCheck.rowCount === 0) return next(new ValidationError('Client not found'));

    const siteId = randomUUID();
    const qrContent = `badge://checkin?site_id=${siteId}&client_id=${data.client_id}&v=1`;

    const result = await pool.query(
      `INSERT INTO sites (id, client_id, name, location, qr_code_content)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, client_id, name, location, qr_code_content, created_at`,
      [siteId, data.client_id, data.name, data.location || null, qrContent]
    );

    const site = result.rows[0];
    logger.info({ action: 'admin_create_site', site_id: site.id, client_id: data.client_id });
    await logAudit(pool, {
      action: 'admin_create_site',
      entity: 'site',
      entityId: site.id,
      clientId: site.client_id,
      oldValue: null,
      newValue: { name: site.name, location: site.location, client_id: site.client_id },
      userId: req.user.user_id,
    });

    res.status(201).json({ success: true, data: site });
  } catch (err) {
    next(err);
  }
});

// --- POST /api/admin/employees ---

router.post('/employees', createValidationMiddleware(AdminEmployeeSchema), async (req, res, next) => {
  try {
    const data = req.validated.body;

    const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1', [data.client_id]);
    if (clientCheck.rowCount === 0) return next(new ValidationError('Client not found'));

    if (data.site_id) {
      const siteCheck = await pool.query(
        'SELECT id FROM sites WHERE id = $1 AND client_id = $2',
        [data.site_id, data.client_id]
      );
      if (siteCheck.rowCount === 0) return next(new ValidationError('Site not found for this client'));
    }

    if (data.assigned_sites.length > 0) {
      const ownedSites = await pool.query(
        'SELECT id FROM sites WHERE id = ANY($1::UUID[]) AND client_id = $2',
        [data.assigned_sites, data.client_id]
      );
      if (ownedSites.rowCount !== data.assigned_sites.length) {
        return next(new ValidationError('One or more assigned_sites do not belong to this client'));
      }
    }

    const tempPassword = data.password || generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    // F5 fix: pass assigned_sites as a single $8::UUID[] param — no fragile $N arithmetic
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, phone, role, site_id, password_hash, assigned_sites)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::UUID[])
       RETURNING id, client_id, email, name, phone, role, site_id, assigned_sites, created_at`,
      [data.client_id, data.email, data.name, data.phone || null,
        data.role, data.site_id || null, passwordHash, data.assigned_sites]
    );

    const employee = result.rows[0];
    logger.info({ action: 'admin_create_employee', employee_id: employee.id, client_id: data.client_id });
    await logAudit(pool, {
      action: 'admin_create_employee',
      entity: 'employee',
      entityId: employee.id,
      clientId: employee.client_id,
      oldValue: null,
      newValue: { name: employee.name, email: employee.email, role: employee.role, client_id: employee.client_id },
      userId: req.user.user_id,
    });

    res.status(201).json({
      success: true,
      data: employee,
      temp_password: data.password ? undefined : tempPassword,
    });
  } catch (err) {
    if (err.code === '23505') return next(new ValidationError('Email already exists for this client'));
    next(err);
  }
});

// --- POST /api/admin/employees/import (CSV bulk) ---
//
// F1: max rows 500 — bcrypt batched 10-parallel, ~10s for 500 rows, well within 60s ALB timeout
// F1: bcrypt hashed in parallel batches of 10 before the DB transaction
// F2: each created employee is logged to audit_log (best-effort, does not abort transaction)
// F5: assigned_sites passed as $8::UUID[] (no fragile $N index arithmetic)
// F6: all INSERTs run inside a single BEGIN/COMMIT — failure rolls back all rows atomically

router.post('/employees/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return next(new ValidationError('CSV file is required'));
    if (!req.body.client_id) return next(new ValidationError('client_id is required'));

    const clientId = req.body.client_id;
    // Use Zod for uuid validation (consistent with other routes)
    const uuidCheck = z.string().uuid().safeParse(clientId);
    if (!uuidCheck.success) return next(new ValidationError('Invalid client_id'));

    const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1', [clientId]);
    if (clientCheck.rowCount === 0) return next(new ValidationError('Client not found'));

    const csvText = req.file.buffer.toString('utf-8');
    const rows = await parseCsv(csvText);

    if (rows.length === 0) return next(new ValidationError('CSV file is empty'));
    if (rows.length > 500) return next(new ValidationError('Max 500 employees per import'));

    // Prefetch all sites for this client once — used for name→UUID resolution
    const sitesResult = await pool.query(
      'SELECT id, name FROM sites WHERE client_id = $1',
      [clientId]
    );
    // Map normalised lowercase name → UUID (case-insensitive match)
    const siteByName = new Map(sitesResult.rows.map((r) => [r.name.trim().toLowerCase(), r.id]));

    // DEBUG: Log sites found
    logger.info({
      action: 'admin_import_sites_debug',
      client_id: clientId,
      sites_found: sitesResult.rows.map(r => ({ id: r.id, name: r.name })),
      sites_map: Array.from(siteByName.entries()),
    });

    const results = { created: 0, skipped: 0, errors: [] };

    // Phase 1: validate all rows + resolve site_name → site_id
    const prepared = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNum = i + 2;
      try {
        const parsed = CsvRowSchema.parse({
          client_id: clientId,
          email: row.email?.trim(),
          name: row.name?.trim(),
          phone: row.phone?.trim() || undefined,
          role: row.role?.trim() || 'employee',
          site_name: row.site_name?.trim() || undefined,
          external_employee_id: row.employee_id?.trim() || undefined,
        });

        // Resolve site_name → UUID
        let siteId = null;
        if (parsed.site_name) {
          siteId = siteByName.get(parsed.site_name.toLowerCase());
          if (!siteId) {
            // DEBUG: Log missing site
            logger.warn({
              action: 'admin_import_site_not_found',
              line: lineNum,
              email: row.email,
              site_name: parsed.site_name,
              available_sites: Array.from(siteByName.keys()),
            });
            results.errors.push({ line: lineNum, email: row.email, error: `Sede "${parsed.site_name}" non trovata per questo cliente` });
            results.skipped++;
            continue;
          }
        }

        prepared.push({ parsed, siteId, lineNum });
      } catch (rowErr) {
        results.errors.push({ line: lineNum, email: row.email, error: rowErr.message });
        results.skipped++;
      }
    }

    // Phase 2: hash passwords in parallel batches of 10
    // bcryptjs is pure-JS (no libuv thread); batching yields between setImmediate ticks,
    // keeping total blocking time ≈ ceil(N/10) × ~200ms instead of N × ~200ms sequential.
    const HASH_BATCH = 10;
    for (let i = 0; i < prepared.length; i += HASH_BATCH) {
      const batch = prepared.slice(i, i + HASH_BATCH);
      await Promise.all(batch.map(async (item) => {
        item.tempPassword = generateTempPassword();
        item.passwordHash = await hashPassword(item.tempPassword);
      }));
    }

    // Phase 3: insert all prepared rows in one transaction
    const pgClient = await pool.connect();
    try {
      await pgClient.query('BEGIN');

      for (const item of prepared) {
        const { parsed, siteId, passwordHash } = item;
        // Convert single siteId to assigned_sites array — PostgreSQL accepts UUID[] natively
        const assignedSitesArray = siteId ? [siteId] : [];
        const insertResult = await pgClient.query(
          `INSERT INTO employees (client_id, email, name, phone, role, assigned_sites, password_hash, external_employee_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (client_id, email) DO NOTHING
           RETURNING id, client_id, email, name, role`,
          [parsed.client_id, parsed.email, parsed.name, parsed.phone || null,
            parsed.role, assignedSitesArray, passwordHash, parsed.external_employee_id || null]
        );

        if (insertResult.rowCount > 0) {
          results.created++;
          const emp = insertResult.rows[0];
          // Audit log inside the same transaction — best-effort, never aborts the import
          await logAudit(pgClient, {
            action: 'admin_import_employee',
            entity: 'employee',
            entityId: emp.id,
            clientId: emp.client_id,
            oldValue: null,
            newValue: { name: emp.name, email: emp.email, role: emp.role },
            userId: req.user.user_id,
          }).catch((auditErr) => {
            logger.warn({ action: 'audit_log_failed', employee_id: emp.id, error: auditErr.message });
          });
        } else {
          results.skipped++;
        }
      }

      await pgClient.query('COMMIT');
    } catch (txErr) {
      await pgClient.query('ROLLBACK');
      throw txErr;
    } finally {
      pgClient.release();
    }

    logger.info({ action: 'admin_import_employees', client_id: clientId, ...results });
    res.status(200).json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
});

// --- GET /api/admin/clients ---

router.get('/clients', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.email, c.plan, c.created_at,
              COUNT(DISTINCT s.id) AS site_count,
              COUNT(DISTINCT e.id) AS employee_count
       FROM clients c
       LEFT JOIN sites s ON s.client_id = c.id
       LEFT JOIN employees e ON e.client_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT 500`
    );
    res.json({ success: true, data: result.rows, returned: result.rows.length });
  } catch (err) {
    next(err);
  }
});

// --- GET /api/admin/employees?client_id=... ---

router.get('/employees', async (req, res, next) => {
  try {
    const { client_id } = req.query;
    const params = [];
    let where = '';
    if (client_id) {
      const uuidCheck = z.string().uuid().safeParse(client_id);
      if (!uuidCheck.success) return next(new ValidationError('Invalid client_id format'));
      params.push(client_id);
      where = 'WHERE e.client_id = $1';
    }
    const result = await pool.query(
      `SELECT e.id, e.client_id, e.email, e.name, e.role, e.phone,
              e.site_id, e.external_employee_id, e.created_at, c.name AS client_name,
              s.name AS site_name
       FROM employees e
       JOIN clients c ON c.id = e.client_id
       LEFT JOIN sites s ON s.id = e.site_id
       ${where}
       ORDER BY e.created_at DESC
       LIMIT 200`,
      params
    );
    res.json({ success: true, data: result.rows, returned: result.rows.length });
  } catch (err) {
    next(err);
  }
});

// --- DELETE /api/admin/clients/:id ---

router.delete('/clients/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const uuidCheck = z.string().uuid().safeParse(id);
    if (!uuidCheck.success) return next(new ValidationError('Invalid client id'));

    const result = await pool.query(
      'DELETE FROM clients WHERE id = $1 RETURNING id, name',
      [id]
    );
    if (result.rowCount === 0) return next(new ValidationError('Client not found'));

    const client = result.rows[0];
    await logAudit(pool, {
      action: 'admin_delete_client',
      entity: 'client',
      entityId: client.id,
      clientId: client.id,
      oldValue: { name: client.name },
      newValue: null,
      userId: req.user.user_id,
    }).catch(() => {});

    logger.info({ action: 'admin_delete_client', client_id: client.id, name: client.name });
    res.json({ success: true, message: `Cliente "${client.name}" eliminato.` });
  } catch (err) {
    next(err);
  }
});

// --- DELETE /api/admin/sites/:id ---

router.delete('/sites/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const uuidCheck = z.string().uuid().safeParse(id);
    if (!uuidCheck.success) return next(new ValidationError('Invalid site id'));

    const result = await pool.query(
      'DELETE FROM sites WHERE id = $1 RETURNING id, name, client_id',
      [id]
    );
    if (result.rowCount === 0) return next(new ValidationError('Site not found'));

    const site = result.rows[0];
    await logAudit(pool, {
      action: 'admin_delete_site',
      entity: 'site',
      entityId: site.id,
      clientId: site.client_id,
      oldValue: { name: site.name },
      newValue: null,
      userId: req.user.user_id,
    }).catch(() => {});

    logger.info({ action: 'admin_delete_site', site_id: site.id, name: site.name });
    res.json({ success: true, message: `Sede "${site.name}" eliminata.` });
  } catch (err) {
    next(err);
  }
});

// --- DELETE /api/admin/employees/:id ---

router.delete('/employees/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const uuidCheck = z.string().uuid().safeParse(id);
    if (!uuidCheck.success) return next(new ValidationError('Invalid employee id'));

    const result = await pool.query(
      'DELETE FROM employees WHERE id = $1 RETURNING id, name, email, client_id',
      [id]
    );
    if (result.rowCount === 0) return next(new ValidationError('Employee not found'));

    const emp = result.rows[0];
    await logAudit(pool, {
      action: 'admin_delete_employee',
      entity: 'employee',
      entityId: emp.id,
      clientId: emp.client_id,
      oldValue: { name: emp.name, email: emp.email },
      newValue: null,
      userId: req.user.user_id,
    }).catch(() => {});

    logger.info({ action: 'admin_delete_employee', employee_id: emp.id, email: emp.email });
    res.json({ success: true, message: `Dipendente "${emp.name}" eliminato.` });
  } catch (err) {
    next(err);
  }
});

// --- POST /api/admin/employees/:id/reset-password ---

router.post('/employees/:id/reset-password', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!z.string().uuid().safeParse(id).success) {
      return next(new ValidationError('Invalid employee id'));
    }

    const newPassword = generateTempPassword();
    const passwordHash = await hashPassword(newPassword);

    const updateResult = await pool.query(
      'UPDATE employees SET password_hash = $1 WHERE id = $2 RETURNING id, name, email, client_id',
      [passwordHash, id]
    );
    if (updateResult.rowCount === 0) {
      return next(new NotFoundError('Employee not found', 'EMPLOYEE_NOT_FOUND'));
    }

    const emp = updateResult.rows[0];

    logger.info({ action: 'admin_reset_password', employee_id: id, admin_id: req.user.user_id });
    await logAudit(pool, {
      action: 'password_reset',
      entity: 'employee',
      entityId: emp.id,
      clientId: emp.client_id,
      oldValue: null,
      newValue: { reset_by: req.user.user_id, email: emp.email },
      userId: req.user.user_id,
    }).catch((auditErr) => {
      logger.warn({ action: 'audit_log_failed', employee_id: emp.id, error: auditErr.message });
    });

    res.json({
      success: true,
      data: { id: emp.id, name: emp.name, email: emp.email },
      temp_password: newPassword,
      message: `Password reimpostata per ${emp.name}`,
    });
  } catch (err) {
    next(err);
  }
});

// --- GET /api/admin/sites?client_id=... ---

router.get('/sites', async (req, res, next) => {
  try {
    const { client_id } = req.query;
    const params = [];
    let where = '';
    if (client_id) {
      const uuidCheck = z.string().uuid().safeParse(client_id);
      if (!uuidCheck.success) return next(new ValidationError('Invalid client_id format'));
      params.push(client_id);
      where = 'WHERE s.client_id = $1';
    }
    const result = await pool.query(
      `SELECT s.id, s.client_id, s.name, s.location, s.qr_code_content, s.created_at,
              c.name AS client_name
       FROM sites s
       JOIN clients c ON c.id = s.client_id
       ${where}
       ORDER BY s.created_at DESC
       LIMIT 500`,
      params
    );
    res.json({ success: true, data: result.rows, returned: result.rows.length });
  } catch (err) {
    next(err);
  }
});

// --- Helpers ---

function generateTempPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

// =====================================================
// GET /api/admin/debug/employee-assignment/:employeeId
// Debug endpoint to diagnose assigned_sites issues
// =====================================================
router.get('/debug/employee-assignment/:employeeId', requireAuth, async (req, res, next) => {
  const { employeeId } = req.params;
  const { client_id } = req.user;

  try {
    // 1. Get employee details
    const empResult = await pool.query(
      `SELECT id, client_id, email, name, role, assigned_sites
       FROM employees
       WHERE id = $1::uuid AND client_id = $2::uuid`,
      [employeeId, client_id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = empResult.rows[0];

    // 2. Get all sites for this client
    const sitesResult = await pool.query(
      `SELECT id, name FROM sites WHERE client_id = $1 ORDER BY name ASC`,
      [client_id]
    );

    // 3. Test the ANY(assigned_sites) query for each site
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

    // 4. Raw PostgreSQL check
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

function parseCsv(text) {
  return new Promise((resolve, reject) => {
    parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }, (err, records) => {
      if (err) reject(err);
      else resolve(records);
    });
  });
}

module.exports = router;
