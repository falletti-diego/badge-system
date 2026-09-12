# ONB.2 — Saldi Ferie: Mezze Giornate — Design

**Data:** 2026-09-12
**Status:** Approvato dall'utente, pronto per writing-plans

## Contesto

`TASKS.md` conteneva una voce di backlog (ONB.2) che descriveva sia "mezze giornate ferie" sia "Permessi/ROL in ore" come un'unica modifica di schema. Analizzando lo stato attuale del codice, le due cose hanno scope diverso: le mezze giornate sono un cambio di granularità su un tipo di assenza già esistente (`FERIE_1`/`FERIE_2`/`FERIE_3`), mentre "Permessi/ROL" richiederebbe la creazione di un **nuovo tipo di assenza da zero** (oggi la tabella `leaves` ha solo 4 codici: `FERIE_1`, `FERIE_2`, `FERIE_3`, `MALATTIA`).

## Scope

**Incluso in questo lavoro:** supporto a mezze giornate (0.5) per `FERIE_1`/`FERIE_2`/`FERIE_3`, sia nella richiesta del dipendente sia nel saldo iniziale caricato in fase di onboarding cliente.

**Escluso (ONB.2b, futuro separato):** creazione del tipo di assenza "Permessi/ROL" con unità in ore. Non è una semplice estensione di questo lavoro — richiede nuovo form, nuova validazione, nuovo blocco turni in Planning, nuovi saldi in ore.

`leave_saldi`/`leave_requests` è un'area sempre-pesante secondo CLAUDE.md (bug storici Pattern 1/5/6, cronologia RBAC Sessioni 116-118) — da qui la scelta di passare per brainstorming completo invece del percorso leggero.

## Decisioni

1. **Scope**: solo mezze giornate Ferie in questo lavoro (vedi sopra).
2. **UX toggle**: il toggle "mezza giornata" appare **solo** quando `start_date === end_date` (richiesta di un singolo giorno). Per range multi-giorno resta sempre giorni interi — evita l'ambiguità "mezza giornata a inizio o fine range?".
3. **Migrazione dati produzione**: nessun backfill/dry-run separato necessario. `INT → NUMERIC(6,2)` è un widening sicuro (nessun valore esistente può essere troncato); la migration standard, testata su CI con Postgres reale, è sufficiente.
4. **Display**: valori decimali mostrati con 1 decimale solo se necessario (`20` resta `"20"`, `19.5` diventa `"19,5"`) — non sempre 2 decimali fissi.
5. **Onboarding**: il foglio saldi del template Excel può già contenere valori decimali (es. saldo residuo 19,5 giorni migrato da un sistema precedente) — la granularità qui non è vincolata a step di 0.5 come nel form dipendente, può essere un decimale arbitrario entro `NUMERIC(6,2)`.

## Problemi trovati durante l'analisi (non nella bozza originale di TASKS.md)

### 1. Ordine della migration è vincolante

Postgres non permette `ALTER COLUMN ... TYPE` su una colonna da cui dipende una `GENERATED ALWAYS AS` esistente (`remaining_days`). Bisogna droppare la generated column, alterare le colonne sorgente, poi ricrearla.

### 2. `node-postgres` restituisce NUMERIC come stringa JS, non come numero

A differenza di INT, i campi NUMERIC/DECIMAL arrivano come stringhe (es. `"19.50"`) per evitare perdita di precisione silenziosa. Verificato che questo pattern esiste già nel codebase (`meal_voucher_hours`, DECIMAL, arriva come stringa nei test). Impatti concreti se non gestito:
- Il display non rispetterebbe la Decisione 4 (mostrerebbe `"19.50"` invece di `"19,5"`).
- Confronti stringa-stringa tra due valori NUMERIC sarebbero lessicografici, non numerici (rischio latente per codice futuro, non un bug attivo oggi perché il blocco su saldo insufficiente non esiste più in `leaves.js`).

