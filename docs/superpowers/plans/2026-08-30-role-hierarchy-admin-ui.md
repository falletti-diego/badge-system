# Admin UI per la gerarchia ruoli (Senior Manager / Director) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estendere il pannello admin (form "Nuovo Dipendente" + tabella dipendenti) per creare e promuovere `senior_manager`/`director` con `reports_to_id`, colmando il gap backend-only lasciato da Session 116-117.

**Architecture:** Backend — un nuovo endpoint stretto `PATCH /api/admin/employees/:id/role` (solo promozioni) + estensione della `SELECT` di `GET /api/admin/employees` per includere `reports_to_id`, riusando la validazione `reports_to_id` già scritta per `POST /` tramite un helper condiviso. Frontend — estensione del form di creazione in `EmployeesTab.jsx` (dropdown, nuovo campo "Approvatore richieste personali") + un nuovo componente `ChangeRoleDialog.jsx` per l'azione di modifica, seguendo esattamente i pattern già stabiliti da `ResetPasswordDialog.jsx`/`ConfirmDeleteDialog.jsx`.

**Tech Stack:** Node.js/Express/Zod/PostgreSQL (backend), React/MUI/Vitest+RTL (frontend). Spec di riferimento: `docs/superpowers/specs/2026-08-30-role-hierarchy-admin-ui-design.md`.

---

## Task 1: Backend — fattorizzare la validazione `reports_to_id` in un helper condiviso

Refactor puro, nessun nuovo comportamento — prerequisito per Task 3 (Pattern 4 di `CLAUDE.md`, no duplicazione). Il comportamento di `POST /` deve restare bit-a-bit identico.

**Files:**
- Modify: `backend/src/routes/admin/employees.js`
- Test: `backend/src/__tests__/admin-employees-role-hierarchy.test.js` (esistente — usata per verificare la non-regressione)

- [ ] **Step 1: Verificare che la suite esistente sia verde prima di toccare nulla**

Run: `cd backend && npx jest src/__tests__/admin-employees-role-hierarchy.test.js src/__tests__/admin-employees-create-fields.test.js --silent`
Expected: PASS, tutti i test verdi (baseline pre-refactor).

- [ ] **Step 2: Estrarre `validateReportsTo` come funzione di modulo, sopra `router.post('/', ...)`**

In `backend/src/routes/admin/employees.js`, subito dopo `generateTempPassword()`:

```js
/**
 * Valida reports_to_id: deve puntare a un dipendente attivo dello stesso
 * client, con role_level strettamente superiore a ownLevel — altrimenti la
 * catena di approvazione sarebbe invertita o piatta. Se excludeId è passato
 * (solo dal PATCH — alla creazione è strutturalmente impossibile, un
 * dipendente nuovo non può ancora essere il reports_to_id di nessuno),
 * rifiuta anche un ciclo diretto: l'approvatore scelto riporta già a
 * excludeId. Lancia InvalidReportsToAssignmentError — il chiamante ha un
 * try/catch che inoltra a next(err), mai un valore di ritorno "false".
 */
async function validateReportsTo({ reportsToId, clientId, ownLevel, excludeId = null }) {
  if (!reportsToId) return;
  const approverCheck = await pool.query(
    'SELECT id, role, reports_to_id FROM employees WHERE id = $1 AND client_id = $2 AND active = true',
    [reportsToId, clientId]
  );
  if (approverCheck.rowCount === 0) {
    throw new InvalidReportsToAssignmentError();
  }
  const approverLevel = getRoleLevel(approverCheck.rows[0].role);
  if (approverLevel <= ownLevel) {
    throw new InvalidReportsToAssignmentError(
      'reports_to_id must point to a strictly higher-level role than this employee'
    );
  }
  if (excludeId && approverCheck.rows[0].reports_to_id === excludeId) {
    throw new InvalidReportsToAssignmentError(
      'reports_to_id would create a cycle — that employee already reports to this one'
    );
  }
}
```

- [ ] **Step 3: Sostituire il blocco inline in `POST /` con una chiamata all'helper**

Nello stesso file, dentro `router.post('/', ...)`, sostituire:

```js
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

con:

```js
    await validateReportsTo({
      reportsToId: data.reports_to_id,
      clientId: targetClientId,
      ownLevel: getRoleLevel(data.role),
    });
```

(Il blocco resta dentro il `try` esistente della route — se `validateReportsTo` lancia, viene catturato dal `catch (err) { ... next(err); }` già presente in fondo alla route, comportamento identico a prima.)

- [ ] **Step 4: Rieseguire la suite per confermare zero regressioni**

Run: `cd backend && npx jest src/__tests__/admin-employees-role-hierarchy.test.js src/__tests__/admin-employees-create-fields.test.js --silent`
Expected: PASS, stessi test verdi di Step 1, nessuna differenza.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin/employees.js
git commit -m "refactor: extract validateReportsTo helper in admin/employees.js (no behavior change)"
```

---

## Task 2: Backend — schema Zod per `PATCH /:id/role`

**Files:**
- Modify: `backend/src/middleware/validation.js`

- [ ] **Step 1: Aggiungere `AdminEmployeeRolePatchSchema` subito dopo `AdminEmployeeSchema`**

