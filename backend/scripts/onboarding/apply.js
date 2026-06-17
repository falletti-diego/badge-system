'use strict';

const { randomUUID, randomBytes } = require('crypto');
const { hashPassword } = require('../../src/auth/password');
const { logAudit } = require('../../src/middleware/audit');
const { ROLE_MAP, SALDO_COLUMNS } = require('./parseWorkbook');

function generateTempPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function apply(db, data, { clientId, year }) {
  const credentials = [];
  const summary = { sedi: 0, dipendenti_creati: 0, dipendenti_aggiornati: 0, saldi: 0 };

  if (!clientId) {
    const r = await db.query(
      'INSERT INTO clients (name, email, plan, meal_voucher_hours) VALUES ($1, $2, $3, $4) RETURNING id',
      [data.azienda.ragione_sociale, data.azienda.email_referente, 'starter',
        data.azienda.ore_min_buono_pasto != null ? data.azienda.ore_min_buono_pasto : 5]
    );
    clientId = r.rows[0].id;
    await logAudit(db, { action: 'onboard_create_client', entity: 'client', entityId: clientId,
      oldValue: null, newValue: { name: data.azienda.ragione_sociale, email: data.azienda.email_referente }, userId: 'system' });
  }

  const siteIdByName = new Map();
  for (const s of data.sedi) {
    const found = await db.query('SELECT id FROM sites WHERE client_id = $1::uuid AND name = $2 LIMIT 1', [clientId, s.nome_sede]);
    if (found.rows.length > 0) {
      siteIdByName.set(s.nome_sede, found.rows[0].id);
      continue;
    }
    const siteId = randomUUID();
    const qr = `badge://checkin?site_id=${siteId}&client_id=${clientId}&v=1`;
    const ins = await db.query(
      `INSERT INTO sites (id, client_id, name, location, qr_code_content, latitude, longitude, geofence_radius_meters, geofence_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false) RETURNING id`,
      [siteId, clientId, s.nome_sede, s.indirizzo, qr,
        s.latitudine, s.longitudine,
        s.raggio_geofence_m != null ? s.raggio_geofence_m : 150]
    );
    siteIdByName.set(s.nome_sede, ins.rows[0].id);
    summary.sedi += 1;
    await logAudit(db, { action: 'onboard_create_site', entity: 'site', entityId: siteId,
      oldValue: null, newValue: { name: s.nome_sede, client_id: clientId }, userId: 'system' });
  }

  for (const d of data.dipendenti) {
    const role = ROLE_MAP[d.ruolo];
    const siteId = siteIdByName.get(d.sede);
    const existing = await db.query('SELECT id FROM employees WHERE client_id = $1::uuid AND email = $2 LIMIT 1', [clientId, d.email]);

    let employeeId;
    if (existing.rows.length === 0) {
      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);
      const ins = await db.query(
        `INSERT INTO employees (client_id, email, name, phone, role, site_id, password_hash, assigned_sites, external_employee_id, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::UUID[], $9, true) RETURNING id`,
        [clientId, d.email, d.nome_completo, d.telefono, role, siteId, passwordHash, siteId ? [siteId] : [], d.matricola]
      );
      employeeId = ins.rows[0].id;
      summary.dipendenti_creati += 1;
      credentials.push({ email: d.email, nome: d.nome_completo, ruolo: d.ruolo, password: tempPassword });
      await logAudit(db, { action: 'onboard_create_employee', entity: 'employee', entityId: employeeId,
        oldValue: null, newValue: { name: d.nome_completo, email: d.email, role }, userId: 'system' });
    } else {
      employeeId = existing.rows[0].id;
      await db.query(
        `UPDATE employees SET name = $1, phone = $2, role = $3, site_id = $4, assigned_sites = $5::UUID[], external_employee_id = $6
         WHERE id = $7::uuid`,
        [d.nome_completo, d.telefono, role, siteId, siteId ? [siteId] : [], d.matricola, employeeId]
      );
      summary.dipendenti_aggiornati += 1;
    }

    for (const [col, leaveType] of Object.entries(SALDO_COLUMNS)) {
      const total = d[col];
      if (!total || total <= 0) continue;
      await db.query(
        `INSERT INTO leave_saldi (client_id, user_id, leave_type, year, total_days, used_days)
         VALUES ($1, $2, $3, $4, $5, 0)
         ON CONFLICT (user_id, leave_type, year)
         DO UPDATE SET total_days = EXCLUDED.total_days, updated_at = NOW()
         WHERE leave_saldi.used_days = 0`,
        [clientId, employeeId, leaveType, year, total]
      );
      summary.saldi += 1;
    }
  }

  return { clientId, summary, credentials };
}

module.exports = { apply };
