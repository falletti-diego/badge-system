# Campi Nuovo Dipendente (Sede, Matricola, Data assunzione, Manager) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere Sede, Matricola, Data assunzione e Manager di riferimento al form "Nuovo Dipendente", con enforcement reale della data di assunzione nel check-in e coerenza nel wizard xlsx.

**Architecture:** Riuso di colonne DB già esistenti (`external_employee_id`, `hiring_date`) mai esposte dall'endpoint di creazione singola; una nuova colonna self-referencing (`manager_id`). Il flusso backend resta a singolo `INSERT`/round-trip. Il check-in guadagna un controllo aggiuntivo (stesso pattern di `GeofenceError`). Il wizard xlsx risolve gli email dei manager riusando l'elenco dipendenti già caricato in memoria (`dbEmployees`), senza query aggiuntive.

**Tech Stack:** Node.js/Express/PostgreSQL (backend), React/MUI/Vite (frontend-web), Zod, Jest+Supertest, Vitest+RTL, ExcelJS.

**Fonte:** `docs/superpowers/specs/2026-08-16-new-employee-fields-design.md` (spec approvata).

**Nota di scope scoperta durante la stesura del piano (non nella spec originale):** il wizard xlsx risolve `manager_email` solo contro manager **già esistenti in DB** per quel cliente (da `dbEmployees`, già caricato). Un manager creato nello stesso file upload non è risolvibile nello stesso passaggio (il suo `id` non esiste ancora al momento del calcolo diff) — per assegnare dipendenti a un manager nuovo servono due upload separati (prima il manager, poi i suoi dipendenti). Documentato come limitazione nota, non un bug.

---

## File Structure

- Create: `backend/migrations/040_add_manager_id_to_employees.sql`
- Modify: `backend/src/utils/errors.js` — nuova classe `EmploymentNotStartedError`
- Modify: `backend/src/middleware/validation.js` — estende `AdminEmployeeSchema`
- Modify: `backend/src/routes/admin/employees.js` — estende `POST /`
- Modify: `backend/src/routes/checkins.js` — enforcement `hiring_date`
- Modify: `frontend-web/src/features/admin/tabs/EmployeesTab.jsx` — nuovi campi form
- Modify: `backend/src/services/employeeSync/generateTemplate.js` — colonna `manager_email`
- Modify: `backend/src/services/employeeSync/parseTemplate.js` — parsing `manager_email`
- Modify: `backend/src/services/employeeSync/validate.js` — validazione `manager_email`
- Modify: `backend/src/routes/admin/employeeSync.js` — riordina fetch `dbEmployees` prima di `validateSyntax`
- Modify: `backend/src/services/employeeSync/computeDiff.js` — risoluzione `manager_email`→`manager_id`
- Modify: `backend/src/services/employeeSync/applyDiff.js` — `manager_id` nell'INSERT dei nuovi

---

## Task 1: Migration 040 — colonna `manager_id`

**Files:**
- Create: `backend/migrations/040_add_manager_id_to_employees.sql`

- [ ] **Step 1: Scrivere la migration**

```sql
-- 040_add_manager_id_to_employees.sql
-- Manager di riferimento: relazione self-referencing su employees, nullable.
-- ON DELETE SET NULL — se il manager viene rimosso, i dipendenti a lui
-- assegnati non devono essere bloccati, solo riassegnati in un secondo momento.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employees_manager_id ON employees(manager_id);
```

- [ ] **Step 2: Applicare la migration al DB di sviluppo/test**

Run: `cd backend && node scripts/run-migrations.js`
Expected: output include `040_add_manager_id_to_employees.sql` applicata senza errori, sia su DB development che test (lo script li applica entrambi, stesso pattern già seguito dalle migration precedenti — verificare `scripts/run-migrations.js` se il DB target va specificato via env var).

- [ ] **Step 3: Verificare la colonna**

Run: `cd backend && psql "$DATABASE_URL" -c "\d employees" | grep manager_id` (o equivalente contro il DB test/dev locale)
Expected: riga `manager_id | uuid |` presente, con vincolo FK verso `employees(id)`.

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/040_add_manager_id_to_employees.sql
git commit -m "feat(db): add manager_id self-referencing column to employees

