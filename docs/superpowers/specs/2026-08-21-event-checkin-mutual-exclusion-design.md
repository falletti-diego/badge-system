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
const { ConflictError } = require('./errors');

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
  // Full 64-bit signed int (pg_advisory_xact_lock(bigint)'s native width) from a
  // stable hash, avoiding both Postgres's undocumented hashtext() and the much
  // higher collision rate a 32-bit truncation would have under concurrent load
  // (birthday-paradox collisions become non-negligible past ~65k distinct keys
  // at 32 bits; at 64 bits that threshold moves to billions).
  const lockKey = hash.readBigInt64BE(0).toString(); // pg driver expects a string/number for bigint params, not a raw JS BigInt
  // lock_timeout scoped to this transaction only (reset automatically at
  // COMMIT/ROLLBACK) — without it, a stuck peer transaction would block this
  // one indefinitely, risking the kind of pool exhaustion this project has
  // hit before (see backend_stability_crisis memory). 3s is generous for a
  // single-row lookup + lock acquisition.
  await client.query("SET LOCAL lock_timeout = '3s'");
  try {
    await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
  } catch (err) {
    if (err.code === '55P03') { // lock_not_available
      throw new ConflictError('Un\'altra operazione è in corso per questo dipendente e questa data, riprova tra qualche secondo', 'EVENT_CONFLICT_LOCK_BUSY');
    }
    throw err;
  }
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

Design note: `hashtext()` di Postgres non è documentato come stabile tra versioni maggiori; si usa invece un hash SHA-256 calcolato lato Node, deterministico e stabile per definizione, letto come intero a 64 bit con segno (stessa ampiezza nativa di `pg_advisory_xact_lock(bigint)`).

Nota sulla portata del lock: questa funzione protegge solo la race tra `event_requests` e `checkins` (i due lati toccati da questa feature). Il conflitto più ampio già controllato dalla query `UNION ALL` di `events.js POST /request` (che include anche `leave_requests`, `illnesses`, `smart_working_days`) resta esposto alla stessa razza di prima per quelle altre tre tabelle — non peggiorato, ma nemmeno risolto da questo lock. Fuori scope per questa feature.

### 2. `checkins.js POST /` — blocco in creazione

Nella transazione esistente (`withTransaction`, dentro `checkins.js:62-244`), tra la riga 148 (fine del controllo QR content) e la riga 150 (inizio del controllo geofence) — **dopo** tutte le validazioni economiche già presenti (ownership, employee attivo, sede, assegnazione, QR content) e **prima** del geofence, che è l'unico controllo costoso/dipendente da GPS in questo handler, per non forzare inutilmente un dialogo di consenso GPS su un check-in che verrà comunque rifiutato:

```js
const effectiveDate = dateInTimeZone(occurredAt); // riusa l'util già in uso in questo file
await lockEventConflictScope(client, { clientId, employeeId: employee.id, date: effectiveDate });
const conflictingEvent = await findConflictingEvent(client, { clientId, employeeId: employee.id, date: effectiveDate });
if (conflictingEvent) {
  throw new ConflictError(
    `Esiste già un evento (${conflictingEvent.description}) programmato per questa data per questo dipendente`,
    'EVENT_DATE_CONFLICT'
  );
}
```

(Messaggio in terza persona, non "Hai un evento...": questo stesso path viene attraversato anche quando è un admin a inserire un check-in per conto di un altro dipendente, dove la prima persona sarebbe grammaticalmente sbagliata.)

### 3. `checkins.js PUT /:id` — blocco in correzione

Dopo il lookup del checkin esistente (riga ~468) e prima dell'`UPDATE` (riga ~512), se `newTimestamp` è fornito: calcolare la nuova data effettiva e ripetere lo stesso controllo (stesso pattern del punto 2). Se `newTimestamp` non è fornito, nessun controllo necessario (la data non cambia).

### 4. `events.js PUT /:id/approve` — blocco in approvazione

Nella transazione esistente, prima di eseguire l'`UPDATE ... SET status = 'APPROVED'`:

```js
await lockEventConflictScope(client, { clientId, employeeId: event.user_id, date: event.event_date });
const conflictingCheckin = await findConflictingCheckin(client, { clientId, employeeId: event.user_id, date: event.event_date });
if (conflictingCheckin) {
  throw new ConflictError(
    'Impossibile approvare: esiste già un check-in registrato per questa data',
    'EVENT_DATE_CONFLICT',
    {
      conflicting_checkin_id: conflictingCheckin.id,
      conflicting_checkin_timestamp: conflictingCheckin.timestamp,
      conflicting_checkin_type: conflictingCheckin.type,
    }
  );
}
```

`ConflictError` (`backend/src/utils/errors.js:45-50`) va esteso con un 3° parametro opzionale `details = null`, stesso pattern già usato da `ValidationError` (`errors.js:16-22`):

