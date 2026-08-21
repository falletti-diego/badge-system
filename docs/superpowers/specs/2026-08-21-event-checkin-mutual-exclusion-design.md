# Mutua esclusione Evento ↔ Check-in — Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Un dipendente con una richiesta di evento PENDING o APPROVED per una certa data non deve poter avere anche un check-in QR (timbratura) per quella stessa data, e viceversa — in nessuno dei percorsi che possono creare o modificare l'uno o l'altro record.

**Architecture:** Il sistema oggi blocca solo la creazione di un evento se esiste già un check-in/assenza per quella data (`events.js` `POST /request`, query `UNION ALL` su 5 tabelle → `ConflictError('EVENT_DATE_CONFLICT')`). Manca la direzione opposta e due percorsi di modifica. Si introduce una libreria condivisa `backend/src/utils/eventConflict.js` con:
- un **advisory lock Postgres** per-transazione su `(client_id, employee_id, date)`, per rendere atomico il "check poi scrivi" tra le due tabelle (che non possono avere un vincolo DB diretto, essendo tabelle diverse);
- due query di conflitto riusabili (evento→checkin e checkin→evento).

Questa libreria viene usata in **4 punti**, coprendo tutti i percorsi che possono creare il conflitto:
1. `events.js POST /request` (già esistente, viene aggiunto solo il lock)
2. `checkins.js POST /` (nuovo)
3. `checkins.js PUT /:id` — correzione check-in (nuovo, chiude un gap: oggi si può spostare la data di un check-in senza controlli)
4. `events.js PUT /:id/approve` (nuovo)

**Tech Stack:** Node.js/Express/pg esistenti, nessuna nuova dipendenza. `pg_advisory_xact_lock` (built-in Postgres, si rilascia automaticamente a fine transazione).

---

## Componenti

### 1. `backend/src/utils/eventConflict.js` (nuovo file)

```js
const crypto = require('crypto');

/**
 * Serializes any conflict-check-then-write for a given (client, employee, date)
 * scope across the whole request lifetime of the transaction, so a checkin
 * creation and an event approval racing for the same slot can't both pass
 * their own conflict check before either commits. Released automatically at
 * transaction end (COMMIT/ROLLBACK) — no explicit unlock needed.
 */
async function lockEventConflictScope(client, { clientId, employeeId, date }) {
  const key = `${clientId}:${employeeId}:${date}`;
  const hash = crypto.createHash('sha256').update(key).digest();
  // hashtext-style 32-bit signed int from the first 4 bytes of a stable hash,
  // avoids relying on Postgres's own hashtext() (undocumented algorithm).
  const lockKey = hash.readInt32BE(0);
  await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
}

/** Returns the conflicting event_requests row (PENDING/APPROVED) for a checkin's date, or null. */
async function findConflictingEvent(client, { clientId, employeeId, date }) {
  const result = await client.query(
    `SELECT id, event_date::text AS event_date, start_time, end_time, description, status
     FROM event_requests
     WHERE client_id = $1::uuid AND user_id = $2::uuid AND event_date = $3::date
       AND status IN ('PENDING', 'APPROVED')
     LIMIT 1`,
    [clientId, employeeId, date]
  );
  return result.rows[0] || null;
}

/** Returns the conflicting checkins row for an event's date, or null. */
async function findConflictingCheckin(client, { clientId, employeeId, date }) {
  const result = await client.query(
    `SELECT c.id, c.timestamp, c.type
     FROM checkins c
     JOIN employees e ON e.id = c.employee_id
     WHERE e.client_id = $1::uuid AND c.employee_id = $2::uuid AND c.timestamp::date = $3::date
     LIMIT 1`,
    [clientId, employeeId, date]
  );
  return result.rows[0] || null;
}

module.exports = { lockEventConflictScope, findConflictingEvent, findConflictingCheckin };
```

Design note: `hashtext()` di Postgres non è documentato come stabile tra versioni maggiori; si usa invece un hash SHA-256 calcolato lato Node e troncato a 32 bit con segno, deterministico e stabile per definizione.

### 2. `checkins.js POST /` — blocco in creazione

Nella transazione esistente (`withTransaction`, dentro `checkins.js:62-244`), subito dopo il lookup employee/site (circa riga 123, **prima** del controllo geofence per evitare inutili dialoghi GPS su un check-in che verrà comunque rifiutato):

```js
const effectiveDate = dateInTimeZone(occurredAt); // riusa l'util già in uso in questo file
await lockEventConflictScope(client, { clientId, employeeId: employee.id, date: effectiveDate });
const conflictingEvent = await findConflictingEvent(client, { clientId, employeeId: employee.id, date: effectiveDate });
if (conflictingEvent) {
  throw new ConflictError(
    `Hai un evento (${conflictingEvent.description}) programmato per questa data`,
    'EVENT_DATE_CONFLICT'
  );
}
```

