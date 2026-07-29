'use strict';

const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { pool } = require('../../db/pool');
const { parseWorkbook } = require('../../services/onboarding/parseWorkbook');
const { validate } = require('../../services/onboarding/validate');
const { validateAgainstDb } = require('../../services/onboarding/validateAgainstDb');
const { apply } = require('../../services/onboarding/apply');
const { ValidationError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const { resolveTenantScope } = require('../../utils/tenantScope');
const { sendEmail, buildEmployeeWelcomeEmail } = require('../../utils/email');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

/**
 * Riesegue l'esatta sequenza già usata dal CLI (onboard-client.js): parse →
 * validate → BEGIN → validateAgainstDb → apply → COMMIT/ROLLBACK. Un solo
 * punto di verità tra preview e apply — `commit: false` rende `preview`
 * strutturalmente identica al flag `--dry-run` del CLI, non una
 * reimplementazione parallela della stessa logica.
 */
async function runOnboarding(buffer, { clientId, commit }) {
  const data = await parseWorkbook(buffer);
  const { errors: fileErrors, warnings } = validate(data);
  if (fileErrors.length > 0) {
    return { errors: fileErrors, warnings, summary: null, credentials: [] };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dbErrors = await validateAgainstDb(client, data, { clientId });
    if (dbErrors.length > 0) {
      await client.query('ROLLBACK');
      return { errors: dbErrors, warnings, summary: null, credentials: [] };
    }

    const result = await apply(client, data, { clientId, year: new Date().getFullYear() });
    await client.query(commit ? 'COMMIT' : 'ROLLBACK');

    return { errors: [], warnings, summary: result.summary, credentials: result.credentials };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function validateClientId(req, next) {
  if (req.user.role === 'superadmin' && req.body.client_id) {
    const uuidCheck = z.string().uuid().safeParse(req.body.client_id);
    if (!uuidCheck.success) {
      next(new ValidationError('Invalid client_id'));
      return null;
    }
  }
  return resolveTenantScope(req.user, req.body.client_id);
}

router.post('/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return next(new ValidationError('Excel file is required'));
    const clientId = validateClientId(req, next);
    if (!clientId) return; // validateClientId ha già chiamato next(err)

    const result = await runOnboarding(req.file.buffer, { clientId, commit: false });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/apply', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return next(new ValidationError('Excel file is required'));
    const clientId = validateClientId(req, next);
    if (!clientId) return;

    const result = await runOnboarding(req.file.buffer, { clientId, commit: true });

    if (result.errors.length > 0) {
      return res.json({ data: { ...result, failedEmails: [] } });
    }

    // Email di benvenuto DOPO il commit — mai bloccare/rollbackare l'apply
    // per un problema SES. Solo ai dipendenti NUOVI (result.credentials
    // contiene già solo quelli, mai gli aggiornati — vedi apply.js).
    // failedEmails include l'id dipendente (non solo l'email) così il wizard
    // può proporre un'azione di recupero mirata (rigenera credenziali via
    // POST /admin/employees/:id/reset-password) senza dover ri-eseguire
    // l'intero import.
    const failedEmails = [];
    for (const cred of result.credentials) {
      try {
        await sendEmail(buildEmployeeWelcomeEmail({
          to: cred.email,
          tempPassword: cred.password,
          clientName: req.user.name || 'il tuo datore di lavoro',
        }));
      } catch (emailErr) {
        logger.warn({
          action: 'onboarding_welcome_email_failed',
          client_id: clientId,
          employee_email: cred.email,
          error: emailErr.message,
        }, 'Welcome email non inviata dopo apply onboarding');
        failedEmails.push({ id: cred.id, email: cred.email });
      }
    }

    res.json({ data: { ...result, failedEmails } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
