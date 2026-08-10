# Firma Digitale Cartellino Mensile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Il dipendente vede il proprio riepilogo ore mensile (vista oggi inesistente per il ruolo `employee`) e può approvarlo con un click tracciato in audit log. La firma viene invalidata automaticamente se un check-in del mese firmato viene creato o corretto dopo la firma stessa (inclusa la sincronizzazione offline con backdating fino a 48h). Admin/manager/viewer vedono lo stato di firma per ogni dipendente nella tabella riepilogo esistente.

**Architecture:** Nessuna modifica architetturale. Nuova tabella `timesheet_signatures` (snapshot immutabile delle ore al momento della firma, mai ricalcolato). Una singola funzione di invalidazione condivisa richiamata da entrambi i punti che scrivono un `checkin.timestamp` (creazione e correzione), non due logiche duplicate. Riuso completo di `utils/hours.js` (`calculateDailyHours`/`aggregateMonthly`) già usato da `GET /presences/summary`.

**Tech Stack:** Node.js/Express/Zod/Jest (backend) · React/MUI/Vitest (frontend-web) · PostgreSQL migration.

**Rollout:** Ogni task committa su `main` (lavoro diretto, non worktree — stesso trattamento concordato per il lavoro docs/feature di questa sessione data la dimensione contenuta). A fine piano: `/test-all` completo → lint → push → verifica deploy CI/CD in cascata (stesso meccanismo già osservato per Fase C: `Build & Push Backend to ECR` → `Deploy to EC2`).

---

## File Structure (riepilogo di cosa viene toccato)

**Backend:**
- `backend/migrations/039_add_timesheet_signatures.sql` (nuovo)
- `backend/src/utils/timesheetSignature.js` (nuovo) — `invalidateSignatureIfExists()`
- `backend/src/routes/timesheet.js` (nuovo) — `POST /timesheet/sign`
- `backend/src/routes/presences.js` — nuovo `GET /my-summary`, estensione `GET /summary` con colonna firma
- `backend/src/routes/checkins.js` — richiama `invalidateSignatureIfExists()` in `POST /` e `PUT /:id`
- `backend/src/middleware/validation.js` — nuovi schema `GetMySummarySchema`, `PostTimesheetSignSchema`
- `backend/src/app.js` — monta il nuovo router `/timesheet`
- Test: `backend/src/__tests__/timesheet-sign.test.js`, `timesheet-invalidation.test.js` (nuovi), estensione `presences-summary.test.js`, `checkins.test.js`/`checkins-ownership.test.js` (se serve mock aggiuntivo)

**Frontend-web:**
- `frontend-web/src/pages/MySummaryPage.jsx` (nuovo)
- `frontend-web/src/App.jsx` — nuova route `/my-summary`
- `frontend-web/src/pages/SummaryPage.jsx` — nuova colonna "Firmato"
- Test: `frontend-web/src/__tests__/MySummaryPage.test.jsx` (nuovo), estensione `SummaryPage.test.jsx`

---

## Task 1: Migration — tabella `timesheet_signatures`

**Files:**
- Create: `backend/migrations/039_add_timesheet_signatures.sql`

- [ ] **Step 1: Scrivere la migration**

```sql
-- 039_add_timesheet_signatures.sql
-- Firma digitale cartellino mensile (2026-08-10): il dipendente approva
-- esplicitamente le ore del mese, snapshot immutabile al momento della firma
-- (non ricalcolato retroattivamente se utils/hours.js cambia in futuro —
-- una firma deve rappresentare esattamente cosa il dipendente ha visto,
-- altrimenti perde valore probatorio). UNIQUE (employee_id, month, year)
-- serve sia da vincolo di idempotenza (upsert su doppio click) sia da
-- indice per il lookup più comune.
CREATE TABLE IF NOT EXISTS timesheet_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INT NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  status TEXT NOT NULL DEFAULT 'signed' CHECK (status IN ('signed', 'invalidated')),
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invalidated_at TIMESTAMPTZ,
  ore_totali NUMERIC(6,2) NOT NULL,
  ore_ordinarie NUMERIC(6,2) NOT NULL,
  ore_straordinarie NUMERIC(6,2) NOT NULL,
  giorni_presenti INT NOT NULL,
  buoni_pasto INT NOT NULL,
  UNIQUE (employee_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_timesheet_signatures_client_period ON timesheet_signatures(client_id, year, month);
```

- [ ] **Step 2: Applicare in locale e verificare**

Run: `cd backend && npm run migrate` (o lo script equivalente già in uso, es. `node scripts/run-migrations.js`)
Expected: migration 039 applicata senza errori; `\d timesheet_signatures` in psql mostra tabella, vincoli e indice.

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/039_add_timesheet_signatures.sql
git commit -m "feat(db): add timesheet_signatures table (firma digitale cartellino)"
```

---

## Task 2: Backend — funzione condivisa `invalidateSignatureIfExists`

**Files:**
- Create: `backend/src/utils/timesheetSignature.js`
- Test: Create `backend/src/__tests__/timesheet-invalidation-util.test.js`

- [ ] **Step 1: Test rosso**

```javascript
// backend/src/__tests__/timesheet-invalidation-util.test.js
'use strict';

