# Gerarchia ruoli scalabile (Senior Manager / Director) — Design Spec

**Data:** 2026-08-29
**Status:** Approvato, pronto per il piano di implementazione

## Problema

Oggi `employees.role` supporta solo `employee`, `manager`, `admin`, `viewer`, `superadmin` (CHECK constraint aggiunto in `backend/migrations/031_add_superadmin_role.sql`). Un cliente con più di due livelli organizzativi (es. store manager → area/senior manager → HR director) non ha modo di modellare la catena di approvazione delle **richieste personali** (ferie, malattia, correzione cartellino) di un manager: oggi un manager non ha alcun superiore designato, e resta scoperto un gap di sicurezza per cui un manager può correggere il proprio stesso cartellino (`backend/src/routes/checkins.js:463-488` blocca solo `viewer`/`employee`, non l'auto-correzione di un manager).

## Non-Goals (esplicitamente fuori scope)

- Nessuna nuova funzionalità di visibilità/scoping per i nuovi ruoli oltre a "vedono/approvano tutto il client come admin" sulle liste **pending** e sugli endpoint di **approvazione** di eventi/ferie/malattie. Non si toccano le regole RBAC/visibilità di `routes/admin/*` (CRUD client/sedi) — l'unica eccezione è `routes/admin/employees.js`, che Task 3 estende per accettare `reports_to_id` in creazione, senza toccarne le regole di accesso (resta solo-admin). Non si toccano `DELETE /api/v1/illnesses/:id` (resta solo-admin per compliance), non si tocca `POST /api/checkins` (creazione check-in per altri resta solo-admin).
- Nessuna migrazione dati sui client esistenti. Un client a 2 livelli (solo `employee`/`manager`/`admin`) deve continuare a funzionare **identico a oggi, senza toccare una riga** — l'intera gerarchia si attiva solo quando un admin crea effettivamente righe `senior_manager`/`director` e imposta `reports_to_id`.
- Nessun vincolo di auto-approvazione aggiunto a `leaves.js`/`illnesses.js` (`PUT /:id/approve`) in questa fase — solo `checkins.js` riceve il blocco di self-correction, come da design confermato. È un gap collaterale noto ma esplicitamente rimandato (vedi "Rischi noti / lavoro futuro" in fondo).
- `backend/src/utils/demoSeed.js` (tenant demo self-service) non viene modificato: il tenant demo resta a 2 livelli.
- Nessun vincolo Postgres (trigger/EXCLUDE) per validare `reports_to_id`: validazione applicativa solo, stesso pattern già usato per `manager_id` in `routes/admin/employees.js:52-61`.

## Decisioni di design

### 1. Nuovi valori di ruolo

`employees.role` guadagna due nuovi valori: `senior_manager`, `director` (inglese, coerente con i valori esistenti; etichette italiane "Senior Manager"/"Dirigente" solo lato UI, fuori scope backend). Il CHECK constraint diventa:

```sql
CHECK (role IN ('employee', 'manager', 'senior_manager', 'director', 'admin', 'viewer', 'superadmin'))
```

### 2. `role_level` — mappa costante in codice, non colonna DB

```js
// backend/src/utils/roles.js
const ROLE_LEVELS = {
  employee: 0,
  manager: 1,
  senior_manager: 2,
  director: 3,
  admin: 99,
  superadmin: 99,
  viewer: -1, // sola lettura, mai un "superiore" di nessuno
};
```

Estendere la gerarchia in futuro (es. un livello `regional_director` tra `senior_manager` e `director`) significa editare solo questa mappa + il CHECK constraint in una nuova migrazione additiva — zero migrazioni di dati sulle righe esistenti.

### 3. `employees.reports_to_id` — nuova colonna, non riuso di `manager_id`

Nuova colonna self-referenziante, nullable: `reports_to_id UUID REFERENCES employees(id) ON DELETE SET NULL`.

**Perché non riusare `manager_id` (già esistente da `migrations/040_add_manager_id_to_employees.sql`):** `manager_id` ha oggi una semantica precisa e ben testata — "il manager della sede di un `employee`", validato in `routes/admin/employees.js:52-61` con un vincolo stretto (`role = 'manager' AND site_id = <site del dipendente>`) e richiesto obbligatoriamente per ogni `employee` (`middleware/validation.js:507-516`), usato anche da `services/employeeSync/*` per il CSV import. `reports_to_id` è concettualmente diverso — "chi approva le richieste personali di un manager/senior_manager" — non è scoped a una sede (un senior manager non ha `site_id`) e non è mai obbligatorio (NULL è il default valido, vedi sotto). Conflare le due semantiche nella stessa colonna richiederebbe diramare la validazione esistente per ruolo, rischiando una regressione su un percorso già delicato (Pattern 1 in CLAUDE.md: bug UUID storici proprio su questa area). Una colonna dedicata è più chiara e più sicura da aggiungere in modo additivo.

`reports_to_id` è usata **solo** per righe `role IN ('manager', 'senior_manager')`. Righe `employee`, `director`, `admin` restano sempre `NULL`.

### 4. Regola di risoluzione dell'approvatore (richieste personali)

- `employee` → invariato, nessun cambiamento (già risolto via `site_id` del manager tramite gli endpoint esistenti).
- `manager` / `senior_manager` → l'approvatore è la riga puntata da `reports_to_id`; se `reports_to_id IS NULL`, l'approvatore è chiunque abbia `role IN ('admin', 'superadmin')` per quel client (fallback naturale, nessuna configurazione richiesta — è il comportamento **identico a oggi** per un client a 2 livelli).
- `director` / `admin` → nessun approvatore designato, restano il tappo della gerarchia.

Helper `resolveIsApprover(client, { clientId, targetEmployeeId, targetRole, candidateEmployeeId, candidateRole })` in `backend/src/utils/roles.js` incapsula questa regola (vedi Task 2 del piano).

### 5. Visibilità "pending" ed endpoint di approvazione — scope admin-equivalente

`senior_manager` e `director` vengono trattati come "admin" nei branch RBAC dei seguenti endpoint (non altrove):

| File | Endpoint | Linee attuali (branch da estendere) |
|---|---|---|
| `backend/src/routes/events.js` | `GET /pending` | `events.js:136` |
| `backend/src/routes/events.js` | `PUT /:id/approve` | `events.js:175` |
| `backend/src/routes/leaves.js` | `GET /pending` | `leaves.js:171` |
| `backend/src/routes/leaves.js` | `PUT /:id/approve` | `leaves.js:210` |
| `backend/src/routes/leaves.js` | `GET /approved` (filtro RBAC) | `leaves.js:407` |
| `backend/src/routes/illnesses.js` | `GET /by-date-range` | `illnesses.js:291` |
| `backend/src/routes/illnesses.js` | `GET /admin` | `illnesses.js:336` |

Implementazione: helper `isAdminEquivalent(role)` in `backend/src/utils/roles.js`, che sostituisce ogni test puntuale `role === 'admin'` in questi 7 punti. `DELETE /api/v1/illnesses/:id` (`illnesses.js:449`) e `GET /manager` (`illnesses.js:396`, strettamente `role !== 'manager'`) **non** vengono toccati — restano rispettivamente solo-admin e solo-manager, per design.

### 6. Correzioni cartellino (`PUT /api/checkins/:id`)

Nessun nuovo flusso di richiesta/approvazione. Due modifiche mirate a `backend/src/routes/checkins.js`, dopo il fetch del checkin (riga ~482):

1. **Blocco self-correction per `manager`/`senior_manager`/`director`** (non `admin`/`superadmin` — per loro non esiste un superiore che potrebbe altrimenti farlo al posto loro, bloccarli lascerebbe il proprio cartellino permanentemente non correggibile): se `checkin.employee_id === req.user.employee_id` e `ROLE_LEVELS.manager <= role_level(req.user.role) < ROLE_LEVELS.admin`, rifiutare con `ForbiddenError`. Chiude un gap di sicurezza già presente oggi (un manager può correggere il proprio cartellino), non introdotto da questa feature.
2. **Correzione di un manager/senior_manager da parte del suo superiore**: se il dipendente target ha `role IN ('manager', 'senior_manager')`, solo `role_level(req.user.role) >= ROLE_LEVELS.admin` (cioè `admin`/`superadmin`) OPPURE il dipendente il cui `employee_id` coincide col `reports_to_id` del target può eseguire la correzione (oltre al normale scoping di sede già esistente per correggere un `employee`, invariato). Nota: questo controllo usa deliberatamente la soglia `role_level >= admin`, non `isAdminEquivalent` — `isAdminEquivalent` (punto 5) è più permissivo apposta per le viste "pending", ma qui includerebbe `senior_manager`/`director` come correttori universali di qualunque manager, bypassando la catena `reports_to_id` che è il punto centrale di questa regola.

## Schema DB (diff)

```sql
-- Migration NNN (Task 1 del piano)
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_role_check
  CHECK (role IN ('employee', 'manager', 'senior_manager', 'director', 'admin', 'viewer', 'superadmin'));

ALTER TABLE employees ADD COLUMN IF NOT EXISTS reports_to_id UUID REFERENCES employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employees_reports_to_id ON employees(reports_to_id);
```

## Compatibilità / rollback

- Additiva al 100%: nessuna riga esistente cambia `role` o guadagna un `reports_to_id` non-NULL da questa migrazione.
- Un client a 2 livelli continua a funzionare identico: `isAdminEquivalent('manager')` è `false` come oggi, `resolveIsApprover` per un manager con `reports_to_id IS NULL` ricade su admin come oggi (l'unico che poteva approvare comunque).
- **Nota:** un'eccezione a "comportamento identico" riguarda `PUT /api/checkins/:id`: un manager che oggi corregge il cartellino di un manager pari grado (stesso client, nessuna gerarchia) smette di poterlo fare dopo questo deploy — la regola gerarchica del punto 6 richiede sempre admin/superadmin o il `reports_to_id` esatto, che per un client a 2 livelli è sempre NULL. È una stretta di sicurezza intenzionale (chiude lo stesso gap descritto al punto 6), non una regressione, ma va comunicata ai clienti esistenti prima del deploy.
- Rollback: la migrazione di rimozione colonna/CHECK è sicura solo se nessuna riga ha `role IN ('senior_manager', 'director')` — da verificare manualmente prima di un downgrade (stesso vincolo pratico già vale per `035_employee_lifecycle.sql` e simili).

## Rischi noti / lavoro futuro (fuori scope di questo piano)

- `leaves.js`/`illnesses.js` `PUT /:id/approve` non ricevono un blocco di self-approvazione in questa fase (solo `checkins.js` lo riceve, per design confermato). Un manager potrebbe ancora auto-approvare la propria richiesta di ferie/malattia se la query di scoping per sede combacia banalmente. Vale la pena aprire un follow-up dedicato dopo il deploy di questo piano.
- Se in futuro si introduce un livello intermedio (`regional_director`), verificare che `resolveIsApprover` non assuma implicitamente "un solo livello di escalation" — oggi risolve solo il `reports_to_id` diretto, non l'intera catena transitiva, per design (il design confermato dice esplicitamente "solo il superiore risolto via `reports_to_id`", non un attraversamento ricorsivo).
