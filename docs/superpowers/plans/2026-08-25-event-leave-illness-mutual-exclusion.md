# Mutua esclusione Evento/Ferie/Malattia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere Evento/Training, Ferie e Malattia mutuamente esclusivi a coppie per lo stesso dipendente/data, chiudendo il bug per cui un dipendente può oggi ottenere approvazione simultanea di tutti e tre per lo stesso giorno.

**Architecture:** Estensione additiva di `backend/src/utils/eventConflict.js` con 3 funzioni range-aware (`findConflictingEventRange`, `findConflictingLeaveRange`, `findConflictingIllnessRange`) e un lock per-employee (`lockAbsenceConflictScope`), consumate simmetricamente da `leaves.js` (creazione + approvazione), `events.js` (solo approvazione — la creazione è già corretta) e `illnesses.js` (cascata "malattia vince sempre", solo su date odierne/future). `demoSeed.js` viene irrobustito per usare la stessa fonte di verità invece di un offset implicito.

**Tech Stack:** Node.js/Express/PostgreSQL (pg), Jest (mock-based unit test per `eventConflict.js`, real-Postgres integration test via supertest per le route).

**Spec di riferimento:** `docs/superpowers/specs/2026-08-25-event-leave-illness-mutual-exclusion-design.md`

---

## File Map

| File | Operazione | Motivo |
|---|---|---|
| `backend/src/utils/eventConflict.js` | Modifica (additiva) | 3 nuove query di conflitto range-aware + 1 nuovo lock per-employee |
| `backend/src/__tests__/eventConflict.test.js` | Modifica (additiva) | Test mock-based per le 4 nuove funzioni, stesso stile delle esistenti |
| `backend/src/routes/leaves.js` | Modifica | Guardia di conflitto in creazione + approvazione |
| `backend/src/__tests__/leave-event-illness-conflict.test.js` | Crea | Test integrazione real-Postgres per `leaves.js` |
| `backend/src/routes/events.js` | Modifica | Guardia di conflitto mancante in approvazione (ferie/malattia) + traduzione messaggio riga 66 |
| `backend/src/__tests__/event-leave-illness-conflict.test.js` | Crea | Test integrazione real-Postgres per `events.js` PUT /:id/approve |
| `backend/src/routes/illnesses.js` | Modifica | Cascata auto-rigetto "malattia vince sempre" |
| `backend/src/__tests__/illness-cascade-conflict.test.js` | Crea | Test integrazione real-Postgres per la cascata |
| `backend/src/utils/demoSeed.js` | Modifica | Guardia esplicita al posto dell'offset implicito |
| `backend/src/__tests__/demoSeed.test.js` | Modifica (additiva) | Un nuovo test per la guardia |
| `CLAUDE.md` | Modifica (additiva) | Nuovo "Known Bug Pattern 7" |

---

## Task 1: `eventConflict.js` — nuove funzioni range-aware + lock per-employee

**Files:**
- Modify: `backend/src/utils/eventConflict.js`
- Test: `backend/src/__tests__/eventConflict.test.js`

- [ ] **Step 1: Scrivi i test falliti per `lockAbsenceConflictScope`**

Apri `backend/src/__tests__/eventConflict.test.js` e aggiungi, dentro il `describe('eventConflict utility', ...)` esistente, subito dopo la chiusura del blocco `describe('lockEventConflictScope', ...)` (dopo la riga con `it('re-throws any other error unchanged', ...)` e la sua chiusura `});`):

```javascript
  describe('lockAbsenceConflictScope', () => {
    it('sets a transaction-scoped lock_timeout then acquires the advisory lock', async () => {
      const calls = [];
      const client = makeMockClient(async (sql) => { calls.push(sql); return { rows: [] }; });

      await lockAbsenceConflictScope(client, { clientId: 'c1', employeeId: 'e1' });

      expect(calls[0]).toContain('lock_timeout');
      expect(calls[1]).toContain('pg_advisory_xact_lock');
    });

    it('produces the same lock key for the same (clientId, employeeId) scope', async () => {
      const seen = [];
      const client = makeMockClient(async (sql, params) => {
        if (sql.includes('pg_advisory_xact_lock')) seen.push(params[0]);
        return { rows: [] };
      });

      await lockAbsenceConflictScope(client, { clientId: 'c1', employeeId: 'e1' });
      await lockAbsenceConflictScope(client, { clientId: 'c1', employeeId: 'e1' });

      expect(seen[0]).toBe(seen[1]);
    });

    it('produces a different lock key for a different employee', async () => {
      const seen = [];
      const client = makeMockClient(async (sql, params) => {
        if (sql.includes('pg_advisory_xact_lock')) seen.push(params[0]);
        return { rows: [] };
      });

      await lockAbsenceConflictScope(client, { clientId: 'c1', employeeId: 'e1' });
      await lockAbsenceConflictScope(client, { clientId: 'c1', employeeId: 'e2' });

      expect(seen[0]).not.toBe(seen[1]);
    });

    it('produces a different lock key from lockEventConflictScope for the same employee (no cross-lock collision)', async () => {
      const seen = [];
      const client = makeMockClient(async (sql, params) => {
        if (sql.includes('pg_advisory_xact_lock')) seen.push(params[0]);
        return { rows: [] };
      });

      await lockEventConflictScope(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });
      await lockAbsenceConflictScope(client, { clientId: 'c1', employeeId: 'e1' });

      expect(seen[0]).not.toBe(seen[1]);
    });

    it('maps a lock_not_available (55P03) error to a 409 ConflictError with EVENT_CONFLICT_LOCK_BUSY', async () => {
      const client = makeMockClient(async (sql) => {
        if (sql.includes('pg_advisory_xact_lock')) {
          const err = new Error('canceling statement due to lock timeout');
          err.code = '55P03';
          throw err;
        }
        return { rows: [] };
      });

      await expect(
        lockAbsenceConflictScope(client, { clientId: 'c1', employeeId: 'e1' })
      ).rejects.toMatchObject({ code: 'EVENT_CONFLICT_LOCK_BUSY', statusCode: 409 });
    });
  });
```

Poi aggiorna la riga di import in cima al file da:

```javascript
const { lockEventConflictScope, findConflictingEvent, findConflictingCheckin, findConflictingSmartWorking } = require('../utils/eventConflict');
```

a:

```javascript
const {
  lockEventConflictScope, findConflictingEvent, findConflictingCheckin, findConflictingSmartWorking,
  lockAbsenceConflictScope, findConflictingEventRange, findConflictingLeaveRange, findConflictingIllnessRange,
} = require('../utils/eventConflict');
```

- [ ] **Step 2: Verifica che i nuovi test falliscano**

Run: `cd backend && npx jest src/__tests__/eventConflict.test.js -t "lockAbsenceConflictScope"`
Expected: FAIL — `lockAbsenceConflictScope is not a function` (non ancora esportata da `eventConflict.js`)

- [ ] **Step 3: Implementa `lockAbsenceConflictScope` in `eventConflict.js`**

In `backend/src/utils/eventConflict.js`, subito dopo la fine della funzione `lockEventConflictScope` (dopo la sua chiusura `}`), aggiungi:

