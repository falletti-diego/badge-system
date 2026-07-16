'use strict';

const express = require('express');
const { z } = require('zod');
const { randomUUID } = require('crypto');
const { pool } = require('../../db/pool');
const { ValidationError, NotFoundError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const { logAudit } = require('../../middleware/audit');
const {
  AdminSiteSchema,
  UpdateSiteGeofenceSchema,
  createValidationMiddleware,
} = require('../../middleware/validation');

const router = express.Router();

router.post('/', createValidationMiddleware(AdminSiteSchema), async (req, res, next) => {
  try {
    const data = req.validated.body;
    const targetClientId = req.user.role === 'superadmin' ? data.client_id : req.user.client_id;

    const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1', [targetClientId]);
    if (clientCheck.rowCount === 0) return next(new ValidationError('Client not found'));

    const siteId = randomUUID();
    const qrContent = `badge://checkin?site_id=${siteId}&client_id=${targetClientId}&v=1`;

    const result = await pool.query(
      `INSERT INTO sites (id, client_id, name, location, qr_code_content)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, client_id, name, location, qr_code_content, created_at`,
      [siteId, targetClientId, data.name, data.location || null, qrContent]
    );

    const site = result.rows[0];
    logger.info({ action: 'admin_create_site', site_id: site.id, client_id: targetClientId });
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

router.get('/', async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.user.role === 'superadmin') {
      const { client_id } = req.query;
      if (client_id) {
        const uuidCheck = z.string().uuid().safeParse(client_id);
        if (!uuidCheck.success) return next(new ValidationError('Invalid client_id format'));
        params.push(client_id);
        where = 'WHERE s.client_id = $1';
      }
    } else {
      params.push(req.user.client_id);
      where = 'WHERE s.client_id = $1';
    }
    const result = await pool.query(
      `SELECT s.id, s.client_id, s.name, s.location, s.qr_code_content, s.created_at,
              s.latitude, s.longitude, s.geofence_radius_meters, s.geofence_enabled,
              c.name AS client_name, c.geofencing_feature_enabled
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

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const uuidCheck = z.string().uuid().safeParse(id);
    if (!uuidCheck.success) return next(new ValidationError('Invalid site id'));

    const isSuperadmin = req.user.role === 'superadmin';
    const params = isSuperadmin ? [id] : [id, req.user.client_id];
    const scopeClause = isSuperadmin ? '' : 'AND client_id = $2::uuid';

    const result = await pool.query(
      `DELETE FROM sites WHERE id = $1 ${scopeClause} RETURNING id, name, client_id`,
      params
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
    }).catch((err) => logger.warn({ action: 'admin_delete_site_failed', error: err.message }));

    logger.info({ action: 'admin_delete_site', site_id: site.id, name: site.name });
    res.json({ success: true, message: `Sede "${site.name}" eliminata.` });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', createValidationMiddleware(UpdateSiteGeofenceSchema), async (req, res, next) => {
  const { client_id } = req.user;
  const { id } = req.validated.params;
  const { latitude, longitude, geofence_radius_meters, geofence_enabled } = req.validated.body;

  try {
    const result = await pool.query(
      `UPDATE sites
       SET latitude = $1, longitude = $2,
           geofence_radius_meters = $3, geofence_enabled = $4,
           updated_at = NOW()
       WHERE id = $5::uuid AND client_id = $6::uuid
       RETURNING id, name, latitude, longitude, geofence_radius_meters, geofence_enabled`,
      [latitude ?? null, longitude ?? null, geofence_radius_meters, geofence_enabled, id, client_id]
    );

    if (result.rows.length === 0) return next(new NotFoundError('Site not found or not in your organization', 'SITE_NOT_FOUND'));

    await logAudit(pool, {
      action: 'admin_update_site_geofence',
      entity: 'site',
      entityId: id,
      clientId: client_id,
      oldValue: null,
      newValue: { latitude, longitude, geofence_radius_meters, geofence_enabled },
      userId: req.user.user_id,
    }).catch((err) => logger.warn({ action: 'audit_log_failed', error: err.message }));

    logger.info({ action: 'admin_update_site_geofence', site_id: id, geofence_enabled });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
