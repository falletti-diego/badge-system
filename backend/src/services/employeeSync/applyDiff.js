'use strict';

const { randomBytes } = require('crypto');
const { hashPassword } = require('../../auth/password');
const { logAudit } = require('../../middleware/audit');

function generateTempPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(10), (b) => chars[b % chars.length]).join('');
}

async function applyDiff(db, diff, { clientId }) {
  const credentials = [];

  for (const n of diff.nuovi) {
    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const ins = await db.query(
      `INSERT INTO employees (client_id, email, name, phone, role, site_id, password_hash, assigned_sites, external_employee_id, hiring_date, active, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::UUID[], $9, $10, true, true) RETURNING id`,
      [clientId, n.email, n.name, n.phone || null, n.role, n.site_id, passwordHash,
        n.site_id ? [n.site_id] : [], n.external_employee_id || null, n.hiring_date]
    );
    credentials.push({ id: ins.rows[0].id, email: n.email, name: n.name, password: tempPassword });
    await logAudit(db, { action: 'employee_sync_create', entity: 'employee', entityId: ins.rows[0].id,
      oldValue: null, newValue: { email: n.email, name: n.name }, userId: 'system' });
  }

  for (const r of diff.riattivati) {
    await db.query(
      'UPDATE employees SET active = true, exit_date = NULL WHERE id = $1::uuid',
      [r.id]
    );
    await logAudit(db, { action: 'employee_sync_reactivate', entity: 'employee', entityId: r.id,
      oldValue: { active: false }, newValue: { active: true }, userId: 'system' });
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
    const sets = [];
    const params = [];
    let i = 1;
    for (const [field, change] of Object.entries(m.changes)) {
      sets.push(`${field} = $${i}`);
      params.push(change.to);
      i += 1;
    }
    params.push(m.id);
    await db.query(`UPDATE employees SET ${sets.join(', ')} WHERE id = $${i}::uuid`, params);
    await logAudit(db, { action: 'employee_sync_update', entity: 'employee', entityId: m.id,
      oldValue: null, newValue: m.changes, userId: 'system' });
  }

  return { credentials };
}

module.exports = { applyDiff };