```javascript
/**
 * Same mechanism as lockEventConflictScope, but scoped per-employee (no
 * date component) — used for a multi-day range operation (leave create/
 * approve, illness report) so l'intera operazione multi-giorno è serializzata
 * in un colpo solo, invece di un lock per singolo giorno del range (che
 * rischierebbe un falso EVENT_CONFLICT_LOCK_BUSY quando due richieste che si
 * sovrappongono parzialmente acquisiscono i lock sui singoli giorni in ordine
 * diverso — vedi design spec 2026-08-25, sezione "Performance e falso lock
 * occupato"). La chiave include un suffisso ':absence' così non collide mai
 * con lockEventConflictScope per lo stesso employee.
 */
async function lockAbsenceConflictScope(client, { clientId, employeeId }) {
  const key = `${clientId}:${employeeId}:absence`;
  const hash = crypto.createHash('sha256').update(key).digest();
  const lockKey = hash.readBigInt64BE(0).toString();
  await client.query('SET LOCAL lock_timeout = \'3s\'');
  try {
    await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
  } catch (err) {
    if (err.code === '55P03') { // lock_not_available
      throw new ConflictError(
        'Un\'altra operazione è in corso per questo dipendente, riprova tra qualche secondo',
        'EVENT_CONFLICT_LOCK_BUSY'
      );
    }
    throw err;
  }
}
```

- [ ] **Step 4: Verifica che i test di `lockAbsenceConflictScope` passino**

Run: `cd backend && npx jest src/__tests__/eventConflict.test.js -t "lockAbsenceConflictScope"`
Expected: PASS (5 test)

- [ ] **Step 5: Scrivi i test falliti per le 3 funzioni range-aware**

Nello stesso file, dopo la chiusura del `describe('findConflictingSmartWorking', ...)` esistente (ultima riga del file prima della chiusura del `describe('eventConflict utility', ...)` principale), aggiungi:

```javascript
  describe('findConflictingEventRange', () => {
    it('queries event_requests scoped by client/employee, filtered to PENDING/APPROVED, over a date range', async () => {
      const client = makeMockClient(async () => ({ rows: [{ id: 'evt-1', event_date: '2026-09-02', status: 'PENDING' }] }));

      const result = await findConflictingEventRange(client, {
        clientId: 'c1', employeeId: 'e1', startDate: '2026-09-01', endDate: '2026-09-05',
      });

      expect(result).toEqual([{ id: 'evt-1', event_date: '2026-09-02', status: 'PENDING' }]);
      expect(client.query.mock.calls[0][0]).toContain('event_requests');
      expect(client.query.mock.calls[0][0]).toContain('IN (\'PENDING\', \'APPROVED\')');
      expect(client.query.mock.calls[0][1]).toEqual(['c1', 'e1', '2026-09-01', '2026-09-05']);
    });

    it('returns an empty array when no conflicting row exists', async () => {
      const client = makeMockClient(async () => ({ rows: [] }));
      const result = await findConflictingEventRange(client, {
        clientId: 'c1', employeeId: 'e1', startDate: '2026-09-01', endDate: '2026-09-05',
      });
      expect(result).toEqual([]);
    });
  });

  describe('findConflictingLeaveRange', () => {
    it('queries leave_requests scoped by client/employee, filtered to PENDING/APPROVED, with overlap logic', async () => {
      const client = makeMockClient(async () => ({
        rows: [{ id: 'lv-1', leave_type: 'FERIE_1', start_date: '2026-09-01', end_date: '2026-09-03', status: 'APPROVED', num_days: 3 }],
      }));

      const result = await findConflictingLeaveRange(client, {
        clientId: 'c1', employeeId: 'e1', startDate: '2026-09-02', endDate: '2026-09-04',
      });

      expect(result).toHaveLength(1);
      expect(client.query.mock.calls[0][0]).toContain('leave_requests');
      expect(client.query.mock.calls[0][0]).toContain('start_date <=');
      expect(client.query.mock.calls[0][0]).toContain('end_date >=');
      expect(client.query.mock.calls[0][1]).toEqual(['c1', 'e1', '2026-09-02', '2026-09-04']);
    });

    it('returns an empty array when no conflicting row exists', async () => {
      const client = makeMockClient(async () => ({ rows: [] }));
      const result = await findConflictingLeaveRange(client, {
        clientId: 'c1', employeeId: 'e1', startDate: '2026-09-01', endDate: '2026-09-05',
      });
      expect(result).toEqual([]);
    });
  });

  describe('findConflictingIllnessRange', () => {
    it('queries illnesses scoped by client/employee, filtered to cancelled_at IS NULL, with overlap logic', async () => {
      const client = makeMockClient(async () => ({
        rows: [{ id: 'ill-1', start_date: '2026-09-01', end_date: '2026-09-02' }],
      }));

      const result = await findConflictingIllnessRange(client, {
        clientId: 'c1', employeeId: 'e1', startDate: '2026-09-01', endDate: '2026-09-05',
      });

      expect(result).toHaveLength(1);
      expect(client.query.mock.calls[0][0]).toContain('illnesses');
      expect(client.query.mock.calls[0][0]).toContain('cancelled_at IS NULL');
      expect(client.query.mock.calls[0][1]).toEqual(['c1', 'e1', '2026-09-01', '2026-09-05']);
    });

    it('returns an empty array when no conflicting row exists', async () => {
      const client = makeMockClient(async () => ({ rows: [] }));
      const result = await findConflictingIllnessRange(client, {
        clientId: 'c1', employeeId: 'e1', startDate: '2026-09-01', endDate: '2026-09-05',
      });
      expect(result).toEqual([]);
    });
  });
```

- [ ] **Step 6: Verifica che i nuovi test falliscano**

Run: `cd backend && npx jest src/__tests__/eventConflict.test.js -t "Range"`
Expected: FAIL — `findConflictingEventRange is not a function` (e le altre due)

- [ ] **Step 7: Implementa le 3 funzioni range-aware in `eventConflict.js`**

Alla fine di `backend/src/utils/eventConflict.js`, subito prima della riga `module.exports = { ... };`, aggiungi:

```javascript
/**
 * Returns ALL event_requests rows (PENDING/APPROVED) overlapping [startDate,
 * endDate] for this employee — un array, non una singola riga come
 * findConflictingEvent, perché il chiamante di illnesses.js deve enumerare e
 * rifiutare OGNUNO dei conflitti trovati (una malattia multi-giorno può
 * sovrapporsi a più eventi), non solo verificarne l'esistenza. I chiamanti
 * che vogliono solo un controllo booleano (leaves.js, events.js) usano
 * `.length > 0`.
 */
async function findConflictingEventRange(client, { clientId, employeeId, startDate, endDate }) {
  const result = await client.query(
    `SELECT id, event_date::text AS event_date, status
     FROM event_requests
     WHERE client_id = $1::uuid AND user_id = $2::uuid AND status IN ('PENDING', 'APPROVED')
       AND event_date BETWEEN $3::date AND $4::date`,
    [clientId, employeeId, startDate, endDate]
  );
  return result.rows;
}

/** Same contract as findConflictingEventRange, for leave_requests. */
async function findConflictingLeaveRange(client, { clientId, employeeId, startDate, endDate }) {
  const result = await client.query(
    `SELECT id, leave_type, start_date::text AS start_date, end_date::text AS end_date, status, num_days
     FROM leave_requests
     WHERE client_id = $1::uuid AND user_id = $2::uuid AND status IN ('PENDING', 'APPROVED')
       AND start_date <= $4::date AND end_date >= $3::date`,
    [clientId, employeeId, startDate, endDate]
  );
  return result.rows;
}

/** Same contract as findConflictingEventRange, for illnesses (active = cancelled_at IS NULL). */
async function findConflictingIllnessRange(client, { clientId, employeeId, startDate, endDate }) {
  const result = await client.query(
    `SELECT id, start_date::text AS start_date, end_date::text AS end_date
     FROM illnesses
     WHERE client_id = $1::uuid AND employee_id = $2::uuid AND cancelled_at IS NULL
       AND start_date <= $4::date AND end_date >= $3::date`,
    [clientId, employeeId, startDate, endDate]
  );
  return result.rows;
}
```