In `backend/src/middleware/validation.js`, dopo la chiusura di `AdminEmployeeSchema` (dopo il blocco dei tre `.refine(...)`):

```js
// =====================================================
// ADMIN — PATCH /api/admin/employees/:id/role
// Solo promozioni (mai 'manager' come target — richiederebbe site_id, fuori
// scope, vedi design spec 2026-08-30). La validazione "il target deve essere
// strettamente superiore al ruolo ATTUALE del dipendente" dipende dal ruolo
// corrente in DB, non validabile qui — applicata nella route.
// =====================================================

const AdminEmployeeRolePatchSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid employee id: must be valid UUID'),
  }),
  body: z.object({
    role: z.enum(['senior_manager', 'director'], {
      errorMap: () => ({ message: 'role must be senior_manager or director' }),
    }),
    reports_to_id: z.string().uuid('reports_to_id must be a valid UUID').optional().nullable(),
  }),
});
```

- [ ] **Step 2: Esportare il nuovo schema**

Nello stesso file, nel `module.exports` finale, aggiungere `AdminEmployeeRolePatchSchema,` subito dopo `AdminEmployeeSchema,`.

- [ ] **Step 3: Verificare che il file non abbia errori di sintassi**

Run: `cd backend && node -e "require('./src/middleware/validation.js')" && echo OK`
Expected: `OK` stampato, nessun errore di require.

- [ ] **Step 4: Commit**

```bash
git add backend/src/middleware/validation.js
git commit -m "feat: add AdminEmployeeRolePatchSchema for PATCH /admin/employees/:id/role"
```

---

## Task 3: Backend — endpoint `PATCH /api/admin/employees/:id/role`

**Files:**
- Modify: `backend/src/routes/admin/employees.js`
- Test: `backend/src/__tests__/admin-employees-role-hierarchy.test.js`

- [ ] **Step 1: Scrivere i test che falliscono (route non esiste ancora)**

Aggiungere in fondo a `backend/src/__tests__/admin-employees-role-hierarchy.test.js`, dopo la costante `SENIOR_ID` esistente, una nuova costante e un nuovo blocco `describe`:

```js
const MANAGER_ID = '550e8400-e29b-41d4-a716-446655440202';
```

(subito sotto `const SENIOR_ID = ...`, riga 30)

Poi, in fondo al file, dopo l'ultimo `});` che chiude `describe('POST /api/admin/employees — role hierarchy', ...)`:

