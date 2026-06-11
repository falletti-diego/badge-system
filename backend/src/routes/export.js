/**
 * Export Routes
 * GET /api/export/csv — Export check-ins as CSV
 * Supports format=generic|zucchetti|teamsystem
 */

const express = require('express');
const { stringify } = require('csv-stringify');
const { pool } = require('../db/pool');
const { createValidationMiddleware, GetExportCsvSchema } = require('../middleware/validation');
const { requireAuth } = require('../middleware/auth');
const { ForbiddenError } = require('../utils/errors');
const { resolveEmployeeId, resolveSiteId } = require('../utils/resolvers');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Escape CSV field to prevent formula injection
 */
function escapeCsvField(field) {
  if (field === null || field === undefined) return '';
  const stringField = String(field);
  if (/^[=+@-]/.test(stringField)) return '\'' + stringField;
  return stringField;
}

/**
 * Format a Date to DD/MM/YYYY (Italian convention)
 */
function fmtDate(ts) {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format a Date to HH:MM
 */
function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Format decimal hours to Italian H,MM convention (e.g. 8,30)
 */
function fmtHours(decimalHours) {
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  return `${h},${String(m).padStart(2, '0')}`;
}

/**
 * Split "Nome Cognome" into { nome, cognome }
 * Convention: last space-separated token = cognome, rest = nome
 */
function splitName(fullName) {
  if (!fullName) return { nome: '', cognome: '' };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { nome: parts[0], cognome: '' };
  const cognome = parts[parts.length - 1];
  const nome = parts.slice(0, parts.length - 1).join(' ');
  return { nome, cognome };
}

/**
 * Group raw checkin rows by employee+date and compute IN/OUT pairs.
 * Returns an array of daily summaries.
 */
function groupZucchetti(rows) {
  // Map: "employee_name|YYYY-MM-DD" → { matricola, nome, cognome, date, ins[], outs[] }
  const groups = new Map();
  for (const row of rows) {
    const date = new Date(row.timestamp).toISOString().split('T')[0];
    const key = `${row.employee_name}|${date}`;
    if (!groups.has(key)) {
      const { nome, cognome } = splitName(row.employee_name);
      groups.set(key, {
        matricola: row.matricola || '',
        nome,
        cognome,
        date,
        ins: [],
        outs: [],
      });
    }
    const g = groups.get(key);
    const ts = new Date(row.timestamp);
    if (row.type === 'IN') g.ins.push(ts);
    else if (row.type === 'OUT') g.outs.push(ts);
  }

  const result = [];
  for (const g of groups.values()) {
    if (g.ins.length === 0 || g.outs.length === 0) continue; // skip open presences
    const firstIn = new Date(Math.min(...g.ins));
    const lastOut = new Date(Math.max(...g.outs));
    const hoursWorked = (lastOut - firstIn) / (1000 * 60 * 60);
    const DAILY_THRESHOLD = 8.0;
    const oreOrdinarie = Math.min(hoursWorked, DAILY_THRESHOLD);
    const oreStraordinarie = Math.max(hoursWorked - DAILY_THRESHOLD, 0);
    result.push({
      matricola: g.matricola,
      cognome: g.cognome,
      nome: g.nome,
      data: fmtDate(g.date),
      ora_entrata: fmtTime(firstIn),
      ora_uscita: fmtTime(lastOut),
      ore_ordinarie: fmtHours(oreOrdinarie),
      ore_straordinarie: fmtHours(oreStraordinarie),
    });
  }

  return result.sort((a, b) => {
    if (a.cognome < b.cognome) return -1;
    if (a.cognome > b.cognome) return 1;
    return a.data.localeCompare(b.data);
  });
}

// =====================================================
// GET /api/export/csv — Stream check-ins as CSV
// =====================================================

router.get('/', requireAuth, createValidationMiddleware(GetExportCsvSchema), async (req, res, next) => {
  const { site_id, employee_id, date_from, date_to, format } = req.validated.query;
  const clientId = req.user.client_id;
  const userRole = req.user.role;
  const userSiteId = req.user.site_id;

  try {
    if (userRole === 'employee') {
      return next(new ForbiddenError('CSV export is restricted to managers and admins', 'FORBIDDEN_ROLE'));
    }

    let resolvedSiteId = site_id ? await resolveSiteId(site_id, clientId) : undefined;
    const resolvedEmployeeId = employee_id ? await resolveEmployeeId(employee_id, clientId) : undefined;

    if (userRole === 'manager' && userSiteId) {
      if (resolvedSiteId && resolvedSiteId !== userSiteId) {
        return next(new ForbiddenError('Managers can only export data for their assigned site', 'FORBIDDEN_SITE'));
      }
      resolvedSiteId = userSiteId;
    }

    const whereClauses = [];
    const params = [];
    let paramCount = 0;

    paramCount++;
    whereClauses.push(`c.client_id = $${paramCount}::uuid`);
    params.push(clientId);

    if (resolvedSiteId) {
      paramCount++;
      whereClauses.push(`c.site_id = $${paramCount}::uuid`);
      params.push(resolvedSiteId);
    }

    if (resolvedEmployeeId) {
      paramCount++;
      whereClauses.push(`c.employee_id = $${paramCount}::uuid`);
      params.push(resolvedEmployeeId);
    }

    if (date_from) {
      paramCount++;
      whereClauses.push(`c.timestamp >= $${paramCount}::date`);
      params.push(date_from);
    }

    if (date_to) {
      paramCount++;
      whereClauses.push(`c.timestamp < $${paramCount}::date + INTERVAL '1 day'`);
      params.push(date_to);
    }

    const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    // Fetch rows — include matricola (external_employee_id) for payroll formats
    const query = `
      SELECT
        e.name AS employee_name,
        e.email AS employee_email,
        e.external_employee_id AS matricola,
        s.name AS site_name,
        c.timestamp,
        c.type,
        c.modified_at,
        c.modified_by
      FROM checkins c
      LEFT JOIN employees e ON c.employee_id = e.id
      LEFT JOIN sites s ON c.site_id = s.id
      ${whereClause}
      ORDER BY c.timestamp ASC
      LIMIT 50001
    `;

    const result = await pool.query(query, params);
    const truncated = result.rows.length > 50000;
    const rows = truncated ? result.rows.slice(0, 50000) : result.rows;

    logger.info({
      action: 'csv_export_started',
      client_id: clientId,
      format,
      filters: { site_id, employee_id, date_from, date_to },
      row_count: rows.length,
    });

    if (format === 'zucchetti') {
      return exportZucchetti(res, rows, truncated);
    }

    if (format === 'teamsystem') {
      return exportTeamSystem(res, rows, truncated);
    }

    // Generic format (default)
    return exportGeneric(res, rows, truncated);
  } catch (err) {
    next(err);
  }
});

// ─── Format: Generic ─────────────────────────────────

function exportGeneric(res, rows, truncated) {
  const filename = `presenze_${new Date().toISOString().split('T')[0]}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Total-Count', String(rows.length));
  if (truncated) res.setHeader('X-Truncated', 'true');

  const stringifier = stringify({
    header: true,
    columns: {
      employee_name: 'Employee Name',
      employee_email: 'Email',
      site_name: 'Site',
      timestamp: 'Check-in Time',
      type: 'Type (IN/OUT)',
      modified_at: 'Last Modified',
      modified_by: 'Modified By',
    },
    cast: {
      string: (value) => escapeCsvField(value),
      boolean: (value) => value ? 'Yes' : 'No',
      object: (value) => value === null ? '' : JSON.stringify(value),
    },
  });

  stringifier.on('error', (err) => {
    logger.error({ action: 'csv_stringifier_error', error: err.message });
    if (!res.headersSent) res.status(500).json({ error: 'CSV generation failed' });
  });

  stringifier.pipe(res);
  rows.forEach((row) => stringifier.write(row));
  stringifier.end();
}

// ─── Format: Zucchetti ───────────────────────────────

function exportZucchetti(res, rows, truncated) {
  const filename = `zucchetti_${new Date().toISOString().split('T')[0]}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  if (truncated) res.setHeader('X-Truncated', 'true');

  const daily = groupZucchetti(rows);
  res.setHeader('X-Total-Count', String(daily.length));

  const stringifier = stringify({
    header: true,
    delimiter: ';',
    columns: {
      matricola: 'Matricola',
      cognome: 'Cognome',
      nome: 'Nome',
      data: 'Data',
      ora_entrata: 'OraEntrata',
      ora_uscita: 'OraUscita',
      ore_ordinarie: 'OreOrdinarie',
      ore_straordinarie: 'OreStraordinarie',
    },
    cast: {
      string: (value) => escapeCsvField(value),
    },
  });

  stringifier.on('error', (err) => {
    logger.error({ action: 'csv_zucchetti_error', error: err.message });
    if (!res.headersSent) res.status(500).json({ error: 'CSV generation failed' });
  });

  stringifier.pipe(res);
  daily.forEach((row) => stringifier.write(row));
  stringifier.end();
}

// ─── Format: TeamSystem ──────────────────────────────

function exportTeamSystem(res, rows, truncated) {
  const filename = `teamsystem_${new Date().toISOString().split('T')[0]}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Total-Count', String(rows.length));
  if (truncated) res.setHeader('X-Truncated', 'true');

  const formatted = rows.map((row) => ({
    matricola: row.matricola || '',
    data: fmtDate(row.timestamp),
    tipo: row.type === 'IN' ? 'E' : 'U',
    ora: fmtTime(row.timestamp),
  }));

  const stringifier = stringify({
    header: true,
    delimiter: ';',
    columns: {
      matricola: 'Matricola',
      data: 'Data',
      tipo: 'Tipo',
      ora: 'Ora',
    },
    cast: {
      string: (value) => escapeCsvField(value),
    },
  });

  stringifier.on('error', (err) => {
    logger.error({ action: 'csv_teamsystem_error', error: err.message });
    if (!res.headersSent) res.status(500).json({ error: 'CSV generation failed' });
  });

  stringifier.pipe(res);
  formatted.forEach((row) => stringifier.write(row));
  stringifier.end();
}

module.exports = router;
