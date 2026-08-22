# Mutua Esclusione Eventi/Training ↔ Smart Working Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un evento Eventi/Training PENDING/APPROVED blocca la dichiarazione di Smart Working per lo stesso giorno, e uno Smart Working già dichiarato blocca l'approvazione di un evento per quel giorno — stessa mutua esclusione già esistente tra eventi e check-in QR.

**Architecture:** Riuso quasi totale di `backend/src/utils/eventConflict.js` (lock advisory + `findConflictingEvent`, già generico), più una nuova funzione simmetrica `findConflictingSmartWorking`. Fix collaterale: `smartWorking.js` passa da `CURRENT_DATE` (Postgres, timezone di sessione) a `todayInTimeZone()` (JS, Europe/Rome, stesso helper già usato da checkins/events) per garantire che il controllo di conflitto confronti sempre la stessa data che viene salvata.

**Tech Stack:** Node.js/Express/pg (backend), React Native/Expo (mobile), Jest (entrambi).

**Riferimento spec:** `docs/superpowers/specs/2026-08-22-smart-working-event-conflict-design.md`

---

### Task 1: `findConflictingSmartWorking` — utility condivisa

**Files:**
- Modify: `backend/src/utils/eventConflict.js`
- Test: `backend/src/__tests__/eventConflict.test.js`

- [ ] **Step 1: Scrivi il test che fallisce**

Aggiungi in fondo a `backend/src/__tests__/eventConflict.test.js`, prima della chiusura del `describe('eventConflict utility', ...)` finale (stesso livello degli altri `describe` annidati come `describe('findConflictingCheckin', ...)`):

```js
  describe('findConflictingSmartWorking', () => {
    it('returns the smart_working_days row when one exists for that client/employee/date', async () => {
      const row = { id: 'sw-1', date: '2026-09-01' };
      const client = makeMockClient(async () => ({ rows: [row] }));

      const result = await findConflictingSmartWorking(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });

      expect(result).toEqual(row);
    });

    it('returns null when no smart working day exists for that date', async () => {
      const client = makeMockClient(async () => ({ rows: [] }));

      const result = await findConflictingSmartWorking(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });

      expect(result).toBeNull();
    });

    it('queries smart_working_days scoped by client_id, employee_id and date', async () => {
      let capturedSql, capturedParams;
      const client = makeMockClient(async (sql, params) => {
        capturedSql = sql;
        capturedParams = params;
        return { rows: [] };
      });

      await findConflictingSmartWorking(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });

      expect(capturedSql).toContain('FROM smart_working_days');
      expect(capturedSql).toContain('client_id = $1');
      expect(capturedSql).toContain('employee_id = $2');
      expect(capturedSql).toContain('date = $3');
      expect(capturedParams).toEqual(['c1', 'e1', '2026-09-01']);
    });
  });
```

Aggiorna anche la riga di import in cima al file:
```js
const { lockEventConflictScope, findConflictingEvent, findConflictingCheckin } = require('../utils/eventConflict');
```
diventa:
```js
const { lockEventConflictScope, findConflictingEvent, findConflictingCheckin, findConflictingSmartWorking } = require('../utils/eventConflict');
```

- [ ] **Step 2: Verifica che fallisca**

Run: `cd backend && npx jest eventConflict.test.js -v`
Expected: FAIL — `findConflictingSmartWorking is not a function` (o `undefined`).

- [ ] **Step 3: Implementa**

In `backend/src/utils/eventConflict.js`, aggiungi dopo `findConflictingCheckin` (prima di `module.exports`):

```js
/** Returns the conflicting smart_working_days row for a date, or null. */
async function findConflictingSmartWorking(client, { clientId, employeeId, date }) {
  const result = await client.query(
    `SELECT id, date::text AS date
     FROM smart_working_days
     WHERE client_id = $1::uuid AND employee_id = $2::uuid AND date = $3::date
     LIMIT 1`,
    [clientId, employeeId, date]
  );
  return result.rows[0] || null;
}
```

Aggiorna `module.exports`:
```js
module.exports = { lockEventConflictScope, findConflictingEvent, findConflictingCheckin, findConflictingSmartWorking };
```

- [ ] **Step 4: Verifica che passi**

