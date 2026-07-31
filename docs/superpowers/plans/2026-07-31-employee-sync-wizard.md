# Wizard Excel "Aggiorna Dipendenti" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire l'import CSV in Admin con un wizard Excel che confronta il file caricato con lo stato DB del cliente e propone un diff (Nuovi/Rimossi/Modificati) da confermare in blocco, introducendo uno storico dipendenti mai perso (soft-delete + date di assunzione/uscita).

**Architecture:** Nuovo modulo `backend/src/services/employeeSync/` (parseTemplate/computeDiff/applyDiff/generateTemplate) ricalca la struttura già collaudata di `backend/src/services/onboarding/`; nuove route `backend/src/routes/admin/employeeSync.js` seguono lo stesso pattern preview→apply in transazione. Tre nuove colonne su `employees` (`active`, `hiring_date`, `exit_date`) sostituiscono l'hard-delete ovunque nel ciclo di vita ordinario.

**Tech Stack:** Node.js/Express, PostgreSQL (pg), exceljs, Zod, React + MUI (frontend-web), Jest + React Testing Library.

**Spec di riferimento:** `docs/superpowers/specs/2026-07-31-employee-sync-wizard-design.md`

---

## Task 0: Explore — mappare tutti i punti di lettura `employees`

**Files:** nessuna modifica, solo ricerca.

- [ ] **Step 1: Enumerare i file che leggono `employees`**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge"
grep -rln "FROM employees\|JOIN employees" backend/src/routes backend/src/services
```

Punto di partenza già noto da questa sessione (da riverificare, potrebbe non essere esaustivo):
`export.js`, `shifts.js`, `auth.js`, `employees.js`, `checkins.js`, `admin.js`, `presences.js`, `demo.js`, `leaves.js`, `consent.js`, `admin/viewers.js`, `illnesses.js`, `admin/employees.js`, `admin/clients.js`, `services/onboarding/apply.js`, `services/onboarding/validateAgainstDb.js`.

- [ ] **Step 2: Per ciascun file, annotare la query esatta (file:riga) e se legge liste/dettaglio dipendenti o solo verifica esistenza/appartenenza**

Produce una tabella `file:riga → query → serve filtro active=true? (sì/no/dipende)`. Le query di sola verifica ownership (es. "questo employee_id appartiene a questo client_id?") NON vanno filtrate qui — le riguarda il Task 3 (check-in) separatamente; qui ci interessano le query che LISTANO o mostrano dipendenti (dashboard, planning, export, stats).

- **Verifica:** tabella completa prodotta e rivista manualmente; nessuna query nota esclusa prima di procedere al Task 1.

---

## Task 1: Migrazione DB — colonne `active`, `hiring_date`, `exit_date`

**Files:**
- Create: `backend/migrations/035_employee_lifecycle.sql`
- Modify: `backend/src/db/schema.sql` (righe 61-74, tabella `employees`) — la migration runner (`run-migrations.js`) non riapplica mai `schema.sql` su un DB esistente, ma un nuovo ambiente (es. staging) lo applica manualmente una tantum: va tenuto allineato.
- Test: `backend/src/__tests__/migration-035-employee-lifecycle.test.js`

- [ ] **Step 1: Scrivere la migrazione**

```sql
-- backend/migrations/035_employee_lifecycle.sql
ALTER TABLE employees
  ADD COLUMN active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN hiring_date DATE,
  ADD COLUMN exit_date DATE;

-- Backfill dipendenti esistenti: hiring_date approssimata a created_at
-- (non è la vera data di assunzione - il cliente potrà correggerla ricaricando
-- il wizard con la colonna "Data Assunzione" modificata per quella riga).
UPDATE employees SET hiring_date = created_at::date WHERE hiring_date IS NULL;

CREATE INDEX idx_employees_active ON employees(client_id, active);
```

- [ ] **Step 2: Aggiungere le stesse colonne a `backend/src/db/schema.sql`**

Nella definizione `CREATE TABLE employees (...)` (righe 61-74), aggiungere in coda alle colonne esistenti:
```sql
  active BOOLEAN NOT NULL DEFAULT true,
  hiring_date DATE,
  exit_date DATE,
```

- [ ] **Step 3: Test di migrazione**

```js
// backend/src/__tests__/migration-035-employee-lifecycle.test.js
const { pool } = require('../db/pool');

describe('migration 035 — employee lifecycle columns', () => {
  it('adds active/hiring_date/exit_date with correct defaults', async () => {
    const cols = await pool.query(
      `SELECT column_name, data_type, column_default
       FROM information_schema.columns
       WHERE table_name = 'employees' AND column_name IN ('active', 'hiring_date', 'exit_date')`
    );
    const byName = Object.fromEntries(cols.rows.map((r) => [r.column_name, r]));
    expect(byName.active.data_type).toBe('boolean');
    expect(byName.active.column_default).toMatch(/true/);
    expect(byName.hiring_date.data_type).toBe('date');
    expect(byName.exit_date.data_type).toBe('date');
  });

  it('backfills hiring_date for existing employees', async () => {
    const res = await pool.query(
      `SELECT COUNT(*) FROM employees WHERE active = true AND hiring_date IS NULL`
    );
    expect(Number(res.rows[0].count)).toBe(0);
  });
});
```

- [ ] **Step 4: Applicare la migrazione sul DB di test/locale e far girare il test**

```bash
cd backend
node scripts/run-migrations.js   # o lo script equivalente già in uso nel progetto
npm test -- migration-035-employee-lifecycle
```
Expected: entrambi i test PASS, `active=true` per tutti i dipendenti pre-esistenti, `hiring_date` mai NULL per un attivo.

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/035_employee_lifecycle.sql backend/src/db/schema.sql backend/src/__tests__/migration-035-employee-lifecycle.test.js
git commit -m "feat(db): aggiunge active/hiring_date/exit_date a employees (Task 1 employee-sync-wizard)"
```

---

## Task 2: Filtrare `active = true` nelle query di lista (TDD, pattern ripetuto)

