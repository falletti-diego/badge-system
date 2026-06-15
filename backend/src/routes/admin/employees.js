'use strict';

const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse');
const { z } = require('zod');
const { randomBytes } = require('crypto');
const { pool } = require('../../db/pool');
const { hashPassword } = require('../../auth/password');
const { ValidationError, NotFoundError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const { logAudit } = require('../../middleware/audit');
const { AdminEmployeeSchema, createValidationMiddleware } = require('../../middleware/validation');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const CsvRowSchema = z.object({
  client_id: z.string().uuid(),
  email: z.string().email().max(100),
  name: z.string().min(2).max(100),
  phone: z.string().max(20).optional(),
  role: z.enum(['employee', 'manager']).default('employee'),
  site_name: z.string().min(1).max(100).optional().nullable(),
  external_employee_id: z.string().max(50).optional().nullable(),
});

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

router.post('/', createValidationMiddleware(AdminEmployeeSchema), async (req, res, next) => {
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

// Must be registered before /:id to avoid Express matching 'import' as an id param
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return next(new ValidationError('CSV file is required'));
    if (!req.body.client_id) return next(new ValidationError('client_id is required'));

    const clientId = req.body.client_id;
    const uuidCheck = z.string().uuid().safeParse(clientId);
    if (!uuidCheck.success) return next(new ValidationError('Invalid client_id'));

    const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1', [clientId]);
    if (clientCheck.rowCount === 0) return next(new ValidationError('Client not found'));

    const csvText = req.file.buffer.toString('utf-8');
    const rows = await parseCsv(csvText);

    if (rows.length === 0) return next(new ValidationError('CSV file is empty'));
    if (rows.length > 500) return next(new ValidationError('Max 500 employees per import'));

    const sitesResult = await pool.query(
      'SELECT id, name FROM sites WHERE client_id = $1',
      [clientId]
    );
    const siteByName = new Map(sitesResult.rows.map((r) => [r.name.trim().toLowerCase(), r.id]));

    logger.info({
      action: 'admin_import_sites_debug',
      client_id: clientId,
      sites_found: sitesResult.rows.map(r => ({ id: r.id, name: r.name })),
      sites_map: Array.from(siteByName.entries()),
    });

    const results = { created: 0, skipped: 0, errors: [], passwords: [] };

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

        let siteId = null;
        if (parsed.site_name) {
          siteId = siteByName.get(parsed.site_name.toLowerCase());
          if (!siteId) {
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

    const HASH_BATCH = 10;
    for (let i = 0; i < prepared.length; i += HASH_BATCH) {
      const batch = prepared.slice(i, i + HASH_BATCH);
      await Promise.all(batch.map(async (item) => {
        item.tempPassword = generateTempPassword();
        item.passwordHash = await hashPassword(item.tempPassword);
      }));
    }

    const pgClient = await pool.connect();
    try {
      await pgClient.query('BEGIN');

      for (const item of prepared) {
        const { parsed, siteId, passwordHash } = item;
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
          results.passwords.push({ email: emp.email, temp_password: item.tempPassword });
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

router.get('/', async (req, res, next) => {
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

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const uuidCheck = z.string().uuid().safeParse(id);
    if (!uuidCheck.success) return next(new ValidationError('Invalid employee id'));

    const result = await pool.query(
      'DELETE FROM employees WHERE id = $1 AND client_id = $2::uuid RETURNING id, name, email, client_id',
      [id, req.user.client_id]
    );
    if (result.rowCount === 0) return next(new NotFoundError('Employee not found', 'EMPLOYEE_NOT_FOUND'));

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

router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!z.string().uuid().safeParse(id).success) {
      return next(new ValidationError('Invalid employee id'));
    }

    const newPassword = generateTempPassword();
    const passwordHash = await hashPassword(newPassword);

    const updateResult = await pool.query(
      'UPDATE employees SET password_hash = $1, must_change_password = true WHERE id = $2 AND client_id = $3::uuid RETURNING id, name, email, client_id',
      [passwordHash, id, req.user.client_id]
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

module.exports = router;