Nullable, ON DELETE SET NULL — removing a manager unassigns their
reports instead of blocking the deletion or cascading."
```

---

## Task 2: `EmploymentNotStartedError`

**Files:**
- Modify: `backend/src/utils/errors.js`
- Test: `backend/src/__tests__/errors.test.js`

- [ ] **Step 1: Scrivere il test che fallisce**

Aggiungere in `backend/src/__tests__/errors.test.js`, dopo il blocco `describe('ApiError (base class)', ...)`:

```js
describe('EmploymentNotStartedError', () => {
  test('sets code EMPLOYMENT_NOT_STARTED, statusCode 403, details.hiring_date', () => {
    const { EmploymentNotStartedError } = require('../utils/errors');
    const err = new EmploymentNotStartedError('2026-09-01');
    expect(err.code).toBe('EMPLOYMENT_NOT_STARTED');
    expect(err.statusCode).toBe(403);
    expect(err.details).toEqual({ hiring_date: '2026-09-01' });
    expect(err instanceof Error).toBe(true);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `cd backend && npx jest src/__tests__/errors.test.js -t "EmploymentNotStartedError"`
Expected: FAIL — `EmploymentNotStartedError is not a constructor` (non ancora esportata).

- [ ] **Step 3: Implementare la classe**

In `backend/src/utils/errors.js`, dopo la classe `GeofenceError` (prima di `SessionRevokedError`):

```js
class EmploymentNotStartedError extends ApiError {
  constructor(hiringDate) {
    super('EMPLOYMENT_NOT_STARTED', 'Employment has not started yet', 403);
    this.name = 'EmploymentNotStartedError';
    this.details = { hiring_date: hiringDate };
  }
}
```

Aggiungere `EmploymentNotStartedError,` a `module.exports` (dopo `GeofenceError,`).

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `cd backend && npx jest src/__tests__/errors.test.js -t "EmploymentNotStartedError"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/errors.js backend/src/__tests__/errors.test.js
git commit -m "feat(backend): add EmploymentNotStartedError (403, EMPLOYMENT_NOT_STARTED)

Same structured-error pattern as GeofenceError — carries hiring_date
in details so the mobile client can show a specific message."
```

---

## Task 3: Estendere `AdminEmployeeSchema` (Zod)

**Files:**
- Modify: `backend/src/middleware/validation.js:468-486`
- Test: `backend/src/__tests__/validation.test.js` (creare se non esiste — verificare con `ls backend/src/__tests__/validation.test.js` prima di scrivere; se esiste già, aggiungere un nuovo `describe` block)

- [ ] **Step 1: Verificare se esiste già un file di test per `validation.js`**

Run: `ls backend/src/__tests__/ | grep -i "^validation"`
Se non esiste, crearlo da zero con questo contenuto (altrimenti aggiungere il blocco `describe` seguente in coda a un file esistente, riusando gli import già presenti):

```js
'use strict';

const { AdminEmployeeSchema } = require('../middleware/validation');

function validBody(overrides = {}) {
  return {
    email: 'mario@example.it',
    name: 'Mario Rossi',
    role: 'employee',
    site_id: '550e8400-e29b-41d4-a716-446655440010',
    assigned_sites: ['550e8400-e29b-41d4-a716-446655440010'],
    ...overrides,
  };
}

describe('AdminEmployeeSchema — new fields', () => {
  test('accepts a valid external_employee_id (alphanumeric)', () => {
    const result = AdminEmployeeSchema.safeParse({ body: validBody({ external_employee_id: 'MAT042' }) });
    expect(result.success).toBe(true);
  });

  test('rejects external_employee_id with a hyphen', () => {
    const result = AdminEmployeeSchema.safeParse({ body: validBody({ external_employee_id: 'MAT-042' }) });
    expect(result.success).toBe(false);
  });

  test('accepts hiring_date equal to today', () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = AdminEmployeeSchema.safeParse({ body: validBody({ hiring_date: today }) });
    expect(result.success).toBe(true);
  });

  test('rejects hiring_date in the past', () => {
    const result = AdminEmployeeSchema.safeParse({ body: validBody({ hiring_date: '2020-01-01' }) });
    expect(result.success).toBe(false);
  });

  test('accepts a valid manager_id (uuid)', () => {
    const result = AdminEmployeeSchema.safeParse({
      body: validBody({ manager_id: '550e8400-e29b-41d4-a716-446655440099' }),
    });
    expect(result.success).toBe(true);
  });

  test('accepts manager_id as null', () => {
    const result = AdminEmployeeSchema.safeParse({ body: validBody({ manager_id: null }) });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `cd backend && npx jest src/__tests__/validation.test.js -t "AdminEmployeeSchema — new fields"`
Expected: FAIL su tutti — i campi non esistono ancora nello schema, Zod li scarta silenziosamente (i test su `hiring_date`/`external_employee_id` invalidi non falliscono per il motivo giusto, ma il test "accepts hiring_date equal to today" passa comunque per caso; l'obiettivo di questo step è confermare che i test sui casi *rejects* non stiano già passando per il motivo sbagliato — se `success` risultasse sempre `true` anche per input invalidi, è la prova che manca la validazione).

- [ ] **Step 3: Estendere lo schema**

In `backend/src/middleware/validation.js`, sostituire il blocco `AdminEmployeeSchema` (righe 468-486):

```js
const AdminEmployeeSchema = z.object({
  body: z.object({
    client_id: z.string().uuid('client_id must be a valid UUID').optional(),
    email: z.string().email('Invalid email format').max(100),
    name: z.string().min(2, 'name must be at least 2 characters').max(100),
    phone: z.string().max(20).optional(),
    role: z.enum(['employee', 'manager'], {
      errorMap: () => ({ message: 'role must be employee or manager' }),
    }).default('employee'),
    site_id: z.string().uuid('site_id must be a valid UUID').optional().nullable(),
    assigned_sites: z.array(z.string().uuid('each assigned_site must be a valid UUID'))
      .min(1, 'assigned_sites must contain at least one site')
      .default([]),
    password: z.string().min(8, 'password must be at least 8 characters').max(100).optional(),
    external_employee_id: z.string()
      .regex(/^[A-Za-z0-9]+$/, 'external_employee_id must contain only letters and numbers')
      .max(50)
      .optional(),
    hiring_date: z.string()
      .refine((d) => !isNaN(new Date(d).getTime()), { message: 'hiring_date must be a valid date' })
      .refine((d) => new Date(d) >= new Date(new Date().toDateString()), {
        message: 'hiring_date cannot be in the past',
      })
      .optional(),
    manager_id: z.string().uuid('manager_id must be a valid UUID').optional().nullable(),
  }).refine(
    (data) => data.role === 'manager' || data.assigned_sites.length > 0,
    { message: 'employees must have at least one assigned site', path: ['assigned_sites'] }
  ),
});
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `cd backend && npx jest src/__tests__/validation.test.js -t "AdminEmployeeSchema — new fields"`
Expected: PASS su tutti e 6

- [ ] **Step 5: Eseguire l'intera suite validation per non-regressione**

Run: `cd backend && npx jest src/__tests__/validation.test.js`
Expected: tutti i test esistenti restano PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/middleware/validation.js backend/src/__tests__/validation.test.js
git commit -m "feat(backend): extend AdminEmployeeSchema with matricola/hiring_date/manager_id

external_employee_id: strict alphanumeric. hiring_date: must be today or
future. manager_id: optional uuid, nullable."
```

---

## Task 4: Estendere `POST /api/v1/admin/employees`

**Files:**
- Modify: `backend/src/routes/admin/employees.js:22-80`
- Test: `backend/src/__tests__/admin-employees-scoping.test.js` (aggiungere un nuovo `describe`, stesso file — pattern DB reale già presente) o creare `backend/src/__tests__/admin-employees-create-fields.test.js` seguendo lo stesso pattern

- [ ] **Step 1: Scrivere i test di integrazione (nuovo file)**

Creare `backend/src/__tests__/admin-employees-create-fields.test.js`:

```js
'use strict';

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('POST /api/v1/admin/employees — new fields (Sede/Matricola/Data assunzione/Manager)', () => {
  jest.setTimeout(30000);

  let pool;
  let dbAvailable = false;
  let request;
  let app;

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[admin-employees-create-fields.test] Skipping — could not connect: ${err.message}`);
    }
    if (dbAvailable) {
      request = require('supertest');
      app = require('../app');
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      const { closePool } = require('../db/pool');
      await closePool();
    }
    if (pool) await pool.end();
  });

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  async function makeClient() {
    const result = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Employees Create Fields Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('admin-employees-create-fields-client')]
    );
    return result.rows[0].id;
  }

  async function makeSite(clientId) {
    const qrContent = `badge://test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await pool.query(
      `INSERT INTO sites (id, client_id, name, qr_code_content)
       VALUES (uuid_generate_v4(), $1, 'Site', $2)
       RETURNING id`,
      [clientId, qrContent]
    );
    return result.rows[0].id;
  }

  async function makeManager(clientId, siteId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, site_id, assigned_sites)
       VALUES ($1, $2, 'Manager Test', 'manager', $3, ARRAY[$3]::uuid[])
       RETURNING id`,
      [clientId, uniqueEmail('admin-employees-create-fields-manager'), siteId]
    );
    return result.rows[0].id;
  }

  function adminToken(clientId) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign({ user_id: 'test-admin', client_id: clientId, role: 'admin', name: 'Admin' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
  }

  let clientId, siteId;

  beforeEach(async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    siteId = await makeSite(clientId);
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('creates an employee with matricola, hiring_date, and manager_id', async () => {
    if (!dbAvailable) return;
    const managerId = await makeManager(clientId, siteId);
    const token = adminToken(clientId);

    const res = await request(app)
      .post('/api/v1/admin/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: uniqueEmail('new-employee'),
        name: 'Nuovo Dipendente',
        role: 'employee',
        client_id: clientId,
        site_id: siteId,
        assigned_sites: [siteId],
        external_employee_id: 'MAT001',
        hiring_date: new Date().toISOString().slice(0, 10),
        manager_id: managerId,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.external_employee_id).toBe('MAT001');
    expect(res.body.data.manager_id).toBe(managerId);
  });

  it('rejects a duplicate matricola for the same client with 409 DUPLICATE_MATRICOLA', async () => {
    if (!dbAvailable) return;
    const token = adminToken(clientId);
    const shared = { role: 'employee', client_id: clientId, site_id: siteId, assigned_sites: [siteId], external_employee_id: 'DUP001' };

    const first = await request(app).post('/api/v1/admin/employees').set('Authorization', `Bearer ${token}`)
      .send({ ...shared, email: uniqueEmail('dup-1'), name: 'Primo' });
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/v1/admin/employees').set('Authorization', `Bearer ${token}`)
      .send({ ...shared, email: uniqueEmail('dup-2'), name: 'Secondo' });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('DUPLICATE_MATRICOLA');
  });

  it('rejects manager_id belonging to a different site with 400 INVALID_MANAGER_ASSIGNMENT', async () => {
    if (!dbAvailable) return;
    const otherSiteId = await makeSite(clientId);
    const managerOnOtherSite = await makeManager(clientId, otherSiteId);
    const token = adminToken(clientId);

    const res = await request(app)
      .post('/api/v1/admin/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: uniqueEmail('mismatched-manager'),
        name: 'Dipendente',
        role: 'employee',
        client_id: clientId,
        site_id: siteId,
        assigned_sites: [siteId],
        manager_id: managerOnOtherSite,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_MANAGER_ASSIGNMENT');
  });

  it('creates an employee with no manager_id (optional, site with no manager yet)', async () => {
    if (!dbAvailable) return;
    const token = adminToken(clientId);

    const res = await request(app)
      .post('/api/v1/admin/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: uniqueEmail('no-manager'),
        name: 'Senza Manager',
        role: 'employee',
        client_id: clientId,
        site_id: siteId,
        assigned_sites: [siteId],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.manager_id).toBeNull();
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `cd backend && npx jest src/__tests__/admin-employees-create-fields.test.js`
Expected: FAIL — `manager_id`/`external_employee_id`/`hiring_date` non ancora restituiti/gestiti dalla route (colonne non nell'INSERT/RETURNING), nessuna gestione 409/400 dedicata.

- [ ] **Step 3: Estendere la route**

Sostituire il blocco `router.post('/', ...)` in `backend/src/routes/admin/employees.js` (righe 22-80):

```js
router.post('/', createValidationMiddleware(AdminEmployeeSchema), async (req, res, next) => {
  try {
    const data = req.validated.body;
    const targetClientId = resolveTenantScope(req.user, data.client_id);

    const clientCheck = await pool.query('SELECT id FROM clients WHERE id = $1', [targetClientId]);
    if (clientCheck.rowCount === 0) return next(new ValidationError('Client not found'));

    if (data.site_id) {
      const siteCheck = await pool.query(
        'SELECT id FROM sites WHERE id = $1 AND client_id = $2',
        [data.site_id, targetClientId]
      );
      if (siteCheck.rowCount === 0) return next(new ValidationError('Site not found for this client'));
    }

    if (data.assigned_sites.length > 0) {
      const ownedSites = await pool.query(
        'SELECT id FROM sites WHERE id = ANY($1::UUID[]) AND client_id = $2',
        [data.assigned_sites, targetClientId]
      );
      if (ownedSites.rowCount !== data.assigned_sites.length) {
        return next(new ValidationError('One or more assigned_sites do not belong to this client'));
      }
    }

    // Validazione server-side del manager: deve essere un manager reale,
    // dello stesso cliente, con site_id coincidente con la sede scelta per
    // il nuovo dipendente. La UI filtra già correttamente, ma un client
    // malevolo/bug potrebbe inviare un manager_id arbitrario.
    if (data.manager_id) {
      const managerCheck = await pool.query(
        `SELECT id FROM employees WHERE id = $1 AND client_id = $2 AND role = 'manager' AND site_id = $3`,
        [data.manager_id, targetClientId, data.site_id || null]
      );
      if (managerCheck.rowCount === 0) {
        return next(new ValidationError('manager_id does not match a manager of the selected site', {
          code: 'INVALID_MANAGER_ASSIGNMENT',
        }));
      }
    }

    const tempPassword = data.password || generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    let result;
    try {
      result = await pool.query(
        `INSERT INTO employees (client_id, email, name, phone, role, site_id, password_hash, assigned_sites, external_employee_id, hiring_date, manager_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::UUID[], $9, $10, $11)
         RETURNING id, client_id, email, name, phone, role, site_id, assigned_sites, external_employee_id, hiring_date, manager_id, created_at`,
        [targetClientId, data.email, data.name, data.phone || null,
          data.role, data.site_id || null, passwordHash, data.assigned_sites,
          data.external_employee_id || null, data.hiring_date || null, data.manager_id || null]
      );
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'uq_employees_external_id') {
        return next(new (require('../../utils/errors').ConflictError)(
          'Matricola già in uso per questo cliente', 'DUPLICATE_MATRICOLA'
        ));
      }
      throw err;
    }

    const employee = result.rows[0];
    logger.info({ action: 'admin_create_employee', employee_id: employee.id, client_id: targetClientId });
    await logAudit(pool, {
      action: 'admin_create_employee',
      entity: 'employee',
      entityId: employee.id,
      clientId: employee.client_id,
      oldValue: null,
      newValue: {
        name: employee.name, email: employee.email, role: employee.role, client_id: employee.client_id,
        external_employee_id: employee.external_employee_id, hiring_date: employee.hiring_date, manager_id: employee.manager_id,
      },
      userId: req.user.user_id,
    });

    res.status(201).json({
      success: true,
      data: employee,
      temp_password: data.password ? undefined : tempPassword,
    });
  } catch (err) {
    if (err.code === '23505') return next(new ValidationError('Email already exists for this client'));
    next(err);
  }
});
```

Nota: `ConflictError` va importato in cima al file insieme agli altri — sostituire l'import inline `require('../../utils/errors').ConflictError` con un import pulito in testa al file (riga 8): cambiare `const { ValidationError, NotFoundError } = require('../../utils/errors');` in `const { ValidationError, NotFoundError, ConflictError } = require('../../utils/errors');`, e nel blocco sopra usare direttamente `new ConflictError(...)` invece della require inline.

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `cd backend && npx jest src/__tests__/admin-employees-create-fields.test.js`
Expected: PASS su tutti e 4

- [ ] **Step 5: Eseguire la suite employees/admin per non-regressione**

Run: `cd backend && npx jest src/__tests__/admin-employees`
Expected: tutti i test esistenti restano PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/admin/employees.js backend/src/__tests__/admin-employees-create-fields.test.js
git commit -m "feat(backend): accept matricola/hiring_date/manager_id in POST /admin/employees

Server-side manager validation (role+site+client match) even though the
UI already filters correctly. Duplicate matricola surfaces as 409
DUPLICATE_MATRICOLA instead of a generic email-conflict message."
```

---

## Task 5: Enforcement `hiring_date` nel check-in

**Files:**
- Modify: `backend/src/routes/checkins.js:59-63` (query) e dopo la riga ~71 (check `active`)
- Test: `backend/src/__tests__/checkins-hiring-date.test.js` (nuovo, stesso pattern di `checkins-active-employee.test.js`)

- [ ] **Step 1: Scrivere il test che fallisce**

Creare `backend/src/__tests__/checkins-hiring-date.test.js`:

```js
'use strict';

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('POST /api/v1/checkins — hiring_date guard', () => {
  jest.setTimeout(30000);

  let pool;
  let dbAvailable = false;
  let request;
  let app;

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[checkins-hiring-date.test] Skipping — could not connect: ${err.message}`);
    }
    if (dbAvailable) {
      request = require('supertest');
      app = require('../app');
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      const { closePool } = require('../db/pool');
      await closePool();
    }
    if (pool) await pool.end();
  });

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  async function makeClient() {
    const result = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Checkins Hiring Date Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('checkins-hiring-date-client')]
    );
    return result.rows[0].id;
  }

  async function makeSite(clientId) {
    const qrContent = `badge://test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await pool.query(
      `INSERT INTO sites (id, client_id, name, qr_code_content)
       VALUES (uuid_generate_v4(), $1, 'Site', $2)
       RETURNING id`,
      [clientId, qrContent]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId, siteId, hiringDate) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, active, hiring_date)
       VALUES ($1, $2, 'Checkin Hiring Date Employee', 'employee', ARRAY[$3]::uuid[], true, $4)
       RETURNING id`,
      [clientId, uniqueEmail('checkins-hiring-date'), siteId, hiringDate]
    );
    return result.rows[0].id;
  }

  function tokenFor({ client_id, role, employee_id }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign(
      { user_id: 'test-user', client_id, role, employee_id, name: 'Test' },
      privateKey,
      { algorithm: 'RS256', expiresIn: '1h' }
    );
  }

  let clientId, siteId;

  beforeEach(async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    siteId = await makeSite(clientId);
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('rejects check-in with 403 EMPLOYMENT_NOT_STARTED when hiring_date is in the future', async () => {
    if (!dbAvailable) return;
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const employeeId = await makeEmployee(clientId, siteId, tomorrow);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: employeeId, site_id: siteId, type: 'IN' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('EMPLOYMENT_NOT_STARTED');
    expect(res.body.details.hiring_date).toBe(tomorrow);
  });

  it('allows check-in when hiring_date is today', async () => {
    if (!dbAvailable) return;
    const today = new Date().toISOString().slice(0, 10);
    const employeeId = await makeEmployee(clientId, siteId, today);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: employeeId, site_id: siteId, type: 'IN' });

    expect(res.status).toBe(201);
  });

  it('allows check-in when hiring_date is NULL (legacy employee, no regression)', async () => {
    if (!dbAvailable) return;
    const employeeId = await makeEmployee(clientId, siteId, null);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: employeeId, site_id: siteId, type: 'IN' });

    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che il primo fallisca**

