# Gerarchia ruoli scalabile (Senior Manager / Director) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere due nuovi ruoli (`senior_manager`, `director`) e una catena di approvazione (`reports_to_id`) per la correzione cartellino di manager e senior manager, più uno scope di visibilità/approvazione admin-equivalente per senior_manager/director su ferie/malattia/eventi — senza toccare il comportamento di nessun client esistente a 2 livelli.

**Architecture:** Migrazione additiva (nuovo CHECK constraint + colonna `reports_to_id` self-referenziante su `employees`), un nuovo modulo `backend/src/utils/roles.js` come unica fonte di verità per `ROLE_LEVELS`/`isAdminEquivalent`/`resolveIsApprover`, poi 3 punti di integrazione mirati: creazione dipendente (validazione), viste "pending"/approvazione (events/leaves/illnesses), correzione cartellino (checkins).

**Tech Stack:** Node.js/Express, PostgreSQL (pg), Zod, Jest + supertest (test con pool mockato, stesso pattern di `checkins-rbac.test.js`/`checkins-ownership.test.js`).

**Spec:** [docs/superpowers/specs/2026-08-29-role-hierarchy-design.md](../specs/2026-08-29-role-hierarchy-design.md)

## Global Constraints

- Nessuna migrazione dati: ogni cambiamento è additivo, righe esistenti (`role IN ('employee','manager','admin','viewer','superadmin')`, `reports_to_id` sempre NULL prima di questo lavoro) restano bit-per-bit identiche.
- `reports_to_id` è usata solo per righe `role IN ('manager', 'senior_manager')`; sempre NULL per `employee`, `director`, `admin`, `viewer`, `superadmin`.
- `role_level` NON è mai una colonna DB: vive solo in `ROLE_LEVELS` dentro `backend/src/utils/roles.js`.
- Le regole RBAC/visibilità di `routes/admin/*` (CRUD client/sedi) NON vengono toccate da questo piano — l'unica eccezione è `routes/admin/employees.js`, che Task 3 estende per accettare `reports_to_id` in creazione, senza toccarne le regole di accesso (resta solo-admin). `DELETE /api/v1/illnesses/:id`, `GET /api/v1/illnesses/manager`, `POST /api/checkins` NON vengono toccati da questo piano (vedi Non-Goals nella spec).
- `backend/src/utils/demoSeed.js` NON viene toccato.
- Ogni test nuovo mocka `pool`/`client.query` con lo stesso pattern già in uso in `backend/src/__tests__/checkins-rbac.test.js` e `checkins-ownership.test.js` — nessun nuovo test reale-Postgres in questo piano (nessun rischio Pattern 5 di CLAUDE.md).
- Ogni riferimento a `client_id`/`site_id`/`employee_id` nei test usa UUID validi (Pattern 1 di CLAUDE.md) — niente stringhe come `'client-1'`.

---

## File Structure

| File | Responsabilità |
|---|---|
| `backend/migrations/042_add_role_hierarchy.sql` | CHECK constraint esteso + colonna `reports_to_id` + indice |
| `backend/src/utils/roles.js` (nuovo) | `ROLE_LEVELS`, `getRoleLevel`, `isAdminEquivalent`, `resolveIsApprover` |
| `backend/src/__tests__/roles.test.js` (nuovo) | Unit test del modulo sopra |
| `backend/src/middleware/validation.js` | `AdminEmployeeSchema`: nuovo enum ruoli, campo `reports_to_id`, refine estesi |
| `backend/src/utils/errors.js` | Nuova classe `InvalidReportsToAssignmentError` |
| `backend/src/routes/admin/employees.js` | Validazione server-side di `reports_to_id` in `POST /` |
| `backend/src/__tests__/admin-employees-role-hierarchy.test.js` (nuovo) | Test della validazione sopra |
| `backend/src/routes/events.js` | `isAdminEquivalent` in `GET /pending` e `PUT /:id/approve` |
| `backend/src/routes/leaves.js` | `isAdminEquivalent` in `GET /pending`, `PUT /:id/approve`, `GET /approved` |
| `backend/src/routes/illnesses.js` | `isAdminEquivalent` in `GET /by-date-range`, `GET /admin` |
| `backend/src/__tests__/role-hierarchy-visibility.test.js` (nuovo) | Test dei 7 endpoint sopra per `senior_manager`/`director` |
| `backend/src/routes/checkins.js` | Blocco self-correction + regola gerarchica in `PUT /:id` |
| `backend/src/__tests__/checkins-hierarchy-correction.test.js` (nuovo) | Test della regola sopra |

---

### Task 1: Migrazione DB — nuovi ruoli + `reports_to_id`

**Files:**
- Create: `backend/migrations/042_add_role_hierarchy.sql`
- Test: verifica manuale via `psql` (nessun test Jest per una migrazione SQL pura, coerente con le migrazioni 031/040 esistenti che non hanno un test dedicato)

**Interfaces:**
- Produces: colonna `employees.reports_to_id UUID NULL`, constraint `employees_role_check` che accetta anche `'senior_manager'` e `'director'`. Ogni task successivo la consuma.

- [ ] **Step 1: Scrivere la migrazione**