jest.mock('../db/pool', () => ({ pool: { query: jest.fn() } }));

const { invalidateSignatureIfExists } = require('../utils/timesheetSignature');

describe('invalidateSignatureIfExists', () => {
  it('invalida la firma signed per il mese/anno derivati dal timestamp (UTC)', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rowCount: 1 }) };
    await invalidateSignatureIfExists(client, 'emp-1', '2026-07-31T23:30:00.000Z');

    expect(client.query).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE timesheet_signatures/i),
      ['emp-1', 7, 2026]
    );
  });

  it('è un no-op silenzioso se non esiste nessuna firma signed per quel mese (0 righe toccate)', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rowCount: 0 }) };
    await expect(invalidateSignatureIfExists(client, 'emp-1', '2026-07-15T10:00:00.000Z')).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd backend && npx jest timesheet-invalidation-util`
Expected: FAIL — `../utils/timesheetSignature` non esiste ancora.

- [ ] **Step 3: Implementare**

```javascript
// backend/src/utils/timesheetSignature.js
'use strict';

// Deriva mese/anno in UTC dal timestamp del check-in — stessa convenzione
// già usata da GET /presences/summary (Date.UTC(year, month-1, 1)), non un
// nuovo assunto sul fuso orario introdotto da questa feature.
async function invalidateSignatureIfExists(client, employeeId, checkinTimestamp) {
  const d = new Date(checkinTimestamp);
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();
  await client.query(
    `UPDATE timesheet_signatures
     SET status = 'invalidated', invalidated_at = NOW()
     WHERE employee_id = $1::uuid AND month = $2 AND year = $3 AND status = 'signed'`,
    [employeeId, month, year]
  );
}

module.exports = { invalidateSignatureIfExists };
```

- [ ] **Step 4: Rieseguire il test**

Run: `cd backend && npx jest timesheet-invalidation-util`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/timesheetSignature.js backend/src/__tests__/timesheet-invalidation-util.test.js
git commit -m "feat(backend): add shared invalidateSignatureIfExists util"
```

---

## Task 3: Backend — agganciare l'invalidazione a `POST /checkins` e `PUT /checkins/:id`

**Files:**
- Modify: `backend/src/routes/checkins.js`
- Test: Modify `backend/src/__tests__/checkins.test.js` (o creare `checkins-timesheet-invalidation.test.js` se il file esistente è già molto esteso — verificare con `wc -l` prima di scegliere)

- [ ] **Step 1: Test rosso su POST /checkins**

Aggiungere (adattare al mock di `pool.query` sequenziale già in uso nel file di test scelto — leggere un test esistente di `POST /checkins` per il pattern esatto prima di scrivere questo):

```javascript
it('un nuovo check-in in un mese già firmato invalida la firma (finding firma digitale, fix #3 — copre anche il sync offline)', async () => {
  // Mock sequence: employee lookup, site lookup, assignment check, INSERT checkin,
  // poi la UPDATE di invalidateSignatureIfExists, poi logAudit — seguire l'ordine
  // esatto delle query già presente nell'handler (leggere routes/checkins.js POST
  // prima di scrivere i mock, i numeri di riga di questo piano potrebbero non
  // combaciare esattamente se il file è cambiato nel frattempo).
  // Assert: tra le chiamate a pool/client.query compare una query che matcha
  // /UPDATE timesheet_signatures/i con i parametri [employee_id, month, year]
  // corretti derivati da occurred_at.
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd backend && npx jest checkins --testPathPattern=<file scelto allo Step 1>`
Expected: FAIL — nessuna chiamata a `invalidateSignatureIfExists` avviene oggi.

- [ ] **Step 3: Implementare in `POST /checkins`**

In `backend/src/routes/checkins.js`, aggiungere l'import in cima al file:

```javascript
const { invalidateSignatureIfExists } = require('../utils/timesheetSignature');
```

Poi, dentro `router.post('/', ...)`, subito prima di `return { checkin, deduplicated };` (dopo il blocco `if (!deduplicated) { await logAudit(...) }`):

```javascript
      // Fix #3 (firma digitale): un nuovo check-in — incluso il sync offline con
      // occurred_at backdated fino a 48h (validation.js) — deve invalidare una firma
      // già data per quel mese. Chiamata incondizionata: se non esiste nessuna firma
      // signed per quel mese, la UPDATE tocca 0 righe, no-op sicuro.
      await invalidateSignatureIfExists(client, checkin.employee_id, checkin.timestamp);

      return { checkin, deduplicated };
```

- [ ] **Step 4: Implementare in `PUT /checkins/:id`**

Nello stesso file, dentro `router.put('/:id', ...)`, subito prima di `return { updated, oldValues };`:

```javascript
      // Fix #3: invalida sia il mese vecchio sia il nuovo se una correzione sposta
      // il timestamp in un mese diverso (entrambi potrebbero avere una firma attiva).
      await invalidateSignatureIfExists(client, checkin.employee_id, oldValues.timestamp);
      if (updated.timestamp !== oldValues.timestamp) {
        await invalidateSignatureIfExists(client, checkin.employee_id, updated.timestamp);
      }

      return { updated, oldValues };
```