```js

describe('PATCH /api/admin/employees/:id/role', () => {
  it('promotes a manager to senior_manager with no reports_to_id', async () => {
    mockQueryDispatch([
      ['FROM EMPLOYEES', (params) => {
        if (params.includes(MANAGER_ID)) return { rows: [{ id: MANAGER_ID, role: 'manager', reports_to_id: null }] };
        return { rows: [] };
      }],
      ['UPDATE EMPLOYEES', () => ({
        rows: [{ id: MANAGER_ID, client_id: CLIENT_ID, name: 'Mgr', email: 'mgr@test.local', role: 'senior_manager', reports_to_id: null }],
      })],
    ]);

    const res = await request(app)
      .patch(`/api/admin/employees/${MANAGER_ID}/role`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'senior_manager' });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('senior_manager');
  });

  it('promotes a manager directly to director (skip-level)', async () => {
    mockQueryDispatch([
      ['FROM EMPLOYEES', (params) => {
        if (params.includes(MANAGER_ID)) return { rows: [{ id: MANAGER_ID, role: 'manager', reports_to_id: null }] };
        return { rows: [] };
      }],
      ['UPDATE EMPLOYEES', () => ({
        rows: [{ id: MANAGER_ID, client_id: CLIENT_ID, name: 'Mgr', email: 'mgr@test.local', role: 'director', reports_to_id: null }],
      })],
    ]);

    const res = await request(app)
      .patch(`/api/admin/employees/${MANAGER_ID}/role`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'director' });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('director');
  });

  it('promotes a senior_manager to director with a valid reports_to_id', async () => {
    mockQueryDispatch([
      ['FROM EMPLOYEES', (params) => {
        if (params.includes(SENIOR_ID) && params.length === 2) return { rows: [{ id: SENIOR_ID, role: 'senior_manager', reports_to_id: null }] };
        if (params.includes(DIRECTOR_ID)) return { rows: [{ id: DIRECTOR_ID, role: 'director', reports_to_id: null }] };
        return { rows: [] };
      }],
      ['UPDATE EMPLOYEES', () => ({
        rows: [{ id: SENIOR_ID, client_id: CLIENT_ID, name: 'SM', email: 'sm@test.local', role: 'director', reports_to_id: DIRECTOR_ID }],
      })],
    ]);

    const res = await request(app)
      .patch(`/api/admin/employees/${SENIOR_ID}/role`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'director', reports_to_id: DIRECTOR_ID });

    expect(res.status).toBe(200);
    expect(res.body.data.reports_to_id).toBe(DIRECTOR_ID);
  });

  it('rejects role "manager" as a target (schema-level, never a valid promotion target)', async () => {
    const res = await request(app)
      .patch(`/api/admin/employees/${MANAGER_ID}/role`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'manager' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('rejects a non-promotion (senior_manager targeting senior_manager, same level)', async () => {
    mockQueryDispatch([
      ['FROM EMPLOYEES', () => ({ rows: [{ id: SENIOR_ID, role: 'senior_manager', reports_to_id: null }] })],
    ]);

    const res = await request(app)
      .patch(`/api/admin/employees/${SENIOR_ID}/role`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'senior_manager' });

    expect(res.status).toBe(400);
    expect(res.body.details?.code).toBe('ROLE_NOT_A_PROMOTION');
  });

  it('rejects changing role for a director (no valid promotion from here)', async () => {
    mockQueryDispatch([
      ['FROM EMPLOYEES', () => ({ rows: [{ id: DIRECTOR_ID, role: 'director', reports_to_id: null }] })],
    ]);

    const res = await request(app)
      .patch(`/api/admin/employees/${DIRECTOR_ID}/role`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'senior_manager' });

    expect(res.status).toBe(400);
    expect(res.body.details?.code).toBe('ROLE_CHANGE_NOT_ALLOWED');
  });

  it('returns 404 for a non-existent or cross-tenant employee id', async () => {
    mockQueryDispatch([
      ['FROM EMPLOYEES', () => ({ rows: [] })],
    ]);

    const res = await request(app)
      .patch(`/api/admin/employees/${MANAGER_ID}/role`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'senior_manager' });

    expect(res.status).toBe(404);
  });

  it('rejects a reports_to_id that would create a cycle', async () => {
    mockQueryDispatch([
      ['FROM EMPLOYEES', (params) => {
        if (params.includes(MANAGER_ID) && params.length === 2) return { rows: [{ id: MANAGER_ID, role: 'manager', reports_to_id: null }] };
        // L'approvatore scelto (SENIOR_ID) riporta già a MANAGER_ID — la
        // riga che si sta modificando — un ciclo diretto a due.
        if (params.includes(SENIOR_ID)) return { rows: [{ id: SENIOR_ID, role: 'senior_manager', reports_to_id: MANAGER_ID }] };
        return { rows: [] };
      }],
    ]);

    const res = await request(app)
      .patch(`/api/admin/employees/${MANAGER_ID}/role`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'senior_manager', reports_to_id: SENIOR_ID });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cycle/);
  });

  it('forces reports_to_id to null when target role is director, even if the body sends one', async () => {
    mockQueryDispatch([
      ['FROM EMPLOYEES', (params) => {
        if (params.includes(SENIOR_ID) && params.length === 2) return { rows: [{ id: SENIOR_ID, role: 'senior_manager', reports_to_id: null }] };
        return { rows: [] };
      }],
      ['UPDATE EMPLOYEES', (params) => ({
        rows: [{ id: SENIOR_ID, client_id: CLIENT_ID, name: 'SM', email: 'sm@test.local', role: 'director', reports_to_id: params[1] }],
      })],
    ]);

    const res = await request(app)
      .patch(`/api/admin/employees/${SENIOR_ID}/role`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ role: 'director', reports_to_id: DIRECTOR_ID }); // deve essere ignorato

    expect(res.status).toBe(200);
    expect(res.body.data.reports_to_id).toBeNull();
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano (route non esiste)**

Run: `cd backend && npx jest src/__tests__/admin-employees-role-hierarchy.test.js -t "PATCH /api/admin/employees" --silent`
Expected: FAIL — tutti con status 404 (route inesistente) invece degli status attesi.

- [ ] **Step 3: Implementare la route**

In `backend/src/routes/admin/employees.js`, aggiungere dopo `router.post('/', ...)` e prima di `router.get('/', ...)`:

```js
router.patch('/:id/role', createValidationMiddleware(AdminEmployeeRolePatchSchema), async (req, res, next) => {
  try {
    const { id } = req.validated.params;
    const data = req.validated.body;
    const clientId = req.user.client_id;

    const currentResult = await pool.query(
      'SELECT id, role, reports_to_id FROM employees WHERE id = $1 AND client_id = $2 AND active = true',
      [id, clientId]
    );
    if (currentResult.rowCount === 0) {
      return next(new NotFoundError('Employee not found', 'EMPLOYEE_NOT_FOUND'));
    }
    const current = currentResult.rows[0];

    // Solo manager/senior_manager hanno una promozione valida da qui — un
    // director è il tappo terminale rispetto a questa azione (vedi design
    // spec 2026-08-30, "Solo promozioni, nessuna retrocessione").
    if (!['manager', 'senior_manager'].includes(current.role)) {
      return next(new ValidationError(
        "this employee's role cannot be changed via this action",
        { field: 'role', code: 'ROLE_CHANGE_NOT_ALLOWED' }
      ));
    }

    const currentLevel = getRoleLevel(current.role);
    const targetLevel = getRoleLevel(data.role);
    if (targetLevel <= currentLevel) {
      return next(new ValidationError(
        'role can only be promoted to a strictly higher level via this action',
        { field: 'role', code: 'ROLE_NOT_A_PROMOTION' }
      ));
    }

    // director non ha mai reports_to_id (è il tappo della gerarchia) —
    // azzerato lato server indipendentemente da cosa arriva nel body,
    // difesa in profondità oltre all'azzeramento automatico lato client.
    const reportsToId = data.role === 'director' ? null : (data.reports_to_id || null);

    await validateReportsTo({
      reportsToId,
      clientId,
      ownLevel: targetLevel,
      excludeId: id,
    });

    const result = await pool.query(
      `UPDATE employees SET role = $1, reports_to_id = $2
       WHERE id = $3 AND client_id = $4
       RETURNING id, client_id, name, email, role, reports_to_id`,
      [data.role, reportsToId, id, clientId]
    );
    const employee = result.rows[0];

    await logAudit(pool, {
      action: 'admin_change_employee_role',
      entity: 'employee',
      entityId: employee.id,
      clientId: employee.client_id,
      oldValue: { role: current.role, reports_to_id: current.reports_to_id },
      newValue: { role: employee.role, reports_to_id: employee.reports_to_id },
      userId: req.user.user_id,
    }).catch(() => {});

    logger.info({ action: 'admin_change_employee_role', employee_id: employee.id });
    res.json({ success: true, data: employee });
  } catch (err) {
    next(err);
  }
});
```

Aggiungere anche l'import dello schema in cima al file, nella riga già esistente:

```js
const { AdminEmployeeSchema, createValidationMiddleware } = require('../../middleware/validation');
```

diventa:

```js
const { AdminEmployeeSchema, AdminEmployeeRolePatchSchema, createValidationMiddleware } = require('../../middleware/validation');
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `cd backend && npx jest src/__tests__/admin-employees-role-hierarchy.test.js --silent`
Expected: PASS, tutti i test del file (POST esistenti + i nuovi PATCH) verdi.