```sql
-- 042_add_role_hierarchy.sql
-- Gerarchia ruoli scalabile: aggiunge senior_manager/director e una colonna
-- reports_to_id self-referenziante per la catena di approvazione delle
-- richieste personali (ferie/malattia/correzione cartellino) di manager e
-- senior manager. Additiva al 100%: nessuna riga esistente cambia role o
-- guadagna un reports_to_id non-NULL da questa migrazione — un client a 2
-- livelli (solo employee/manager/admin) continua a funzionare identico a
-- oggi. Vedi docs/superpowers/specs/2026-08-29-role-hierarchy-design.md.
--
-- reports_to_id è deliberatamente una colonna NUOVA e non un riuso di
-- manager_id (migration 040): manager_id ha oggi una semantica precisa e
-- validata (il manager della sede di un employee, richiesto per ogni
-- employee, mai per un manager) usata anche dal CSV import
-- (services/employeeSync/*). reports_to_id è concettualmente diverso — chi
-- approva le richieste personali di un manager/senior_manager — non è
-- scoped a una sede e non è mai obbligatorio. Vedi la sezione "Perché non
-- riusare manager_id" nella design spec collegata sopra.
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_role_check
  CHECK (role IN ('employee', 'manager', 'senior_manager', 'director', 'admin', 'viewer', 'superadmin'));

ALTER TABLE employees ADD COLUMN IF NOT EXISTS reports_to_id UUID REFERENCES employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employees_reports_to_id ON employees(reports_to_id);
```

- [ ] **Step 2: Applicare la migrazione al database locale/test**

Run: `cd backend && npm run migrations`
Expected: output include `042_add_role_hierarchy.sql` tra le migrazioni applicate, nessun errore.

- [ ] **Step 3: Verificare manualmente il constraint e la colonna**

Run:
```bash
psql "$DATABASE_URL" -c "\d employees" | grep -i reports_to_id
psql "$DATABASE_URL" -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'employees_role_check';"
```
Expected: la prima query mostra `reports_to_id | uuid |`; la seconda mostra `CHECK ((role)::text = ANY ((ARRAY['employee'::character varying, 'manager'::character varying, 'senior_manager'::character varying, 'director'::character varying, 'admin'::character varying, 'viewer'::character varying, 'superadmin'::character varying])::text[]))`.

- [ ] **Step 4: Verificare che un client a 2 livelli non sia toccato**

Run:
```bash
psql "$DATABASE_URL" -c "SELECT count(*) FROM employees WHERE reports_to_id IS NOT NULL;"
```
Expected: `0` (nessuna riga esistente ha guadagnato un `reports_to_id`).

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/042_add_role_hierarchy.sql
git commit -m "feat: add senior_manager/director roles + reports_to_id column (migration 042)"
```

---

### Task 2: `backend/src/utils/roles.js` — fonte di verità per `role_level`

**Files:**
- Create: `backend/src/utils/roles.js`
- Test: `backend/src/__tests__/roles.test.js`

**Interfaces:**
- Consumes: nulla (modulo puro + un helper che accetta un `client` pg-style con `.query()`, stesso contratto usato da `withTransaction` in `backend/src/middleware/db-transaction.js`).
- Produces:
  - `ROLE_LEVELS: { employee: 0, manager: 1, senior_manager: 2, director: 3, admin: 99, superadmin: 99, viewer: -1 }`
  - `getRoleLevel(role: string): number` — ritorna `-1` (mai un superiore di nessuno) per un ruolo sconosciuto, mai `undefined`, cosa che tasks successivi (checkins.js) assumono nei confronti numerici.
  - `isAdminEquivalent(role: string): boolean` — `true` per `'admin' | 'superadmin' | 'senior_manager' | 'director'`.
  - `resolveIsApprover(client, { candidateEmployeeId, candidateRole, targetEmployeeId, targetReportsToId }): boolean` — sincrona sui dati passati, NON fa query (il chiamante ha già i dati); vedi Step 3 per il motivo.

- [ ] **Step 1: Scrivere i test per `getRoleLevel`/`isAdminEquivalent`**

```js
// backend/src/__tests__/roles.test.js
'use strict';

const { ROLE_LEVELS, getRoleLevel, isAdminEquivalent, resolveIsApprover } = require('../utils/roles');

describe('ROLE_LEVELS', () => {
  it('orders roles employee < manager < senior_manager < director < admin', () => {
    expect(ROLE_LEVELS.employee).toBeLessThan(ROLE_LEVELS.manager);
    expect(ROLE_LEVELS.manager).toBeLessThan(ROLE_LEVELS.senior_manager);
    expect(ROLE_LEVELS.senior_manager).toBeLessThan(ROLE_LEVELS.director);
    expect(ROLE_LEVELS.director).toBeLessThan(ROLE_LEVELS.admin);
  });

  it('gives admin and superadmin the same level', () => {
    expect(ROLE_LEVELS.admin).toBe(ROLE_LEVELS.superadmin);
  });
});

describe('getRoleLevel', () => {
  it('returns the numeric level for a known role', () => {
    expect(getRoleLevel('manager')).toBe(1);
  });

  it('returns -1 for an unknown role instead of undefined', () => {
    expect(getRoleLevel('bogus-role')).toBe(-1);
  });
});

describe('isAdminEquivalent', () => {
  it.each(['admin', 'superadmin', 'senior_manager', 'director'])('is true for %s', (role) => {
    expect(isAdminEquivalent(role)).toBe(true);
  });

  it.each(['employee', 'manager', 'viewer', 'bogus-role'])('is false for %s', (role) => {
    expect(isAdminEquivalent(role)).toBe(false);
  });
});

