'use strict';

const { ROLE_MAP } = require('../onboarding/parseWorkbook');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATI = ['attivo', 'inattivo'];

function validateSyntax(data, { existingManagerEmails = new Set() } = {}) {
  const errors = [];
  const sedeNames = new Set((data.sedi || []).map((s) => s.nome_sede));
  const seenEmail = new Set();
  const seenMatricola = new Set();

  for (const d of data.dipendenti || []) {
    const at = `Foglio Dipendenti riga ${d._row}`;
    if (!d.nome_completo) errors.push(`${at}: nome_completo obbligatorio.`);
    if (!d.email) errors.push(`${at}: email obbligatoria.`);
    else {
      if (!EMAIL_RE.test(d.email)) errors.push(`${at}: email "${d.email}" non valida.`);
      if (seenEmail.has(d.email)) errors.push(`${at}: email "${d.email}" duplicata nel file.`);
      seenEmail.add(d.email);
    }
    // La matricola è opzionale, ma se presente il DB la vincola UNIQUE per
    // cliente (migration 008): un duplicato nel file andrebbe altrimenti in
    // crash silenzioso su /apply invece di essere segnalato in preview.
    if (d.matricola) {
      if (seenMatricola.has(d.matricola)) errors.push(`${at}: Matricola "${d.matricola}" duplicata nel file.`);
      seenMatricola.add(d.matricola);
    }
    if (!d.ruolo || !ROLE_MAP[d.ruolo]) errors.push(`${at}: ruolo deve essere "dipendente" o "responsabile" (trovato: ${d.ruolo || 'vuoto'}).`);
    if (!d.sede) errors.push(`${at}: sede obbligatoria.`);
    else if (!sedeNames.has(d.sede)) errors.push(`${at}: sede "${d.sede}" non corrisponde a nessun nome_sede del foglio Sedi.`);
    if (!d.stato || !VALID_STATI.includes(d.stato)) {
      errors.push(`${at}: stato deve essere "Attivo" o "Inattivo" (trovato: ${d.stato || 'vuoto'}).`);
    }
    // manager_email è facoltativo, ma se presente deve corrispondere a un
    // manager GIÀ esistente in DB per questo cliente — un manager creato
    // nello stesso file non è risolvibile in questo passaggio (il suo id
    // non esiste ancora al momento del calcolo diff), limitazione nota.
    // existingManagerEmails must contain lowercased emails — manager_email here
    // is always lowercased by parseTemplate.js's normEmail.
    if (d.manager_email && !existingManagerEmails.has(d.manager_email)) {
      errors.push(`${at}: manager_email "${d.manager_email}" non corrisponde a nessun manager esistente per questo cliente.`);
    }
    // Un dipendente non può essere manager di se stesso: senza questo guard
    // computeDiff risolverebbe manager_id sull'id del dipendente stesso se
    // manager_email == email e quella email appartiene già a un manager
    // esistente. .toLowerCase() difensivo anche se entrambi i campi sono
    // già normalizzati in minuscolo da parseTemplate.js's normEmail.
    if (d.manager_email && d.email && d.manager_email.toLowerCase() === d.email.toLowerCase()) {
      errors.push(`${at}: manager_email non può coincidere con la propria email (un dipendente non può essere manager di se stesso).`);
    }
  }

  return errors;
}

module.exports = { validateSyntax };