- [ ] **Step 5: Rieseguire il test e l'intera suite checkins**

Run: `cd backend && npx jest checkins checkins-ownership checkins-offline checkins-geofence checkins-faceid`
Expected: tutti verdi — nessuna regressione (la chiamata aggiunta è un no-op quando non esiste nessuna firma, che è il caso di tutti i test esistenti).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/checkins.js backend/src/__tests__/
git commit -m "feat(backend): invalidate timesheet signature on check-in create/correct"
```

---

## Task 4: Backend — `GET /api/v1/presences/my-summary`

**Files:**
- Modify: `backend/src/routes/presences.js`
- Modify: `backend/src/middleware/validation.js`
- Test: Create `backend/src/__tests__/presences-my-summary.test.js`

- [ ] **Step 1: Aggiungere lo schema di validazione**

In `backend/src/middleware/validation.js`, subito dopo `GetPresencesSummarySchema` (stesso pattern, stessi default):

```javascript
const GetMySummarySchema = z.object({
  query: z.object({
    month: z.coerce
      .number()
      .int('month must be an integer')
      .min(1, 'month must be between 1 and 12')
      .max(12, 'month must be between 1 and 12')
      .default(new Date().getMonth() + 1),
    year: z.coerce
      .number()
      .int('year must be an integer')
      .min(2020, 'year must be 2020 or later')
      .default(new Date().getFullYear()),
  }),
});
```

E aggiungere `GetMySummarySchema,` all'export in fondo al file, accanto a `GetPresencesSummarySchema,`.

- [ ] **Step 2: Test rosso**

```javascript
// backend/src/__tests__/presences-my-summary.test.js
'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../db/pool', () => ({ pool: { query: jest.fn() } }));
jest.mock('../db/redis', () => ({ deleteCacheByPattern: jest.fn(), redisClient: { get: jest.fn(), set: jest.fn() } }));
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

const EMPLOYEE_ID = '11111111-1111-1111-1111-111111111111';
const CLIENT_ID = '22222222-2222-2222-2222-222222222222';

describe('GET /api/v1/presences/my-summary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ritorna solo i propri check-in, mai quelli di un altro dipendente (nessun employee_id accettato in query)', async () => {
    const token = makeToken({ user_id: EMPLOYEE_ID, employee_id: EMPLOYEE_ID, client_id: CLIENT_ID, role: 'employee' });

    pool.query
      .mockResolvedValueOnce({ rows: [
        { id: 'c1', employee_id: EMPLOYEE_ID, timestamp: '2026-07-01T08:00:00Z', type: 'IN' },
        { id: 'c2', employee_id: EMPLOYEE_ID, timestamp: '2026-07-01T17:00:00Z', type: 'OUT' },
      ] }) // check-ins query
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: 6 }] }) // client meal voucher config
      .mockResolvedValueOnce({ rows: [] }); // signature lookup: nessuna firma

    const res = await request(app)
      .get('/api/v1/presences/my-summary?month=7&year=2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.period).toEqual({ month: 7, year: 2026 });
    expect(res.body.data.signature).toBeNull();
    // La query dei check-in deve essere scoped su employee_id derivato dal JWT,
    // mai da un parametro esterno — questo test lo verifica indirettamente: non
    // esiste nessun modo di passare un employee_id diverso nella richiesta.
    expect(pool.query.mock.calls[0][1]).toContain(EMPLOYEE_ID);
  });

  it('espone lo stato della firma quando esiste', async () => {
    const token = makeToken({ user_id: EMPLOYEE_ID, employee_id: EMPLOYEE_ID, client_id: CLIENT_ID, role: 'employee' });

    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: 6 }] })
      .mockResolvedValueOnce({ rows: [{ status: 'signed', signed_at: '2026-08-02T09:14:00Z' }] });

    const res = await request(app)
      .get('/api/v1/presences/my-summary?month=7&year=2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.signature).toEqual({ status: 'signed', signed_at: '2026-08-02T09:14:00Z' });
  });
});
```

- [ ] **Step 3: Eseguire e verificare che fallisca**

Run: `cd backend && npx jest presences-my-summary`
Expected: FAIL — `GET /my-summary` non esiste (404).

- [ ] **Step 4: Implementare in `presences.js`**

Nessun nuovo import necessario in questo file (`invalidateSignatureIfExists` è usato solo in `checkins.js`, dal Task 3). Aggiungere la nuova route dopo `GET /summary` esistente e prima di `GET /trend`:

```javascript
// =====================================================
// GET /api/presences/my-summary?month=6&year=2026
// Self-scoped: employee_id e client_id SEMPRE da req.user, mai da input —
// elimina strutturalmente la classe di bug "vedo il cartellino di un altro
// dipendente" invece di prevenirla con un controllo aggiuntivo.
// =====================================================

