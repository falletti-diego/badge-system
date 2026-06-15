'use strict';

const express = require('express');
const { pool } = require('../../db/pool');
const { ForbiddenError, NotFoundError } = require('../../utils/errors');
const { logAudit } = require('../../middleware/audit');
const { AdminSettingsSchema, createValidationMiddleware } = require('../../middleware/validation');

const router = express.Router();

router.put('/', createValidationMiddleware(AdminSettingsSchema), async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(new ForbiddenError('Only admins can update settings', 'FORBIDDEN_ROLE'));
  }

  const { meal_voucher_hours, geofencing_feature_enabled } = req.validated.body;
  const clientId = req.user.client_id;

  try {
    const setClauses = [];
    const params = [];

    if (meal_voucher_hours !== undefined) {
      params.push(meal_voucher_hours);
      setClauses.push(`meal_voucher_hours = $${params.length}`);
    }

    if (geofencing_feature_enabled !== undefined) {
      params.push(geofencing_feature_enabled);
      setClauses.push(`geofencing_feature_enabled = $${params.length}`);
    }

    params.push(clientId);
    const result = await pool.query(
      `UPDATE clients SET ${setClauses.join(', ')} WHERE id = $${params.length}::uuid
       RETURNING id, meal_voucher_hours, geofencing_feature_enabled`,
      params
    );

    if (result.rowCount === 0) {
      return next(new NotFoundError('Client not found', 'CLIENT_NOT_FOUND'));
    }

    await logAudit(pool, {
      action: 'update_settings',
      entity: 'client',
      entityId: clientId,
      oldValue: null,
      newValue: { meal_voucher_hours, geofencing_feature_enabled },
      userId: req.user.user_id,
    }).catch(() => {});

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