Run: `cd backend && npx jest src/__tests__/checkins-hiring-date.test.js`
Expected: il primo test FAIL (riceve 201 invece di 403 — nessun enforcement ancora); gli altri due PASS già ora (comportamento attuale non blocca nulla).

- [ ] **Step 3: Implementare l'enforcement**

In `backend/src/routes/checkins.js`, estendere la SELECT dello Step 1 (riga 61-64) per includere `hiring_date`:

```js
      const employeeResult = await client.query(
        'SELECT id, client_id, active, hiring_date FROM employees WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1',
        [employee_id, clientId]
      );
```

Subito dopo il controllo `active` esistente (dopo la riga con `throw new ForbiddenError('This employee is deactivated...')`), aggiungere:

```js
      const { hiring_date: hiringDate } = employeeResult.rows[0];
      if (hiringDate && new Date(hiringDate) > new Date(new Date().toDateString())) {
        throw new EmploymentNotStartedError(hiringDate);
      }
```

Aggiungere `EmploymentNotStartedError` all'import esistente in cima al file (riga 14):
```js
const { NotFoundError, ValidationError, ForbiddenError, GeofenceError, ConflictError, EmploymentNotStartedError } = require('../utils/errors');
```

- [ ] **Step 4: Eseguire i test e verificare che passino tutti**

