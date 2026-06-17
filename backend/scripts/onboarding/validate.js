'use strict';

const { ROLE_MAP } = require('./parseWorkbook');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SALDO_KEYS = ['ferie_giorni', 'permessi_giorni', 'exfestivita_giorni'];

function validate(data) {
  const errors = [];
  const warnings = [];

  if (!data.azienda.ragione_sociale) errors.push('Foglio Azienda: ragione_sociale obbligatoria.');
  if (!data.azienda.email_referente) errors.push('Foglio Azienda: email_referente obbligatoria.');
  else if (!EMAIL_RE.test(data.azienda.email_referente)) errors.push('Foglio Azienda: email_referente non valida.');

  const sedeNames = new Set();
  for (const s of data.sedi) {
    if (!s.nome_sede) { errors.push(`Foglio Sedi riga ${s._row}: nome_sede obbligatorio.`); continue; }
    if (sedeNames.has(s.nome_sede)) errors.push(`Foglio Sedi riga ${s._row}: nome_sede "${s.nome_sede}" duplicato.`);
    sedeNames.add(s.nome_sede);
    const hasLat = s.latitudine != null, hasLng = s.longitudine != null;
    if (hasLat !== hasLng) errors.push(`Foglio Sedi riga ${s._row}: latitudine e longitudine vanno compilate insieme.`);
  }

  const seenEmail = new Set();
  const matricolaCount = new Map();
  const responsabiliPerSede = new Map();
  for (const name of sedeNames) responsabiliPerSede.set(name, 0);

  for (const d of data.dipendenti) {
    const at = `Foglio Dipendenti riga ${d._row}`;
    if (!d.nome_completo) errors.push(`${at}: nome_completo obbligatorio.`);
    if (!d.email) errors.push(`${at}: email obbligatoria.`);
    else {
      if (!EMAIL_RE.test(d.email)) errors.push(`${at}: email "${d.email}" non valida.`);
      if (seenEmail.has(d.email)) errors.push(`${at}: email "${d.email}" duplicata nel file.`);
      seenEmail.add(d.email);
    }
    if (!d.ruolo || !ROLE_MAP[d.ruolo]) errors.push(`${at}: ruolo deve essere "dipendente" o "responsabile" (trovato: ${d.ruolo || 'vuoto'}).`);
    if (!d.sede) errors.push(`${at}: sede obbligatoria.`);
    else if (!sedeNames.has(d.sede)) errors.push(`${at}: sede "${d.sede}" non corrisponde a nessun nome_sede del foglio Sedi.`);
    else if (d.ruolo === 'responsabile') responsabiliPerSede.set(d.sede, (responsabiliPerSede.get(d.sede) || 0) + 1);

    for (const k of SALDO_KEYS) {
      const v = d[k];
      if (Number.isNaN(v)) errors.push(`${at}: ${k} non è un numero valido.`);
      else if (v < 0) errors.push(`${at}: ${k} non può essere negativo (saldo).`);
    }
    if (d.matricola) matricolaCount.set(d.matricola, (matricolaCount.get(d.matricola) || 0) + 1);
  }

  for (const [sede, count] of responsabiliPerSede) {
    if (count === 0) warnings.push(`La sede "${sede}" non ha nessun responsabile (manager).`);
  }
  for (const [mat, count] of matricolaCount) {
    if (count > 1) warnings.push(`Matricola "${mat}" usata ${count} volte nel file.`);
  }

  return { errors, warnings };
}

module.exports = { validate };
