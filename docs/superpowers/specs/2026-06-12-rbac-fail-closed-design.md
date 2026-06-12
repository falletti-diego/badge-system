# S.32.2 — RBAC Fail-Closed + Helper `buildScopedFilters` (Data Leak Intra-Tenant Fix)

**Data:** 2026-06-12
**Status:** Design approvato
**Priorità:** 🔴 CRITICA — leak cross-utente/tenant latente su GET checkins, stats, export
**Origine:** Analisi critica Session 32 (piano d'azione S.32 in TASKS.md)

---

## Problema

In `checkins.js:178`, `presences.js:41`, `export.js:131`, il pattern è:

```js
if (userRole === 'employee' && userEmployeeId) {
  // applica filtro
}
```

**Fail-open:** se il token non ha `employee_id` (demo Maria/Lucia, o un bug di issuance), il filtro viene saltato e l'utente vede **tutti i dati del tenant**. Concretamente:
- Employee senza `employee_id` → vede check-in di tutti i dipendenti della sua azienda
- Manager senza `site_id` → vede check-in di tutte le sedi della sua azienda
- Ruolo sconosciuto o futuro (es. nuovo ruolo `supervisor` senza policy definita) → vede tutto

Demo account attuali:
- `pino@badge.local` (manager) ha `role: 'manager'` ma **nessun `site_id`** → vede tutto il tenant
- `maria@badge.local`, `lucia@badge.local` (employee) hanno `role: 'employee'` ma **nessun `employee_id`** → vedono tutto il tenant

Inoltre, la logica è **triplicata** (checkins, presences, export) senza un punto unico di verità — il prossimo bug RBAC rinasce.

## Contesto

- **Production employees:** 34 record (Milano, Torino, altri clienti). Solo `maria.rossi@torino.it` (239ec99f-...) ha check-in reali; nessun record per `maria@badge.local` o `lucia@badge.local`.
- **Demo account in DEMO_USERS (auth.js):** Pippo (admin, sede nulla), Pino (manager, sede nulla), Maria (employee, employee_id nulla), Lucia (employee, employee_id nulla).
- **Sedi demo:** Torino (550e8400-...-440012, manager Diego), Milano (e1337fab-..., manager Francesca Gallo reale).

## Soluzione approvata

**Approccio A — Helper condiviso `buildScopedFilters`** (fail-closed by design).

### 1. Nuovo file `backend/src/utils/queryScope.js`

Una funzione pura `buildScopedFilters(user, { siteId, employeeId, dateFrom, dateTo }, alias)` che:

- Riceve `req.user` (client_id, role, employee_id, site_id) + filtri già risolti
- **Fail-closed:** ogni ruolo che non passa la validazione **lancia 403**
  - Employee senza `employee_id` → 403 `NO_EMPLOYEE_PROFILE`
  - Manager senza `site_id` → 403 `NO_SITE_ASSIGNED`
  - Manager che chiede una sede diversa dalla propria → 403 `FORBIDDEN_SITE`
  - Employee che chiede dati di un altro employee → 403 `FORBIDDEN_EMPLOYEE`
  - Ruolo sconosciuto → 403 `UNAUTHORIZED_ROLE`
- Ritorna `{ whereClauses: [...], params: [...] }` pronti per interpolazione SQL
- La paginazione resta al chiamante (non è scopo della funzione)

### 2. Fix demo account (`auth.js` DEMO_USERS)

| Account | Role | Azione |
|---------|------|--------|
| pippo@badge.local | admin | Invariato (admin salta il filtro) |
| pino@badge.local | manager | Aggiungere `site_id: 'e1337fab-ba3f-4332-bb06-57c9df15b067'` (Milano) |
| maria@badge.local | employee | Aggiungere `employee_id: '239ec99f-3204-45ca-bce2-793f52442ec6'` (Maria Rossi reale, Torino, con check-in veri) |
| lucia@badge.local | employee | **Rimuovere** (nessun record DB corrispondente; qualunque mapping sarebbe fittizio; il login darà 401 `INVALID_CREDENTIALS` come Diego in prod) |

### 3. Route modificate

**`checkins.js` GET (/:id escluso):** sostituire il blocco WHERE (~35 righe) con:
```js
const { whereClauses, params: scopeParams } = buildScopedFilters(
  req.user,
  { siteId: resolvedSiteId, employeeId: resolvedEmployeeId, dateFrom, dateTo },
  'c'
);
params.push(...scopeParams);
whereClauses.push(...scopeClauses);
```

**`checkins.js` /stats:** stesso pattern.

**`export.js` GET:** stesso pattern (il blocco "employee non può esportare" è policy di endpoint, resta inline).

**`presences.js` /summary:** stesso pattern (il blocco "employee non può accedere" è policy di endpoint, resta inline).

Invariati: `shifts.js` (policy già esplicita per ruolo), `sites.js` (solo admin/manager per singola read, no leak).

### 4. Test

**`queryScope.test.js` (unit, ~100 righe):** matrice pure di validazione
- Employee ± employee_id | ± filtro employee esplicito coerente → clausola corretta
- Employee + filtro employee diverso → 403 `FORBIDDEN_EMPLOYEE`
- Manager ± site_id | ± filtro site esplicito coerente → clausola corretta
- Manager + filtro site diverso → 403 `FORBIDDEN_SITE`
- Admin con qualunque filtro → clausola corretta
- Ruolo sconosciuto → 403 `UNAUTHORIZED_ROLE`
- Date range invariati (logic separato)

**`checkins-rbac.test.js` (integrazione, ~80 righe):** token RS256 reali
- Employee senza employee_id → GET /checkins 403 `NO_EMPLOYEE_PROFILE`
- Manager senza site_id → GET /checkins 403 `NO_SITE_ASSIGNED`
- Manager che filtra per sito diverso → GET /checkins 403 `FORBIDDEN_SITE`
- Manager che filtra per dipendente altrui → GET /checkins 403 `FORBIDDEN_EMPLOYEE` (manca in export, da aggiungere)
- Employee senza employee_id → GET /export 403 `FORBIDDEN_ROLE` (exists, non muta)
- Manager senza site_id → GET /export 403 `NO_SITE_ASSIGNED` (nuovo, comportamento coerente)

**Regressione:** suite ~235 test — i test existenti con token manager andranno verificati (oggi passano perché non hanno `site_id` in test, quindi vedono tutto; il fix introduce il require di `site_id` → fixture aggiustamento è atteso e corretto).

## Fuori scope

- Shifts RBAC (già esplicita per ruolo)
- Admin/viewer diff (admin vede tutto, viewer ha accesso ristretto — già corretti)
- Colonna `client_id` nel warn log di S.32.1 (follow-up non bloccante)

## Deploy

Solo backend: merge main → GitHub Actions → ECR → EC2.

---

## Demo account side-by-side: prima e dopo

| Account | Prima | Dopo |
|---------|-------|------|
| pippo@badge.local (admin) | Vede tutto il tenant | Vede tutto il tenant (invariato) |
| pino@badge.local (manager) | **Vede tutto il tenant** (no site_id) | Vede solo Milano (site_id aggiunto) |
| maria@badge.local (employee) | **Vede tutto il tenant** (no employee_id) | Vede solo propri check-in (employee_id aggiunto) |
| lucia@badge.local (employee) | **Vede tutto il tenant** (no employee_id) | 401 Unauthorized (account rimosso) |

## Impatto in produzione

La produzione usa account DB-backed (`maria.rossi@torino.it` ha employee_id vero nel token), quindi nessun cliente subisce il 403 accidentale. I demo sono interni Dataxiom e il comportamento atteso è coerente con la loro sede/ruolo di test.