Run: `cd backend && npx jest eventConflict.test.js -v`
Expected: PASS, tutti i test verdi (esistenti + i 3 nuovi).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/eventConflict.js backend/src/__tests__/eventConflict.test.js
git commit -m "feat: add findConflictingSmartWorking to eventConflict utility"
```

---

### Task 2: `smartWorking.js` POST — blocco su evento + fix timezone

**Files:**
- Modify: `backend/src/routes/smartWorking.js`
- Modify: `backend/src/__tests__/smart-working.test.js`

- [ ] **Step 1: Scrivi/aggiorna i test che falliscono**

In `backend/src/__tests__/smart-working.test.js`, aggiungi questo import in cima (dopo gli altri require):
```js
const { todayInTimeZone } = require('../utils/date');
```

Sostituisci il test esistente `'creates a smart working day and returns 201'` (il mock ha oggi un solo `.mockResolvedValueOnce`, ma con lock+conflict-check la transazione ora esegue 4 query: `SET LOCAL lock_timeout`, `pg_advisory_xact_lock`, `findConflictingEvent`, `INSERT`):

```js
    test('creates a smart working day and returns 201', async () => {
      const mockRow = {
        id: uuidv4(),
        employee_id: TEST_EMPLOYEE_ID,
        date: todayInTimeZone(),
        created_at: new Date(),
      };

      withTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({}) // SET LOCAL lock_timeout
            .mockResolvedValueOnce({ rows: [] }) // pg_advisory_xact_lock
            .mockResolvedValueOnce({ rows: [] }) // findConflictingEvent — no conflict
            .mockResolvedValueOnce({ rows: [mockRow] }), // INSERT
        };
        return callback(mockClient);
      });

      const app = createApp();
      const res = await request(app).post('/api/v1/smart-working').send({});

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.employee_id).toBe(TEST_EMPLOYEE_ID);
      expect(res.body.message).toMatch(/Smart Working/);
    });

    test('rejects with 409 EVENT_DATE_CONFLICT when a PENDING event exists for today', async () => {
      withTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({}) // SET LOCAL lock_timeout
            .mockResolvedValueOnce({ rows: [] }) // pg_advisory_xact_lock
            .mockResolvedValueOnce({ rows: [{ id: 'evt-1', description: 'Corso di formazione', status: 'PENDING' }] }), // findConflictingEvent — conflict
        };
        return callback(mockClient);
      });

      const app = createApp();
      const res = await request(app).post('/api/v1/smart-working').send({});

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
      expect(res.body.message).toMatch(/Corso di formazione/);
    });

    test('rejects with 409 EVENT_DATE_CONFLICT when an APPROVED event exists for today', async () => {
      withTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({}) // SET LOCAL lock_timeout
            .mockResolvedValueOnce({ rows: [] }) // pg_advisory_xact_lock
            .mockResolvedValueOnce({ rows: [{ id: 'evt-1', description: 'Congresso a Torino', status: 'APPROVED' }] }), // findConflictingEvent — conflict
        };
        return callback(mockClient);
      });

      const app = createApp();
      const res = await request(app).post('/api/v1/smart-working').send({});

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
    });
```

Sostituisci il test esistente `'rejects a duplicate declaration for the same day with a clean 409, not a 500'` (deve simulare tutta la catena, con il fallimento `23505` sull'ultima query, l'INSERT):

```js
    test('rejects a duplicate declaration for the same day with a clean 409, not a 500', async () => {
      const uniqueViolation = new Error('duplicate key value violates unique constraint');
      uniqueViolation.code = '23505';

      withTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({}) // SET LOCAL lock_timeout
            .mockResolvedValueOnce({ rows: [] }) // pg_advisory_xact_lock
            .mockResolvedValueOnce({ rows: [] }) // findConflictingEvent — no conflict
            .mockRejectedValueOnce(uniqueViolation), // INSERT
        };
        return callback(mockClient);
      });

      const app = createApp();
      const res = await request(app).post('/api/v1/smart-working').send({});

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('ALREADY_DECLARED_TODAY');
      expect(res.body.message).not.toMatch(/duplicate key/i);
    });
