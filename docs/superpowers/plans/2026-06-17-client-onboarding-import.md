# Client Onboarding Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Dataxiom-operated CLI script (`scripts/onboard-client.js`) that ingests a client's 3-sheet onboarding Excel (Azienda / Sedi / Dipendenti+saldi) and populates the Badge System DB (client → sites → employees → leave balances), safely and re-runnably.

**Architecture:** A thin CLI entry orchestrates focused, independently testable modules: `parseWorkbook` (Excel → normalized JS), `validate` (pure file-level checks + business warnings), `validateAgainstDb` (collision checks vs existing rows), `apply` (idempotent upserts + audit, inside one transaction), `preview` (dry-run report), `writeCredentials` (post-commit secrets file). All writes happen in a single DB transaction; the credentials file is written **only after commit**.

**Tech Stack:** Node 20, `exceljs` (new devDependency, script-only), `pg` via existing `pool`/`withTransaction`, Jest for tests. Reuses `hashPassword` (`src/auth/password.js`), `logAudit` (`src/middleware/audit.js`).

---

## Critical Analysis — the 9 problems and why these solutions

The first design draft was an "all-or-nothing one-shot". Real concierge onboarding is iterative (clients send corrections), so the design is now **re-runnable and DB-aware**. Each decision below is justified, biased toward an efficient operator process and a frictionless client experience.

1. **Idempotency, not rigid all-or-nothing.** Re-running the same (or corrected) file must be safe. → `apply` uses *find-or-create* for the client and sites, *insert-or-update-profile* for employees (never resets an existing employee's password), and *conditional upsert* for saldi (only overwrites a balance that hasn't been used yet, `used_days = 0`). This makes "the client forgot 2 people" a 10-second re-run, not a DB wipe.
2. **Validate against the DB, not just the file.** File-level checks can't catch a `matricola` that already exists for another employee, or a client email already taken. → `validateAgainstDb` runs inside the transaction before any write, and aborts with row-level messages.
3. **Normalize inputs.** Excel introduces trailing spaces and mixed-case emails that silently break the `sede ↔ nome_sede` join and uniqueness. → `parseWorkbook` trims every string and lowercases emails before anything else sees the data.
4. **Credentials file written only after commit + secured.** A temp-password file written before a rollback would be an orphaned secret. → `writeCredentials` runs only after the transaction commits; the path is `.gitignore`d; the CLI prints a reminder to deliver securely and delete.
5. **Audit logging.** Onboarding creates tenants/users — it must be traceable. → `apply` calls `logAudit` for the client, each site, and each employee.
6. **Dry-run with preview.** Operators need to catch silent mistakes (e.g., all employees on one site) before writing. → `--dry-run` prints counts per site + a sample + warnings, and writes nothing.
7. **`total_days = residuo` is a known simplification.** We store the residual as the total with `used_days = 0`, losing the accrued/used split. Acceptable for MVP; documented in code and spec.
8. **`year = current` ignores carryover.** Mid-year residuals mix prior-year carryover; all stored under the current year. Documented simplification.
9. **Business-rule warnings (non-blocking).** A site with no `responsabile`, or a duplicate `matricola` in-file, are warned (not blocked) so the operator can decide.

**Known limitations carried from prior decisions:** saldi are whole-day integers (half-days / ROL-in-hours tracked in TASKS `ONB.2`).

---

## File Structure

```
backend/
├── scripts/
│   ├── onboard-client.js              ← CLI entry: arg parse, orchestrate, output (thin)
│   └── onboarding/
│       ├── parseWorkbook.js           ← Excel (.xlsx) → { azienda, sedi, dipendenti } normalized
│       ├── validate.js                ← pure file-level errors[] + warnings[]
│       ├── validateAgainstDb.js       ← DB collision checks (client email, employee email/matricola, sites)
│       ├── apply.js                   ← idempotent upserts (client→sites→employees→saldi) + audit
│       ├── preview.js                 ← format dry-run report (counts, sample, warnings)
│       └── writeCredentials.js        ← write temp-password CSV AFTER commit
└── src/__tests__/
    ├── onboarding-parse.test.js
    ├── onboarding-validate.test.js
    ├── onboarding-validateDb.test.js
    ├── onboarding-apply.test.js
    └── onboarding-credentials.test.js
```

**Constants (defined once, in `parseWorkbook.js`, re-exported as needed):**

```js
const ROLE_MAP = { dipendente: 'employee', responsabile: 'manager' };
const SALDO_COLUMNS = {            // Excel column → leave_type code
  ferie_giorni: 'FERIE_1',
  permessi_giorni: 'FERIE_2',
  exfestivita_giorni: 'FERIE_3',
};
```

---

## Task 0: Add `exceljs` devDependency + gitignore credentials

**Files:**
- Modify: `backend/package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Install exceljs as a devDependency**

Run:
```bash
cd backend && npm install --save-dev exceljs@4.4.0
```
Expected: `package.json` gains `"exceljs": "^4.4.0"` under `devDependencies`, lockfile updated.

- [ ] **Step 2: Verify it resolves from the project (uuid-lesson check)**

Run:
```bash
cd backend && node -e "console.log(require.resolve('exceljs'))"
```
Expected: a path **inside** `backend/node_modules/exceljs`, not `~/node_modules`.

- [ ] **Step 3: Gitignore the credentials output**

Add to `.gitignore`:
```
# Onboarding temp-password output (never commit plaintext credentials)
backend/scripts/onboarding-output/
```

- [ ] **Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json .gitignore
git commit -m "chore: add exceljs devDep + gitignore onboarding credentials"
```

---

