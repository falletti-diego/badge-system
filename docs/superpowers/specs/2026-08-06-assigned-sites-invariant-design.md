# Invariante `site_id ⊆ assigned_sites` — Design

**Data:** 6 Agosto 2026
**Status:** Approvato, pronto per piano di implementazione
**Trigger:** Bug scoperto durante la verifica manuale su staging del piano "Fase A — fix findings 2 Agosto 2026" — l'employee demo `maria@badge.local` non poteva timbrare (`NOT_ASSIGNED_TO_SITE`) nonostante avesse `site_id` correttamente impostato a Torino.

---

## Il problema

`POST /api/v1/checkins` autorizza un check-in verificando `$site_id = ANY(employees.assigned_sites)` — la colonna array `assigned_sites` è l'**unico** campo autoritativo per questo controllo. La colonna singola `site_id` è un campo "di comodo" usato altrove (filtri manager, viste planning) ma **non enforced** contro `assigned_sites` da nessun vincolo del database.

Storicamente, alcune migration scritte a mano (`018_add_badge_local_demo_users.sql`, `019a_add_maria_rossi_torino_employee.sql`) valorizzano `site_id` ma non `assigned_sites`, che resta al default schema `ARRAY[]::UUID[]` (vuoto). Il codice applicativo moderno (`routes/admin/employees.js`, `services/employeeSync/applyDiff.js`) imposta correttamente entrambi i campi — il gap riguarda solo le righe create dalle vecchie migration.

**Non è un bug isolato**: la stessa causa ha già colpito produzione una volta (Pino, Session 81 — patchata con una migration mirata one-off, `033_add_torino_to_pino_assigned_sites.sql`, che ha risolto solo la sua riga, non la causa strutturale).

### Verifica quantitativa (6 Agosto 2026, sola lettura, nessuna modifica)

| Ambiente | Employees totali | Righe rotte (`site_id` non incluso in `assigned_sites`) |
|---|---|---|
| Produzione | 22 | **1** — `maria@badge.local` (creata 19 Giugno 2026, mai scoperta finché nessuno aveva provato un check-in reale con quell'identità) |
| Staging | 12 | **2** — `maria@badge.local` e `maria.rossi@torino.it` |

Nessun'altra riga in nessuno dei due ambienti presenta il problema. `maria.rossi@torino.it` è corretta in produzione (creata storicamente a mano su RDS, non da replay di migration) ma rotta su staging, che è stato provisionato rieseguendo tutte le migration da zero.

**Blast radius reale: minimo** (1 riga in produzione, 2 su staging) — nessun cliente reale coinvolto, solo identità demo/interne.

---

## Design approvato

### 1. Backfill generale (non specifico a Maria/Pino)

Una `UPDATE` con `WHERE site_id IS NOT NULL AND NOT (site_id = ANY(assigned_sites))` — nessun UUID hardcoded. Corregge ogni riga rotta esistente in qualunque ambiente la esegua, non solo i casi già noti.

### 2. Trigger DB — invariante mantenuta per sempre, indipendentemente dal codice applicativo

`BEFORE INSERT OR UPDATE ON employees FOR EACH ROW`: se `NEW.site_id` è valorizzato e non è già presente in `NEW.assigned_sites`, lo aggiunge (`array_append`). Comportamento **additivo, mai distruttivo**:

- `site_id = NULL` (admin/superadmin) → nessuna azione, nessun errore
- `site_id` già presente in `assigned_sites` → nessuna azione (idempotente)
- Altri siti già presenti in `assigned_sites` (dipendente multi-sede) → **mai rimossi**. L'invariante è `site_id ⊆ assigned_sites`, non uguaglianza

Questo copre ogni futuro punto di scrittura sulla tabella `employees` — route admin esistenti, il wizard `employeeSync`, script futuri, o un'altra migration scritta a mano domani — senza dover ricordarsi di replicare la logica in ognuno.

### 3. Esplicitamente fuori scope

Non si unifica `site_id`/`assigned_sites` in un solo campo — sarebbe un refactor molto più ampio (toccherebbe UI planning, filtri manager, mobile), non giustificato da questo bug. Il trigger si limita a garantire che i due campi restino coerenti tra loro.

---

## Livello di test richiesto (esplicitamente esteso su richiesta dell'utente)

Non solo il fix in isolamento, ma la sua interazione con l'intero codice che scrive sulla tabella `employees`:

1. **Backfill**: una riga preesistente rotta (`site_id` fuori da `assigned_sites`) viene corretta da una singola esecuzione della migration; rieseguirla una seconda volta non produce cambiamenti (idempotenza).
2. **Trigger su INSERT**: una nuova riga con `site_id` impostato e `assigned_sites` che non lo contiene si ritrova `site_id` aggiunto automaticamente dopo l'insert.
3. **Trigger su UPDATE**: cambiare `site_id` di una riga esistente a un nuovo sito non presente in `assigned_sites` lo aggiunge automaticamente.
4. **Non distruttivo**: una riga con `assigned_sites` multi-sede (es. `[Roma, Milano]`) a cui si aggiorna `site_id = Torino` si ritrova `assigned_sites = [Roma, Milano, Torino]` — Roma e Milano **non** vengono rimossi.
5. **`site_id NULL` non causa errori**: creare/aggiornare una riga admin/superadmin (`site_id = NULL`) non fa scattare eccezioni dal trigger.
6. **Nessuna regressione nei path di scrittura esistenti** — rieseguire le suite di test già esistenti che scrivono sulla tabella `employees` con il trigger attivo, senza modificarle, per verificare che nessuna assunzione preesistente si rompa:
   - `backend/src/__tests__/admin-employees-*.test.js` (creazione/modifica employee via API admin)
   - `backend/src/__tests__/employeeSync-applyDiff.test.js` (il wizard esplicitamente resetta `assigned_sites` quando cambia `site_id` — verificare che il trigger, essendo additivo e trovando `site_id` già incluso nel nuovo array impostato dall'applicazione, sia un no-op qui, non introduca doppioni o comportamenti inattesi)
   - `backend/src/__tests__/checkins-ownership.test.js`, `checkins.test.js` (il fix Task 7 della Fase A ha appena aggiunto uno scoping `client_id` sulla stessa query che consuma `assigned_sites` — verificare che continui a funzionare invariata)
7. **Test end-to-end legato al bug originale**: dopo il backfill, un `POST /api/v1/checkins` per l'employee precedentemente rotto (`maria@badge.local` in un ambiente di test) va a buon fine — non solo un'asserzione SQL diretta, ma la chiamata reale attraverso l'handler della route.
8. **Suite completa backend** (`npm test`) rieseguita per intero a fine implementazione — nessuna regressione su nessun test esistente, non solo su quelli che toccano `employees` direttamente (un trigger a livello di tabella è un cambiamento globale, va verificato che non abbia effetti collaterali più ampi del previsto).

---

## Rollout

Nessuna azione manuale oltre alla migration stessa — si applica automaticamente al prossimo deploy su `develop` (staging) e `main` (produzione) tramite il migration runner già in uso. Il rischio è basso (blast radius verificato: 1 riga in produzione, 2 su staging).

---

## Prossimo passo

`/superpowers:writing-plans` per il piano di implementazione TDD dettagliato.
