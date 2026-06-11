'use strict';

const express = require('express');
const { z } = require('zod');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { ValidationError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');
const { logAudit } = require('../middleware/audit');

const router = express.Router();

// All consent routes require auth
router.use(requireAuth);

// =====================================================
// POST /api/consent/gps-acceptance
// Employee accepts GPS consent (GDPR Art. 7)
// Called by mobile app on first GPS check-in
// =====================================================
router.post('/gps-acceptance', async (req, res, next) => {
  try {
    const { client_id, employee_id } = req.user;
    const { consent_given, privacy_policy_version } = req.body;

    // Validate inputs
    const schema = z.object({
      consent_given: z.boolean(),
      privacy_policy_version: z.string().default('2.0'),
    });

    const parsed = schema.safeParse({ consent_given, privacy_policy_version });
    if (!parsed.success) {
      return next(new ValidationError(parsed.error.errors[0].message));
    }

    const { consent_given: consentValue, privacy_policy_version: ppVersion } = parsed.data;

    // Update employee's gps_consent_given flag
    const updateResult = await pool.query(
      `UPDATE employees
       SET gps_consent_given = $1, gps_consent_given_at = CASE WHEN $1 = true THEN NOW() ELSE gps_consent_given_at END
       WHERE id = $2 AND client_id = $3
       RETURNING id, email, gps_consent_given, gps_consent_given_at`,
      [consentValue, employee_id, client_id]
    );

    if (updateResult.rows.length === 0) {
      return next(new ValidationError('Employee not found or permission denied'));
    }

    // Log consent in audit trail
    const logResult = await pool.query(
      `INSERT INTO employee_consent_log
       (employee_id, client_id, consent_type, consent_given, privacy_policy_version, user_agent, ip_address, accepted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING id, accepted_at`,
      [
        employee_id,
        client_id,
        'gps',
        consentValue,
        ppVersion,
        req.get('user-agent') || 'unknown',
        req.ip || '0.0.0.0',
      ]
    );

    // Log to audit trail (optional, non-fatal if fails)
    await logAudit(pool, {
      action: 'gps_consent_recorded',
      entity: 'employee_consent_log',
      entity_id: logResult.rows[0].id,
      old_value: null,
      new_value: JSON.stringify({
        employee_id,
        consent_type: 'gps',
        consent_given: consentValue,
        privacy_policy_version: ppVersion,
      }),
      user_id: employee_id,
      client_id,
    }).catch((err) => logger.warn('Audit log GPS consent failed:', err));

    res.status(201).json({
      success: true,
      message: consentValue ? 'GPS consent accepted' : 'GPS consent declined',
      data: {
        employee_id,
        gps_consent_given: consentValue,
        gps_consent_given_at: updateResult.rows[0].gps_consent_given_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================
// GET /api/consent/my-consents
// Retrieve own consent history (employee view)
// =====================================================
router.get('/my-consents', async (req, res, next) => {
  try {
    const { employee_id, client_id } = req.user;

    const result = await pool.query(
      `SELECT id, consent_type, consent_given, accepted_at, privacy_policy_version, notes
       FROM employee_consent_log
       WHERE employee_id = $1 AND client_id = $2
       ORDER BY accepted_at DESC
       LIMIT 20`,
      [employee_id, client_id]
    );

    res.json({
      success: true,
      data: result.rows,
      returned: result.rows.length,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
