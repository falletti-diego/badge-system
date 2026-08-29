'use strict';

/**
 * Unica fonte di verità per la gerarchia dei ruoli (design spec
 * docs/superpowers/specs/2026-08-29-role-hierarchy-design.md). role_level
 * NON è mai una colonna DB — vive solo qui. Estendere la gerarchia in
 * futuro (es. un livello intermedio) significa editare solo questa mappa +
 * il CHECK constraint di employees.role in una nuova migrazione additiva.
 */
const ROLE_LEVELS = Object.freeze({
  employee: 0,
  manager: 1,
  senior_manager: 2,
  director: 3,
  admin: 99,
  superadmin: 99,
  viewer: -1, // sola lettura, mai un "superiore" di nessuno
});

/**
 * Ritorna sempre un numero, mai `undefined` — un ruolo sconosciuto vale -1
 * (mai un superiore di nessuno), cosa che i confronti numerici a valle
 * (es. checkins.js) assumono per fail-closed di default.
 */
function getRoleLevel(role) {
  return Object.prototype.hasOwnProperty.call(ROLE_LEVELS, role) ? ROLE_LEVELS[role] : -1;
}

/**
 * senior_manager e director sono trattati come admin SOLO sulle viste
 * "pending" e sugli endpoint di approvazione di eventi/ferie/malattie
 * (design spec, decisione 5) — non altrove. Non usare questo helper per
 * decisioni di correzione cartellino (vedi resolveIsApprover sotto, e la
 * nota nella design spec sul perché quel controllo usa una soglia diversa).
 */
function isAdminEquivalent(role) {
  return role === 'admin' || role === 'superadmin' || role === 'senior_manager' || role === 'director';
}

/**
 * Chi può agire come "superiore che approva" per il dipendente target
 * (correzione cartellino di un manager/senior_manager — design spec,
 * decisione 6, punto 2). Regole, in ordine:
 *   1. admin/superadmin possono sempre farlo.
 *   2. altrimenti, solo chi è esattamente il reports_to_id del target.
 * Deliberatamente NON usa isAdminEquivalent: un senior_manager o un
 * director generico non deve poter correggere il cartellino di QUALUNQUE
 * manager solo per il proprio ruolo — deve essere lo specifico superiore
 * risolto via reports_to_id (o un fallback a NULL che ricade solo su
 * admin/superadmin).
 */
function resolveIsApprover({ candidateEmployeeId, candidateRole, targetEmployeeId, targetReportsToId }, client) {
  // eslint-disable-next-line no-unused-vars
  void client; // riservato per un futuro attraversamento multi-livello; oggi la regola è a un solo salto (vedi design spec, "Rischi noti")
  if (getRoleLevel(candidateRole) >= ROLE_LEVELS.admin) return true;
  if (!targetReportsToId) return false;
  return candidateEmployeeId === targetReportsToId;
}

module.exports = { ROLE_LEVELS, getRoleLevel, isAdminEquivalent, resolveIsApprover };