- [ ] **Step 5: Lint**

Run: `cd backend && npm run lint`
Expected: 0 errori (warning preesistenti ammessi, nessuno nuovo su `admin/employees.js`).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/admin/employees.js backend/src/__tests__/admin-employees-role-hierarchy.test.js
git commit -m "feat: add PATCH /api/admin/employees/:id/role (promotion-only, cycle-checked)"
```

---

## Task 4: Backend — `GET /api/admin/employees` include `reports_to_id`

**Files:**
- Modify: `backend/src/routes/admin/employees.js`
- Test: `backend/src/__tests__/admin-employees-scoping.test.js`

- [ ] **Step 1: Scrivere il test real-Postgres che fallisce**

Aggiungere in fondo a `backend/src/__tests__/admin-employees-scoping.test.js`, appena prima dell'ultimo `});` che chiude il `describe` principale:

```js

  it('GET /admin/employees: response includes reports_to_id', async () => {
    if (!dbAvailable) return;
    const directorResult = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites)
       VALUES ($1, $2, 'Director', 'director', '{}')
       RETURNING id`,
      [clientA, uniqueEmail('employees-scoping-director')]
    );
    const directorId = directorResult.rows[0].id;
    const smResult = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, reports_to_id)
       VALUES ($1, $2, 'Senior Manager', 'senior_manager', '{}', $3)
       RETURNING id`,
      [clientA, uniqueEmail('employees-scoping-sm'), directorId]
    );

    const token = tokenFor({ client_id: clientA, role: 'admin' });
    const res = await request(app)
      .get('/api/v1/admin/employees')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const smRow = res.body.data.find((e) => e.id === smResult.rows[0].id);
    expect(smRow).toBeDefined();
    expect(smRow.reports_to_id).toBe(directorId);
  });
```

(La pulizia è già garantita dall'`afterEach` esistente nel file, che cancella `clientA`/`clientB` e ne fa cascare l'eliminazione sui dipendenti.)

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `cd backend && npx jest src/__tests__/admin-employees-scoping.test.js -t "includes reports_to_id" --silent`
Expected: FAIL — `smRow.reports_to_id` è `undefined`, la colonna non è nella risposta.

- [ ] **Step 3: Estendere la SELECT**

In `backend/src/routes/admin/employees.js`, dentro `router.get('/', ...)`, modificare:

```js
      `SELECT e.id, e.client_id, e.email, e.name, e.role, e.phone,
              e.site_id, e.external_employee_id, e.created_at, c.name AS client_name,
              s.name AS site_name
```

in:

```js
      `SELECT e.id, e.client_id, e.email, e.name, e.role, e.phone,
              e.site_id, e.reports_to_id, e.external_employee_id, e.created_at, c.name AS client_name,
              s.name AS site_name
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `cd backend && npx jest src/__tests__/admin-employees-scoping.test.js --silent`
Expected: PASS, tutti i test del file (incluso quello nuovo).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin/employees.js backend/src/__tests__/admin-employees-scoping.test.js
git commit -m "feat: include reports_to_id in GET /api/admin/employees response"
```

---

## Task 5: Frontend — form "Nuovo Dipendente": nuovi ruoli + campo "Approvatore"

**Files:**
- Modify: `frontend-web/src/features/admin/tabs/EmployeesTab.jsx`
- Test: `frontend-web/src/features/admin/tabs/EmployeesTab.test.jsx`

- [ ] **Step 1: Scrivere i test che falliscono**

Aggiungere in fondo a `frontend-web/src/features/admin/tabs/EmployeesTab.test.jsx`, dentro il `describe('EmployeesTab', ...)` esistente:

```js
  it('shows Senior Manager and Direttore options in the role dropdown', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);
    await user.click(screen.getByRole('combobox', { name: /^ruolo$/i }));
    expect(screen.getByRole('option', { name: 'Senior Manager' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Direttore' })).toBeInTheDocument();
  });

  it('disables Approvatore richieste personali when role is Dipendente', () => {
    render(<EmployeesTab />);
    expect(screen.getByRole('combobox', { name: /approvatore richieste personali/i })).toHaveAttribute('aria-disabled', 'true');
  });

  it('enables Approvatore richieste personali and filters options when role is Manager', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);
    await user.click(screen.getByRole('combobox', { name: /^ruolo$/i }));
    await user.click(screen.getByRole('option', { name: 'Manager' }));
    expect(screen.getByRole('combobox', { name: /approvatore richieste personali/i })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('clears reports_to_id when the role changes', async () => {
    const user = userEvent.setup();
    render(<EmployeesTab />);
    await user.click(screen.getByRole('combobox', { name: /^ruolo$/i }));
    await user.click(screen.getByRole('option', { name: 'Manager' }));
    await user.click(screen.getByRole('combobox', { name: /approvatore richieste personali/i }));
    await user.click(screen.getByRole('option', { name: '— nessuno —' }));
    await user.click(screen.getByRole('combobox', { name: /^ruolo$/i }));
    await user.click(screen.getByRole('option', { name: 'Dipendente' }));
    expect(screen.getByRole('combobox', { name: /approvatore richieste personali/i })).toHaveAttribute('aria-disabled', 'true');
  });
```

Aggiungere anche un senior_manager e un director a `MOCK_EMPLOYEES` in cima al file, per popolare le opzioni del nuovo campo:

```js
const MOCK_EMPLOYEES = [
  { id: 'mgr-1', name: 'Manager Torino', role: 'manager', site_id: 'site-1', client_id: 'client-1' },
  { id: 'sm-1', name: 'Senior Manager Uno', role: 'senior_manager', client_id: 'client-1' },
  { id: 'dir-1', name: 'Direttore Uno', role: 'director', client_id: 'client-1' },
];
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `cd frontend-web && npx vitest run src/features/admin/tabs/EmployeesTab.test.jsx`
Expected: FAIL sui 4 nuovi test — "Senior Manager"/"Direttore" non esistono nel dropdown, il campo "Approvatore richieste personali" non esiste.

- [ ] **Step 3: Aggiungere la mappa etichette ruolo, in cima al file (esportata per riuso da `ChangeRoleDialog.jsx`)**

In `frontend-web/src/features/admin/tabs/EmployeesTab.jsx`, dopo la funzione `extractErrorMessage` esistente:

```js
export const ROLE_LABELS = {
  employee: 'Dipendente',
  manager: 'Manager',
  senior_manager: 'Senior Manager',
  director: 'Direttore',
  admin: 'Admin',
  viewer: 'Viewer',
  superadmin: 'Superadmin',
};

const ROLE_CHIP_COLOR = { manager: 'primary', senior_manager: 'primary', director: 'primary' };
```

E rendere pubblica anche `extractErrorMessage` (serve a `ChangeRoleDialog.jsx` nel Task 6): sostituire `function extractErrorMessage(err) {` con `export function extractErrorMessage(err) {`.

- [ ] **Step 4: Aggiungere `reports_to_id` allo stato del form e resettarlo ad ogni cambio ruolo/cliente**

Modificare l'inizializzazione dello stato:

```js
  const [form, setForm] = useState({
    client_id: '', email: '', name: '', phone: '',
    role: 'employee', site_id: '', password: '',
    external_employee_id: '', hiring_date: new Date().toISOString().slice(0, 10),
    manager_id: '', reports_to_id: '',
  });
```

Modificare l'`onChange` del Select Cliente (riga con `onChange={(e) => setForm({ ...form, client_id: e.target.value, site_id: '', manager_id: '' })}`) aggiungendo `reports_to_id: ''`:

```js
                    onChange={(e) => setForm({ ...form, client_id: e.target.value, site_id: '', manager_id: '', reports_to_id: '' })}
```

Modificare l'`onChange` del Select Ruolo (riga con `onChange={(e) => setForm({ ...form, role: e.target.value, manager_id: '' })}`) aggiungendo `reports_to_id: ''`:

```js
                    onChange={(e) => setForm({ ...form, role: e.target.value, manager_id: '', reports_to_id: '' })}
```

- [ ] **Step 5: Aggiungere le due nuove voci al dropdown Ruolo**

```js
                    <MenuItem value="employee">Dipendente</MenuItem>
                    <MenuItem value="manager">Manager</MenuItem>
                    <MenuItem value="senior_manager">Senior Manager</MenuItem>
                    <MenuItem value="director">Direttore</MenuItem>
```

- [ ] **Step 6: Rinominare l'etichetta del campo Manager esistente in "Manager di sede"**

Sostituire le due occorrenze di `Manager di riferimento` (label dell'`InputLabel` e dell'attributo `label` della `Select`) con `Manager di sede`.

- [ ] **Step 7: Calcolare le opzioni del nuovo campo "Approvatore" e aggiungere il campo al form**

Subito dopo la riga esistente `const availableManagers = allEmployees.filter(...)`:

```js
  const approverFieldDisabled = !['manager', 'senior_manager'].includes(form.role);
  const availableApprovers = allEmployees.filter((e) =>
    e.client_id === form.client_id
    && ((form.role === 'manager' && ['senior_manager', 'director'].includes(e.role))
      || (form.role === 'senior_manager' && e.role === 'director')));
```

Aggiungere il nuovo `FormControl` nello `Stack` che oggi contiene Matricola/Data assunzione/Manager di sede, subito dopo il `FormControl` di "Manager di sede":

```jsx
                <FormControl size="small" sx={{ minWidth: 240 }} disabled={approverFieldDisabled}>
                  <InputLabel id="new-employee-reports-to-label">Approvatore richieste personali</InputLabel>
                  <Select
                    labelId="new-employee-reports-to-label"
                    label="Approvatore richieste personali" value={form.reports_to_id}
                    onChange={(e) => setForm({ ...form, reports_to_id: e.target.value })}
                  >
                    <MenuItem value="">— nessuno —</MenuItem>
                    {availableApprovers.map((a) => <MenuItem key={a.id} value={a.id}>{a.name} ({ROLE_LABELS[a.role]})</MenuItem>)}
                  </Select>
                  <FormHelperText>
                    Chi approva ferie, malattia e correzioni cartellino di questa persona — se vuoto, ricade sull'admin.
                  </FormHelperText>
                </FormControl>
```

- [ ] **Step 8: Includere `reports_to_id` nel payload di creazione**

Nel corpo di `handleSubmit`, aggiungere alla costruzione di `payload`:

```js
        ...(form.reports_to_id && { reports_to_id: form.reports_to_id }),
```

E resettarlo dopo un salvataggio riuscito, nella riga `setForm({ ...form, email: '', name: '', phone: '', site_id: '', password: '', external_employee_id: '', manager_id: '' });`:

```js
      setForm({ ...form, email: '', name: '', phone: '', site_id: '', password: '', external_employee_id: '', manager_id: '', reports_to_id: '' });
```

- [ ] **Step 9: Aggiornare il Chip del ruolo in tabella per usare la mappa etichette**

Sostituire:

```jsx
                      <TableCell><Chip label={e.role} size="small" color={e.role === 'manager' ? 'primary' : 'default'} /></TableCell>
```

con:

```jsx
                      <TableCell><Chip label={ROLE_LABELS[e.role] || e.role} size="small" color={ROLE_CHIP_COLOR[e.role] || 'default'} /></TableCell>
```

- [ ] **Step 10: Eseguire i test e verificare che passino**

Run: `cd frontend-web && npx vitest run src/features/admin/tabs/EmployeesTab.test.jsx`
Expected: PASS, tutti i test del file (esistenti + i 4 nuovi).

- [ ] **Step 11: Commit**

```bash
git add frontend-web/src/features/admin/tabs/EmployeesTab.jsx frontend-web/src/features/admin/tabs/EmployeesTab.test.jsx
git commit -m "feat: add senior_manager/director + Approvatore field to Nuovo Dipendente form"
```

---

## Task 6: Frontend — nuovo componente `ChangeRoleDialog.jsx`

**Files:**
- Create: `frontend-web/src/features/admin/components/ChangeRoleDialog.jsx`
- Test: `frontend-web/src/features/admin/components/ChangeRoleDialog.test.jsx`

- [ ] **Step 1: Scrivere il test che fallisce**

Creare `frontend-web/src/features/admin/components/ChangeRoleDialog.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangeRoleDialog } from './ChangeRoleDialog';
import apiClient from '../../../services/apiClient';

vi.mock('../../../services/apiClient');

const MANAGER = { id: 'mgr-1', name: 'Mario Rossi', role: 'manager', client_id: 'client-1', reports_to_id: null };
const SENIOR = { id: 'sm-1', name: 'Senior Uno', role: 'senior_manager', client_id: 'client-1', reports_to_id: null };
const ALL_EMPLOYEES = [
  MANAGER, SENIOR,
  { id: 'dir-1', name: 'Direttore Uno', role: 'director', client_id: 'client-1', reports_to_id: null },
  { id: 'dir-2', name: 'Direttore Altro Cliente', role: 'director', client_id: 'client-2', reports_to_id: null },
];

describe('ChangeRoleDialog', () => {
  it('offers only Senior Manager and Direttore when promoting a manager', async () => {
    const user = userEvent.setup();
    render(<ChangeRoleDialog employee={MANAGER} allEmployees={ALL_EMPLOYEES} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole('combobox', { name: /nuovo ruolo/i }));
    expect(screen.getByRole('option', { name: 'Senior Manager' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Direttore' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Manager' })).not.toBeInTheDocument();
  });

  it('offers only Direttore when promoting a senior_manager', async () => {
    const user = userEvent.setup();
    render(<ChangeRoleDialog employee={SENIOR} allEmployees={ALL_EMPLOYEES} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole('combobox', { name: /nuovo ruolo/i }));
    expect(screen.getByRole('option', { name: 'Direttore' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Senior Manager' })).not.toBeInTheDocument();
  });

  it('filters approver options to the same client, excludes director role when target is director', async () => {
    const user = userEvent.setup();
    render(<ChangeRoleDialog employee={SENIOR} allEmployees={ALL_EMPLOYEES} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole('combobox', { name: /nuovo ruolo/i }));
    await user.click(screen.getByRole('option', { name: 'Direttore' }));
    expect(screen.getByRole('combobox', { name: /approvatore richieste personali/i })).toHaveAttribute('aria-disabled', 'true');
  });

  it('calls PATCH with the selected role and reports_to_id, then onSuccess+onClose', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    apiClient.patch.mockResolvedValueOnce({ data: { success: true, data: { id: 'mgr-1', role: 'senior_manager' } } });
    const user = userEvent.setup();
    render(<ChangeRoleDialog employee={MANAGER} allEmployees={ALL_EMPLOYEES} onClose={onClose} onSuccess={onSuccess} />);
    await user.click(screen.getByRole('combobox', { name: /nuovo ruolo/i }));
    await user.click(screen.getByRole('option', { name: 'Senior Manager' }));
    await user.click(screen.getByRole('combobox', { name: /approvatore richieste personali/i }));
    await user.click(screen.getByRole('option', { name: /direttore uno/i }));
    await user.click(screen.getByRole('button', { name: /conferma/i }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/api/admin/employees/mgr-1/role', {
      role: 'senior_manager', reports_to_id: 'dir-1',
    }));
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the backend error message and does not close on failure', async () => {
    apiClient.patch.mockRejectedValueOnce({ response: { data: { message: 'reports_to_id would create a cycle' } } });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ChangeRoleDialog employee={MANAGER} allEmployees={ALL_EMPLOYEES} onClose={onClose} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole('combobox', { name: /nuovo ruolo/i }));
    await user.click(screen.getByRole('option', { name: 'Senior Manager' }));
    await user.click(screen.getByRole('button', { name: /conferma/i }));
    expect(await screen.findByText(/would create a cycle/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `cd frontend-web && npx vitest run src/features/admin/components/ChangeRoleDialog.test.jsx`
Expected: FAIL — il modulo `./ChangeRoleDialog` non esiste.

- [ ] **Step 3: Creare il componente**

Creare `frontend-web/src/features/admin/components/ChangeRoleDialog.jsx`:

```jsx
import React, { useState } from 'react';
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, FormControl, InputLabel, Select, MenuItem, FormHelperText,
} from '@mui/material';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import apiClient from '../../../services/apiClient';
import { extractErrorMessage, ROLE_LABELS } from '../tabs/EmployeesTab';

// Solo promozioni: 'manager' non è mai una destinazione (richiederebbe
// site_id, fuori scope — design spec 2026-08-30), 'director' non ha
// transizioni valide da qui (nessuna retrocessione).
const PROMOTION_TARGETS = {
  manager: ['senior_manager', 'director'],
  senior_manager: ['director'],
};

export function ChangeRoleDialog({ employee, allEmployees, onClose, onSuccess }) {
  const targets = employee ? (PROMOTION_TARGETS[employee.role] || []) : [];
  const [role, setRole] = useState('');
  const [reportsToId, setReportsToId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const approverFieldDisabled = role !== 'senior_manager';
  const approverOptions = employee && role === 'senior_manager'
    ? allEmployees.filter((e) => e.client_id === employee.client_id && e.role === 'director' && e.id !== employee.id)
    : [];

  const handleRoleChange = (value) => {
    setRole(value);
    setReportsToId(''); // azzerato ad ogni cambio ruolo, stesso pattern del form di creazione
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.patch(`/api/admin/employees/${employee.id}/role`, {
        role,
        reports_to_id: role === 'director' ? null : (reportsToId || null),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!employee} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Cambia ruolo — {employee?.name}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Solo promozioni: {employee ? ROLE_LABELS[employee.role] : ''} può diventare{' '}
          {targets.map((t) => ROLE_LABELS[t]).join(' o ')}. Nessuna via di rientro da qui.
        </DialogContentText>
        <FormControl size="small" fullWidth sx={{ mb: 2 }}>
          <InputLabel id="change-role-label">Nuovo ruolo</InputLabel>
          <Select
            labelId="change-role-label" label="Nuovo ruolo" value={role}
            onChange={(e) => handleRoleChange(e.target.value)}
          >
            {targets.map((t) => <MenuItem key={t} value={t}>{ROLE_LABELS[t]}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" fullWidth disabled={approverFieldDisabled}>
          <InputLabel id="change-role-reports-to-label">Approvatore richieste personali</InputLabel>
          <Select
            labelId="change-role-reports-to-label" label="Approvatore richieste personali"
            value={reportsToId} onChange={(e) => setReportsToId(e.target.value)}
          >
            <MenuItem value="">— nessuno —</MenuItem>
            {approverOptions.map((a) => <MenuItem key={a.id} value={a.id}>{a.name} ({ROLE_LABELS[a.role]})</MenuItem>)}
          </Select>
          <FormHelperText>
            Chi approva ferie, malattia e correzioni cartellino di questa persona — se vuoto, ricade sull'admin.
          </FormHelperText>
        </FormControl>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Annulla</Button>
        <Button onClick={handleConfirm} variant="contained" disabled={loading || !role}
          startIcon={loading ? <CircularProgress size={16} /> : <SwapHorizIcon />}>
          {loading ? 'Salvataggio…' : 'Conferma'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

Nota: `approverOptions`/`approverFieldDisabled` sono condizionati su `role === 'senior_manager'` (mai `'manager'`, che non è mai un valore possibile di `role` in questo componente — è sempre e solo il ruolo *target* scelto nel dropdown "Nuovo ruolo", che per `PROMOTION_TARGETS` non contiene mai `'manager'`).

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `cd frontend-web && npx vitest run src/features/admin/components/ChangeRoleDialog.test.jsx`
Expected: PASS, tutti e 5 i test verdi.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/features/admin/components/ChangeRoleDialog.jsx frontend-web/src/features/admin/components/ChangeRoleDialog.test.jsx
git commit -m "feat: add ChangeRoleDialog component for promoting manager/senior_manager"
```

---

## Task 7: Frontend — collegare l'azione "Cambia ruolo" in `EmployeesTab.jsx`

**Files:**
- Modify: `frontend-web/src/features/admin/tabs/EmployeesTab.jsx`
- Test: `frontend-web/src/features/admin/tabs/EmployeesTab.test.jsx`

- [ ] **Step 1: Scrivere i test che falliscono**

Aggiungere in fondo a `frontend-web/src/features/admin/tabs/EmployeesTab.test.jsx`:

```js
  it('shows the Cambia ruolo icon only for manager/senior_manager rows', () => {
    render(<EmployeesTab />);
    expect(screen.getByLabelText(/cambia ruolo — manager torino/i)).toBeInTheDocument();
  });

  it('does not show Cambia ruolo for employee/admin/director rows', () => {
    render(<EmployeesTab />);
    expect(screen.queryByLabelText(/cambia ruolo — direttore uno/i)).not.toBeInTheDocument();
  });
```

(Questi test usano `MOCK_EMPLOYEES` già esteso nel Task 5 con `mgr-1`/manager e `dir-1`/director.)

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `cd frontend-web && npx vitest run src/features/admin/tabs/EmployeesTab.test.jsx -t "Cambia ruolo"`
Expected: FAIL — l'icona non esiste ancora.

- [ ] **Step 3: Importare il dialog e l'icona, aggiungere lo stato**

In cima al file, aggiungere agli import esistenti:

```js
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { ChangeRoleDialog } from '../components/ChangeRoleDialog';
```

Nel corpo del componente, subito dopo `const [resetTarget, setResetTarget] = useState(null);`:

```js
  const [changeRoleTarget, setChangeRoleTarget] = useState(null);
```

- [ ] **Step 4: Aggiungere l'icona in tabella, solo per manager/senior_manager**

Nella `TableCell align="right"`, subito prima del `Tooltip` "Reset password":

```jsx
                        {['manager', 'senior_manager'].includes(e.role) && (
                          <Tooltip title="Cambia ruolo">
                            <IconButton
                              size="small" color="primary" aria-label={`Cambia ruolo — ${e.name}`}
                              onClick={() => setChangeRoleTarget(e)}
                            >
                              <SwapHorizIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
```

- [ ] **Step 5: Renderizzare il dialog in fondo al componente**

Subito dopo il blocco `{resetTarget && (...)}`, prima della chiusura di `</Stack>`:

```jsx
      {changeRoleTarget && (
        <ChangeRoleDialog
          employee={changeRoleTarget}
          allEmployees={allEmployees}
          onClose={() => setChangeRoleTarget(null)}
          onSuccess={() => { reloadEmployees(); reloadAllEmployees(); }}
        />
      )}
```

- [ ] **Step 6: Eseguire i test e verificare che passino**

Run: `cd frontend-web && npx vitest run src/features/admin/tabs/EmployeesTab.test.jsx`
Expected: PASS, tutti i test del file.

- [ ] **Step 7: Commit**

```bash
git add frontend-web/src/features/admin/tabs/EmployeesTab.jsx frontend-web/src/features/admin/tabs/EmployeesTab.test.jsx
git commit -m "feat: wire Cambia ruolo action into EmployeesTab table"
```

---

## Task 8: Verifica finale — suite completa, lint, aggiornamento documentazione

**Files:**
- Nessuna modifica di codice — solo verifica ed eventuale fix.

- [ ] **Step 1: Suite backend completa**

Run: `cd backend && npm test`
Expected: exit code 0, nessun FAIL nuovo (eventuali flake pre-esistenti isolati e non riproducibili — vedi `CLAUDE.md` Pattern 5 — vanno rieseguiti una seconda volta prima di considerarli tali).

- [ ] **Step 2: Suite frontend completa**

Run: `cd frontend-web && npx vitest run`
Expected: tutti i test verdi, inclusi i nuovi.

- [ ] **Step 3: Lint su entrambi**

Run: `cd backend && npm run lint && cd ../frontend-web && npm run lint`
Expected: 0 errori su entrambi.

- [ ] **Step 4: Se tutto verde, nessun commit aggiuntivo di codice — passare a `TASKS.md`/`HANDOFF.md`/`PROJECT_DECISIONS.md` fuori da questo piano, come da protocollo di fine sessione in `CLAUDE.md`.**

---

## Note per chi esegue

- Nessuna migrazione DB: `reports_to_id` esiste già (migration 042, Session 116).
- Nessuna modifica al wizard Excel "Aggiorna Dipendenti" — esplicitamente fuori scope (vedi spec).
- Se un task fallisce a metà, non proseguire al successivo: la Task N+1 assume che i file della Task N siano nello stato descritto nei suoi Step, non in uno stato intermedio.