## Task 1: `parseWorkbook` — Excel → normalized data

**Files:**
- Create: `backend/scripts/onboarding/parseWorkbook.js`
- Test: `backend/src/__tests__/onboarding-parse.test.js`

Normalization rules: trim every string; lowercase every email; empty string → `null`; numeric saldi parsed as integers (blank → `0`).

- [ ] **Step 1: Write the failing test**

```js
// backend/src/__tests__/onboarding-parse.test.js
const path = require('path');
const { parseWorkbook, ROLE_MAP, SALDO_COLUMNS } = require('../../scripts/onboarding/parseWorkbook');

const EXAMPLE = path.join(__dirname, '..', '..', 'scripts', 'seed-data', 'onboarding-template-esempio.xlsx');

describe('parseWorkbook', () => {
  it('parses azienda, 3 sedi, 15 dipendenti from the example file', async () => {
    const data = await parseWorkbook(EXAMPLE);
    expect(data.azienda.ragione_sociale).toBe('Supermercati Rossi SRL');
    expect(data.azienda.email_referente).toBe('amministrazione@supermercatirossi.it');
    expect(data.sedi).toHaveLength(3);
    expect(data.dipendenti).toHaveLength(15);
  });

  it('normalizes: trims strings, lowercases emails, blanks→null/0', async () => {
    const data = await parseWorkbook(EXAMPLE);
    const e = data.dipendenti.find((d) => d.nome_completo === 'Laura Conti');
    expect(e.email).toBe(e.email.toLowerCase());
    expect(e.ruolo).toBe('responsabile');
    expect(typeof e.ferie_giorni).toBe('number');
    // a dipendente with blank exfestivita would be 0, never undefined
    expect(data.dipendenti.every((d) => Number.isInteger(d.permessi_giorni))).toBe(true);
  });

  it('exposes ROLE_MAP and SALDO_COLUMNS constants', () => {
    expect(ROLE_MAP.dipendente).toBe('employee');
    expect(ROLE_MAP.responsabile).toBe('manager');
    expect(SALDO_COLUMNS.ferie_giorni).toBe('FERIE_1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest onboarding-parse -t parseWorkbook`
Expected: FAIL — `Cannot find module '../../scripts/onboarding/parseWorkbook'`.

- [ ] **Step 3: Write the implementation**

```js
// backend/scripts/onboarding/parseWorkbook.js
'use strict';

const ExcelJS = require('exceljs');

const ROLE_MAP = { dipendente: 'employee', responsabile: 'manager' };
const SALDO_COLUMNS = {
  ferie_giorni: 'FERIE_1',
  permessi_giorni: 'FERIE_2',
  exfestivita_giorni: 'FERIE_3',
};

function norm(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function normEmail(v) {
  const s = norm(v);
  return s ? s.toLowerCase() : null;
}
function normInt(v) {
  if (v === null || v === undefined || String(v).trim() === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : NaN; // NaN flagged later by validate
}

/** Read a sheet into array-of-objects keyed by the header row (row 1). */
function readSheet(ws) {
  if (!ws) return [];
  const headers = (ws.getRow(1).values || []).map((h) => (h == null ? '' : String(h).trim()));
  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = { _row: rowNumber, _sheet: ws.name };
    let hasValue = false;
    for (let c = 1; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      const cell = row.getCell(c);
      const val = cell && cell.value && cell.value.text ? cell.value.text : cell.value; // hyperlink/richtext safe
      if (val !== null && val !== undefined && String(val).trim() !== '') hasValue = true;
      obj[key] = val;
    }
    if (hasValue) rows.push(obj);
  });
  return rows;
}

async function parseWorkbook(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const aziendaRows = readSheet(wb.getWorksheet('Azienda'));
  const sediRows = readSheet(wb.getWorksheet('Sedi'));
  const dipRows = readSheet(wb.getWorksheet('Dipendenti'));

  const a = aziendaRows[0] || {};
  const azienda = {
    ragione_sociale: norm(a.ragione_sociale),
    email_referente: normEmail(a.email_referente),
    ore_min_buono_pasto: a.ore_min_buono_pasto == null || String(a.ore_min_buono_pasto).trim() === ''
      ? null : Number(a.ore_min_buono_pasto),
  };

  const sedi = sediRows.map((s) => ({
    _row: s._row,
    nome_sede: norm(s.nome_sede),
    indirizzo: norm(s.indirizzo),
    latitudine: s.latitudine == null || String(s.latitudine).trim() === '' ? null : Number(s.latitudine),
    longitudine: s.longitudine == null || String(s.longitudine).trim() === '' ? null : Number(s.longitudine),
    raggio_geofence_m: s.raggio_geofence_m == null || String(s.raggio_geofence_m).trim() === ''
      ? null : Number(s.raggio_geofence_m),
  }));

  const dipendenti = dipRows.map((d) => ({
    _row: d._row,
    nome_completo: norm(d.nome_completo),
    email: normEmail(d.email),
    telefono: norm(d.telefono),
    ruolo: (norm(d.ruolo) || '').toLowerCase() || null,
    sede: norm(d.sede),
    matricola: norm(d.matricola),
    ferie_giorni: normInt(d.ferie_giorni),
    permessi_giorni: normInt(d.permessi_giorni),
    exfestivita_giorni: normInt(d.exfestivita_giorni),
  }));

  return { azienda, sedi, dipendenti };
}

module.exports = { parseWorkbook, ROLE_MAP, SALDO_COLUMNS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest onboarding-parse`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/onboarding/parseWorkbook.js backend/src/__tests__/onboarding-parse.test.js
git commit -m "feat(onboarding): parseWorkbook — Excel to normalized data"
```

---

## Task 2: `validate` — pure file-level errors + business warnings

**Files:**
- Create: `backend/scripts/onboarding/validate.js`
- Test: `backend/src/__tests__/onboarding-validate.test.js`

Returns `{ errors: string[], warnings: string[] }`. Errors block; warnings don't. Addresses problems #2 (file half), #9.

- [ ] **Step 1: Write the failing test**

```js
// backend/src/__tests__/onboarding-validate.test.js
const { validate } = require('../../scripts/onboarding/validate');