router.get('/my-summary', requireAuth, createValidationMiddleware(GetMySummarySchema), async (req, res, next) => {
  const { month, year } = req.validated.query;
  const { client_id, employee_id } = req.user;

  if (!employee_id) {
    return next(new ForbiddenError('Your account has no employee profile', 'NO_EMPLOYEE_PROFILE'));
  }

  try {
    const dateFrom = new Date(Date.UTC(year, month - 1, 1));
    const dateTo = new Date(Date.UTC(year, month, 1));

    const checkinsResult = await pool.query(
      `SELECT ci.id, ci.employee_id, ci.timestamp, ci.type
       FROM checkins ci
       WHERE ci.client_id = $1::uuid AND ci.employee_id = $2::uuid
         AND ci.timestamp >= $3 AND ci.timestamp < $4
       ORDER BY ci.timestamp ASC`,
      [client_id, employee_id, dateFrom.toISOString(), dateTo.toISOString()]
    );

    const clientResult = await pool.query(
      'SELECT meal_voucher_hours FROM clients WHERE id = $1::uuid LIMIT 1',
      [client_id]
    );
    const mealVoucherHours = clientResult.rows[0]?.meal_voucher_hours ?? 5.0;

    const dailyEntries = calculateDailyHours(checkinsResult.rows);
    const monthlyAgg = aggregateMonthly(dailyEntries, Number(mealVoucherHours));
    const agg = monthlyAgg.get(employee_id) || {
      ore_totali: 0, ore_ordinarie: 0, ore_straordinarie: 0, buoni_pasto: 0, giorni_presenti: 0, presenze_aperte: 0,
    };

    const signatureResult = await pool.query(
      `SELECT status, signed_at FROM timesheet_signatures
       WHERE employee_id = $1::uuid AND month = $2 AND year = $3`,
      [employee_id, month, year]
    );
    const signature = signatureResult.rows.length > 0
      ? { status: signatureResult.rows[0].status, signed_at: signatureResult.rows[0].signed_at }
      : null;

    res.json({
      success: true,
      data: {
        period: { month, year },
        giorni_presenti: agg.giorni_presenti,
        ore_totali: agg.ore_totali,
        ore_ordinarie: agg.ore_ordinarie,
        ore_straordinarie: agg.ore_straordinarie,
        buoni_pasto: agg.buoni_pasto,
        presenze_aperte: agg.presenze_aperte,
        signature,
      },
    });
  } catch (err) {
    next(err);
  }
});
```

Aggiungere `GetMySummarySchema` alla destrutturazione dell'import da `../middleware/validation` in cima al file (accanto a `GetPresencesSummarySchema`).

- [ ] **Step 5: Rieseguire il test**

Run: `cd backend && npx jest presences-my-summary`
Expected: PASS.

- [ ] **Step 6: Suite presences completa**

Run: `cd backend && npx jest presences-summary presences-my-summary presences-trend`
Expected: tutti verdi.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/presences.js backend/src/middleware/validation.js backend/src/__tests__/presences-my-summary.test.js
git commit -m "feat(backend): add self-scoped GET /presences/my-summary for employees"
```

---

## Task 5: Backend — `POST /api/v1/timesheet/sign`

**Files:**
- Create: `backend/src/routes/timesheet.js`
- Modify: `backend/src/middleware/validation.js`
- Modify: `backend/src/app.js`
- Test: Create `backend/src/__tests__/timesheet-sign.test.js`

- [ ] **Step 1: Aggiungere lo schema di validazione**

In `backend/src/middleware/validation.js`, accanto a `GetMySummarySchema`:

```javascript
const PostTimesheetSignSchema = z.object({
  body: z.object({
    month: z.number().int('month must be an integer').min(1).max(12),
    year: z.number().int('year must be an integer').min(2020).max(2100),
  }),
});
```

Aggiungere `PostTimesheetSignSchema,` all'export in fondo al file.

- [ ] **Step 2: Test rosso**

```javascript
// backend/src/__tests__/timesheet-sign.test.js
'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../db/pool', () => ({ pool: { query: jest.fn() } }));
jest.mock('../db/redis', () => ({ deleteCacheByPattern: jest.fn(), redisClient: { get: jest.fn(), set: jest.fn() } }));
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

const EMPLOYEE_ID = '11111111-1111-1111-1111-111111111111';
const CLIENT_ID = '22222222-2222-2222-2222-222222222222';

describe('POST /api/v1/timesheet/sign', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rifiuta la firma del mese corrente con 400 CANNOT_SIGN_CURRENT_MONTH (fix #2)', async () => {
    const token = makeToken({ user_id: EMPLOYEE_ID, employee_id: EMPLOYEE_ID, client_id: CLIENT_ID, role: 'employee' });
    const now = new Date();

    const res = await request(app)
      .post('/api/v1/timesheet/sign')
      .set('Authorization', `Bearer ${token}`)
      .send({ month: now.getUTCMonth() + 1, year: now.getUTCFullYear() });

    expect(res.status).toBe(400);
    expect(res.body.error?.code || res.body.error).toBe('CANNOT_SIGN_CURRENT_MONTH');
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('firma un mese passato: calcola lo snapshot e fa upsert (fix #1, idempotente)', async () => {
    const token = makeToken({ user_id: EMPLOYEE_ID, employee_id: EMPLOYEE_ID, client_id: CLIENT_ID, role: 'employee' });

    pool.query
      .mockResolvedValueOnce({ rows: [] }) // check-ins del mese (vuoto per semplicità: snapshot a 0)
      .mockResolvedValueOnce({ rows: [{ meal_voucher_hours: 6 }] }) // meal voucher config
      .mockResolvedValueOnce({ rows: [{ id: 'sig-1', status: 'signed', signed_at: '2026-08-10T10:00:00Z' }] }) // upsert
      .mockResolvedValueOnce({ rows: [] }); // audit log insert (best-effort)

    const res = await request(app)
      .post('/api/v1/timesheet/sign')
      .set('Authorization', `Bearer ${token}`)
      .send({ month: 6, year: 2026 });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('signed');

    const upsertCall = pool.query.mock.calls[2];
    expect(upsertCall[0]).toMatch(/ON CONFLICT \(employee_id, month, year\)/i);
  });
});
```

