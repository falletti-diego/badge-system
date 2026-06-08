'use strict';

const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const { randomBytes } = require('crypto');
const pino = require('pino');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { hashPassword } = require('../auth/password');
const { ValidationError, ForbiddenError } = require('../utils/errors');
const { logAudit } = require('../middleware/audit');
const {
  AdminClientSchema,
  AdminSiteSchema,
  AdminEmployeeSchema,
  createValidationMiddleware,
} = require('../middleware/validation');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }); // 2MB max

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// All admin routes require auth + admin role
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(new ForbiddenError('Admin access required', 'ADMIN_REQUIRED'));
  }
  next();
});

// Internal Zod schema for CSV row validation (no body wrapper needed)
const CsvRowSchema = z.object({
  client_id: z.string().uuid(),
  email: z.string().email().max(100),
  name: z.string().min(2).max(100),
  phone: z.string().max(20).optional(),
  role: z.enum(['employee', 'manager']).default('employee'),
  site_id: z.string().uuid().optional().nullable(),
  assigned_sites: z.array(z.string().uuid()).default([]),
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

    const siteId = uuidv4();
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
// F1: max rows reduced from 500→100 to stay within the 60s ALB timeout (bcryptjs pure-JS, ~200ms/hash)
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
    if (rows.length > 100) return next(new ValidationError('Max 100 employees per import'));

    // Prefetch all valid site IDs for this client once (avoids N DB round-trips per row)
    const sitesResult = await pool.query(
      'SELECT id FROM sites WHERE client_id = $1',
      [clientId]
    );
    const validSiteIds = new Set(sitesResult.rows.map((r) => r.id));

    const results = { created: 0, skipped: 0, errors: [] };

    // Phase 1: validate all rows (Zod + site ownership check in memory)
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
          site_id: row.site_id?.trim() || undefined,
          assigned_sites: row.assigned_sites
            ? row.assigned_sites.split(';').map((s) => s.trim()).filter(Boolean)
            : [],
        });

        if (parsed.assigned_sites.some((id) => !validSiteIds.has(id))) {
          results.errors.push({ line: lineNum, email: row.email, error: 'One or more assigned_sites do not belong to this client' });
          results.skipped++;
          continue;
        }

        prepared.push({ parsed, lineNum });
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
        const { parsed, passwordHash } = item;
        const insertResult = await pgClient.query(
          `INSERT INTO employees (client_id, email, name, phone, role, site_id, password_hash, assigned_sites)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::UUID[])
           ON CONFLICT (client_id, email) DO NOTHING
           RETURNING id, client_id, email, name, role`,
          [parsed.client_id, parsed.email, parsed.name, parsed.phone || null,
            parsed.role, parsed.site_id || null, passwordHash, parsed.assigned_sites]
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
       ORDER BY c.created_at DESC`
    );
    res.json({ success: true, data: result.rows });
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
       ORDER BY s.created_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
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
