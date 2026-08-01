'use strict';

const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { pool } = require('../../db/pool');
const { generateTemplate } = require('../../services/employeeSync/generateTemplate');
const { parseTemplate } = require('../../services/employeeSync/parseTemplate');
const { validateSyntax } = require('../../services/employeeSync/validate');
const { computeDiff } = require('../../services/employeeSync/computeDiff');
const { applyDiff } = require('../../services/employeeSync/applyDiff');
const { resolveTenantScope } = require('../../utils/tenantScope');
const { ValidationError } = require('../../utils/errors');
const { sendEmail, buildEmployeeWelcomeEmail } = require('../../utils/email');
const logger = require('../../utils/logger');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

function validateClientId(req, next) {
  if (req.user.role === 'superadmin' && req.query.client_id) {
    if (!z.string().uuid().safeParse(req.query.client_id).success) {
      next(new ValidationError('Invalid client_id'));
      return null;
    }
  }
  return resolveTenantScope(req.user, req.query.client_id);
}

// Stessa logica di validateClientId, ma legge da req.body — usata dalle route
// POST multipart (/preview, /apply) dove il client_id arriva come form field,
// non come query string.
function validateClientIdFromBody(req, next) {
  if (req.user.role === 'superadmin' && req.body.client_id) {
    if (!z.string().uuid().safeParse(req.body.client_id).success) {
      next(new ValidationError('Invalid client_id'));
      return null;
    }
  }
  return resolveTenantScope(req.user, req.body.client_id);
}

/**
 * Esegue parse → validateSyntax → (se valido) computeDiff, senza mai
 * scrivere sul DB. Riusata anche dall'apply (Task 9) come base del dry-run
 * prima del commit effettivo.
 */
async function runPreviewDiff(buffer, clientId) {
  const data = await parseTemplate(buffer);
  const errors = validateSyntax(data);
  if (errors.length > 0) return { errors, diff: null };

  const dbEmployees = (await pool.query(
    'SELECT * FROM employees WHERE client_id = $1::uuid',
    [clientId]
  )).rows;
  const sites = (await pool.query(
    'SELECT id, name FROM sites WHERE client_id = $1::uuid',
    [clientId]
  )).rows;
  const siteIdByName = new Map(sites.map((s) => [s.name, s.id]));

  const diff = computeDiff(data.dipendenti, dbEmployees, siteIdByName);
  return { errors: [], diff };
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

router.post('/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return next(new ValidationError('Excel file is required'));
    const clientId = validateClientIdFromBody(req, next);
    if (!clientId) return; // validateClientIdFromBody ha già chiamato next(err)

    const { errors, diff } = await runPreviewDiff(req.file.buffer, clientId);
    if (errors.length > 0) {
      return res.json({ data: { errors, nuovi: [], riattivati: [], rimossi: [], modificati: [], anomalie: [] } });
    }

    res.json({ data: { errors: [], ...diff } });
  } catch (err) {
    next(err);
  }
});

router.post('/apply', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return next(new ValidationError('Excel file is required'));
    const clientId = validateClientIdFromBody(req, next);
    if (!clientId) return; // validateClientIdFromBody ha già chiamato next(err)

    const { errors, diff } = await runPreviewDiff(req.file.buffer, clientId);
    if (errors.length > 0) {
      return res.json({ data: { errors, nuovi: [], riattivati: [], rimossi: [], modificati: [], anomalie: [] } });
    }

    const client = await pool.connect();
    let result;
    try {
      await client.query('BEGIN');
      result = await applyDiff(client, diff, { clientId });
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

    const failedEmails = [];
    for (const cred of result.credentials) {
      try {
        await sendEmail(buildEmployeeWelcomeEmail({
          to: cred.email,
          tempPassword: cred.password,
          clientName: req.user.name || 'il tuo datore di lavoro',
        }));
      } catch (emailErr) {
        logger.warn({ action: 'employee_sync_welcome_email_failed', client_id: clientId, employee_email: cred.email, error: emailErr.message });
        failedEmails.push({ id: cred.id, email: cred.email });
      }
    }

    res.json({ data: { errors: [], ...diff, failedEmails } });
  } catch (err) {
    next(err);
  }
});

router.get('/export-history', async (req, res, next) => {
  try {
    const clientId = validateClientId(req, next);
    if (!clientId) return;

    const rows = (await pool.query(
      `SELECT name, email, phone, role, active, hiring_date, exit_date, external_employee_id
       FROM employees WHERE client_id = $1::uuid ORDER BY hiring_date`,
      [clientId]
    )).rows;

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Storico Dipendenti');
    ws.addRow(['nome_completo', 'email', 'telefono', 'ruolo', 'stato', 'data_assunzione', 'data_uscita', 'matricola']);
    for (const r of rows) {
      ws.addRow([r.name, r.email, r.phone || '', r.role, r.active ? 'Attivo' : 'Inattivo', r.hiring_date || '', r.exit_date || '', r.external_employee_id || '']);
    }
    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="storico-dipendenti.xlsx"');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = { router, runPreviewDiff };