**Files:** tutti quelli enumerati dal Task 0. Il pattern è identico ovunque: aggiungere `AND e.active = true` (o `WHERE active = true` se non c'è già un `WHERE`) alle query che restituiscono liste/dettaglio dipendenti attivi per l'uso ordinario (dashboard, planning, stats). Due esempi completi sotto; il resto dei file enumerati al Task 0 si aggiorna con lo stesso identico pattern (test prima, poi fix).

**Esempio 1 — `backend/src/routes/admin/employees.js:242-274` (GET lista dipendenti Admin)**

- [ ] **Step 1: Test che un dipendente disattivato non compaia nella lista**

```js
// backend/src/__tests__/admin-employees-active-filter.test.js
const request = require('supertest');
const app = require('../app');
const { pool } = require('../db/pool');

describe('GET /api/v1/admin/employees — active filter', () => {
  it('excludes employees with active=false from the list', async () => {
    // Setup: usa i fixture demo esistenti, disattiva un dipendente noto
    await pool.query(`UPDATE employees SET active = false WHERE email = 'maria@badge.local'`);
    const res = await request(app)
      .get('/api/v1/admin/employees')
      .set('Authorization', `Bearer ${global.testAdminToken}`); // token helper già esistente nella suite
    expect(res.status).toBe(200);
    expect(res.body.data.find((e) => e.email === 'maria@badge.local')).toBeUndefined();
    await pool.query(`UPDATE employees SET active = true WHERE email = 'maria@badge.local'`); // cleanup
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

```bash
cd backend && npm test -- admin-employees-active-filter
```
Expected: FAIL — `maria@badge.local` compare ancora nella lista.

- [ ] **Step 3: Fix della query**

In `backend/src/routes/admin/employees.js:258-267`, aggiungere `AND e.active = true`:
```js
const result = await pool.query(
  `SELECT e.id, e.client_id, e.email, e.name, e.role, e.phone,
          e.site_id, e.external_employee_id, e.created_at, c.name AS client_name,
          s.name AS site_name
   FROM employees e
   JOIN clients c ON c.id = e.client_id
   LEFT JOIN sites s ON s.id = e.site_id
   ${where} ${where ? 'AND' : 'WHERE'} e.active = true
   ORDER BY e.created_at DESC
   LIMIT 200`,
  params
);
```

- [ ] **Step 4: Rieseguire il test**

```bash
cd backend && npm test -- admin-employees-active-filter
```
Expected: PASS.

**Esempio 2 — `backend/src/routes/checkins.js:400` (join per report/stats)**

- [ ] **Step 1: Test che uno stats/report non conteggi dipendenti disattivati** — stesso pattern: disattiva un dipendente di test, chiama l'endpoint, verifica che non compaia/non sia conteggiato.
- [ ] **Step 2: Eseguire e verificare che fallisca**
- [ ] **Step 3: Aggiungere `AND e.active = true` (o equivalente) alla query indicata**
- [ ] **Step 4: Rieseguire e verificare PASS**

**Ripetere lo stesso ciclo (test → fail → fix → pass) per ognuno dei restanti file enumerati al Task 0** (`export.js`, `shifts.js`, `auth.js`, `employees.js`, `admin.js`, `presences.js`, `demo.js`, `leaves.js`, `consent.js`, `admin/viewers.js`, `illnesses.js`, `admin/clients.js`, `services/onboarding/apply.js`, `services/onboarding/validateAgainstDb.js`), usando la tabella prodotta al Task 0 come checklist — una query alla volta, un test alla volta, un commit alla volta.

- [ ] **Step finale: suite completa**

```bash
cd backend && npm run test:coverage
```
Expected: 0 failures, nessuna regressione sui test esistenti.

- [ ] **Commit finale del task**

```bash
git add backend/src/routes backend/src/services backend/src/__tests__
git commit -m "feat(backend): filtra active=true in tutte le query di lista employees (Task 2 employee-sync-wizard)"
```

---

## Task 3: Bloccare check-in per dipendenti inattivi

**Files:**
- Modify: `backend/src/routes/checkins.js:60-69` (dentro `withTransaction`, subito dopo la query che verifica esistenza/client_id)
- Test: `backend/src/__tests__/checkins-active-employee.test.js`

- [ ] **Step 1: Test — check-in rifiutato per dipendente disattivato**

```js
// backend/src/__tests__/checkins-active-employee.test.js
const request = require('supertest');
const app = require('../app');
const { pool } = require('../db/pool');

describe('POST /api/checkins — active employee guard', () => {
  it('rejects check-in with 403 CHECKIN_EMPLOYEE_INACTIVE when employee.active = false', async () => {
    await pool.query(`UPDATE employees SET active = false WHERE email = 'maria@badge.local'`);
    const res = await request(app)
      .post('/api/checkins')
      .set('Authorization', `Bearer ${global.testMariaToken}`) // helper token esistente
      .send({ employee_id: global.testMariaId, site_id: global.testTorinoSiteId, type: 'IN' });
    expect(res.status).toBe(403);
    expect(res.body.error?.code || res.body.code).toBe('CHECKIN_EMPLOYEE_INACTIVE');
    await pool.query(`UPDATE employees SET active = true WHERE email = 'maria@badge.local'`); // cleanup
  });

  it('still allows check-in for an active employee (no regression)', async () => {
    const res = await request(app)
      .post('/api/checkins')
      .set('Authorization', `Bearer ${global.testMariaToken}`)
      .send({ employee_id: global.testMariaId, site_id: global.testTorinoSiteId, type: 'IN' });
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Eseguire e verificare che il primo test fallisca (status 201 invece di 403 atteso)**

```bash
cd backend && npm test -- checkins-active-employee
```

- [ ] **Step 3: Aggiungere il controllo in `checkins.js`**

Modificare la query esistente a riga 62-65 per includere `active`, e aggiungere il check subito dopo:

```js
// checkins.js:62-69 (sostituisce il blocco esistente)
const employeeResult = await client.query(
  'SELECT id, client_id, active FROM employees WHERE id = $1::uuid AND client_id = $2::uuid LIMIT 1',
  [employee_id, clientId]
);

if (employeeResult.rows.length === 0) {
  throw new NotFoundError('Employee not found or not assigned to your organization', 'EMPLOYEE_NOT_FOUND');
}
if (employeeResult.rows[0].active === false) {
  throw new ForbiddenError('This employee is deactivated and cannot check in', 'CHECKIN_EMPLOYEE_INACTIVE');
}
```

- [ ] **Step 4: Rieseguire i test**

```bash
cd backend && npm test -- checkins-active-employee
```
Expected: entrambi PASS (rifiuto per inattivo, nessuna regressione per attivo).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/checkins.js backend/src/__tests__/checkins-active-employee.test.js
git commit -m "feat(backend): blocca check-in per dipendenti disattivati (Task 3 employee-sync-wizard)"
```

---

## Task 4: Convertire il delete singolo in disattivazione

**Files:**
- Modify: `backend/src/routes/admin/employees.js:276-304` (route `DELETE /:id`)
- Modify: `frontend-web/src/features/admin/tabs/EmployeesTab.jsx:309-316` (testo del `ConfirmDeleteDialog`, non è più un delete definitivo con perdita dei check-in)
- Test: `backend/src/__tests__/admin-employees-deactivate.test.js`

- [ ] **Step 1: Test — DELETE disattiva invece di cancellare**

```js
// backend/src/__tests__/admin-employees-deactivate.test.js
const request = require('supertest');
const app = require('../app');
const { pool } = require('../db/pool');

describe('DELETE /api/admin/employees/:id — soft deactivation', () => {
  it('sets active=false and exit_date=today instead of deleting the row', async () => {
    const created = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, password_hash)
       VALUES ($1, 'temp-delete-test@x.it', 'Temp', 'employee', 'x')
       RETURNING id`,
      [global.testClientId]
    );
    const empId = created.rows[0].id;

    const res = await request(app)
      .delete(`/api/admin/employees/${empId}`)
      .set('Authorization', `Bearer ${global.testAdminToken}`);
    expect(res.status).toBe(200);

    const check = await pool.query('SELECT active, exit_date FROM employees WHERE id = $1', [empId]);
    expect(check.rows).toHaveLength(1); // la riga esiste ancora
    expect(check.rows[0].active).toBe(false);
    expect(check.rows[0].exit_date).not.toBeNull();

    await pool.query('DELETE FROM employees WHERE id = $1', [empId]); // cleanup del fixture di test
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca** (oggi la riga sparisce del tutto)

```bash
cd backend && npm test -- admin-employees-deactivate
```

- [ ] **Step 3: Sostituire la route**

```js
// backend/src/routes/admin/employees.js:276-304 — sostituisce l'intera route DELETE
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const uuidCheck = z.string().uuid().safeParse(id);
    if (!uuidCheck.success) return next(new ValidationError('Invalid employee id'));

    const result = await pool.query(
      `UPDATE employees SET active = false, exit_date = CURRENT_DATE
       WHERE id = $1 AND client_id = $2::uuid AND active = true
       RETURNING id, name, email, client_id`,
      [id, req.user.client_id]
    );
    if (result.rowCount === 0) return next(new NotFoundError('Employee not found', 'EMPLOYEE_NOT_FOUND'));

    const emp = result.rows[0];
    await logAudit(pool, {
      action: 'admin_deactivate_employee',
      entity: 'employee',
      entityId: emp.id,
      clientId: emp.client_id,
      oldValue: { active: true },
      newValue: { active: false, exit_date: new Date().toISOString().slice(0, 10) },
      userId: req.user.user_id,
    }).catch(() => {});

    logger.info({ action: 'admin_deactivate_employee', employee_id: emp.id, email: emp.email });
    res.json({ success: true, message: `Dipendente "${emp.name}" disattivato.` });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Rieseguire il test**

```bash
cd backend && npm test -- admin-employees-deactivate
```
Expected: PASS.

- [ ] **Step 5: Aggiornare il testo del dialog frontend**

In `EmployeesTab.jsx:309-316`, cambiare la description (non è più irreversibile né cancella i check-in):
```jsx
<ConfirmDeleteDialog
  open={!!deleteTarget}
  title={`Disattiva dipendente "${deleteTarget?.name}"?`}
  description="Il dipendente non potrà più effettuare check-in e non comparirà nelle liste attive. Lo storico dei check-in resta intatto e il dipendente può essere riattivato in futuro caricando di nuovo il suo nominativo con Stato=Attivo nel wizard Aggiorna Dipendenti."
  onConfirm={handleDelete}
  onCancel={() => setDeleteTarget(null)}
  loading={deleting}
/>
```
Rinominare anche il tooltip del bottone (riga 291) da "Elimina dipendente" a "Disattiva dipendente", e l'icona `DeleteIcon` può restare (azione visivamente equivalente per l'utente).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/admin/employees.js frontend-web/src/features/admin/tabs/EmployeesTab.jsx backend/src/__tests__/admin-employees-deactivate.test.js
git commit -m "feat(backend,frontend): converte delete singolo dipendente in disattivazione (Task 4 employee-sync-wizard)"
```

---

## Task 5: `computeDiff.js` (TDD, puro)

**Files:**
- Create: `backend/src/services/employeeSync/computeDiff.js`
- Test: `backend/src/__tests__/employeeSync-computeDiff.test.js`

Firma: `computeDiff(fileRows, dbEmployees, dbSiteIdByName)` → oggetto puro, nessuna scrittura. `fileRows` sono le righe già parsate dal foglio `Dipendenti` (via Task 6), `dbEmployees` è l'array di righe `SELECT * FROM employees WHERE client_id = $1` (già filtrato per client dalla route), `dbSiteIdByName` è una `Map` nome-sede→id (per risolvere la colonna "sede" del file).

- [ ] **Step 1: Scrivere i test per tutti i 6 casi**

```js
// backend/src/__tests__/employeeSync-computeDiff.test.js
const { computeDiff } = require('../services/employeeSync/computeDiff');

const siteIdByName = new Map([['Torino', 'site-torino'], ['Milano', 'site-milano']]);

function dbEmp(overrides) {
  return {
    id: 'emp-1', email: 'mario@x.it', name: 'Mario Rossi', phone: null, role: 'employee',
    site_id: 'site-torino', active: true, hiring_date: '2024-01-10', exit_date: null,
    ...overrides,
  };
}
function fileRow(overrides) {
  return {
    _row: 2, nome_completo: 'Mario Rossi', email: 'mario@x.it', telefono: null, ruolo: 'dipendente',
    sede: 'Torino', matricola: null, stato: 'attivo', data_assunzione: null, data_uscita: null,
    ...overrides,
  };
}

describe('computeDiff', () => {
  it('classifies a brand new employee as "nuovo"', () => {
    const diff = computeDiff([fileRow({ email: 'nuovo@x.it', nome_completo: 'Nuovo Assunto' })], [], siteIdByName);
    expect(diff.nuovi).toHaveLength(1);
    expect(diff.nuovi[0].email).toBe('nuovo@x.it');
  });

  it('reactivates a previously deactivated employee, preserving hiring_date', () => {
    const db = [dbEmp({ active: false, exit_date: '2026-05-01', hiring_date: '2023-06-01' })];
    const diff = computeDiff([fileRow({ stato: 'attivo' })], db, siteIdByName);
    expect(diff.riattivati).toHaveLength(1);
    expect(diff.riattivati[0].hiring_date).toBe('2023-06-01');
    expect(diff.riattivati[0].exit_date).toBeNull();
  });

  it('marks an employee absent-as-inactive in the file as "rimosso"', () => {
    const db = [dbEmp({ active: true })];
    const diff = computeDiff([fileRow({ stato: 'inattivo' })], db, siteIdByName);
    expect(diff.rimossi).toHaveLength(1);
    expect(diff.rimossi[0].exit_date).not.toBeNull();
  });

  it('detects a site transfer as replacement, not merge', () => {
    const db = [dbEmp({ site_id: 'site-torino' })];
    const diff = computeDiff([fileRow({ sede: 'Milano' })], db, siteIdByName);
    expect(diff.modificati).toHaveLength(1);
    expect(diff.modificati[0].changes.site_id).toEqual({ from: 'site-torino', to: 'site-milano' });
  });

  it('detects a non-site field change as "modificato"', () => {
    const db = [dbEmp({ phone: '111' })];
    const diff = computeDiff([fileRow({ telefono: '222' })], db, siteIdByName);
    expect(diff.modificati).toHaveLength(1);
    expect(diff.modificati[0].changes.phone).toEqual({ from: '111', to: '222' });
  });

  it('flags a row present in DB (active) but absent from the file as an anomaly, taking no action', () => {
    const db = [dbEmp({ email: 'sparito@x.it' })];
    const diff = computeDiff([], db, siteIdByName);
    expect(diff.anomalie).toHaveLength(1);
    expect(diff.anomalie[0].email).toBe('sparito@x.it');
    expect(diff.rimossi).toHaveLength(0); // non va confuso con una rimozione esplicita
  });

  it('does not list an unchanged row anywhere', () => {
    const db = [dbEmp()];
    const diff = computeDiff([fileRow()], db, siteIdByName);
    expect(diff.nuovi).toHaveLength(0);
    expect(diff.riattivati).toHaveLength(0);
    expect(diff.rimossi).toHaveLength(0);
    expect(diff.modificati).toHaveLength(0);
    expect(diff.anomalie).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Eseguire e verificare che falliscano** (il modulo non esiste ancora)

```bash
cd backend && npm test -- employeeSync-computeDiff
```
Expected: FAIL con "Cannot find module '../services/employeeSync/computeDiff'".

- [ ] **Step 3: Implementare `computeDiff.js`**

```js
// backend/src/services/employeeSync/computeDiff.js
'use strict';

const { ROLE_MAP } = require('../onboarding/parseWorkbook');

const FIELD_COMPARATORS = {
  name: (db, file) => db.name !== file.nome_completo,
  phone: (db, file) => (db.phone || null) !== (file.telefono || null),
  role: (db, file) => db.role !== ROLE_MAP[file.ruolo],
  external_employee_id: (db, file) => (db.external_employee_id || null) !== (file.matricola || null),
};

function computeDiff(fileRows, dbEmployees, siteIdByName) {
  const nuovi = [];
  const riattivati = [];
  const rimossi = [];
  const modificati = [];
  const anomalie = [];

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
          email: row.email, name: row.nome_completo, phone: row.telefono,
          role: ROLE_MAP[row.ruolo], site_id: siteId, external_employee_id: row.matricola,
          hiring_date: row.data_assunzione || new Date().toISOString().slice(0, 10),
        });
      }
      continue;
    }

    if (!dbRow.active && fileActive) {
      riattivati.push({
        id: dbRow.id, email: row.email,
        hiring_date: dbRow.hiring_date, // invariata, mai sovrascritta da una riattivazione
        exit_date: null,
      });
      continue;
    }

    if (dbRow.active && !fileActive) {
      rimossi.push({
        id: dbRow.id, email: row.email,
        exit_date: row.data_uscita || new Date().toISOString().slice(0, 10),
      });
      continue;
    }

    if (!dbRow.active && !fileActive) continue; // già inattivo, nessuna azione

    const changes = {};
    if (dbRow.site_id !== siteId) changes.site_id = { from: dbRow.site_id, to: siteId };
    for (const [field, differs] of Object.entries(FIELD_COMPARATORS)) {
      if (differs(dbRow, row)) {
        changes[field] = { from: dbRow[field], to: field === 'role' ? ROLE_MAP[row.ruolo] : row[
          field === 'name' ? 'nome_completo' : field === 'phone' ? 'telefono' : field === 'external_employee_id' ? 'matricola' : field
        ] };
      }
    }
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

module.exports = { computeDiff };
```

- [ ] **Step 4: Rieseguire i test**

```bash
cd backend && npm test -- employeeSync-computeDiff
```
Expected: tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/employeeSync/computeDiff.js backend/src/__tests__/employeeSync-computeDiff.test.js
git commit -m "feat(backend): computeDiff puro per il wizard Aggiorna Dipendenti (Task 5 employee-sync-wizard)"
```

---

## Task 6: `parseTemplate.js` (parsing Excel con Stato/Data Assunzione/Data Uscita)

**Files:**
- Create: `backend/src/services/employeeSync/parseTemplate.js`
- Test: `backend/src/__tests__/employeeSync-parseTemplate.test.js`
- Test fixture: `backend/src/__tests__/fixtures/employee-sync-valid.xlsx`, `backend/src/__tests__/fixtures/employee-sync-invalid.xlsx` (generati dal test stesso via `exceljs`, non file binari committati a mano — vedi Step 1)

- [ ] **Step 1: Scrivere i test, generando i workbook di fixture al volo con `exceljs` nel test stesso** (evita di committare file binari):

```js
// backend/src/__tests__/employeeSync-parseTemplate.test.js
const ExcelJS = require('exceljs');
const { parseTemplate } = require('../services/employeeSync/parseTemplate');

async function buildWorkbook({ dipendenti = [], sedi = [] }) {
  const wb = new ExcelJS.Workbook();
  const wsDip = wb.addWorksheet('Dipendenti');
  wsDip.addRow(['nome_completo', 'email', 'telefono', 'ruolo', 'sede', 'matricola', 'stato', 'data_assunzione', 'data_uscita']);
  for (const d of dipendenti) wsDip.addRow(d);
  const wsSedi = wb.addWorksheet('Sedi');
  wsSedi.addRow(['nome_sede', 'indirizzo', 'latitudine', 'longitudine', 'raggio_geofence_m']);
  for (const s of sedi) wsSedi.addRow(s);
  return wb.xlsx.writeBuffer();
}

describe('parseTemplate', () => {
  it('parses Dipendenti + Sedi with the new Stato/Data Assunzione/Data Uscita columns', async () => {
    const buffer = await buildWorkbook({
      dipendenti: [['Mario Rossi', 'mario@x.it', '333', 'dipendente', 'Torino', 'M1', 'Attivo', '2024-01-10', '']],
      sedi: [['Torino', 'Via Roma 1', '', '', '']],
    });
    const data = await parseTemplate(buffer);
    expect(data.dipendenti).toHaveLength(1);
    expect(data.dipendenti[0]).toMatchObject({
      email: 'mario@x.it', stato: 'attivo', data_assunzione: '2024-01-10',
    });
    expect(data.sedi[0].nome_sede).toBe('Torino');
  });

  it('normalizes email to lowercase and trims whitespace', async () => {
    const buffer = await buildWorkbook({
      dipendenti: [[' Mario Rossi ', ' MARIO@X.IT ', '', 'dipendente', 'Torino', '', 'Attivo', '', '']],
    });
    const data = await parseTemplate(buffer);
    expect(data.dipendenti[0].email).toBe('mario@x.it');
  });
});
```

- [ ] **Step 2: Eseguire e verificare che falliscano**

```bash
cd backend && npm test -- employeeSync-parseTemplate
```

- [ ] **Step 3: Implementare `parseTemplate.js` riusando `readSheet`/`extractCellValue` da `onboarding/parseWorkbook.js`**

```js
// backend/src/services/employeeSync/parseTemplate.js
'use strict';

const ExcelJS = require('exceljs');

function norm(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function normEmail(v) {
  const s = norm(v);
  return s ? s.toLowerCase() : null;
}
function normDate(v) {
  const s = norm(v);
  if (!s) return null;
  return v instanceof Date ? v.toISOString().slice(0, 10) : s;
}

function extractCellValue(cell) {
  if (!cell) return null;
  const v = cell.value;
  if (v !== null && v !== undefined && typeof v === 'object' && !(v instanceof Date)) {
    return cell.text != null ? cell.text : '';
  }
  return v;
}

function readSheet(ws) {
  if (!ws) return [];
  const headers = (ws.getRow(1).values || []).map((h) => (h == null ? '' : String(h).trim()));
  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = { _row: rowNumber };
    let hasValue = false;
    for (let c = 1; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      const val = extractCellValue(row.getCell(c));
      if (val !== null && val !== undefined && String(val).trim() !== '') hasValue = true;
      obj[key] = val;
    }
    if (hasValue) rows.push(obj);
  });
  return rows;
}

async function parseTemplate(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const dipRows = readSheet(wb.getWorksheet('Dipendenti'));
  const sediRows = readSheet(wb.getWorksheet('Sedi'));

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
  }));

  const sedi = sediRows.map((s) => ({
    _row: s._row,
    nome_sede: norm(s.nome_sede),
    indirizzo: norm(s.indirizzo),
    latitudine: s.latitudine == null || String(s.latitudine).trim() === '' ? null : Number(s.latitudine),
    longitudine: s.longitudine == null || String(s.longitudine).trim() === '' ? null : Number(s.longitudine),
    raggio_geofence_m: s.raggio_geofence_m == null || String(s.raggio_geofence_m).trim() === ''
      ? null : Number(s.raggio_geofence_m),
  }));

  return { dipendenti, sedi };
}

module.exports = { parseTemplate };
```

- [ ] **Step 4: Rieseguire i test**

```bash
cd backend && npm test -- employeeSync-parseTemplate
```
Expected: PASS.

- [ ] **Step 5: Test di validazione sintattica (Stato non valido, date malformate) — TDD**

```js
// aggiunta a backend/src/__tests__/employeeSync-parseTemplate.test.js, o nuovo file employeeSync-validate.test.js
const { validateSyntax } = require('../services/employeeSync/validate');

describe('validateSyntax', () => {
  it('rejects a stato value other than attivo/inattivo', () => {
    const errors = validateSyntax({
      dipendenti: [{ _row: 2, email: 'x@x.it', nome_completo: 'X', ruolo: 'dipendente', sede: 'Torino', stato: 'boh' }],
      sedi: [{ _row: 2, nome_sede: 'Torino' }],
    });
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('stato')]));
  });
});
```
Implementare `backend/src/services/employeeSync/validate.js` riusando le stesse regole di `onboarding/validate.js` (email, ruolo, sede esistente) più il controllo `stato` deve essere `attivo`/`inattivo`.

- [ ] **Step 6: Rieseguire e verificare PASS, poi commit**

```bash
cd backend && npm test -- employeeSync
git add backend/src/services/employeeSync/parseTemplate.js backend/src/services/employeeSync/validate.js backend/src/__tests__/employeeSync-parseTemplate.test.js
git commit -m "feat(backend): parseTemplate + validate sintattico per il wizard Aggiorna Dipendenti (Task 6 employee-sync-wizard)"
```

---

## Task 7: Endpoint `GET /api/v1/admin/employee-sync/template`

**Files:**
- Create: `backend/src/services/employeeSync/generateTemplate.js`
- Create: `backend/src/routes/admin/employeeSync.js` (solo questa route per ora, le altre nel Task 8/9)
- Modify: `backend/src/routes/admin.js:143` (mount del nuovo router, subito dopo `onboarding`)
- Test: `backend/src/__tests__/admin-employeeSync-template.test.js`

- [ ] **Step 1: Test — il template generato contiene solo i dipendenti attivi + le sedi**

```js
// backend/src/__tests__/admin-employeeSync-template.test.js
const request = require('supertest');
const ExcelJS = require('exceljs');
const app = require('../app');
const { pool } = require('../db/pool');

describe('GET /api/v1/admin/employee-sync/template', () => {
  it('returns an xlsx with only active employees and existing sites', async () => {
    await pool.query(`UPDATE employees SET active = false WHERE email = 'maria@badge.local'`);

    const res = await request(app)
      .get('/api/v1/admin/employee-sync/template')
      .set('Authorization', `Bearer ${global.testAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const emails = [];
    wb.getWorksheet('Dipendenti').eachRow((row, i) => { if (i > 1) emails.push(row.getCell(2).value); });
    expect(emails).not.toContain('maria@badge.local');

    await pool.query(`UPDATE employees SET active = true WHERE email = 'maria@badge.local'`); // cleanup
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca** (route non esiste, 404)

```bash
cd backend && npm test -- admin-employeeSync-template
```

- [ ] **Step 3: Implementare `generateTemplate.js`**

```js
// backend/src/services/employeeSync/generateTemplate.js
'use strict';

const ExcelJS = require('exceljs');

const DIP_HEADERS = ['nome_completo', 'email', 'telefono', 'ruolo', 'sede', 'matricola', 'stato', 'data_assunzione', 'data_uscita'];
const SEDI_HEADERS = ['nome_sede', 'indirizzo', 'latitudine', 'longitudine', 'raggio_geofence_m'];
const ROLE_LABEL = { employee: 'dipendente', manager: 'responsabile' };

async function generateTemplate({ employees, sites }) {
  const wb = new ExcelJS.Workbook();

  const wsDip = wb.addWorksheet('Dipendenti');
  wsDip.addRow(DIP_HEADERS);
  const siteNameById = new Map(sites.map((s) => [s.id, s.name]));
  for (const e of employees) {
    wsDip.addRow([
      e.name, e.email, e.phone || '', ROLE_LABEL[e.role] || 'dipendente',
      siteNameById.get(e.site_id) || '', e.external_employee_id || '',
      'Attivo', e.hiring_date || '', '',
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

- [ ] **Step 4: Implementare la route**

```js
// backend/src/routes/admin/employeeSync.js
'use strict';

const express = require('express');
const { pool } = require('../../db/pool');
const { generateTemplate } = require('../../services/employeeSync/generateTemplate');
const { resolveTenantScope } = require('../../utils/tenantScope');
const { z } = require('zod');
const { ValidationError } = require('../../utils/errors');

const router = express.Router();

function validateClientId(req, next) {
  if (req.user.role === 'superadmin' && req.query.client_id) {
    if (!z.string().uuid().safeParse(req.query.client_id).success) {
      next(new ValidationError('Invalid client_id'));
      return null;
    }
  }
  return resolveTenantScope(req.user, req.query.client_id);
}

router.get('/template', async (req, res, next) => {
  try {
    const clientId = validateClientId(req, next);
    if (!clientId) return;

    const employees = (await pool.query(
      'SELECT name, email, phone, role, site_id, external_employee_id, hiring_date FROM employees WHERE client_id = $1::uuid AND active = true',
      [clientId]
    )).rows;
    const sites = (await pool.query(
      'SELECT id, name, location, latitude, longitude, geofence_radius_meters FROM sites WHERE client_id = $1::uuid',
      [clientId]
    )).rows;

    const buffer = await generateTemplate({ employees, sites });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="aggiorna-dipendenti.xlsx"');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

- [ ] **Step 5: Montare la route in `admin.js`**

```js
// backend/src/routes/admin.js — aggiungere vicino alla riga 16 (require) e 143 (mount)
const employeeSyncRouter = require('./admin/employeeSync');
// ...
router.use('/employee-sync', employeeSyncRouter);
```

- [ ] **Step 6: Rieseguire il test**

```bash
cd backend && npm test -- admin-employeeSync-template
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/employeeSync/generateTemplate.js backend/src/routes/admin/employeeSync.js backend/src/routes/admin.js backend/src/__tests__/admin-employeeSync-template.test.js
git commit -m "feat(backend): endpoint generazione template Excel pre-compilato (Task 7 employee-sync-wizard)"
```

---

## Task 8: Endpoint `POST /api/v1/admin/employee-sync/preview`

**Files:**
- Modify: `backend/src/routes/admin/employeeSync.js` (aggiunge la route `/preview`)
- Test: `backend/src/__tests__/admin-employeeSync-preview.test.js`

- [ ] **Step 1: Test — preview ritorna il diff strutturato senza scrivere nel DB**

```js
// backend/src/__tests__/admin-employeeSync-preview.test.js
const request = require('supertest');
const ExcelJS = require('exceljs');
const app = require('../app');
const { pool } = require('../db/pool');

async function buildFile(dipendenti) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Dipendenti');
  ws.addRow(['nome_completo', 'email', 'telefono', 'ruolo', 'sede', 'matricola', 'stato', 'data_assunzione', 'data_uscita']);
  for (const d of dipendenti) ws.addRow(d);
  wb.addWorksheet('Sedi').addRow(['nome_sede', 'indirizzo', 'latitudine', 'longitudine', 'raggio_geofence_m']);
  return wb.xlsx.writeBuffer();
}

describe('POST /api/v1/admin/employee-sync/preview', () => {
  it('returns a diff with nuovi/rimossi/modificati and does not write to the DB', async () => {
    const before = await pool.query(`SELECT COUNT(*) FROM employees WHERE client_id = $1`, [global.testClientId]);

    const buffer = await buildFile([
      ['Nuovo Assunto', 'nuovo-preview-test@x.it', '', 'dipendente', 'Torino', '', 'Attivo', '2026-07-01', ''],
    ]);
    const res = await request(app)
      .post('/api/v1/admin/employee-sync/preview')
      .set('Authorization', `Bearer ${global.testAdminToken}`)
      .attach('file', buffer, 'test.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.nuovi).toHaveLength(1);
    expect(res.body.data.nuovi[0].email).toBe('nuovo-preview-test@x.it');

    const after = await pool.query(`SELECT COUNT(*) FROM employees WHERE client_id = $1`, [global.testClientId]);
    expect(after.rows[0].count).toBe(before.rows[0].count); // nessuna scrittura
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

```bash
cd backend && npm test -- admin-employeeSync-preview
```

- [ ] **Step 3: Aggiungere la route, riusando `parseTemplate`/`validate`/`computeDiff`**

```js
// backend/src/routes/admin/employeeSync.js — aggiunte in testa
const multer = require('multer');
const { parseTemplate } = require('../../services/employeeSync/parseTemplate');
const { validateSyntax } = require('../../services/employeeSync/validate');
const { computeDiff } = require('../../services/employeeSync/computeDiff');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

async function runPreviewDiff(buffer, clientId) {
  const data = await parseTemplate(buffer);
  const errors = validateSyntax(data);
  if (errors.length > 0) return { errors, diff: null };

  const dbEmployees = (await pool.query('SELECT * FROM employees WHERE client_id = $1::uuid', [clientId])).rows;
  const sites = (await pool.query('SELECT id, name FROM sites WHERE client_id = $1::uuid', [clientId])).rows;
  const siteIdByName = new Map(sites.map((s) => [s.name, s.id]));

  const diff = computeDiff(data.dipendenti, dbEmployees, siteIdByName);
  return { errors: [], diff };
}

// route aggiunta dopo /template
router.post('/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return next(new ValidationError('Excel file is required'));
    const clientId = validateClientId(req, next);
    if (!clientId) return;

    const { errors, diff } = await runPreviewDiff(req.file.buffer, clientId);
    if (errors.length > 0) return res.json({ data: { errors, ...Object.fromEntries(['nuovi', 'riattivati', 'rimossi', 'modificati', 'anomalie'].map((k) => [k, []])) } });

    res.json({ data: { errors: [], ...diff } });
  } catch (err) {
    next(err);
  }
});

module.exports = { router, runPreviewDiff }; // runPreviewDiff riusato dal Task 9 (apply)
```

Nota: cambia l'export da `module.exports = router` a `module.exports = { router, runPreviewDiff }` — aggiornare anche `admin.js` che lo monta: `const { router: employeeSyncRouter } = require('./admin/employeeSync');` (aggiornare anche il Task 7 se eseguito separatamente da un subagent diverso, per coerenza).

- [ ] **Step 4: Rieseguire il test**

```bash
cd backend && npm test -- admin-employeeSync-preview
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin/employeeSync.js backend/src/routes/admin.js backend/src/__tests__/admin-employeeSync-preview.test.js
git commit -m "feat(backend): endpoint preview diff per il wizard Aggiorna Dipendenti (Task 8 employee-sync-wizard)"
```

---

## Task 9: Endpoint `POST /api/v1/admin/employee-sync/apply` + `GET /export-history`

**Files:**
- Create: `backend/src/services/employeeSync/applyDiff.js`
- Modify: `backend/src/routes/admin/employeeSync.js` (aggiunge `/apply` e `/export-history`)
- Test: `backend/src/__tests__/employeeSync-applyDiff.test.js`, `backend/src/__tests__/admin-employeeSync-apply.test.js`

- [ ] **Step 1: Test unitario di `applyDiff` (mock db client, stesso pattern di `onboarding-apply.test.js`)**

```js
// backend/src/__tests__/employeeSync-applyDiff.test.js
jest.mock('../auth/password', () => ({ hashPassword: jest.fn().mockResolvedValue('HASH') }));
jest.mock('../middleware/audit', () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));

const { applyDiff } = require('../services/employeeSync/applyDiff');

function mockClient(routes) {
  return {
    query: jest.fn().mockImplementation((sql) => {
      for (const [needle, result] of routes) if (sql.includes(needle)) return Promise.resolve(result);
      return Promise.resolve({ rows: [], rowCount: 0 });
    }),
  };
}

describe('applyDiff', () => {
  it('inserts new employees and returns credentials for welcome email', async () => {
    const db = mockClient([['INSERT INTO employees', { rows: [{ id: 'emp-new' }] }]]);
    const diff = { nuovi: [{ email: 'nuovo@x.it', name: 'Nuovo', role: 'employee', site_id: 's1', hiring_date: '2026-07-01' }], riattivati: [], rimossi: [], modificati: [] };
    const res = await applyDiff(db, diff, { clientId: 'client-1' });
    expect(res.credentials).toHaveLength(1);
    expect(res.credentials[0].email).toBe('nuovo@x.it');
  });

  it('reactivates without touching hiring_date', async () => {
    const db = mockClient([['UPDATE employees', { rowCount: 1 }]]);
    const diff = { nuovi: [], riattivati: [{ id: 'emp-1', email: 'x@x.it', hiring_date: '2023-01-01', exit_date: null }], rimossi: [], modificati: [] };
    await applyDiff(db, diff, { clientId: 'client-1' });
    const call = db.query.mock.calls.find((c) => c[0].includes('active = true'));
    expect(call).toBeDefined();
    expect(call[0]).not.toMatch(/hiring_date\s*=/);
  });

  it('deactivates removed employees with exit_date', async () => {
    const db = mockClient([['UPDATE employees', { rowCount: 1 }]]);
    const diff = { nuovi: [], riattivati: [], rimossi: [{ id: 'emp-1', email: 'x@x.it', exit_date: '2026-07-31' }], modificati: [] };
    await applyDiff(db, diff, { clientId: 'client-1' });
    const call = db.query.mock.calls.find((c) => c[0].includes('active = false'));
    expect(call[1]).toContain('2026-07-31');
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

```bash
cd backend && npm test -- employeeSync-applyDiff
```

- [ ] **Step 3: Implementare `applyDiff.js`**

```js
// backend/src/services/employeeSync/applyDiff.js
'use strict';

const { randomBytes } = require('crypto');
const { hashPassword } = require('../../auth/password');
const { logAudit } = require('../../middleware/audit');

function generateTempPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(10), (b) => chars[b % chars.length]).join('');
}

async function applyDiff(db, diff, { clientId }) {
  const credentials = [];

  for (const n of diff.nuovi) {
    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const ins = await db.query(
      `INSERT INTO employees (client_id, email, name, phone, role, site_id, password_hash, assigned_sites, external_employee_id, hiring_date, active, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::UUID[], $9, $10, true, true) RETURNING id`,
      [clientId, n.email, n.name, n.phone || null, n.role, n.site_id, passwordHash,
        n.site_id ? [n.site_id] : [], n.external_employee_id || null, n.hiring_date]
    );
    credentials.push({ id: ins.rows[0].id, email: n.email, name: n.name, password: tempPassword });
    await logAudit(db, { action: 'employee_sync_create', entity: 'employee', entityId: ins.rows[0].id,
      oldValue: null, newValue: { email: n.email, name: n.name }, userId: 'system' });
  }

  for (const r of diff.riattivati) {
    await db.query(
      `UPDATE employees SET active = true, exit_date = NULL WHERE id = $1::uuid`,
      [r.id]
    );
    await logAudit(db, { action: 'employee_sync_reactivate', entity: 'employee', entityId: r.id,
      oldValue: { active: false }, newValue: { active: true }, userId: 'system' });
  }

  for (const rm of diff.rimossi) {
    await db.query(
      `UPDATE employees SET active = false, exit_date = $1 WHERE id = $2::uuid`,
      [rm.exit_date, rm.id]
    );
    await logAudit(db, { action: 'employee_sync_deactivate', entity: 'employee', entityId: rm.id,
      oldValue: { active: true }, newValue: { active: false, exit_date: rm.exit_date }, userId: 'system' });
  }

  for (const m of diff.modificati) {
    const sets = [];
    const params = [];
    let i = 1;
    for (const [field, change] of Object.entries(m.changes)) {
      sets.push(`${field} = $${i}`);
      params.push(change.to);
      i += 1;
    }
    params.push(m.id);
    await db.query(`UPDATE employees SET ${sets.join(', ')} WHERE id = $${i}::uuid`, params);
    await logAudit(db, { action: 'employee_sync_update', entity: 'employee', entityId: m.id,
      oldValue: null, newValue: m.changes, userId: 'system' });
  }

  return { credentials };
}

module.exports = { applyDiff };
```

- [ ] **Step 4: Rieseguire il test unitario**

```bash
cd backend && npm test -- employeeSync-applyDiff
```
Expected: PASS.

- [ ] **Step 5: Test di integrazione end-to-end (preview → apply → verifica DB)**

```js
// backend/src/__tests__/admin-employeeSync-apply.test.js
const request = require('supertest');
const ExcelJS = require('exceljs');
const app = require('../app');
const { pool } = require('../db/pool');

async function buildFile(dipendenti) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Dipendenti');
  ws.addRow(['nome_completo', 'email', 'telefono', 'ruolo', 'sede', 'matricola', 'stato', 'data_assunzione', 'data_uscita']);
  for (const d of dipendenti) ws.addRow(d);
  wb.addWorksheet('Sedi').addRow(['nome_sede', 'indirizzo', 'latitudine', 'longitudine', 'raggio_geofence_m']);
  return wb.xlsx.writeBuffer();
}

describe('POST /api/v1/admin/employee-sync/apply', () => {
  it('creates a new employee end-to-end', async () => {
    const buffer = await buildFile([
      ['Apply Test', 'apply-e2e-test@x.it', '', 'dipendente', 'Torino', '', 'Attivo', '2026-07-01', ''],
    ]);
    const res = await request(app)
      .post('/api/v1/admin/employee-sync/apply')
      .set('Authorization', `Bearer ${global.testAdminToken}`)
      .attach('file', buffer, 'test.xlsx');
    expect(res.status).toBe(200);

    const check = await pool.query(`SELECT active, hiring_date FROM employees WHERE email = 'apply-e2e-test@x.it'`);
    expect(check.rows[0].active).toBe(true);
    expect(check.rows[0].hiring_date.toISOString().slice(0, 10)).toBe('2026-07-01');

    await pool.query(`DELETE FROM employees WHERE email = 'apply-e2e-test@x.it'`); // cleanup
  });

  it('rejects cross-tenant access: an admin from client A cannot preview/apply for client B', async () => {
    const res = await request(app)
      .post('/api/v1/admin/employee-sync/apply')
      .set('Authorization', `Bearer ${global.testAdminToken}`) // admin di client A
      .field('client_id', global.otherClientId) // client B, ignorato per role=admin
      .attach('file', await buildFile([]), 'test.xlsx');
    expect(res.status).toBe(200); // resolveTenantScope ignora client_id per admin, opera sempre sul proprio
    const leaked = await pool.query(`SELECT COUNT(*) FROM employees WHERE client_id = $1`, [global.otherClientId]);
    expect(Number(leaked.rows[0].count)).toBe(0); // nessuna scrittura sull'altro client
  });
});
```

- [ ] **Step 6: Aggiungere `/apply` e `/export-history` alla route**

```js
// backend/src/routes/admin/employeeSync.js — aggiunte
const { applyDiff } = require('../../services/employeeSync/applyDiff');
const { sendEmail, buildEmployeeWelcomeEmail } = require('../../utils/email');
const logger = require('../../utils/logger');

router.post('/apply', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return next(new ValidationError('Excel file is required'));
    const clientId = validateClientId(req, next);
    if (!clientId) return;

    const { errors, diff } = await runPreviewDiff(req.file.buffer, clientId);
    if (errors.length > 0) return res.json({ data: { errors, nuovi: [], riattivati: [], rimossi: [], modificati: [], anomalie: [] } });

    const client = await pool.connect();
    let result;
    try {
      await client.query('BEGIN');
      result = await applyDiff(client, diff, { clientId });
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

    const failedEmails = [];
    for (const cred of result.credentials) {
      try {
        await sendEmail(buildEmployeeWelcomeEmail({ to: cred.email, tempPassword: cred.password, clientName: req.user.name || 'il tuo datore di lavoro' }));
      } catch (emailErr) {
        logger.warn({ action: 'employee_sync_welcome_email_failed', client_id: clientId, employee_email: cred.email, error: emailErr.message });
        failedEmails.push({ id: cred.id, email: cred.email });
      }
    }

    res.json({ data: { errors: [], ...diff, failedEmails } });
  } catch (err) {
    next(err);
  }
});

router.get('/export-history', async (req, res, next) => {
  try {
    const clientId = validateClientId(req, next);
    if (!clientId) return;

    const rows = (await pool.query(
      `SELECT name, email, phone, role, active, hiring_date, exit_date, external_employee_id
       FROM employees WHERE client_id = $1::uuid ORDER BY hiring_date`,
      [clientId]
    )).rows;

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Storico Dipendenti');
    ws.addRow(['nome_completo', 'email', 'telefono', 'ruolo', 'stato', 'data_assunzione', 'data_uscita', 'matricola']);
    for (const r of rows) {
      ws.addRow([r.name, r.email, r.phone || '', r.role, r.active ? 'Attivo' : 'Inattivo', r.hiring_date || '', r.exit_date || '', r.external_employee_id || '']);
    }
    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="storico-dipendenti.xlsx"');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 7: Rieseguire tutti i test employeeSync**

```bash
cd backend && npm test -- employeeSync admin-employeeSync
```
Expected: tutti PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/employeeSync/applyDiff.js backend/src/routes/admin/employeeSync.js backend/src/__tests__/employeeSync-applyDiff.test.js backend/src/__tests__/admin-employeeSync-apply.test.js
git commit -m "feat(backend): endpoint apply diff + export storico completo (Task 9 employee-sync-wizard)"
```

---

## Task 10: Frontend — `EmployeeSyncWizardPage.jsx` + `useEmployeeSync.js`

**Files:**
- Create: `frontend-web/src/features/admin/hooks/useEmployeeSync.js`
- Create: `frontend-web/src/features/admin/pages/EmployeeSyncWizardPage.jsx`
- Test: `frontend-web/src/features/admin/pages/EmployeeSyncWizardPage.test.jsx`

- [ ] **Step 1: Hook, modellato su `useOnboarding.js`**

```js
// frontend-web/src/features/admin/hooks/useEmployeeSync.js
import { useState, useCallback } from 'react';
import apiClient from '../../../services/apiClient';

export const useEmployeeSync = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const downloadTemplate = useCallback(async (clientId) => {
    const params = clientId ? { client_id: clientId } : {};
    const response = await apiClient.get('/api/v1/admin/employee-sync/template', { params, responseType: 'blob' });
    const url = window.URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aggiorna-dipendenti.xlsx';
    a.click();
    window.URL.revokeObjectURL(url);
  }, []);

  const preview = useCallback(async (file) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiClient.post('/api/v1/admin/employee-sync/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data.data;
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Errore nella lettura del file');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const apply = useCallback(async (file) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiClient.post('/api/v1/admin/employee-sync/apply', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data.data;
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Errore nell'applicazione delle modifiche");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const exportHistory = useCallback(async (clientId) => {
    const params = clientId ? { client_id: clientId } : {};
    const response = await apiClient.get('/api/v1/admin/employee-sync/export-history', { params, responseType: 'blob' });
    const url = window.URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'storico-dipendenti.xlsx';
    a.click();
    window.URL.revokeObjectURL(url);
  }, []);

  return { downloadTemplate, preview, apply, exportHistory, loading, error };
};
```

- [ ] **Step 2: Test component (mock dell'hook, verifica i 4 step del wizard)**

```jsx
// frontend-web/src/features/admin/pages/EmployeeSyncWizardPage.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmployeeSyncWizardPage } from './EmployeeSyncWizardPage';
import { useEmployeeSync } from '../hooks/useEmployeeSync';

jest.mock('../hooks/useEmployeeSync');

describe('EmployeeSyncWizardPage', () => {
  it('shows the diff summary after preview and applies on confirm', async () => {
    const mockPreview = jest.fn().mockResolvedValue({
      nuovi: [{ email: 'nuovo@x.it', name: 'Nuovo' }],
      riattivati: [], rimossi: [], modificati: [], anomalie: [], errors: [],
    });
    const mockApply = jest.fn().mockResolvedValue({ nuovi: [], riattivati: [], rimossi: [], modificati: [], anomalie: [] });
    useEmployeeSync.mockReturnValue({
      downloadTemplate: jest.fn(), preview: mockPreview, apply: mockApply,
      exportHistory: jest.fn(), loading: false, error: null,
    });

    render(<EmployeeSyncWizardPage clientId="client-1" />);
    const file = new File(['x'], 'test.xlsx');
    const input = screen.getByLabelText(/carica file/i);
    await userEvent.upload(input, file);

    await waitFor(() => expect(mockPreview).toHaveBeenCalledWith(file));
    expect(await screen.findByText(/nuovo@x.it/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /conferma tutte le modifiche/i }));
    await waitFor(() => expect(mockApply).toHaveBeenCalledWith(file));
  });
});
```

- [ ] **Step 3: Eseguire e verificare che fallisca** (componente non esiste)

```bash
cd frontend-web && npm run test -- EmployeeSyncWizardPage --run
```

- [ ] **Step 4: Implementare il componente**

```jsx
// frontend-web/src/features/admin/pages/EmployeeSyncWizardPage.jsx
import React, { useState, useRef } from 'react';
import {
  Box, Typography, Button, Alert, CircularProgress, Card, CardContent,
  Stack, List, ListItem, ListItemText, Chip,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useEmployeeSync } from '../hooks/useEmployeeSync';

export function EmployeeSyncWizardPage({ clientId }) {
  const { downloadTemplate, preview, apply, loading, error } = useEmployeeSync();
  const [file, setFile] = useState(null);
  const [diff, setDiff] = useState(null);
  const [applied, setApplied] = useState(false);
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setApplied(false);
    const result = await preview(f);
    setDiff(result);
  };

  const handleConfirm = async () => {
    await apply(file);
    setApplied(true);
    setDiff(null);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>Aggiorna Dipendenti</Typography>
        <Stack direction="row" spacing={2} mb={2}>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => downloadTemplate(clientId)}>
            Scarica template
          </Button>
          <Button variant="outlined" component="label" startIcon={<UploadFileIcon />} disabled={loading}>
            {loading ? <CircularProgress size={18} /> : 'Carica file'}
            <input
              ref={fileRef} type="file" hidden aria-label="Carica file"
              accept=".xlsx" onChange={handleUpload}
            />
          </Button>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}
        {applied && <Alert severity="success">Modifiche applicate con successo.</Alert>}

        {diff && (
          <Stack spacing={2}>
            {diff.errors?.length > 0 && (
              <Alert severity="error">{diff.errors.join(' — ')}</Alert>
            )}
            {['nuovi', 'riattivati', 'rimossi', 'modificati'].map((key) => (
              diff[key]?.length > 0 && (
                <Box key={key}>
                  <Typography variant="subtitle2">
                    {{ nuovi: 'Nuovi', riattivati: 'Riattivati', rimossi: 'Rimossi', modificati: 'Modificati' }[key]}
                    {' '}<Chip size="small" label={diff[key].length} />
                  </Typography>
                  <List dense>
                    {diff[key].map((r) => (
                      <ListItem key={r.email}><ListItemText primary={r.email} secondary={r.name} /></ListItem>
                    ))}
                  </List>
                </Box>
              )
            ))}
            {diff.anomalie?.length > 0 && (
              <Alert severity="warning">
                {diff.anomalie.length} dipendente/i risultano assenti dal file caricato rispetto al template scaricato — nessuna azione automatica, verifica se intenzionale.
              </Alert>
            )}
            <Box>
              <Button variant="contained" onClick={handleConfirm} disabled={loading || diff.errors?.length > 0}>
                Conferma tutte le modifiche
              </Button>
            </Box>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Rieseguire il test**

```bash
cd frontend-web && npm run test -- EmployeeSyncWizardPage --run
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/features/admin/hooks/useEmployeeSync.js frontend-web/src/features/admin/pages/EmployeeSyncWizardPage.jsx frontend-web/src/features/admin/pages/EmployeeSyncWizardPage.test.jsx
git commit -m "feat(frontend): wizard Aggiorna Dipendenti con diff e conferma bulk (Task 10 employee-sync-wizard)"
```

---

## Task 11: `EmployeesTab.jsx` — rimozione CSV import + entry point + export storico

**Files:**
- Modify: `frontend-web/src/features/admin/tabs/EmployeesTab.jsx`

- [ ] **Step 1: Aggiornare/aggiungere il test component esistente** (se non esiste un test dedicato a `EmployeesTab`, crearne uno minimale che verifichi l'assenza del vecchio testo "Importazione CSV" e la presenza del nuovo entry point):

```jsx
// frontend-web/src/features/admin/tabs/EmployeesTab.test.jsx (nuovo, se non esiste)
import { render, screen } from '@testing-library/react';
import { EmployeesTab } from './EmployeesTab';

jest.mock('../components/useFetch', () => ({ useFetch: () => ({ data: [], loading: false, error: null, reload: jest.fn() }) }));

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
});
```

- [ ] **Step 2: Eseguire e verificare che falliscano** (il vecchio testo esiste ancora, il nuovo non esiste)

```bash
cd frontend-web && npm run test -- EmployeesTab --run
```

- [ ] **Step 3: Sostituire il blocco "CSV bulk import" (righe 197-242) con l'entry point verso il nuovo wizard + bottone export**

Rimuovere `csvMsg`/`csvClientId`/`csvLoading`/`fileRef`/`handleCsvUpload` (righe 31-34, 86-110) e il blocco JSX corrispondente (righe 197-242), sostituendoli con:

```jsx
import { EmployeeSyncWizardPage } from '../pages/EmployeeSyncWizardPage';
import { useEmployeeSync } from '../hooks/useEmployeeSync';
// ... dentro il componente, aggiungere:
const [syncClientId, setSyncClientId] = useState('');
const { exportHistory } = useEmployeeSync();

// ... nel JSX, al posto del vecchio Card "Importazione CSV":
<Card variant="outlined">
  <CardContent>
    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
      <Typography variant="h6">Aggiorna Dipendenti</Typography>
      <Button variant="outlined" onClick={() => exportHistory(syncClientId)} disabled={!syncClientId}>
        Esporta storico completo
      </Button>
    </Stack>
    <FormControl size="small" required sx={{ minWidth: 200, mb: 2 }}>
      <InputLabel>Cliente</InputLabel>
      <Select label="Cliente" value={syncClientId} onChange={(e) => setSyncClientId(e.target.value)}>
        {clients.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
      </Select>
    </FormControl>
    {syncClientId && <EmployeeSyncWizardPage clientId={syncClientId} />}
  </CardContent>
</Card>
```

- [ ] **Step 4: Rieseguire i test**

```bash
cd frontend-web && npm run test -- EmployeesTab --run
```
Expected: PASS.

- [ ] **Step 5: Verifica manuale nel browser** (dev server locale, login admin, tab Dipendenti → scarica template, carica un file modificato, verifica preview e conferma).

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/features/admin/tabs/EmployeesTab.jsx frontend-web/src/features/admin/tabs/EmployeesTab.test.jsx
git commit -m "feat(frontend): sostituisce import CSV con wizard Aggiorna Dipendenti in EmployeesTab (Task 11 employee-sync-wizard)"
```

---

## Task 12: Rimozione endpoint CSV import legacy

**Files:**
- Modify: `backend/src/routes/admin/employees.js` (rimuove la route `POST /import`, righe 109-240, e lo helper `parseCsv`/`CsvRowSchema` se non più usati altrove)

- [ ] **Step 1: Confermare che non ci siano altri consumer**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge"
grep -rn "employees/import" frontend-web frontend-mobile backend --include="*.js" --include="*.jsx"
```
Expected: nessun risultato oltre al file che si sta per modificare (dopo il Task 11, `EmployeesTab.jsx` non lo chiama più).

- [ ] **Step 2: Rimuovere la route e gli helper non più usati** (`CsvRowSchema`, `parseCsv`, l'import di `csv-parse`) da `backend/src/routes/admin/employees.js`.

- [ ] **Step 3: Rimuovere/aggiornare i test esistenti che coprivano `POST /import`** (cercarli con `grep -rln "employees/import" backend/src/__tests__`) — se il progetto vuole preservare la copertura storica, spostarli in un file `*.skip.js` non eseguito; altrimenti rimuoverli.

- [ ] **Step 4: Suite completa verde**

```bash
cd backend && npm run test:coverage
```
Expected: 0 failures.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin/employees.js
git commit -m "chore(backend): rimuove endpoint CSV import legacy, sostituito dal wizard Aggiorna Dipendenti (Task 12 employee-sync-wizard)"
```

---

## Task 13: Test E2E golden path completo

**Files:**
- Create: `scripts/smoke-test-employee-sync.sh` (stile identico a `scripts/smoke-test-staging.sh`: niente credenziali hardcoded, argomenti da riga di comando)

- [ ] **Step 1: Scrivere lo script**

```bash
#!/usr/bin/env bash
# scripts/smoke-test-employee-sync.sh — Golden path E2E per il wizard Aggiorna Dipendenti.
# Uso: ./scripts/smoke-test-employee-sync.sh <base_url> <admin_email> <admin_password> <client_id>
set -euo pipefail

BASE_URL="${1:?Uso: $0 <base_url> <admin_email> <admin_password> <client_id>}"
ADMIN_EMAIL="${2:?Manca admin_email}"
ADMIN_PASSWORD="${3:?Manca admin_password}"
CLIENT_ID="${4:?Manca client_id}"
FAIL=0

step() { echo "▶ $1"; }
pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; FAIL=1; }

step "Login admin"
TOKEN=$(curl -sf -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['token'])")
[ -n "$TOKEN" ] && pass "Login OK" || { fail "Login fallito"; exit 1; }

step "Scarica template pre-compilato"
curl -sf "$BASE_URL/api/v1/admin/employee-sync/template?client_id=$CLIENT_ID" \
  -H "Authorization: Bearer $TOKEN" -o /tmp/employee-sync-template.xlsx
[ -s /tmp/employee-sync-template.xlsx ] && pass "Template scaricato" || { fail "Template vuoto/mancante"; exit 1; }

step "Preview: carica lo stesso file senza modifiche (nessuna variazione attesa)"
PREVIEW_RES=$(curl -sf -X POST "$BASE_URL/api/v1/admin/employee-sync/preview" \
  -H "Authorization: Bearer $TOKEN" -F "file=@/tmp/employee-sync-template.xlsx")
NUOVI=$(echo "$PREVIEW_RES" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']['nuovi']))")
[ "$NUOVI" = "0" ] && pass "Nessuna variazione rilevata su file invariato" || fail "Variazioni inattese su file invariato: $PREVIEW_RES"

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "🎉 SMOKE TEST: TUTTI I PASSI SUPERATI"
  exit 0
else
  echo "💥 SMOKE TEST: ALMENO UN PASSO FALLITO — vedi sopra"
  exit 1
fi
```

- [ ] **Step 2: Renderlo eseguibile e testarlo contro l'ambiente di staging**

```bash
chmod +x scripts/smoke-test-employee-sync.sh
./scripts/smoke-test-employee-sync.sh https://staging-api.dataxiom.it admin@example.it '<password>' '<client_id>'
```
Expected: tutti i passi verdi.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke-test-employee-sync.sh
git commit -m "test: smoke test E2E golden path per il wizard Aggiorna Dipendenti (Task 13 employee-sync-wizard)"
```

---

## Task 14: `/test-all` + code review finale + aggiornamento `TASKS.md`

- [ ] **Step 1: Suite completa**

```bash
cd backend && npm run test:coverage
cd ../frontend-web && npm run test -- --run
```
Expected: 0 failures su entrambe.

- [ ] **Step 2: Code review** (pattern già usato in altre sessioni di questo progetto: bug-scan + coerenza CLAUDE.md + coerenza storica) sull'intero branch/diff da `main`.

- [ ] **Step 3: Aggiornare `TASKS.md`**: aggiungere una entry per questo progetto (es. sotto `BACKLOG — Onboarding Cliente & Saldi` o una nuova sezione dedicata), marcata chiusa con riferimento a spec e piano.

- [ ] **Step 4: Commit**

```bash
git add TASKS.md
git commit -m "docs: chiude implementazione wizard Aggiorna Dipendenti (Task 14 employee-sync-wizard)"
```

---

## Self-Review (eseguita in fase di scrittura del piano)

**Copertura spec:** tutte le 10 decisioni della spec hanno un task corrispondente (1→Task 1/3/4, 2→Task 12, 3→Task 4, 4→Task 1, 5→Task 5/6, 6→Task 5, 7→Task 7, 8→Task 5/9, 9→Task 10, 10→Task 9/11). Il rischio "filtro active in tutte le query" ha un task dedicato (Task 2) con pattern esplicito e rimando alla checklist del Task 0.

**Placeholder scan:** nessun "TBD"/"da definire" nei passi di codice; il Task 2 usa esplicitamente il pattern "descrivi una volta, applica alle rimanenti" per una modifica ripetitiva su ~15 file, coerente con la guida di progetto per compiti che ripetono lo stesso pattern.

**Coerenza tipi:** `computeDiff` ritorna sempre le chiavi `{ nuovi, riattivati, rimossi, modificati, anomalie }` — stesso nome usato in `applyDiff`, nella route `/preview` e `/apply`, e nel componente frontend.
