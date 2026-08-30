'use strict';

const express = require('express');
const { z } = require('zod');
const { randomBytes } = require('crypto');
const { pool } = require('../../db/pool');
const { hashPassword } = require('../../auth/password');
const { ValidationError, NotFoundError, ConflictError, InvalidManagerAssignmentError, InvalidReportsToAssignmentError } = require('../../utils/errors');
const { getRoleLevel } = require('../../utils/roles');
const logger = require('../../utils/logger');
const { logAudit } = require('../../middleware/audit');
const { resolveTenantScope } = require('../../utils/tenantScope');
const { AdminEmployeeSchema, createValidationMiddleware } = require('../../middleware/validation');

const router = express.Router();

function generateTempPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/**
 * Valida reports_to_id: deve puntare a un dipendente attivo dello stesso
 * client, con role_level strettamente superiore a ownLevel — altrimenti la
 * catena di approvazione sarebbe invertita o piatta. Se excludeId è passato
 * (solo dal PATCH — alla creazione è strutturalmente impossibile, un
 * dipendente nuovo non può ancora essere il reports_to_id di nessuno),
 * rifiuta anche un ciclo diretto: l'approvatore scelto riporta già a
 * excludeId. Lancia InvalidReportsToAssignmentError — il chiamante ha un
 * try/catch che inoltra a next(err), mai un valore di ritorno "false".
 */
async function validateReportsTo({ reportsToId, clientId, ownLevel, excludeId = null }) {
  if (!reportsToId) return;
  const approverCheck = await pool.query(
    'SELECT id, role, reports_to_id FROM employees WHERE id = $1 AND client_id = $2 AND active = true',
    [reportsToId, clientId]
  );
  if (approverCheck.rowCount === 0) {
    throw new InvalidReportsToAssignmentError();
  }
  const approverLevel = getRoleLevel(approverCheck.rows[0].role);
  if (approverLevel <= ownLevel) {
    throw new InvalidReportsToAssignmentError(
      'reports_to_id must point to a strictly higher-level role than this employee'
    );
  }
  if (excludeId && approverCheck.rows[0].reports_to_id === excludeId) {
    throw new InvalidReportsToAssignmentError(
      'reports_to_id would create a cycle — that employee already reports to this one'
    );
  }
}