const base = () => ({
  azienda: { ragione_sociale: 'X SRL', email_referente: 'a@x.it', ore_min_buono_pasto: 5 },
  sedi: [{ _row: 2, nome_sede: 'Milano', indirizzo: 'Via 1', latitudine: null, longitudine: null, raggio_geofence_m: null }],
  dipendenti: [
    { _row: 2, nome_completo: 'Mario Rossi', email: 'mario@x.it', telefono: null, ruolo: 'responsabile', sede: 'Milano', matricola: 'M1', ferie_giorni: 10, permessi_giorni: 2, exfestivita_giorni: 0 },
  ],
});

describe('validate', () => {
  it('passes a well-formed workbook with no errors', () => {
    const r = validate(base());
    expect(r.errors).toEqual([]);
  });

  it('errors on missing required azienda fields', () => {
    const d = base(); d.azienda.ragione_sociale = null;
    expect(validate(d).errors.join()).toMatch(/ragione_sociale/);
  });

  it('errors on invalid email, bad role, and unknown sede reference', () => {
    const d = base();
    d.dipendenti[0].email = 'not-an-email';
    d.dipendenti[0].ruolo = 'capo';
    d.dipendenti[0].sede = 'Roma';
    const e = validate(d).errors.join('\n');
    expect(e).toMatch(/riga 2.*email/i);
    expect(e).toMatch(/ruolo/i);
    expect(e).toMatch(/sede.*Roma/i);
  });

  it('errors on duplicate employee email and negative/NaN saldo', () => {
    const d = base();
    d.dipendenti.push({ ...d.dipendenti[0], _row: 3, matricola: 'M2' });
    d.dipendenti[1].ferie_giorni = -5;
    const e = validate(d).errors.join('\n');
    expect(e).toMatch(/email.*duplicat/i);
    expect(e).toMatch(/saldo|negativ/i);
  });

  it('warns (not errors) on a sede without a responsabile and duplicate matricola', () => {
    const d = base();
    d.dipendenti[0].ruolo = 'employee' === 'employee' ? 'dipendente' : 'dipendente'; // no responsabile on Milano
    d.dipendenti.push({ ...d.dipendenti[0], _row: 3, email: 'b@x.it' }); // duplicate matricola M1
    const r = validate(d);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join('\n')).toMatch(/Milano.*responsabile/i);
    expect(r.warnings.join('\n')).toMatch(/matricola.*M1/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest onboarding-validate`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// backend/scripts/onboarding/validate.js
'use strict';

const { ROLE_MAP } = require('./parseWorkbook');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SALDO_KEYS = ['ferie_giorni', 'permessi_giorni', 'exfestivita_giorni'];

function validate(data) {
  const errors = [];
  const warnings = [];

  // --- Azienda ---
  if (!data.azienda.ragione_sociale) errors.push('Foglio Azienda: ragione_sociale obbligatoria.');
  if (!data.azienda.email_referente) errors.push('Foglio Azienda: email_referente obbligatoria.');
  else if (!EMAIL_RE.test(data.azienda.email_referente)) errors.push('Foglio Azienda: email_referente non valida.');

  // --- Sedi ---
  const sedeNames = new Set();
  for (const s of data.sedi) {
    if (!s.nome_sede) { errors.push(`Foglio Sedi riga ${s._row}: nome_sede obbligatorio.`); continue; }
    if (sedeNames.has(s.nome_sede)) errors.push(`Foglio Sedi riga ${s._row}: nome_sede "${s.nome_sede}" duplicato.`);
    sedeNames.add(s.nome_sede);
    const hasLat = s.latitudine != null, hasLng = s.longitudine != null;
    if (hasLat !== hasLng) errors.push(`Foglio Sedi riga ${s._row}: latitudine e longitudine vanno compilate insieme.`);
  }

  // --- Dipendenti ---
  const seenEmail = new Set();
  const matricolaCount = new Map();
  const responsabiliPerSede = new Map();
  for (const name of sedeNames) responsabiliPerSede.set(name, 0);

  for (const d of data.dipendenti) {
    const at = `Foglio Dipendenti riga ${d._row}`;
    if (!d.nome_completo) errors.push(`${at}: nome_completo obbligatorio.`);
    if (!d.email) errors.push(`${at}: email obbligatoria.`);
    else {
      if (!EMAIL_RE.test(d.email)) errors.push(`${at}: email "${d.email}" non valida.`);
      if (seenEmail.has(d.email)) errors.push(`${at}: email "${d.email}" duplicata nel file.`);
      seenEmail.add(d.email);
    }
    if (!d.ruolo || !ROLE_MAP[d.ruolo]) errors.push(`${at}: ruolo deve essere "dipendente" o "responsabile" (trovato: ${d.ruolo || 'vuoto'}).`);
    if (!d.sede) errors.push(`${at}: sede obbligatoria.`);
    else if (!sedeNames.has(d.sede)) errors.push(`${at}: sede "${d.sede}" non corrisponde a nessun nome_sede del foglio Sedi.`);
    else if (d.ruolo === 'responsabile') responsabiliPerSede.set(d.sede, (responsabiliPerSede.get(d.sede) || 0) + 1);

    for (const k of SALDO_KEYS) {
      const v = d[k];
      if (Number.isNaN(v)) errors.push(`${at}: ${k} non è un numero valido.`);
      else if (v < 0) errors.push(`${at}: ${k} non può essere negativo (saldo).`);
    }
    if (d.matricola) matricolaCount.set(d.matricola, (matricolaCount.get(d.matricola) || 0) + 1);
  }

  // --- Warnings (non-blocking, problem #9) ---
  for (const [sede, count] of responsabiliPerSede) {
    if (count === 0) warnings.push(`La sede "${sede}" non ha nessun responsabile (manager).`);
  }
  for (const [mat, count] of matricolaCount) {
    if (count > 1) warnings.push(`Matricola "${mat}" usata ${count} volte nel file.`);
  }

  return { errors, warnings };
}

module.exports = { validate };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest onboarding-validate`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/onboarding/validate.js backend/src/__tests__/onboarding-validate.test.js
git commit -m "feat(onboarding): validate — file-level errors + business warnings"
```

---

## Task 3: `validateAgainstDb` — collision checks vs existing rows

**Files:**
- Create: `backend/scripts/onboarding/validateAgainstDb.js`
- Test: `backend/src/__tests__/onboarding-validateDb.test.js`

Takes a `db` (pg client) and the parsed `data` + `{ clientId }` (null for new client). Returns `string[]` of blocking errors. Addresses problem #2 (DB half).

Rules:
- New client (`clientId == null`): error if `clients.email = azienda.email_referente` already exists.
- Existing client (`clientId` set): error for each `dipendenti.email` already present **for that client** (would be an update — allowed), so instead we only error on **matricola** collisions where the matricola belongs to a *different* email. Email already-present is fine (upsert). Matricola unique per client (DB index) must hold.

- [ ] **Step 1: Write the failing test**

```js
// backend/src/__tests__/onboarding-validateDb.test.js
const { validateAgainstDb } = require('../../scripts/onboarding/validateAgainstDb');

function mockDb(responses) {
  // responses: array of { rows } returned in call order
  let i = 0;
  return { query: jest.fn().mockImplementation(() => Promise.resolve(responses[i++] || { rows: [] })) };
}

const data = {
  azienda: { email_referente: 'admin@new.it' },
  dipendenti: [
    { _row: 2, email: 'a@x.it', matricola: 'M1' },
    { _row: 3, email: 'b@x.it', matricola: 'M2' },
  ],
};

describe('validateAgainstDb', () => {
  it('new client: errors if client email already exists', async () => {
    const db = mockDb([{ rows: [{ id: 'c1' }] }]); // clients lookup returns a row
    const errs = await validateAgainstDb(db, data, { clientId: null });
    expect(errs.join()).toMatch(/azienda.*email.*esiste/i);
  });

  it('new client: passes when client email is free', async () => {
    const db = mockDb([{ rows: [] }]);
    const errs = await validateAgainstDb(db, data, { clientId: null });
    expect(errs).toEqual([]);
  });

  it('existing client: errors when a matricola belongs to a different employee', async () => {
    // clientId set → skip client email check; matricola M1 already used by other@x.it
    const db = mockDb([{ rows: [{ external_employee_id: 'M1', email: 'other@x.it' }] }]);
    const errs = await validateAgainstDb(db, data, { clientId: 'c1' });
    expect(errs.join()).toMatch(/matricola.*M1/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest onboarding-validateDb`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// backend/scripts/onboarding/validateAgainstDb.js
'use strict';

async function validateAgainstDb(db, data, { clientId }) {
  const errors = [];

  if (!clientId) {
    const r = await db.query('SELECT id FROM clients WHERE lower(email) = lower($1) LIMIT 1', [data.azienda.email_referente]);
    if (r.rows.length > 0) {
      errors.push(`Foglio Azienda: un cliente con email "${data.azienda.email_referente}" esiste già. Usa --client-id per aggiungere a quello esistente.`);
    }
    return errors; // new client → no employees exist yet to collide with
  }

  // Existing client: matricole must remain unique per client (DB has a partial unique index).
  const fileMatricole = data.dipendenti.filter((d) => d.matricola).map((d) => d.matricola);
  if (fileMatricole.length > 0) {
    const r = await db.query(
      'SELECT external_employee_id, lower(email) AS email FROM employees WHERE client_id = $1::uuid AND external_employee_id = ANY($2)',
      [clientId, fileMatricole]
    );
    const fileByMatricola = new Map(data.dipendenti.filter((d) => d.matricola).map((d) => [d.matricola, d.email]));
    for (const row of r.rows) {
      const fileEmail = fileByMatricola.get(row.external_employee_id);
      if (fileEmail && fileEmail !== row.email) {
        errors.push(`Matricola "${row.external_employee_id}" è già assegnata a ${row.email} per questo cliente (nel file è su ${fileEmail}).`);
      }
    }
  }
  return errors;
}

module.exports = { validateAgainstDb };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest onboarding-validateDb`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/onboarding/validateAgainstDb.js backend/src/__tests__/onboarding-validateDb.test.js
git commit -m "feat(onboarding): validateAgainstDb — DB collision checks"
```

---

## Task 4: `apply` — idempotent upserts + audit

**Files:**
- Create: `backend/scripts/onboarding/apply.js`
- Test: `backend/src/__tests__/onboarding-apply.test.js`

Signature: `apply(db, data, { clientId, year }) → { clientId, summary, credentials }` where `db` is a transaction client. Reuses `hashPassword` and `logAudit`. Addresses problems #1, #5, #7, #8.

Behavior:
- **Client:** if `clientId` given, use it. Else INSERT clients(name, email, plan='starter') and audit.
- **Sites:** for each sede, *find-or-create* by `(client_id, name)` (SELECT then INSERT with generated QR). Build `nome_sede → site_id` map. Audit on create.
- **Employees:** for each dipendente, SELECT by `(client_id, email)`:
  - **new** → generate temp password, `hashPassword`, INSERT (role mapped, site_id, assigned_sites = `[site_id]`, external_employee_id, must_change_password=true), push to `credentials`. Audit.
  - **existing** → UPDATE profile only (name, phone, role, site_id, external_employee_id) — **never touch password**. Not in credentials.
- **Saldi:** for each of the 3 columns with a value > 0, upsert `leave_saldi(client_id, user_id, leave_type, year, total_days, used_days=0)` with `ON CONFLICT (user_id, leave_type, year) DO UPDATE SET total_days=EXCLUDED.total_days, updated_at=NOW() WHERE leave_saldi.used_days = 0` (problem #1/#7: don't clobber a balance already in use).

- [ ] **Step 1: Write the failing test**

```js
// backend/src/__tests__/onboarding-apply.test.js
jest.mock('../auth/password', () => ({ hashPassword: jest.fn().mockResolvedValue('HASH') }));
jest.mock('../middleware/audit', () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));

const { apply } = require('../../scripts/onboarding/apply');
const { logAudit } = require('../middleware/audit');

/** Mock pg client: routes queries by SQL substring to canned results. */
function mockClient(routes) {
  return {
    query: jest.fn().mockImplementation((sql) => {
      for (const [needle, result] of routes) if (sql.includes(needle)) return Promise.resolve(result);
      return Promise.resolve({ rows: [] });
    }),
  };
}

const data = {
  azienda: { ragione_sociale: 'X SRL', email_referente: 'admin@x.it', ore_min_buono_pasto: 5 },
  sedi: [{ _row: 2, nome_sede: 'Milano', indirizzo: 'Via 1', latitudine: null, longitudine: null, raggio_geofence_m: null }],
  dipendenti: [
    { _row: 2, nome_completo: 'Mario Rossi', email: 'mario@x.it', telefono: null, ruolo: 'responsabile', sede: 'Milano', matricola: 'M1', ferie_giorni: 10, permessi_giorni: 0, exfestivita_giorni: 0 },
  ],
};

describe('apply', () => {
  it('creates client, site, new employee (with temp password) and saldo', async () => {
    const db = mockClient([
      ['INSERT INTO clients', { rows: [{ id: 'client-1' }] }],
      ['SELECT id FROM sites', { rows: [] }],                    // site not found → create
      ['INSERT INTO sites', { rows: [{ id: 'site-1' }] }],
      ['SELECT id FROM employees', { rows: [] }],                // employee not found → create
      ['INSERT INTO employees', { rows: [{ id: 'emp-1' }] }],
    ]);
    const res = await apply(db, data, { clientId: null, year: 2026 });
    expect(res.clientId).toBe('client-1');
    expect(res.credentials).toHaveLength(1);
    expect(res.credentials[0]).toMatchObject({ email: 'mario@x.it', nome: 'Mario Rossi', ruolo: 'responsabile' });
    expect(res.credentials[0].password).toEqual(expect.any(String));
    expect(res.summary).toMatchObject({ sedi: 1, dipendenti_creati: 1, dipendenti_aggiornati: 0, saldi: 1 });
    expect(logAudit).toHaveBeenCalled();
    // saldo upsert is conditional on used_days = 0
    const saldoCall = db.query.mock.calls.find((c) => c[0].includes('INTO leave_saldi'));
    expect(saldoCall[0]).toMatch(/used_days\s*=\s*0/);
  });

  it('updates an existing employee WITHOUT resetting password and skips credentials', async () => {
    const db = mockClient([
      ['SELECT id FROM sites', { rows: [{ id: 'site-1' }] }],   // site exists → reuse
      ['SELECT id FROM employees', { rows: [{ id: 'emp-1' }] }], // employee exists → update
      ['UPDATE employees', { rows: [{ id: 'emp-1' }] }],
    ]);
    const res = await apply(db, data, { clientId: 'client-1', year: 2026 });
    expect(res.credentials).toHaveLength(0);
    expect(res.summary).toMatchObject({ dipendenti_creati: 0, dipendenti_aggiornati: 1 });
    const touchedPassword = db.query.mock.calls.some((c) => /password_hash/.test(c[0]) && /UPDATE employees/.test(c[0]));
    expect(touchedPassword).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest onboarding-apply`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// backend/scripts/onboarding/apply.js
'use strict';

const { randomUUID, randomBytes } = require('crypto');
const { hashPassword } = require('../../src/auth/password');
const { logAudit } = require('../../src/middleware/audit');
const { ROLE_MAP, SALDO_COLUMNS } = require('./parseWorkbook');

function generateTempPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function apply(db, data, { clientId, year }) {
  const credentials = [];
  const summary = { sedi: 0, dipendenti_creati: 0, dipendenti_aggiornati: 0, saldi: 0 };

  // 1) Client (find-or-create)
  if (!clientId) {
    const r = await db.query(
      'INSERT INTO clients (name, email, plan) VALUES ($1, $2, $3) RETURNING id',
      [data.azienda.ragione_sociale, data.azienda.email_referente, 'starter']
    );
    clientId = r.rows[0].id;
    await logAudit(db, { action: 'onboard_create_client', entity: 'client', entityId: clientId,
      oldValue: null, newValue: { name: data.azienda.ragione_sociale, email: data.azienda.email_referente }, userId: 'system' });
  }

  // 2) Sites (find-or-create by client_id + name)
  const siteIdByName = new Map();
  for (const s of data.sedi) {
    const found = await db.query('SELECT id FROM sites WHERE client_id = $1::uuid AND name = $2 LIMIT 1', [clientId, s.nome_sede]);
    if (found.rows.length > 0) {
      siteIdByName.set(s.nome_sede, found.rows[0].id);
      continue;
    }
    const siteId = randomUUID();
    const qr = `badge://checkin?site_id=${siteId}&client_id=${clientId}&v=1`;
    const ins = await db.query(
      'INSERT INTO sites (id, client_id, name, location, qr_code_content) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [siteId, clientId, s.nome_sede, s.indirizzo, qr]
    );
    siteIdByName.set(s.nome_sede, ins.rows[0].id);
    summary.sedi += 1;
    await logAudit(db, { action: 'onboard_create_site', entity: 'site', entityId: siteId,
      oldValue: null, newValue: { name: s.nome_sede, client_id: clientId }, userId: 'system' });
  }

  // 3) Employees (insert-or-update-profile; never reset existing password)
  for (const d of data.dipendenti) {
    const role = ROLE_MAP[d.ruolo];
    const siteId = siteIdByName.get(d.sede);
    const existing = await db.query('SELECT id FROM employees WHERE client_id = $1::uuid AND email = $2 LIMIT 1', [clientId, d.email]);

    let employeeId;
    if (existing.rows.length === 0) {
      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);
      const ins = await db.query(
        `INSERT INTO employees (client_id, email, name, phone, role, site_id, password_hash, assigned_sites, external_employee_id, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::UUID[], $9, true) RETURNING id`,
        [clientId, d.email, d.nome_completo, d.telefono, role, siteId, passwordHash, siteId ? [siteId] : [], d.matricola]
      );
      employeeId = ins.rows[0].id;
      summary.dipendenti_creati += 1;
      credentials.push({ email: d.email, nome: d.nome_completo, ruolo: d.ruolo, password: tempPassword });
      await logAudit(db, { action: 'onboard_create_employee', entity: 'employee', entityId: employeeId,
        oldValue: null, newValue: { name: d.nome_completo, email: d.email, role }, userId: 'system' });
    } else {
      employeeId = existing.rows[0].id;
      await db.query(
        `UPDATE employees SET name = $1, phone = $2, role = $3, site_id = $4, assigned_sites = $5::UUID[], external_employee_id = $6
         WHERE id = $7::uuid`,
        [d.nome_completo, d.telefono, role, siteId, siteId ? [siteId] : [], d.matricola, employeeId]
      );
      summary.dipendenti_aggiornati += 1;
    }

    // 4) Saldi (conditional upsert: don't clobber a balance already in use)
    for (const [col, leaveType] of Object.entries(SALDO_COLUMNS)) {
      const total = d[col];
      if (!total || total <= 0) continue;
      await db.query(
        `INSERT INTO leave_saldi (client_id, user_id, leave_type, year, total_days, used_days)
         VALUES ($1, $2, $3, $4, $5, 0)
         ON CONFLICT (user_id, leave_type, year)
         DO UPDATE SET total_days = EXCLUDED.total_days, updated_at = NOW()
         WHERE leave_saldi.used_days = 0`,
        [clientId, employeeId, leaveType, year, total]
      );
      summary.saldi += 1;
    }
  }

  return { clientId, summary, credentials };
}

module.exports = { apply };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest onboarding-apply`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/onboarding/apply.js backend/src/__tests__/onboarding-apply.test.js
git commit -m "feat(onboarding): apply — idempotent upserts + audit"
```

---

## Task 5: `preview` — dry-run report formatting

**Files:**
- Create: `backend/scripts/onboarding/preview.js`
- Test: `backend/src/__tests__/onboarding-validate.test.js` (append a describe block)

Pure function `formatPreview(data, warnings) → string`. Addresses problem #6.

- [ ] **Step 1: Write the failing test (append to onboarding-validate.test.js)**

```js
// append to backend/src/__tests__/onboarding-validate.test.js
const { formatPreview } = require('../../scripts/onboarding/preview');

describe('formatPreview', () => {
  it('shows counts per site and surfaces warnings', () => {
    const data = {
      azienda: { ragione_sociale: 'X SRL' },
      sedi: [{ nome_sede: 'Milano' }, { nome_sede: 'Roma' }],
      dipendenti: [
        { sede: 'Milano', ruolo: 'responsabile', nome_completo: 'A' },
        { sede: 'Milano', ruolo: 'dipendente', nome_completo: 'B' },
        { sede: 'Roma', ruolo: 'dipendente', nome_completo: 'C' },
      ],
    };
    const out = formatPreview(data, ['attenzione: la sede "Roma" non ha responsabili']);
    expect(out).toMatch(/X SRL/);
    expect(out).toMatch(/Milano.*2/);
    expect(out).toMatch(/Roma.*1/);
    expect(out).toMatch(/attenzione/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest onboarding-validate -t formatPreview`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// backend/scripts/onboarding/preview.js
'use strict';

function formatPreview(data, warnings = []) {
  const lines = [];
  lines.push(`Azienda: ${data.azienda.ragione_sociale}`);
  lines.push(`Sedi: ${data.sedi.length} · Dipendenti: ${data.dipendenti.length}`);
  lines.push('');
  lines.push('Dipendenti per sede:');
  for (const s of data.sedi) {
    const inSede = data.dipendenti.filter((d) => d.sede === s.nome_sede);
    const resp = inSede.filter((d) => d.ruolo === 'responsabile').length;
    lines.push(`  • ${s.nome_sede}: ${inSede.length} (di cui ${resp} responsabile/i)`);
  }
  const orphan = data.dipendenti.filter((d) => !data.sedi.some((s) => s.nome_sede === d.sede));
  if (orphan.length) lines.push(`  • (senza sede valida): ${orphan.length}`);

  if (warnings.length) {
    lines.push('');
    lines.push('Avvisi:');
    for (const w of warnings) lines.push(`  ⚠️  ${w}`);
  }
  return lines.join('\n');
}

module.exports = { formatPreview };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest onboarding-validate -t formatPreview`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/onboarding/preview.js backend/src/__tests__/onboarding-validate.test.js
git commit -m "feat(onboarding): preview — dry-run report"
```

---

## Task 6: `writeCredentials` — post-commit secrets file

**Files:**
- Create: `backend/scripts/onboarding/writeCredentials.js`
- Test: `backend/src/__tests__/onboarding-credentials.test.js`

`writeCredentials(credentials, clientName) → filePath`. Writes a CSV into `backend/scripts/onboarding-output/` (gitignored from Task 0). Addresses problem #4. **Called only after the transaction commits** (enforced in Task 7).

- [ ] **Step 1: Write the failing test**

```js
// backend/src/__tests__/onboarding-credentials.test.js
const fs = require('fs');
const path = require('path');
const { writeCredentials } = require('../../scripts/onboarding/writeCredentials');

describe('writeCredentials', () => {
  it('writes a CSV with header and one row per credential, into the gitignored output dir', () => {
    const creds = [{ email: 'a@x.it', nome: 'A B', ruolo: 'dipendente', password: 'pw123' }];
    const p = writeCredentials(creds, 'X SRL');
    expect(p).toMatch(/onboarding-output[/\\]/);
    const txt = fs.readFileSync(p, 'utf8');
    expect(txt.split('\n')[0]).toBe('email,nome,ruolo,password_temporanea');
    expect(txt).toMatch(/a@x\.it,A B,dipendente,pw123/);
    fs.unlinkSync(p);
  });

  it('returns null and writes nothing when there are no credentials', () => {
    expect(writeCredentials([], 'X SRL')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest onboarding-credentials`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// backend/scripts/onboarding/writeCredentials.js
'use strict';

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'onboarding-output');

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCredentials(credentials, clientName) {
  if (!credentials || credentials.length === 0) return null;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const slug = String(clientName || 'cliente').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const stamp = new Date().toISOString().slice(0, 10);
  const filePath = path.join(OUTPUT_DIR, `credenziali-${slug}-${stamp}.csv`);

  const header = 'email,nome,ruolo,password_temporanea';
  const rows = credentials.map((c) => [c.email, c.nome, c.ruolo, c.password].map(csvCell).join(','));
  fs.writeFileSync(filePath, [header, ...rows].join('\n') + '\n', { mode: 0o600 });
  return filePath;
}

module.exports = { writeCredentials };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest onboarding-credentials`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/onboarding/writeCredentials.js backend/src/__tests__/onboarding-credentials.test.js
git commit -m "feat(onboarding): writeCredentials — post-commit secrets file"
```

---

## Task 7: `onboard-client.js` — CLI orchestration

**Files:**
- Create: `backend/scripts/onboard-client.js`
- Test: manual (documented run against the example file)

Wires everything: parse → validate (file) → open transaction → validateAgainstDb → (dry-run: preview & ROLLBACK) → apply → COMMIT → writeCredentials. Uses existing `pool`. Addresses #1–#9 end-to-end and enforces "credentials only after commit".

- [ ] **Step 1: Write the implementation**

```js
// backend/scripts/onboard-client.js
'use strict';

require('../src/config-loader');
const { pool } = require('../src/db/pool');
const { parseWorkbook } = require('./onboarding/parseWorkbook');
const { validate } = require('./onboarding/validate');
const { validateAgainstDb } = require('./onboarding/validateAgainstDb');
const { apply } = require('./onboarding/apply');
const { formatPreview } = require('./onboarding/preview');
const { writeCredentials } = require('./onboarding/writeCredentials');

function parseArgs(argv) {
  const args = { file: null, dryRun: false, clientId: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--client-id') args.clientId = argv[++i];
    else if (!a.startsWith('--')) args.file = a;
  }
  return args;
}

async function main() {
  const { file, dryRun, clientId } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error('Uso: node scripts/onboard-client.js <file.xlsx> [--dry-run] [--client-id <uuid>]');
    process.exit(2);
  }

  console.log(`\n📄 Leggo ${file} ...`);
  const data = await parseWorkbook(file);

  const { errors, warnings } = validate(data);
  if (errors.length) {
    console.error('\n🔴 Validazione fallita:');
    errors.forEach((e) => console.error('  - ' + e));
    process.exit(1);
  }

  console.log('\n' + formatPreview(data, warnings));

  const year = new Date().getFullYear();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dbErrors = await validateAgainstDb(client, data, { clientId });
    if (dbErrors.length) {
      await client.query('ROLLBACK');
      console.error('\n🔴 Conflitti col database:');
      dbErrors.forEach((e) => console.error('  - ' + e));
      process.exit(1);
    }

    const result = await apply(client, data, { clientId, year });

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('\n🟡 DRY-RUN: nessuna scrittura. Riepilogo di cosa verrebbe creato:');
      console.log('  ', JSON.stringify(result.summary));
      console.log(`   Credenziali da generare: ${result.credentials.length}`);
      return;
    }

    await client.query('COMMIT'); // ← commit FIRST
    // credentials file ONLY after a successful commit (problem #4)
    const credPath = writeCredentials(result.credentials, data.azienda.ragione_sociale);
    console.log('\n✅ Onboarding completato:', JSON.stringify(result.summary));
    console.log(`   client_id: ${result.clientId}`);
    if (credPath) {
      console.log(`\n🔐 Credenziali iniziali scritte in: ${credPath}`);
      console.log('   Consegnale al cliente in modo sicuro e CANCELLA il file dopo l\'uso.');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n🔴 Errore — rollback eseguito, nessuna modifica applicata:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Dry-run against the example file (no writes)**

Run (with a reachable dev DB configured in `.env.development`):
```bash
cd backend && node scripts/onboard-client.js scripts/seed-data/onboarding-template-esempio.xlsx --dry-run
```
Expected: prints the preview (Azienda, 3 sedi with counts, 0 warnings if balanced), then `🟡 DRY-RUN: nessuna scrittura`, summary `{"sedi":3,"dipendenti_creati":15,...}`, and exits 0. No rows written.

- [ ] **Step 3: Real run against a local/dev DB**

```bash
cd backend && node scripts/onboard-client.js scripts/seed-data/onboarding-template-esempio.xlsx
```
Expected: `✅ Onboarding completato` with `dipendenti_creati: 15`, a `client_id`, and a credentials file path under `scripts/onboarding-output/`.

- [ ] **Step 4: Idempotency check — run the same file again**

```bash
cd backend && node scripts/onboard-client.js scripts/seed-data/onboarding-template-esempio.xlsx --client-id <client_id_from_step_3>
```
Expected: `dipendenti_creati: 0, dipendenti_aggiornati: 15`, no credentials file (no new passwords), no duplicate sites.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/onboard-client.js
git commit -m "feat(onboarding): onboard-client CLI — parse→validate→apply, dry-run, idempotent"
```

---

## Task 8: Documentation — operator runbook + spec note

**Files:**
- Create: `docs/onboarding/README.md`
- Modify: `TASKS.md` (mark ONB.1 done)

- [ ] **Step 1: Write the operator runbook**

```markdown
# Onboarding cliente — runbook operatore (Dataxiom)

1. Invia al cliente `backend/scripts/seed-data/onboarding-template-esempio.xlsx` come modello.
2. Ricevuto il file compilato, esegui SEMPRE prima il dry-run:
   `cd backend && node scripts/onboard-client.js <file.xlsx> --dry-run`
   Controlla il riepilogo (conteggi per sede) e gli avvisi.
3. Se ok, esegui senza `--dry-run` per creare un NUOVO cliente,
   oppure con `--client-id <uuid>` per aggiungere a un cliente esistente.
4. Le credenziali iniziali sono in `backend/scripts/onboarding-output/credenziali-*.csv`.
   Consegnale al cliente in modo sicuro, poi CANCELLA il file.

## Limitazioni note (MVP)
- Saldi in giorni interi (no mezze giornate / ROL in ore) — vedi TASKS ONB.2.
- `total_days` = giorni RESIDUI (used_days=0); l'anno è quello corrente
  (eventuale carryover dell'anno prima confluisce nell'anno corrente).
- I saldi NON vengono sovrascritti se il dipendente ne ha già usati (used_days > 0).
```

- [ ] **Step 2: Mark ONB.1 complete in TASKS.md**

Change the `ONB.1` checkbox lines under "BACKLOG — Onboarding Cliente & Saldi" from `[ ]` to `[x]` and append `(✅ implementato — vedi docs/onboarding/README.md)`.

- [ ] **Step 3: Run the full backend suite (no regressions)**

Run: `cd backend && npm test`
Expected: all onboarding suites green, no change to the pre-existing pass count of other suites.

- [ ] **Step 4: Commit**

```bash
git add docs/onboarding/README.md TASKS.md
git commit -m "docs(onboarding): operator runbook + mark ONB.1 done"
```

---

## Self-Review

**Spec coverage (the 9 problems):** #1 idempotency → Task 4 (find-or-create client/sites, insert-or-update employees, conditional saldi upsert) + Task 7 step 4. #2 DB validation → Task 3. #3 normalization → Task 1. #4 post-commit credentials → Task 6 + Task 7 step (commit before `writeCredentials`). #5 audit → Task 4 (`logAudit` ×3). #6 dry-run preview → Task 5 + Task 7. #7 residuo limitation → Task 4 comment + Task 8 runbook. #8 carryover/year → Task 4 (`year` param) + Task 8. #9 warnings → Task 2. All covered.

**Placeholder scan:** No TBD/TODO; every code step has complete code; commands have expected output.

**Type consistency:** `apply` returns `{ clientId, summary, credentials }` and `summary` keys (`sedi`, `dipendenti_creati`, `dipendenti_aggiornati`, `saldi`) are identical across Task 4 test, implementation, and Task 7 usage. `credentials[]` item shape `{ email, nome, ruolo, password }` is consistent across Tasks 4, 6, 7. `ROLE_MAP`/`SALDO_COLUMNS` defined once in Task 1 and imported in Tasks 2 and 4. `parseWorkbook`/`validate`/`validateAgainstDb`/`apply`/`formatPreview`/`writeCredentials` signatures match their call sites in Task 7.

**Scope:** Single subsystem (onboarding import), one plan. No decomposition needed.
```