### 3. `checkins.js PUT /:id` — blocco in correzione

Dopo il lookup del checkin esistente (riga ~468) e prima dell'`UPDATE` (riga ~512), se `newTimestamp` è fornito: calcolare la nuova data effettiva e ripetere lo stesso controllo (stesso pattern del punto 2). Se `newTimestamp` non è fornito, nessun controllo necessario (la data non cambia).

### 4. `events.js PUT /:id/approve` — blocco in approvazione

Nella transazione esistente, prima di eseguire l'`UPDATE ... SET status = 'APPROVED'`:

```js
await lockEventConflictScope(client, { clientId, employeeId: event.user_id, date: event.event_date });
const conflictingCheckin = await findConflictingCheckin(client, { clientId, employeeId: event.user_id, date: event.event_date });
if (conflictingCheckin) {
  const err = new ConflictError(
    'Impossibile approvare: esiste già un check-in registrato per questa data',
    'EVENT_DATE_CONFLICT'
  );
  err.details = {
    conflicting_checkin_id: conflictingCheckin.id,
    conflicting_checkin_timestamp: conflictingCheckin.timestamp,
    conflicting_checkin_type: conflictingCheckin.type,
  };
  throw err;
}
```

`ConflictError` non ha oggi un parametro `details` nel costruttore (a differenza di `ValidationError`); si assegna `.details` direttamente sull'istanza — il middleware d'errore (`app.js:260-263`) lo serializza già genericamente per qualunque classe di errore, nessuna modifica lì necessaria. (In alternativa più pulita: estendere il costruttore di `ConflictError` con un 3° parametro opzionale `details = null`, stesso pattern di `ValidationError`. Scelta implementativa lasciata al piano.)

Questo espone all'admin/manager, nel body dell'errore 409, il check-in esatto da correggere — chiude il vicolo cieco UX identificato in fase di analisi.

### 5. `events.js POST /request` — solo aggiunta del lock

La query `UNION ALL` esistente resta invariata; si aggiunge solo `await lockEventConflictScope(...)` prima di eseguirla, per chiudere anche questa direzione alla race condition.

### 6. `GET /api/v1/events/my-requests` — filtri data opzionali (per il mobile)

Aggiungere `date_from`/`date_to` opzionali alla query esistente (stesso pattern già presente su `GET /events/approved`), per permettere al mobile una query mirata "solo oggi" invece di scaricare fino a 100 righe.

### 7. Mobile — `QRScannerScreen.jsx`

Su mount/focus, chiamata a `GET /events/my-requests?date_from=<oggi>&date_to=<oggi>`; se una riga ha `status` `PENDING` o `APPROVED`, sostituire la vista `<CameraView>` con una schermata di blocco (stesso pattern già usato per il permesso fotocamera negato) che mostra descrizione/orario dell'evento e impedisce lo scan. Il controllo lato server (punto 2) resta comunque come difesa in profondità per eventuali race tra apertura schermata e scan.

### 8. Web

Nessuna UI dedicata: l'errore 409 viene mostrato con il pattern generico già esistente per gli altri errori di validazione check-in. Il campo `details` (punto 4) è disponibile per un miglioramento futuro della UI, ma non è nello scope di questa iterazione mostrarlo esplicitamente.

---

## Error handling

Tutti i conflitti usano lo stesso error code `EVENT_DATE_CONFLICT`, HTTP 409, coerente con quello già esistente in `events.js POST /request` — è sempre la stessa classe di conflitto vista da lati diversi. `REJECTED` non blocca mai (filtro `status IN ('PENDING', 'APPROVED')` esplicito in tutte le query).

## Testing

TDD per ciascuno dei 4 punti (2, 3, 4, 5): test che crea un evento PENDING/APPROVED poi tenta un'azione conflittuale → 409 `EVENT_DATE_CONFLICT`; test che verifica che `REJECTED` non blocca; test sul filtro `date_from`/`date_to` di `/my-requests`; test RN per lo stato di blocco in `QRScannerScreen`. Un check-in `IN` aperto già esistente non viene mai toccato automaticamente da nessuno di questi cambi (confermato in fase di analisi) — resta responsabilità del manager/admin gestirlo manualmente se vuole sbloccare un'approvazione.

## Known gap fuori scope (non affrontato in questa iterazione)

`smart_working_days` non blocca oggi la creazione di check-in nella direzione checkin→smart-working (stessa classe di asimmetria, ma per una feature diversa da quella richiesta). Segnalato per consapevolezza, nessuna azione in questo piano.
