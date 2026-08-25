# Mutua esclusione Evento/Training ↔ Ferie ↔ Malattia — Design Spec

**Data:** 2026-08-25
**Status:** Approvato, pronto per il piano di implementazione

## Problema

Un dipendente può oggi ottenere approvazione simultanea di Evento/Training, Ferie e Malattia per lo stesso giorno — riprodotto manualmente in produzione (`maria@badge.local`, 25/08/2026: evento approvato + ferie approvata + malattia comunicata, tutti attivi contemporaneamente). Le tre richieste devono essere mutuamente esclusive a coppie: in un dato giorno può esistere al più una tra Evento, Ferie, Malattia.

## Causa radice (verificata nel codice)

Esiste già un framework di conflict-check (`backend/src/utils/eventConflict.js`, dalla feature Eventi/Training — PR #7), ma applicato in modo asimmetrico:

| Route | Controllo in creazione | Controllo in approvazione |
|---|---|---|
| `events.js` POST /request | ✅ checkin, ferie (PENDING/APPROVED), malattia (attiva), smart-working, altri eventi | — |
| `events.js` PUT /:id/approve | — | ⚠️ solo checkin + smart-working — **manca ferie/malattia** |
| `leaves.js` POST /request | ❌ nessuno | — |
| `leaves.js` PUT /:id/approve | — | ❌ nessuno |
| `illnesses.js` POST /report (auto-approvata, nessuno step manager) | ❌ nessuno | n/a |

Solo `events.js` implementa logica di conflitto, e comunque incompleta in approvazione. `leaves.js` e `illnesses.js` non controllano nulla — spiega esattamente come Maria ha potuto accumulare tutte e tre le richieste per lo stesso giorno.

## Decisioni di design (dal brainstorming)

1. **Punto di blocco:** sia in creazione sia in approvazione (non solo in creazione) — copre il caso di due richieste PENDING create quando nessun conflitto esisteva ancora, poi approvate entrambe.
2. **Malattia vince sempre:** la Malattia è auto-approvata e non può essere bloccata alla comunicazione. Se comunicata per una data con Evento/Ferie già PENDING/APPROVED, la malattia viene comunque accettata e **cancella automaticamente** (imposta `REJECTED`) l'evento/ferie in conflitto — mai il contrario.
3. **Ferie vs Evento:** simmetrici tra loro. Se uno dei due è già PENDING o APPROVED per una data, l'altro viene **bloccato in fase di invio** (stesso pattern già usato da `events.js` oggi) — non permesso l'invio parallelo con decisione rimandata all'approvazione.
4. **Esito di un conflitto rilevato in approvazione:** errore esplicito, la richiesta resta PENDING — nessuna azione automatica di rifiuto non richiesta dal manager.
5. **Retroattività della malattia:** l'auto-cancellazione si applica **solo a date odierne o future** (calcolate in timezone Europe/Rome). Un evento/ferie interamente nel passato non viene mai toccato automaticamente da una malattia comunicata retroattivamente — evita di alterare silenziosamente ore/buoni pasto potenzialmente già esportati verso il commercialista (Zucchetti/TeamSystem).
6. **Fuori scope:** sovrapposizioni tra richieste dello stesso tipo (due Ferie che si sovrappongono; due Eventi lo stesso giorno — quest'ultimo già gestito da `events.js`); notifiche push/email quando una richiesta approvata viene auto-cancellata (nessuna infrastruttura di notifica esiste oggi nel progetto); audit dei dati di produzione già esistenti prima di questo fix (rimandato, decisione esplicita).
7. **Cleanup del dato corrotto di Maria (25/08/2026):** rimandato a valle di questo fix, non blocca l'implementazione.

## Rischi identificati e mitigati (analisi critica pre-spec)

### 🔴 Saldo ferie (`leave_saldi.used_days`) — rischio di perdita permanente di giorni
`leaves.js:250` incrementa `leave_saldi.used_days` quando una ferie viene approvata. Nessun percorso esistente lo decrementa (`remaining_days` è `GENERATED ALWAYS AS (total_days - used_days) STORED`). Se l'auto-cancellazione da malattia rifiuta una ferie **già APPROVED** senza decrementare `used_days`, il dipendente perde permanentemente quei giorni dal saldo.
**Mitigazione:** quando l'auto-cancellazione rifiuta una ferie con `status` precedente `APPROVED`, decrementare `used_days` dello stesso `num_days`, stessa transazione, stesso guard `leave_type != 'MALATTIA'` usato in approvazione.

### 🔴 Retroattività su dati storici/payroll
`presences.js:252-263,365-374` include eventi/ferie `APPROVED` nel calcolo ore/buoni pasto via query-time join filtrato su `status='APPROVED'` — cambiare lo status a `REJECTED` li esclude automaticamente, **anche per un periodo già esportato verso il commercialista**.
**Mitigazione:** vedi decisione 5 sopra — auto-cancellazione solo su date odierne/future.

### 🟡 Performance e falso "lock occupato" su richieste multi-giorno
Un loop di conflict-check per singolo giorno (con lock per giorno) su una ferie di N giorni farebbe N acquisizioni di lock + N query, e due richieste che si sovrappongono parzialmente potrebbero acquisire lock su giorni diversi in ordine diverso, causando un falso `EVENT_CONFLICT_LOCK_BUSY`.
**Mitigazione:** una singola query di overlap per tipo di conflitto (pattern già in `presences.js:365`, `start_date <= $end AND end_date >= $start`) + un singolo lock per employee (non per giorno) per l'intera operazione multi-giorno.

### 🟢 Compatibilità con i consumer esistenti (verificata)
- `frontend-mobile` (`LeaveRequestScreen.jsx:76`, `EventRequestScreen.jsx:78`) mostra `err.response?.data?.message` verbatim in un Alert — nessun mapping per codice errore, quindi qualunque messaggio scritto lato backend arriva integro e leggibile, nessun rischio di errore non gestito.
- Aggiungere funzioni a `eventConflict.js` è puramente additivo — `checkins.js` (unico altro consumer, oltre a `events.js`) continua a importare solo `findConflictingCheckin`/`findConflictingSmartWorking`, invariati.
- Messaggio d'errore di `events.js:66` (`"A presence or absence is already recorded for this date"`) è in inglese, incongruenza preesistente — va tradotto in italiano nello stesso passaggio, **stesso codice errore `EVENT_DATE_CONFLICT`** per non rompere i test frontend esistenti (`useEvents.test.js:39`) che verificano quel codice.

### Limite accettato, non risolto in questa fase
Una ferie multi-giorno che copre sia passato che futuro (es. 20-30/08, oggi 25/08) e si sovrappone a una malattia futura verrebbe rifiutata **per intero** (incluso il giorno già passato/goduto) — `leave_requests` non supporta il rifiuto parziale di un range. Il saldo tornerebbe comunque corretto (decremento completo), ma il dipendente perderebbe la copertura formale sui giorni già passati della richiesta. Accettato come edge case raro, non affrontato in questa fase.

## Architettura

### `backend/src/utils/eventConflict.js` — estensione additiva

Nuove funzioni range-aware (nessuna modifica alle esistenti):

- `findConflictingEventRange(client, {clientId, employeeId, startDate, endDate})` — `event_requests` con `status IN ('PENDING','APPROVED')` e `event_date BETWEEN $startDate AND $endDate`.
- `findConflictingLeaveRange(client, {clientId, employeeId, startDate, endDate})` — `leave_requests` con `status IN ('PENDING','APPROVED')` e overlap (`start_date <= $endDate AND end_date >= $startDate`).
- `findConflictingIllnessRange(client, {clientId, employeeId, startDate, endDate})` — `illnesses` con `cancelled_at IS NULL` e overlap.
- `lockAbsenceConflictScope(client, {clientId, employeeId})` — lock per-employee (senza data), stesso meccanismo di `pg_advisory_xact_lock` di `lockEventConflictScope` ma a granularità più larga, per serializzare in un colpo solo un'intera operazione multi-giorno.

Le funzioni esistenti (`findConflictingEvent`, `findConflictingCheckin`, `findConflictingSmartWorking`, `lockEventConflictScope`) restano invariate.

### `backend/src/routes/leaves.js`

- **POST /request**: dopo le verifiche esistenti, `lockAbsenceConflictScope` + `findConflictingEventRange` + `findConflictingIllnessRange` su `[start_date, end_date]`. Conflitto → `ConflictError` (italiano, codice `EVENT_DATE_CONFLICT`), nessun insert.
- **PUT /:id/approve**: stesso controllo, prima dell'`UPDATE` a `APPROVED`. Conflitto → errore, la richiesta resta `PENDING`.

### `backend/src/routes/events.js`

- **PUT /:id/approve**: aggiunte le chiamate mancanti a `findConflictingLeave` + `findConflictingIllness` (esistenti, singolo giorno — un evento è sempre un giorno singolo), accanto ai controlli già presenti su checkin/smart-working.
- **POST /request**: nessuna modifica — già corretto.
- Messaggio d'errore a riga 66 tradotto in italiano, stesso codice `EVENT_DATE_CONFLICT`.

### `backend/src/routes/illnesses.js`

- **POST /report**: nessun blocco in creazione. Dopo l'`INSERT`, nella stessa transazione:
  1. `lockAbsenceConflictScope` per l'employee.
  2. Calcola il limite inferiore di ricerca: `GREATEST(illness.start_date, today_Europe_Rome)`.
  3. Cerca `event_requests` (`PENDING`/`APPROVED`) e `leave_requests` (`PENDING`/`APPROVED`) che si sovrappongono a `[limite_inferiore, illness.end_date]`.
  4. Per ciascun risultato: `UPDATE ... SET status = 'REJECTED', rejection_reason = 'Rifiutato automaticamente: malattia comunicata per questa data', updated_at = NOW()`.
  5. Se il record rifiutato è una `leave_requests` il cui `status` precedente era `APPROVED` e `leave_type != 'MALATTIA'`: `UPDATE leave_saldi SET used_days = used_days - $num_days`.
  6. Una voce di audit log per ciascuna cancellazione automatica (`action: 'leave_request_auto_rejected_by_illness'` / `'event_request_auto_rejected_by_illness'`, `oldValue`/`newValue` con lo status).

### `backend/src/utils/demoSeed.js`

- Prima degli `INSERT` di `leave_requests`/`illnesses` demo, chiamare `findConflictingLeaveRange`/`findConflictingIllnessRange` (le stesse funzioni condivise usate dalle route reali) invece di affidarsi all'offset implicito `ferieRun.endIndex + 3` — se un futuro sviluppo del seed introducesse eventi demo o modificasse l'offset, il conflitto verrebbe rilevato dalla stessa fonte di verità usata ovunque, non da una convenzione non verificata. Nessun cambiamento al comportamento attuale (l'offset esistente già non produce conflitti), solo una garanzia esplicita al posto di una implicita.

## Testing (vincoli da CLAUDE.md)

- Ogni nuovo confronto di date (`GREATEST`, overlap) su colonne coinvolte deve rispettare il pattern timezone-safe già stabilito (`AT TIME ZONE 'Europe/Rome'` dove si confronta con "oggi" — vedi Pattern 6 di CLAUDE.md); test di regressione con `SET timezone = 'UTC'` sulla connessione di test.
- Nuovi test real-Postgres: ogni asserzione scoped a righe create dal test stesso (Pattern 5 di CLAUDE.md); cleanup in `finally`.
- Casi da coprire: creazione Ferie/Evento bloccata da conflitto esistente (entrambe le direzioni); approvazione bloccata da conflitto comparso dopo la creazione; Malattia mai bloccata in creazione; Malattia futura auto-rigetta Evento/Ferie APPROVED e PENDING; Malattia passata NON tocca Evento/Ferie passati; decremento `used_days` verificato dopo auto-rigetto di una ferie APPROVED; nessuna regressione su `checkins.js` (import invariati da `eventConflict.js`).

## Seconda review critica — completezza dei punti di scrittura

`grep` su tutto il backend per INSERT/UPDATE sulle 3 tabelle trova **4 file**, non 3: oltre a `events.js`, `leaves.js`, `illnesses.js` c'è **`src/utils/demoSeed.js`**, che inserisce `leave_requests` e `illnesses` con SQL diretto per popolare il tenant demo self-service (`badge.dataxiom.it/prova-demo`, l'asset usato per l'outreach commerciale).

**Non è un bug attivo oggi**: `malattiaRun` è scelto esplicitamente a partire da `ferieRun.endIndex + 3` (offset hard-coded pensato apposta per non sovrapporsi). Ma è un'invariante mantenuta **solo per convenzione nel codice del seed**, non verificata da nulla — un futuro sviluppo di `demoSeed.js` (es. aggiunta di eventi demo) potrebbe reintrodurre esattamente il bug di Maria nel tenant che un prospect vede per primo, senza che nessuno dei controlli nelle 3 route se ne accorga. **Questo significa che il design (controlli solo nelle route HTTP) ha un limite strutturale**: non protegge da un futuro script di seed/import/bulk che scriva direttamente sul DB.

### Alternative valutate per chiudere il gap

1. **Postgres `EXCLUDE` constraint (GiST + daterange).** Scartata: vive dentro una singola tabella, non può esprimere l'esclusione incrociata Ferie↔Evento (tabelle diverse) senza un trigger comunque; inoltre ha semantica di sola rejection, incompatibile con "Malattia vince sempre" (che deve sempre accettare l'insert e agire sugli altri lati).
2. **Trigger DB cross-tabella** (BEFORE INSERT/UPDATE su `leave_requests`/`event_requests`, AFTER INSERT su `illnesses`) — stesso pattern già usato con successo per l'invariante `assigned_sites` (Session 93: "non un'altra patch one-off, ma un trigger che garantisce l'invariante per sempre, indipendentemente da quale codice scriva sulla tabella in futuro"). Chiuderebbe anche `demoSeed.js` e qualunque futuro script bulk/import. Contro: sposterebbe la logica di cascata + audit in PL/pgSQL, rompendo la coerenza con `logAudit()` (helper JS già usato ovunque nel resto del codebase) e senza precedenti in questo progetto di audit-log scritto da un trigger (solo invarianti semplici come `assigned_sites`).
3. **Vista unificata di sola lettura `v_employee_absences`** (UNION ALL normalizzato) — riduce la duplicazione delle query di conflitto in un'unica fonte di verità, ma da sola non chiude il gap: continua a servire solo chi la interroga esplicitamente, `demoSeed.js` potrebbe comunque ignorarla.

### Decisione

Non spostare la logica di cascata/audit nei trigger ora — salto di complessità sproporzionato rispetto al problema reale trovato (`demoSeed.js` è fragile, non bacato oggi), e romperebbe la coerenza con `logAudit()`. Tre azioni concrete, a basso rischio, aggiunte allo scope di questo fix:

1. **`demoSeed.js` chiama la stessa funzione condivisa di conflict-check** (`eventConflict.js`) prima di inserire ferie/malattia demo, invece di affidarsi all'offset implicito `+3` — stesso principio "single source of truth" già richiesto altrove nel progetto (Pattern 4 di CLAUDE.md, DRY sui dati demo).
2. **Nuovo "Known Bug Pattern 7" in CLAUDE.md**: qualunque futuro punto di scrittura su `event_requests`/`leave_requests`/`illnesses` (import CSV, wizard onboarding, script di seed) deve passare dalla stessa funzione condivisa — così una prossima feature che tocca queste tabelle non reintroduce il buco per ignoranza, invece di scoprirlo in produzione come successo con Maria.
3. **Trigger DB rimandato esplicitamente come hardening futuro**, non bloccante per questo fix — da riconsiderare seriamente se in futuro arriva un vero bulk-import di ferie/eventi (il progetto ne ha già uno per i dipendenti, `admin/employees.js`) che scriverebbe di nuovo bypassando le route.

## Fuori scope (esplicito)

- Sovrapposizioni tra richieste dello stesso tipo (Ferie-vs-Ferie, oltre a Evento-vs-Evento già gestito).
- Notifiche push/email all'auto-cancellazione.
- Audit/cleanup dei dati di produzione già esistenti (incluso il record di Maria del 25/08/2026).
- Gestione del rifiuto parziale di un range ferie che copre passato+futuro (vedi "Limite accettato" sopra).