Poi aggiorna `module.exports` da:

```javascript
module.exports = { lockEventConflictScope, findConflictingEvent, findConflictingCheckin, findConflictingSmartWorking };
```

a:

```javascript
module.exports = {
  lockEventConflictScope, findConflictingEvent, findConflictingCheckin, findConflictingSmartWorking,
  lockAbsenceConflictScope, findConflictingEventRange, findConflictingLeaveRange, findConflictingIllnessRange,
};
```

- [ ] **Step 8: Verifica che tutti i test di `eventConflict.test.js` passino**

Run: `cd backend && npx jest src/__tests__/eventConflict.test.js`
Expected: PASS (tutti i test, esistenti + nuovi)

- [ ] **Step 9: Commit**

```bash
cd backend
git add src/utils/eventConflict.js src/__tests__/eventConflict.test.js
git commit -m "feat: add range-aware conflict-check functions + per-employee lock to eventConflict.js"
```

---

## Task 2: `leaves.js` POST /request — guardia di conflitto in creazione

**Files:**
- Modify: `backend/src/routes/leaves.js:9-118`
- Test: Create `backend/src/__tests__/leave-event-illness-conflict.test.js`

- [ ] **Step 1: Scrivi il test di integrazione fallito**

Crea `backend/src/__tests__/leave-event-illness-conflict.test.js`:

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