describe('resolveIsApprover', () => {
  it('is true when candidate is admin, regardless of reports_to_id', () => {
    expect(resolveIsApprover({
      candidateEmployeeId: 'admin-1', candidateRole: 'admin',
      targetEmployeeId: 'mgr-1', targetReportsToId: 'senior-1',
    })).toBe(true);
  });

  it('is true when candidate is superadmin', () => {
    expect(resolveIsApprover({
      candidateEmployeeId: 'super-1', candidateRole: 'superadmin',
      targetEmployeeId: 'mgr-1', targetReportsToId: null,
    })).toBe(true);
  });

  it('is true when candidate is the exact reports_to_id target', () => {
    expect(resolveIsApprover({
      candidateEmployeeId: 'senior-1', candidateRole: 'senior_manager',
      targetEmployeeId: 'mgr-1', targetReportsToId: 'senior-1',
    })).toBe(true);
  });

  it('is false when candidate is a different senior_manager', () => {
    expect(resolveIsApprover({
      candidateEmployeeId: 'senior-2', candidateRole: 'senior_manager',
      targetEmployeeId: 'mgr-1', targetReportsToId: 'senior-1',
    })).toBe(false);
  });

  it('is false for a plain manager who is not admin and not the reports_to_id target', () => {
    expect(resolveIsApprover({
      candidateEmployeeId: 'mgr-2', candidateRole: 'manager',
      targetEmployeeId: 'mgr-1', targetReportsToId: null,
    })).toBe(false);
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `cd backend && npx jest src/__tests__/roles.test.js`
Expected: FAIL con `Cannot find module '../utils/roles'`.

- [ ] **Step 3: Implementare `backend/src/utils/roles.js`**

`resolveIsApprover` prende i dati già letti dal chiamante (non fa query) perché ogni sito di chiamata (Task 5) ha già il `reports_to_id` del target nella stessa riga JOIN già presente — evita una query aggiuntiva e mantiene il modulo testabile senza mock di `pg`.

```js
'use strict';

/**
 * Unica fonte di verità per la gerarchia dei ruoli (design spec
 * docs/superpowers/specs/2026-08-29-role-hierarchy-design.md). role_level
 * NON è mai una colonna DB — vive solo qui. Estendere la gerarchia in
 * futuro (es. un livello intermedio) significa editare solo questa mappa +
 * il CHECK constraint di employees.role in una nuova migrazione additiva.
 */
const ROLE_LEVELS = Object.freeze({
  employee: 0,
  manager: 1,
  senior_manager: 2,
  director: 3,
  admin: 99,
  superadmin: 99,
  viewer: -1, // sola lettura, mai un "superiore" di nessuno
});

/**
 * Ritorna sempre un numero, mai `undefined` — un ruolo sconosciuto vale -1
 * (mai un superiore di nessuno), cosa che i confronti numerici a valle
 * (es. checkins.js) assumono per fail-closed di default.
 */
function getRoleLevel(role) {
  return Object.prototype.hasOwnProperty.call(ROLE_LEVELS, role) ? ROLE_LEVELS[role] : -1;
}

/**
 * senior_manager e director sono trattati come admin SOLO sulle viste
 * "pending" e sugli endpoint di approvazione di eventi/ferie/malattie
 * (design spec, decisione 5) — non altrove. Non usare questo helper per
 * decisioni di correzione cartellino (vedi resolveIsApprover sotto, e la
 * nota nella design spec sul perché quel controllo usa una soglia diversa).
 */
function isAdminEquivalent(role) {
  return role === 'admin' || role === 'superadmin' || role === 'senior_manager' || role === 'director';
}

/**
 * Chi può agire come "superiore che approva" per il dipendente target
 * (correzione cartellino di un manager/senior_manager — design spec,
 * decisione 6, punto 2). Regole, in ordine:
 *   1. admin/superadmin possono sempre farlo.
 *   2. altrimenti, solo chi è esattamente il reports_to_id del target.
 * Deliberatamente NON usa isAdminEquivalent: un senior_manager o un
 * director generico non deve poter correggere il cartellino di QUALUNQUE
 * manager solo per il proprio ruolo — deve essere lo specifico superiore
 * risolto via reports_to_id (o un fallback a NULL che ricade solo su
 * admin/superadmin).
 */
function resolveIsApprover(client, { candidateEmployeeId, candidateRole, targetEmployeeId, targetReportsToId }) {
  // eslint-disable-next-line no-unused-vars
  void client; // riservato per un futuro attraversamento multi-livello; oggi la regola è a un solo salto (vedi design spec, "Rischi noti")
  if (getRoleLevel(candidateRole) >= ROLE_LEVELS.admin) return true;
  if (!targetReportsToId) return false;
  return candidateEmployeeId === targetReportsToId;
}

module.exports = { ROLE_LEVELS, getRoleLevel, isAdminEquivalent, resolveIsApprover };
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `cd backend && npx jest src/__tests__/roles.test.js`
Expected: PASS, tutti i test verdi.

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/roles.js backend/src/__tests__/roles.test.js
git commit -m "feat: add roles.js — ROLE_LEVELS, isAdminEquivalent, resolveIsApprover"
```

---

### Task 3: Validazione creazione dipendente — nuovi ruoli + `reports_to_id`

**Files:**
- Modify: `backend/src/middleware/validation.js:469-517` (`AdminEmployeeSchema`)
- Modify: `backend/src/utils/errors.js` (nuova classe `InvalidReportsToAssignmentError`)
- Modify: `backend/src/routes/admin/employees.js:1-100` (`POST /`)
- Test: `backend/src/__tests__/admin-employees-role-hierarchy.test.js`

**Interfaces:**
- Consumes: `ROLE_LEVELS`, `getRoleLevel` da `../utils/roles` (Task 2).
- Produces: `POST /api/admin/employees` accetta `role: 'senior_manager' | 'director'` e un campo opzionale `reports_to_id`; l'employee creato include `reports_to_id` nella risposta, come già fa con `manager_id`.

- [ ] **Step 1: Scrivere i test (mock del pool, stesso pattern di `checkins-rbac.test.js`)**

```js
// backend/src/__tests__/admin-employees-role-hierarchy.test.js
'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../db/pool', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../middleware/rateLimiter', () => ({
  apiLimiter: (req, res, next) => next(),
  authLimiter: (req, res, next) => next(),
  csvLimiter: (req, res, next) => next(),
  demoStartLimiter: (req, res, next) => next(),
  onboardingInviteLimiter: (req, res, next) => next(),
}));

const { pool } = require('../db/pool');
const app = require('../app');

beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
afterAll(() => { process.env.DISABLE_AUTH = 'true'; });

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const DIRECTOR_ID = '550e8400-e29b-41d4-a716-446655440200';
const SENIOR_ID = '550e8400-e29b-41d4-a716-446655440201';
const ADMIN_TOKEN = makeToken({ user_id: 'admin-1', client_id: CLIENT_ID, role: 'admin' });

beforeEach(() => jest.clearAllMocks());

function mockQueryDispatch(handlers) {
  pool.query.mockImplementation((sql, params) => {
    const s = sql.trim().toUpperCase();
    for (const [match, handler] of handlers) {
      if (s.includes(match)) return Promise.resolve(handler(params));
    }
    return Promise.resolve({ rows: [] });
  });
}

describe('POST /api/admin/employees — role hierarchy', () => {
  it('accepts role senior_manager with a valid director reports_to_id', async () => {
    mockQueryDispatch([
      ['FROM CLIENTS', () => ({ rows: [{ id: CLIENT_ID }] })],
      ['FROM EMPLOYEES', (params) => {
        // approver lookup: director exists, active
        if (params.includes(DIRECTOR_ID)) return { rows: [{ id: DIRECTOR_ID, role: 'director' }] };
        return { rows: [] };
      }],
      ['INSERT INTO EMPLOYEES', () => ({
        rows: [{
          id: SENIOR_ID, client_id: CLIENT_ID, email: 'sm@test.local', name: 'Senior Manager',
          role: 'senior_manager', reports_to_id: DIRECTOR_ID, created_at: new Date().toISOString(),
        }],
      })],
    ]);

    const res = await request(app)
      .post('/api/admin/employees')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        email: 'sm@test.local', name: 'Senior Manager', role: 'senior_manager',
        reports_to_id: DIRECTOR_ID,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('senior_manager');
    expect(res.body.data.reports_to_id).toBe(DIRECTOR_ID);
  });

  it('rejects reports_to_id pointing at a lower-level role (a manager cannot approve a senior_manager)', async () => {
    mockQueryDispatch([
      ['FROM CLIENTS', () => ({ rows: [{ id: CLIENT_ID }] })],
      ['FROM EMPLOYEES', () => ({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440202', role: 'manager' }] })],
    ]);

    const res = await request(app)
      .post('/api/admin/employees')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        email: 'sm2@test.local', name: 'Senior Manager 2', role: 'senior_manager',
        reports_to_id: '550e8400-e29b-41d4-a716-446655440202',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REPORTS_TO_ASSIGNMENT');
  });

  it('rejects reports_to_id on an employee role (only manager/senior_manager may set it)', async () => {
    const res = await request(app)
      .post('/api/admin/employees')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({
        email: 'e1@test.local', name: 'Employee One', role: 'employee',
        assigned_sites: [], reports_to_id: SENIOR_ID,
      });

    expect(res.status).toBe(400);
  });

  it('allows senior_manager/director with no reports_to_id (falls back to admin, per design)', async () => {
    mockQueryDispatch([
      ['FROM CLIENTS', () => ({ rows: [{ id: CLIENT_ID }] })],
      ['INSERT INTO EMPLOYEES', () => ({
        rows: [{
          id: DIRECTOR_ID, client_id: CLIENT_ID, email: 'dir@test.local', name: 'Director',
          role: 'director', reports_to_id: null, created_at: new Date().toISOString(),
        }],
      })],
    ]);

    const res = await request(app)
      .post('/api/admin/employees')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ email: 'dir@test.local', name: 'Director', role: 'director' });

    expect(res.status).toBe(201);
    expect(res.body.data.reports_to_id).toBeNull();
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `cd backend && npx jest src/__tests__/admin-employees-role-hierarchy.test.js`
Expected: FAIL — lo schema Zod rifiuta `role: 'senior_manager'` (`role must be employee or manager`), quindi il primo test riceve 400 invece di 201.

- [ ] **Step 3: Aggiungere `InvalidReportsToAssignmentError`**

In `backend/src/utils/errors.js`, subito dopo la classe `InvalidManagerAssignmentError`:

```js
class InvalidReportsToAssignmentError extends ApiError {
  constructor(message = 'reports_to_id does not match a valid superior for this role') {
    super('INVALID_REPORTS_TO_ASSIGNMENT', message, 400);
    this.name = 'InvalidReportsToAssignmentError';
  }
}
```

E aggiungerla al `module.exports` in fondo al file, subito dopo `InvalidManagerAssignmentError,`:

```js
  InvalidReportsToAssignmentError,
```

- [ ] **Step 4: Estendere `AdminEmployeeSchema` in `backend/src/middleware/validation.js`**

Sostituire (righe 475-477):
```js
    role: z.enum(['employee', 'manager'], {
      errorMap: () => ({ message: 'role must be employee or manager' }),
    }).default('employee'),
```
con:
```js
    role: z.enum(['employee', 'manager', 'senior_manager', 'director'], {
      errorMap: () => ({ message: 'role must be employee, manager, senior_manager or director' }),
    }).default('employee'),
```

Aggiungere, subito dopo `manager_id` (riga 503):
```js
    manager_id: z.string().uuid('manager_id must be a valid UUID').optional().nullable(),
    // Usata solo per role manager/senior_manager — chi approva le loro
    // richieste personali (ferie/malattia/correzione cartellino). NULL è
    // sempre valido: ricade sull'admin (vedi design spec 2026-08-29,
    // decisione 4). Diversa da manager_id: vedi quella colonna nella
    // migration 042 per il motivo per cui non sono la stessa cosa.
    reports_to_id: z.string().uuid('reports_to_id must be a valid UUID').optional().nullable(),
```

Sostituire i due `.refine()` esistenti (righe 504-516) con tre `.refine()`:
```js
  }).refine(
    (data) => ['manager', 'senior_manager', 'director'].includes(data.role) || data.assigned_sites.length > 0,
    { message: 'employees must have at least one assigned site', path: ['assigned_sites'] }
  ).refine(
    // Un dipendente non può esistere senza un manager di riferimento — la sede a
    // cui viene assegnato deve già avere un manager attivo prima che un admin
    // possa aggiungere dipendenti (i manager restano esenti, non hanno un proprio
    // manager). Trovato testando manualmente questo branch: creare un dipendente
    // su una sede appena creata, ancora senza manager, veniva accettato senza
    // alcun avviso.
    (data) => ['manager', 'senior_manager', 'director'].includes(data.role) || !!data.manager_id,
    { message: 'employees must have a manager_id — create a manager for this site first', path: ['manager_id'] }
  ).refine(
    // reports_to_id è concettualmente un'escalation di approvazione, non un
    // organigramma di sede — ha senso solo per chi ha bisogno di un
    // superiore che approvi le SUE richieste personali. employee/director
    // non lo usano mai (employee usa manager_id/site scoping; director è il
    // tappo della gerarchia).
    (data) => !data.reports_to_id || ['manager', 'senior_manager'].includes(data.role),
    { message: 'reports_to_id can only be set for manager or senior_manager', path: ['reports_to_id'] }
  ),
```

- [ ] **Step 5: Validare `reports_to_id` server-side in `backend/src/routes/admin/employees.js`**

Aggiungere l'import in cima al file (dopo la riga 8):
```js
const { ROLE_LEVELS, getRoleLevel } = require('../../utils/roles');
```
E cambiare la riga 8 aggiungendo la nuova classe di errore:
```js
const { ValidationError, NotFoundError, ConflictError, InvalidManagerAssignmentError, InvalidReportsToAssignmentError } = require('../../utils/errors');
```

Subito dopo il blocco di validazione di `manager_id` (righe 48-61), aggiungere:
```js
    // Validazione server-side di reports_to_id: deve essere un dipendente
    // attivo dello stesso client, con role_level strettamente superiore a
    // quello del nuovo dipendente — altrimenti la catena di approvazione
    // sarebbe invertita o piatta (es. un manager "approvato" da un altro
    // manager pari livello).
    if (data.reports_to_id) {
      const approverCheck = await pool.query(
        'SELECT id, role FROM employees WHERE id = $1 AND client_id = $2 AND active = true',
        [data.reports_to_id, targetClientId]
      );
      if (approverCheck.rowCount === 0) {
        return next(new InvalidReportsToAssignmentError());
      }
      const approverLevel = getRoleLevel(approverCheck.rows[0].role);
      const ownLevel = getRoleLevel(data.role);
      if (approverLevel <= ownLevel) {
        return next(new InvalidReportsToAssignmentError(
          'reports_to_id must point to a strictly higher-level role than this employee'
        ));
      }
    }
```

E aggiornare l'INSERT (righe 68-75) per includere la nuova colonna:
```js
      result = await pool.query(
        `INSERT INTO employees (client_id, email, name, phone, role, site_id, password_hash, assigned_sites, external_employee_id, hiring_date, manager_id, reports_to_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::UUID[], $9, $10, $11, $12)
         RETURNING id, client_id, email, name, phone, role, site_id, assigned_sites, external_employee_id, hiring_date, manager_id, reports_to_id, created_at`,
        [targetClientId, data.email, data.name, data.phone || null,
          data.role, data.site_id || null, passwordHash, data.assigned_sites,
          data.external_employee_id || null, data.hiring_date || null, data.manager_id || null, data.reports_to_id || null]
      );
```

`ROLE_LEVELS` non viene usato direttamente in questo file (solo `getRoleLevel`) — rimuoverlo dall'import se il linter lo segnala come inutilizzato:
```js
const { getRoleLevel } = require('../../utils/roles');
```

- [ ] **Step 6: Eseguire i test e verificare che passino**

Run: `cd backend && npx jest src/__tests__/admin-employees-role-hierarchy.test.js`
Expected: PASS, tutti e 4 i test verdi.

- [ ] **Step 7: Eseguire l'intera suite backend per verificare zero regressioni su `manager_id`**

Run: `cd backend && npm test -- --testPathPattern="admin-employees|employeeSync"`
Expected: PASS, nessuna regressione sui test esistenti di `manager_id`/CSV sync.

- [ ] **Step 8: Commit**

```bash
git add backend/src/middleware/validation.js backend/src/utils/errors.js backend/src/routes/admin/employees.js backend/src/__tests__/admin-employees-role-hierarchy.test.js
git commit -m "feat: allow creating senior_manager/director employees with reports_to_id"
```

---

### Task 4: Viste "pending" e approvazione — scope admin-equivalente per senior_manager/director

**Files:**
- Modify: `backend/src/routes/events.js:1-20` (import), `events.js:136`, `events.js:175`
- Modify: `backend/src/routes/leaves.js:1-20` (import), `leaves.js:171`, `leaves.js:210`, `leaves.js:407`
- Modify: `backend/src/routes/illnesses.js:1-20` (import), `illnesses.js:291`, `illnesses.js:336`
- Test: `backend/src/__tests__/role-hierarchy-visibility.test.js`

**Interfaces:**
- Consumes: `isAdminEquivalent` da `../utils/roles` (Task 2).
- Produces: nessuna nuova interfaccia esterna — stesso shape di risposta di oggi, solo più ruoli passano il controllo RBAC.

- [ ] **Step 1: Scrivere i test (mock del pool)**

```js
// backend/src/__tests__/role-hierarchy-visibility.test.js
'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../db/pool', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../middleware/rateLimiter', () => ({
  apiLimiter: (req, res, next) => next(),
  authLimiter: (req, res, next) => next(),
  csvLimiter: (req, res, next) => next(),
  demoStartLimiter: (req, res, next) => next(),
  onboardingInviteLimiter: (req, res, next) => next(),
}));

