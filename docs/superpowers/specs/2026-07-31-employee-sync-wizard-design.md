# Wizard Excel "Aggiorna Dipendenti" — sostituzione import CSV con diff/conferma

**Data:** 31 Luglio 2026
**Status:** Design approvato (brainstorming + grilling), in attesa di piano di implementazione dettagliato

---

## Contesto

Nella pagina Admin (`https://badge.dataxiom.it/admin`, tab Dipendenti) esiste oggi un import CSV grezzo (`frontend-web/src/features/admin/tabs/EmployeesTab.jsx:86` → `POST /api/v1/admin/employees/import`, gestito in `backend/src/routes/admin/employees.js:109`), percepito come poco user-friendly. Esiste già, per l'onboarding di un cliente **nuovo**, un wizard Excel maturo e collaudato ("ONB.1": `backend/src/routes/admin/onboarding.js` + `frontend-web/src/features/admin/pages/OnboardingWizardPage.jsx`), con pattern preview→apply, transazioni, validazione a due stadi ed `exceljs`.

Questo progetto riusa quel pattern per un caso d'uso ricorrente e diverso: un cliente **già attivo** aggiorna mensilmente il proprio organico (nuovi assunti, uscite, trasferimenti tra sedi) scaricando un file Excel pre-compilato, modificandolo, e ricaricandolo. Il sistema confronta il file con lo stato attuale e chiede conferma delle variazioni rilevate prima di applicarle — funzionalità che oggi non esiste in nessuna forma (né il CSV import né ONB.1 producono un diff strutturato, solo un summary aggregato).

Motivazione: ridurre l'attrito per il cliente (Excel guidato > CSV grezzo) e introdurre uno storico dipendenti solido — oggi `employees` non ha alcuna colonna di stato, solo hard delete (`admin/employees.js:276`).

---

## Decisioni di design

