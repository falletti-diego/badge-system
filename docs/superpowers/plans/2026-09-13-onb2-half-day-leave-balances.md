# ONB.2 — Saldi Ferie: Mezze Giornate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support half-day (0.5) granularity for Ferie leave requests (FERIE_1/FERIE_2/FERIE_3) and decimal leave balances, end to end: schema, backend, onboarding import, web (employee/manager/admin), and mobile.

**Architecture:** `leave_saldi.total_days/used_days/remaining_days` and `leave_requests.num_days` move from `INT` to `NUMERIC(6,2)`. A `half_day` boolean flag (single-day requests only, Ferie only) drives `numDays = 0.5` in the request handler. All numeric leave fields are normalized to real JS numbers in one place in `leaves.js` before leaving the API, so every frontend consumer (web + mobile, 6 files) can trust `num_days`/`remaining_days` are numbers and just format them for display — never recompute duration client-side.

**Tech Stack:** Node.js/Express/PostgreSQL (backend), React/MUI/Vitest (frontend-web), React Native/Jest/RNTL (frontend-mobile).

**Reference spec:** `docs/superpowers/specs/2026-09-12-onb2-half-day-leave-balances-design.md`

---

### Task 1: Migration — `leave_saldi`/`leave_requests` numeric columns

**Files:**
- Create: `backend/migrations/044_leave_half_day_units.sql`
- Test: `backend/src/__tests__/leaves-schema.test.js`

- [ ] **Step 1: Write the failing schema test**

Add this to the end of the `describe('leave_saldi table', ...)` block in `backend/src/__tests__/leaves-schema.test.js` (right after the existing `'should verify remaining_days is a GENERATED ALWAYS AS column'` test, inside the same `describe`):

```javascript
    it('should have total_days/used_days/remaining_days as NUMERIC(6,2) (half-day support)', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_name = 'leave_saldi' AND column_name IN ('total_days', 'used_days', 'remaining_days')
      `);
      expect(result.rows).toHaveLength(3);
      for (const row of result.rows) {
        expect(row.data_type).toBe('numeric');
        expect(row.numeric_precision).toBe(6);
        expect(row.numeric_scale).toBe(2);
      }
    });
```

Add this to the `describe('leave_requests table', ...)` block (find it above the `leave_saldi table` describe in the same file):

```javascript
    it('should have num_days as NUMERIC(6,2) (half-day support)', async () => {
      const result = await pool.query(`
        SELECT data_type, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_name = 'leave_requests' AND column_name = 'num_days'
      `);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].data_type).toBe('numeric');
      expect(result.rows[0].numeric_precision).toBe(6);
      expect(result.rows[0].numeric_scale).toBe(2);
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest src/__tests__/leaves-schema.test.js -t "NUMERIC" -v`
Expected: FAIL — both new tests fail because `data_type` is currently `integer`, not `numeric`.

- [ ] **Step 3: Write the migration**

Create `backend/migrations/044_leave_half_day_units.sql`:

```sql
-- 044_leave_half_day_units.sql
-- ONB.2 (design spec 2026-09-12): supports half-day (0.5) Ferie requests and
-- decimal balances imported from a prior payroll system. Order below is
-- mandatory — Postgres refuses ALTER COLUMN TYPE on a column a GENERATED
-- ALWAYS expression depends on, so remaining_days must be dropped first and
-- recreated last.

ALTER TABLE leave_saldi DROP COLUMN remaining_days;

ALTER TABLE leave_saldi ALTER COLUMN total_days TYPE NUMERIC(6,2);
ALTER TABLE leave_saldi ALTER COLUMN used_days TYPE NUMERIC(6,2);

ALTER TABLE leave_saldi
  ADD COLUMN remaining_days NUMERIC(6,2) GENERATED ALWAYS AS (total_days - used_days) STORED;

ALTER TABLE leave_requests ALTER COLUMN num_days TYPE NUMERIC(6,2);
```

- [ ] **Step 4: Apply the migration to the local test database**

Run: `cd backend && DB_NAME=badge_system_test node scripts/run-migrations.js`
Expected: Output includes `044_leave_half_day_units.sql` applied successfully.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx jest src/__tests__/leaves-schema.test.js -v`
Expected: PASS — all tests in the file, including the 2 new ones (this file also re-verifies the generated-column test still passes after the drop/recreate).

- [ ] **Step 6: Commit**

```bash
git add backend/migrations/044_leave_half_day_units.sql backend/src/__tests__/leaves-schema.test.js
git commit -m "feat(db): leave_saldi/leave_requests numeric columns for half-day support"
```

---

### Task 2: Backend validation — `half_day` field on `PostLeaveRequestSchema`

**Files:**
- Modify: `backend/src/middleware/validation.js` (the `PostLeaveRequestSchema` block, search for `LEAVE MANAGEMENT — POST /api/v1/leave/request`)
- Test: `backend/src/__tests__/leaves.test.js`

- [ ] **Step 1: Write the failing tests**

Add these two `it()` blocks inside the existing `describe('POST /api/v1/leave/request', ...)` block in `backend/src/__tests__/leaves.test.js`, right after the existing `'should return 400 for invalid leave_type'` test:

```javascript
    it('should return 400 for half_day=true on a multi-day range', async () => {
      const res = await request(app)
        .post('/api/v1/leave/request')
        .send({
          leave_type: 'FERIE_1',
          start_date: '2026-06-15',
          end_date: '2026-06-20',
          half_day: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 for half_day=true on MALATTIA', async () => {
      const res = await request(app)
        .post('/api/v1/leave/request')
        .send({
          leave_type: 'MALATTIA',
          start_date: '2026-06-15',
          end_date: '2026-06-15',
          half_day: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest src/__tests__/leaves.test.js -t "half_day" -v`
Expected: FAIL — `half_day` isn't in the schema yet, so Zod's default `.strip()` behavior silently drops it and both requests currently pass validation (200/201 instead of 400).

- [ ] **Step 3: Update the Zod schema**

In `backend/src/middleware/validation.js`, find the `PostLeaveRequestSchema` block and replace it entirely:

```javascript
const PostLeaveRequestSchema = z.object({
  body: z.object({
    leave_type: z.enum(['FERIE_1', 'FERIE_2', 'FERIE_3', 'MALATTIA'], {
      errorMap: () => ({ message: 'leave_type must be one of: FERIE_1, FERIE_2, FERIE_3, MALATTIA' }),
    }),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must be in YYYY-MM-DD format'),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end_date must be in YYYY-MM-DD format'),
    half_day: z.boolean().optional(),
    motivation: z.string().max(500, 'motivation must be at most 500 characters').optional().nullable(),
  })
    .refine(
      (data) => new Date(data.end_date) >= new Date(data.start_date),
      { message: 'end_date must be on or after start_date', path: ['end_date'] }
    )
    .refine(
      (data) => !data.half_day || data.start_date === data.end_date,
      { message: 'half_day can only be used for a single-day request (start_date must equal end_date)', path: ['half_day'] }
    )
    .refine(
      (data) => !data.half_day || ['FERIE_1', 'FERIE_2', 'FERIE_3'].includes(data.leave_type),
      { message: 'half_day is only supported for FERIE_1, FERIE_2, FERIE_3', path: ['half_day'] }
    ),
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest src/__tests__/leaves.test.js -v`
Expected: PASS — full file, including the 2 new tests and all pre-existing ones (no regression).

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/validation.js backend/src/__tests__/leaves.test.js
git commit -m "feat(leaves): validate half_day flag (single-day Ferie requests only)"
```

---

### Task 3: Backend `leaves.js` — half-day `numDays` + centralized numeric normalization

**Files:**
- Modify: `backend/src/routes/leaves.js`
- Test: Create `backend/src/__tests__/leaves-half-day.test.js`

- [ ] **Step 1: Write the failing test file**

Create `backend/src/__tests__/leaves-half-day.test.js`:

```javascript
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

