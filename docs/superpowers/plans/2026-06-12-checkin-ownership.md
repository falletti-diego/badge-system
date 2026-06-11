# S.32.1 Check-in Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedire il buddy punching: su POST /checkins, employee e manager possono creare check-in solo per sé stessi; solo gli admin per altri dipendenti del tenant.

**Architecture:** Guard fail-closed nel route handler di `POST /checkins`, subito dopo la validazione Zod e prima della transazione. Nessuna modifica a schema Zod, DB, mobile o dashboard. Spec approvata: `docs/superpowers/specs/2026-06-12-checkin-ownership-design.md`.

**Tech Stack:** Node.js 20 + Express 4, Jest + supertest (pool mockato, token RS256 reali firmati con la chiave di test generata in `jest.setup.js`).

**Contesto chiave per chi implementa:**
- Working dir dei comandi: `backend/` (dentro il repo).
- I test esistenti in `src/__tests__/checkins.test.js` girano con `DISABLE_AUTH=true` → il middleware auth monta un utente mock con `role: 'admin'` → l'ownership check viene saltato → **quei test restano verdi senza modifiche**.
- `src/__tests__/checkins-geofence.test.js` usa token reali ma il suo `EMP_TOKEN` ha `employee_id` uguale al body → resta verde.
- `ForbiddenError(message, code)` esiste già in `src/utils/errors.js` e il middleware errori di `app.js` lo mappa a 403 con `{ error: <code>, message, statusCode }`.

---

### Task 1: Test di ownership (TDD — prima i test che falliscono)

**Files:**
- Create: `backend/src/__tests__/checkins-ownership.test.js`

- [ ] **Step 1: Scrivi il file di test completo**