Run: `cd backend && npx jest src/__tests__/checkins-hiring-date.test.js`
Expected: PASS su tutti e 3

- [ ] **Step 5: Eseguire l'intera suite checkins per non-regressione**

Run: `cd backend && npx jest src/__tests__/checkins`
Expected: tutti i test esistenti (geofence, active-employee, ownership, faceid, offline, ecc.) restano PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/checkins.js backend/src/__tests__/checkins-hiring-date.test.js
git commit -m "feat(backend): block check-in before hiring_date (EMPLOYMENT_NOT_STARTED)

hiring_date NULL or in the past never blocks — covers both legacy
employees (backfilled to created_at by migration 035) and employees
created via this endpoint before this feature (hiring_date never set)."
```

---

## Task 6: Frontend — campi nel form "Nuovo Dipendente"

**Files:**
- Modify: `frontend-web/src/features/admin/tabs/EmployeesTab.jsx`
- Test: `frontend-web/src/features/admin/tabs/EmployeesTab.test.jsx`

- [ ] **Step 1: Scrivere i test che falliscono**

Sostituire il mock di `useFetch` in `EmployeesTab.test.jsx` (righe 5-7) e aggiungere nuovi test:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmployeesTab } from './EmployeesTab';

const MOCK_CLIENTS = [{ id: 'client-1', name: 'Cliente Test' }];
const MOCK_SITES = [
  { id: 'site-1', client_id: 'client-1', name: 'Sede Torino' },
  { id: 'site-2', client_id: 'client-1', name: 'Sede Milano' },
];
const MOCK_EMPLOYEES = [
  { id: 'mgr-1', name: 'Manager Torino', role: 'manager', site_id: 'site-1', client_id: 'client-1' },
];

vi.mock('../components/useFetch', () => ({
  useFetch: (url) => {
    if (url.includes('/clients')) return { data: MOCK_CLIENTS, loading: false, error: null, reload: vi.fn() };
    if (url.includes('/sites')) return { data: MOCK_SITES, loading: false, error: null, reload: vi.fn() };
    return { data: MOCK_EMPLOYEES, loading: false, error: null, reload: vi.fn() };
  },
}));

vi.mock('../hooks/useEmployeeSync', () => ({
  useEmployeeSync: () => ({
    downloadTemplate: vi.fn(),
    preview: vi.fn(),
    apply: vi.fn(),
    exportHistory: vi.fn(),
    loading: false,
    error: null,
  }),
}));

describe('EmployeesTab', () => {
  it('no longer renders the legacy CSV import card', () => {
    render(<EmployeesTab />);
    expect(screen.queryByText(/importazione csv/i)).not.toBeInTheDocument();
  });

  it('renders the Aggiorna Dipendenti entry point', () => {
    render(<EmployeesTab />);
    expect(screen.getByText(/aggiorna dipendenti/i)).toBeInTheDocument();
  });

  it('renders the export storico completo button', () => {
    render(<EmployeesTab />);
    expect(screen.getByRole('button', { name: /esporta storico completo/i })).toBeInTheDocument();
  });

  it('renders Sede, Matricola, Data assunzione fields', () => {
    render(<EmployeesTab />);
    expect(screen.getByLabelText(/^sede$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/matricola/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/data assunzione/i)).toBeInTheDocument();
  });

  it('disables Manager di riferimento and shows a reason when role is manager', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);
    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));
    await user.click(screen.getByLabelText(/^ruolo$/i));
    await user.click(screen.getByRole('option', { name: 'Manager' }));

    expect(screen.getByLabelText(/manager di riferimento/i)).toBeDisabled();
    expect(screen.getByText(/i manager non hanno un manager di riferimento/i)).toBeInTheDocument();
  });

  it('disables Manager di riferimento with a hint until a Sede is chosen', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);
    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));

    expect(screen.getByLabelText(/manager di riferimento/i)).toBeDisabled();
    expect(screen.getByText(/seleziona prima una sede/i)).toBeInTheDocument();
  });

  it('shows a helper hint when the chosen Sede has no manager', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);
    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));
    await user.click(screen.getByLabelText(/^sede$/i));
    await user.click(screen.getByRole('option', { name: 'Sede Milano' }));

    expect(screen.getByText(/nessun manager assegnato a questa sede/i)).toBeInTheDocument();
  });

  it('enables Manager di riferimento with the site manager when a Sede with a manager is chosen', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);
    await user.click(screen.getByLabelText(/cliente/i));
    await user.click(screen.getByRole('option', { name: 'Cliente Test' }));
    await user.click(screen.getByLabelText(/^sede$/i));
    await user.click(screen.getByRole('option', { name: 'Sede Torino' }));

    expect(screen.getByLabelText(/manager di riferimento/i)).not.toBeDisabled();
    await user.click(screen.getByLabelText(/manager di riferimento/i));
    expect(screen.getByRole('option', { name: 'Manager Torino' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che i nuovi falliscano**

Run: `cd frontend-web && npx vitest run src/features/admin/tabs/EmployeesTab.test.jsx`
Expected: FAIL sui 5 nuovi test (campi non ancora presenti nel form).

- [ ] **Step 3: Implementare i nuovi campi**

In `frontend-web/src/features/admin/tabs/EmployeesTab.jsx`:

Estendere lo stato iniziale del form (riga 26-29):
```jsx
  const [form, setForm] = useState({
    client_id: '', email: '', name: '', phone: '',
    role: 'employee', site_id: '', password: '',
    external_employee_id: '', hiring_date: new Date().toISOString().slice(0, 10),
    manager_id: '',
  });
```

Dopo la riga `const clientSites = allSites.filter(...)` (riga 52), aggiungere il calcolo dei manager disponibili:
```jsx
  const availableManagers = employees.filter(
    (e) => e.role === 'manager' && e.site_id === form.site_id
  );
  const managerFieldDisabled = form.role === 'manager' || !form.site_id;
  const managerHelperText = form.role === 'manager'
    ? 'I manager non hanno un manager di riferimento'
    : !form.site_id
      ? 'Seleziona prima una sede'
      : availableManagers.length === 0
        ? 'Nessun manager assegnato a questa sede — puoi comunque creare il dipendente'
        : undefined;