describe('POST /api/v1/leave/request — half-day support (ONB.2)', () => {
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
      console.warn(`[leaves-half-day.test] Skipping — could not connect: ${err.message}`);
    }
    if (dbAvailable) {
      request = require('supertest');
      app = require('../app');
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  async function makeClient() {
    const result = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Half Day Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('half-day-client')]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, active)
       VALUES ($1, $2, 'Half Day Employee', 'employee', true)
       RETURNING id`,
      [clientId, uniqueEmail('half-day-employee')]
    );
    return result.rows[0].id;
  }

  async function makeSaldo(clientId, employeeId, leaveType, year) {
    await pool.query(
      `INSERT INTO leave_saldi (client_id, user_id, leave_type, year, total_days, used_days)
       VALUES ($1, $2, $3, $4, 20, 0)`,
      [clientId, employeeId, leaveType, year]
    );
  }

  function tokenFor({ client_id, role, employee_id }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign(
      { user_id: employee_id, client_id, role, employee_id, name: 'Test' },
      privateKey,
      { algorithm: 'RS256', expiresIn: '1h' }
    );
  }

  let clientId;

  afterEach(async () => {
    if (!dbAvailable || !clientId) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
    clientId = undefined;
  });

  it('creates a half-day request with num_days=0.5 (number, not string) in the response', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeSaldo(clientId, employeeId, 'FERIE_1', 2026);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/leave/request')
      .set('Authorization', `Bearer ${token}`)
      .send({ leave_type: 'FERIE_1', start_date: '2026-09-20', end_date: '2026-09-20', half_day: true });

    expect(res.status).toBe(201);
    expect(res.body.data.num_days).toBe(0.5);
    expect(typeof res.body.data.num_days).toBe('number');

    const dbRow = await pool.query('SELECT num_days FROM leave_requests WHERE id = $1::uuid', [res.body.data.id]);
    expect(Number(dbRow.rows[0].num_days)).toBe(0.5);
  });

  it('a full-day request (no half_day) still gets num_days as a whole number', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeSaldo(clientId, employeeId, 'FERIE_1', 2026);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/leave/request')
      .set('Authorization', `Bearer ${token}`)
      .send({ leave_type: 'FERIE_1', start_date: '2026-09-01', end_date: '2026-09-03' });

    expect(res.status).toBe(201);
    expect(res.body.data.num_days).toBe(3);
    expect(typeof res.body.data.num_days).toBe('number');
  });

  it('GET /balance returns total_days/used_days/remaining_days as numbers, not strings', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeSaldo(clientId, employeeId, 'FERIE_1', new Date().getFullYear());
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .get('/api/v1/leave/balance')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const row = res.body.data[0];
    expect(typeof row.total_days).toBe('number');
    expect(typeof row.used_days).toBe('number');
    expect(typeof row.remaining_days).toBe('number');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest src/__tests__/leaves-half-day.test.js -v`
Expected: FAIL — `half_day: true` isn't wired into `numDays` calculation yet (would currently compute `numDays=1` for a single day, not `0.5`), and the numeric fields still arrive as strings (`typeof === 'string'`).

- [ ] **Step 3: Implement `half_day` handling and centralized normalization**

In `backend/src/routes/leaves.js`, find the top of the `POST /request` handler (search for `const { leave_type, start_date, end_date, motivation } = req.validated.body;`) and replace it and the `numDays` calculation below it:

```javascript
router.post('/request', requireAuth, createValidationMiddleware(PostLeaveRequestSchema), async (req, res, next) => {
  const { leave_type, start_date, end_date, motivation, half_day } = req.validated.body;
  const userId = req.user.user_id;
  const clientId = req.user.client_id;

  try {
    // Ensure start_date and end_date are Date objects
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    // Calculate num_days (inclusive: from start to end inclusive). half_day
    // is only valid for a single-day request (enforced by PostLeaveRequestSchema).
    const timeDiff = endDate.getTime() - startDate.getTime();
    const numDays = half_day ? 0.5 : Math.floor(timeDiff / (1000 * 60 * 60 * 24)) + 1;
```

Now add a normalization helper near the top of the file. Find the line `const router = express.Router();` and add this immediately after it:

```javascript
const router = express.Router();

// leave_saldi.total_days/used_days/remaining_days and leave_requests.num_days
// are NUMERIC(6,2) (half-day support, ONB.2) — node-postgres returns NUMERIC
// as a string to avoid silent precision loss. Every response that includes
// one of these fields must go through this before res.json(), so every
// frontend consumer (web + mobile) can trust it's a real number without
// re-deriving the same fix at each call site.
function normalizeLeaveNumerics(row) {
  if (!row) return row;
  const normalized = { ...row };
  for (const field of ['total_days', 'used_days', 'remaining_days', 'num_days']) {
    if (normalized[field] !== undefined && normalized[field] !== null) {
      normalized[field] = Number(normalized[field]);
    }
  }
  return normalized;
}
```

- [ ] **Step 4: Apply normalization to every response that returns these fields**

Still in `backend/src/routes/leaves.js`, find `res.status(201).json({ data: result });` (end of `POST /request`) and change it to:

```javascript
    res.status(201).json({ data: normalizeLeaveNumerics(result) });
```

Find the `GET /pending` handler's response (search for `res.status(200).json({ data:` following the `r.num_days` SELECT you read earlier) and wrap the rows array. The existing line is `res.status(200).json({ data: result.rows });` — there are multiple occurrences (`/pending`, `/my-requests`, `/all`) with this exact same line; change **each of them** to:

```javascript
    res.status(200).json({ data: result.rows.map(normalizeLeaveNumerics) });
```

For the admin saldi endpoint, find:

```javascript
      saldiByEmployee[row.user_id][row.leave_type] = row.remaining_days;
```

and change it to:

```javascript
      saldiByEmployee[row.user_id][row.leave_type] = Number(row.remaining_days);
```

For `GET /balance`, find:

```javascript
    res.status(200).json({ data: result.rows });
  } catch (error) {
    next(error);
```

(the one immediately following the `SELECT leave_type, year, total_days, used_days, remaining_days` query) and change it to:

```javascript
    res.status(200).json({ data: result.rows.map(normalizeLeaveNumerics) });
  } catch (error) {
    next(error);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx jest src/__tests__/leaves-half-day.test.js src/__tests__/leaves.test.js src/__tests__/leaves.balance.test.js -v`
Expected: PASS — all tests in all three files, no regressions in the existing suites.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/leaves.js backend/src/__tests__/leaves-half-day.test.js
git commit -m "feat(leaves): half_day → num_days=0.5, centralize NUMERIC-to-number normalization"
```

---

### Task 4: Regression test — half-day still triggers Pattern 7 mutual-exclusion conflicts

**Files:**
- Modify: `backend/src/__tests__/leave-event-illness-conflict.test.js`

- [ ] **Step 1: Write the failing (well, currently-passing-for-the-wrong-reason) test**

This test should already pass today (the conflict check is date-range-only and doesn't look at `num_days`) — it exists to **lock in** that behavior so it can't regress silently. Add this `it()` block at the end of the file, right before the final closing `});` of the outer `describe`:

```javascript
  it('a half-day request still conflicts with a PENDING event the same day (duration is irrelevant to the day-level exclusion rule)', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeSaldo(clientId, employeeId, 'FERIE_1', 2026);
    await makeEventRequest(clientId, employeeId, '2026-09-20', 'PENDING');
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/leave/request')
      .set('Authorization', `Bearer ${token}`)
      .send({ leave_type: 'FERIE_1', start_date: '2026-09-20', end_date: '2026-09-20', half_day: true });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });
