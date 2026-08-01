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
const { resolveSiteIdByName } = require('../../services/employeeSync/ensureSites');
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
 * scrivere sul DB. Usata da `/preview` (db = pool, createSites = false).
 *
 * `/apply` NON riusa questa funzione per il calcolo finale: le sedi nuove
 * dichiarate nel foglio Sedi vanno create per davvero dentro la stessa
 * transazione dell'apply (vedi `resolveSiteIdByName`), quindi ricalcola il
 * diff con la mappa sedi aggiornata subito dopo averle create — altrimenti
 * un dipendente assegnato a una sede nuova risulterebbe silenziosamente
 * disassociato da qualunque sede invece che assegnato a quella nuova (bug
 * reale trovato testando la Sezione 8 della checklist manuale su staging).
 */
async function runPreviewDiff(buffer, clientId, db = pool, { createSites = false } = {}) {
  const data = await parseTemplate(buffer);
  const errors = validateSyntax(data);
  if (errors.length > 0) return { errors, diff: null, data: null };

  // Scope del wizard: solo personale operativo legato a una sede (employee/manager).
  // Admin e viewer non hanno assegnazione di sede e sono gestiti altrove in Admin.
  const dbEmployees = (await db.query(
    'SELECT * FROM employees WHERE client_id = $1::uuid AND role IN (\'employee\', \'manager\')',
    [clientId]
  )).rows;
  const siteIdByName = await resolveSiteIdByName(db, data.sedi, clientId, { create: createSites });

  const diff = computeDiff(data.dipendenti, dbEmployees, siteIdByName);
  return { errors: [], diff, data };
}

router.get('/template', async (req, res, next) => {
  try {
    const clientId = validateClientId(req, next);
    if (!clientId) return;

    const employees = (await pool.query(
      'SELECT name, email, phone, role, site_id, assigned_sites, external_employee_id, hiring_date FROM employees WHERE client_id = $1::uuid AND active = true AND role IN (\'employee\', \'manager\')',
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

    // Prima passata solo per gli errori di sintassi (fail-fast, non serve
    // ancora una connessione dedicata/transazione per questo controllo).
    const { errors: syntaxErrors } = await runPreviewDiff(req.file.buffer, clientId);
    if (syntaxErrors.length > 0) {
      return res.json({ data: { errors: syntaxErrors, nuovi: [], riattivati: [], rimossi: [], modificati: [], anomalie: [] } });
    }

    const client = await pool.connect();
    let result;
    let diff;
    try {
      await client.query('BEGIN');
      // Ricalcola il diff DENTRO la transazione: le sedi nuove dichiarate nel
      // foglio Sedi vengono create per davvero qui (createSites: true), cosa
      // che /preview non fa mai — il diff usato per l'apply deve riflettere
      // le sedi reali appena create, non i placeholder del preview.
      ({ diff } = await runPreviewDiff(req.file.buffer, clientId, client, { createSites: true }));
      result = await applyDiff(client, diff, { clientId });
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      // Un vincolo UNIQUE (es. matricola già assegnata a un altro dipendente
      // non presente nel file, quindi non intercettato da validateSyntax) non
      // deve propagarsi come 500 grezzo — stesso trattamento già usato per
      // la creazione singola in admin/employees.js.
      if (txErr.code === '23505') {
        return next(new ValidationError('Una o più righe del file confliggono con dati già esistenti (email o matricola già in uso da un altro dipendente).'));
      }
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