```

Sostituisci il test esistente `'ignores a client-supplied date and employee_id — server always uses its own values'` — l'assertion `toMatch(/CURRENT_DATE/)` non è più valida (la data ora è un parametro, non un literal SQL); la garanzia da provare diventa "il parametro data dell'INSERT è sempre `todayInTimeZone()`, mai il valore fornito dal client":

```js
    test('ignores a client-supplied date and employee_id — server always uses its own values', async () => {
      const mockRow = {
        id: uuidv4(),
        employee_id: TEST_EMPLOYEE_ID,
        date: todayInTimeZone(),
        created_at: new Date(),
      };
      let insertParams;

      withTransaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({}) // SET LOCAL lock_timeout
            .mockResolvedValueOnce({ rows: [] }) // pg_advisory_xact_lock
            .mockResolvedValueOnce({ rows: [] }) // findConflictingEvent — no conflict
            .mockImplementationOnce((query, params) => {
              insertParams = params;
              return Promise.resolve({ rows: [mockRow] });
            }),
        };
        return callback(mockClient);
      });

      const app = createApp();
      await request(app)
        .post('/api/v1/smart-working')
        .send({ date: '2020-01-01', employee_id: 'some-other-uuid' });

      // The INSERT's date param must be the server-computed Europe/Rome "today",
      // and the employee_id must be the authenticated one — the attacker-supplied
      // date/employee_id in the body must never reach the query.
      expect(insertParams).toEqual([TEST_CLIENT_ID, TEST_EMPLOYEE_ID, todayInTimeZone()]);
      expect(insertParams[2]).not.toBe('2020-01-01');
    });
