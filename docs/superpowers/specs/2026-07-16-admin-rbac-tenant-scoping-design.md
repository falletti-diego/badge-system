# RBAC Cross-Tenant Scoping su `/api/admin/*` — Design

**Data:** 16 Luglio 2026
**Contesto:** Finding HIGH da review di sicurezza automatica (Session 69), confermato manuale: ogni route sotto `/api/admin/*` applica solo il gate `role==='admin'`, senza mai verificare se il `client_id` del chiamante coincide col tenant su cui sta operando. Qualunque dipendente `role==='admin'` di *qualsiasi* tenant reale vede oggi tutti gli altri client, tutte le sedi, tutti i dipendenti, e (dal Task 9 dell'Ambiente Demo Self-Service) tutte le email di contatto dei prospect demo.

---

## Decisioni prese con l'utente (sessione di brainstorming)

1. **Il ruolo `admin` può essere assegnato anche a un cliente reale** (non solo staff Dataxiom) — quindi la correzione non può limitarsi a "solo Dataxiom ha admin", serve uno scoping reale.
2. **Meccanismo scelto per distinguere lo staff Dataxiom**: nuovo ruolo `superadmin`, aggiunto al CHECK constraint esistente su `employees.role` (oggi `'employee','manager','admin'` → diventa `+ 'superadmin'`). Alternative scartate: flag `is_staff` su `clients` (richiede una colonna + query aggiuntiva su ogni route, più esplicito ma più esteso), split dei router in `/api/staff/*` separato (cambio più ampio, richiede aggiornare tutti i chiamanti frontend esistenti).
3. **Rollout in 2 fasi separate**, non un singolo deploy, per eliminare per costruzione il rischio di un account promosso a `superadmin` prima che il codice lo riconosca (che lo bloccherebbe istantaneamente da tutto `/api/admin/*`).

## Scoperta chiave che vincola il design

L'intera `AdminPage` frontend (tab Clients/Sites/Employees/Viewers/Settings, verificato in `frontend-web/src/features/admin/tabs/*.jsx`) è **il pannello di back-office interno di Dataxiom** — ogni tab carica `/api/v1/admin/clients` senza filtro per popolare un dropdown "quale cliente sto gestendo ora", pensato per un operatore che gestisce più tenant. Non esiste oggi nessuna UI self-service scopata per un cliente reale. Questo significa che **chiunque oggi usi questo pannello in produzione con `role==='admin'` sta di fatto operando come staff Dataxiom**, anche se il modello dati non lo garantisce esplicitamente — è la ragione per cui il rollout deve promuovere questi account a `superadmin` PRIMA di attivare lo scoping restrittivo, altrimenti si rompe il pannello reale usato oggi, non solo un'ipotetica vulnerabilità.

Anche `utils/queryScope.js` (usato da checkins/presences/export) già scopa `admin` sempre al proprio `client_id` per ogni altra area del prodotto — questo fix allinea `/api/admin/*` a un pattern già consolidato ovunque nel resto del backend, non introduce un concetto nuovo.

---

## Architettura

**Migration** (`031_add_superadmin_role.sql`): estende il CHECK su `employees.role` per includere `'superadmin'`. Additiva, backward-compatible, nessun impatto su righe esistenti.

**Gate condiviso** (`routes/admin.js`): il middleware che oggi rifiuta chi non ha `role==='admin'` viene esteso ad accettare anche `role==='superadmin'` (entrambi entrano nel namespace `/api/admin`; la differenziazione avviene poi per singola route).

**Nuovo helper condiviso** (`middleware/requireSuperadmin.js`, sul modello di `middleware/requireDemoTenant.js` già esistente): un middleware dedicato per le route riservate esclusivamente a `superadmin`, da montare esplicitamente dove serve (non nel gate condiviso, che resta permissivo per entrambi i ruoli — coerente con la scelta già fatta per `demo-tenants.js` nel Task 9 di non riusare un guard con polarità diversa in un punto sbagliato).

**Route interessate e comportamento target:**

| Route | Comportamento per `admin` | Comportamento per `superadmin` |
|---|---|---|
| `POST /admin/clients` | 403 (`requireSuperadmin`) | invariato (crea un tenant nuovo) |
| `GET /admin/clients` | forzato a `WHERE id = req.user.client_id` (solo il proprio record) | invariato (tutti i client) |
| `DELETE /admin/clients/:id` | 403 (`requireSuperadmin`) | invariato |
| `POST /admin/sites` | `data.client_id` forzato a `req.user.client_id` (ignora/rigetta un valore diverso nel body) | invariato (client_id arbitrario) |
| `GET /admin/sites` | `client_id` di query forzato a `req.user.client_id` (ignora il query param se presente) | invariato (query param opzionale, default tutte) |
| `DELETE /admin/sites/:id` | 404 se il sito non appartiene a `req.user.client_id` | invariato |
| `POST /admin/employees` | `data.client_id` forzato a `req.user.client_id` | invariato |
| `POST /admin/employees/import` | `client_id` del form forzato a `req.user.client_id` | invariato |
| `GET /admin/employees` | `client_id` di query forzato a `req.user.client_id` | invariato |
| `GET /admin/demo-tenants` | 403 (`requireSuperadmin`) — nessun cliente reale ha un motivo legittimo di vedere i prospect demo | invariato |
| `PUT /admin/sites/:id`, `DELETE /admin/employees/:id`, `reset-password`, DPA routes, settings, viewers | **invariato** — già scopati su `client_id` da fix precedenti (Session 39-40) | invariato |

**Nessuna capacità di auto-elevazione**: `AdminEmployeeSchema` (validazione Zod di `POST /admin/employees`) già limita `role` a `employee`/`manager` — un `admin` non potrà mai creare un altro `admin` o un `superadmin` tramite API, prima e dopo questo fix.

---

## Rollout in 2 fasi (rischio minimo per costruzione)

### Fase 1 — Deploy additivo, zero cambio di comportamento osservabile
1. Migration 031 (aggiunge `'superadmin'` al CHECK).
2. Deploy codice: il gate condiviso riconosce `superadmin`, ma **nessuna route esistente cambia comportamento per `admin`** — tutte le restrizioni della tabella sopra sono ancora assenti in questa fase. Un deploy che, per costruzione, non può rompere nulla di osservabile.
3. **Audit pre-flight (manuale, con l'utente, prima di qualunque promozione)**: query read-only in produzione
   ```sql
   SELECT id, client_id, email, name, created_at
   FROM employees
   WHERE role = 'admin'
   ORDER BY client_id, created_at;
   ```
   Per ogni riga, decisione esplicita con l'utente: "operatore Dataxiom" (→ promuovere) o "cliente reale" (→ lasciare `admin`, resterà scopato dopo la Fase 2).
4. Promozione manuale (reversibile) degli account Dataxiom identificati:
   ```sql
   UPDATE employees SET role = 'superadmin' WHERE id = '<uuid identificato>';
   ```
5. **Verifica di Fase 1** (bloccante prima di procedere alla Fase 2): login in produzione con l'account appena promosso, click manuale su ogni tab dell'`AdminPage` (Clients/Sites/Employees/Viewers/Settings) — deve comportarsi esattamente come prima della Fase 1, zero differenze percepibili. Se qualcosa si rompe qui, il problema è nel riconoscimento di `superadmin` nel gate condiviso, non ancora nello scoping (che non è stato attivato) — più facile da diagnosticare isolatamente.

### Fase 2 — Deploy restrittivo (il fix di sicurezza), solo dopo Fase 1 verificata stabile
6. Attiva lo scoping per `admin` sulle route della tabella sopra.
7. **Verifica di Fase 2**:
   - Matrice automatica route × ruolo su Postgres locale reale (non mock): per ognuna delle 10 route modificate, testare esplicitamente `admin` sul proprio tenant (200/201, dati corretti), `admin` che tenta di operare su un altro tenant (403/404/scoping silenzioso a seconda della route, mai un errore 500 grezzo), `superadmin` (invariato, come oggi).
   - Smoke test live in produzione con curl reali (stesso pattern Session 69): un token `admin` reale di un cliente e — se esiste un secondo cliente reale — uno di un altro, verificare lo scoping corretto.
   - Ricontrollo manuale dell'`AdminPage` con l'account `superadmin` promosso in Fase 1 — deve restare identico a prima di tutta l'operazione.

**Rollback**: la migration è puramente additiva, nessun rollback di schema necessario in nessuna fase. Ogni fase di codice è revertibile indipendentemente via redeploy del commit precedente — la Fase 2 può essere revertita senza toccare la Fase 1 (che resta comunque sicura e utile indipendentemente).

---

## Testing

- Nessun mock per le verifiche di scoping — ogni test della matrice route×ruolo gira contro Postgres locale reale, coerente con il pattern stabilito nei Task 1-9 dell'Ambiente Demo Self-Service.
- Test di non-regressione esplicito per ogni route già scopata in precedenza (`PUT /admin/sites/:id`, `DELETE /admin/employees/:id`, `reset-password`) — devono restare verdi e invariati.
- Test dedicato per la migration: applicata due volte in locale senza errori (idempotenza, pattern dominante già usato in tutte le migration del progetto).
- Suite completa backend (`/test-all`) verde ad ogni fase, non solo alla fine.

## Fuori scope (esplicitamente)

- Una UI self-service scopata per un cliente reale (oggi non esiste alcuna UI admin per un cliente, solo il back-office Dataxiom) — se in futuro un cliente reale dovrà gestire da sé sedi/dipendenti, servirà una pagina frontend dedicata, non coperta da questo fix (che riguarda solo l'API).
- Backfill automatico degli account `superadmin` — è una decisione umana (Fase 1, punto 3), non uno script.
