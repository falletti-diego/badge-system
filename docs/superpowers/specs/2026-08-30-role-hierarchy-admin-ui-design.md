# Admin UI per la gerarchia ruoli (Senior Manager / Director) — Design Spec

**Data:** 2026-08-30
**Status:** Approvato, pronto per il piano di implementazione

## Problema

La gerarchia ruoli (`senior_manager`, `director`, `reports_to_id`) è stata implementata e deployata in Session 116-117 (`docs/superpowers/specs/2026-08-29-role-hierarchy-design.md`), ma è **backend-only per design**: l'unico modo di creare oggi un dipendente con questi ruoli, o di assegnargli/riassegnargli un `reports_to_id`, è una chiamata API diretta (curl/Postman). Il form "Nuovo Dipendente" (`frontend-web/src/features/admin/tabs/EmployeesTab.jsx`) offre solo `Dipendente`/`Manager` nel dropdown Ruolo e non ha alcun campo per `reports_to_id`. Non esiste inoltre **alcuna modifica di dipendente esistente** nel pannello admin (`backend/src/routes/admin/employees.js` ha solo `POST`/`GET`/`DELETE`/`reset-password`) — quindi anche una volta aggiunto il dropdown, promuovere un dipendente già esistente (lo scenario reale più probabile: "Mario diventa Senior Manager", non "assumo un nuovo Senior Manager da zero") resterebbe impossibile dalla UI.

Nessun cliente reale usa oggi questi ruoli — questo lavoro è preparazione anticipata, non una richiesta di un cliente in corso.

## Non-Goals (esplicitamente fuori scope)

