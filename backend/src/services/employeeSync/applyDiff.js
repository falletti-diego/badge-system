'use strict';

const { randomBytes } = require('crypto');
const { hashPassword } = require('../../auth/password');
const { logAudit } = require('../../middleware/audit');

function generateTempPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(10), (b) => chars[b % chars.length]).join('');
}

// Traduce un oggetto `changes` (come prodotto da computeDiff) in clausole
// `SET` parametrizzate, a partire da $<startIndex>. Il caso site_id è
// speciale: va sempre accompagnato dal reset di assigned_sites (il campo
// realmente usato dal check-in per verificare l'assegnazione), altrimenti
// un trasferimento di sede lascerebbe il dipendente ancora assegnato alla
// sede precedente.
function buildFieldSetClause(changes, startIndex) {
  const sets = [];
  const params = [];
  let i = startIndex;
  for (const [field, change] of Object.entries(changes)) {
    if (field === 'site_id') {
      sets.push(`site_id = $${i}`);
      params.push(change.to);
      i += 1;
      sets.push(`assigned_sites = $${i}::uuid[]`);
      params.push(change.to ? [change.to] : []);
      i += 1;
      continue;
    }
    sets.push(`${field} = $${i}`);
    params.push(change.to);
    i += 1;
  }
  return { sets, params, nextIndex: i };
}

async function applyDiff(db, diff, { clientId }) {
  const credentials = [];

  for (const n of diff.nuovi) {
    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const ins = await db.query(
      `INSERT INTO employees (client_id, email, name, phone, role, site_id, password_hash, assigned_sites, external_employee_id, hiring_date, manager_id, active, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::UUID[], $9, $10, $11, true, true) RETURNING id`,
      [clientId, n.email, n.name, n.phone || null, n.role, n.site_id, passwordHash,
        n.site_id ? [n.site_id] : [], n.external_employee_id || null, n.hiring_date, n.manager_id || null]
    );
    credentials.push({ id: ins.rows[0].id, email: n.email, name: n.name, password: tempPassword });
    await logAudit(db, { action: 'employee_sync_create', entity: 'employee', entityId: ins.rows[0].id,
      oldValue: null, newValue: { email: n.email, name: n.name }, userId: 'system' });
  }

  for (const r of diff.riattivati) {
    // Un dipendente può rientrare E aver cambiato sede/telefono/ruolo nello
    // stesso file — applica anche quei campi qui, non solo active/exit_date,
    // altrimenti la riattivazione li scarterebbe silenziosamente.
    // Reimposta sempre anche la password: la vecchia risale a prima della
    // disattivazione, potenzialmente mesi fa, e il dipendente l'ha quasi
    // certamente dimenticata — stessa logica già usata per i nuovi assunti.
    // $1 è riservato all'id (WHERE), $2 alla password_hash, i campi
    // dinamici del file partono da $3.
    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const { sets, params } = buildFieldSetClause(r.changes || {}, 3);
    const allSets = ['active = true', 'exit_date = NULL', 'password_hash = $2', 'must_change_password = true', ...sets];
    await db.query(`UPDATE employees SET ${allSets.join(', ')} WHERE id = $1::uuid`, [r.id, passwordHash, ...params]);
    credentials.push({ id: r.id, email: r.email, password: tempPassword, reactivated: true });
    await logAudit(db, { action: 'employee_sync_reactivate', entity: 'employee', entityId: r.id,
      oldValue: { active: false }, newValue: { active: true, ...r.changes }, userId: 'system' });
  }

  for (const rm of diff.rimossi) {
    await db.query(
      'UPDATE employees SET active = false, exit_date = $1 WHERE id = $2::uuid',
      [rm.exit_date, rm.id]
    );
    await logAudit(db, { action: 'employee_sync_deactivate', entity: 'employee', entityId: rm.id,
      oldValue: { active: true }, newValue: { active: false, exit_date: rm.exit_date }, userId: 'system' });
  }

  for (const m of diff.modificati) {
    const { sets, params, nextIndex } = buildFieldSetClause(m.changes, 1);
    params.push(m.id);
    await db.query(`UPDATE employees SET ${sets.join(', ')} WHERE id = $${nextIndex}::uuid`, params);
    await logAudit(db, { action: 'employee_sync_update', entity: 'employee', entityId: m.id,
      oldValue: null, newValue: m.changes, userId: 'system' });
  }

  return { credentials };
}

module.exports = { applyDiff };