- [ ] **Step 3: Eseguire e verificare che fallisca**

Run: `cd backend && npx jest timesheet-sign`
Expected: FAIL — router non ancora montato (404).

- [ ] **Step 4: Implementare `routes/timesheet.js`**

```javascript
'use strict';

const express = require('express');
const { pool } = require('../db/pool');
const { createValidationMiddleware, PostTimesheetSignSchema } = require('../middleware/validation');
const { requireAuth } = require('../middleware/auth');
const { ForbiddenError, ValidationError } = require('../utils/errors');
const { calculateDailyHours, aggregateMonthly } = require('../utils/hours');
const { logAudit } = require('../middleware/audit');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/sign', requireAuth, createValidationMiddleware(PostTimesheetSignSchema), async (req, res, next) => {
  const { month, year } = req.validated.body;
  const { client_id, employee_id, user_id } = req.user;

  if (!employee_id) {
    return next(new ForbiddenError('Your account has no employee profile', 'NO_EMPLOYEE_PROFILE'));
  }

  // Fix #2: blocco server-side, non solo lato UI — un client malevolo/bugato
  // non deve poter firmare un mese ancora in corso (snapshot incompleto, e i
  // check-in futuri non hanno modo di invalidare una firma sul mese corrente
  // finché il mese stesso non è "chiuso").
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  if (year > currentYear || (year === currentYear && month >= currentMonth)) {
    return next(new ValidationError('Cannot sign the current or a future month', { code: 'CANNOT_SIGN_CURRENT_MONTH' }));
  }

  try {
    const dateFrom = new Date(Date.UTC(year, month - 1, 1));
    const dateTo = new Date(Date.UTC(year, month, 1));

    const checkinsResult = await pool.query(
      `SELECT id, employee_id, timestamp, type FROM checkins
       WHERE client_id = $1::uuid AND employee_id = $2::uuid
         AND timestamp >= $3 AND timestamp < $4
       ORDER BY timestamp ASC`,
      [client_id, employee_id, dateFrom.toISOString(), dateTo.toISOString()]
    );

    const clientResult = await pool.query(
      'SELECT meal_voucher_hours FROM clients WHERE id = $1::uuid LIMIT 1',
      [client_id]
    );
    const mealVoucherHours = clientResult.rows[0]?.meal_voucher_hours ?? 5.0;

    const dailyEntries = calculateDailyHours(checkinsResult.rows);
    const monthlyAgg = aggregateMonthly(dailyEntries, Number(mealVoucherHours));
    const agg = monthlyAgg.get(employee_id) || {
      ore_totali: 0, ore_ordinarie: 0, ore_straordinarie: 0, buoni_pasto: 0, giorni_presenti: 0,
    };

    const upsertResult = await pool.query(
      `INSERT INTO timesheet_signatures
         (employee_id, client_id, month, year, status, signed_at, ore_totali, ore_ordinarie, ore_straordinarie, giorni_presenti, buoni_pasto)
       VALUES ($1, $2, $3, $4, 'signed', NOW(), $5, $6, $7, $8, $9)
       ON CONFLICT (employee_id, month, year)
       DO UPDATE SET status = 'signed', signed_at = NOW(),
         ore_totali = EXCLUDED.ore_totali, ore_ordinarie = EXCLUDED.ore_ordinarie,
         ore_straordinarie = EXCLUDED.ore_straordinarie, giorni_presenti = EXCLUDED.giorni_presenti,
         buoni_pasto = EXCLUDED.buoni_pasto
       RETURNING id, status, signed_at`,
      [employee_id, client_id, month, year, agg.ore_totali, agg.ore_ordinarie, agg.ore_straordinarie, agg.giorni_presenti, agg.buoni_pasto]
    );

    const signature = upsertResult.rows[0];

    await logAudit(pool, {
      action: 'timesheet_signed',
      entity: 'timesheet_signature',
      entityId: signature.id,
      clientId: client_id,
      oldValue: null,
      newValue: { employee_id, month, year, ...agg },
      userId: user_id,
    }).catch((err) => logger.warn({ action: 'audit_log_failed', error: err.message }));

    res.status(201).json({ success: true, data: signature });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

- [ ] **Step 5: Montare il router in `app.js`**

In `backend/src/app.js`, subito dopo `v1Router.use('/presences', presencesRouter);`:

```javascript
v1Router.use('/timesheet', timesheetRouter);
```

E aggiungere l'import in cima al file, vicino agli altri require di router (`const timesheetRouter = require('./routes/timesheet');`).

- [ ] **Step 6: Rieseguire il test**

Run: `cd backend && npx jest timesheet-sign`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/timesheet.js backend/src/middleware/validation.js backend/src/app.js backend/src/__tests__/timesheet-sign.test.js
git commit -m "feat(backend): add POST /timesheet/sign — idempotent, blocks current month"
```

