'use strict';

const { ROLE_MAP } = require('../onboarding/parseWorkbook');

const FIELD_COMPARATORS = {
  name: (db, file) => db.name !== file.nome_completo,
  phone: (db, file) => (db.phone || null) !== (file.telefono || null),
  role: (db, file) => db.role !== ROLE_MAP[file.ruolo],
  external_employee_id: (db, file) => (db.external_employee_id || null) !== (file.matricola || null),
};

const FILE_FIELD_BY_DB_FIELD = {
  name: 'nome_completo',
  phone: 'telefono',
  external_employee_id: 'matricola',
};

// Calcola i campi cambiati tra lo stato DB e la riga file, inclusa la sede
// (con fallback a assigned_sites[0] quando site_id è null — vedi Task 13).
// Riusata sia per "modificato" sia per arricchire una riattivazione, cosicché
// un dipendente che rientra E cambia sede/telefono nello stesso file non perda
// silenziosamente la seconda informazione.
function computeFieldChanges(dbRow, row, siteId) {
  const changes = {};
  const currentSiteId = dbRow.site_id || (dbRow.assigned_sites && dbRow.assigned_sites[0]) || null;
  if (currentSiteId !== siteId) changes.site_id = { from: currentSiteId, to: siteId };
  for (const [field, differs] of Object.entries(FIELD_COMPARATORS)) {
    if (differs(dbRow, row)) {
      const toValue = field === 'role' ? ROLE_MAP[row.ruolo] : row[FILE_FIELD_BY_DB_FIELD[field]];
      changes[field] = { from: dbRow[field], to: toValue };
    }
  }
  return changes;
}

function computeDiff(fileRows, dbEmployees, siteIdByName) {
  const nuovi = [];
  const riattivati = [];
  const rimossi = [];
  const modificati = [];
  const anomalie = [];

  const dbByEmail = new Map(dbEmployees.map((e) => [e.email, e]));
  const seenEmails = new Set();

  for (const row of fileRows) {
    seenEmails.add(row.email);
    const dbRow = dbByEmail.get(row.email);
    const fileActive = (row.stato || '').toLowerCase() === 'attivo';
    const siteId = siteIdByName.get(row.sede) || null;

    if (!dbRow) {
      if (fileActive) {
        nuovi.push({
          email: row.email,
          name: row.nome_completo,
          phone: row.telefono,
          role: ROLE_MAP[row.ruolo],
          site_id: siteId,
          external_employee_id: row.matricola,
          hiring_date: row.data_assunzione || new Date().toISOString().slice(0, 10),
        });
      }
      continue;
    }

    if (!dbRow.active && fileActive) {
      riattivati.push({
        id: dbRow.id,
        email: row.email,
        hiring_date: dbRow.hiring_date,
        exit_date: null,
        changes: computeFieldChanges(dbRow, row, siteId),
      });
      continue;
    }

    if (dbRow.active && !fileActive) {
      rimossi.push({
        id: dbRow.id,
        email: row.email,
        exit_date: row.data_uscita || new Date().toISOString().slice(0, 10),
      });
      continue;
    }

    if (!dbRow.active && !fileActive) continue;

    const changes = computeFieldChanges(dbRow, row, siteId);
    if (Object.keys(changes).length > 0) {
      modificati.push({ id: dbRow.id, email: row.email, changes });
    }
  }

  for (const dbRow of dbEmployees) {
    if (dbRow.active && !seenEmails.has(dbRow.email)) {
      anomalie.push({ id: dbRow.id, email: dbRow.email, name: dbRow.name });
    }
  }

  return { nuovi, riattivati, rimossi, modificati, anomalie };
}

module.exports = { computeDiff };
