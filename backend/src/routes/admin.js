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
const { ValidationError, AuthorizationError } = require('../utils/errors');
const { logAudit } = require('../middleware/audit');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }); // 2MB max

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// All admin routes require auth + admin role
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(new AuthorizationError('Admin access required'));
  }
  next();
});

// --- Validation schemas ---

const ClientSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(100),
  plan: z.enum(['starter', 'growth', 'enterprise']).default('starter'),
});

const SiteSchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(2).max(100),
  location: z.string().max(200).optional(),
});

const EmployeeSchema = z.object({
  client_id: z.string().uuid(),
  email: z.string().email().max(100),
  name: z.string().min(2).max(100),
  phone: z.string().max(20).optional(),
  role: z.enum(['employee', 'manager']).default('employee'),
  site_id: z.string().uuid().optional().nullable(),
  assigned_sites: z.array(z.string().uuid()).default([]),
  password: z.string().min(6).max(100).optional(),
});

// --- POST /api/admin/clients ---

router.post('/clients', async (req, res, next) => {
  try {
    const data = ClientSchema.parse(req.body);

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
    if (err instanceof z.ZodError) return next(new ValidationError('Invalid input', err.errors));
    if (err.code === '23505') return next(new ValidationError('Email already exists'));
    next(err);
  }
});

// --- POST /api/admin/sites ---

router.post('/sites', async (req, res, next) => {
  try {
    const data = SiteSchema.parse(req.body);

    // Verify client exists
    const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1', [data.client_id]);
    if (clientCheck.rowCount === 0) return next(new ValidationError('Client not found'));

    // Generate QR code content (unique per site)
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
    if (err instanceof z.ZodError) return next(new ValidationError('Invalid input', err.errors));
    next(err);
  }
});

// --- POST /api/admin/employees ---

router.post('/employees', async (req, res, next) => {
  try {
    const data = EmployeeSchema.parse(req.body);

    // Verify client exists
    const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1', [data.client_id]);
    if (clientCheck.rowCount === 0) return next(new ValidationError('Client not found'));

    // Verify site_id belongs to client (if provided)
    if (data.site_id) {
      const siteCheck = await pool.query(
        'SELECT id FROM sites WHERE id = $1 AND client_id = $2',
        [data.site_id, data.client_id]
      );
      if (siteCheck.rowCount === 0) return next(new ValidationError('Site not found for this client'));
    }

    // Verify all assigned_sites belong to this client (prevents cross-tenant site assignment)
    if (data.assigned_sites.length > 0) {
      const ownedSites = await pool.query(
        'SELECT id FROM sites WHERE id = ANY($1::UUID[]) AND client_id = $2',
        [data.assigned_sites, data.client_id]
      );
      if (ownedSites.rowCount !== data.assigned_sites.length) {
        return next(new ValidationError('One or more assigned_sites do not belong to this client'));
      }
    }

    // Generate temp password if not provided
    const tempPassword = data.password || generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const assignedSitesArray = data.assigned_sites.length > 0
      ? `ARRAY[${data.assigned_sites.map((_, i) => `$${i + 8}`).join(',')}]::UUID[]`
      : 'ARRAY[]::UUID[]';

    const params = [
      data.client_id,
      data.email,
      data.name,
      data.phone || null,
      data.role,
      data.site_id || null,
      passwordHash,
      ...data.assigned_sites,
    ];

    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, phone, role, site_id, password_hash, assigned_sites)
       VALUES ($1, $2, $3, $4, $5, $6, $7, ${assignedSitesArray})
       RETURNING id, client_id, email, name, phone, role, site_id, assigned_sites, created_at`,
      params
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
    if (err instanceof z.ZodError) return next(new ValidationError('Invalid input', err.errors));
    if (err.code === '23505') return next(new ValidationError('Email already exists for this client'));
    next(err);
  }
});

// --- POST /api/admin/employees/import (CSV bulk) ---

router.post('/employees/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return next(new ValidationError('CSV file is required'));
    if (!req.body.client_id) return next(new ValidationError('client_id is required'));

    const clientId = req.body.client_id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) return next(new ValidationError('Invalid client_id'));

    const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1', [clientId]);
    if (clientCheck.rowCount === 0) return next(new ValidationError('Client not found'));

    const csvText = req.file.buffer.toString('utf-8');
    const rows = await parseCsv(csvText);

    if (rows.length === 0) return next(new ValidationError('CSV file is empty'));
    if (rows.length > 500) return next(new ValidationError('Max 500 employees per import'));

    const results = { created: 0, skipped: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNum = i + 2; // 1-indexed + header row

      try {
        const parsed = EmployeeSchema.parse({
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

        // Verify assigned_sites belong to this client (cross-tenant isolation)
        if (parsed.assigned_sites.length > 0) {
          const ownedSites = await pool.query(
            'SELECT id FROM sites WHERE id = ANY($1::UUID[]) AND client_id = $2',
            [parsed.assigned_sites, clientId]
          );
          if (ownedSites.rowCount !== parsed.assigned_sites.length) {
            results.errors.push({ line: lineNum, email: row.email, error: 'One or more assigned_sites do not belong to this client' });
            results.skipped++;
            continue;
          }
        }

        const tempPassword = generateTempPassword();
        const passwordHash = await hashPassword(tempPassword);

        const assignedSitesArray = parsed.assigned_sites.length > 0
          ? `ARRAY[${parsed.assigned_sites.map((_, j) => `$${j + 8}`).join(',')}]::UUID[]`
          : 'ARRAY[]::UUID[]';

        const insertResult = await pool.query(
          `INSERT INTO employees (client_id, email, name, phone, role, site_id, password_hash, assigned_sites)
           VALUES ($1, $2, $3, $4, $5, $6, $7, ${assignedSitesArray})
           ON CONFLICT (client_id, email) DO NOTHING`,
          [parsed.client_id, parsed.email, parsed.name, parsed.phone || null,
            parsed.role, parsed.site_id || null, passwordHash, ...parsed.assigned_sites]
        );
        if (insertResult.rowCount > 0) {
          results.created++;
        } else {
          results.skipped++; // duplicate email for this client
        }
      } catch (rowErr) {
        results.errors.push({ line: lineNum, email: rows[i].email, error: rowErr.message });
        results.skipped++;
      }
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
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(client_id)) {
        return next(new ValidationError('Invalid client_id format'));
      }
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