```js
'use strict';

/**
 * Tests for S.32.1 — Ownership check on POST /api/checkins
 * employee/manager: solo self check-in; admin: chiunque nel tenant.
 * Spec: docs/superpowers/specs/2026-06-12-checkin-ownership-design.md
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// ─── Mocks (stesso pattern di checkins-geofence.test.js) ─────────────────────

jest.mock('../db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock('../db/redis', () => ({
  deleteCacheByPattern: jest.fn().mockResolvedValue(undefined),
  redisClient: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('../middleware/rateLimiter', () => ({
  apiLimiter: (req, res, next) => next(),
  authLimiter: (req, res, next) => next(),
  csvLimiter: (req, res, next) => next(),
}));

const { pool } = require('../db/pool');

// Disable global DISABLE_AUTH bypass so JWT role checks work
beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
afterAll(() => { process.env.DISABLE_AUTH = 'true'; });

// ─── Token helpers ────────────────────────────────────────────────────────────

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const CLIENT_ID   = '550e8400-e29b-41d4-a716-446655440001';
const SITE_ID     = '550e8400-e29b-41d4-a716-446655440010';
const EMP_A_ID    = '550e8400-e29b-41d4-a716-446655440100';
const EMP_B_ID    = '550e8400-e29b-41d4-a716-446655440101';

const EMP_A_TOKEN = makeToken({ user_id: EMP_A_ID, client_id: CLIENT_ID, role: 'employee', employee_id: EMP_A_ID });
// Employee senza employee_id nel token (es. demo maria/lucia)
const EMP_NOPROFILE_TOKEN = makeToken({ user_id: 'user-mvp-maria', client_id: CLIENT_ID, role: 'employee' });
const MGR_TOKEN   = makeToken({ user_id: EMP_A_ID, client_id: CLIENT_ID, role: 'manager', employee_id: EMP_A_ID, site_id: SITE_ID });
const MGR_NOPROFILE_TOKEN = makeToken({ user_id: 'user-mvp-pino', client_id: CLIENT_ID, role: 'manager' });
const ADMIN_TOKEN = makeToken({ user_id: 'admin-uuid-1', client_id: CLIENT_ID, role: 'admin' });

const app = require('../app');
const logger = require('../utils/logger');

// ─── Mock helper: SQL-based dispatch (l'ordine BEGIN/COMMIT non conta) ────────

function mockHappyPath(targetEmployeeId) {
  pool.query.mockImplementation((sql) => {
    const s = sql.trim().toUpperCase();
    if (s.startsWith('BEGIN') || s.startsWith('COMMIT') || s.startsWith('ROLLBACK')) {
      return Promise.resolve({ rows: [] });
    }
    if (s.includes('FROM EMPLOYEES WHERE ID') && s.includes('AND CLIENT_ID')) {
      return Promise.resolve({ rows: [{ id: targetEmployeeId, client_id: CLIENT_ID }] });
    }
    if (s.includes('FROM SITES')) {
      // geofence disattivato — il test non riguarda il GPS
      return Promise.resolve({
        rows: [{
          id: SITE_ID,
          geofence_enabled: false,
          geofencing_feature_enabled: true,
          latitude: null,
          longitude: null,
          geofence_radius_meters: null,
        }],
      });
    }
    if (s.includes('ANY(ASSIGNED_SITES)')) {
      return Promise.resolve({ rows: [{ '?column?': 1 }] });
    }
    if (s.startsWith('INSERT INTO CHECKINS')) {
      return Promise.resolve({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440999',
          employee_id: targetEmployeeId,
          site_id: SITE_ID,
          type: 'IN',
          timestamp: new Date().toISOString(),
          created_at: new Date().toISOString(),
        }],
      });
    }
    return Promise.resolve({ rows: [] }); // audit_log e altro
  });
}

function postCheckin(token, employeeId) {
  return request(app)
    .post('/api/v1/checkins')
    .set('Authorization', `Bearer ${token}`)
    .send({ employee_id: employeeId, site_id: SITE_ID, type: 'IN' });
}

beforeEach(() => jest.clearAllMocks());

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/checkins — ownership (S.32.1)', () => {
  it('employee crea check-in per sé stesso → 201', async () => {
    mockHappyPath(EMP_A_ID);
    const res = await postCheckin(EMP_A_TOKEN, EMP_A_ID);
    expect(res.status).toBe(201);
    expect(res.body.data.employee_id).toBe(EMP_A_ID);
  });

  it('employee crea check-in per un collega → 403 CHECKIN_OWNERSHIP', async () => {
    mockHappyPath(EMP_B_ID);
    const res = await postCheckin(EMP_A_TOKEN, EMP_B_ID);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CHECKIN_OWNERSHIP');
    // L'INSERT non deve mai essere eseguito
    const insertCalls = pool.query.mock.calls.filter(
      ([sql]) => sql.trim().toUpperCase().startsWith('INSERT INTO CHECKINS')
    );
    expect(insertCalls).toHaveLength(0);
  });

  it('employee senza employee_id nel token → 403 CHECKIN_NO_EMPLOYEE_PROFILE', async () => {
    mockHappyPath(EMP_A_ID);
    const res = await postCheckin(EMP_NOPROFILE_TOKEN, EMP_A_ID);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CHECKIN_NO_EMPLOYEE_PROFILE');
  });

  it('manager crea check-in per sé stesso → 201 (flusso Session 13 intatto)', async () => {
    mockHappyPath(EMP_A_ID);
    const res = await postCheckin(MGR_TOKEN, EMP_A_ID);
    expect(res.status).toBe(201);
  });

  it('manager crea check-in per un altro dipendente → 403 CHECKIN_OWNERSHIP', async () => {
    mockHappyPath(EMP_B_ID);
    const res = await postCheckin(MGR_TOKEN, EMP_B_ID);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CHECKIN_OWNERSHIP');
  });

  it('manager senza employee_id nel token → 403 CHECKIN_NO_EMPLOYEE_PROFILE', async () => {
    mockHappyPath(EMP_A_ID);
    const res = await postCheckin(MGR_NOPROFILE_TOKEN, EMP_A_ID);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CHECKIN_NO_EMPLOYEE_PROFILE');
  });

  it('admin crea check-in per qualunque dipendente del tenant → 201', async () => {
    mockHappyPath(EMP_B_ID);
    const res = await postCheckin(ADMIN_TOKEN, EMP_B_ID);
    expect(res.status).toBe(201);
    expect(res.body.data.employee_id).toBe(EMP_B_ID);
  });

  it('la violazione emette logger.warn con action checkin_ownership_violation', async () => {
    mockHappyPath(EMP_B_ID);
    const warnSpy = jest.spyOn(logger, 'warn');
    await postCheckin(EMP_A_TOKEN, EMP_B_ID);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'checkin_ownership_violation', attempted_employee_id: EMP_B_ID })
    );
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano nei punti giusti**

Run: `cd backend && npx jest src/__tests__/checkins-ownership.test.js --verbose`

Atteso: i test "→ 201" (employee self, manager self, admin) **passano** già (la vulnerabilità permette tutto); i 5 test che attendono 403 / warn log **FALLISCONO** ricevendo 201. Se un test 201 fallisce, il mock dispatch non matcha le query — confrontare con `checkins-geofence.test.js` prima di procedere.

- [ ] **Step 3: Commit dei soli test (rossi)**

```bash
git add backend/src/__tests__/checkins-ownership.test.js
git commit -m "test: failing ownership tests for POST /checkins (S.32.1)"
```

---

### Task 2: Guard di ownership nel route handler

**Files:**
- Modify: `backend/src/routes/checkins.js` (import a riga 14, guard dopo riga 28, cleanup a riga ~399-401)

- [ ] **Step 1: Aggiungi ForbiddenError all'import esistente**

Riga 14 di `backend/src/routes/checkins.js`, da:

```js
const { NotFoundError, ValidationError, GeofenceError } = require('../utils/errors');
```

a:

```js
const { NotFoundError, ValidationError, ForbiddenError, GeofenceError } = require('../utils/errors');
```

- [ ] **Step 2: Aggiungi il guard nel POST handler**

In `router.post('/', ...)`, il codice attuale inizia così:

```js
router.post('/', requireAuth, createValidationMiddleware(PostCheckinSchema), async (req, res, next) => {
  const { employee_id, site_id, type } = req.validated.body;
  const clientId = req.user.client_id;

  try {
    const result = await withTransaction(async (client) => {
```

Inserisci il guard dentro il `try`, PRIMA di `withTransaction` (così il 403 arriva a `next(err)` senza aprire transazioni):

```js
  try {
    // S.32.1: ownership check — only admins may create check-ins for other employees
    if (req.user.role !== 'admin') {
      if (!req.user.employee_id) {
        throw new ForbiddenError(
          'Your account has no employee profile — cannot create check-ins',
          'CHECKIN_NO_EMPLOYEE_PROFILE'
        );
      }
      if (req.user.employee_id !== employee_id) {
        logger.warn({
          action: 'checkin_ownership_violation',
          user_id: req.user.user_id,
          attempted_employee_id: employee_id,
        });
        throw new ForbiddenError('You can only create check-ins for yourself', 'CHECKIN_OWNERSHIP');
      }
    }

    const result = await withTransaction(async (client) => {
```

- [ ] **Step 3: Cleanup — rimuovi il require lazy nel PUT handler**

Nel PUT handler (`router.put('/:id', ...)`, riga ~399) c'è:

```js
  if (req.user.role === 'viewer' || req.user.role === 'employee') {
    const { ForbiddenError } = require('../utils/errors');
    return next(new ForbiddenError('Only managers and admins can correct check-ins', 'FORBIDDEN_ROLE'));
  }
```

Rimuovi la riga del require lazy (ForbiddenError è ora importato in cima):

```js
  if (req.user.role === 'viewer' || req.user.role === 'employee') {
    return next(new ForbiddenError('Only managers and admins can correct check-ins', 'FORBIDDEN_ROLE'));
  }
```

- [ ] **Step 4: Esegui i test di ownership — tutti verdi**

Run: `cd backend && npx jest src/__tests__/checkins-ownership.test.js --verbose`
Atteso: 8/8 PASS.

- [ ] **Step 5: Esegui l'intera suite — nessuna regressione**

Run: `cd backend && npm run test 2>&1 | tail -20`
Atteso: tutte le suite PASS (212 test esistenti + 8 nuovi = 220). In particolare
`checkins.test.js` (gira come admin via DISABLE_AUTH) e `checkins-geofence.test.js`
(EMP_TOKEN ha employee_id coerente col body) devono restare verdi senza modifiche.
Se una suite fallisce, fermarsi e analizzare prima di toccare i test esistenti.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/checkins.js
git commit -m "fix(security): enforce ownership on POST /checkins — employees/managers self-only, admin any (S.32.1)"
```

---

### Task 3: Chiusura task, push e verifica deploy

**Files:**
- Modify: `TASKS.md` (sezione S.32.1)

- [ ] **Step 1: Spunta le checkbox S.32.1 in TASKS.md**

Nella sezione `### S.32.1`, cambia le tre checkbox `- [ ]` in `- [x]` e aggiungi in fondo
alla sezione la riga:

```markdown
- ✅ Completato 2026-06-12 — guard fail-closed in checkins.js, 8 test in checkins-ownership.test.js
```

- [ ] **Step 2: Commit e push (il deploy backend parte da GitHub Actions)**

```bash
git add TASKS.md
git commit -m "docs: mark S.32.1 complete in TASKS.md"
git push origin main
```

- [ ] **Step 3: Verifica il deploy in produzione**

Attendi il completamento del workflow (≈3-5 min), poi:

```bash
curl -s https://api.dataxiom.it/health
```

Atteso: `{"status":"ok",...,"database":"connected"}`.

Verifica funzionale del guard in produzione (login employee demo con employee_id reale,
poi tentativo di check-in per un altro UUID → atteso 403 `CHECKIN_OWNERSHIP`):

```bash
TOKEN=$(curl -s -X POST https://api.dataxiom.it/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"diego@badge.local","password":"<DEMO_DIEGO_PASSWORD>"}' |
  python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["token"])')

curl -s -X POST https://api.dataxiom.it/api/v1/checkins \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"employee_id":"550e8400-e29b-41d4-a716-446655440100","site_id":"550e8400-e29b-41d4-a716-446655440012","type":"IN"}'
```

Atteso: `{"error":"CHECKIN_OWNERSHIP",...}` con status 403 (l'employee_id nel comando è
diverso da quello di Diego `...440200`).
