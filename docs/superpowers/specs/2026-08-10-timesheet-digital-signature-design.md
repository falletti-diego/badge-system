# Firma Digitale Cartellino Mensile — Design

**Data:** 10 Agosto 2026
**Status:** Approvato
**Backlog:** `TASKS.md` §🎯 TODO — MVP Hardening, riga "Firma digitale cartellino mensile"

---

## Contesto

Valore percepito "strumento serio" per HR/paghe italiano — il dipendente vede e approva esplicitamente le ore del mese prima che vengano usate per il calcolo paghe, riducendo contestazioni successive. Riusa il pattern audit log già esistente nel resto del codebase.

**Fatto strutturale scoperto durante l'esplorazione (non assunto)**: oggi il dipendente non ha alcuna pagina web dove vedere il proprio riepilogo ore mensile. `GET /api/v1/presences/summary` (usato da `SummaryPage.jsx`, `/summary`) è esplicitamente vietato al ruolo `employee` (`backend/src/routes/presences.js:28-30`, `ForbiddenError('Employees cannot access the monthly summary', 'FORBIDDEN_ROLE')`) e mostra comunque la tabella aggregata di *tutti* i dipendenti di una sede, non un cartellino individuale. Questo piano quindi non aggiunge solo una firma — costruisce anche la vista individuale mancante.

## Scope

**Dentro lo scope:**
- Nuova tabella `timesheet_signatures` + migration
- `GET /api/v1/presences/my-summary?month&year` — riepilogo ore self-scoped per il dipendente autenticato
- `POST /api/v1/timesheet/sign` — firma (click-to-accept, non firma grafica) del mese, idempotente
- Invalidazione automatica della firma se un check-in del mese firmato viene creato o corretto dopo la firma
- `MySummaryPage.jsx` (web, `/my-summary`, ruolo `employee`) — vista individuale + bottone firma
- Colonna "Firmato" in `SummaryPage.jsx` esistente (admin/manager/viewer)

**Fuori scope (deciso esplicitamente in fase di brainstorming):**
- Firma grafica disegnata (canvas/signature-pad) — click-to-accept con audit trail è sufficiente e molto più economico
- App mobile — solo web dashboard in questa iterazione (il dipendente ha già accesso al dashboard web per ferie/malattia, stesso pattern)
- Sblocco/reset manuale della firma da parte dell'admin per motivi non legati a correzioni di check-in (es. errore di configurazione soglia buoni pasto) — accettato come rischio residuo, non nel MVP di questa feature

## Decisioni chiave (con analisi critica applicata, non solo la prima bozza)

Un'analisi critica esplicita (`/senior-architect` + revisione manuale contro il codice reale) ha trovato 3 problemi nella bozza iniziale del design, tutti incorporati qui:

1. **Idempotenza.** Un doppio tap su "Approvo" con una `INSERT` naive creerebbe righe duplicate o stato ambiguo. Risolto con `UNIQUE (employee_id, month, year)` + `INSERT ... ON CONFLICT DO UPDATE` (upsert) — vedi Architettura.
2. **Firma di un mese ancora in corso.** Se permessa, il check-in non firmato del mese non ha ancora tutti i dati (il mese non è finito), e — punto più sottile — check-in *nuovi* (non correzioni) non passano da nessun hook di invalidazione nella bozza iniziale, quindi la firma resterebbe "valida" su dati incompleti. Risolto bloccando `POST /timesheet/sign` server-side per il mese corrente/futuro, indipendentemente da cosa mostra la UI.
3. **Invalidazione solo su correzioni non basta, per via dell'offline mode.** `validation.js` (`PostCheckinSchema`) accetta `occurred_at` fino a **48 ore nel passato** per il sync dei check-in offline (`POST /checkins`, non `PUT`). Se un dipendente firma il mese N il giorno 2 del mese N+1 e un check-in offline dell'ultimo giorno del mese N sincronizza il giorno 3 (dentro la finestra di 48h), quel check-in arriva via `POST`, non via correzione — un hook posizionato solo su `PUT /checkins/:id` non lo vedrebbe mai. Risolto con una funzione di invalidazione condivisa, richiamata da **entrambi** i path che scrivono un `checkin.timestamp` (creazione e correzione).