**Decisione presa**: normalizzare a `Number` **in un unico punto centralizzato in `leaves.js`**, applicato a tutti gli endpoint che restituiscono `total_days`/`used_days`/`remaining_days`/`num_days` (non solo ai 2 endpoint saldi) — coerente con la disciplina già adottata nel progetto (Pattern 4: singola fonte di verità: Pattern 6: check centralizzato invece di fix sparsi). Scartata l'opzione di un type-parser globale `pg.types.setTypeParser(1700, ...)` — troppo invasiva, toccherebbe anche `latitude`/`longitude` (precisione critica) e le firme timesheet in ore, senza un audit completo: fuori scope.

Con questa normalizzazione centralizzata, il frontend non ha bisogno di alcun `Number()` difensivo per correttezza — solo `formatLeaveDays()` per l'estetica del display.

### 3. Bug reale nell'import onboarding: i decimali vengono già arrotondati via `Math.round`

`backend/src/services/onboarding/parseWorkbook.js` usa `normInt()` (che fa `Math.round(n)`) per i 3 campi saldo (`ferie_giorni`, `permessi_giorni`, `exfestivita_giorni`). Un cliente che fornisce 19,5 giorni nel template verrebbe silenziosamente arrotondato a 20 (o 19) **prima ancora** di arrivare alla validazione — un bug di corruzione dati silenziosa già esistente oggi (chiunque provi oggi un onboarding con saldi decimali lo colpisce), non introdotto da questo lavoro. Verificato che `normInt` è usato **solo** per questi 3 campi — nessun altro campo (geofence, buoni pasto) dipende dalla stessa funzione, quindi il fix è isolato.

### 4. Il conteggio giorni nelle tabelle storico non usa mai `num_days` dal backend

4 punti duplicati (`EmployeeLeaveRequest.jsx`, `ManagerLeaveRequest.jsx` inline; `calculateDays()` duplicata in `AdminLeaveManagement.jsx` e `ManagerLeaveApprovalPanel.jsx`) ricalcolano i giorni client-side da `start_date`/`end_date` invece di usare `num_days` dall'API. Con una mezza giornata, questo ricalcolo darebbe sempre "1" invece di "0,5" in tutti e 4 i punti. Verificato via lettura del flusso di submit che non esiste alcun aggiornamento ottimistico che costruisca un oggetto richiesta locale senza `num_days` — sempre un refetch reale dopo la creazione — quindi è sicuro eliminare i 4 ricalcoli e usare `num_days` incondizionatamente.

### 5. App mobile ha form indipendenti (nessun pacchetto condiviso con il web)

`frontend-mobile/src/screens/leave/LeaveRequestScreen.jsx` e `ManagerLeaveApprovalScreen.jsx` sono implementazioni separate, non derivate dal codice web. Decisione: includere il toggle mezza giornata anche su mobile in questo stesso lavoro (non rimandato), per mantenere i due frontend allineati ed evitare un bug di plurale già identificato (`r.num_days !== 1`, che con `num_days` come stringa sarebbe sempre vero) — bug che si risolve comunque automaticamente con la normalizzazione centralizzata lato backend (punto 2).

## Design tecnico

### Schema — `backend/migrations/044_leave_half_day_units.sql`

Ordine vincolante:
1. `ALTER TABLE leave_saldi DROP COLUMN remaining_days;`
2. `ALTER TABLE leave_saldi ALTER COLUMN total_days TYPE NUMERIC(6,2);`
3. `ALTER TABLE leave_saldi ALTER COLUMN used_days TYPE NUMERIC(6,2);`
4. `ALTER TABLE leave_saldi ADD COLUMN remaining_days NUMERIC(6,2) GENERATED ALWAYS AS (total_days - used_days) STORED;`
5. `ALTER TABLE leave_requests ALTER COLUMN num_days TYPE NUMERIC(6,2);`

Nessun backfill dati necessario (Decisione 3).

### Backend — `backend/src/middleware/validation.js`