```

- [ ] **Step 2: Run the test**

Run: `cd backend && npx jest src/__tests__/leave-event-illness-conflict.test.js -t "half-day request still conflicts" -v`
Expected: PASS immediately — no production code change needed (this is a lock-in regression test, per the design spec's finding #6).

- [ ] **Step 3: Commit**

```bash
git add backend/src/__tests__/leave-event-illness-conflict.test.js
git commit -m "test(leaves): lock in that half-day requests still trigger day-level conflict checks"
```

---

### Task 5: Onboarding import — fix silent rounding of decimal Ferie balances

**Files:**
- Modify: `backend/src/services/onboarding/parseWorkbook.js`
- Test: `backend/src/__tests__/onboarding-parse.test.js`

- [ ] **Step 1: Write the failing test**

Add this to `backend/src/__tests__/onboarding-parse.test.js` (find the `describe` block that tests `parseWorkbook` dipendenti/saldi parsing, and add inside it — if the file doesn't already build a full workbook fixture in that describe block, check its existing tests for a helper that builds a minimal workbook, and follow that same helper style):

```javascript
  it('preserves a decimal Ferie balance (19.5) instead of rounding it to a whole number', async () => {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const wsAzienda = workbook.addWorksheet('Azienda');
    wsAzienda.addRow(['nome_azienda', 'Test Co']);
    wsAzienda.addRow(['email_azienda', 'test@example.invalid']);
    const wsSedi = workbook.addWorksheet('Sedi');
    wsSedi.addRow(['nome_sede', 'indirizzo']);
    wsSedi.addRow(['Sede Test', 'Via Roma 1']);
    const wsDipendenti = workbook.addWorksheet('Dipendenti');
    wsDipendenti.addRow([
      'nome_completo', 'email', 'ruolo', 'sede', 'matricola',
      'ferie_giorni', 'permessi_giorni', 'exfestivita_giorni',
    ]);
    wsDipendenti.addRow(['Mario Rossi', 'mario@example.invalid', 'dipendente', 'Sede Test', '', 19.5, 8, 4]);

    const { parseWorkbook } = require('../services/onboarding/parseWorkbook');
    const data = await parseWorkbook(workbook);

    expect(data.dipendenti[0].ferie_giorni).toBe(19.5);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest src/__tests__/onboarding-parse.test.js -t "decimal Ferie balance" -v`
Expected: FAIL — `expect(19.5).toBe(19.5)` fails because `normInt` rounds it to `20`.

- [ ] **Step 3: Fix `parseWorkbook.js`**

In `backend/src/services/onboarding/parseWorkbook.js`, find the `normInt` function definition:

```javascript
function normInt(v) {
  if (v === null || v === undefined || String(v).trim() === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}
```

Add a new function right after it (do not remove `normInt` — it is unused after this change but harmless to leave; actually, since `normInt` becomes dead code once its only 3 call sites switch, delete it):

Replace the whole `normInt` function with:

```javascript
function normDecimal(v) {
  if (v === null || v === undefined || String(v).trim() === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
```

Then find the 3 call sites:

```javascript
    ferie_giorni: normInt(d.ferie_giorni),
    permessi_giorni: normInt(d.permessi_giorni),
    exfestivita_giorni: normInt(d.exfestivita_giorni),
```

and change them to:

```javascript
    ferie_giorni: normDecimal(d.ferie_giorni),
    permessi_giorni: normDecimal(d.permessi_giorni),
    exfestivita_giorni: normDecimal(d.exfestivita_giorni),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest src/__tests__/onboarding-parse.test.js -v`
Expected: PASS — full file, including the new test and all pre-existing ones (no other field used `normInt`, so nothing else is affected).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/onboarding/parseWorkbook.js backend/src/__tests__/onboarding-parse.test.js
git commit -m "fix(onboarding): stop silently rounding decimal Ferie balances on import"
```

---

### Task 6: Onboarding apply — decimal saldo passes through to the INSERT unchanged

**Files:**
- Modify: `backend/src/__tests__/onboarding-apply.test.js`

- [ ] **Step 1: Write the failing test**

Read the existing test at line ~24 (`describe('apply', ...)`) in `backend/src/__tests__/onboarding-apply.test.js` to see the exact shape of the `db.query` mock array and the input object passed to `apply()` — it mocks `db.query` as `jest.fn()` with a lookup array like `['INTO leave_saldi', { rowCount: 1, rows: [] }]`. Following that same pattern, add this test in the same `describe('apply', ...)` block:

```javascript
  it('passes a decimal ferie_giorni value through to the leave_saldi INSERT unchanged', async () => {
    const queryMock = jest.fn((sql) => {
      if (sql.includes('INTO leave_saldi')) return Promise.resolve({ rowCount: 1, rows: [] });
      if (sql.includes('INTO clients')) return Promise.resolve({ rowCount: 1, rows: [{ id: 'client-1' }] });
      if (sql.includes('INTO sites')) return Promise.resolve({ rowCount: 1, rows: [{ id: 'site-1' }] });
      if (sql.includes('INTO employees')) return Promise.resolve({ rowCount: 1, rows: [{ id: 'emp-1' }] });
      return Promise.resolve({ rowCount: 0, rows: [] });
    });
    const db = { query: queryMock };

    const { apply } = require('../services/onboarding/apply');
    await apply(db, {
      azienda: { nome_azienda: 'Test Co', email_azienda: 'test@example.invalid' },
      sedi: [{ nome_sede: 'Sede Test', indirizzo: 'Via Roma 1' }],
      dipendenti: [{
        nome_completo: 'Mario Rossi', email: 'mario@example.invalid', ruolo: 'dipendente',
        sede: 'Sede Test', matricola: '', ferie_giorni: 19.5, permessi_giorni: 8, exfestivita_giorni: 4,
      }],
    });

    const saldoCall = queryMock.mock.calls.find((c) => c[0].includes('INTO leave_saldi'));
    expect(saldoCall).toBeDefined();
    expect(saldoCall[1]).toContain(19.5);
  });
```

Note: adjust the mock shapes above to match whatever `apply()` actually expects for `clients`/`sites`/`employees` INSERT return values — check the existing tests in this file for the exact `RETURNING id` alias expected, and align this new test with that same fixture style rather than guessing.

- [ ] **Step 2: Run the test to verify it fails or passes**

Run: `cd backend && npx jest src/__tests__/onboarding-apply.test.js -t "decimal ferie_giorni" -v`
Expected: this should already PASS today — `apply.js` never rounds the value itself (only `parseWorkbook.js` did, fixed in Task 5). This test exists to lock in that `apply.js` doesn't introduce its own rounding, complementing Task 5's fix at the layer below.

- [ ] **Step 3: Commit**

```bash
git add backend/src/__tests__/onboarding-apply.test.js
git commit -m "test(onboarding): lock in that apply() passes decimal saldo through unchanged"
```

---

### Task 7: Frontend web — shared `formatLeaveDays` utility

**Files:**
- Create: `frontend-web/src/utils/formatLeaveDays.js`
- Test: Create `frontend-web/src/utils/formatLeaveDays.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend-web/src/utils/formatLeaveDays.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { formatLeaveDays } from './formatLeaveDays';

describe('formatLeaveDays', () => {
  it('formats a whole number with no decimal', () => {
    expect(formatLeaveDays(20)).toBe('20');
  });

  it('formats a half-day value with 1 decimal, comma separator', () => {
    expect(formatLeaveDays(19.5)).toBe('19,5');
  });

  it('accepts a numeric string (defensive) and formats it the same way', () => {
    expect(formatLeaveDays('19.50')).toBe('19,5');
  });

  it('formats zero as "0"', () => {
    expect(formatLeaveDays(0)).toBe('0');
  });

  it('returns an em dash for null/undefined/non-numeric input', () => {
    expect(formatLeaveDays(null)).toBe('—');
    expect(formatLeaveDays(undefined)).toBe('—');
    expect(formatLeaveDays('not-a-number')).toBe('—');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend-web && npx vitest run src/utils/formatLeaveDays.test.js`
Expected: FAIL — `formatLeaveDays.js` doesn't exist yet.

- [ ] **Step 3: Write the utility**

Create `frontend-web/src/utils/formatLeaveDays.js`:

```javascript
/**
 * Formats a leave-balance/duration value for display: whole numbers show
 * with no decimal, non-whole values show exactly 1 decimal with a comma
 * (Italian locale). Accepts a number or a numeric string defensively —
 * NUMERIC(6,2) DB columns are normalized to real numbers by the backend
 * (see leaves.js normalizeLeaveNumerics), but this stays defensive in case
 * a future caller passes a raw value through.
 */
export function formatLeaveDays(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend-web && npx vitest run src/utils/formatLeaveDays.test.js`
Expected: PASS — all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/utils/formatLeaveDays.js frontend-web/src/utils/formatLeaveDays.test.js
git commit -m "feat(web): add formatLeaveDays display utility"
```

---

### Task 8: `EmployeeLeaveRequest.jsx` — half-day toggle + use `num_days` from API

**Files:**
- Modify: `frontend-web/src/features/leave/hooks/useLeave.js`
- Modify: `frontend-web/src/features/leave/pages/EmployeeLeaveRequest.jsx`
- Modify: `frontend-web/src/features/leave/pages/EmployeeLeaveRequest.test.jsx`

- [ ] **Step 1: Write the failing tests**

Add this to `frontend-web/src/features/leave/pages/EmployeeLeaveRequest.test.jsx`. First, update the `LeaveCalendar` mock to support triggering a single-day selection (find the existing mock and replace it):

```javascript
// Mock LeaveCalendar so form submission tests can trigger onDateChange directly
vi.mock('../components/LeaveCalendar', () => ({
  LeaveCalendar: ({ onDateChange }) => (
    <div data-testid="mock-calendar">
      <button
        type="button"
        onClick={() => onDateChange({ startDate: '2026-07-15', endDate: '2026-07-20' })}
      >
        Seleziona date
      </button>
      <button
        type="button"
        onClick={() => onDateChange({ startDate: '2026-07-15', endDate: '2026-07-15' })}
      >
        Seleziona singolo giorno
      </button>
    </div>
  ),
}));
```

Then add these two tests inside the main `describe('EmployeeLeaveRequest Page', ...)` block (find a good spot near other form-interaction tests):

```javascript
  it('shows the half-day toggle only when start and end date are the same day', async () => {
    renderWithRouter(<EmployeeLeaveRequest />);
    await waitFor(() => screen.getByText('Seleziona date'));

    fireEvent.click(screen.getByText('Seleziona date'));
    expect(screen.queryByLabelText(/mezza giornata/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Seleziona singolo giorno'));
    expect(screen.getByLabelText(/mezza giornata/i)).toBeInTheDocument();
  });

  it('sends half_day=true when the toggle is checked on a single-day request', async () => {
    renderWithRouter(<EmployeeLeaveRequest />);
    await waitFor(() => screen.getByText('Seleziona date'));

    fireEvent.click(screen.getByText('Seleziona singolo giorno'));
    fireEvent.click(screen.getByLabelText(/mezza giornata/i));

    const leaveTypeSelect = getLeaveTypeSelect();
    fireEvent.mouseDown(leaveTypeSelect);
    fireEvent.click(await screen.findByText('Ferie 1'));

    const submitButton = screen.getByRole('button', { name: /invia richiesta/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockCreateRequest).toHaveBeenCalledWith(
        'FERIE_1', '2026-07-15', '2026-07-15', '', true
      );
    });
  });
```

Also update `mockGetMyRequests` at the top of the file to include `num_days` explicitly on its existing fixture row (it already has `num_days: 5` — confirm it's there; if a row in that mock is missing `num_days`, add it) so the "Giorni" column test below has real data to assert against. Then add this test:

```javascript
  it('shows num_days from the API in the Giorni column instead of recalculating from dates', async () => {
    renderWithRouter(<EmployeeLeaveRequest />);
    await waitFor(() => screen.getByText('Ferie 1'));
    // mockGetMyRequests row: start_date 2026-07-01, end_date 2026-07-05, num_days: 5
    expect(screen.getByText('5')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend-web && npx vitest run src/features/leave/pages/EmployeeLeaveRequest.test.jsx`
Expected: FAIL — no "mezza giornata" checkbox exists yet, and `createRequest` is only ever called with 4 arguments (no `half_day`).

- [ ] **Step 3: Update `useLeave.js` to accept `half_day`**

In `frontend-web/src/features/leave/hooks/useLeave.js`, find `createRequest`:

```javascript
  const createRequest = useCallback(
    async (leave_type, start_date, end_date, motivation) => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiClient.post('/api/v1/leave/request', {
          leave_type,
          start_date,
          end_date,
          motivation: motivation || undefined,
        });
```

Replace it with:

```javascript
  const createRequest = useCallback(
    async (leave_type, start_date, end_date, motivation, half_day) => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiClient.post('/api/v1/leave/request', {
          leave_type,
          start_date,
          end_date,
          half_day: half_day || undefined,
          motivation: motivation || undefined,
        });
```

- [ ] **Step 4: Add the toggle and wire `half_day` through `EmployeeLeaveRequest.jsx`**

Add imports: find the MUI import block at the top of `frontend-web/src/features/leave/pages/EmployeeLeaveRequest.jsx` and add `Checkbox` and `FormControlLabel` to the destructured import list from `@mui/material`.

Add `formatLeaveDays` import: add `import { formatLeaveDays } from '../../../utils/formatLeaveDays';` near the top with the other local imports.

Add `halfDay` to form state — find:

```javascript
  const [formData, setFormData] = useState({
    leave_type: '',
    startDate: null,
    endDate: null,
    motivation: '',
  });
```

Replace with:

```javascript
  const [formData, setFormData] = useState({
    leave_type: '',
    startDate: null,
    endDate: null,
    motivation: '',
    halfDay: false,
  });
```

Find `handleCalendarChange` and reset `halfDay` whenever the date range changes (so switching back to a multi-day range after checking the box doesn't silently keep it checked and hidden):

```javascript
  const handleCalendarChange = ({ startDate, endDate }) => {
    setFormData((prev) => ({
      ...prev,
      startDate,
      endDate,
    }));
  };
```

Replace with:

```javascript
  const handleCalendarChange = ({ startDate, endDate }) => {
    setFormData((prev) => ({
      ...prev,
      startDate,
      endDate,
      halfDay: false,
    }));
  };

  const handleHalfDayChange = (e) => {
    setFormData((prev) => ({ ...prev, halfDay: e.target.checked }));
  };
```

Find the `formatDate` helper defined inline inside `handleSubmit` — it's a local function, so we need the same date-string comparison available for the JSX condition. Add a small helper near the top of the component body (right after the `handleMotivationChange` definition, before `handleSubmit`):

```javascript
  const formatDateForApi = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const isSingleDaySelected =
    formData.startDate && formData.endDate &&
    formatDateForApi(formData.startDate) === formatDateForApi(formData.endDate);
```

Now update `handleSubmit` to pass `halfDay` and reset it on success. Find:

```javascript
      await createRequest(
        formData.leave_type,
        formatDate(formData.startDate),
        formatDate(formData.endDate),
        formData.motivation
      );

      setSuccessMessage('Richiesta di ferie inviata con successo!');
      setFormData({
        leave_type: '',
        startDate: null,
        endDate: null,
        motivation: '',
      });
```

Replace with:

```javascript
      await createRequest(
        formData.leave_type,
        formatDate(formData.startDate),
        formatDate(formData.endDate),
        formData.motivation,
        formData.halfDay
      );

      setSuccessMessage('Richiesta di ferie inviata con successo!');
      setFormData({
        leave_type: '',
        startDate: null,
        endDate: null,
        motivation: '',
        halfDay: false,
      });
```

Also find `handleCancel` and add `halfDay: false` to its reset object the same way.

Add the checkbox to the JSX — find the Calendar `Box` block:

```jsx
                {/* Calendar */}
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                    Seleziona Date
                  </Typography>
                  <LeaveCalendar
                    startDate={formData.startDate}
                    endDate={formData.endDate}
                    onDateChange={handleCalendarChange}
                  />
                </Box>
```

Replace with:

```jsx
                {/* Calendar */}
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                    Seleziona Date
                  </Typography>
                  <LeaveCalendar
                    startDate={formData.startDate}
                    endDate={formData.endDate}
                    onDateChange={handleCalendarChange}
                  />
                  {isSingleDaySelected && (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={formData.halfDay}
                          onChange={handleHalfDayChange}
                          inputProps={{ 'aria-label': 'Mezza giornata' }}
                        />
                      }
                      label="Mezza giornata"
                    />
                  )}
                </Box>
```

- [ ] **Step 5: Remove the client-side day recalculation, use `num_days` from the API**

Find, in the history table render:

```javascript
                      const leaveType = LEAVE_TYPES.find((t) => t.value === req.leave_type);
                      const startDate = new Date(req.start_date);
                      const endDate = new Date(req.end_date);
                      const numDays =
                        Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
                      const createdDate = new Date(req.created_at);
```

Replace with:

```javascript
                      const leaveType = LEAVE_TYPES.find((t) => t.value === req.leave_type);
                      const startDate = new Date(req.start_date);
                      const endDate = new Date(req.end_date);
                      const createdDate = new Date(req.created_at);
```

Find the table cell rendering `{numDays}`:

```jsx
                          <TableCell align="center">{numDays}</TableCell>
```

Replace with:

```jsx
                          <TableCell align="center">{formatLeaveDays(req.num_days)}</TableCell>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend-web && npx vitest run src/features/leave/pages/EmployeeLeaveRequest.test.jsx`
Expected: PASS — full file, all new and pre-existing tests.

- [ ] **Step 7: Commit**

```bash
git add frontend-web/src/features/leave/hooks/useLeave.js frontend-web/src/features/leave/pages/EmployeeLeaveRequest.jsx frontend-web/src/features/leave/pages/EmployeeLeaveRequest.test.jsx
git commit -m "feat(web): half-day toggle on EmployeeLeaveRequest, use num_days from API"
```

---

### Task 9: `ManagerLeaveRequest.jsx` — same half-day toggle + `num_days` fix

**Files:**
- Modify: `frontend-web/src/features/leave/pages/ManagerLeaveRequest.jsx`
- Modify: `frontend-web/src/features/leave/pages/ManagerLeaveRequest.test.jsx`

This file is structurally identical to `EmployeeLeaveRequest.jsx` (same state shape, same calendar block, same history table) — apply the exact same set of changes as Task 8, Steps 3-5, to this file instead:

- [ ] **Step 1: Write the failing tests**

Apply the same `LeaveCalendar` mock update and the same 3 new tests (toggle visibility, `half_day` sent, `num_days` from API) as in Task 8 Step 1, adapted to `ManagerLeaveRequest.test.jsx`'s existing mock setup (check its current `LeaveCalendar` mock and `mockGetMyRequests`-equivalent fixture name first — it may be named differently, e.g. `mockGetMyRequests` might not exist here since managers use the same hook; confirm the actual mock function name in the file before editing).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend-web && npx vitest run src/features/leave/pages/ManagerLeaveRequest.test.jsx`
Expected: FAIL, same reasons as Task 8.

- [ ] **Step 3: Apply the same production code changes as Task 8 Steps 4-5 to `ManagerLeaveRequest.jsx`**

Same edits: add `Checkbox`/`FormControlLabel` imports, `formatLeaveDays` import, `halfDay` in form state, `formatDateForApi`/`isSingleDaySelected` helpers, checkbox JSX after the `LeaveCalendar`, `halfDay` passed to `createRequest`, and the history table's `numDays` recalculation replaced with `formatLeaveDays(req.num_days)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend-web && npx vitest run src/features/leave/pages/ManagerLeaveRequest.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/features/leave/pages/ManagerLeaveRequest.jsx frontend-web/src/features/leave/pages/ManagerLeaveRequest.test.jsx
git commit -m "feat(web): half-day toggle on ManagerLeaveRequest, use num_days from API"
```

---

### Task 10: `AdminLeaveManagement.jsx` — remove duplicated `calculateDays`, use `num_days`

**Files:**
- Modify: `frontend-web/src/features/leave/pages/AdminLeaveManagement.jsx`
- Modify: `frontend-web/src/features/leave/pages/AdminLeaveManagement.test.jsx`

- [ ] **Step 1: Update the test fixtures and write the failing test**

In `frontend-web/src/features/leave/pages/AdminLeaveManagement.test.jsx`, find the `getAllLeaveRequests` mock fixture and add `num_days` to both existing rows:

```javascript
    getAllLeaveRequests: vi.fn(async () => [
      {
        id: 'req-001',
        employee_id: 'emp-001',
        employee_name: 'Maria Rossi',
        leave_type: 'FERIE_1',
        start_date: '2026-07-01',
        end_date: '2026-07-05',
        num_days: 5,
        status: 'APPROVED',
        created_at: '2026-06-13T10:00:00Z',
        motivation: 'Vacanza estiva',
      },
      {
        id: 'req-002',
        employee_id: 'emp-002',
        employee_name: 'Luigi Bianchi',
        leave_type: 'MALATTIA',
        start_date: '2026-06-20',
        end_date: '2026-06-20',
        num_days: 1,
        status: 'PENDING',
        created_at: '2026-06-13T11:00:00Z',
        motivation: 'Influenza',
      },
    ]),
```

Add a new test to the `describe` block (find the tests that assert on the Saldi tab, and add near them):

```javascript
  it('shows num_days from the API instead of recalculating from dates, and formats decimals with a comma', async () => {
    render(<BrowserRouter><AdminLeaveManagement /></BrowserRouter>);
    await waitFor(() => screen.getByText('Maria Rossi'));
    expect(screen.getAllByText(/5 giorni/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/1 giorno\b/).length).toBeGreaterThanOrEqual(1);
  });
```

- [ ] **Step 2: Run the test to verify it behaves as expected pre-fix**

Run: `cd frontend-web && npx vitest run src/features/leave/pages/AdminLeaveManagement.test.jsx`
Expected: This specific new test likely still PASSES today (calculateDays computes the same whole-day values from these particular full-day fixtures) — it's a lock-in test for the *source* of the value (API vs recompute), not a behavior change for these two rows. Confirm the rest of the suite still passes with the fixture changes before proceeding.

- [ ] **Step 3: Remove `calculateDays`, use `request.num_days` everywhere**

In `frontend-web/src/features/leave/pages/AdminLeaveManagement.jsx`, add the import: `import { formatLeaveDays } from '../../../utils/formatLeaveDays';` near the top with other local imports.

Find and delete the `calculateDays` function entirely:

```javascript
  const calculateDays = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  };
```

There are 4 call sites, all of the form `const numDays = calculateDays(request.start_date, request.end_date);`. Replace **each** occurrence with:

```javascript
                const numDays = request.num_days;
```

(indentation varies per call site — match the surrounding code's existing indentation at each of the 4 locations: inside the Pending-tab card list, inside the Approved-tab table, inside the Rejected-tab table, and inside the full-History-tab table.)

Then find the 2 places where `numDays` is rendered with pluralization:

```jsx
                            {LEAVE_TYPE_LABELS[request.leave_type]} • {numDays}{' '}
                            {numDays === 1 ? 'giorno' : 'giorni'}
```

Replace with:

```jsx
                            {LEAVE_TYPE_LABELS[request.leave_type]} • {formatLeaveDays(numDays)}{' '}
                            {numDays === 1 ? 'giorno' : 'giorni'}
```

And the 3 places where `numDays` is rendered as a plain table cell:

```jsx
                        <TableCell align="center">{numDays}</TableCell>
```

Replace **each** with:

```jsx
                        <TableCell align="center">{formatLeaveDays(numDays)}</TableCell>
```

Now update the Saldi tab to use `formatLeaveDays` for consistent decimal display. Find:

```jsx
                        <TableCell align="center">{saldiData.FERIE_1 || 0}</TableCell>
                        <TableCell align="center">{saldiData.FERIE_2 || 0}</TableCell>
                        <TableCell align="center">{saldiData.FERIE_3 || 0}</TableCell>
                        <TableCell align="center">{saldiData.MALATTIA || 0}</TableCell>
```

Replace with:

```jsx
                        <TableCell align="center">{formatLeaveDays(saldiData.FERIE_1 || 0)}</TableCell>
                        <TableCell align="center">{formatLeaveDays(saldiData.FERIE_2 || 0)}</TableCell>
                        <TableCell align="center">{formatLeaveDays(saldiData.FERIE_3 || 0)}</TableCell>
                        <TableCell align="center">{formatLeaveDays(saldiData.MALATTIA || 0)}</TableCell>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend-web && npx vitest run src/features/leave/pages/AdminLeaveManagement.test.jsx`
Expected: PASS — full file.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/features/leave/pages/AdminLeaveManagement.jsx frontend-web/src/features/leave/pages/AdminLeaveManagement.test.jsx
git commit -m "refactor(web): AdminLeaveManagement uses num_days from API, drop duplicated calculateDays"
```

---

### Task 11: `ManagerLeaveApprovalPanel.jsx` — remove duplicated `calculateDays`

**Files:**
- Modify: `frontend-web/src/features/leave/components/ManagerLeaveApprovalPanel.jsx`
- Modify: `frontend-web/src/features/leave/components/ManagerLeaveApprovalPanel.test.jsx`

- [ ] **Step 1: Write the failing test**

In `frontend-web/src/features/leave/components/ManagerLeaveApprovalPanel.test.jsx`, find the `getPendingRequests: vi.fn(async () => [])` mock. Check the file for any test that overrides this mock's return value for a specific test (look for `.mockResolvedValueOnce` or similar); if such an override exists, add `num_days` to that fixture's leave-request objects. Add a new test:

```javascript
  it('shows num_days from the API in the pending request card', async () => {
    const { useLeave } = await import('../hooks/useLeave');
    useLeave.mockReturnValue({
      getPendingRequests: vi.fn(async () => [{
        id: 'req-1',
        employee_name: 'Maria Rossi',
        leave_type: 'FERIE_1',
        start_date: '2026-07-01',
        end_date: '2026-07-01',
        num_days: 0.5,
        status: 'PENDING',
      }]),
      approveRequest: vi.fn(),
      rejectRequest: vi.fn(),
      loading: false,
      error: null,
      clearError: vi.fn(),
    });

    renderWithRouter(<ManagerLeaveApprovalPanel />);
    await waitFor(() => screen.getByText('Maria Rossi'));
    expect(screen.getByText(/0,5 giorni/)).toBeInTheDocument();
  });
```

Note: if `useLeave` is mocked at module level via `vi.mock('../hooks/useLeave', ...)` with a fixed factory (as seen in the file's existing top-level mock) rather than an overridable `vi.fn()`, adapt this test to whatever override mechanism the file already uses elsewhere — check for an existing per-test override pattern in this file before assuming `useLeave.mockReturnValue` works as-is.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend-web && npx vitest run src/features/leave/components/ManagerLeaveApprovalPanel.test.jsx -t "num_days from the API"`
Expected: FAIL — `calculateDays` recomputes `1` for a same-day range, not `0.5`, so "0,5 giorni" never renders.

- [ ] **Step 3: Remove `calculateDays`, use `request.num_days`**

In `frontend-web/src/features/leave/components/ManagerLeaveApprovalPanel.jsx`, add `import { formatLeaveDays } from '../../../utils/formatLeaveDays';` near the top.

Delete the `calculateDays` function:

```javascript
  const calculateDays = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  };
```

Find:

```javascript
              const numDays = calculateDays(request.start_date, request.end_date);
```

Replace with:

```javascript
              const numDays = request.num_days;
```

Find:

```jsx
                          {LEAVE_TYPE_LABELS[request.leave_type]} • {numDays}{' '}
                          {numDays === 1 ? 'giorno' : 'giorni'}
```

Replace with:

```jsx
                          {LEAVE_TYPE_LABELS[request.leave_type]} • {formatLeaveDays(numDays)}{' '}
                          {numDays === 1 ? 'giorno' : 'giorni'}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend-web && npx vitest run src/features/leave/components/ManagerLeaveApprovalPanel.test.jsx`
Expected: PASS — full file.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/features/leave/components/ManagerLeaveApprovalPanel.jsx frontend-web/src/features/leave/components/ManagerLeaveApprovalPanel.test.jsx
git commit -m "refactor(web): ManagerLeaveApprovalPanel uses num_days from API, drop duplicated calculateDays"
```

---

### Task 12: Frontend mobile — shared `formatLeaveDays` utility

**Files:**
- Create: `frontend-mobile/src/utils/formatLeaveDays.js`
- Test: Create `frontend-mobile/src/__tests__/formatLeaveDays.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend-mobile/src/__tests__/formatLeaveDays.test.js`:

```javascript
import { formatLeaveDays } from '../utils/formatLeaveDays';

describe('formatLeaveDays', () => {
  it('formats a whole number with no decimal', () => {
    expect(formatLeaveDays(20)).toBe('20');
  });

  it('formats a half-day value with 1 decimal, comma separator', () => {
    expect(formatLeaveDays(19.5)).toBe('19,5');
  });

  it('accepts a numeric string (defensive) and formats it the same way', () => {
    expect(formatLeaveDays('19.50')).toBe('19,5');
  });

  it('returns an em dash for null/undefined/non-numeric input', () => {
    expect(formatLeaveDays(null)).toBe('—');
    expect(formatLeaveDays(undefined)).toBe('—');
    expect(formatLeaveDays('not-a-number')).toBe('—');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend-mobile && npx jest src/__tests__/formatLeaveDays.test.js`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write the utility**

Create `frontend-mobile/src/utils/formatLeaveDays.js`:

```javascript
/**
 * Formats a leave-balance/duration value for display: whole numbers show
 * with no decimal, non-whole values show exactly 1 decimal with a comma
 * (Italian locale). Mirrors frontend-web/src/utils/formatLeaveDays.js —
 * duplicated intentionally, no shared package exists between the two
 * frontends and this is too small to justify creating one.
 */
export function formatLeaveDays(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend-mobile && npx jest src/__tests__/formatLeaveDays.test.js`
Expected: PASS — all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend-mobile/src/utils/formatLeaveDays.js frontend-mobile/src/__tests__/formatLeaveDays.test.js
git commit -m "feat(mobile): add formatLeaveDays display utility"
```

---

### Task 13: `LeaveRequestScreen.jsx` — half-day toggle + first screen-level test for this file

**Files:**
- Modify: `frontend-mobile/src/screens/leave/LeaveRequestScreen.jsx`
- Create: `frontend-mobile/src/__tests__/LeaveRequestScreen.test.jsx`

- [ ] **Step 1: Write the failing test file**

Create `frontend-mobile/src/__tests__/LeaveRequestScreen.test.jsx`:

```javascript
import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

jest.mock('../services/apiClient', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

// The real DateTimePicker renders a native spinner UI that isn't meaningfully
// testable in jsdom-less RNTL; this mock exposes a single button per instance
// that fires onChange with a fixed date, distinguished by testID (the screen
// doesn't currently pass testID to DateTimePicker — this is added in this
// task alongside the mock, see Step 3 below).
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
  return function MockDateTimePicker({ onChange, testID }) {
    return React.createElement(
      TouchableOpacity,
      { testID: testID || 'mock-date-picker', onPress: () => onChange({}, new Date('2026-09-20T00:00:00')) },
      React.createElement(Text, null, 'mock-picker')
    );
  };
});

const apiClient = require('../services/apiClient');
const LeaveRequestScreen = require('../screens/leave/LeaveRequestScreen').default;

function mockDefaultResponses() {
  apiClient.get.mockImplementation((url) => {
    if (url.includes('balance')) {
      return Promise.resolve({ data: { data: [
        { leave_type: 'FERIE_1', remaining_days: 19.5 },
        { leave_type: 'FERIE_2', remaining_days: 10 },
        { leave_type: 'FERIE_3', remaining_days: 4 },
      ] } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
  apiClient.post.mockResolvedValue({ data: { data: { id: 'req-1' } } });
}

describe('LeaveRequestScreen — half-day toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDefaultResponses();
  });

  it('shows the balance with 1 decimal (formatLeaveDays) for a half-day remaining value', async () => {
    const { findByText } = render(<LeaveRequestScreen />);
    expect(await findByText('19,5')).toBeTruthy();
  });

  it('shows the half-day toggle only when start and end date are the same day, and sends half_day=true', async () => {
    const { getByTestId, findByText, queryByText } = render(<LeaveRequestScreen />);
    await findByText('Saldo disponibile');

    // Default state: startDate === endDate === today() already, so the
    // toggle should be visible without any interaction.
    expect(await findByText('Mezza giornata')).toBeTruthy();

    fireEvent.press(getByTestId('start-date-picker'));
    fireEvent.press(getByTestId('end-date-picker'));

    fireEvent.press(await findByText('Mezza giornata'));
    fireEvent.press(await findByText('Invia Richiesta Ferie'));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ half_day: true, start_date: '2026-09-20', end_date: '2026-09-20' })
      );
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend-mobile && npx jest src/__tests__/LeaveRequestScreen.test.jsx`
Expected: FAIL — no `testID`s on the date pickers, no "Mezza giornata" text anywhere, `apiClient.post` never receives `half_day`.

- [ ] **Step 3: Add `testID`s to the date pickers**

In `frontend-mobile/src/screens/leave/LeaveRequestScreen.jsx`, find the two `<DateTimePicker>` elements and add a `testID` to each. First occurrence (inside the start-date picker block):

```jsx
            <DateTimePicker
              value={startDate}
              mode="date"
              display="spinner"
              minimumDate={today()}
              locale="it-IT"
              onChange={(_, d) => { if (d) setStartDate(d); }}
              style={styles.picker}
            />
```

Replace with:

```jsx
            <DateTimePicker
              testID="start-date-picker"
              value={startDate}
              mode="date"
              display="spinner"
              minimumDate={today()}
              locale="it-IT"
              onChange={(_, d) => { if (d) setStartDate(d); }}
              style={styles.picker}
            />
```

Second occurrence (end-date picker block):

```jsx
              <DateTimePicker
                value={endDate}
                mode="date"
                display="spinner"
                minimumDate={startDate}
                locale="it-IT"
                onChange={(_, d) => { if (d) setEndDate(d); }}
                style={styles.picker}
              />
```

Replace with:

```jsx
              <DateTimePicker
                testID="end-date-picker"
                value={endDate}
                mode="date"
                display="spinner"
                minimumDate={startDate}
                locale="it-IT"
                onChange={(_, d) => { if (d) setEndDate(d); }}
                style={styles.picker}
              />
```

- [ ] **Step 4: Add the half-day toggle**

Add `halfDay` state and import `formatLeaveDays`. Find:

```javascript
import { toISO, formatDateIT, today } from '../../utils/dateUtils';
```

Add right after it:

```javascript
import { formatLeaveDays } from '../../utils/formatLeaveDays';
```

Find:

```javascript
  const [reason, setReason] = useState('');
```

Add right after it:

```javascript
  const [halfDay, setHalfDay] = useState(false);
```

Find the `handleSubmit` function's payload construction:

```javascript
      await apiClient.post(ENDPOINTS.LEAVES_CREATE, {
        leave_type: leaveType,
        start_date: toISO(startDate),
        end_date: toISO(endDate),
        motivation: reason.trim() || null,
      });
```

Replace with:

```javascript
      await apiClient.post(ENDPOINTS.LEAVES_CREATE, {
        leave_type: leaveType,
        start_date: toISO(startDate),
        end_date: toISO(endDate),
        half_day: halfDay || undefined,
        motivation: reason.trim() || null,
      });
```

And reset `halfDay` on success — find:

```javascript
      Alert.alert('✅ Richiesta inviata', 'La tua richiesta di ferie è stata inviata al manager per approvazione.');
      setReason('');
      setStartDate(today());
      setEndDate(today());
```

Replace with:

```javascript
      Alert.alert('✅ Richiesta inviata', 'La tua richiesta di ferie è stata inviata al manager per approvazione.');
      setReason('');
      setHalfDay(false);
      setStartDate(today());
      setEndDate(today());
```

Add the toggle UI and the balance display fix. Find the balance display:

```jsx
                    <Text style={[styles.balanceDays, isActive && styles.balanceDaysActive]}>
                      {b.remaining_days ?? '—'}
                    </Text>
```

Replace with:

```jsx
                    <Text style={[styles.balanceDays, isActive && styles.balanceDaysActive]}>
                      {formatLeaveDays(b.remaining_days)}
                    </Text>
```

Find the end of the end-date block (right after its closing `</View>`, before `<Text style={styles.label}>Motivazione (opzionale)</Text>`):

```jsx
        </View>

        <Text style={styles.label}>Motivazione (opzionale)</Text>
```

Replace with:

```jsx
        </View>

        {toISO(startDate) === toISO(endDate) && (
          <TouchableOpacity
            style={styles.halfDayRow}
            onPress={() => setHalfDay((v) => !v)}
          >
            <View style={[styles.checkbox, halfDay && styles.checkboxChecked]}>
              {halfDay && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
            <Text style={styles.halfDayLabel}>Mezza giornata</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.label}>Motivazione (opzionale)</Text>
```

Add the new styles — find the `styles = StyleSheet.create({` block and add these entries (anywhere inside the object, e.g. right after `label: { ... }`):

```javascript
  halfDayRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  checkbox: {
    width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
  },
  checkboxChecked: { backgroundColor: '#1E3A5F', borderColor: '#1E3A5F' },
  checkboxMark: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  halfDayLabel: { fontSize: 14, color: '#374151', fontWeight: '500' },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend-mobile && npx jest src/__tests__/LeaveRequestScreen.test.jsx`
Expected: PASS — both tests.

- [ ] **Step 6: Commit**

```bash
git add frontend-mobile/src/screens/leave/LeaveRequestScreen.jsx frontend-mobile/src/__tests__/LeaveRequestScreen.test.jsx
git commit -m "feat(mobile): half-day toggle on LeaveRequestScreen, first screen-level test for this file"
```

---

### Task 14: `ManagerLeaveApprovalScreen.jsx` — `formatLeaveDays` display + first screen-level test for this file

**Files:**
- Modify: `frontend-mobile/src/screens/leave/ManagerLeaveApprovalScreen.jsx`
- Create: `frontend-mobile/src/__tests__/ManagerLeaveApprovalScreen.test.jsx`

- [ ] **Step 1: Write the failing test file**

Create `frontend-mobile/src/__tests__/ManagerLeaveApprovalScreen.test.jsx`:

```javascript
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('../services/apiClient', () => ({
  get: jest.fn(),
  put: jest.fn(),
}));

const apiClient = require('../services/apiClient');
const ManagerLeaveApprovalScreen = require('../screens/leave/ManagerLeaveApprovalScreen').default;

describe('ManagerLeaveApprovalScreen — half-day display', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows "0,5 giorno" (singular, comma-decimal) for a half-day pending request', async () => {
    apiClient.get.mockResolvedValue({ data: { data: [{
      id: 'req-1',
      employee_name: 'Maria Rossi',
      leave_type: 'FERIE_1',
      start_date: '2026-09-20',
      end_date: '2026-09-20',
      num_days: 0.5,
      motivation: null,
    }] } });

    const { findByText } = render(<ManagerLeaveApprovalScreen />);
    expect(await findByText(/0,5 giorno\b/)).toBeTruthy();
  });

  it('shows "1 giorno" (singular) for a full single day, not "1 giorni"', async () => {
    apiClient.get.mockResolvedValue({ data: { data: [{
      id: 'req-2',
      employee_name: 'Luigi Bianchi',
      leave_type: 'MALATTIA',
      start_date: '2026-09-21',
      end_date: '2026-09-21',
      num_days: 1,
      motivation: null,
    }] } });

    const { findByText } = render(<ManagerLeaveApprovalScreen />);
    expect(await findByText(/1 giorno\b/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend-mobile && npx jest src/__tests__/ManagerLeaveApprovalScreen.test.jsx`
Expected: FAIL — the raw `r.num_days` is rendered without `formatLeaveDays` (would show `0.5` with a dot, not `0,5`) — check the actual current failure message before proceeding to the fix, since the backend normalization from Task 3 already makes `r.num_days !== 1` work correctly as a plain number, so only the display formatting is missing here.

- [ ] **Step 3: Apply `formatLeaveDays` to the duration display**

In `frontend-mobile/src/screens/leave/ManagerLeaveApprovalScreen.jsx`, find the import for `formatDateIT` (or similar existing utils import) and add:

```javascript
import { formatLeaveDays } from '../../utils/formatLeaveDays';
```

Find:

```jsx
                  <Text style={styles.dates}>
                    {formatDateIT(r.start_date)} → {formatDateIT(r.end_date)}
                    {'  ·  '}{r.num_days} giorno{r.num_days !== 1 ? 'i' : ''}
                  </Text>
```

Replace with:

```jsx
                  <Text style={styles.dates}>
                    {formatDateIT(r.start_date)} → {formatDateIT(r.end_date)}
                    {'  ·  '}{formatLeaveDays(r.num_days)} giorno{r.num_days !== 1 ? 'i' : ''}
                  </Text>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend-mobile && npx jest src/__tests__/ManagerLeaveApprovalScreen.test.jsx`
Expected: PASS — both tests.

- [ ] **Step 5: Commit**

```bash
git add frontend-mobile/src/screens/leave/ManagerLeaveApprovalScreen.jsx frontend-mobile/src/__tests__/ManagerLeaveApprovalScreen.test.jsx
git commit -m "feat(mobile): formatLeaveDays on ManagerLeaveApprovalScreen, first screen-level test for this file"
```

---

### Task 15: Regression test — Planning Page blocks the full day even for half-day leave (accepted limitation)

**Files:**
- Modify: `frontend-web/src/features/planning/pages/PlanningPage.test.jsx`

- [ ] **Step 1: Write the test**

This locks in a deliberate, user-approved limitation (design spec finding #7): the design decided NOT to change `PlanningPage.jsx` in this work, so this test should already pass. Add this `it()` inside the existing `describe('isDateBlocked helper', ...)` block, after `'should handle single-day leave requests'`:

```javascript
    it('blocks the entire day even when the approved leave is a half-day (num_days=0.5) — known limitation, accepted for now (see design spec finding #7, not fixed in this work)', () => {
      const approvedLeaves = [
        {
          user_id: 'emp-001',
          start_date: '2026-09-20',
          end_date: '2026-09-20',
          num_days: 0.5,
        },
      ];

      expect(isDateBlocked('emp-001', '2026-09-20', approvedLeaves)).toBe(true);
    });
```

- [ ] **Step 2: Run the test**

Run: `cd frontend-web && npx vitest run src/features/planning/pages/PlanningPage.test.jsx`
Expected: PASS immediately — `isDateBlocked` never looks at `num_days`, confirming the accepted limitation is exactly what ships.

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/features/planning/pages/PlanningPage.test.jsx
git commit -m "test(web): lock in that PlanningPage blocks the full day for half-day leave (accepted limitation)"
```

---

### Task 16: Full suite run + TASKS.md update

**Files:**
- Modify: `TASKS.md`

- [ ] **Step 1: Run the full backend suite**

Run: `cd backend && npm test`
Expected: all suites pass, 0 failures (per CLAUDE.md's pre-commit/pre-merge test periodicity rule).

- [ ] **Step 2: Run the full frontend-web suite**

Run: `cd frontend-web && npm test -- --run`
Expected: all suites pass, 0 failures.

- [ ] **Step 3: Run the full frontend-mobile suite**

Run: `cd frontend-mobile && npm test`
Expected: all suites pass, 0 failures.

- [ ] **Step 4: Run the timezone-cast and FAQ-sync checks (touched migrations/backend)**

Run: `cd backend && node scripts/check-timestamptz-casts.js && node scripts/check-faq-sync.js`
Expected: both exit 0 — migration 044 doesn't touch any TIMESTAMPTZ column, so this should be unaffected, but it's a required pre-commit check per CLAUDE.md whenever backend/migrations change.

- [ ] **Step 5: Update `TASKS.md`**

Find the `ONB.2` entry (search for `### ONB.2`) and replace its heading and body with:

```markdown
### ONB.2 — ✅ Saldi: mezze giornate Ferie (COMPLETO, 2026-09-13)

Implementato secondo design spec `docs/superpowers/specs/2026-09-12-onb2-half-day-leave-balances-design.md` e piano `docs/superpowers/plans/2026-09-13-onb2-half-day-leave-balances.md`. Scope: solo mezze giornate su FERIE_1/2/3 (0.5), non Permessi/ROL in ore.

- Migration 044: `leave_saldi.total_days/used_days/remaining_days` e `leave_requests.num_days` → `NUMERIC(6,2)`
- Backend: flag `half_day` (solo su richiesta di un singolo giorno, solo Ferie), normalizzazione centralizzata NUMERIC→Number in `leaves.js`
- Fix bug reale trovato durante l'analisi: `parseWorkbook.js` arrotondava silenziosamente i saldi decimali importati (`normInt` → `normDecimal`)
- Toggle mezza giornata su 3 form di richiesta (web dipendente, web manager, mobile) — rimossi 4 ricalcoli client-side duplicati del conteggio giorni, ora tutti usano `num_days` dal backend
- Regression test espliciti: mezza giornata continua a generare conflitto Evento/Malattia (Pattern 7, nessuna modifica di codice necessaria); Planning Page blocca comunque l'intero giorno per mezza ferie (limitazione nota, accettata esplicitamente — non risolta in questo lavoro)
- Primi test screen-level mai scritti per `LeaveRequestScreen.jsx`/`ManagerLeaveApprovalScreen.jsx` (mobile)

**ONB.2b (futuro, non iniziato)**: Permessi/ROL in ore — richiede un nuovo tipo di assenza da zero (oggi `leaves` ha solo 4 codici), non è un'estensione di questo lavoro.
```

- [ ] **Step 6: Commit**

```bash
git add TASKS.md
git commit -m "docs: mark ONB.2 (half-day Ferie balances) complete"
```

---

## Self-Review Notes

**Spec coverage:** All numbered findings in the design spec (1-7) map to a task: schema ordering → Task 1; centralized normalization → Task 3; onboarding rounding bug → Task 5; conflict-check regression → Task 4; Planning Page limitation → Task 15; mobile parity → Tasks 13-14. All 4 decisions (scope, UX toggle, no data migration, display format) are implemented across Tasks 1, 3, 7-14.

**Type consistency:** `formatLeaveDays` has the identical signature and behavior in both `frontend-web/src/utils/formatLeaveDays.js` (Task 7) and `frontend-mobile/src/utils/formatLeaveDays.js` (Task 12) — verified both code blocks match. `normalizeLeaveNumerics` (Task 3) and `normDecimal` (Task 5) are distinct, intentionally — one normalizes API output (string→number), the other normalizes import input (rounds to 2 decimals); they operate on different data at different layers and were not confused with each other in any task.

**Known risk carried into execution:** Tasks 9 and 11 ask the implementer to check an existing test file's mock/override pattern before writing new assertions, rather than providing verbatim code, because the exact fixture-override mechanism in `ManagerLeaveRequest.test.jsx` and `ManagerLeaveApprovalPanel.test.jsx` wasn't fully re-verified against Task 8's assumptions during planning. Flag this to the reviewer if the pattern doesn't match.