```

- [ ] **Step 2: Verifica che fallisca**

Run: `cd backend && npx jest smart-working.test.js -v`
Expected: FAIL sui test aggiornati/nuovi (il codice attuale fa una sola query, non chiama `lockEventConflictScope`/`findConflictingEvent`, e l'INSERT usa ancora `CURRENT_DATE` letterale).

- [ ] **Step 3: Implementa**

In `backend/src/routes/smartWorking.js`, aggiorna gli import in cima al file:

```js
const express = require('express');
const { pool } = require('../db/pool');
const { logAudit } = require('../middleware/audit');
const { withTransaction } = require('../middleware/db-transaction');
const { requireAuth } = require('../middleware/auth');
const { lockEventConflictScope, findConflictingEvent } = require('../utils/eventConflict');
const { todayInTimeZone } = require('../utils/date');
const { ForbiddenError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');
```

Sostituisci il corpo di `router.post('/', ...)` — dal blocco `const result = await withTransaction(async (client) => {` fino al suo `});` di chiusura:

```js
    const today = todayInTimeZone();

    const result = await withTransaction(async (client) => {
      await lockEventConflictScope(client, { clientId, employeeId, date: today });
      const conflictingEvent = await findConflictingEvent(client, { clientId, employeeId, date: today });
      if (conflictingEvent) {
        throw new ConflictError(
          `Esiste già un evento (${conflictingEvent.description}) programmato per oggi — impossibile dichiarare Smart Working`,
          'EVENT_DATE_CONFLICT'
        );
      }

      let insertResult;
      try {
        insertResult = await client.query(
          `INSERT INTO smart_working_days (client_id, employee_id, date, created_by)
           VALUES ($1::uuid, $2::uuid, $3::date, $2::uuid)
           RETURNING id, employee_id, date::text AS date, created_at`,
          [clientId, employeeId, today]
        );
      } catch (err) {
        // Postgres unique_violation — employee already declared smart working today
        if (err.code === '23505') {
          throw new ConflictError(
            'Hai già dichiarato Smart Working per oggi',
            'ALREADY_DECLARED_TODAY'
          );
        }
        throw err;
      }

      const smartWorkingDay = insertResult.rows[0];

      await logAudit(client, {
        action: 'smart_working_declared',
        entity: 'smart_working_day',
        entityId: smartWorkingDay.id,
        clientId,
        oldValue: null,
        newValue: { employee_id: employeeId, date: smartWorkingDay.date },
        userId,
      });

      return smartWorkingDay;
    });
```

Nota: `today` è calcolato **fuori** da `withTransaction` (una sola volta, coerente per tutta la richiesta) ma **dentro** l'handler della route, dopo il guard `if (!employeeId)` esistente — non cambiare l'ordine del guard.

- [ ] **Step 4: Verifica che passi**

Run: `cd backend && npx jest smart-working.test.js -v`
Expected: PASS, tutti i test verdi.

- [ ] **Step 5: Regressione mirata**

Run: `cd backend && npx jest eventConflict smart-working -v`
Expected: PASS (nessuna interferenza tra i due file).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/smartWorking.js backend/src/__tests__/smart-working.test.js
git commit -m "feat: block Smart Working declaration when a PENDING/APPROVED event exists, align to Europe/Rome date"
```

---

### Task 3: `events.js` PUT `/:id/approve` — blocco su Smart Working esistente

**Files:**
- Modify: `backend/src/routes/events.js`
- Modify: `backend/src/__tests__/events.test.js`

- [ ] **Step 1: Scrivi/aggiorna i test che falliscono**

In `backend/src/__tests__/events.test.js`, dentro `describe('PUT /api/v1/events/:id/approve', ...)`, applica queste 4 modifiche ai test esistenti (inserendo un `.mockResolvedValueOnce({ rows: [] })` per `findConflictingSmartWorking` subito dopo quello di `findConflictingCheckin` in ciascuna catena, e aggiornando gli indici/count conseguenti):

**Test "should reject stale concurrent approvals when atomic PENDING update affects no rows"** — la catena mock diventa:
```js
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_EVENT_ID,
            client_id: TEST_CLIENT_ID,
            user_id: TEST_EMPLOYEE_ID,
            event_date: todayISO(),
            start_time: '08:00:00',
            end_time: '18:00:00',
            status: 'PENDING',
          }],
        })
        .mockResolvedValueOnce({}) // SET LOCAL lock_timeout
        .mockResolvedValueOnce({ rows: [] }) // pg_advisory_xact_lock
        .mockResolvedValueOnce({ rows: [] }) // findConflictingCheckin — no conflict
        .mockResolvedValueOnce({ rows: [] }) // findConflictingSmartWorking — no conflict
        .mockResolvedValueOnce({ rows: [] }); // UPDATE affects no rows (race)
```
e le assertion sotto:
```js
      expect(mockPool.query).toHaveBeenCalledTimes(6);
      expect(mockPool.query.mock.calls[5][0]).toContain('WHERE id = $4::uuid AND status = \'PENDING\'');
```

**Test "lets a manager approve a request for an employee assigned to their site via assigned_sites, ..."** — inserisci un `.mockResolvedValueOnce({ rows: [] }) // findConflictingSmartWorking — no conflict` subito dopo il commento `// findConflictingCheckin — no conflict` nella sua catena (nessuna assertion di indice da aggiornare in questo test — `mock.calls[1][0]` resta invariato, è prima del blocco conflict).

**Test "invalidates an already-signed timesheet for that month when the request is APPROVED, ..."** — inserisci `.mockResolvedValueOnce({ rows: [] }) // findConflictingSmartWorking — no conflict` subito dopo `// findConflictingCheckin — no conflict`, poi aggiorna:
```js
      expect(mockPool.query).toHaveBeenCalledTimes(10);
      const invalidateCallSql = mockPool.query.mock.calls[6][0];
      expect(invalidateCallSql).toContain('timesheet_signatures');
      expect(invalidateCallSql).toContain('status = \'invalidated\'');
      expect(mockPool.query.mock.calls[6][1]).toEqual([TEST_EMPLOYEE_ID, expect.any(Number), expect.any(Number)]);
```

**Test "derives the correct month/year for a 1st-of-month event_date regardless of server timezone, ..."** — inserisci `.mockResolvedValueOnce({ rows: [] }) // findConflictingSmartWorking — no conflict` subito dopo `// findConflictingCheckin — no conflict`, poi aggiorna:
```js
      expect(mockPool.query.mock.calls[6][1]).toEqual([TEST_EMPLOYEE_ID, 6, 2026]);
```

Poi aggiungi un **nuovo test**, subito dopo `'rejects approval with 409 EVENT_DATE_CONFLICT when a checkin already exists for the event date'` (che resta invariato — la conflict-check su checkin va in errore prima di arrivare a `findConflictingSmartWorking`, quindi quel test non è affetto):

```js
    it('rejects approval with 409 EVENT_DATE_CONFLICT when the employee already declared Smart Working for the event date', async () => {
      const adminToken = makeToken();
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_EVENT_ID,
            client_id: TEST_CLIENT_ID,
            user_id: TEST_EMPLOYEE_ID,
            event_date: todayISO(),
            start_time: '08:00:00',
            end_time: '18:00:00',
            status: 'PENDING',
          }],
        })
        .mockResolvedValueOnce({}) // SET LOCAL lock_timeout
        .mockResolvedValueOnce({ rows: [] }) // pg_advisory_xact_lock
        .mockResolvedValueOnce({ rows: [] }) // findConflictingCheckin — no conflict
        .mockResolvedValueOnce({ rows: [{ id: 'sw-1', date: todayISO() }] }); // findConflictingSmartWorking — conflict found

      const res = await request(app)
        .put(`/api/v1/events/${TEST_EVENT_ID}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
      expect(res.body.details.conflicting_smart_working_id).toBe('sw-1');
    });
