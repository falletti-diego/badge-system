'use strict';

const express = require('express');
const { z } = require('zod');
const { pool } = require('../../db/pool');
const { ValidationError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const { logAudit } = require('../../middleware/audit');
const { AdminClientSchema, createValidationMiddleware } = require('../../middleware/validation');
const { requireSuperadmin } = require('../../middleware/requireSuperadmin');

const router = express.Router();

router.post('/', requireSuperadmin, createValidationMiddleware(AdminClientSchema), async (req, res, next) => {
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

router.get('/', async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.user.role !== 'superadmin') {
      params.push(req.user.client_id);
      where = 'WHERE c.id = $1';
    }
    const result = await pool.query(
      `SELECT c.id, c.name, c.email, c.plan, c.created_at,
              c.meal_voucher_hours, c.geofencing_feature_enabled,
              COUNT(DISTINCT s.id) AS site_count,
              COUNT(DISTINCT e.id) AS employee_count
       FROM clients c
       LEFT JOIN sites s ON s.client_id = c.id
       LEFT JOIN employees e ON e.client_id = c.id
       ${where}
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT 500`,
      params
    );
    res.json({ success: true, data: result.rows, returned: result.rows.length });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireSuperadmin, async (req, res, next) => {
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
    }).catch((err) => {
      logger.warn({ action: 'audit_log_error', error: err.message, client_id: client.id });
    });

    logger.info({ action: 'admin_delete_client', client_id: client.id, name: client.name });
    res.json({ success: true, message: `Cliente "${client.name}" eliminato.` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
