'use strict';

const express = require('express');
const { z } = require('zod');
const { randomBytes } = require('crypto');
const { pool } = require('../../db/pool');
const { ValidationError, NotFoundError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const { logAudit } = require('../../middleware/audit');
const { hashPassword } = require('../../auth/password');
const { AdminViewerSchema, createValidationMiddleware } = require('../../middleware/validation');

const router = express.Router();

function generateTempPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

router.post('/', createValidationMiddleware(AdminViewerSchema), async (req, res, next) => {
  try {
    const data = req.validated.body;

    const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1', [data.client_id]);
    if (clientCheck.rowCount === 0) return next(new ValidationError('Client not found'));

    const tempPassword = data.password || generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, password_hash)
       VALUES ($1, $2, $3, 'viewer', $4)
       RETURNING id, client_id, email, name, role, created_at`,
      [data.client_id, data.email, data.name, passwordHash]
    );

    const viewer = result.rows[0];
    logger.info({ action: 'admin_create_viewer', viewer_id: viewer.id, client_id: data.client_id });
    await logAudit(pool, {
      action: 'admin_create_viewer',
      entity: 'employee',
      entityId: viewer.id,
      clientId: viewer.client_id,
      oldValue: null,
      newValue: { name: viewer.name, email: viewer.email, role: 'viewer' },
      userId: req.user.user_id,
    }).catch(() => {});

    res.status(201).json({
      success: true,
      data: viewer,
      temp_password: data.password ? undefined : tempPassword,
    });
  } catch (err) {
    if (err.code === '23505') return next(new ValidationError('Email already exists for this client'));
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { client_id } = req.query;
    const params = [];
    let where = "WHERE e.role = 'viewer'";
    if (client_id) {
      const uuidCheck = z.string().uuid().safeParse(client_id);
      if (!uuidCheck.success) return next(new ValidationError('Invalid client_id format'));
      params.push(client_id);
      where += ' AND e.client_id = $1';
    }
    const result = await pool.query(
      `SELECT e.id, e.client_id, e.email, e.name, e.role, e.created_at,
              c.name AS client_name
       FROM employees e
       JOIN clients c ON c.id = e.client_id
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
    if (!z.string().uuid().safeParse(id).success) {
      return next(new ValidationError('Invalid viewer id'));
    }

    const result = await pool.query(
      "DELETE FROM employees WHERE id = $1 AND client_id = $2::uuid AND role = 'viewer' RETURNING id, name, email, client_id",
      [id, req.user.client_id]
    );
    if (result.rowCount === 0) return next(new NotFoundError('Viewer not found', 'VIEWER_NOT_FOUND'));

    const viewer = result.rows[0];
    logger.info({ action: 'admin_delete_viewer', viewer_id: viewer.id, email: viewer.email });
    await logAudit(pool, {
      action: 'admin_delete_viewer',
      entity: 'employee',
      entityId: viewer.id,
      clientId: viewer.client_id,
      oldValue: { name: viewer.name, email: viewer.email, role: 'viewer' },
      newValue: null,
      userId: req.user.user_id,
    }).catch((err) => logger.warn({ action: 'audit_log_failed', viewer_id: viewer.id, error: err.message }));

    res.json({ success: true, message: `Commercialista "${viewer.name}" rimosso.` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