```

I due test sui percorsi `REJECTED` (`'does NOT touch timesheet_signatures when the request is REJECTED'` e `'does not check for a conflicting checkin when REJECTING'`) **non vanno modificati**: il blocco `if (status === 'APPROVED') { ... }` che contiene sia `findConflictingCheckin` che il nuovo `findConflictingSmartWorking` non viene mai eseguito per `status: 'REJECTED'`.

- [ ] **Step 2: Verifica che fallisca**

Run: `cd backend && npx jest events.test.js -v`
Expected: FAIL — i test aggiornati per primi con `toHaveBeenCalledTimes`/`mock.calls[N]` sbagliati rispetto al codice attuale (che non chiama ancora `findConflictingSmartWorking`), e il nuovo test perché non esiste ancora alcun blocco.

- [ ] **Step 3: Implementa**

In `backend/src/routes/events.js`, aggiorna la riga di import:
```js
const { lockEventConflictScope, findConflictingCheckin } = require('../utils/eventConflict');
```
diventa:
```js
const { lockEventConflictScope, findConflictingCheckin, findConflictingSmartWorking } = require('../utils/eventConflict');
```

Nel blocco `if (status === 'APPROVED') { ... }` di `PUT /:id/approve`, subito dopo il blocco esistente di `findConflictingCheckin`:

```js
      if (status === 'APPROVED') {
        await lockEventConflictScope(client, { clientId, employeeId: eventRequest.user_id, date: eventRequest.event_date });
        const conflictingCheckin = await findConflictingCheckin(client, { clientId, employeeId: eventRequest.user_id, date: eventRequest.event_date });
        if (conflictingCheckin) {
          throw new ConflictError(
            'Impossibile approvare: esiste già un check-in registrato per questa data',
            'EVENT_DATE_CONFLICT',
            {
              conflicting_checkin_id: conflictingCheckin.id,
              conflicting_checkin_timestamp: conflictingCheckin.timestamp,
              conflicting_checkin_type: conflictingCheckin.type,
            }
          );
        }

        const conflictingSmartWorking = await findConflictingSmartWorking(client, { clientId, employeeId: eventRequest.user_id, date: eventRequest.event_date });
        if (conflictingSmartWorking) {
          throw new ConflictError(
            'Impossibile approvare: il dipendente ha già dichiarato Smart Working per questa data',
            'EVENT_DATE_CONFLICT',
            { conflicting_smart_working_id: conflictingSmartWorking.id }
          );
        }
      }
```

- [ ] **Step 4: Verifica che passi**

Run: `cd backend && npx jest events.test.js -v`
Expected: PASS, tutti i test verdi.

- [ ] **Step 5: Regressione mirata**

Run: `cd backend && npx jest eventConflict smart-working events -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/events.js backend/src/__tests__/events.test.js
git commit -m "feat: block event approval when the employee already declared Smart Working for that date"
```

---

### Task 4: Test di integrazione reale-Postgres (entrambe le direzioni)

**Files:**
- Create: `backend/src/__tests__/smartWorking-event-conflict.test.js`

- [ ] **Step 1: Scrivi il test**

Crea il file, mirror esatto di `backend/src/__tests__/checkins-event-conflict.test.js` (stessa struttura, stesso `dbConfig`, stessa convenzione `uniqueEmail`/cleanup in `finally`/`afterEach`):

```js
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

describe('POST /api/v1/smart-working — event conflict guard', () => {
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
      console.warn(`[smartWorking-event-conflict.test] Skipping — could not connect: ${err.message}`);
    }
    if (dbAvailable) {
      request = require('supertest');
      app = require('../app');
    }
  });

  afterAll(async () => {
    // Nota: closePool() non va chiamato qui — il secondo describe (PUT approve)
    // più sotto richiede lo stesso `app`/pool condiviso; chiuderlo due volte
    // fa fallire la seconda suite. Chiuso una sola volta nell'ultimo describe.
    if (pool) await pool.end();
  });

  function uniqueEmail(label) {
    return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  }

  async function makeClient() {
    const result = await pool.query(
      `INSERT INTO clients (id, name, email, plan, is_demo)
       VALUES (uuid_generate_v4(), 'SmartWorking Event Conflict Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('smartworking-event-conflict-client')]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, active)
       VALUES ($1, $2, 'SmartWorking Event Conflict Employee', 'employee', true)
       RETURNING id`,
      [clientId, uniqueEmail('smartworking-event-conflict')]
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
  });

  it('rejects with 409 EVENT_DATE_CONFLICT when a PENDING event exists for today', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeEventRequest(clientId, employeeId, todayInTimeZone(), 'PENDING');
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/smart-working')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('rejects with 409 EVENT_DATE_CONFLICT when an APPROVED event exists for today', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeEventRequest(clientId, employeeId, todayInTimeZone(), 'APPROVED');
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/smart-working')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('allows Smart Working when the only event for today is REJECTED', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    await makeEventRequest(clientId, employeeId, todayInTimeZone(), 'REJECTED');
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/smart-working')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(201);
  });

  it('allows Smart Working when no event exists for today (no regression)', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const employeeId = await makeEmployee(clientId);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/smart-working')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(201);
  });
});