const { pool } = require('../db/pool');
const app = require('../app');

beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
afterAll(() => { process.env.DISABLE_AUTH = 'true'; });

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const SENIOR_TOKEN = makeToken({ user_id: 'senior-1', client_id: CLIENT_ID, role: 'senior_manager' });
const DIRECTOR_TOKEN = makeToken({ user_id: 'director-1', client_id: CLIENT_ID, role: 'director' });
const MANAGER_TOKEN = makeToken({ user_id: 'mgr-1', client_id: CLIENT_ID, role: 'manager', site_id: '550e8400-e29b-41d4-a716-446655440012' });

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockResolvedValue({ rows: [] });
});

describe.each([
  ['senior_manager', SENIOR_TOKEN],
  ['director', DIRECTOR_TOKEN],
])('%s has admin-equivalent visibility', (roleName, token) => {
  it('GET /api/v1/events/pending → 200, no site filter applied', async () => {
    const res = await request(app).get('/api/v1/events/pending').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/v1/leave/pending → 200, no site filter applied', async () => {
    const res = await request(app).get('/api/v1/leave/pending').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/v1/illnesses/admin → 200', async () => {
    const res = await request(app).get('/api/v1/illnesses/admin').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

it('a plain manager still gets 403 on GET /api/v1/illnesses/admin (unchanged)', async () => {
  const res = await request(app).get('/api/v1/illnesses/admin').set('Authorization', `Bearer ${MANAGER_TOKEN}`);
  expect(res.status).toBe(403);
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `cd backend && npx jest src/__tests__/role-hierarchy-visibility.test.js`
Expected: FAIL — `senior_manager`/`director` ricevono 403 (`FORBIDDEN`) da tutti e 3 gli endpoint, perché oggi solo `role === 'admin'`/`role === 'manager'` sono accettati.

- [ ] **Step 3: `events.js` — aggiungere l'import e sostituire i due branch**

Aggiungere in cima al file, vicino agli altri require di `../utils/`:
```js
const { isAdminEquivalent } = require('../utils/roles');
```

Riga 136, sostituire:
```js
    if (role === 'admin') {
```
con:
```js
    if (isAdminEquivalent(role)) {
```

Riga 175, sostituire:
```js
    if (role !== 'admin' && !(role === 'manager' && siteId)) {
```
con:
```js
    if (!isAdminEquivalent(role) && !(role === 'manager' && siteId)) {
```

- [ ] **Step 4: `leaves.js` — stesso pattern, 3 siti**

Aggiungere lo stesso import. Riga 171 (identica a `events.js:136`) e riga 210 (identica a `events.js:175`): stessa sostituzione.

Riga 407, sostituire:
```js
    if (role === 'admin') {
```
con:
```js
    if (isAdminEquivalent(role)) {
```

- [ ] **Step 5: `illnesses.js` — 2 siti**

Aggiungere lo stesso import. Riga 291, sostituire:
```js
    if (role === 'admin') {
```
con:
```js
    if (isAdminEquivalent(role)) {
```

Riga 336, sostituire:
```js
    if (role !== 'admin') {
```
con:
```js
    if (!isAdminEquivalent(role)) {
```

- [ ] **Step 6: Eseguire i test e verificare che passino**

Run: `cd backend && npx jest src/__tests__/role-hierarchy-visibility.test.js`
Expected: PASS, tutti i test verdi (incluso il manager che resta a 403).

- [ ] **Step 7: Eseguire l'intera suite di events/leaves/illnesses per verificare zero regressioni**

Run: `cd backend && npm test -- --testPathPattern="events|leaves|illnesses"`
Expected: PASS — nessuna regressione sul comportamento esistente di `admin`/`manager`/`employee`/`viewer`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/events.js backend/src/routes/leaves.js backend/src/routes/illnesses.js backend/src/__tests__/role-hierarchy-visibility.test.js
git commit -m "feat: senior_manager/director get admin-equivalent visibility on pending/approval endpoints"
```

---

### Task 5: Correzione cartellino — self-block + regola gerarchica

**Files:**
- Modify: `backend/src/routes/checkins.js:1-24` (import), `checkins.js:457-503`
- Test: `backend/src/__tests__/checkins-hierarchy-correction.test.js`

**Interfaces:**
- Consumes: `getRoleLevel`, `ROLE_LEVELS`, `resolveIsApprover` da `../utils/roles` (Task 2).
- Produces: nessuna nuova interfaccia esterna — `PUT /api/checkins/:id` ritorna 403 in due nuovi casi (self-correction manager+, correzione di un manager/senior_manager da parte di chi non è il suo `reports_to_id` né admin).

- [ ] **Step 1: Scrivere i test (mock del pool, stesso pattern di `checkins-ownership.test.js`)**

```js
// backend/src/__tests__/checkins-hierarchy-correction.test.js
'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../db/pool', () => ({ pool: { query: jest.fn(), connect: jest.fn() } }));
jest.mock('../db/redis', () => ({ deleteCacheByPattern: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../middleware/rateLimiter', () => ({
  apiLimiter: (req, res, next) => next(),
  authLimiter: (req, res, next) => next(),
  csvLimiter: (req, res, next) => next(),
  demoStartLimiter: (req, res, next) => next(),
  onboardingInviteLimiter: (req, res, next) => next(),
}));

const { pool } = require('../db/pool');
const app = require('../app');

beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
afterAll(() => { process.env.DISABLE_AUTH = 'true'; });

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const CHECKIN_ID = '550e8400-e29b-41d4-a716-446655440300';
const MGR_ID = '550e8400-e29b-41d4-a716-446655440301';
const SENIOR_ID = '550e8400-e29b-41d4-a716-446655440302';
const OTHER_SENIOR_ID = '550e8400-e29b-41d4-a716-446655440303';
const ADMIN_TOKEN = makeToken({ user_id: 'admin-1', client_id: CLIENT_ID, role: 'admin' });

function mockClientQuery({ checkinEmployeeId, checkinRole, checkinReportsToId }) {
  return jest.fn().mockImplementation((sql) => {
    const s = sql.trim().toUpperCase();
    if (s.startsWith('BEGIN') || s.startsWith('COMMIT') || s.startsWith('ROLLBACK') || s.startsWith('SET LOCAL')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('FROM CHECKINS C') && s.includes('JOIN EMPLOYEES')) {
      return Promise.resolve({
        rows: [{
          id: CHECKIN_ID, employee_id: checkinEmployeeId, site_id: null,
          type: 'IN', timestamp: new Date().toISOString(),
          employee_role: checkinRole, employee_reports_to_id: checkinReportsToId,
        }],
      });
    }
    return Promise.resolve({ rows: [{ id: CHECKIN_ID, employee_id: checkinEmployeeId, type: 'IN', timestamp: new Date().toISOString() }] });
  });
}

beforeEach(() => jest.clearAllMocks());

describe('PUT /api/checkins/:id — hierarchy-aware correction', () => {
  it('blocks a manager from correcting their own check-in', async () => {
    pool.connect.mockResolvedValue({
      query: mockClientQuery({ checkinEmployeeId: MGR_ID, checkinRole: 'manager', checkinReportsToId: null }),
      release: jest.fn(),
    });
    const mgrToken = makeToken({ user_id: MGR_ID, client_id: CLIENT_ID, role: 'manager', employee_id: MGR_ID });

    const res = await request(app)
      .put(`/api/checkins/${CHECKIN_ID}`)
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ correction_note: 'oops' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_SELF_CORRECTION');
  });

  it('blocks a senior_manager who is NOT the reports_to_id target from correcting a manager', async () => {
    pool.connect.mockResolvedValue({
      query: mockClientQuery({ checkinEmployeeId: MGR_ID, checkinRole: 'manager', checkinReportsToId: SENIOR_ID }),
      release: jest.fn(),
    });
    const wrongSeniorToken = makeToken({ user_id: OTHER_SENIOR_ID, client_id: CLIENT_ID, role: 'senior_manager', employee_id: OTHER_SENIOR_ID });

    const res = await request(app)
      .put(`/api/checkins/${CHECKIN_ID}`)
      .set('Authorization', `Bearer ${wrongSeniorToken}`)
      .send({ correction_note: 'oops' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN_HIERARCHY');
  });

  it('allows the exact reports_to_id senior_manager to correct their manager', async () => {
    pool.connect.mockResolvedValue({
      query: mockClientQuery({ checkinEmployeeId: MGR_ID, checkinRole: 'manager', checkinReportsToId: SENIOR_ID }),
      release: jest.fn(),
    });
    const rightSeniorToken = makeToken({ user_id: SENIOR_ID, client_id: CLIENT_ID, role: 'senior_manager', employee_id: SENIOR_ID });

    const res = await request(app)
      .put(`/api/checkins/${CHECKIN_ID}`)
      .set('Authorization', `Bearer ${rightSeniorToken}`)
      .send({ correction_note: 'approved fix' });

    expect(res.status).toBe(200);
  });

  it('allows admin to correct a manager regardless of reports_to_id', async () => {
    pool.connect.mockResolvedValue({
      query: mockClientQuery({ checkinEmployeeId: MGR_ID, checkinRole: 'manager', checkinReportsToId: null }),
      release: jest.fn(),
    });

    const res = await request(app)
      .put(`/api/checkins/${CHECKIN_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ correction_note: 'admin fix' });

    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `cd backend && npx jest src/__tests__/checkins-hierarchy-correction.test.js`
Expected: FAIL — i primi due test ricevono 200 invece di 403 (nessun blocco esiste ancora); gli ultimi due potrebbero già passare per caso, ma vanno comunque verificati dopo l'implementazione.

- [ ] **Step 3: Aggiungere l'import in `checkins.js`**

Dopo la riga 19 (`const { buildScopedFilters } = require('../utils/queryScope');`):
```js
const { getRoleLevel, ROLE_LEVELS, resolveIsApprover } = require('../utils/roles');
```

- [ ] **Step 4: Estendere la query di fetch del checkin per includere ruolo e `reports_to_id` del dipendente target**

Sostituire (righe 470-476):
```js
      const checkinResult = await client.query(
        `SELECT c.id, c.employee_id, c.site_id, c.type, c.timestamp
         FROM checkins c
         JOIN employees e ON c.employee_id = e.id
         WHERE c.id = $1::uuid AND e.client_id = $2::uuid`,
        [id, clientId]
      );
```
con:
```js
      const checkinResult = await client.query(
        `SELECT c.id, c.employee_id, c.site_id, c.type, c.timestamp,
                e.role AS employee_role, e.reports_to_id AS employee_reports_to_id
         FROM checkins c
         JOIN employees e ON c.employee_id = e.id
         WHERE c.id = $1::uuid AND e.client_id = $2::uuid`,
        [id, clientId]
      );
```

- [ ] **Step 5: Aggiungere i due controlli, subito dopo il blocco di scoping per sede del manager (dopo la riga 488, prima del commento "Event conflict check")**

```js
      // 2b. Self-correction block per manager/senior_manager/director — non
      // per admin/superadmin, che non hanno un superiore che potrebbe
      // altrimenti farlo al posto loro (design spec 2026-08-29, decisione 6).
      const callerLevel = getRoleLevel(req.user.role);
      if (req.user.employee_id && checkin.employee_id === req.user.employee_id &&
          callerLevel >= ROLE_LEVELS.manager && callerLevel < ROLE_LEVELS.admin) {
        throw new ForbiddenError('You cannot correct your own check-in', 'FORBIDDEN_SELF_CORRECTION');
      }

      // 2c. Correggere il cartellino di un manager/senior_manager richiede di
      // essere admin/superadmin OPPURE lo specifico superiore risolto via
      // reports_to_id — lo scoping di sede (2a sopra) non è sufficiente
      // quando il target è a sua volta un manager.
      if (['manager', 'senior_manager'].includes(checkin.employee_role) &&
          !resolveIsApprover(client, {
            candidateEmployeeId: req.user.employee_id,
            candidateRole: req.user.role,
            targetEmployeeId: checkin.employee_id,
            targetReportsToId: checkin.employee_reports_to_id,
          })) {
        throw new ForbiddenError(
          "Only this employee's designated superior or an admin can correct this check-in",
          'FORBIDDEN_HIERARCHY'
        );
      }
```

- [ ] **Step 6: Eseguire i test e verificare che passino**

Run: `cd backend && npx jest src/__tests__/checkins-hierarchy-correction.test.js`
Expected: PASS, tutti e 4 i test verdi.

- [ ] **Step 7: Eseguire l'intera suite di checkins per verificare zero regressioni**

Run: `cd backend && npm test -- --testPathPattern="checkins"`
Expected: PASS — nessuna regressione sulla correzione esistente per `employee`/`manager` su sedi normali (nessuno di questi test usa `senior_manager`/`director`, quindi `resolveIsApprover` per un target `role: 'employee'` non viene mai valutato — il controllo 2c è condizionato su `checkin.employee_role`).

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/checkins.js backend/src/__tests__/checkins-hierarchy-correction.test.js
git commit -m "feat: hierarchy-aware check-in correction — block self-correction and enforce reports_to_id for manager+ targets"
```

---

### Task 6: Suite completa + lint

**Files:** nessuno (solo verifica)

- [ ] **Step 1: Eseguire l'intera suite backend**

Run: `cd backend && npm test`
Expected: PASS, zero regressioni sull'intera suite (incluso il batch `GLOBAL_STATE_TEST_FILES` di `scripts/run-tests.js`).

- [ ] **Step 2: Eseguire il linter**

Run: `cd backend && npm run lint`
Expected: nessun errore (in particolare: nessun import inutilizzato di `ROLE_LEVELS` in `routes/admin/employees.js` se non usato direttamente — vedi nota a Task 3 Step 5).

- [ ] **Step 3: Verifica grep del pattern CLAUDE.md Pattern 1 (niente UUID hardcoded come stringhe)**

Run: `grep -rn "client_id: '[^{]" backend/src/ | grep -v __tests__ || true`
Expected: nessun match nei file di produzione toccati da questo piano.

- [ ] **Step 4: Commit finale (se Step 1-3 hanno prodotto modifiche, es. lint --fix)**

```bash
git add -A
git commit -m "chore: lint fixes after role hierarchy implementation" --allow-empty
```
