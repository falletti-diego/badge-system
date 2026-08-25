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

## Testing (vincoli da CLAUDE.md)

- Ogni nuovo confronto di date (`GREATEST`, overlap) su colonne coinvolte deve rispettare il pattern timezone-safe già stabilito (`AT TIME ZONE 'Europe/Rome'` dove si confronta con "oggi" — vedi Pattern 6 di CLAUDE.md); test di regressione con `SET timezone = 'UTC'` sulla connessione di test.
- Nuovi test real-Postgres: ogni asserzione scoped a righe create dal test stesso (Pattern 5 di CLAUDE.md); cleanup in `finally`.
- Casi da coprire: creazione Ferie/Evento bloccata da conflitto esistente (entrambe le direzioni); approvazione bloccata da conflitto comparso dopo la creazione; Malattia mai bloccata in creazione; Malattia futura auto-rigetta Evento/Ferie APPROVED e PENDING; Malattia passata NON tocca Evento/Ferie passati; decremento `used_days` verificato dopo auto-rigetto di una ferie APPROVED; nessuna regressione su `checkins.js` (import invariati da `eventConflict.js`).

## Fuori scope (esplicito)

- Sovrapposizioni tra richieste dello stesso tipo (Ferie-vs-Ferie, oltre a Evento-vs-Evento già gestito).
- Notifiche push/email all'auto-cancellazione.
- Audit/cleanup dei dati di produzione già esistenti (incluso il record di Maria del 25/08/2026).
- Gestione del rifiuto parziale di un range ferie che copre passato+futuro (vedi "Limite accettato" sopra).