- **Nessuna estensione del wizard Excel "Aggiorna Dipendenti"** in questa iterazione. I ruoli `senior_manager`/`director` sono a bassa cardinalità (1-2 persone per cliente, non decine come i `manager`) — il costo di estendere un flusso di bulk-import già delicato (validazione forward-reference tra righe dello stesso file, `ROLE_MAP` condiviso con l'onboarding wizard) non è giustificato finché non c'è un cliente reale con più sedi/gerarchie da caricare in blocco. Resta backlog documentato in `TASKS.md`.
- **Nessun editor generale del dipendente.** L'azione di modifica introdotta da questa spec (`PATCH /api/admin/employees/:id/role`) è **stretta**: solo `role` + `reports_to_id`. Non tocca nome, email, telefono, `site_id`, `assigned_sites` — non è la prima modifica-dipendente generale del prodotto, è un'azione mirata.
- **`manager` non è mai una destinazione dell'azione di modifica.** Un `manager` richiede `site_id` per funzionare (`NO_SITE_ASSIGNED` altrove nel codice se assente); `senior_manager`/`director` non hanno mai `site_id`. Retrocedere a `manager` tramite questa azione produrrebbe un manager senza sede, bloccato, senza modo di assegnargliene una da qui (fuori scope). `manager` resta raggiungibile solo tramite il form di creazione esistente (già gestisce `site_id` correttamente).
- **Nessun controllo contro l'orfanaggio di una sede.** Promuovere via questa azione l'unico manager di una sede lascia quella sede senza responsabile — **rischio pre-esistente**, non introdotto da questa feature: `DELETE /api/admin/employees/:id` (disattivazione) non ha oggi alcun controllo equivalente. Comportamento condiviso e documentato, non risolto qui.
- **Nessuna notifica al dipendente** quando il proprio `reports_to_id` cambia (né alla creazione né alla modifica).
- Nessuna modifica alle regole RBAC/visibilità già decise in Session 116-117 (`isAdminEquivalent`, `resolveIsApprover`) — questa spec aggiunge solo superficie UI/API per popolare dati che quelle regole già consumano correttamente.

## Decisioni di design

### 1. Form "Nuovo Dipendente" — nuove voci + nuovo campo condizionale

Dropdown Ruolo guadagna due voci: **Senior Manager**, **Direttore** (etichette italiane, valori DB invariati `senior_manager`/`director`).

Nuovo campo **"Approvatore richieste personali"** (rinominato da "Riporta a" dopo l'analisi di intuitività — il nome originale rischiava confusione col campo "Manager" già esistente, ora rinominato "Manager di sede" per chiarezza):
- Stesso meccanismo del campo "Manager di sede" già esistente, non un meccanismo diverso: il campo resta **sempre renderizzato** nel form, e diventa `disabled` quando il ruolo selezionato è `director` (mai rimosso condizionalmente dal DOM) — per coerenza visiva tra i due campi "chi sta sopra di te" nello stesso form. Quando si disabilita, il suo valore viene **azzerato automaticamente** (`reports_to_id` riportato a `null` nello stato del form), non lasciato stantio in memoria pronto a essere inviato per sbaglio se l'admin cambia ruolo più volte prima di salvare.
- Opzionale quando abilitato (ruolo `manager`/`senior_manager`), con voce "— nessuno —" (ricade su admin in fase di risoluzione approvatore, comportamento già implementato in `resolveIsApprover`).
- Opzioni: riusa l'array `employees` già caricato in memoria dal componente (oggi usato per popolare `availableManagers`), filtrato per `role`:
  - ruolo selezionato `manager` → opzioni = `senior_manager` + `director` del client
  - ruolo selezionato `senior_manager` → opzioni = solo `director` del client
- Helper text sotto il campo: *"Chi approva ferie, malattia e correzioni cartellino di questa persona — se vuoto, ricade sull'admin."*

### 2. Nuova azione "Cambia ruolo" — modifica di un dipendente esistente

Icona nuova nella tabella dipendenti, stesso pattern visivo di Reset password/Elimina già esistenti. **Visibile solo su righe con ruolo `manager` o `senior_manager`** (non su `director` — nessuna transizione valida esiste per lui, vedi sotto; non su `employee`/`viewer`/`admin`/`superadmin` — fuori scope).

**Solo promozioni, nessuna retrocessione.** Apre un dialog con 2 campi, stessa UX del form di creazione:
- **Ruolo**: opzioni dipendono dal ruolo attuale della riga —
  - da `manager`: `senior_manager`, `director`
  - da `senior_manager`: `director`
- `director` è un tappo terminale rispetto a questa azione: nessuna via di rientro a `senior_manager`/`manager` da qui. Non è un limite tecnico ma una scelta deliberata di scope — una retrocessione `director→senior_manager` introdurrebbe un rischio distinto (un altro dipendente potrebbe già avere `reports_to_id` puntato a questo director, e la retrocessione lo lascerebbe a riportare a un pari grado, violando l'invariante "approvatore di livello strettamente superiore" su una riga diversa da quella modificata — nessun meccanismo esistente, incluso il vincolo FK `ON DELETE SET NULL`, la intercetta trattandosi di un `UPDATE`, non di una cancellazione). Se un domani servirà una via di rientro, richiederà una spec dedicata con quel controllo.
- **Approvatore richieste personali**: stessa logica di visibilità/filtro del form di creazione, applicata al ruolo *risultante* selezionato nel dialog, con due aggiunte necessarie solo qui (assenti in creazione perché strutturalmente impossibili per un dipendente nuovo):
  - **Esclusione di sé stesso** dalle opzioni.
  - **Controllo anti-ciclo**: se l'opzione scelta come nuovo approvatore ha, a sua volta, `reports_to_id` che punta esattamente al dipendente che si sta modificando, il salvataggio è bloccato con un messaggio esplicito ("X riporta già a questa persona — creerebbe un ciclo"). Controllo a un solo salto, coerente con il disegno single-hop già documentato in `resolveIsApprover` (nessun attraversamento multi-livello previsto).

Selezionare "— nessuno —" è un esito valido della modifica: rimuove un approvatore già assegnato (torna a `NULL`, ricade su admin) — non solo un valore di default alla prima apertura del dialog.

Pre-compilazione del dialog con i valori correnti (`role`, `reports_to_id`) del dipendente selezionato.

### 3. Backend — `PATCH /api/admin/employees/:id/role`

Nuovo endpoint stretto in `backend/src/routes/admin/employees.js`, mounted sotto la stessa protezione admin-only già esistente per l'intero router. Body: `{ role, reports_to_id }`.

Validazione:
- `role` deve essere uno tra `senior_manager`/`director` (mai `manager`, mai lo stesso ruolo attuale) — target ristretto alle sole promozioni valide dal ruolo attuale del dipendente (vedi sezione 2).
- Rifiuta esplicitamente qualunque transizione che non sia una promozione (incluso `role: 'manager'` come target) con un messaggio dedicato (non un generico "invalid role") — coerente col Non-Goal sopra e con la scelta di non contemplare retrocessioni in questa spec.
- Riusa (fattorizzata in un helper condiviso tra `POST /` e questo endpoint, non duplicata — Pattern 4 di `CLAUDE.md`) la stessa validazione server-side già scritta per `reports_to_id` in creazione: deve puntare a un dipendente esistente dello stesso client con `role_level` strettamente superiore.
- Se il target è `director`, `reports_to_id` viene forzato a `null` lato server indipendentemente da cosa arriva nel body (difesa in profondità oltre all'azzeramento automatico lato client — vedi sezione 1).
- Nuovo controllo anti-ciclo (vedi sopra), lato server oltre che lato UI — la UI filtra le opzioni proattivamente, il server resta l'autorità fail-closed nel caso di chiamata diretta all'API.

Side-effect: voce di audit log (`logAudit`, pattern esistente — `admin_change_employee_role`, `oldValue`/`newValue` con `role`+`reports_to_id`), stesso stile già usato da `DELETE /:id` in questo stesso file.

### 4. `GET /api/admin/employees` — aggiunta colonna mancante

La query `SELECT` non restituisce oggi `reports_to_id` — necessario aggiungerlo (una colonna, stesso pattern delle altre già selezionate) perché il dialog "Cambia ruolo" possa pre-compilare il valore corrente. Nessun nuovo endpoint: estensione della SELECT esistente.

### 5. Etichette e styling tabella

Il `Chip` che mostra il ruolo in tabella usa oggi il valore raw (`e.role`) — aggiunta una mappa di etichette (`Senior Manager`/`Direttore`, stessa mappa usata nel dropdown) e estensione della logica colore (`color === 'primary'`) per includere anche i due nuovi ruoli, non solo `manager`.

## Testing

- **Backend**: nuovo file o estensione di `admin-employees-role-hierarchy.test.js` (già esistente da Session 116) — casi per `PATCH /:id/role`: transizioni valide (manager→senior_manager, manager→director, senior_manager→director), qualunque retrocessione rifiutata (incluso verso `manager`), ciclo rifiutato, `reports_to_id` verso ruolo pari/inferiore rifiutato (riuso della validazione esistente), `reports_to_id` forzato a `null` quando il target è `director` anche se il body ne invia uno, audit log scritto, `GET /` include `reports_to_id`.
- **Frontend**: estensione di `EmployeesTab.test.jsx` — creazione Senior Manager/Direttore con e senza approvatore, campo "Approvatore" disabilitato (non rimosso) e azzerato quando il ruolo è `director`, filtro corretto delle opzioni per ruolo (sia in creazione che nel dialog di modifica), dialog "Cambia ruolo" non visibile su righe `director`/employee/admin/viewer, pre-compilazione corretta dei valori esistenti.

## Rischi noti / lavoro futuro (non bloccanti)

- Wizard Excel non esteso (vedi Non-Goals) — da riprendere se un cliente reale lo richiede.
- Nessun controllo contro l'orfanaggio di una sede (pre-esistente, condiviso con `DELETE`).
- Nessuna notifica al dipendente quando il proprio approvatore cambia.
- **Nessuna via di retrocessione** (`director→senior_manager`, o qualunque ritorno a un livello inferiore) tramite questa azione — scelta deliberata, non un oversight: una retrocessione richiederebbe verificare che nessun altro dipendente abbia `reports_to_id` puntato al dipendente che si sta retrocedendo (altrimenti quel terzo dipendente si ritroverebbe a riportare a un pari grado, invariante violata su una riga diversa da quella modificata) — un controllo non banale, rimandato a una spec dedicata se mai servirà davvero. Oggi l'unica via per "annullare" una promozione è disattivare e ricreare il dipendente.
