/**
 * Illness (Malattia) Routes
 * POST /api/v1/illnesses/report — Employee communica malattia
 * GET /api/v1/illnesses/admin — Admin visualizza tutte
 * DELETE /api/v1/illnesses/:id — Admin cancella (errore/compliance)
 * GET /api/v1/illnesses/manager — Manager visualizza (suo store)
 * GET /api/v1/illnesses/by-date-range — Fetches illnesses for date range (for planning)
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/pool');
const { createValidationMiddleware } = require('../middleware/validation');
const { logAudit } = require('../middleware/audit');
const { withTransaction } = require('../middleware/db-transaction');
const { requireAuth } = require('../middleware/auth');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');
const { z } = require('zod');

const router = express.Router();

// =====================================================
// Validation Schemas
// =====================================================

const ReportIllnessSchema = z.object({
  body: z.object({
    start_date: z.string().date('Data inizio non valida'),
    end_date: z.string().date('Data fine non valida'),
    reason: z.string().max(500).optional().nullable(),
    // certificate_url: uploaded separately (MVP: optional)
  }),
});

const DeleteIllnessSchema = z.object({
  params: z.object({
    id: z.string().uuid('ID non valido'),
  }),
  body: z.object({
    cancellation_reason: z.string().max(500).optional(),
  }),
});

// =====================================================
// POST /api/v1/illnesses/report — Employee comunica malattia
// =====================================================

router.post(
  '/report',
  requireAuth,
  createValidationMiddleware(ReportIllnessSchema),
  async (req, res, next) => {
    const { start_date, end_date, reason } = req.validated.body;
    const userId = req.user.user_id;
    // Managers have a separate employee_id (their employee record) distinct from their login user_id
    const employeeId = req.user.employee_id ?? req.user.user_id;
    const clientId = req.user.client_id;

    try {
      // Only employees and managers can report illnesses
      if (req.user.role === 'admin' || req.user.role === 'viewer') {
        throw new ForbiddenError(
          'Solo dipendenti e manager possono comunicare malattia.',
          'FORBIDDEN_ROLE'
        );
      }

      // Ensure start_date and end_date are Date objects
      const startDate = new Date(start_date);
      const endDate = new Date(end_date);

      // Validate date order
      if (startDate > endDate) {
        throw new ValidationError('Data fine deve essere >= data inizio', {
          field: 'date_range',
          code: 'INVALID_DATE_RANGE',
        });
      }

      // Calculate num_days (inclusive)
      const timeDiff = endDate.getTime() - startDate.getTime();
      const numDays = Math.floor(timeDiff / (1000 * 60 * 60 * 24)) + 1;

      const result = await withTransaction(async (client) => {
        // 1. Verify employee exists and belongs to this client
        const userResult = await client.query(
          'SELECT id, client_id FROM employees WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1',
          [employeeId, clientId]
        );

        if (userResult.rows.length === 0) {
          throw new NotFoundError(
            'Utente non trovato o non assegnato alla tua organizzazione',
            'USER_NOT_FOUND'
          );
        }

        // 2. Create illness record (always auto-approved for communication)
        const illnessId = uuidv4();
        const illnessResult = await client.query(
          `INSERT INTO illnesses
           (id, client_id, employee_id, start_date, end_date, num_days, reason, created_at, created_by)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5::date, $6, $7, NOW(), $8::uuid)
           RETURNING *`,
          [
            illnessId,
            clientId,
            employeeId,
            start_date,
            end_date,
            numDays,
            reason || null,
            employeeId, // created_by = employee themselves
          ]
        );

        const illness = illnessResult.rows[0];

        // 3. Log audit trail
        await logAudit(client, {
          action: 'illness_reported',
          entity: 'illness',
          entityId: illness.id,
          clientId,
          oldValue: null,
          newValue: {
            start_date,
            end_date,
            num_days: numDays,
            reason,
          },
          userId,
        });

        return illness;
      });

      logger.info({
        action: 'illness_reported',
        illness_id: result.id,
        employee_id: userId,
        num_days: numDays,
        start_date,
        end_date,
      });

      res.status(201).json({
        data: result,
        message: 'Comunicazione malattia inviata con successo',
      });
    } catch (error) {
      next(error);
    }
  }
);

// =====================================================
// GET /api/v1/illnesses/by-date-range — Get illnesses for date range (planning)
// RBAC: Admin=all, Manager=own store, Employee=own illnesses
// =====================================================

router.get('/by-date-range', requireAuth, async (req, res, next) => {
  const userId = req.user.user_id;
  const clientId = req.user.client_id;
  const role = req.user.role;
  const siteId = req.user.site_id;
  const { start_date, end_date } = req.query;

  try {
    // Validate dates
    if (!start_date || !end_date) {
      throw new ValidationError('start_date e end_date sono richiesti', {
        field: 'query',
        code: 'MISSING_DATES',
      });
    }

    let query = `
      SELECT
        i.id, i.employee_id, i.start_date, i.end_date, i.num_days,
        i.reason, i.certificate_url, i.created_at,
        e.name as employee_name, e.email as employee_email, e.site_id
       FROM illnesses i
       JOIN employees e ON i.employee_id = e.id
       WHERE i.client_id = $1::uuid
       AND i.cancelled_at IS NULL
       AND i.start_date <= $3::date
       AND i.end_date >= $2::date
    `;

    const params = [clientId, start_date, end_date];

    // RBAC filtering
    if (role === 'admin') {
      // Admin sees all
    } else if (role === 'manager' && siteId) {
      // Manager sees only their store employees
      query += ' AND e.site_id = $4::uuid';
      params.push(siteId);
    } else if (role === 'employee') {
      // Employee sees only their own illnesses
      query += ' AND i.employee_id = $4::uuid';
      params.push(userId);
    } else {
      throw new ForbiddenError(
        'Non hai permessi per visualizzare le malattie',
        'FORBIDDEN'
      );
    }

    query += ' ORDER BY i.start_date ASC';

    const result = await pool.query(query, params);

    logger.info({
      action: 'illnesses_by_date_range_viewed',
      user_id: userId,
      role,
      count: result.rows.length,
    });

    res.status(200).json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// GET /api/v1/illnesses/admin — Admin visualizza tutte le malattie
// =====================================================

router.get('/admin', requireAuth, async (req, res, next) => {
  const userId = req.user.user_id;
  const clientId = req.user.client_id;
  const role = req.user.role;

  try {
    // RBAC: Only admin can view all illnesses
    if (role !== 'admin') {
      throw new ForbiddenError(
        'Non hai permessi per visualizzare tutte le malattie',
        'FORBIDDEN'
      );
    }

    let query = `
      SELECT
        i.id, i.client_id, i.employee_id, i.start_date, i.end_date,
        i.num_days, i.reason, i.certificate_url,
        i.created_at, i.created_by,
        i.cancelled_at, i.cancelled_by, i.cancellation_reason,
        e.name as employee_name, e.email as employee_email
      FROM illnesses i
      JOIN employees e ON i.employee_id = e.id
      WHERE i.client_id = $1::uuid
    `;

    const params = [clientId];
    let paramIndex = 2;

    // Optional filters
    const { status } = req.query;

    if (status === 'active') {
      query += ' AND i.cancelled_at IS NULL';
    } else if (status === 'cancelled') {
      query += ' AND i.cancelled_at IS NOT NULL';
    }

    query += ' ORDER BY i.created_at DESC LIMIT 500';

    const result = await pool.query(query, params);

    logger.info({
      action: 'admin_illnesses_viewed',
      user_id: userId,
      role,
      count: result.rows.length,
    });

    res.status(200).json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// GET /api/v1/illnesses/manager — Manager visualizza malattie (suo store)
// =====================================================

router.get('/manager', requireAuth, async (req, res, next) => {
  const userId = req.user.user_id;
  const clientId = req.user.client_id;
  const role = req.user.role;
  const siteId = req.user.site_id;

  try {
    // RBAC: Only manager can view illnesses for their store
    if (role !== 'manager' || !siteId) {
      throw new ForbiddenError(
        'Non hai permessi per visualizzare le malattie',
        'FORBIDDEN'
      );
    }

    const result = await pool.query(
      `SELECT
        i.id, i.client_id, i.employee_id, i.start_date, i.end_date,
        i.num_days, i.reason, i.certificate_url,
        i.created_at,
        e.name as employee_name, e.email as employee_email
       FROM illnesses i
       JOIN employees e ON i.employee_id = e.id
       WHERE i.client_id = $1::uuid
       AND e.site_id = $2::uuid
       AND i.cancelled_at IS NULL
       ORDER BY i.created_at DESC
       LIMIT 500`,
      [clientId, siteId]
    );

    logger.info({
      action: 'manager_illnesses_viewed',
      user_id: userId,
      site_id: siteId,
      count: result.rows.length,
    });

    res.status(200).json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// DELETE /api/v1/illnesses/:id — Admin cancella malattia (errore/compliance)
// =====================================================

router.delete(
  '/:id',
  requireAuth,
  createValidationMiddleware(DeleteIllnessSchema),
  async (req, res, next) => {
    const { id } = req.validated.params;
    const { cancellation_reason } = req.validated.body;
    const userId = req.user.user_id;
    const clientId = req.user.client_id;
    const role = req.user.role;

    try {
      // RBAC: Only admin can delete illnesses
      if (role !== 'admin') {
        throw new ForbiddenError(
          'Solo admin può cancellare una comunicazione di malattia',
          'FORBIDDEN'
        );
      }

      const result = await withTransaction(async (client) => {
        // 1. Fetch the illness
        const illnessResult = await client.query(
          'SELECT * FROM illnesses WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1',
          [id, clientId]
        );

        if (illnessResult.rows.length === 0) {
          throw new NotFoundError('Comunicazione malattia non trovata', 'ILLNESS_NOT_FOUND');
        }

        const illness = illnessResult.rows[0];

        // 2. Check if already cancelled
        if (illness.cancelled_at) {
          throw new ValidationError(
            'Questa comunicazione di malattia è già stata cancellata',
            { code: 'ALREADY_CANCELLED' }
          );
        }

        // 3. Update illness with cancellation info
        const updateResult = await client.query(
          `UPDATE illnesses
           SET cancelled_at = NOW(), cancelled_by = $1::uuid, cancellation_reason = $2
           WHERE id = $3::uuid
           RETURNING *`,
          [userId, cancellation_reason || null, id]
        );

        const updatedIllness = updateResult.rows[0];

        // 4. Log audit trail
        await logAudit(client, {
          action: 'illness_cancelled',
          entity: 'illness',
          entityId: updatedIllness.id,
          clientId,
          oldValue: {
            cancelled_at: null,
            cancelled_by: null,
          },
          newValue: {
            cancelled_at: updatedIllness.cancelled_at,
            cancelled_by: userId,
            cancellation_reason,
          },
          userId,
        });

        return updatedIllness;
      });

      logger.info({
        action: 'illness_cancelled',
        illness_id: result.id,
        cancelled_by: userId,
        reason: cancellation_reason,
      });

      res.status(200).json({
        data: result,
        message: 'Comunicazione malattia cancellata',
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