`PostLeaveRequestSchema`: aggiungere `half_day: z.boolean().optional()` più due `.refine()`:
- `half_day` vero solo se `start_date === end_date`
- `half_day` vero solo se `leave_type` è `FERIE_1`/`FERIE_2`/`FERIE_3` (mai `MALATTIA`, coerente con lo Scope)

### Backend — `backend/src/routes/leaves.js`

- `POST /request`: `numDays = half_day ? 0.5 : Math.floor(timeDiff / 86400000) + 1`
- Nuova funzione di normalizzazione (locale al file, es. `normalizeLeaveNumerics(row)`) che converte `total_days`/`used_days`/`remaining_days`/`num_days` a `Number` quando presenti su una row — applicata a tutte le risposte JSON di: `POST /request`, `GET /pending`, `GET /my-requests`, `GET /all`, `GET /balance`, endpoint saldi admin.

### Backend — `backend/src/services/onboarding/parseWorkbook.js`

Sostituire `normInt` con `normDecimal` (arrotonda a 2 decimali invece che a intero) per `ferie_giorni`/`permessi_giorni`/`exfestivita_giorni`:

```javascript
function normDecimal(v) {
  if (v === null || v === undefined || String(v).trim() === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
```

### Frontend condiviso (formattazione, duplicato web+mobile — nessun pacchetto condiviso, funzione troppo piccola per giustificare l'astrazione)

```javascript
function formatLeaveDays(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}
```

### Frontend web

- `EmployeeLeaveRequest.jsx` / `ManagerLeaveRequest.jsx`: toggle "Mezza giornata" visibile solo quando `startDate === endDate`; `half_day` passato a `createRequest`; colonna "Giorni" nello storico usa `formatLeaveDays(req.num_days)` invece del ricalcolo locale (rimosso)
- `AdminLeaveManagement.jsx` / `ManagerLeaveApprovalPanel.jsx`: rimuovere la funzione duplicata `calculateDays`, usare `formatLeaveDays(request.num_days)`
- Tab Saldi (`AdminLeaveManagement.jsx`): `formatLeaveDays(saldiData.FERIE_1 || 0)` ecc.

### Frontend mobile

- `LeaveRequestScreen.jsx`: stesso toggle mezza giornata; saldo mostrato con `formatLeaveDays(b.remaining_days)`
- `ManagerLeaveApprovalScreen.jsx`: `{formatLeaveDays(r.num_days)} giorno{r.num_days !== 1 ? 'i' : ''}` — il confronto `!== 1` torna corretto automaticamente grazie alla normalizzazione centralizzata lato backend, nessun fix aggiuntivo necessario lì

### Testing (obbligatorio per area sempre-pesante, TDD)

- Migration: test real-Postgres che verifica lo schema post-migration (`information_schema` su tipo colonna, come già fa `leaves-schema.test.js` per la generated column) — scritto RED prima della migration, GREEN dopo
- `leaves.js`: test che una richiesta `half_day=true` con `start_date !== end_date` → 400; `half_day=true` con `leave_type=MALATTIA` → 400; `half_day=true` valido → `num_days=0.5` in DB e in risposta; risposta con `typeof remaining_days === 'number'` (non stringa) — regressione esplicita sul punto 2
- `parseWorkbook.js`: test che un saldo `19.5` nel foglio Excel sopravvive intatto fino a `parseWorkbook()` (RED prima del fix con `normInt`, GREEN dopo con `normDecimal`)
- Frontend: test che il toggle mezza giornata appare/scompare in base a `startDate === endDate`; test che la colonna "Giorni" mostra `req.num_days` (non il ricalcolo rimosso)

## Fuori scope (esplicito)

- ONB.2b — Permessi/ROL in ore come nuovo tipo di assenza (richiede design separato: nuovo `leaves.code`, form, blocco turni, saldi in ore)
- Fix del pattern generale "NUMERIC arriva come stringa dal driver pg" per colonne esistenti non toccate da questo lavoro (`meal_voucher_hours`, `latitude`/`longitude`, firme timesheet) — footgun documentato qui ma non risolto globalmente, fuori scope