**Decisione esplicita da preservare (non un'omissione):** lo snapshot delle ore viene salvato al momento della firma e **non viene mai ricalcolato retroattivamente**, nemmeno se in futuro la logica di `utils/hours.js` cambia. Una firma deve continuare a rappresentare esattamente cosa il dipendente ha visto e approvato in quel momento — un ricalcolo silenzioso la svuoterebbe di valore probatorio.

## Architettura

### Migration `039_add_timesheet_signatures.sql`

```sql
CREATE TABLE timesheet_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INT NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  status TEXT NOT NULL DEFAULT 'signed' CHECK (status IN ('signed', 'invalidated')),
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invalidated_at TIMESTAMPTZ,
  ore_totali NUMERIC(6,2) NOT NULL,
  ore_ordinarie NUMERIC(6,2) NOT NULL,
  ore_straordinarie NUMERIC(6,2) NOT NULL,
  giorni_presenti INT NOT NULL,
  buoni_pasto INT NOT NULL,
  UNIQUE (employee_id, month, year)
);
CREATE INDEX idx_timesheet_signatures_client_period ON timesheet_signatures(client_id, year, month);
```

Lo `UNIQUE (employee_id, month, year)` serve sia da vincolo di idempotenza sia da indice per i lookup più comuni ("è firmato questo mese per questo dipendente?").

### `backend/src/utils/timesheetSignature.js` (nuovo)

```javascript
async function invalidateSignatureIfExists(client, employeeId, checkinTimestamp) {
  const d = new Date(checkinTimestamp);
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();
  await client.query(
    `UPDATE timesheet_signatures
     SET status = 'invalidated', invalidated_at = NOW()
     WHERE employee_id = $1::uuid AND month = $2 AND year = $3 AND status = 'signed'`,
    [employeeId, month, year]
  );
}

module.exports = { invalidateSignatureIfExists };
```

Nota: usa `getUTCMonth()`/`getUTCFullYear()`, stessa convenzione UTC già usata da `GET /presences/summary` (`Date.UTC(year, month-1, 1)`) — coerenza con il comportamento esistente, non un nuovo assunto sul fuso orario.

### Punti di richiamo (fix #3 — nessuna logica duplicata)

- `backend/src/routes/checkins.js`, `POST /` (dopo l'`INSERT ... RETURNING`, dentro la stessa transazione): `await invalidateSignatureIfExists(client, employee_id, insertedCheckin.timestamp);`
- `backend/src/routes/checkins.js`, `PUT /:id` (dopo l'`UPDATE ... RETURNING`, prima del commit): `await invalidateSignatureIfExists(client, checkin.employee_id, updated.timestamp);` — nota: se la correzione cambia il `timestamp` in un mese diverso da quello originale, invalidare **entrambi** i mesi coinvolti (quello vecchio e quello nuovo, se diversi), chiamando la funzione due volte con i due timestamp.

### `GET /api/v1/presences/my-summary?month&year` (nuovo, in `presences.js`)

- RBAC: nessun check esplicito di ruolo necessario — l'endpoint è intrinsecamente self-scoped, `employee_id` e `client_id` vengono **sempre e solo** da `req.user`, mai accettati come query param. Questo elimina strutturalmente la classe di bug "vedo il cartellino di un altro dipendente", non la previene con un controllo aggiuntivo.
- Riusa `calculateDailyHours`/`aggregateMonthly` da `utils/hours.js` (stessa identica funzione già usata da `GET /presences/summary`), filtrando i check-in su `employee_id = req.user.employee_id` invece che sull'intero cliente/sede.
- Risposta:
```json
{
  "success": true,
  "data": {
    "period": { "month": 7, "year": 2026 },
    "giorni_presenti": 21, "ore_totali": 168.5, "ore_ordinarie": 160, "ore_straordinarie": 8.5, "buoni_pasto": 18,
    "signature": { "status": "signed", "signed_at": "2026-08-02T09:14:00Z" }
  }
}
```
`signature` è `null` se il mese non è mai stato firmato.

### `POST /api/v1/timesheet/sign` (nuovo router `backend/src/routes/timesheet.js`, montato su `/api/v1/timesheet`)

- Body: `{ month, year }` (Zod: `month` 1-12, `year` 2020-2100)
- `employee_id`/`client_id` da `req.user`
- **Guard fix #2**: se `year > currentYear || (year === currentYear && month >= currentMonth)` → `400 CANNOT_SIGN_CURRENT_MONTH`
- Calcola lo snapshot (stessa funzione di `my-summary`), upsert nella tabella:
```sql
INSERT INTO timesheet_signatures (employee_id, client_id, month, year, status, signed_at, ore_totali, ore_ordinarie, ore_straordinarie, giorni_presenti, buoni_pasto)
VALUES ($1, $2, $3, $4, 'signed', NOW(), $5, $6, $7, $8, $9)
ON CONFLICT (employee_id, month, year)
DO UPDATE SET status = 'signed', signed_at = NOW(),
  ore_totali = EXCLUDED.ore_totali, ore_ordinarie = EXCLUDED.ore_ordinarie,
  ore_straordinarie = EXCLUDED.ore_straordinarie, giorni_presenti = EXCLUDED.giorni_presenti,
  buoni_pasto = EXCLUDED.buoni_pasto
RETURNING *;
```
- `logAudit(pool, { action: 'timesheet_signed', entity: 'timesheet_signature', entityId: row.id, oldValue: null, newValue: {...snapshot}, userId: req.user.user_id, clientId: req.user.client_id }).catch(...)` — parametri camelCase (stesso bug già trovato e fixato due volte in `consent.js` durante Fase C, non da ripetere una terza volta).

### `GET /api/v1/presences/summary` esistente — estensione (colonna "Firmato" per l'admin)

`LEFT JOIN timesheet_signatures ts ON ts.employee_id = e.id AND ts.month = $month AND ts.year = $year AND ts.client_id = $client_id`, aggiunge `signature_status` (`'signed'` | `'invalidated'` | `null`) e `signed_at` ad ogni riga dipendente nella risposta esistente.

## Frontend — `frontend-web/src/pages/MySummaryPage.jsx` (nuovo)

- Route `/my-summary`, `requiredRole="employee"` in `App.jsx`
- Riusa il rendering tabellare di `SummaryPage.jsx` (stessa formattazione ore, stessi selettori mese/anno) ma per una singola riga (i propri dati)
- Banner di stato sopra la tabella:
  - Nessuna firma → "Da firmare" (grigio) + bottone "Approvo il cartellino" (disabilitato se mese corrente/futuro, con tooltip "Disponibile a fine mese")
  - `status: 'signed'` → "✅ Firmato il {data}" (verde), bottone assente
  - `status: 'invalidated'` → "⚠️ Modificato dopo la firma — richiede nuova firma" (ambra), bottone "Approvo il cartellino" riappare

## Frontend — `SummaryPage.jsx` esistente — estensione

Nuova colonna "Firmato" nella tabella: chip verde "✅ gg/mm" se `signature_status === 'signed'`, chip ambra "⚠️ Da rifirmare" se `'invalidated'`, testo grigio "—" se mai firmato.

## Testing

- Backend: `timesheet-sign.test.js` (idempotenza upsert — 2 POST identici → 1 riga; guard mese corrente → 400; snapshot corretto), `timesheet-invalidation.test.js` (nuovo check-in in mese firmato → invalidato; correzione in mese firmato → invalidato; correzione che sposta il timestamp in un mese diverso → invalida entrambi i mesi se entrambi firmati; correzione fuori mese firmato → nessun effetto), estensione `presences-summary.test.js` (colonna firma popolata correttamente)
- Frontend: `MySummaryPage.test.jsx` (nuovo — rendering banner nei 3 stati, bottone disabilitato su mese corrente, click firma → chiamata API → refresh stato), estensione `SummaryPage.test.jsx` (colonna Firmato)

## Rischi residui accettati

- Nessun reset manuale della firma da parte dell'admin per casi non legati a correzioni di check-in (es. bug di calcolo scoperto dopo) — se serve, richiede intervento diretto sul DB nel breve termine, backlog futuro se il caso si presenta davvero.
- La firma non blocca in alcun modo l'elaborazione paghe lato cliente — è un record di trasparenza/audit, non un gate tecnico. Coerente con lo scope "Medio impatto, Basso-Medio sforzo" dichiarato in `TASKS.md`.
