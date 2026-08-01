'use strict';

const { randomUUID } = require('crypto');

/**
 * Costruisce la mappa nome-sede→id per un cliente, includendo tutte le sedi
 * dichiarate nel foglio Sedi del file caricato.
 *
 * Una sede dichiarata nel file ma non ancora presente nel DB va gestita in
 * due modi diversi a seconda del contesto (bug reale trovato testando la
 * Sezione 8 della checklist su staging: senza questo modulo, una sede nuova
 * risultava sempre assente dalla mappa, e `computeDiff` risolveva `site_id`
 * a `null` — un dipendente assegnato a quella sede veniva silenziosamente
 * DISASSOCIATO da qualunque sede invece di essere assegnato a quella nuova):
 *
 * - `create: false` (usato da `/preview`, che non deve MAI scrivere sul DB):
 *   la sede mancante riceve un identificatore placeholder non persistito
 *   (`pending:<nome>`), sufficiente perché `computeDiff` la distingua
 *   correttamente da "nessuna sede" nel riepilogo mostrato all'admin.
 * - `create: true` (usato da `/apply`, dentro la stessa transazione
 *   dell'applicazione del diff): la sede viene creata per davvero,
 *   riusando lo stesso pattern di `services/onboarding/apply.js`
 *   (id/QR generati lato applicazione, non dal DB).
 *
 * @returns {Map<string,string>} nome sede → id (reale o placeholder)
 */
async function resolveSiteIdByName(db, sedi, clientId, { create }) {
  const existing = (await db.query(
    'SELECT id, name FROM sites WHERE client_id = $1::uuid',
    [clientId]
  )).rows;
  const siteIdByName = new Map(existing.map((s) => [s.name, s.id]));

  for (const s of sedi || []) {
    if (!s.nome_sede || siteIdByName.has(s.nome_sede)) continue;

    if (!create) {
      siteIdByName.set(s.nome_sede, `pending:${s.nome_sede}`);
      continue;
    }

    const siteId = randomUUID();
    const qr = `badge://checkin?site_id=${siteId}&client_id=${clientId}&v=1`;
    await db.query(
      `INSERT INTO sites (id, client_id, name, location, qr_code_content, latitude, longitude, geofence_radius_meters)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [siteId, clientId, s.nome_sede, s.indirizzo || null, qr,
        s.latitudine, s.longitudine, s.raggio_geofence_m != null ? s.raggio_geofence_m : 150]
    );
    siteIdByName.set(s.nome_sede, siteId);
  }

  return siteIdByName;
}

module.exports = { resolveSiteIdByName };