---

## Task 6: Backend — colonna firma in `GET /presences/summary`

**Files:**
- Modify: `backend/src/routes/presences.js`
- Test: Modify `backend/src/__tests__/presences-summary.test.js`

- [ ] **Step 1: Test rosso**

Aggiungere al file di test esistente (leggerlo per intero prima, per riusare l'helper di mock già presente — il pattern di `pool.query.mockResolvedValueOnce` sequenziale è già stabilito in quel file):

```javascript
it('include lo stato della firma per ogni dipendente (finding firma digitale)', async () => {
  // Estendere il mock esistente di GET /summary aggiungendo, dopo le query già
  // mockate (check-ins, meal voucher config, eventuale lista dipendenti manager),
  // una query aggiuntiva che ritorna le firme del periodo, es.:
  // .mockResolvedValueOnce({ rows: [{ employee_id: EMP_ID, status: 'signed', signed_at: '2026-07-02T09:00:00Z' }] })
  // Assert: res.body.data.employees[0].signature_status === 'signed'
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd backend && npx jest presences-summary`
Expected: FAIL — `signature_status` non presente nella risposta oggi.

- [ ] **Step 3: Implementare in `presences.js`, dentro `GET /summary`**

Dopo il blocco che calcola `monthlyAgg` (subito prima di costruire l'array `employees`), aggiungere una query per le firme del periodo e una Map di lookup:

```javascript
    const signaturesResult = await pool.query(
      `SELECT employee_id, status, signed_at FROM timesheet_signatures
       WHERE client_id = $1::uuid AND month = $2 AND year = $3`,
      [client_id, month, year]
    );
    const signatureByEmployee = new Map(signaturesResult.rows.map((r) => [r.employee_id, r]));
```

Poi, nel blocco `employees.push({...})` esistente, aggiungere due campi:

```javascript
      employees.push({
        id: empId,
        name: meta.name,
        matricola: meta.matricola || null,
        giorni_presenti: agg.giorni_presenti,
        ore_totali: agg.ore_totali,
        ore_ordinarie: agg.ore_ordinarie,
        ore_straordinarie: agg.ore_straordinarie,
        buoni_pasto: agg.buoni_pasto,
        presenze_aperte: agg.presenze_aperte,
        signature_status: signatureByEmployee.get(empId)?.status || null,
        signed_at: signatureByEmployee.get(empId)?.signed_at || null,
      });
```

- [ ] **Step 4: Rieseguire il test e l'intera suite presences**

Run: `cd backend && npx jest presences-summary presences-my-summary presences-trend`
Expected: tutti verdi.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/presences.js backend/src/__tests__/presences-summary.test.js
git commit -m "feat(backend): expose signature status per employee in GET /presences/summary"
```

---

## Task 7: Backend — suite completa e verifica non-regressione

- [ ] **Step 1: Suite backend completa**

Run: `cd backend && npm test`
Expected: tutti verdi, zero regressioni rispetto al baseline pre-piano (unico fallimento tollerato: il flake noto di contesa connessioni tra worker paralleli, sempre un file diverso, sempre verde in isolamento — pattern già documentato in questo progetto).

- [ ] **Step 2: Lint**

Run: `cd backend && npm run lint`
Expected: nessun errore nuovo (solo eventuali warning preesistenti già noti).

---

## Task 8: Frontend-web — `MySummaryPage.jsx`

**Files:**
- Create: `frontend-web/src/pages/MySummaryPage.jsx`
- Modify: `frontend-web/src/App.jsx`
- Test: Create `frontend-web/src/__tests__/MySummaryPage.test.jsx`

- [ ] **Step 1: Test rosso**

```jsx
// frontend-web/src/__tests__/MySummaryPage.test.jsx
import { describe, test, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import MySummaryPage from '../pages/MySummaryPage';
import apiClient from '../services/apiClient';

vi.mock('../services/apiClient', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

describe('MySummaryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('mostra il banner "Da firmare" e il bottone quando non c\'è firma, per un mese passato', async () => {
    apiClient.get.mockResolvedValue({
      data: { data: {
        period: { month: 6, year: 2026 },
        giorni_presenti: 20, ore_totali: 160, ore_ordinarie: 160, ore_straordinarie: 0, buoni_pasto: 18,
        signature: null,
      } },
    });

    render(<Router><MySummaryPage /></Router>);
    await waitFor(() => expect(screen.getByText(/Da firmare/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Approvo il cartellino/i })).toBeEnabled();
  });

  test('click su "Approvo il cartellino" chiama POST /timesheet/sign e aggiorna il banner', async () => {
    apiClient.get.mockResolvedValue({
      data: { data: {
        period: { month: 6, year: 2026 },
        giorni_presenti: 20, ore_totali: 160, ore_ordinarie: 160, ore_straordinarie: 0, buoni_pasto: 18,
        signature: null,
      } },
    });
    apiClient.post.mockResolvedValue({ data: { data: { status: 'signed', signed_at: '2026-08-10T10:00:00Z' } } });

    render(<Router><MySummaryPage /></Router>);
    await waitFor(() => expect(screen.getByRole('button', { name: /Approvo il cartellino/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Approvo il cartellino/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/v1/timesheet/sign', { month: 6, year: 2026 }));
  });

  test('mostra "Modificato dopo la firma" quando lo stato è invalidated', async () => {
    apiClient.get.mockResolvedValue({
      data: { data: {
        period: { month: 6, year: 2026 },
        giorni_presenti: 20, ore_totali: 160, ore_ordinarie: 160, ore_straordinarie: 0, buoni_pasto: 18,
        signature: { status: 'invalidated', signed_at: '2026-07-02T09:00:00Z' },
      } },
    });

    render(<Router><MySummaryPage /></Router>);
    await waitFor(() => expect(screen.getByText(/Modificato dopo la firma/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-web && npx vitest run MySummaryPage`
Expected: FAIL — `../pages/MySummaryPage` non esiste.

- [ ] **Step 3: Implementare `MySummaryPage.jsx`**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Box, Button, Typography, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, CircularProgress,
} from '@mui/material';
import { NavBar } from '../components/NavBar';
import apiClient from '../services/apiClient';

const MONTH_NAMES = [
  'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre',
];

function formatHours(h) {
  if (h === 0) return '0h';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins === 0 ? `${hrs}h` : `${hrs}h ${mins}m`;
}

const MySummaryPage = () => {
  const navigate = useNavigate();
  const now = new Date();
  const [month] = useState(now.getMonth() === 0 ? 12 : now.getMonth());
  const [year] = useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState(null);

  const isCurrentOrFutureMonth = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/api/v1/presences/my-summary?month=${month}&year=${year}`);
      setData(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Errore nel caricamento del cartellino');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const handleSign = async () => {
    setSigning(true);
    try {
      await apiClient.post('/api/v1/timesheet/sign', { month, year });
      await fetchSummary();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Errore nella firma del cartellino');
    } finally {
      setSigning(false);
    }
  };

  const signature = data?.signature;

  return (
    <div className="min-h-screen bg-linen">
      <NavBar title="Badge System">
        <Button color="inherit" onClick={() => navigate('/dashboard')} sx={{ textTransform: 'none' }}>📋 Presenze</Button>
      </NavBar>

      <Container maxWidth="md" sx={{ py: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#1E3A5F', mb: 2 }}>
          📄 Il Mio Cartellino — {MONTH_NAMES[month - 1]} {year}
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!signature && (
          <Alert severity="info" sx={{ mb: 2 }}>Da firmare</Alert>
        )}
        {signature?.status === 'signed' && (
          <Alert severity="success" sx={{ mb: 2 }}>✅ Firmato il {new Date(signature.signed_at).toLocaleDateString('it-IT')}</Alert>
        )}
        {signature?.status === 'invalidated' && (
          <Alert severity="warning" sx={{ mb: 2 }}>⚠️ Modificato dopo la firma — richiede nuova firma</Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
        ) : data && (
          <TableContainer component={Paper} sx={{ mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Giorni','Ore Totali','Ore Ord.','Ore Straord.','Buoni Pasto'].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>{data.giorni_presenti}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{formatHours(data.ore_totali)}</TableCell>
                  <TableCell>{formatHours(data.ore_ordinarie)}</TableCell>
                  <TableCell>{formatHours(data.ore_straordinarie)}</TableCell>
                  <TableCell>{data.buoni_pasto}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {(!signature || signature.status === 'invalidated') && (
          <Button
            variant="contained"
            disabled={isCurrentOrFutureMonth || signing || !data}
            onClick={handleSign}
            sx={{ backgroundColor: '#1E3A5F' }}
          >
            {signing ? 'Invio...' : 'Approvo il cartellino'}
          </Button>
        )}
      </Container>
    </div>
  );
};

export default MySummaryPage;
```

Nota: `month`/`year` sono fissati al mese scorso (l'unico firmabile lato server) — non c'è un selettore mese in questa v1, coerente con lo scope "solo mesi passati firmabili".

- [ ] **Step 4: Aggiungere la route in `App.jsx`**

In `frontend-web/src/App.jsx`, importare `MySummaryPage` in cima e aggiungere la route subito dopo quella di `/summary`:

```javascript
          {/* Employee: Il Mio Cartellino (firma digitale) */}
          <Route
            path="/my-summary"
            element={
              <ProtectedRoute requiredRole="employee">
                <MySummaryPage />
              </ProtectedRoute>
            }
          />
```

- [ ] **Step 5: Rieseguire il test**

Run: `cd frontend-web && npx vitest run MySummaryPage`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/MySummaryPage.jsx frontend-web/src/App.jsx frontend-web/src/__tests__/MySummaryPage.test.jsx
git commit -m "feat(web): add employee-facing MySummaryPage with digital signature"
```

---

## Task 9: Frontend-web — colonna "Firmato" in `SummaryPage.jsx`

**Files:**
- Modify: `frontend-web/src/pages/SummaryPage.jsx`
- Modify: `frontend-web/src/__tests__/SummaryPage.test.jsx`

- [ ] **Step 1: Test rosso**

Aggiungere al file di test esistente (stesso mock `apiClient.get` già presente in `beforeEach`, aggiungendo `signature_status`/`signed_at` all'oggetto employee):

```javascript
test('mostra la colonna "Firmato" con lo stato corretto', async () => {
  apiClient.get.mockResolvedValue({
    data: { data: {
      employees: [
        { id: 'e1', name: 'Mario Rossi', matricola: 'M001', giorni_presenti: 20, ore_totali: 160, ore_ordinarie: 160, ore_straordinarie: 0, buoni_pasto: 20, presenze_aperte: 0, signature_status: 'signed', signed_at: '2026-07-02T09:00:00Z' },
      ],
      totals: { giorni_presenti: 20, ore_totali: 160, ore_ordinarie: 160, ore_straordinarie: 0, buoni_pasto: 20 },
      meal_voucher_threshold_hours: 6,
    } },
  });

  render(<Router><SummaryPage /></Router>);
  await waitFor(() => expect(screen.getByText('Mario Rossi')).toBeInTheDocument());
  expect(screen.getByText(/02\/07/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-web && npx vitest run SummaryPage`
Expected: FAIL — nessuna colonna "Firmato" oggi.

- [ ] **Step 3: Implementare**

In `SummaryPage.jsx`, aggiungere `'Firmato'` all'array degli header (riga con `['Nome','Matricola',...]`), e una nuova `<TableCell>` nel `.map(emp => ...)` corrispondente, subito dopo la cella "⚠️ Aperte":

```jsx
                        <TableCell>
                          {emp.signature_status === 'signed' ? (
                            <Chip label={`✅ ${new Date(emp.signed_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}`} size="small" sx={{ backgroundColor: '#EEF6F1', color: '#2D7049' }} />
                          ) : emp.signature_status === 'invalidated' ? (
                            <Chip label="⚠️ Da rifirmare" size="small" color="warning" />
                          ) : (
                            <span style={{ color: '#6B625A' }}>—</span>
                          )}
                        </TableCell>
```

Aggiornare anche `colSpan={8}` → `colSpan={9}` nella riga "Nessun dipendente trovato" e `colSpan={2}` della riga Totale resta invariato (la nuova colonna non serve nei totali, lasciare una `<TableCell />` vuota in coda alla riga totali).

- [ ] **Step 4: Rieseguire il test e l'intera suite SummaryPage**

Run: `cd frontend-web && npx vitest run SummaryPage`
Expected: tutti verdi.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/SummaryPage.jsx frontend-web/src/__tests__/SummaryPage.test.jsx
git commit -m "feat(web): show signature status column in SummaryPage"
```

---

## Task 10: Gate finale — suite completa, lint, push, verifica deploy

- [ ] **Step 1: Suite completa dei 2 progetti coinvolti**

Run: `cd backend && npm test`
Run: `cd frontend-web && npm test`
Expected: tutti verdi, zero regressioni rispetto al baseline pre-piano.

- [ ] **Step 2: Lint**

Run: `cd backend && npm run lint`
Run: `cd frontend-web && npm run lint` (se presente/configurato)
Expected: nessun errore nuovo.

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Verifica CI/CD in cascata**

Verificare (`gh run list --limit 5`) che `Build & Push Backend to ECR` e, a cascata, `Deploy to EC2` completino con successo — stesso meccanismo già osservato in Fase C.

---

## Note per l'implementer

- Task 3 richiede di leggere per intero `checkins.js` prima di applicare il diff — i numeri di riga citati in questo piano riflettono lo stato del file al 10 Agosto 2026, potrebbero essere leggermente cambiati.
- L'helper esatto di generazione JWT nei test (`makeToken`) e i mock di `rateLimiter`/`redis` sono ricalcati 1:1 da `presences-summary.test.js` — se quel file è cambiato, verificare il pattern reale prima di scrivere i nuovi test, non fidarsi ciecamente di questo piano.
- Nessun task di questo piano tocca `frontend-mobile` — la feature è deliberatamente solo-web (decisione presa in fase di brainstorming).
- Il vincolo `UNIQUE (employee_id, month, year)` in Task 1 è ciò che rende sicuro l'upsert del Task 5 — non rimuoverlo né modificarlo senza aggiornare anche la query `ON CONFLICT`.
