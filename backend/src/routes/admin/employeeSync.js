'use strict';

const express = require('express');
const { z } = require('zod');
const { pool } = require('../../db/pool');
const { generateTemplate } = require('../../services/employeeSync/generateTemplate');
const { resolveTenantScope } = require('../../utils/tenantScope');
const { ValidationError } = require('../../utils/errors');

const router = express.Router();

function validateClientId(req, next) {
  if (req.user.role === 'superadmin' && req.query.client_id) {
    if (!z.string().uuid().safeParse(req.query.client_id).success) {
      next(new ValidationError('Invalid client_id'));
      return null;
    }
  }
  return resolveTenantScope(req.user, req.query.client_id);
}

router.get('/template', async (req, res, next) => {
  try {
    const clientId = validateClientId(req, next);
    if (!clientId) return;

    const employees = (await pool.query(
      'SELECT name, email, phone, role, site_id, external_employee_id, hiring_date FROM employees WHERE client_id = $1::uuid AND active = true',
      [clientId]
    )).rows;
    const sites = (await pool.query(
      'SELECT id, name, location, latitude, longitude, geofence_radius_meters FROM sites WHERE client_id = $1::uuid',
      [clientId]
    )).rows;

    const buffer = await generateTemplate({ employees, sites });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="aggiorna-dipendenti.xlsx"');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