1. **Flusso dedicato** "Aggiorna Dipendenti", separato dal wizard ONB.1 (che resta per l'onboarding di nuovi clienti, comportamento merge-only invariato).
2. **Sostituzione completa** dell'import CSV esistente: rimossa la UI in `EmployeesTab.jsx`, rimosso l'endpoint `POST /api/v1/admin/employees/import` (nessun altro consumer trovato in esplorazione — da riconfermare con un grep dedicato prima della rimozione).
3. **Nessun hard-delete per il ciclo di vita ordinario**: nuova colonna `employees.active BOOLEAN NOT NULL DEFAULT true`. Anche il bottone di eliminazione singola in Admin (`admin/employees.js:276`) viene convertito a disattivazione — coerenza totale, nessun percorso che perde dati storici.
4. **Due nuove colonne data**: `hiring_date DATE` (data di assunzione fissa in azienda, non cambia mai per trasferimenti tra sedi) e `exit_date DATE` (valorizzata quando lo stato passa a Inattivo, azzerata a `NULL` se riattivato).
5. **Disattivazione tramite colonna esplicita "Stato"** (Attivo/Inattivo) nel file Excel, non tramite cancellazione della riga. Il file non perde mai righe storiche. Una riga fisicamente assente rispetto al template scaricato è un'anomalia segnalata (warning), non un'azione automatica di rimozione.
6. **Trasferimento di sede = sostituzione**, non merge: se la colonna "sede" di un dipendente differisce dallo stato DB, il nuovo valore rimpiazza l'assegnazione precedente. Comportamento intenzionalmente diverso dal merge multi-sede di ONB.1 (pensato per l'onboarding iniziale, non per i trasferimenti ricorrenti).
7. **Template pre-compilato al volo**, generato da un endpoint dedicato, contenente solo i dipendenti `active=true` + tutte le sedi esistenti (foglio `Sedi` incluso, per permettere l'aggiunta di sedi nuove nello stesso file mensile).
8. **Riattivazione automatica**: un'email presente nel file con Stato=Attivo ma marcata `active=false` nel DB viene riattivata (`active=true`, `exit_date=NULL`), preservando `hiring_date` originale — mai un duplicato.
9. **Conferma bulk**: la preview mostra tre liste (Nuovi / Rimossi / Modificati) con dettaglio riga; un solo bottone "Conferma tutte le modifiche" applica tutto (stesso pattern preview→apply di ONB.1), nessuna conferma riga-per-riga.
10. **Export storico completo** (attivi + inattivi, con `hiring_date`/`exit_date`): funzione separata dal wizard, disponibile sia all'admin Dataxiom (superadmin) sia all'admin del singolo cliente.

---

## Architettura

### Schema DB
```sql
ALTER TABLE employees
  ADD COLUMN active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN hiring_date DATE,
  ADD COLUMN exit_date DATE;

UPDATE employees SET hiring_date = created_at::date WHERE hiring_date IS NULL;
```
`hiring_date` per i dipendenti pre-esistenti è approssimata a `created_at` (non è la vera data di assunzione — correggibile dal cliente stesso ricaricando il wizard con la colonna "Data Assunzione" modificata).

### Superficie di regressione da filtrare (`active = true`)
File noti (da `grep -rln "FROM employees\|JOIN employees" backend/src/routes backend/src/services`), da verificare uno per uno in fase di implementazione:
`export.js`, `shifts.js`, `auth.js`, `employees.js`, `checkins.js`, `admin.js`, `presences.js`, `demo.js`, `leaves.js`, `consent.js`, `admin/viewers.js`, `illnesses.js`, `admin/employees.js`, `admin/clients.js`, `services/onboarding/apply.js`, `services/onboarding/validateAgainstDb.js`.

`POST /api/checkins` (`backend/src/routes/checkins.js:60-97`, dentro `withTransaction`) deve rifiutare (403) i check-in per dipendenti `active = false` — verifica aggiuntiva accanto a quelle già esistenti (proprietario, sede, assegnazione).

### Backend — nuovo modulo `backend/src/services/employeeSync/`
Ricalca la struttura di `backend/src/services/onboarding/` (`parseWorkbook.js` / `validate.js` / `validateAgainstDb.js` / `apply.js`):

- **`parseTemplate.js`** — parsing `exceljs` del foglio `Dipendenti` esteso con 3 colonne aggiuntive rispetto a ONB.1: `stato` (Attivo/Inattivo), `data_assunzione`, `data_uscita`; più il foglio `Sedi` (schema invariato da ONB.1, per sedi nuove).
- **`computeDiff.js`** — puro, nessuna scrittura. Confronta per email (stessa chiave di `onboarding/apply.js:54`) contro `SELECT * FROM employees WHERE client_id = $1`:

| Caso | Condizione | Esito |
|---|---|---|
| Nuovo | email assente dal DB, Stato=Attivo | `INSERT`, `hiring_date` = colonna file o oggi |
| Riattivato | email presente `active=false`, Stato=Attivo nel file | `UPDATE active=true, exit_date=NULL`, `hiring_date` **invariata** |
| Rimosso | email presente `active=true`, Stato=Inattivo nel file | `UPDATE active=false, exit_date` = colonna file o oggi |
| Trasferito | sede diversa da quella DB | `UPDATE site_id`/`assigned_sites` = **sostituzione** (non merge, a differenza di `onboarding/apply.js:74-84`) |
| Modificato | altri campi diversi (telefono, ruolo, saldi, `hiring_date` corretta manualmente) | `UPDATE` dei soli campi cambiati |
| Anomalia | riga presente nel template scaricato ma assente nel file ricaricato | Warning non bloccante, nessuna azione |
| Invariato | riga identica | Non mostrato nel riepilogo |

- **`applyDiff.js`** — applica il diff in transazione (`BEGIN`/`COMMIT`/`ROLLBACK`, stesso pattern di `onboarding.js:26-53`), invio email di benvenuto solo ai Nuovi (riuso `sendEmail`/`buildEmployeeWelcomeEmail` da `utils/email.js`, stesso pattern di `onboarding.js:104-119`).

### Backend — nuove route (`backend/src/routes/admin/employeeSync.js`)
- `GET /api/v1/admin/employee-sync/template` — genera `.xlsx` pre-compilato (solo attivi + sedi) via `exceljs`.
- `POST /api/v1/admin/employee-sync/preview` — parse + validate + `computeDiff`, nessuna scrittura (pattern `BEGIN...ROLLBACK` come `onboarding.js:66-82`).
- `POST /api/v1/admin/employee-sync/apply` — ri-valida + applica in transazione + invio email ai Nuovi.
- `GET /api/v1/admin/employee-sync/export-history` — export completo (attivi + inattivi, con le due date), accessibile a client-admin (proprio `client_id`, via `resolveTenantScope`) e superadmin (qualunque cliente).

Multer + limiti file coerenti con `onboarding.js:17` (2MB) e `admin/employees.js:126` (max 500 righe).

### Frontend
- `frontend-web/src/features/admin/pages/EmployeeSyncWizardPage.jsx` + hook `useEmployeeSync.js`, modellati su `OnboardingWizardPage.jsx`/`useOnboarding.js`: step 1 scarica template → step 2 carica file → step 3 preview 3 liste + warning anomalie → step 4 bottone unico "Conferma tutte le modifiche".
- `EmployeesTab.jsx`: rimossa la UI CSV (righe 86, 202, 224 attuali), sostituita da entry point verso il nuovo wizard; bottone "elimina" singolo aggiornato per chiamare la disattivazione.
- Nuovo bottone "Esporta storico completo" in `EmployeesTab.jsx`, visibile sia a client-admin che superadmin.

### Errori e validazione
Segue lo stesso schema a due stadi di ONB.1: `validate.js`-equivalente per errori sintattici del file (Stato non in {Attivo, Inattivo}, date malformate, email duplicate/non valide — bloccanti, non applicano nulla) e un check DB-level per anomalie (riga mancante rispetto al template scaricato — warning non bloccante, mostrato ma non impedisce la conferma delle altre modifiche).

### Testing
TDD per `computeDiff.js` (tutti i 7 casi della tabella + combinazioni, es. trasferito+modificato insieme), test di integrazione per le 4 route (incluso RBAC cross-tenant), test E2E del golden path (scarica template → modifica → carica → preview → conferma → verifica DB, incluso un ciclo di riattivazione).

---

## Fuori perimetro (esplicito)

- Nessuna modifica al meccanismo multi-sede di ONB.1 per l'onboarding di un nuovo cliente (resta merge-only).
- Il template assegna una sola sede per dipendente per riga (come ONB.1); il multi-sede resta solo lato schema/merge, non lato UX.
- Nessuna conferma riga-per-riga (deciso: bulk).
- Nessun supporto per file "delta" (solo righe cambiate) — il file rappresenta sempre l'organico attivo completo + storico se scaricato come export.