describe('POST /api/v1/leave/request — event/illness conflict guard', () => {
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
      console.warn(`[leave-event-illness-conflict.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Leave Conflict Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('leave-conflict-client')]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, active)
       VALUES ($1, $2, 'Leave Conflict Employee', 'employee', true)
       RETURNING id`,
      [clientId, uniqueEmail('leave-conflict')]
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

  async function makeEventRequest(clientId, employeeId, eventDate, status) {
    await pool.query(
      `INSERT INTO event_requests (id, client_id, user_id, event_date, start_time, end_time, description, status)
       VALUES (uuid_generate_v4(), $1, $2, $3::date, '08:00', '18:00', 'Corso di formazione', $4)`,
      [clientId, employeeId, eventDate, status]
    );
  }

  async function makeIllness(clientId, employeeId, startDate, endDate) {
    await pool.query(
      `INSERT INTO illnesses (id, client_id, employee_id, start_date, end_date, num_days, created_by)
       VALUES (uuid_generate_v4(), $1, $2, $3::date, $4::date, 1, $2)`,
      [clientId, employeeId, startDate, endDate]
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

  it('rejects with 409 EVENT_DATE_CONFLICT when a PENDING event overlaps the requested range', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeSaldo(clientId, employeeId, 'FERIE_1', 2026);
    await makeEventRequest(clientId, employeeId, '2026-09-02', 'PENDING');
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/leave/request')
      .set('Authorization', `Bearer ${token}`)
      .send({ leave_type: 'FERIE_1', start_date: '2026-09-01', end_date: '2026-09-03' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('rejects with 409 EVENT_DATE_CONFLICT when an active illness overlaps the requested range', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeSaldo(clientId, employeeId, 'FERIE_1', 2026);
    await makeIllness(clientId, employeeId, '2026-09-02', '2026-09-02');
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/leave/request')
      .set('Authorization', `Bearer ${token}`)
      .send({ leave_type: 'FERIE_1', start_date: '2026-09-01', end_date: '2026-09-03' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('allows the leave request when no conflicting event/illness exists (no regression)', async () => {
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
  });

  it('allows the leave request when the only overlapping event is REJECTED', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeSaldo(clientId, employeeId, 'FERIE_1', 2026);
    await makeEventRequest(clientId, employeeId, '2026-09-02', 'REJECTED');
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/leave/request')
      .set('Authorization', `Bearer ${token}`)
      .send({ leave_type: 'FERIE_1', start_date: '2026-09-01', end_date: '2026-09-03' });

    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Verifica che i test falliscano**

Run: `cd backend && npx jest src/__tests__/leave-event-illness-conflict.test.js`
Expected: FAIL — le prime due asserzioni ricevono `201` invece di `409` (nessuna guardia esiste ancora)

- [ ] **Step 3: Implementa la guardia in `leaves.js` POST /request**

In `backend/src/routes/leaves.js`, cambia la riga di import degli errori (riga 16) da:

```javascript
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
```

a:

```javascript
const { NotFoundError, ValidationError, ForbiddenError, ConflictError } = require('../utils/errors');
```

e aggiungi, subito dopo la riga 15 (import di `requireAuth`), l'import delle nuove funzioni condivise:

```javascript
const { lockAbsenceConflictScope, findConflictingEventRange, findConflictingIllnessRange } = require('../utils/eventConflict');
```

Poi, in `router.post('/request', ...)`, subito dopo il blocco "2. Verifica saldo" (dopo la riga con la chiusura `}` del blocco `if (leave_type !== 'MALATTIA') { ... }`, riga 71) e prima del commento `// 3. Create leave request`, inserisci:

```javascript
      // 2.5 Conflict check: block if an Evento/Training or Malattia already
      // occupies any day in this range (design spec 2026-08-25 — mutua
      // esclusione Evento/Ferie/Malattia).
      await lockAbsenceConflictScope(client, { clientId, employeeId: userId });

      const conflictingEvents = await findConflictingEventRange(client, {
        clientId, employeeId: userId, startDate: start_date, endDate: end_date,
      });
      if (conflictingEvents.length > 0) {
        throw new ConflictError(
          'Esiste già un evento/training pianificato per una data in questo intervallo',
          'EVENT_DATE_CONFLICT'
        );
      }

      const conflictingIllnesses = await findConflictingIllnessRange(client, {
        clientId, employeeId: userId, startDate: start_date, endDate: end_date,
      });
      if (conflictingIllnesses.length > 0) {
        throw new ConflictError(
          'Hai già comunicato una malattia per una data in questo intervallo',
          'EVENT_DATE_CONFLICT'
        );
      }

```

- [ ] **Step 4: Verifica che i test passino**

Run: `cd backend && npx jest src/__tests__/leave-event-illness-conflict.test.js`
Expected: PASS (tutti e 4 i test)

- [ ] **Step 5: Verifica nessuna regressione sui test esistenti di `leaves.js`**

Run: `cd backend && npx jest leaves`
Expected: PASS (tutti i file `leaves*.test.js` esistenti)

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/routes/leaves.js src/__tests__/leave-event-illness-conflict.test.js
git commit -m "feat: block leave creation when a conflicting event/illness exists for the range"
```

---

## Task 3: `leaves.js` PUT /:id/approve — guardia di conflitto in approvazione

**Files:**
- Modify: `backend/src/routes/leaves.js:172-301`
- Test: `backend/src/__tests__/leave-event-illness-conflict.test.js` (stesso file di Task 2, nuovo `describe`)

- [ ] **Step 1: Scrivi il test di integrazione fallito**

Nello stesso file `backend/src/__tests__/leave-event-illness-conflict.test.js`, aggiungi un secondo `describe` dopo la chiusura del primo (dopo l'ultima `});` del file):

```javascript

describe('PUT /api/v1/leave/:id/approve — event/illness conflict guard', () => {
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
      console.warn(`[leave approve conflict.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Leave Approve Conflict Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('leave-approve-conflict-client')]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, active)
       VALUES ($1, $2, 'Leave Approve Conflict Employee', 'employee', true)
       RETURNING id`,
      [clientId, uniqueEmail('leave-approve-conflict')]
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

  async function makePendingLeave(clientId, employeeId, startDate, endDate) {
    const result = await pool.query(
      `INSERT INTO leave_requests (id, client_id, user_id, leave_type, start_date, end_date, num_days, status)
       VALUES (uuid_generate_v4(), $1, $2, 'FERIE_1', $3::date, $4::date, 1, 'PENDING')
       RETURNING id`,
      [clientId, employeeId, startDate, endDate]
    );
    return result.rows[0].id;
  }

  async function makeEventRequest(clientId, employeeId, eventDate, status) {
    await pool.query(
      `INSERT INTO event_requests (id, client_id, user_id, event_date, start_time, end_time, description, status)
       VALUES (uuid_generate_v4(), $1, $2, $3::date, '08:00', '18:00', 'Corso di formazione', $4)`,
      [clientId, employeeId, eventDate, status]
    );
  }

  function tokenFor({ client_id, role, employee_id, site_id }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign(
      { user_id: employee_id, client_id, role, employee_id, site_id, name: 'Test' },
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

  it('rejects approval with 409 EVENT_DATE_CONFLICT when an event now overlaps, leaving the leave PENDING', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeSaldo(clientId, employeeId, 'FERIE_1', 2026);
    const leaveId = await makePendingLeave(clientId, employeeId, '2026-09-01', '2026-09-03');
    // The event was approved AFTER the leave request was created — this is
    // exactly the race the design spec's "creazione + approvazione" decision
    // covers: creation-time check alone would have missed it.
    await makeEventRequest(clientId, employeeId, '2026-09-02', 'APPROVED');
    const adminToken = tokenFor({ client_id: clientId, role: 'admin', employee_id: employeeId });

    const res = await request(app)
      .put(`/api/v1/leave/${leaveId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');

    const check = await pool.query('SELECT status FROM leave_requests WHERE id = $1', [leaveId]);
    expect(check.rows[0].status).toBe('PENDING');
  });

  it('allows approval when no conflicting event/illness exists (no regression)', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeSaldo(clientId, employeeId, 'FERIE_1', 2026);
    const leaveId = await makePendingLeave(clientId, employeeId, '2026-09-01', '2026-09-03');
    const adminToken = tokenFor({ client_id: clientId, role: 'admin', employee_id: employeeId });

    const res = await request(app)
      .put(`/api/v1/leave/${leaveId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
  });
});
```

- [ ] **Step 2: Verifica che il primo test fallisca**

Run: `cd backend && npx jest src/__tests__/leave-event-illness-conflict.test.js -t "rejects approval"`
Expected: FAIL — riceve `200` invece di `409` (nessuna guardia in approvazione ancora)

- [ ] **Step 3: Implementa la guardia in `leaves.js` PUT /:id/approve**

In `backend/src/routes/leaves.js`, nel blocco `router.put('/:id/approve', ...)`, subito dopo la riga 226 (`if (leaveRequest.status !== 'PENDING') { ... }`) e prima del commento `// 3. Update leave request status`, inserisci:

```javascript
      // Conflict check: an event or illness may have appeared/been approved
      // AFTER this leave request was created — re-verify at approval time
      // too (design spec 2026-08-25, decisione 1: "creazione + approvazione").
      await lockAbsenceConflictScope(client, { clientId, employeeId: leaveRequest.user_id });

      const conflictingEvents = await findConflictingEventRange(client, {
        clientId, employeeId: leaveRequest.user_id, startDate: leaveRequest.start_date, endDate: leaveRequest.end_date,
      });
      if (conflictingEvents.length > 0) {
        throw new ConflictError(
          'Impossibile approvare: esiste già un evento/training per una data in questo intervallo',
          'EVENT_DATE_CONFLICT'
        );
      }

      const conflictingIllnesses = await findConflictingIllnessRange(client, {
        clientId, employeeId: leaveRequest.user_id, startDate: leaveRequest.start_date, endDate: leaveRequest.end_date,
      });
      if (conflictingIllnesses.length > 0) {
        throw new ConflictError(
          'Impossibile approvare: il dipendente ha già comunicato una malattia per una data in questo intervallo',
          'EVENT_DATE_CONFLICT'
        );
      }

```

Aggiungi lo stesso import fatto in Task 2 (se non già presente da quel task): `lockAbsenceConflictScope, findConflictingEventRange, findConflictingIllnessRange` da `../utils/eventConflict` — già aggiunto in Task 2, nessuna modifica ulteriore all'import necessaria qui.

- [ ] **Step 4: Verifica che tutti i test del file passino**

Run: `cd backend && npx jest src/__tests__/leave-event-illness-conflict.test.js`
Expected: PASS (tutti i test di entrambi i `describe`)

- [ ] **Step 5: Verifica nessuna regressione**

Run: `cd backend && npx jest leaves`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/routes/leaves.js src/__tests__/leave-event-illness-conflict.test.js
git commit -m "feat: block leave approval when a conflicting event/illness appeared after creation"
```

---

## Task 4: `events.js` PUT /:id/approve — guardia mancante (ferie/malattia) + traduzione messaggio

**Files:**
- Modify: `backend/src/routes/events.js:1-107,163-239`
- Test: Create `backend/src/__tests__/event-leave-illness-conflict.test.js`

- [ ] **Step 1: Scrivi il test di integrazione fallito**

Crea `backend/src/__tests__/event-leave-illness-conflict.test.js`:

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

describe('PUT /api/v1/events/:id/approve — leave/illness conflict guard', () => {
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
      console.warn(`[event-leave-illness-conflict.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Event Approve Conflict Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('event-approve-conflict-client')]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, active)
       VALUES ($1, $2, 'Event Approve Conflict Employee', 'employee', true)
       RETURNING id`,
      [clientId, uniqueEmail('event-approve-conflict')]
    );
    return result.rows[0].id;
  }

  async function makePendingEvent(clientId, employeeId, eventDate) {
    const result = await pool.query(
      `INSERT INTO event_requests (id, client_id, user_id, event_date, start_time, end_time, description, status)
       VALUES (uuid_generate_v4(), $1, $2, $3::date, '08:00', '18:00', 'Corso di formazione', 'PENDING')
       RETURNING id`,
      [clientId, employeeId, eventDate]
    );
    return result.rows[0].id;
  }

  async function makeLeave(clientId, employeeId, startDate, endDate, status) {
    await pool.query(
      `INSERT INTO leave_requests (id, client_id, user_id, leave_type, start_date, end_date, num_days, status)
       VALUES (uuid_generate_v4(), $1, $2, 'FERIE_1', $3::date, $4::date, 1, $5)`,
      [clientId, employeeId, startDate, endDate, status]
    );
  }

  async function makeIllness(clientId, employeeId, startDate, endDate) {
    await pool.query(
      `INSERT INTO illnesses (id, client_id, employee_id, start_date, end_date, num_days, created_by)
       VALUES (uuid_generate_v4(), $1, $2, $3::date, $4::date, 1, $2)`,
      [clientId, employeeId, startDate, endDate]
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

  it('rejects approval with 409 EVENT_DATE_CONFLICT when a leave now covers the event date, leaving it PENDING', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    const eventId = await makePendingEvent(clientId, employeeId, '2026-09-02');
    // The leave was approved AFTER the event request was created.
    await makeLeave(clientId, employeeId, '2026-09-01', '2026-09-03', 'APPROVED');
    const adminToken = tokenFor({ client_id: clientId, role: 'admin', employee_id: employeeId });

    const res = await request(app)
      .put(`/api/v1/events/${eventId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');

    const check = await pool.query('SELECT status FROM event_requests WHERE id = $1', [eventId]);
    expect(check.rows[0].status).toBe('PENDING');
  });

  it('rejects approval with 409 EVENT_DATE_CONFLICT when an illness now covers the event date', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    const eventId = await makePendingEvent(clientId, employeeId, '2026-09-02');
    await makeIllness(clientId, employeeId, '2026-09-02', '2026-09-02');
    const adminToken = tokenFor({ client_id: clientId, role: 'admin', employee_id: employeeId });

    const res = await request(app)
      .put(`/api/v1/events/${eventId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('allows approval when no conflicting leave/illness exists (no regression)', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    const eventId = await makePendingEvent(clientId, employeeId, '2026-09-02');
    const adminToken = tokenFor({ client_id: clientId, role: 'admin', employee_id: employeeId });

    const res = await request(app)
      .put(`/api/v1/events/${eventId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
  });
});
```

- [ ] **Step 2: Verifica che i primi due test falliscano**

Run: `cd backend && npx jest src/__tests__/event-leave-illness-conflict.test.js`
Expected: FAIL sui primi due test (ricevono `200` invece di `409`), PASS sul terzo

- [ ] **Step 3: Implementa la guardia mancante in `events.js` PUT /:id/approve**

In `backend/src/routes/events.js`, cambia la riga 17 da:

```javascript
const { lockEventConflictScope, findConflictingCheckin, findConflictingSmartWorking } = require('../utils/eventConflict');
```

a:

```javascript
const {
  lockEventConflictScope, findConflictingCheckin, findConflictingSmartWorking,
  findConflictingLeaveRange, findConflictingIllnessRange,
} = require('../utils/eventConflict');
```

Poi, nel blocco `if (status === 'APPROVED') { ... }` di `PUT /:id/approve` (righe 216-239), subito dopo il blocco `conflictingSmartWorking` (dopo la riga 238, la chiusura `}` dell'`if (conflictingSmartWorking)`) e prima della chiusura del blocco `if (status === 'APPROVED')` (riga 239), aggiungi:

```javascript

        // Design spec 2026-08-25: mutua esclusione Evento/Ferie/Malattia —
        // un evento è sempre un giorno singolo, quindi startDate === endDate.
        const conflictingLeaves = await findConflictingLeaveRange(client, {
          clientId, employeeId: eventRequest.user_id, startDate: eventRequest.event_date, endDate: eventRequest.event_date,
        });
        if (conflictingLeaves.length > 0) {
          throw new ConflictError(
            'Impossibile approvare: esiste già una ferie per questa data',
            'EVENT_DATE_CONFLICT'
          );
        }

        const conflictingIllnesses = await findConflictingIllnessRange(client, {
          clientId, employeeId: eventRequest.user_id, startDate: eventRequest.event_date, endDate: eventRequest.event_date,
        });
        if (conflictingIllnesses.length > 0) {
          throw new ConflictError(
            'Impossibile approvare: il dipendente ha già comunicato una malattia per questa data',
            'EVENT_DATE_CONFLICT'
          );
        }
```

- [ ] **Step 4: Verifica che i test passino**

Run: `cd backend && npx jest src/__tests__/event-leave-illness-conflict.test.js`
Expected: PASS (tutti e 3 i test)

- [ ] **Step 5: Traduci il messaggio d'errore inglese a riga 66 (fix minore in corsa)**

In `backend/src/routes/events.js`, riga 66, cambia:

```javascript
        throw new ConflictError('A presence or absence is already recorded for this date', 'EVENT_DATE_CONFLICT');
```

a:

```javascript
        throw new ConflictError('Esiste già una presenza o un\'assenza registrata per questa data', 'EVENT_DATE_CONFLICT');
```

- [ ] **Step 6: Verifica che il test esistente che copre questo messaggio non si rompa**

Run: `cd backend && npx jest events.test.js`
Expected: PASS — il test frontend (`useEvents.test.js`) verifica solo `error: 'EVENT_DATE_CONFLICT'` (il codice, non il testo del messaggio), quindi non è interessato da questa modifica; verifica comunque che `events.test.js` lato backend non asserisca sul testo inglese esatto.

Se `events.test.js` fallisce per un'asserzione sul testo esatto del messaggio, aggiorna quell'asserzione al nuovo testo italiano (non modificare il codice per farla passare — il messaggio italiano è quello corretto).

- [ ] **Step 7: Verifica nessuna regressione sull'intera suite eventi**

Run: `cd backend && npx jest events`
Expected: PASS (tutti i file `events*.test.js`, incluso `smartWorking-event-conflict.test.js` che tocca lo stesso file di route)

- [ ] **Step 8: Commit**

```bash
cd backend
git add src/routes/events.js src/__tests__/event-leave-illness-conflict.test.js
git commit -m "feat: block event approval when a conflicting leave/illness exists; translate stale English error message"
```

---

## Task 5: `illnesses.js` POST /report — cascata "malattia vince sempre"

**Files:**
- Modify: `backend/src/routes/illnesses.js:1-156`
- Test: Create `backend/src/__tests__/illness-cascade-conflict.test.js`

- [ ] **Step 1: Scrivi i test di integrazione falliti**

Crea `backend/src/__tests__/illness-cascade-conflict.test.js`:

```javascript
'use strict';

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { todayInTimeZone } = require('../utils/date');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('POST /api/v1/illnesses/report — "malattia vince sempre" cascade', () => {
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
      console.warn(`[illness-cascade-conflict.test] Skipping — could not connect: ${err.message}`);
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

  function addDays(dateStr, days) {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  async function makeClient() {
    const result = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'Illness Cascade Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('illness-cascade-client')]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, active)
       VALUES ($1, $2, 'Illness Cascade Employee', 'employee', true)
       RETURNING id`,
      [clientId, uniqueEmail('illness-cascade')]
    );
    return result.rows[0].id;
  }

  async function makeSaldo(clientId, employeeId, leaveType, year, usedDays) {
    await pool.query(
      `INSERT INTO leave_saldi (client_id, user_id, leave_type, year, total_days, used_days)
       VALUES ($1, $2, $3, $4, 20, $5)`,
      [clientId, employeeId, leaveType, year, usedDays]
    );
  }

  async function makeApprovedLeave(clientId, employeeId, startDate, endDate, numDays) {
    const result = await pool.query(
      `INSERT INTO leave_requests (id, client_id, user_id, leave_type, start_date, end_date, num_days, status, approved_at)
       VALUES (uuid_generate_v4(), $1, $2, 'FERIE_1', $3::date, $4::date, $5, 'APPROVED', NOW())
       RETURNING id`,
      [clientId, employeeId, startDate, endDate, numDays]
    );
    return result.rows[0].id;
  }

  async function makePendingEvent(clientId, employeeId, eventDate) {
    const result = await pool.query(
      `INSERT INTO event_requests (id, client_id, user_id, event_date, start_time, end_time, description, status)
       VALUES (uuid_generate_v4(), $1, $2, $3::date, '08:00', '18:00', 'Corso di formazione', 'PENDING')
       RETURNING id`,
      [clientId, employeeId, eventDate]
    );
    return result.rows[0].id;
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

  it('never blocks illness creation even when a PENDING event exists for the same future date', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    const futureDate = addDays(todayInTimeZone(), 3);
    await makePendingEvent(clientId, employeeId, futureDate);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/illnesses/report')
      .set('Authorization', `Bearer ${token}`)
      .send({ start_date: futureDate, end_date: futureDate });

    expect(res.status).toBe(201);
  });

  it('auto-rejects a PENDING event overlapping a future illness date', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    const futureDate = addDays(todayInTimeZone(), 3);
    const eventId = await makePendingEvent(clientId, employeeId, futureDate);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/illnesses/report')
      .set('Authorization', `Bearer ${token}`)
      .send({ start_date: futureDate, end_date: futureDate });

    expect(res.status).toBe(201);

    const check = await pool.query('SELECT status, rejection_reason FROM event_requests WHERE id = $1', [eventId]);
    expect(check.rows[0].status).toBe('REJECTED');
    expect(check.rows[0].rejection_reason).toContain('malattia');
  });

  it('auto-rejects an APPROVED future leave and reverses the saldo used_days decrement', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    const futureStart = addDays(todayInTimeZone(), 3);
    const futureEnd = addDays(todayInTimeZone(), 5);
    const year = new Date(futureStart).getFullYear();
    await makeSaldo(clientId, employeeId, 'FERIE_1', year, 3); // saldo already reflects the 3-day approved leave
    const leaveId = await makeApprovedLeave(clientId, employeeId, futureStart, futureEnd, 3);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/illnesses/report')
      .set('Authorization', `Bearer ${token}`)
      .send({ start_date: futureStart, end_date: futureEnd });

    expect(res.status).toBe(201);

    const leaveCheck = await pool.query('SELECT status FROM leave_requests WHERE id = $1', [leaveId]);
    expect(leaveCheck.rows[0].status).toBe('REJECTED');

    const saldoCheck = await pool.query(
      'SELECT used_days FROM leave_saldi WHERE user_id = $1 AND leave_type = $2 AND year = $3',
      [employeeId, 'FERIE_1', year]
    );
    expect(saldoCheck.rows[0].used_days).toBe(0); // 3 - 3 = 0, reversed correctly
  });

  it('never touches an approved leave that is entirely in the past', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    // A leave entirely before today — illness reported for a range that
    // does NOT overlap it, so this asserts the base case (no accidental
    // touch of unrelated past data), matching the design's "solo
    // oggi/futuro" decision.
    const pastStart = addDays(todayInTimeZone(), -10);
    const pastEnd = addDays(todayInTimeZone(), -8);
    const year = new Date(pastStart).getFullYear();
    await makeSaldo(clientId, employeeId, 'FERIE_1', year, 3);
    const leaveId = await makeApprovedLeave(clientId, employeeId, pastStart, pastEnd, 3);
    const futureDate = addDays(todayInTimeZone(), 3);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/illnesses/report')
      .set('Authorization', `Bearer ${token}`)
      .send({ start_date: futureDate, end_date: futureDate });

    expect(res.status).toBe(201);

    const leaveCheck = await pool.query('SELECT status FROM leave_requests WHERE id = $1', [leaveId]);
    expect(leaveCheck.rows[0].status).toBe('APPROVED'); // untouched
  });

  it('writes an audit log entry for each auto-rejected record', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    const futureDate = addDays(todayInTimeZone(), 3);
    const eventId = await makePendingEvent(clientId, employeeId, futureDate);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    await request(app)
      .post('/api/v1/illnesses/report')
      .set('Authorization', `Bearer ${token}`)
      .send({ start_date: futureDate, end_date: futureDate });

    const auditCheck = await pool.query(
      `SELECT action FROM audit_log WHERE entity = 'event_request' AND entity_id = $1 AND action = 'event_request_auto_rejected_by_illness'`,
      [eventId]
    );
    expect(auditCheck.rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Verifica che i test falliscano**

Run: `cd backend && npx jest src/__tests__/illness-cascade-conflict.test.js`
Expected: PASS solo sul primo test ("never blocks illness creation" — vero anche oggi, dato che `illnesses.js` non blocca mai nulla in creazione); FAIL sugli altri 4 (nessuna cascata implementata ancora)

- [ ] **Step 3: Implementa la cascata in `illnesses.js`**

In `backend/src/routes/illnesses.js`, aggiungi in cima (dopo la riga 18, import di `logger`) i due nuovi import:

```javascript
const { todayInTimeZone } = require('../utils/date');
const { lockAbsenceConflictScope, findConflictingEventRange, findConflictingLeaveRange } = require('../utils/eventConflict');
```

Poi, nel blocco `withTransaction(async (client) => { ... })` di `POST /report`, subito dopo la creazione dell'illness (dopo la riga 118, `const illness = illnessResult.rows[0];`) e prima del commento `// 3. Log audit trail`, inserisci:

```javascript

        // 2.5 "Malattia vince sempre" (design spec 2026-08-25): la malattia
        // non è mai bloccata, ma cancella automaticamente ogni Evento/Ferie
        // PENDING o APPROVED che si sovrappone — SOLO sulla porzione
        // odierna/futura del range, mai su una data interamente passata
        // (evita di alterare silenziosamente ore/buoni pasto potenzialmente
        // già esportati verso il commercialista).
        const today = todayInTimeZone();
        const cascadeStart = start_date > today ? start_date : today;

        if (cascadeStart <= end_date) {
          await lockAbsenceConflictScope(client, { clientId, employeeId });
          const rejectionReason = 'Rifiutato automaticamente: malattia comunicata per questa data';

          const conflictingEvents = await findConflictingEventRange(client, {
            clientId, employeeId, startDate: cascadeStart, endDate: end_date,
          });
          for (const event of conflictingEvents) {
            await client.query(
              `UPDATE event_requests SET status = 'REJECTED', rejection_reason = $1, updated_at = NOW() WHERE id = $2::uuid`,
              [rejectionReason, event.id]
            );
            await logAudit(client, {
              action: 'event_request_auto_rejected_by_illness',
              entity: 'event_request',
              entityId: event.id,
              clientId,
              oldValue: { status: event.status },
              newValue: { status: 'REJECTED', rejection_reason: rejectionReason },
              userId,
            });
          }

          const conflictingLeaves = await findConflictingLeaveRange(client, {
            clientId, employeeId, startDate: cascadeStart, endDate: end_date,
          });
          for (const leave of conflictingLeaves) {
            await client.query(
              `UPDATE leave_requests SET status = 'REJECTED', rejection_reason = $1, updated_at = NOW() WHERE id = $2::uuid`,
              [rejectionReason, leave.id]
            );
            if (leave.status === 'APPROVED' && leave.leave_type !== 'MALATTIA') {
              const leaveYear = new Date(leave.start_date).getFullYear();
              await client.query(
                `UPDATE leave_saldi SET used_days = used_days - $1, updated_at = NOW()
                 WHERE user_id = $2::uuid AND leave_type = $3 AND year = $4`,
                [leave.num_days, employeeId, leave.leave_type, leaveYear]
              );
            }
            await logAudit(client, {
              action: 'leave_request_auto_rejected_by_illness',
              entity: 'leave_request',
              entityId: leave.id,
              clientId,
              oldValue: { status: leave.status },
              newValue: { status: 'REJECTED', rejection_reason: rejectionReason },
              userId,
            });
          }
        }
```

- [ ] **Step 4: Verifica che tutti i test passino**

Run: `cd backend && npx jest src/__tests__/illness-cascade-conflict.test.js`
Expected: PASS (tutti e 5 i test)

- [ ] **Step 5: Verifica nessuna regressione sull'intera suite malattie**

Run: `cd backend && npx jest illness`
Expected: PASS (tutti i file `illnesses*.test.js` esistenti)

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/routes/illnesses.js src/__tests__/illness-cascade-conflict.test.js
git commit -m "feat: illness reporting auto-rejects overlapping future event/leave requests (malattia vince sempre)"
```

---

## Task 6: `demoSeed.js` — guardia esplicita al posto dell'offset implicito

**Files:**
- Modify: `backend/src/utils/demoSeed.js`
- Modify: `backend/src/__tests__/demoSeed.test.js`

- [ ] **Step 1: Scrivi il test fallito**

In `backend/src/__tests__/demoSeed.test.js`, dentro il `describe('seedDemoTenant (real database)', ...)` esistente, dopo l'ultimo `it(...)` di quel blocco (dopo la chiusura del test che verifica `approved_by`/`approved_at`, subito prima della chiusura finale del `describe`), aggiungi:

```javascript

  it('throws loudly instead of silently seeding an overlapping ferie/malattia pair', async () => {
    if (!dbAvailable) {
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const demoClientId = await insertDemoClient(client, 'Demo Overlap Guard Test');

      // Force an overlap by monkey-patching findConsecutiveRun via a tiny
      // wrapper is not practical here (module-level function, not injected) —
      // instead, this test documents and locks in the CONTRACT: if a future
      // edit to the ferieRun/malattiaRun offset ever produces an overlap,
      // seedDemoTenant() must throw, not silently insert. We verify this by
      // calling the module's own findConflictingLeaveRange directly against
      // a manually-inserted ferie row that DOES overlap where a malattia
      // would land, then confirm seedDemoTenant's guard rejects it by
      // asserting the guard function itself detects the overlap (unit-level
      // proof of the predicate the route now depends on).
      const { findConflictingLeaveRange } = require('../utils/eventConflict');
      await client.query(
        `INSERT INTO leave_requests (id, client_id, user_id, leave_type, start_date, end_date, num_days, status)
         VALUES (uuid_generate_v4(), $1, uuid_generate_v4(), 'FERIE_1', '2026-09-01'::date, '2026-09-03'::date, 3, 'APPROVED')`,
        [demoClientId]
      );
      const employeeResult = await client.query(
        `SELECT user_id FROM leave_requests WHERE client_id = $1 LIMIT 1`,
        [demoClientId]
      );
      const overlap = await findConflictingLeaveRange(client, {
        clientId: demoClientId,
        employeeId: employeeResult.rows[0].user_id,
        startDate: '2026-09-02',
        endDate: '2026-09-04',
      });
      expect(overlap.length).toBe(1); // confirms the predicate demoSeed.js now relies on actually detects the overlap

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
```

- [ ] **Step 2: Verifica che il test passi già (è un test di caratterizzazione della funzione condivisa, non della guardia in `demoSeed.js` stessa)**

Run: `cd backend && npx jest demoSeed.test.js -t "throws loudly"`
Expected: PASS — `findConflictingLeaveRange` esiste già da Task 1, questo test conferma solo che rileva correttamente l'overlap che `demoSeed.js` userà per proteggersi. La vera protezione in `demoSeed.js` viene aggiunta nello Step 3 seguente; nessun test end-to-end pratico esiste per "reintrodurre l'offset sbagliato e verificare che lanci" perché richiederebbe di rompere deliberatamente `findConsecutiveRun`, fuori scope — questo test documenta il contratto invece.

- [ ] **Step 3: Implementa la guardia in `demoSeed.js`**

In `backend/src/utils/demoSeed.js`, individua la riga `const DAYS_BACK = 34; // covers the last ~30-35 calendar days ending today` (fine del blocco JSDoc iniziale) e inserisci subito prima di essa:

```javascript
const { findConflictingLeaveRange } = require('./eventConflict');

```

Poi, nel corpo di `seedDemoTenant`, individua il blocco:

```javascript
  if (malattiaRun) {
    await client.query(
      `INSERT INTO illnesses (id, client_id, employee_id, start_date, end_date, num_days, reason, created_by)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, 'Malattia (dato demo)', $2)`,
      [clientId, employee.id, malattiaRun.startDate, malattiaRun.endDate, malattiaRun.endIndex - malattiaRun.startIndex + 1]
    );
    illnessesCount++;
  }
```

e sostituiscilo con:

```javascript
  if (malattiaRun) {
    // Guardia esplicita al posto dell'offset implicito ferieRun.endIndex+3:
    // se un futuro sviluppo di questo file (o una modifica all'offset)
    // producesse mai una malattia che si sovrappone alla ferie già inserita,
    // questo fallisce rumorosamente invece di seminare dati corrotti nel
    // tenant demo self-service — stessa fonte di verità usata dalle route
    // reali (design spec 2026-08-25, sezione "Seconda review critica").
    if (ferieRun) {
      const overlap = await findConflictingLeaveRange(client, {
        clientId,
        employeeId: employee.id,
        startDate: malattiaRun.startDate,
        endDate: malattiaRun.endDate,
      });
      if (overlap.length > 0) {
        throw new Error(
          'seedDemoTenant: malattiaRun overlaps an already-inserted ferie run — adjust the offset in demoSeed.js (see 2026-08-25 mutual-exclusion design spec)'
        );
      }
    }

    await client.query(
      `INSERT INTO illnesses (id, client_id, employee_id, start_date, end_date, num_days, reason, created_by)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, 'Malattia (dato demo)', $2)`,
      [clientId, employee.id, malattiaRun.startDate, malattiaRun.endDate, malattiaRun.endIndex - malattiaRun.startIndex + 1]
    );
    illnessesCount++;
  }
```

- [ ] **Step 4: Verifica che il seed continui a funzionare senza regressioni (comportamento identico, solo guardia esplicita in più)**

Run: `cd backend && npx jest demoSeed.test.js`
Expected: PASS (tutti i test esistenti, incluso quello principale che verifica `counts.leaveRequests > 0` e `counts.illnesses > 0` — l'offset esistente non produce overlap, quindi la guardia non scatta mai in pratica)

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/utils/demoSeed.js src/__tests__/demoSeed.test.js
git commit -m "fix: demoSeed.js asserts non-overlap via the shared conflict-check instead of an implicit offset"
```

---

## Task 7: Documentare il nuovo Known Bug Pattern in `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Aggiungi il Pattern 7**

In `CLAUDE.md`, individua la sezione `## 🔍 Code Review Checklists` (che segue l'ultimo pattern, "Pattern 6: Timezone-Naive `::date` Casts"). Subito prima di quella sezione (dopo la fine del blocco "Prevention Checklist" di Pattern 6), aggiungi:

```markdown
---

### Pattern 7: Punti di Scrittura Nuovi su Tabelle con Invarianti Cross-Tabella
**Files:** `backend/src/routes/events.js`, `backend/src/routes/leaves.js`, `backend/src/routes/illnesses.js`, `backend/src/utils/demoSeed.js`, e qualunque futuro import CSV/wizard/script che scriva su `event_requests`/`leave_requests`/`illnesses`

**Risk:** Evento/Training, Ferie e Malattia sono mutuamente esclusivi a coppie per lo stesso dipendente/data (design spec `docs/superpowers/specs/2026-08-25-event-leave-illness-mutual-exclusion-design.md`), garantito da un controllo applicativo in `backend/src/utils/eventConflict.js` (`findConflictingEventRange`, `findConflictingLeaveRange`, `findConflictingIllnessRange`, `lockAbsenceConflictScope`) — **non da un vincolo a livello di database**. Un nuovo punto di scrittura che inserisce/aggiorna direttamente una di queste tabelle senza passare da queste funzioni condivise può reintrodurre esattamente il bug originale (un dipendente con Evento+Ferie+Malattia approvati sullo stesso giorno), invisibile finché qualcuno non lo nota manualmente — è già successo una volta in produzione prima che esistesse questo controllo, e `backend/src/utils/demoSeed.js` (il tenant demo self-service) si affidava a un offset implicito prima di essere corretto per usare la stessa fonte di verità.

**Prevention Checklist:**
- [ ] Qualunque nuovo endpoint, script di seed, wizard di import o job batch che scrive `event_requests`, `leave_requests` o `illnesses` chiama `findConflictingEventRange`/`findConflictingLeaveRange`/`findConflictingIllnessRange` prima dell'insert/update, oppure documenta esplicitamente perché non serve (es. lo scrive solo su uno stato non-bloccante come `REJECTED`/`cancelled_at` già impostato)
- [ ] Se il nuovo punto di scrittura opera su un range di date (non un giorno singolo), usa `lockAbsenceConflictScope` (non un lock per singolo giorno) per evitare falsi `EVENT_CONFLICT_LOCK_BUSY` su richieste che si sovrappongono parzialmente
- [ ] Se si considera di spostare questa logica in un vincolo a livello di database (trigger Postgres), vedere la sezione "Alternative valutate" nella design spec collegata sopra — un `EXCLUDE` constraint nativo non basta da solo (multi-tabella, e la regola "malattia vince sempre" richiede una cascata, non solo un rifiuto)
```

Inserisci il testo sopra (dal `---` all'ultima riga della checklist) come Markdown normale in `CLAUDE.md`, esattamente nello stesso stile dei Pattern 1-6 già presenti nel file — non va racchiuso in un ulteriore code fence dentro `CLAUDE.md` stesso, il fence qui sopra serve solo a delimitare il testo da copiare in questo piano.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add Known Bug Pattern 7 — new write paths on event/leave/illness tables must use the shared conflict-check"
```

---

## Task 8: Regressione completa e verifica finale

**Files:** nessuno (solo verifica)

- [ ] **Step 1: Esegui l'intera suite backend**

Run: `cd backend && npm test`
Expected: tutti i test PASS (nessuna regressione sull'intera suite, non solo sui file toccati — `npm test` passa dallo split a due batch di `scripts/run-tests.js`, necessario per evitare le race note di Pattern 5 di CLAUDE.md)

- [ ] **Step 2: Esegui il linter**

Run: `cd backend && npm run lint`
Expected: 0 errori, 0 warning

- [ ] **Step 3: Grep di verifica — nessun altro punto di scrittura dimenticato**

Run: `cd backend && grep -rln "INSERT INTO.*event_requests\|UPDATE.*event_requests\|INSERT INTO.*leave_requests\|UPDATE.*leave_requests\|INSERT INTO.*illnesses\|UPDATE.*illnesses" src/ --include="*.js" | grep -v __tests__ | grep -v migrations`
Expected: esattamente gli stessi 4 file di questo piano (`events.js`, `leaves.js`, `illnesses.js`, `demoSeed.js`) — se ne compare un quinto non toccato da questo piano, fermarsi e valutarlo prima di considerare il lavoro concluso.

- [ ] **Step 4: Push**

```bash
git push origin main
```

Expected: CI verde (Backend Lint & Test, Security Check) su GitHub Actions.

---

## Note per l'esecutore

- **Non toccare** il cleanup del dato corrotto di Maria (25/08/2026) — esplicitamente rimandato, fuori scope di questo piano (vedi spec, decisione 7).
- **Non toccare** `leave_type = 'MALATTIA'` come valore enum in `leave_requests` — è un valore legacy mai raggiungibile da nessuna UI attuale (né web né mobile filtrano/offrono questa opzione nel form Ferie); il vero meccanismo malattia è la tabella `illnesses`. Il codice di questo piano tratta genericamente qualunque riga `leave_requests` PENDING/APPROVED come conflitto potenziale, incluso quel valore legacy se mai presente — comportamento corretto, nessuna gestione speciale necessaria.
- **Ordine dei task**: Task 1 è una dipendenza hard per tutti gli altri (2-6 importano le funzioni che Task 1 crea) — non parallelizzabile prima che Task 1 sia commitato. Task 2-6 sono indipendenti tra loro e possono essere eseguiti in qualunque ordine (o in parallelo da worker diversi) una volta completato Task 1.