router.post('/', createValidationMiddleware(AdminEmployeeSchema), async (req, res, next) => {
  try {
    const data = req.validated.body;
    const targetClientId = resolveTenantScope(req.user, data.client_id);

    const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1', [targetClientId]);
    if (clientCheck.rowCount === 0) return next(new ValidationError('Client not found'));

    if (data.site_id) {
      const siteCheck = await pool.query(
        'SELECT id FROM sites WHERE id = $1 AND client_id = $2',
        [data.site_id, targetClientId]
      );
      if (siteCheck.rowCount === 0) return next(new ValidationError('Site not found for this client'));
    }

    if (data.assigned_sites.length > 0) {
      const ownedSites = await pool.query(
        'SELECT id FROM sites WHERE id = ANY($1::UUID[]) AND client_id = $2',
        [data.assigned_sites, targetClientId]
      );
      if (ownedSites.rowCount !== data.assigned_sites.length) {
        return next(new ValidationError('One or more assigned_sites do not belong to this client'));
      }
    }

    // Validazione server-side del manager: deve essere un manager reale,
    // dello stesso cliente, con site_id coincidente con la sede scelta per
    // il nuovo dipendente. La UI filtra già correttamente, ma un client
    // malevolo/bug potrebbe inviare un manager_id arbitrario.
    if (data.manager_id) {
      const managerCheck = await pool.query(
        `SELECT id FROM employees
         WHERE id = $1 AND client_id = $2 AND role = 'manager' AND site_id = $3 AND active = true`,
        [data.manager_id, targetClientId, data.site_id || null]
      );
      if (managerCheck.rowCount === 0) {
        return next(new InvalidManagerAssignmentError());
      }
    }

    // Validazione server-side di reports_to_id: deve essere un dipendente
    // attivo dello stesso client, con role_level strettamente superiore a
    // quello del nuovo dipendente — altrimenti la catena di approvazione
    // sarebbe invertita o piatta (es. un manager "approvato" da un altro
    // manager pari livello).
    await validateReportsTo({
      reportsToId: data.reports_to_id,
      clientId: targetClientId,
      ownLevel: getRoleLevel(data.role),
    });

    const tempPassword = data.password || generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    let result;
    try {
      result = await pool.query(
        `INSERT INTO employees (client_id, email, name, phone, role, site_id, password_hash, assigned_sites, external_employee_id, hiring_date, manager_id, reports_to_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::UUID[], $9, $10, $11, $12)
         RETURNING id, client_id, email, name, phone, role, site_id, assigned_sites, external_employee_id, hiring_date, manager_id, reports_to_id, created_at`,
        [targetClientId, data.email, data.name, data.phone || null,
          data.role, data.site_id || null, passwordHash, data.assigned_sites,
          data.external_employee_id || null, data.hiring_date || null, data.manager_id || null, data.reports_to_id || null]
      );
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'uq_employees_external_id') {
        return next(new ConflictError('Matricola già in uso per questo cliente', 'DUPLICATE_MATRICOLA'));
      }
      throw err;
    }

    const employee = result.rows[0];
    logger.info({ action: 'admin_create_employee', employee_id: employee.id, client_id: targetClientId });
    await logAudit(pool, {
      action: 'admin_create_employee',
      entity: 'employee',
      entityId: employee.id,
      clientId: employee.client_id,
      oldValue: null,
      newValue: {
        name: employee.name, email: employee.email, role: employee.role, client_id: employee.client_id,
        external_employee_id: employee.external_employee_id, hiring_date: employee.hiring_date, manager_id: employee.manager_id,
      },
      userId: req.user.user_id,
    });

    res.status(201).json({
      success: true,
      data: employee,
      temp_password: data.password ? undefined : tempPassword,
    });
  } catch (err) {
    if (err.code === '23505') return next(new ValidationError('Email already exists for this client'));
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
        where = 'WHERE e.client_id = $1 AND e.active = true';
      } else {
        where = 'WHERE e.active = true';
      }
    } else {
      params.push(req.user.client_id);
      where = 'WHERE e.client_id = $1 AND e.active = true';
    }
    const result = await pool.query(
      `SELECT e.id, e.client_id, e.email, e.name, e.role, e.phone,
              e.site_id, e.external_employee_id, e.created_at, c.name AS client_name,
              s.name AS site_name
       FROM employees e
       JOIN clients c ON c.id = e.client_id
       LEFT JOIN sites s ON s.id = e.site_id
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
    const uuidCheck = z.string().uuid().safeParse(id);
    if (!uuidCheck.success) return next(new ValidationError('Invalid employee id'));

    const result = await pool.query(
      `UPDATE employees SET active = false, exit_date = CURRENT_DATE
       WHERE id = $1 AND client_id = $2::uuid AND active = true
       RETURNING id, name, email, client_id`,
      [id, req.user.client_id]
    );
    if (result.rowCount === 0) return next(new NotFoundError('Employee not found', 'EMPLOYEE_NOT_FOUND'));

    const emp = result.rows[0];
    await logAudit(pool, {
      action: 'admin_deactivate_employee',
      entity: 'employee',
      entityId: emp.id,
      clientId: emp.client_id,
      oldValue: { active: true },
      newValue: { active: false, exit_date: new Date().toISOString().slice(0, 10) },
      userId: req.user.user_id,
    }).catch(() => {});

    logger.info({ action: 'admin_deactivate_employee', employee_id: emp.id, email: emp.email });
    res.json({ success: true, message: `Dipendente "${emp.name}" disattivato.` });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!z.string().uuid().safeParse(id).success) {
      return next(new ValidationError('Invalid employee id'));
    }

    const newPassword = generateTempPassword();
    const passwordHash = await hashPassword(newPassword);

    const updateResult = await pool.query(
      'UPDATE employees SET password_hash = $1, must_change_password = true WHERE id = $2 AND client_id = $3::uuid RETURNING id, name, email, client_id',
      [passwordHash, id, req.user.client_id]
    );
    if (updateResult.rowCount === 0) {
      return next(new NotFoundError('Employee not found', 'EMPLOYEE_NOT_FOUND'));
    }

    const emp = updateResult.rows[0];
    logger.info({ action: 'admin_reset_password', employee_id: id, admin_id: req.user.user_id });
    await logAudit(pool, {
      action: 'password_reset',
      entity: 'employee',
      entityId: emp.id,
      clientId: emp.client_id,
      oldValue: null,
      newValue: { reset_by: req.user.user_id, email: emp.email },
      userId: req.user.user_id,
    }).catch((auditErr) => {
      logger.warn({ action: 'audit_log_failed', employee_id: emp.id, error: auditErr.message });
    });

    res.json({
      success: true,
      data: { id: emp.id, name: emp.name, email: emp.email },
      temp_password: newPassword,
      message: `Password reimpostata per ${emp.name}`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