```js
class ConflictError extends ApiError {
  constructor(message, code = 'CONFLICT', details = null) {
    super(code, message, 409);
    this.name = 'ConflictError';
    this.details = details;
  }
}
```

Modifica additiva e retrocompatibile (parametro opzionale in coda, tutte le chiamate esistenti a 2 argomenti restano valide). Il middleware d'errore (`app.js:260-263`) serializza già genericamente `err.details` per qualunque classe, nessuna modifica lì necessaria. Questo espone all'admin/manager, nel body dell'errore 409, il check-in esatto da correggere — chiude il vicolo cieco UX identificato in fase di analisi.

### 5. `events.js POST /request` — solo aggiunta del lock

La query `UNION ALL` esistente resta invariata; si aggiunge solo `await lockEventConflictScope(...)` prima di eseguirla, per chiudere anche questa direzione alla race condition.

### 6. `GET /api/v1/events/my-requests` — filtri data opzionali (per il mobile)

Aggiungere `date_from`/`date_to` opzionali alla query esistente (stesso pattern già presente su `GET /events/approved`), per permettere al mobile una query mirata "solo oggi" invece di scaricare fino a 100 righe.

### 7. Mobile — `QRScannerScreen.jsx`

Su mount/focus, chiamata a `GET /events/my-requests?date_from=<oggi>&date_to=<oggi>`. Tre stati espliciti, in aggiunta a quello già esistente per il permesso fotocamera:

- **In corso**: spinner (stesso stile di `LoadingSpinner.jsx` già in uso altrove nell'app) al posto della camera, per evitare un flash camera→blocco mentre la risposta è in transito.
- **Risposta con un evento `PENDING`/`APPROVED` per oggi**: sostituire `<CameraView>` con una schermata di blocco (stesso pattern del permesso fotocamera negato) che mostra descrizione/orario dell'evento e impedisce lo scan.
- **Errore di rete/timeout sulla chiamata**: **fail-open** — la fotocamera si apre normalmente, senza messaggio di blocco. Il controllo lato server (punto 2) resta l'autorità finale e blocca comunque con 409 in caso di vero conflitto; non ha senso impedire il check-in, funzione più critica, per un problema di rete su una verifica preventiva secondaria. Lo stesso principio vale per l'eventuale race tra apertura schermata e scan (l'evento potrebbe essere approvato nel frattempo): il 409 del server è sempre la difesa in profondità finale.

### 8. Web

Nessuna UI dedicata: l'errore 409 viene mostrato con il pattern generico già esistente per gli altri errori di validazione check-in. Il campo `details` (punto 4) è disponibile per un miglioramento futuro della UI, ma non è nello scope di questa iterazione mostrarlo esplicitamente.

---

## Error handling

Tutti i conflitti usano lo stesso error code `EVENT_DATE_CONFLICT`, HTTP 409, coerente con quello già esistente in `events.js POST /request` — è sempre la stessa classe di conflitto vista da lati diversi. Un `lock_timeout` scaduto usa invece il codice distinto `EVENT_CONFLICT_LOCK_BUSY` (409), per non confonderlo con un vero conflitto di dati — il client può ritentare, un vero `EVENT_DATE_CONFLICT` invece no finché la condizione non cambia. `REJECTED` non blocca mai (filtro `status IN ('PENDING', 'APPROVED')` esplicito in tutte le query).

## Testing

TDD per ciascuno dei 4 punti (2, 3, 4, 5): test che crea un evento PENDING/APPROVED poi tenta un'azione conflittuale → 409 `EVENT_DATE_CONFLICT`; test che verifica che `REJECTED` non blocca; test sul filtro `date_from`/`date_to` di `/my-requests`; test RN per i tre stati (loading / bloccato / fail-open su errore rete) in `QRScannerScreen`. Un check-in `IN` aperto già esistente non viene mai toccato automaticamente da nessuno di questi cambi (confermato in fase di analisi) — resta responsabilità del manager/admin gestirlo manualmente se vuole sbloccare un'approvazione.

**Test di concorrenza (obbligatorio, non opzionale):** i test TDD sopra sono sequenziali e non verificano la garanzia principale della Soluzione A — la protezione dalla race condition. Serve almeno un test di integrazione che apra due connessioni/transazioni reali distinte dal pool (non un solo client) per la stessa coppia (employee, date): una che crea un check-in, una che approva un evento in parallelo, verificando che la seconda attenda la prima (o fallisca con `EVENT_CONFLICT_LOCK_BUSY` se il `lock_timeout` di test è molto basso) invece di procedere entrambe senza conflitto rilevato. Senza questo test, il codice "sembra corretto" a un normale code review ma la garanzia di atomicità resta interamente non verificata.

## Known gap fuori scope (non affrontato in questa iterazione)

`smart_working_days` non blocca oggi la creazione di check-in nella direzione checkin→smart-working (stessa classe di asimmetria, ma per una feature diversa da quella richiesta). Segnalato per consapevolezza, nessuna azione in questo piano.