```

Estendere `handleSubmit` (righe 59-67) per includere i nuovi campi nel payload:
```jsx
      const payload = {
        client_id: form.client_id,
        email: form.email,
        name: form.name,
        role: form.role,
        ...(form.phone && { phone: form.phone }),
        ...(form.role === 'manager' && form.site_id && { site_id: form.site_id }),
        ...(form.role === 'employee' && form.site_id && { site_id: form.site_id, assigned_sites: [form.site_id] }),
        ...(form.password && { password: form.password }),
        ...(form.external_employee_id && { external_employee_id: form.external_employee_id }),
        ...(form.hiring_date && { hiring_date: form.hiring_date }),
        ...(form.manager_id && { manager_id: form.manager_id }),
      };
```

Estendere il reset del form dopo submit riuscito (riga 76):
```jsx
      setForm({ ...form, email: '', name: '', phone: '', site_id: '', password: '', external_employee_id: '', manager_id: '' });
```

Nel JSX, sostituire il blocco `{form.role === 'manager' && (...)}` (righe 124-135) con la Sede sempre visibile (per employee E manager, come deciso nella spec) più i nuovi campi, subito dopo il `Select` Ruolo (riga 123) e prima del campo Password (riga 136):

```jsx
                <FormControl size="small" required sx={{ minWidth: 180 }}>
                  <InputLabel>Sede</InputLabel>
                  <Select
                    label="Sede" value={form.site_id}
                    onChange={(e) => setForm({ ...form, site_id: e.target.value, manager_id: '' })}
                  >
                    {clientSites.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                  </Select>
                </FormControl>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Matricola" fullWidth size="small"
                  value={form.external_employee_id}
                  onChange={(e) => setForm({ ...form, external_employee_id: e.target.value })}
                  error={form.external_employee_id !== '' && !/^[A-Za-z0-9]*$/.test(form.external_employee_id)}
                  helperText={
                    form.external_employee_id !== '' && !/^[A-Za-z0-9]*$/.test(form.external_employee_id)
                      ? 'Solo lettere e numeri'
                      : undefined
                  }
                />
                <TextField
                  label="Data assunzione" type="date" fullWidth size="small"
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: new Date().toISOString().slice(0, 10) }}
                  value={form.hiring_date}
                  onChange={(e) => setForm({ ...form, hiring_date: e.target.value })}
                />
                <FormControl size="small" sx={{ minWidth: 220 }} disabled={managerFieldDisabled}>
                  <InputLabel>Manager di riferimento</InputLabel>
                  <Select
                    label="Manager di riferimento" value={form.manager_id}
                    onChange={(e) => setForm({ ...form, manager_id: e.target.value })}
                  >
                    <MenuItem value="">— nessuno —</MenuItem>
                    {availableManagers.map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
                  </Select>
                  {managerHelperText && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
                      {managerHelperText}
                    </Typography>
                  )}
                </FormControl>
```

Nota: questo blocco chiude lo `Stack` esistente della riga Telefono/Ruolo/Password e ne apre uno nuovo (Matricola/Data assunzione/Manager) — la Sede resta nella prima riga insieme a Ruolo. Adattare l'indentazione JSX esatta durante l'implementazione per mantenere la struttura `<Stack>` bilanciata (aprire/chiudere correttamente i tag), verificando con il linter/build che non ci siano tag non chiusi.

Rimuovere il vecchio blocco condizionale "Sede gestita" (righe 124-135 originali) — è sostituito dal campo "Sede" sempre visibile sopra, che ora serve sia da sede gestita (manager) sia da sede di appartenenza (employee); la differenza di significato è gestita in `handleSubmit`, non nel rendering.

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `cd frontend-web && npx vitest run src/features/admin/tabs/EmployeesTab.test.jsx`
Expected: PASS su tutti gli 8 test (3 esistenti + 5 nuovi)

- [ ] **Step 5: Eseguire la suite frontend-web completa per non-regressione**

Run: `cd frontend-web && npx vitest run`
Expected: nessuna nuova regressione (confrontare il conteggio totale con quello pre-modifica)

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/features/admin/tabs/EmployeesTab.jsx frontend-web/src/features/admin/tabs/EmployeesTab.test.jsx
git commit -m "feat(frontend): add Sede/Matricola/Data assunzione/Manager fields to Nuovo Dipendente

Sede is now a single dropdown for both employee (maps to assigned_sites)
and manager (maps to site_id). Manager di riferimento is client-side
filtered from the already-loaded employees list — no extra fetch. Empty/
disabled states have explicit helper text instead of a silent empty
dropdown."
```

---

## Task 7: xlsx wizard — colonna `manager_email` nel template

**Files:**
- Modify: `backend/src/services/employeeSync/generateTemplate.js`
- Test: `backend/src/__tests__/employeeSync-generateTemplate.test.js` (verificare se esiste già con `ls backend/src/__tests__/ | grep -i generateTemplate`; se sì, aggiungere il test lì)

- [ ] **Step 1: Verificare se esiste già un file di test per `generateTemplate.js`**

Run: `ls backend/src/__tests__/ | grep -i generateTemplate`

Se esiste, aggiungere il test seguente in coda; altrimenti crearlo con questo contenuto minimo:

```js
const { generateTemplate } = require('../services/employeeSync/generateTemplate');
const ExcelJS = require('exceljs');

describe('generateTemplate — manager_email column', () => {
  it('includes manager_email header and resolves the manager email by manager_id', async () => {
    const employees = [
      { id: 'mgr-1', name: 'Manager Uno', email: 'manager@x.it', role: 'manager', site_id: 'site-1', assigned_sites: [], external_employee_id: null, hiring_date: null, manager_id: null },
      { id: 'emp-1', name: 'Dipendente Uno', email: 'dip@x.it', role: 'employee', site_id: null, assigned_sites: ['site-1'], external_employee_id: null, hiring_date: null, manager_id: 'mgr-1' },
    ];
    const sites = [{ id: 'site-1', name: 'Torino' }];

    const buffer = await generateTemplate({ employees, sites });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet('Dipendenti');
    const headers = ws.getRow(1).values.slice(1);
    expect(headers).toContain('manager_email');

    const managerEmailCol = headers.indexOf('manager_email') + 1;
    const dipRow = ws.getRow(3); // riga 1 = header, riga 2 = manager, riga 3 = dipendente
    expect(dipRow.getCell(managerEmailCol).value).toBe('manager@x.it');
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `cd backend && npx jest employeeSync-generateTemplate -t "manager_email"`
Expected: FAIL — colonna assente.

- [ ] **Step 3: Implementare**

In `backend/src/services/employeeSync/generateTemplate.js`:

```js
'use strict';

const ExcelJS = require('exceljs');

const DIP_HEADERS = ['nome_completo', 'email', 'telefono', 'ruolo', 'sede', 'matricola', 'stato', 'data_assunzione', 'data_uscita', 'manager_email'];
const SEDI_HEADERS = ['nome_sede', 'indirizzo', 'latitudine', 'longitudine', 'raggio_geofence_m'];
const ROLE_LABEL = { employee: 'dipendente', manager: 'responsabile' };

async function generateTemplate({ employees, sites }) {
  const wb = new ExcelJS.Workbook();

  const wsDip = wb.addWorksheet('Dipendenti');
  wsDip.addRow(DIP_HEADERS);
  const siteNameById = new Map(sites.map((s) => [s.id, s.name]));
  const managerEmailById = new Map(
    employees.filter((e) => e.role === 'manager').map((e) => [e.id, e.email])
  );
  for (const e of employees) {
    const primarySiteId = e.site_id || (e.assigned_sites && e.assigned_sites[0]) || null;
    wsDip.addRow([
      e.name, e.email, e.phone || '', ROLE_LABEL[e.role] || 'dipendente',
      siteNameById.get(primarySiteId) || '', e.external_employee_id || '',
      'Attivo', e.hiring_date || '', '',
      e.manager_id ? (managerEmailById.get(e.manager_id) || '') : '',
    ]);
  }

  const wsSedi = wb.addWorksheet('Sedi');
  wsSedi.addRow(SEDI_HEADERS);
  for (const s of sites) {
    wsSedi.addRow([s.name, s.location || '', s.latitude || '', s.longitude || '', s.geofence_radius_meters || '']);
  }

  return wb.xlsx.writeBuffer();
}

