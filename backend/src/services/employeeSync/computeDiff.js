'use strict';

const { ROLE_MAP } = require('../onboarding/parseWorkbook');
const { todayInTimeZone } = require('../../utils/date');

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
// `siteNameById` risolve gli UUID di sede in nomi leggibili (fromName/toName)
// per la UI del wizard — senza, l'admin vedeva solo l'email della riga
// modificata, senza alcuna indicazione di COSA fosse cambiato (bug segnalato
// testando la Sezione 6 della checklist manuale su staging).
function computeFieldChanges(dbRow, row, siteId, siteNameById, resolveManagerId) {
  const changes = {};
  const currentSiteId = dbRow.site_id || (dbRow.assigned_sites && dbRow.assigned_sites[0]) || null;
  if (currentSiteId !== siteId) {
    changes.site_id = {
      from: currentSiteId,
      to: siteId,
      fromName: currentSiteId ? siteNameById.get(currentSiteId) || null : null,
      toName: siteId ? siteNameById.get(siteId) || null : null,
    };
  }
  const newManagerId = resolveManagerId(row, siteId);
  if ((dbRow.manager_id || null) !== newManagerId) {
    changes.manager_id = { from: dbRow.manager_id || null, to: newManagerId };
  }
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
  const errors = [];

  // Inversione di siteIdByName (name->id, già costruita da resolveSiteIdByName
  // su TUTTE le sedi esistenti del cliente, non solo quelle nel foglio Sedi
  // del file) — copre sempre anche la sede attuale del dipendente, non solo
  // quelle menzionate nel file caricato.
  const siteNameById = new Map([...siteIdByName].map(([name, id]) => [id, name]));

  // Email dei manager lowercased: manager_email è sempre lowercased da
  // normEmail in parseTemplate.js, ma le email dei dipendenti in DB non
  // hanno questa garanzia (es. creati via form admin) — senza normalizzare
  // qui, un manager con email mixed-case non verrebbe mai risolto (stesso
  // bug fixato in employeeSync.js per existingManagerEmails, Task 12).
  // Mappa a {id, site_id} (non solo id) e SOLO manager ATTIVI: serve site_id
  // per rifiutare un manager_email che punta a un manager di una sede diversa
  // da quella del dipendente, e il filtro active replica — anche qui, come
  // difesa in profondità oltre a existingManagerEmails in employeeSync.js —
  // la stessa policy della creazione singola in admin/employees.js
  // (`role = 'manager' AND site_id = $3 AND active = true`). Trovato nel
  // checkpoint finale (Task 15): il percorso bulk xlsx non aveva alcuna
  // protezione equivalente a quella del form di creazione singola.
  const managerByEmail = new Map(
    dbEmployees
      .filter((e) => e.role === 'manager' && e.active)
      .map((e) => [e.email.toLowerCase(), { id: e.id, site_id: e.site_id }])
  );

  // Risolve manager_email → manager_id per una riga, applicando le stesse
  // regole della creazione singola (manager attivo, stessa sede). Un
  // manager_email che non risolve a nessun manager attivo qui non dovrebbe
  // normalmente capitare (già bloccato upstream da validateSyntax via
  // existingManagerEmails) — in quel caso il manager viene semplicemente
  // ignorato (manager_id null). Un mismatch di SEDE invece non è rilevabile
  // in validateSyntax (gira prima che siteIdByName sia risolta), quindi va
  // segnalato qui come errore di validazione a tutti gli effetti.
  function resolveManagerId(row, siteId) {
    if (!row.manager_email) return null;
    const mgr = managerByEmail.get(row.manager_email);
    if (!mgr) return null;
    if (siteId && mgr.site_id && mgr.site_id !== siteId) {
      errors.push(
        `Foglio Dipendenti riga ${row._row}: manager_email "${row.manager_email}" appartiene a un manager di una sede diversa da quella del dipendente.`
      );
      return null;
    }
    return mgr.id;
  }

  // Stessa normalizzazione di managerIdByEmail sopra: row.email (file) è
  // sempre lowercased da normEmail, ma le email dei dipendenti in DB non
  // hanno questa garanzia (es. creati via form admin, senza .toLowerCase()
  // nello schema Zod di validation.js). Senza lowercase qui, un dipendente
  // DB con email mixed-case non verrebbe mai trovato in dbByEmail: la riga
  // finirebbe in "nuovi" (duplicato creato, nessun vincolo unique su email)
  // mentre la riga originale, mai marcata "seen", finirebbe in "anomalie"
  // (falso "dipendente uscito"). Terza occorrenza di questo bug in questo
  // file — vedi anche managerByEmail ed existingManagerEmails (Task 12).
  const dbByEmail = new Map(dbEmployees.map((e) => [e.email.toLowerCase(), e]));
  const seenEmails = new Set();

  for (const row of fileRows) {
    seenEmails.add(row.email);
    const dbRow = dbByEmail.get(row.email);
    const fileActive = (row.stato || '').toLowerCase() === 'attivo';
    const siteId = siteIdByName.get(row.sede) || null;

    if (!dbRow) {
      if (fileActive) {
        const role = ROLE_MAP[row.ruolo];
        const errorCountBeforeManagerResolve = errors.length;
        const managerId = resolveManagerId(row, siteId);
        // Stessa regola del form di creazione singola (validation.js,
        // AdminEmployeeSchema): un NUOVO dipendente (non manager) non può
        // essere inserito senza un manager di riferimento — la sede deve già
        // avere un manager attivo. Applicata solo ai nuovi inserimenti, non
        // retroattivamente ai dipendenti già esistenti (righe "modificati"/
        // "riattivati" più sotto), che possono restare senza manager per
        // compatibilità con i dati storici già in produzione.
        if (role === 'employee' && !managerId) {
          // resolveManagerId può aver già pushato un proprio errore più
          // specifico (es. manager di sede diversa) — evita di duplicarlo.
          if (errors.length === errorCountBeforeManagerResolve) {
            errors.push(
              `Foglio Dipendenti riga ${row._row}: manager_email obbligatorio per i nuovi dipendenti — crea prima un manager per questa sede.`
            );
          }
          continue;
        }
        nuovi.push({
          email: row.email,
          name: row.nome_completo,
          phone: row.telefono,
          role,
          site_id: siteId,
          external_employee_id: row.matricola,
          // "Oggi" in Europe/Rome, non UTC — stessa correzione applicata a
          // checkins.js e validation.js (hiring_date è una data di calendario
          // italiana, non un istante UTC).
          hiring_date: row.data_assunzione || todayInTimeZone(),
          manager_id: managerId,
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
        changes: computeFieldChanges(dbRow, row, siteId, siteNameById, resolveManagerId),
      });
      continue;
    }

    if (dbRow.active && !fileActive) {
      rimossi.push({
        id: dbRow.id,
        email: row.email,
        exit_date: row.data_uscita || todayInTimeZone(),
      });
      continue;
    }

    if (!dbRow.active && !fileActive) continue;

    const changes = computeFieldChanges(dbRow, row, siteId, siteNameById, resolveManagerId);
    if (Object.keys(changes).length > 0) {
      modificati.push({ id: dbRow.id, email: row.email, changes });
    }
  }

  for (const dbRow of dbEmployees) {
    if (dbRow.active && !seenEmails.has(dbRow.email.toLowerCase())) {
      anomalie.push({ id: dbRow.id, email: dbRow.email, name: dbRow.name });
    }
  }

  return { nuovi, riattivati, rimossi, modificati, anomalie, errors };
}

module.exports = { computeDiff };