describe('PUT /api/v1/events/:id/approve — smart working conflict guard', () => {
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
      console.warn(`[smartWorking-event-conflict PUT approve] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'SmartWorking Approve Conflict Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('smartworking-approve-conflict-client')]
    );
    return result.rows[0].id;
  }

  async function makeEmployee(clientId, siteId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, active)
       VALUES ($1, $2, 'SmartWorking Approve Conflict Employee', 'employee', ARRAY[$3]::uuid[], true)
       RETURNING id`,
      [clientId, uniqueEmail('smartworking-approve-conflict'), siteId]
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

  async function makeEventRequest(clientId, employeeId, eventDate) {
    const result = await pool.query(
      `INSERT INTO event_requests (id, client_id, user_id, event_date, start_time, end_time, description, status)
       VALUES (uuid_generate_v4(), $1, $2, $3::date, '08:00', '18:00', 'Corso di formazione', 'PENDING')
       RETURNING id`,
      [clientId, employeeId, eventDate]
    );
    return result.rows[0].id;
  }

  async function makeSmartWorkingDay(clientId, employeeId, date) {
    await pool.query(
      `INSERT INTO smart_working_days (client_id, employee_id, date, created_by)
       VALUES ($1, $2, $3::date, $2)`,
      [clientId, employeeId, date]
    );
  }

  function tokenFor({ client_id, role }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign({ user_id: 'admin-test', client_id, role, name: 'Test Admin' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
  }

  let clientId;

  afterEach(async () => {
    if (!dbAvailable || !clientId) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('rejects approval with 409 EVENT_DATE_CONFLICT when the employee already declared Smart Working for the event date', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const siteId = await makeSite(clientId);
    const employeeId = await makeEmployee(clientId, siteId);
    const today = todayInTimeZone();
    const eventId = await makeEventRequest(clientId, employeeId, today);
    await makeSmartWorkingDay(clientId, employeeId, today);
    const adminToken = tokenFor({ client_id: clientId, role: 'admin' });

    const res = await request(app)
      .put(`/api/v1/events/${eventId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('allows approval when no Smart Working day exists for the event date (no regression)', async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    const siteId = await makeSite(clientId);
    const employeeId = await makeEmployee(clientId, siteId);
    const eventId = await makeEventRequest(clientId, employeeId, todayInTimeZone());
    const adminToken = tokenFor({ client_id: clientId, role: 'admin' });

    const res = await request(app)
      .put(`/api/v1/events/${eventId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Verifica che fallisca (poi passi) senza reintrodurre codice prima del previsto**

Questo file è puramente di verifica — Task 1-3 hanno già implementato tutto il codice necessario. Non serve un ciclo RED separato qui: esegui direttamente e verifica GREEN.

Run: `cd backend && npx jest smartWorking-event-conflict.test.js -v`
Expected: PASS (se il DB locale `badge_system_test` è raggiungibile; altrimenti tutti i test si auto-skippano via `dbAvailable`, comportamento atteso e coerente con gli altri file reale-Postgres del repo).

- [ ] **Step 3: Commit**

```bash
git add backend/src/__tests__/smartWorking-event-conflict.test.js
git commit -m "test: real-Postgres integration coverage for smart-working↔event mutual exclusion"
```

---

### Task 5: Mobile — pre-check evento in `SmartWorkingScreen.jsx`

**Files:**
- Modify: `frontend-mobile/src/screens/checkin/SmartWorkingScreen.jsx`
- Create: `frontend-mobile/src/__tests__/SmartWorkingScreen.test.jsx`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `frontend-mobile/src/__tests__/SmartWorkingScreen.test.jsx`:

```jsx
import React from 'react';
import { Alert } from 'react-native';
import { render, act, waitFor } from '@testing-library/react-native';

jest.mock('../services/apiClient', () => ({
  post: jest.fn(),
  get: jest.fn(),
}));

jest.mock('../services/authService', () => ({
  getUser: jest.fn(),
}));

import apiClient from '../services/apiClient';
import authService from '../services/authService';
import SmartWorkingScreen from '../screens/checkin/SmartWorkingScreen';

async function renderScreen(navigationOverrides = {}) {
  const navigation = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn(), ...navigationOverrides };
  const utils = await render(<SmartWorkingScreen navigation={navigation} />);
  return { ...utils, navigation };
}

describe('SmartWorkingScreen', () => {
  beforeAll(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  beforeEach(() => {
    jest.clearAllMocks();
    authService.getUser.mockResolvedValue({ name: 'Maria Rossi', employee_id: 'emp-1' });
    apiClient.get.mockResolvedValue({ data: { data: [] } });
  });

  describe('event pre-check', () => {
    test('shows a loading spinner while the pre-check request is in flight, not the confirm button', async () => {
      let resolveGet;
      apiClient.get.mockReturnValue(new Promise((resolve) => { resolveGet = resolve; }));

      const { queryByText } = await renderScreen();

      expect(queryByText('Conferma Smart Working')).toBeNull();

      await act(async () => { resolveGet({ data: { data: [] } }); });
    });

    test('blocks the confirm flow and shows event details when a PENDING event exists for today', async () => {
      apiClient.get.mockResolvedValue({
        data: { data: [{ id: 'evt-1', status: 'PENDING', description: 'Corso di formazione', start_time: '08:00:00', end_time: '18:00:00' }] },
      });

      const { queryByText, findByText } = await renderScreen();

      await findByText(/Corso di formazione/);
      expect(queryByText('Conferma Smart Working')).toBeNull();
    });

    test('blocks the confirm flow when an APPROVED event exists for today', async () => {
      apiClient.get.mockResolvedValue({
        data: { data: [{ id: 'evt-1', status: 'APPROVED', description: 'Congresso a Torino', start_time: '08:00:00', end_time: '18:00:00' }] },
      });

      const { queryByText, findByText } = await renderScreen();

      await findByText(/Congresso a Torino/);
      expect(queryByText('Conferma Smart Working')).toBeNull();
    });

    test('does not block when the only event for today is REJECTED', async () => {
      apiClient.get.mockResolvedValue({
        data: { data: [{ id: 'evt-1', status: 'REJECTED', description: 'Corso', start_time: '08:00:00', end_time: '18:00:00' }] },
      });

      const { findByText } = await renderScreen();

      await findByText('Conferma Smart Working');
    });

    test('fail-open: shows the confirm button when the pre-check request fails (network error)', async () => {
      apiClient.get.mockRejectedValue(new Error('Network Error'));

      const { findByText } = await renderScreen();

      await findByText('Conferma Smart Working');
    });

    test('does not block when no event exists for today (no regression)', async () => {
      apiClient.get.mockResolvedValue({ data: { data: [] } });

      const { findByText } = await renderScreen();

      await findByText('Conferma Smart Working');
    });
  });
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `cd frontend-mobile && npx jest SmartWorkingScreen.test.jsx -v`
Expected: FAIL — la schermata oggi non fa mai `apiClient.get`, mostra sempre subito il bottone "Conferma Smart Working" indipendentemente dal mock.

- [ ] **Step 3: Implementa**

In `frontend-mobile/src/screens/checkin/SmartWorkingScreen.jsx`, aggiorna gli import in cima (dopo `import { COLORS, FONTS } from '../../config/theme';`):

```js
import { today, toISO } from '../../utils/dateUtils';
import LoadingSpinner from '../../components/LoadingSpinner';
```

Subito dopo la dichiarazione degli state esistenti (`const [user, setUser] = useState(null);` / `const [submitting, setSubmitting] = useState(false);`), aggiungi:

```js
  // Pre-check: un evento PENDING/APPROVED per oggi blocca Smart Working (mutua
  // esclusione evento↔Smart Working, stesso pattern di QRScannerScreen).
  // undefined = in corso, null = nessun conflitto, object = evento in conflitto.
  // Fail-open su errore di rete: il controllo lato server in smartWorking.js
  // resta comunque l'autorità finale.
  const [todayEvent, setTodayEvent] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    const todayStr = toISO(today());
    apiClient.get(ENDPOINTS.EVENTS_LIST, { params: { date_from: todayStr, date_to: todayStr } })
      .then((response) => {
        if (cancelled) return;
        const rows = response.data?.data || [];
        const conflict = rows.find((r) => r.status === 'PENDING' || r.status === 'APPROVED');
        setTodayEvent(conflict || null);
      })
      .catch(() => {
        if (!cancelled) setTodayEvent(null); // fail-open
      });
    return () => { cancelled = true; };
  }, []);
```

`ENDPOINTS` va importato — aggiungi/estendi l'import esistente:
```js
import { ENDPOINTS } from '../../config/endpoints';
```

Subito prima del `return (` principale (dopo il calcolo di `dateStrCapitalized`), aggiungi i due early-return:

```js
  if (todayEvent === undefined) {
    return (
      <View style={styles.centered}>
        <LoadingSpinner color={COLORS.navy500} />
        <Text style={styles.text}>Verifica eventi in corso...</Text>
      </View>
    );
  }

  if (todayEvent) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>Smart Working non disponibile oggi</Text>
        <Text style={styles.text}>
          Hai un evento programmato: {todayEvent.description} ({todayEvent.start_time?.slice(0, 5)}–{todayEvent.end_time?.slice(0, 5)}).
        </Text>
        <TouchableOpacity style={[styles.button, { marginTop: 12, backgroundColor: COLORS.stone }]} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Torna indietro</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }
```

Nello `StyleSheet.create({...})` esistente, aggiungi le 5 chiavi mancanti (nessuna esiste ancora in questo file):

```js
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: COLORS.linen },
  text: { fontFamily: FONTS.body, color: COLORS.stone, fontSize: 15, textAlign: 'center', marginTop: 12 },
  errorText: { fontFamily: FONTS.bodySemiBold, color: COLORS.error, fontSize: 18, marginBottom: 8 },
  button: { backgroundColor: COLORS.navy500, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 24 },
  buttonText: { fontFamily: FONTS.bodyMedium, color: COLORS.white, fontSize: 16 },
```

- [ ] **Step 4: Verifica che passi**

Run: `cd frontend-mobile && npx jest SmartWorkingScreen.test.jsx -v`
Expected: PASS, tutti i test verdi.

- [ ] **Step 5: Regressione mirata**

Run: `cd frontend-mobile && npx jest SmartWorkingScreen QRScannerScreen -v`
Expected: PASS (nessuna interferenza — file diversi, nessun modulo condiviso mutato).

- [ ] **Step 6: Commit**

```bash
git add frontend-mobile/src/screens/checkin/SmartWorkingScreen.jsx frontend-mobile/src/__tests__/SmartWorkingScreen.test.jsx
git commit -m "feat(mobile): block Smart Working declaration UI when an event is PENDING/APPROVED for today"
```

---

### Task 6: Regressione finale, lint, verifica manuale

**Files:** nessuna modifica — solo verifica.

- [ ] **Step 1: Suite backend completa**

Run: `cd backend && npm test`
Expected: tutti i batch verdi (parallelo + serializzato), nessun `FAIL`.

- [ ] **Step 2: Lint backend**

Run: `cd backend && npm run lint`
Expected: 0 errori.

- [ ] **Step 3: Suite mobile completa**

Run: `cd frontend-mobile && npx jest`
Expected: tutte le suite verdi.

- [ ] **Step 4: Grep di prevenzione (Pattern 6, CLAUDE.md)**

Run: `cd backend && grep -rn '::date' src/utils/eventConflict.js src/routes/smartWorking.js src/routes/events.js`
Expected: ogni occorrenza è su una colonna `DATE` pura (`event_requests.event_date`, `smart_working_days.date`) o su un parametro già calcolato in Europe/Rome (`$3::date` con `today`/`todayInTimeZone()`) — nessun cast `::date` diretto su una colonna `TIMESTAMPTZ`.

- [ ] **Step 5: Verifica manuale (facoltativa, richiede DB/backend locali attivi)**

Se l'utente vuole ripetere il test manuale che ha trovato il bug originale (account Maria): approvare un evento per oggi, poi provare a dichiarare Smart Working dall'app — deve essere bloccato con un messaggio esplicativo, non un errore generico.

- [ ] **Step 6: Nessun commit in questo task** — se Step 1-4 sono tutti verdi, procedere a `/superpowers:finishing-a-development-branch` (fuori scope di questo piano, da invocare separatamente a fine implementazione).