module.exports = { generateTemplate };
```

Nota: `manager_email` aggiunta in coda a `DIP_HEADERS` (dopo `data_uscita`), per retrocompatibilità con l'ordine colonne di file già scaricati in passato.

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `cd backend && npx jest employeeSync-generateTemplate -t "manager_email"`
Expected: PASS

- [ ] **Step 5: Eseguire l'intera suite generateTemplate per non-regressione**

Run: `cd backend && npx jest employeeSync-generateTemplate`
Expected: tutti PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/employeeSync/generateTemplate.js backend/src/__tests__/employeeSync-generateTemplate.test.js
git commit -m "feat(xlsx): add manager_email column to Dipendenti template

Appended at the end of DIP_HEADERS for backward compatibility with
already-downloaded templates."
```

---

## Task 8: xlsx wizard — parsing `manager_email`

**Files:**
- Modify: `backend/src/services/employeeSync/parseTemplate.js`
- Test: `backend/src/__tests__/employeeSync-parseTemplate.test.js` (esiste già — aggiungere test)

- [ ] **Step 1: Leggere il file di test esistente per capire il pattern esatto**

Run: `cat backend/src/__tests__/employeeSync-parseTemplate.test.js`

- [ ] **Step 2: Scrivere un test che fallisce, seguendo lo stesso pattern trovato**

Aggiungere un test che costruisce un buffer xlsx con la colonna `manager_email` valorizzata e verifica che `parseTemplate` la normalizzi come le altre colonne email (lowercase, trim, null se vuota) — usare `normEmail` come riferimento comportamentale (stessa funzione già usata per `email` del dipendente).

- [ ] **Step 3: Eseguire il test e verificare che fallisca**

Run: `cd backend && npx jest employeeSync-parseTemplate -t "manager_email"`
Expected: FAIL — `manager_email` non ancora nell'oggetto normalizzato restituito.

- [ ] **Step 4: Implementare**

In `backend/src/services/employeeSync/parseTemplate.js`, estendere il mapping `dipendenti` (righe 66-77):

```js
  const dipendenti = dipRows.map((d) => ({
    _row: d._row,
    nome_completo: norm(d.nome_completo),
    email: normEmail(d.email),
    telefono: norm(d.telefono),
    ruolo: (norm(d.ruolo) || '').toLowerCase() || null,
    sede: norm(d.sede),
    matricola: norm(d.matricola),
    stato: (norm(d.stato) || '').toLowerCase() || null,
    data_assunzione: normDate(d.data_assunzione),
    data_uscita: normDate(d.data_uscita),
    manager_email: normEmail(d.manager_email),
  }));
```

- [ ] **Step 5: Eseguire il test e verificare che passi**

Run: `cd backend && npx jest employeeSync-parseTemplate -t "manager_email"`
Expected: PASS

- [ ] **Step 6: Eseguire l'intera suite parseTemplate per non-regressione**

Run: `cd backend && npx jest employeeSync-parseTemplate`
Expected: tutti PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/employeeSync/parseTemplate.js backend/src/__tests__/employeeSync-parseTemplate.test.js
git commit -m "feat(xlsx): parse manager_email column (normalized like the employee email)"
```

---

## Task 9: xlsx wizard — validazione `manager_email`

**Files:**
- Modify: `backend/src/services/employeeSync/validate.js`
- Test: `backend/src/__tests__/employeeSync-validate.test.js` (verificare con `ls`; creare se assente)

- [ ] **Step 1: Verificare/creare il file di test**

Run: `ls backend/src/__tests__/ | grep -i "employeeSync-validate\|validate.test"`

Scrivere (nuovo file o aggiunta) test che falliscono:

```js
const { validateSyntax } = require('../services/employeeSync/validate');

function baseDip(overrides = {}) {
  return {
    _row: 2, nome_completo: 'Mario Rossi', email: 'mario@x.it', telefono: null,
    ruolo: 'dipendente', sede: 'Torino', matricola: null, stato: 'attivo',
    data_assunzione: null, data_uscita: null, manager_email: null,
    ...overrides,
  };
}
const sedi = [{ _row: 2, nome_sede: 'Torino' }];

describe('validateSyntax — manager_email', () => {
  it('accepts a manager_email matching an existing manager in DB', () => {
    const errors = validateSyntax(
      { dipendenti: [baseDip({ manager_email: 'capo@x.it' })], sedi },
      { existingManagerEmails: new Set(['capo@x.it']) }
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects a manager_email not matching any existing manager', () => {
    const errors = validateSyntax(
      { dipendenti: [baseDip({ manager_email: 'sconosciuto@x.it' })], sedi },
      { existingManagerEmails: new Set(['capo@x.it']) }
    );
    expect(errors.some((e) => e.includes('sconosciuto@x.it'))).toBe(true);
  });

  it('allows an empty manager_email (optional field)', () => {
    const errors = validateSyntax(
      { dipendenti: [baseDip({ manager_email: null })], sedi },
      { existingManagerEmails: new Set() }
    );
    expect(errors).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `cd backend && npx jest employeeSync-validate -t "manager_email"`
Expected: FAIL — `validateSyntax` non accetta ancora un secondo argomento, nessuna validazione su `manager_email`.

- [ ] **Step 3: Implementare**

In `backend/src/services/employeeSync/validate.js`:

```js
'use strict';

const { ROLE_MAP } = require('../onboarding/parseWorkbook');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATI = ['attivo', 'inattivo'];

function validateSyntax(data, { existingManagerEmails = new Set() } = {}) {
  const errors = [];
  const sedeNames = new Set((data.sedi || []).map((s) => s.nome_sede));
  const seenEmail = new Set();
  const seenMatricola = new Set();

  for (const d of data.dipendenti || []) {
    const at = `Foglio Dipendenti riga ${d._row}`;
    if (!d.nome_completo) errors.push(`${at}: nome_completo obbligatorio.`);
    if (!d.email) errors.push(`${at}: email obbligatoria.`);
    else {
      if (!EMAIL_RE.test(d.email)) errors.push(`${at}: email "${d.email}" non valida.`);
      if (seenEmail.has(d.email)) errors.push(`${at}: email "${d.email}" duplicata nel file.`);
      seenEmail.add(d.email);
    }
    if (d.matricola) {
      if (seenMatricola.has(d.matricola)) errors.push(`${at}: Matricola "${d.matricola}" duplicata nel file.`);
      seenMatricola.add(d.matricola);
    }
    if (!d.ruolo || !ROLE_MAP[d.ruolo]) errors.push(`${at}: ruolo deve essere "dipendente" o "responsabile" (trovato: ${d.ruolo || 'vuoto'}).`);
    if (!d.sede) errors.push(`${at}: sede obbligatoria.`);
    else if (!sedeNames.has(d.sede)) errors.push(`${at}: sede "${d.sede}" non corrisponde a nessun nome_sede del foglio Sedi.`);
    if (!d.stato || !VALID_STATI.includes(d.stato)) {
      errors.push(`${at}: stato deve essere "Attivo" o "Inattivo" (trovato: ${d.stato || 'vuoto'}).`);
    }
    // manager_email è facoltativo, ma se presente deve corrispondere a un
    // manager GIÀ esistente in DB per questo cliente — un manager creato
    // nello stesso file non è risolvibile in questo passaggio (il suo id
    // non esiste ancora al momento del calcolo diff), limitazione nota.
    if (d.manager_email && !existingManagerEmails.has(d.manager_email)) {
      errors.push(`${at}: manager_email "${d.manager_email}" non corrisponde a nessun manager esistente per questo cliente.`);
    }
  }

  return errors;
}

module.exports = { validateSyntax };
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `cd backend && npx jest employeeSync-validate -t "manager_email"`
Expected: PASS

- [ ] **Step 5: Eseguire l'intera suite validate per non-regressione**

Run: `cd backend && npx jest employeeSync-validate`
Expected: tutti PASS (il secondo argomento è opzionale con default `{}` → tutte le chiamate esistenti con un solo argomento continuano a funzionare)

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/employeeSync/validate.js backend/src/__tests__/employeeSync-validate.test.js
git commit -m "feat(xlsx): validate manager_email against existing managers

Optional param existingManagerEmails (default empty Set) keeps the
function signature backward compatible with existing callers."
```

---

## Task 10: xlsx wizard — passare `existingManagerEmails` dalla route

**Files:**
- Modify: `backend/src/routes/admin/employeeSync.js:63-83`
- Test: `backend/src/__tests__/admin-employeeSync-preview.test.js` (esistente — aggiungere test)

- [ ] **Step 1: Leggere il file di test esistente per il pattern esatto**

Run: `cat backend/src/__tests__/admin-employeeSync-preview.test.js`

- [ ] **Step 2: Scrivere un test che fallisce**

Nello stesso pattern del file esistente (upload di un xlsx costruito al volo con ExcelJS verso `/api/v1/admin/employee-sync/preview`), aggiungere un caso: un file con una riga che ha `manager_email` valorizzato con un'email che NON corrisponde a nessun manager esistente nel DB di test → verificare che la risposta di preview includa un errore di validazione che menzioni quell'email (stesso canale già usato per gli altri errori di `validateSyntax`, verificare il campo esatto della risposta leggendo un test esistente per errori di validazione, es. sede inesistente).

- [ ] **Step 3: Eseguire il test e verificare che fallisca**

Run: `cd backend && npx jest admin-employeeSync-preview -t "manager_email"`
Expected: FAIL — la route non passa ancora `existingManagerEmails`, quindi nessun manager viene mai riconosciuto come valido/invalido (dipende dal comportamento di default del Task 9 — con `existingManagerEmails` vuoto di default, ogni email verrebbe rifiutata: verificare che il test rifletta questo, oppure che sia strutturato per far emergere la mancata integrazione in altro modo, es. un manager_email valido rifiutato per errore).

- [ ] **Step 4: Implementare**

In `backend/src/routes/admin/employeeSync.js`, riordinare `runPreviewDiff` (righe 63-83) per fetchare `dbEmployees` PRIMA di `validateSyntax`, così da poter costruire `existingManagerEmails`:

```js
async function runPreviewDiff(buffer, clientId, db = pool, { createSites = false } = {}) {
  let data;
  try {
    data = await parseTemplate(buffer);
  } catch (parseErr) {
    return { errors: ['Il file caricato non è un file Excel (.xlsx) valido.'], diff: null, data: null };
  }

  // Scope del wizard: solo personale operativo legato a una sede (employee/manager).
  // Admin e viewer non hanno assegnazione di sede e sono gestiti altrove in Admin.
  // Fetchato PRIMA di validateSyntax (non dopo, come in origine) perché serve
  // anche per validare manager_email — stesso identico dato, zero query aggiuntive.
  const dbEmployees = (await db.query(
    'SELECT * FROM employees WHERE client_id = $1::uuid AND role IN (\'employee\', \'manager\')',
    [clientId]
  )).rows;
  const existingManagerEmails = new Set(
    dbEmployees.filter((e) => e.role === 'manager').map((e) => e.email)
  );

  const errors = validateSyntax(data, { existingManagerEmails });
  if (errors.length > 0) return { errors, diff: null, data: null };

  const siteIdByName = await resolveSiteIdByName(db, data.sedi, clientId, { create: createSites });

  const diff = computeDiff(data.dipendenti, dbEmployees, siteIdByName);
  return { errors: [], diff, data };
}
```

- [ ] **Step 5: Eseguire il test e verificare che passi**

Run: `cd backend && npx jest admin-employeeSync-preview -t "manager_email"`
Expected: PASS

- [ ] **Step 6: Eseguire l'intera suite employeeSync per non-regressione**

Run: `cd backend && npx jest employeeSync admin-employeeSync`
Expected: tutti PASS (il riordino non cambia alcun comportamento osservabile per i test esistenti — `dbEmployees` viene semplicemente calcolato prima anziché dopo)

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/admin/employeeSync.js backend/src/__tests__/admin-employeeSync-preview.test.js
git commit -m "refactor(xlsx): fetch dbEmployees before validateSyntax to validate manager_email

Reordering only — same query, same data, now also feeds
existingManagerEmails into validateSyntax."
```

---

## Task 11: xlsx wizard — risoluzione `manager_email`→`manager_id` in `computeDiff`

**Files:**
- Modify: `backend/src/services/employeeSync/computeDiff.js`
- Test: `backend/src/__tests__/employeeSync-computeDiff.test.js` (esistente — aggiungere test)

- [ ] **Step 1: Scrivere test che falliscono, seguendo il pattern esistente del file**

Aggiungere in `employeeSync-computeDiff.test.js` (stesso stile di `dbEmp`/`fileRow` già presenti nel file):

```js
describe('computeDiff — manager_email resolution', () => {
  const dbWithManager = [
    { id: 'mgr-1', email: 'capo@x.it', name: 'Capo', phone: null, role: 'manager', site_id: 'site-torino', assigned_sites: [], active: true, hiring_date: null, exit_date: null, external_employee_id: null, manager_id: null },
  ];

  it('resolves manager_email to manager_id for a new employee', () => {
    const diff = computeDiff(
      [fileRow({ email: 'nuovo@x.it', nome_completo: 'Nuovo', manager_email: 'capo@x.it' })],
      dbWithManager,
      siteIdByName
    );
    expect(diff.nuovi[0].manager_id).toBe('mgr-1');
  });

  it('leaves manager_id null when manager_email is empty', () => {
    const diff = computeDiff(
      [fileRow({ email: 'nuovo@x.it', nome_completo: 'Nuovo', manager_email: null })],
      dbWithManager,
      siteIdByName
    );
    expect(diff.nuovi[0].manager_id).toBeNull();
  });

  it('detects a manager change as "modificato"', () => {
    const db = [dbEmp({ manager_id: null }), ...dbWithManager];
    const diff = computeDiff([fileRow({ manager_email: 'capo@x.it' })], db, siteIdByName);
    expect(diff.modificati).toHaveLength(1);
    expect(diff.modificati[0].changes.manager_id).toEqual({ from: null, to: 'mgr-1' });
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `cd backend && npx jest employeeSync-computeDiff -t "manager_email resolution"`
Expected: FAIL — `manager_id` non calcolato né in `nuovi` né in `changes`.

- [ ] **Step 3: Implementare**

In `backend/src/services/employeeSync/computeDiff.js`:

Aggiungere `manager_id` a `FIELD_COMPARATORS`? No — richiede il map `managerIdByEmail`, quindi va gestito come `site_id` (caso speciale in `computeFieldChanges`, non nel dizionario di comparator puri). Sostituire `computeFieldChanges` e `computeDiff`:

```js
function computeFieldChanges(dbRow, row, siteId, siteNameById, managerIdByEmail) {
  const changes = {};
  const currentSiteId = dbRow.site_id || (dbRow.assigned_sites && dbRow.assigned_sites[0]) || null;
  if (currentSiteId !== siteId) {
    changes.site_id = {
      from: currentSiteId,
      to: siteId,
      fromName: currentSiteId ? siteNameById.get(currentSiteId) || null : null,
      toName: siteId ? siteNameById.get(siteId) || null : null,
    };
  }
  const newManagerId = row.manager_email ? (managerIdByEmail.get(row.manager_email) || null) : null;
  if ((dbRow.manager_id || null) !== newManagerId) {
    changes.manager_id = { from: dbRow.manager_id || null, to: newManagerId };
  }
  for (const [field, differs] of Object.entries(FIELD_COMPARATORS)) {
    if (differs(dbRow, row)) {
      const toValue = field === 'role' ? ROLE_MAP[row.ruolo] : row[FILE_FIELD_BY_DB_FIELD[field]];
      changes[field] = { from: dbRow[field], to: toValue };
    }
  }
  return changes;
}

function computeDiff(fileRows, dbEmployees, siteIdByName) {
  const nuovi = [];
  const riattivati = [];
  const rimossi = [];
  const modificati = [];
  const anomalie = [];

  const siteNameById = new Map([...siteIdByName].map(([name, id]) => [id, name]));
  const managerIdByEmail = new Map(
    dbEmployees.filter((e) => e.role === 'manager').map((e) => [e.email, e.id])
  );

  const dbByEmail = new Map(dbEmployees.map((e) => [e.email, e]));
  const seenEmails = new Set();

  for (const row of fileRows) {
    seenEmails.add(row.email);
    const dbRow = dbByEmail.get(row.email);
    const fileActive = (row.stato || '').toLowerCase() === 'attivo';
    const siteId = siteIdByName.get(row.sede) || null;

    if (!dbRow) {
      if (fileActive) {
        nuovi.push({
          email: row.email,
          name: row.nome_completo,
          phone: row.telefono,
          role: ROLE_MAP[row.ruolo],
          site_id: siteId,
          external_employee_id: row.matricola,
          hiring_date: row.data_assunzione || new Date().toISOString().slice(0, 10),
          manager_id: row.manager_email ? (managerIdByEmail.get(row.manager_email) || null) : null,
        });
      }
      continue;
    }

    if (!dbRow.active && fileActive) {
      riattivati.push({
        id: dbRow.id,
        email: row.email,
        hiring_date: dbRow.hiring_date,
        exit_date: null,
        changes: computeFieldChanges(dbRow, row, siteId, siteNameById, managerIdByEmail),
      });
      continue;
    }

    if (dbRow.active && !fileActive) {
      rimossi.push({
        id: dbRow.id,
        email: row.email,
        exit_date: row.data_uscita || new Date().toISOString().slice(0, 10),
      });
      continue;
    }

    if (!dbRow.active && !fileActive) continue;

    const changes = computeFieldChanges(dbRow, row, siteId, siteNameById, managerIdByEmail);
    if (Object.keys(changes).length > 0) {
      modificati.push({ id: dbRow.id, email: row.email, changes });
    }
  }

  for (const dbRow of dbEmployees) {
    if (dbRow.active && !seenEmails.has(dbRow.email)) {
      anomalie.push({ id: dbRow.id, email: dbRow.email, name: dbRow.name });
    }
  }

  return { nuovi, riattivati, rimossi, modificati, anomalie };
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `cd backend && npx jest employeeSync-computeDiff -t "manager_email resolution"`
Expected: PASS

- [ ] **Step 5: Eseguire l'intera suite computeDiff per non-regressione**

Run: `cd backend && npx jest employeeSync-computeDiff`
Expected: tutti PASS (il campo `dbEmp()`/`fileRow()` helper esistenti non hanno `manager_email`/`manager_id` — verificare che restino `undefined`/assenti senza rompere nulla: `undefined !== null` è `true`, quindi attenzione — se un test esistente costruisce `dbEmp()` senza `manager_id`, `dbRow.manager_id` sarà `undefined`, non `null`; `(dbRow.manager_id || null)` normalizza correttamente `undefined`→`null`, quindi nessuna regressione attesa, ma verificare comunque l'esecuzione reale)

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/employeeSync/computeDiff.js backend/src/__tests__/employeeSync-computeDiff.test.js
git commit -m "feat(xlsx): resolve manager_email to manager_id in computeDiff

Zero extra queries — managerIdByEmail built from dbEmployees, already
fetched once per preview/apply call."
```

---

## Task 12: xlsx wizard — `manager_id` nell'INSERT dei nuovi dipendenti

**Files:**
- Modify: `backend/src/services/employeeSync/applyDiff.js:39-54`
- Test: `backend/src/__tests__/employeeSync-applyDiff.test.js` (esistente — aggiungere test)

- [ ] **Step 1: Leggere il file di test esistente per il pattern esatto**

Run: `cat backend/src/__tests__/employeeSync-applyDiff.test.js`

- [ ] **Step 2: Scrivere un test che fallisce, seguendo lo stesso pattern (mock `db.query`)**

Aggiungere un test che verifica: un elemento in `diff.nuovi` con `manager_id: 'mgr-1'` produce una query INSERT il cui array di parametri include `'mgr-1'`.

- [ ] **Step 3: Eseguire il test e verificare che fallisca**

Run: `cd backend && npx jest employeeSync-applyDiff -t "manager_id"`
Expected: FAIL — `manager_id` non ancora nella colonna INSERT.

- [ ] **Step 4: Implementare**

In `backend/src/services/employeeSync/applyDiff.js`, estendere il blocco `for (const n of diff.nuovi)` (righe 42-54):

```js
  for (const n of diff.nuovi) {
    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const ins = await db.query(
      `INSERT INTO employees (client_id, email, name, phone, role, site_id, password_hash, assigned_sites, external_employee_id, hiring_date, manager_id, active, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::UUID[], $9, $10, $11, true, true) RETURNING id`,
      [clientId, n.email, n.name, n.phone || null, n.role, n.site_id, passwordHash,
        n.site_id ? [n.site_id] : [], n.external_employee_id || null, n.hiring_date, n.manager_id || null]
    );
    credentials.push({ id: ins.rows[0].id, email: n.email, name: n.name, password: tempPassword });
    await logAudit(db, { action: 'employee_sync_create', entity: 'employee', entityId: ins.rows[0].id,
      oldValue: null, newValue: { email: n.email, name: n.name }, userId: 'system' });
  }
```

Nota: il ramo "modificati"/"riattivati" (`buildFieldSetClause`) non richiede modifiche — gestisce già `manager_id` genericamente come qualunque altro campo in `changes` non speciale (stesso meccanismo già usato per `phone`/`external_employee_id`), essendo stato aggiunto in `computeFieldChanges` nel Task 11.

- [ ] **Step 5: Eseguire il test e verificare che passi**

Run: `cd backend && npx jest employeeSync-applyDiff -t "manager_id"`
Expected: PASS

- [ ] **Step 6: Eseguire l'intera suite applyDiff per non-regressione**

Run: `cd backend && npx jest employeeSync-applyDiff`
Expected: tutti PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/employeeSync/applyDiff.js backend/src/__tests__/employeeSync-applyDiff.test.js
git commit -m "feat(xlsx): include manager_id when inserting new employees via the sync wizard

Update/reactivation paths already handle manager_id generically through
buildFieldSetClause — no change needed there."
```

---

## Task 13: Verifica finale end-to-end

**Files:** nessuno — solo esecuzione

- [ ] **Step 1: Applicare la migration 040 anche sul DB di test, se non già fatto nel Task 1**

Run: `cd backend && node scripts/run-migrations.js`
Expected: nessun errore, `040_add_manager_id_to_employees.sql` risulta applicata (idempotente — `IF NOT EXISTS`, rieseguibile senza danni)

- [ ] **Step 2: Suite backend completa**

Run: `cd backend && npm test`
Expected: tutti i test PASS, incluso ogni file toccato in questo piano

- [ ] **Step 3: Lint backend**

Run: `cd backend && npm run lint`
Expected: 0 errori

- [ ] **Step 4: Suite frontend-web completa**

Run: `cd frontend-web && npx vitest run`
Expected: tutti i test PASS

- [ ] **Step 5: Verifica manuale rapida in locale (facoltativa ma consigliata prima del deploy)**

Avviare backend+frontend in locale, aprire il pannello Admin → Dipendenti → Nuovo Dipendente: creare un manager su una sede, poi un dipendente sulla stessa sede verificando che il dropdown Manager lo mostri; provare a creare un secondo dipendente con la stessa matricola e verificare il messaggio di errore "Matricola già in uso"; scaricare il template xlsx e verificare la colonna `manager_email` valorizzata per il dipendente appena creato.

- [ ] **Step 6: Nessun commit in questo task** — solo verifica, i commit sono già stati fatti task per task.

---

Non è previsto un deploy automatico in questo piano — il progetto lavora a push diretto su `main` (nessun flusso PR), ma l'esecuzione (worktree/branch, merge finale) resta a discrezione della skill di esecuzione scelta (`subagent-driven-development` o `executing-plans`), non di questo piano.
