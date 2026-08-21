# Mutua esclusione Evento ↔ Check-in — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementare la spec in `docs/superpowers/specs/2026-08-21-event-checkin-mutual-exclusion-design.md`: un dipendente con una richiesta di evento PENDING o APPROVED per una data non può avere anche un check-in per quella stessa data, in nessuno dei 4 percorsi che possono crearlo (creazione/correzione check-in, creazione/approvazione evento), con protezione da race condition via advisory lock Postgres.

**Architecture:** Nuova libreria condivisa `backend/src/utils/eventConflict.js` (lock + 2 query di conflitto), usata nei 4 punti identificati nella spec. `ConflictError` estesa con un parametro `details` opzionale. Filtro data aggiunto a `GET /events/my-requests` per il pre-check mobile. `QRScannerScreen.jsx` aggiunge un pre-check con 3 stati (loading/bloccato/fail-open).

**Tech Stack:** Node.js/Express/pg/Jest (backend), React Native/Jest/RN Testing Library (mobile). Nessuna nuova dipendenza.

---

## Task 1: Estendere `ConflictError` con un parametro `details` opzionale

**Files:**
- Modify: `backend/src/utils/errors.js:45-50`
- Test: `backend/src/__tests__/errors.test.js`

- [ ] **Step 1: Scrivere il test che fallisce**

Aggiungere in `backend/src/__tests__/errors.test.js`, subito dopo il blocco `describe('ConflictError', ...)` esistente (righe 113-119):

```js
  describe('ConflictError', () => {
    test('is a 409 CONFLICT', () => {
      const err = new ConflictError('Duplicate entry');
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('CONFLICT');
    });

    test('defaults details to null', () => {
      const err = new ConflictError('Duplicate entry');
      expect(err.details).toBeNull();
    });

    test('attaches details when provided', () => {
      const details = { conflicting_checkin_id: 'ci-1' };
      const err = new ConflictError('Duplicate entry', 'MY_CODE', details);
      expect(err.details).toEqual(details);
    });
  });
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `cd backend && npx jest errors.test.js -t "ConflictError"`
Expected: FAIL — `err.details` è `undefined`, non `null`/l'oggetto atteso (la classe non ha ancora il parametro).

- [ ] **Step 3: Implementare la modifica**

In `backend/src/utils/errors.js`, sostituire il blocco (righe 45-50):

```js
class ConflictError extends ApiError {
  constructor(message, code = 'CONFLICT') {
    super(code, message, 409);
    this.name = 'ConflictError';
  }
}
```

con:

```js
class ConflictError extends ApiError {
  constructor(message, code = 'CONFLICT', details = null) {
    super(code, message, 409);
    this.name = 'ConflictError';
    this.details = details;
  }
}
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `cd backend && npx jest errors.test.js`
Expected: PASS, tutti i test in questo file (nessuna chiamata esistente a `ConflictError` passa più di 2 argomenti, quindi retrocompatibile).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/errors.js backend/src/__tests__/errors.test.js
git commit -m "feat: add optional details param to ConflictError"
```

---

## Task 2: Creare `backend/src/utils/eventConflict.js`

**Files:**
- Create: `backend/src/utils/eventConflict.js`
- Test: `backend/src/__tests__/eventConflict.test.js`

- [ ] **Step 1: Scrivere il test che fallisce**

Creare `backend/src/__tests__/eventConflict.test.js`:

```js
'use strict';

const { lockEventConflictScope, findConflictingEvent, findConflictingCheckin } = require('../utils/eventConflict');

function makeMockClient(queryImpl) {
  return { query: jest.fn(queryImpl) };
}

describe('eventConflict utility', () => {
  describe('lockEventConflictScope', () => {
    it('sets a transaction-scoped lock_timeout then acquires the advisory lock', async () => {
      const calls = [];
      const client = makeMockClient(async (sql) => { calls.push(sql); return { rows: [] }; });

      await lockEventConflictScope(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });

      expect(calls[0]).toContain('lock_timeout');
      expect(calls[1]).toContain('pg_advisory_xact_lock');
    });

    it('produces the same lock key for the same (clientId, employeeId, date) scope', async () => {
      const seen = [];
      const client = makeMockClient(async (sql, params) => {
        if (sql.includes('pg_advisory_xact_lock')) seen.push(params[0]);
        return { rows: [] };
      });

      await lockEventConflictScope(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });
      await lockEventConflictScope(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });

      expect(seen[0]).toBe(seen[1]);
    });

    it('produces a different lock key for a different date', async () => {
      const seen = [];
      const client = makeMockClient(async (sql, params) => {
        if (sql.includes('pg_advisory_xact_lock')) seen.push(params[0]);
        return { rows: [] };
      });

      await lockEventConflictScope(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });
      await lockEventConflictScope(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-02' });

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
        lockEventConflictScope(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' })
      ).rejects.toMatchObject({ code: 'EVENT_CONFLICT_LOCK_BUSY', statusCode: 409 });
    });

    it('re-throws any other error unchanged', async () => {
      const client = makeMockClient(async (sql) => {
        if (sql.includes('pg_advisory_xact_lock')) {
          const err = new Error('connection terminated');
          err.code = '08006';
          throw err;
        }
        return { rows: [] };
      });

      await expect(
        lockEventConflictScope(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' })
      ).rejects.toMatchObject({ code: '08006' });
    });
  });

  describe('findConflictingEvent', () => {
    it('queries event_requests scoped by client/employee/date, filtered to PENDING/APPROVED', async () => {
      const client = makeMockClient(async () => ({ rows: [{ id: 'evt-1', description: 'Corso' }] }));

      const result = await findConflictingEvent(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });

      expect(result).toEqual({ id: 'evt-1', description: 'Corso' });
      expect(client.query.mock.calls[0][0]).toContain('event_requests');
      expect(client.query.mock.calls[0][0]).toContain("IN ('PENDING', 'APPROVED')");
      expect(client.query.mock.calls[0][1]).toEqual(['c1', 'e1', '2026-09-01']);
    });

    it('returns null when no conflicting row exists', async () => {
      const client = makeMockClient(async () => ({ rows: [] }));
      const result = await findConflictingEvent(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });
      expect(result).toBeNull();
    });
  });

  describe('findConflictingCheckin', () => {
    it('queries checkins joined to employees, scoped by client/employee/date', async () => {
      const client = makeMockClient(async () => ({ rows: [{ id: 'ci-1', type: 'IN' }] }));

      const result = await findConflictingCheckin(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });

      expect(result).toEqual({ id: 'ci-1', type: 'IN' });
      expect(client.query.mock.calls[0][0]).toContain('FROM checkins');
      expect(client.query.mock.calls[0][1]).toEqual(['c1', 'e1', '2026-09-01']);
    });

    it('returns null when no conflicting row exists', async () => {
      const client = makeMockClient(async () => ({ rows: [] }));
      const result = await findConflictingCheckin(client, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `cd backend && npx jest eventConflict.test.js`
Expected: FAIL — `Cannot find module '../utils/eventConflict'`.

- [ ] **Step 3: Implementare `eventConflict.js`**

Creare `backend/src/utils/eventConflict.js`:

```js
/**
 * Shared conflict-detection + serialization for the event↔checkin mutual
 * exclusion feature (docs/superpowers/specs/2026-08-21-event-checkin-mutual-exclusion-design.md).
 * Used by checkins.js (POST, PUT) and events.js (POST /request, PUT /:id/approve).
 */

const crypto = require('crypto');
const { ConflictError } = require('./errors');

/**
 * Serializes any conflict-check-then-write for a given (client, employee, date)
 * scope across the whole request lifetime of the transaction, so a checkin
 * creation and an event approval racing for the same slot can't both pass
 * their own conflict check before either commits. Released automatically at
 * transaction end (COMMIT/ROLLBACK) — no explicit unlock needed. Must be
 * called inside an already-BEGUN transaction (SET LOCAL requires it).
 */
async function lockEventConflictScope(client, { clientId, employeeId, date }) {
  const key = `${clientId}:${employeeId}:${date}`;
  const hash = crypto.createHash('sha256').update(key).digest();
  // Full 64-bit signed int (pg_advisory_xact_lock(bigint)'s native width) from a
  // stable hash, avoiding both Postgres's undocumented hashtext() and the much
  // higher collision rate a 32-bit truncation would have under concurrent load.
  const lockKey = hash.readBigInt64BE(0).toString();
  // lock_timeout scoped to this transaction only (reset automatically at
  // COMMIT/ROLLBACK) — without it, a stuck peer transaction would block this
  // one indefinitely.
  await client.query("SET LOCAL lock_timeout = '3s'");
  try {
    await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
  } catch (err) {
    if (err.code === '55P03') { // lock_not_available
      throw new ConflictError(
        'Un\'altra operazione è in corso per questo dipendente e questa data, riprova tra qualche secondo',
        'EVENT_CONFLICT_LOCK_BUSY'
      );
    }
    throw err;
  }
}

/** Returns the conflicting event_requests row (PENDING/APPROVED) for a checkin's date, or null. */
async function findConflictingEvent(client, { clientId, employeeId, date }) {
  const result = await client.query(
    `SELECT id, event_date::text AS event_date, start_time, end_time, description, status
     FROM event_requests
     WHERE client_id = $1::uuid AND user_id = $2::uuid AND event_date = $3::date
       AND status IN ('PENDING', 'APPROVED')
     LIMIT 1`,
    [clientId, employeeId, date]
  );
  return result.rows[0] || null;
}

/** Returns the conflicting checkins row for an event's date, or null. */
async function findConflictingCheckin(client, { clientId, employeeId, date }) {
  const result = await client.query(
    `SELECT c.id, c.timestamp, c.type
     FROM checkins c
     JOIN employees e ON e.id = c.employee_id
     WHERE e.client_id = $1::uuid AND c.employee_id = $2::uuid AND c.timestamp::date = $3::date
     LIMIT 1`,
    [clientId, employeeId, date]
  );
  return result.rows[0] || null;
}

module.exports = { lockEventConflictScope, findConflictingEvent, findConflictingCheckin };
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `cd backend && npx jest eventConflict.test.js`
Expected: PASS, tutti i 9 test.

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/eventConflict.js backend/src/__tests__/eventConflict.test.js
git commit -m "feat: add shared eventConflict utility (advisory lock + conflict queries)"
```

---

## Task 3: `checkins.js POST /` — blocco in creazione

**Files:**
- Modify: `backend/src/routes/checkins.js:14,20,148-150`
- Modify: `backend/src/__tests__/checkins.test.js` (2 test da aggiornare, righe 104-124 e 141-149)
- Create: `backend/src/__tests__/checkins-event-conflict.test.js` (nuovo, real-DB)

- [ ] **Step 1: Scrivere il test di integrazione (real DB) che fallisce**

Creare `backend/src/__tests__/checkins-event-conflict.test.js`, seguendo esattamente il pattern real-DB già usato in `checkins-hiring-date.test.js`:

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

describe('POST /api/v1/checkins — event conflict guard', () => {
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
      console.warn(`[checkins-event-conflict.test] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Checkins Event Conflict Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('checkins-event-conflict-client')]
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

  async function makeEmployee(clientId, siteId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, active)
       VALUES ($1, $2, 'Checkin Event Conflict Employee', 'employee', ARRAY[$3]::uuid[], true)
       RETURNING id`,
      [clientId, uniqueEmail('checkins-event-conflict'), siteId]
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

  it('rejects check-in with 409 EVENT_DATE_CONFLICT when a PENDING event exists for today', async () => {
    if (!dbAvailable) return;
    const employeeId = await makeEmployee(clientId, siteId);
    await makeEventRequest(clientId, employeeId, todayInTimeZone(), 'PENDING');
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: employeeId, site_id: siteId, type: 'IN' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('rejects check-in with 409 EVENT_DATE_CONFLICT when an APPROVED event exists for today', async () => {
    if (!dbAvailable) return;
    const employeeId = await makeEmployee(clientId, siteId);
    await makeEventRequest(clientId, employeeId, todayInTimeZone(), 'APPROVED');
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: employeeId, site_id: siteId, type: 'IN' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('allows check-in when the only event for today is REJECTED', async () => {
    if (!dbAvailable) return;
    const employeeId = await makeEmployee(clientId, siteId);
    await makeEventRequest(clientId, employeeId, todayInTimeZone(), 'REJECTED');
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: employeeId, site_id: siteId, type: 'IN' });

    expect(res.status).toBe(201);
  });

  it('blocks the check-in even when an admin creates it on behalf of the employee (no bypass for admin)', async () => {
    if (!dbAvailable) return;
    const employeeId = await makeEmployee(clientId, siteId);
    await makeEventRequest(clientId, employeeId, todayInTimeZone(), 'APPROVED');
    const adminToken = tokenFor({ client_id: clientId, role: 'admin', employee_id: null });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employee_id: employeeId, site_id: siteId, type: 'IN' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('allows check-in when no event exists for today (no regression)', async () => {
    if (!dbAvailable) return;
    const employeeId = await makeEmployee(clientId, siteId);
    const token = tokenFor({ client_id: clientId, role: 'employee', employee_id: employeeId });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${token}`)
      .send({ employee_id: employeeId, site_id: siteId, type: 'IN' });

    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `cd backend && NODE_ENV=test npx jest checkins-event-conflict.test.js`
Expected: FAIL sui primi 4 test (nessun blocco implementato ancora); PASS solo sull'ultimo (nessun evento, comportamento invariato).

- [ ] **Step 3: Wiring in `checkins.js`**

In `backend/src/routes/checkins.js`, aggiungere UNA sola riga di import, subito dopo la riga 17 esistente (`const { resolveEmployeeId, resolveSiteId } = require('../utils/resolvers');`, da non toccare):

```js
const { lockEventConflictScope, findConflictingEvent } = require('../utils/eventConflict');
```

Poi, tra la riga 148 (fine del blocco QR content) e la riga 150 (inizio del commento del geofence), inserire:

```js
      // 3.45 Event conflict check (mutua esclusione evento↔check-in) — un evento
      // PENDING o APPROVED per questa data blocca il check-in, per tutti i chiamanti
      // incluso l'admin. Va prima del geofence (più costoso, richiede GPS) per non
      // forzare un consenso GPS inutile su un check-in che verrà comunque rifiutato.
      await lockEventConflictScope(client, { clientId, employeeId: employee_id, date: effectiveEventDate });
      const conflictingEvent = await findConflictingEvent(client, { clientId, employeeId: employee_id, date: effectiveEventDate });
      if (conflictingEvent) {
        throw new ConflictError(
          `Esiste già un evento (${conflictingEvent.description}) programmato per questa data per questo dipendente`,
          'EVENT_DATE_CONFLICT'
        );
      }

```

Il file risultante, righe 141-169, deve leggere:

```js
      // 3.4 QR content validation (finding #5, Fase C) — se il client invia qr_content
      // (retrocompatibile: opzionale), deve combaciare esattamente con il valore corrente
      // in DB. Confronto in JS (non in SQL) — è già in memoria dalla query precedente,
      // nessuna query aggiuntiva necessaria, zero rischio di concatenazione SQL.
      if (qr_content != null && qr_content !== site.qr_code_content) {
        logger.warn({ action: 'qr_code_invalid_attempt', site_id, employee_id });
        throw new ForbiddenError('QR code does not match this site', 'QR_CODE_INVALID');
      }

      // 3.45 Event conflict check (mutua esclusione evento↔check-in) — un evento
      // PENDING o APPROVED per questa data blocca il check-in, per tutti i chiamanti
      // incluso l'admin. Va prima del geofence (più costoso, richiede GPS) per non
      // forzare un consenso GPS inutile su un check-in che verrà comunque rifiutato.
      await lockEventConflictScope(client, { clientId, employeeId: employee_id, date: effectiveEventDate });
      const conflictingEvent = await findConflictingEvent(client, { clientId, employeeId: employee_id, date: effectiveEventDate });
      if (conflictingEvent) {
        throw new ConflictError(
          `Esiste già un evento (${conflictingEvent.description}) programmato per questa data per questo dipendente`,
          'EVENT_DATE_CONFLICT'
        );
      }

      // 3.5 Geofence check (Fase C, 2026-08-09) — controllato interamente dai toggle
      // admin già esistenti: geofencing_feature_enabled (per cliente) e geofence_enabled
      // (per sede). Nessun env var globale: l'admin del cliente decide da solo.
      const { latitude: checkinLat, longitude: checkinLng } = req.validated.body;
```

- [ ] **Step 4: Eseguire il test real-DB e verificare che passi**

Run: `cd backend && NODE_ENV=test npx jest checkins-event-conflict.test.js`
Expected: PASS, tutti i 5 test.

- [ ] **Step 5: Aggiornare i 2 test mock-based esistenti in `checkins.test.js` che ora rompono l'ordine delle chiamate**

`checkins.test.js` usa `mockResolvedValueOnce` sequenziali (non SQL-dispatch). Le 2 chiamate nuove (`SET LOCAL lock_timeout`, `pg_advisory_xact_lock`) e 1 (`findConflictingEvent`) si inseriscono tra la mock "assignment" e la mock "INSERT INTO checkins".

In `backend/src/__tests__/checkins.test.js`, righe 104-124 (primo test in `describe('POST /api/checkins — success', ...)`), sostituire:

```js
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: TEST_EMPLOYEE_ID, client_id: TEST_CLIENT_ID }] }) // employee
      .mockResolvedValueOnce({ rows: [{ id: TEST_SITE_ID, name: 'Milano Centro' }] }) // site
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // assignment
      .mockResolvedValueOnce({
```

con:

```js
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: TEST_EMPLOYEE_ID, client_id: TEST_CLIENT_ID }] }) // employee
      .mockResolvedValueOnce({ rows: [{ id: TEST_SITE_ID, name: 'Milano Centro' }] }) // site
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // assignment
      .mockResolvedValueOnce({}) // SET LOCAL lock_timeout
      .mockResolvedValueOnce({ rows: [] }) // pg_advisory_xact_lock
      .mockResolvedValueOnce({ rows: [] }) // findConflictingEvent — no conflict
      .mockResolvedValueOnce({
```

Ripetere la stessa sostituzione per il secondo test (righe 141-149, nello stesso file, blocco successivo con lo stesso pattern di 4 mock iniziali seguito da un blocco `.mockResolvedValueOnce({...})` multi-riga).

- [ ] **Step 6: Eseguire l'intera suite `checkins.test.js` e verificare che passi**

Run: `cd backend && NODE_ENV=test npx jest checkins.test.js`
Expected: PASS, tutti i test (inclusi quelli non toccati — restano invariati perché falliscono prima del punto d'inserimento).

- [ ] **Step 7: Eseguire l'intera suite dei test checkins e verificare zero regressioni**

Run: `cd backend && NODE_ENV=test npx jest checkins`
Expected: PASS su tutti i file `checkins*.test.js` (gli altri usano mock SQL-dispatch con fallback `{rows: []}` e non richiedono modifiche).

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/checkins.js backend/src/__tests__/checkins.test.js backend/src/__tests__/checkins-event-conflict.test.js
git commit -m "feat: block checkin creation when a PENDING/APPROVED event exists for that date"
```

---

## Task 4: `checkins.js PUT /:id` — blocco in correzione

**Files:**
- Modify: `backend/src/routes/checkins.js:468-488`
- Modify: `backend/src/__tests__/checkins-event-conflict.test.js` (aggiungere test)

- [ ] **Step 1: Aggiungere i test che falliscono**

In `backend/src/__tests__/checkins-event-conflict.test.js`, aggiungere una nuova `describe` in fondo al file (prima della chiusura finale), riusando gli helper già definiti sopra:

```js
describe('PUT /api/v1/checkins/:id — event conflict guard on correction', () => {
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
      console.warn(`[checkins-event-conflict PUT] Skipping — could not connect: ${err.message}`);
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
       VALUES (uuid_generate_v4(), 'Checkins PUT Event Conflict Co', $1, 'starter', false)
       RETURNING id`,
      [uniqueEmail('checkins-put-event-conflict-client')]
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

  async function makeEmployee(clientId, siteId) {
    const result = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, assigned_sites, active)
       VALUES ($1, $2, 'Checkin PUT Event Conflict Employee', 'employee', ARRAY[$3]::uuid[], true)
       RETURNING id`,
      [clientId, uniqueEmail('checkins-put-event-conflict'), siteId]
    );
    return result.rows[0].id;
  }

  async function makeCheckin(clientId, employeeId, siteId, timestamp) {
    const result = await pool.query(
      `INSERT INTO checkins (employee_id, site_id, client_id, type, timestamp, created_by, created_at)
       VALUES ($1, $2, $3, 'IN', $4::timestamptz, $1, NOW())
       RETURNING id`,
      [employeeId, siteId, clientId, timestamp]
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
      { user_id: 'test-user', client_id, role, employee_id, site_id, name: 'Test' },
      privateKey,
      { algorithm: 'RS256', expiresIn: '1h' }
    );
  }

  let clientId, siteId, employeeId, checkinId;

  beforeEach(async () => {
    if (!dbAvailable) return;
    clientId = await makeClient();
    siteId = await makeSite(clientId);
    employeeId = await makeEmployee(clientId, siteId);
    checkinId = await makeCheckin(clientId, employeeId, siteId, new Date().toISOString());
  });

  afterEach(async () => {
    if (!dbAvailable) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
  });

  it('rejects a correction that moves the checkin onto a date with a PENDING/APPROVED event', async () => {
    if (!dbAvailable) return;
    const conflictDate = '2026-09-15';
    await makeEventRequest(clientId, employeeId, conflictDate, 'APPROVED');
    const adminToken = tokenFor({ client_id: clientId, role: 'admin' });

    const res = await request(app)
      .put(`/api/v1/checkins/${checkinId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ timestamp: `${conflictDate}T09:00:00.000Z` });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('allows a type-only correction (no timestamp change) even when an event exists for the checkin date (no date change → no check needed)', async () => {
    if (!dbAvailable) return;
    const today = todayInTimeZone();
    await makeEventRequest(clientId, employeeId, today, 'APPROVED');
    const adminToken = tokenFor({ client_id: clientId, role: 'admin' });

    const res = await request(app)
      .put(`/api/v1/checkins/${checkinId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'OUT' });

    expect(res.status).toBe(200);
  });

  it('allows a correction that moves the checkin onto a date with no conflicting event', async () => {
    if (!dbAvailable) return;
    const adminToken = tokenFor({ client_id: clientId, role: 'admin' });
    const freeDate = '2026-09-16';

    const res = await request(app)
      .put(`/api/v1/checkins/${checkinId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ timestamp: `${freeDate}T09:00:00.000Z` });

    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `cd backend && NODE_ENV=test npx jest checkins-event-conflict.test.js -t "PUT /api/v1/checkins"`
Expected: FAIL sul primo test (nessun blocco implementato ancora).

- [ ] **Step 3: Wiring in `checkins.js`**

In `backend/src/routes/checkins.js`, tra la riga 474 (fine del controllo "manager può editare solo la propria sede") e la riga 476 (commento "2. Verify within 7-day correction window"), inserire:

```js

      // Event conflict check — solo se la correzione sposta la data del check-in;
      // una correzione solo di type/note non cambia event_date, nessun controllo
      // necessario. Vale per tutti i chiamanti (manager/admin), nessun bypass.
      if (newTimestamp !== undefined) {
        const correctedDate = dateInTimeZone(new Date(newTimestamp));
        await lockEventConflictScope(client, { clientId, employeeId: checkin.employee_id, date: correctedDate });
        const conflictingEvent = await findConflictingEvent(client, { clientId, employeeId: checkin.employee_id, date: correctedDate });
        if (conflictingEvent) {
          throw new ConflictError(
            `Esiste già un evento (${conflictingEvent.description}) programmato per questa data per questo dipendente`,
            'EVENT_DATE_CONFLICT'
          );
        }
      }
```

Il file risultante, righe 468-488, deve leggere:

```js
      const checkin = checkinResult.rows[0];

      // 2a. Manager can only edit check-ins for their own site
      const userSiteId = req.user.site_id;
      if (req.user.role === 'manager' && userSiteId && checkin.site_id !== userSiteId) {
        throw new NotFoundError('Check-in not found or not assigned to your organization', 'CHECKIN_NOT_FOUND');
      }

      // Event conflict check — solo se la correzione sposta la data del check-in;
      // una correzione solo di type/note non cambia event_date, nessun controllo
      // necessario. Vale per tutti i chiamanti (manager/admin), nessun bypass.
      if (newTimestamp !== undefined) {
        const correctedDate = dateInTimeZone(new Date(newTimestamp));
        await lockEventConflictScope(client, { clientId, employeeId: checkin.employee_id, date: correctedDate });
        const conflictingEvent = await findConflictingEvent(client, { clientId, employeeId: checkin.employee_id, date: correctedDate });
        if (conflictingEvent) {
          throw new ConflictError(
            `Esiste già un evento (${conflictingEvent.description}) programmato per questa data per questo dipendente`,
            'EVENT_DATE_CONFLICT'
          );
        }
      }

      // 2. Verify within 7-day correction window
      const now = new Date();
      const checkinDate = new Date(checkin.timestamp);
      const diffDays = (now - checkinDate) / (1000 * 60 * 60 * 24);
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `cd backend && NODE_ENV=test npx jest checkins-event-conflict.test.js`
Expected: PASS, tutti i test (POST + PUT, 8 totali).

- [ ] **Step 5: Verificare che `checkins.test.js` non abbia regressioni**

Run: `cd backend && NODE_ENV=test npx jest checkins.test.js`
Expected: PASS — l'unico test PUT di successo in questo file invia solo `{ type: 'OUT' }` (nessun `timestamp`), quindi non attraversa il nuovo codice: nessuna modifica a questo file per il PUT.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/checkins.js backend/src/__tests__/checkins-event-conflict.test.js
git commit -m "feat: block checkin date correction when it lands on a PENDING/APPROVED event date"
```

---

## Task 5: `events.js POST /request` — aggiunta del lock

**Files:**
- Modify: `backend/src/routes/events.js:9-20,46`
- Modify: `backend/src/__tests__/events.test.js:128-165`

- [ ] **Step 1: Aggiornare i test esistenti (guidano l'implementazione)**

In `backend/src/__tests__/events.test.js`, sostituire il blocco `describe('Event Request API Endpoints — Conflict Detection', ...)` (righe 128-165) con:

```js
describe('Event Request API Endpoints — Conflict Detection', () => {
  const originalDisableAuth = process.env.DISABLE_AUTH;
  beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
  afterAll(() => { process.env.DISABLE_AUTH = originalDisableAuth; });

  it('rejects the request with 409 when a conflicting record exists for that date', async () => {
    const employeeToken = makeToken({ user_id: TEST_EMPLOYEE_ID, role: 'employee' });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_EMPLOYEE_ID, client_id: TEST_CLIENT_ID }] }) // employee lookup
      .mockResolvedValueOnce({}) // SET LOCAL lock_timeout
      .mockResolvedValueOnce({ rows: [] }) // pg_advisory_xact_lock
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // conflict found

    const res = await request(app)
      .post('/api/v1/events/request')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ event_date: todayISO(), start_time: '08:00', end_time: '18:00', description: 'Conferenza di settore' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
  });

  it('creates the request when no conflict exists', async () => {
    const employeeToken = makeToken({ user_id: TEST_EMPLOYEE_ID, role: 'employee' });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_EMPLOYEE_ID, client_id: TEST_CLIENT_ID }] }) // employee lookup
      .mockResolvedValueOnce({}) // SET LOCAL lock_timeout
      .mockResolvedValueOnce({ rows: [] }) // pg_advisory_xact_lock
      .mockResolvedValueOnce({ rows: [] }) // no conflict
      .mockResolvedValueOnce({ rows: [{ id: TEST_EVENT_ID, status: 'PENDING' }] }); // insert

    const res = await request(app)
      .post('/api/v1/events/request')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ event_date: todayISO(), start_time: '08:00', end_time: '18:00', description: 'Conferenza di settore' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(TEST_EVENT_ID);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `cd backend && NODE_ENV=test npx jest events.test.js -t "Conflict Detection"`
Expected: FAIL — la route non fa ancora le 2 chiamate extra, quindi la mock "conflict found"/"no conflict" viene consumata nel posto sbagliato e le assertion sullo status falliscono.

- [ ] **Step 3: Implementare la modifica**

In `backend/src/routes/events.js`, aggiungere UNA sola riga di import, tra la riga 16 (`const { invalidateSignatureIfExists } = require('../utils/timesheetSignature');`) e la riga 17 (`const { NotFoundError, ValidationError, ForbiddenError, ConflictError } = require('../utils/errors');`, entrambe già esistenti e da non toccare):

```js
const { lockEventConflictScope, findConflictingCheckin } = require('../utils/eventConflict');
```

Poi, alla riga 46 (subito prima del commento `// 2. Conflict check:`), inserire la chiamata al lock:

```js
      // 2. Conflict check: block if the employee already has any presence/absence
      // record for this date (checkin, pending/approved leave, active illness,
      // smart-working day, or another pending/approved event request).
      await lockEventConflictScope(client, { clientId, employeeId: userId, date: event_date });
      const conflictResult = await client.query(
```

(la riga `const conflictResult = await client.query(` esisteva già; la modifica è solo l'inserimento della riga `await lockEventConflictScope(...)` immediatamente prima).

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `cd backend && NODE_ENV=test npx jest events.test.js -t "Conflict Detection"`
Expected: PASS, entrambi i test.

- [ ] **Step 5: Eseguire l'intera suite `events.test.js`**

Run: `cd backend && NODE_ENV=test npx jest events.test.js`
Expected: alcuni test in `PUT /:id/approve` falliranno ancora — verranno sistemati nel Task 6. Confermare che SOLO quel blocco fallisce, nient'altro.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/events.js backend/src/__tests__/events.test.js
git commit -m "feat: serialize event creation's conflict check with an advisory lock"
```

---

## Task 6: `events.js PUT /:id/approve` — blocco in approvazione

**Files:**
- Modify: `backend/src/routes/events.js:210-213`
- Modify: `backend/src/__tests__/events.test.js:276-431`

- [ ] **Step 1: Aggiornare i test esistenti che rompono l'ordine delle chiamate**

In `backend/src/__tests__/events.test.js`, dentro `describe('PUT /api/v1/events/:id/approve', ...)`:

**a)** Il test `'should not reveal processed status...'` (righe 243-254) — NESSUNA modifica (fallisce prima di qualunque query).

**b)** Il test `'should reject already processed requests...'` (righe 256-274) — NESSUNA modifica (`status` dell'evento è già `'APPROVED'`, il nuovo codice è gated su `status === 'PENDING'` quindi non viene mai raggiunto).

**c)** Il test `'should reject stale concurrent approvals...'` (righe 276-302) — sostituire:

```js
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
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put(`/api/v1/events/${TEST_EVENT_ID}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe('Event request has already been processed');
      expect(mockPool.query).toHaveBeenCalledTimes(2);
      expect(mockPool.query.mock.calls[1][0]).toContain('WHERE id = $4::uuid AND status = \'PENDING\'');
```

con:

```js
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
        .mockResolvedValueOnce({ rows: [] }); // UPDATE affects no rows (race)

      const res = await request(app)
        .put(`/api/v1/events/${TEST_EVENT_ID}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe('Event request has already been processed');
      expect(mockPool.query).toHaveBeenCalledTimes(5);
      expect(mockPool.query.mock.calls[4][0]).toContain('WHERE id = $4::uuid AND status = \'PENDING\'');
```

**d)** Il test `'lets a manager approve a request...'` (righe 304-340) — sostituire il blocco mock:

```js
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
        .mockResolvedValueOnce({ rows: [{ assigned_sites: [TEST_SITE_ID] }] })
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_EVENT_ID,
            user_id: TEST_EMPLOYEE_ID,
            event_date: todayISO(),
            status: 'APPROVED',
            approved_at: new Date().toISOString(),
          }],
        })
        .mockResolvedValueOnce({ rows: [] }) // invalidateSignatureIfExists
        .mockResolvedValueOnce({ rows: [] }) // SAVEPOINT
        .mockResolvedValueOnce({ rows: [] }) // INSERT audit_log
        .mockResolvedValueOnce({ rows: [] }); // RELEASE SAVEPOINT
```

con:

```js
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
        .mockResolvedValueOnce({ rows: [{ assigned_sites: [TEST_SITE_ID] }] })
        .mockResolvedValueOnce({}) // SET LOCAL lock_timeout
        .mockResolvedValueOnce({ rows: [] }) // pg_advisory_xact_lock
        .mockResolvedValueOnce({ rows: [] }) // findConflictingCheckin — no conflict
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_EVENT_ID,
            user_id: TEST_EMPLOYEE_ID,
            event_date: todayISO(),
            status: 'APPROVED',
            approved_at: new Date().toISOString(),
          }],
        })
        .mockResolvedValueOnce({ rows: [] }) // invalidateSignatureIfExists
        .mockResolvedValueOnce({ rows: [] }) // SAVEPOINT
        .mockResolvedValueOnce({ rows: [] }) // INSERT audit_log
        .mockResolvedValueOnce({ rows: [] }); // RELEASE SAVEPOINT
```

(l'assertion `expect(mockPool.query.mock.calls[1][0]).toContain('SELECT assigned_sites FROM employees')` alla riga 339 resta invariata: l'indice 1 non cambia).

**e)** Il test `'invalidates an already-signed timesheet...'` (righe 342-383) — sostituire il blocco mock:

```js
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
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_EVENT_ID,
            client_id: TEST_CLIENT_ID,
            user_id: TEST_EMPLOYEE_ID,
            event_date: todayISO(),
            start_time: '08:00:00',
            end_time: '18:00:00',
            status: 'APPROVED',
          }],
        }) // UPDATE succeeds
        .mockResolvedValueOnce({ rows: [] }) // invalidateSignatureIfExists UPDATE
        .mockResolvedValueOnce({ rows: [] }) // logAudit: SAVEPOINT
        .mockResolvedValueOnce({ rows: [] }) // logAudit: INSERT INTO audit_log
        .mockResolvedValueOnce({ rows: [] }); // logAudit: RELEASE SAVEPOINT
```

con:

```js
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
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_EVENT_ID,
            client_id: TEST_CLIENT_ID,
            user_id: TEST_EMPLOYEE_ID,
            event_date: todayISO(),
            start_time: '08:00:00',
            end_time: '18:00:00',
            status: 'APPROVED',
          }],
        }) // UPDATE succeeds
        .mockResolvedValueOnce({ rows: [] }) // invalidateSignatureIfExists UPDATE
        .mockResolvedValueOnce({ rows: [] }) // logAudit: SAVEPOINT
        .mockResolvedValueOnce({ rows: [] }) // logAudit: INSERT INTO audit_log
        .mockResolvedValueOnce({ rows: [] }); // logAudit: RELEASE SAVEPOINT
```

e aggiornare le due assertion successive (righe 378-382):

```js
      expect(res.status).toBe(200);
      expect(mockPool.query).toHaveBeenCalledTimes(6);
      const invalidateCallSql = mockPool.query.mock.calls[2][0];
      expect(invalidateCallSql).toContain('timesheet_signatures');
      expect(invalidateCallSql).toContain('status = \'invalidated\'');
      expect(mockPool.query.mock.calls[2][1]).toEqual([TEST_EMPLOYEE_ID, expect.any(Number), expect.any(Number)]);
```

con:

```js
      expect(res.status).toBe(200);
      expect(mockPool.query).toHaveBeenCalledTimes(9);
      const invalidateCallSql = mockPool.query.mock.calls[5][0];
      expect(invalidateCallSql).toContain('timesheet_signatures');
      expect(invalidateCallSql).toContain('status = \'invalidated\'');
      expect(mockPool.query.mock.calls[5][1]).toEqual([TEST_EMPLOYEE_ID, expect.any(Number), expect.any(Number)]);
```

**f)** Il test `'derives the correct month/year...'` (righe 385-430) — sostituire il blocco mock (stessa struttura di (e)):

```js
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_EVENT_ID,
            client_id: TEST_CLIENT_ID,
            user_id: TEST_EMPLOYEE_ID,
            event_date: juneFirstAsPgWouldReturnIt,
            start_time: '08:00:00',
            end_time: '18:00:00',
            status: 'PENDING',
          }],
        })
        .mockResolvedValueOnce({
```

con:

```js
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_EVENT_ID,
            client_id: TEST_CLIENT_ID,
            user_id: TEST_EMPLOYEE_ID,
            event_date: juneFirstAsPgWouldReturnIt,
            start_time: '08:00:00',
            end_time: '18:00:00',
            status: 'PENDING',
          }],
        })
        .mockResolvedValueOnce({}) // SET LOCAL lock_timeout
        .mockResolvedValueOnce({ rows: [] }) // pg_advisory_xact_lock
        .mockResolvedValueOnce({ rows: [] }) // findConflictingCheckin — no conflict
        .mockResolvedValueOnce({
```

e aggiornare l'assertion finale (riga 429):

```js
      // month=6 (June), year=2026 — must NOT resolve to month=5 (May)
      expect(mockPool.query.mock.calls[2][1]).toEqual([TEST_EMPLOYEE_ID, 6, 2026]);
```

con:

```js
      // month=6 (June), year=2026 — must NOT resolve to month=5 (May)
      expect(mockPool.query.mock.calls[5][1]).toEqual([TEST_EMPLOYEE_ID, 6, 2026]);
```

**g)** Il test `'does NOT touch timesheet_signatures when the request is REJECTED...'` (righe 432-468) — NESSUNA modifica (`status: 'REJECTED'`, il nuovo codice è gated su `status === 'APPROVED'` quindi non viene mai raggiunto — questo test dimostra esattamente quel gating).

- [ ] **Step 2: Aggiungere 2 nuovi test per il comportamento di blocco vero e proprio**

Subito dopo il test (g) (prima della chiusura `});` di `describe('PUT /api/v1/events/:id/approve', ...)` a riga 469), aggiungere:

```js

    it('rejects approval with 409 EVENT_DATE_CONFLICT when a checkin already exists for the event date', async () => {
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
        .mockResolvedValueOnce({ rows: [{ id: 'checkin-1', timestamp: todayISO(), type: 'IN' }] }); // conflicting checkin found

      const res = await request(app)
        .put(`/api/v1/events/${TEST_EVENT_ID}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('EVENT_DATE_CONFLICT');
      expect(res.body.details.conflicting_checkin_id).toBe('checkin-1');
    });

    it('does not check for a conflicting checkin when REJECTING (only APPROVED needs the check)', async () => {
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
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_EVENT_ID,
            client_id: TEST_CLIENT_ID,
            user_id: TEST_EMPLOYEE_ID,
            event_date: todayISO(),
            status: 'REJECTED',
          }],
        })
        .mockResolvedValueOnce({ rows: [] }) // logAudit: SAVEPOINT
        .mockResolvedValueOnce({ rows: [] }) // logAudit: INSERT INTO audit_log
        .mockResolvedValueOnce({ rows: [] }); // logAudit: RELEASE SAVEPOINT

      const res = await request(app)
        .put(`/api/v1/events/${TEST_EVENT_ID}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'REJECTED' });

      expect(res.status).toBe(200);
      expect(mockPool.query).toHaveBeenCalledTimes(5);
    });
```

- [ ] **Step 3: Eseguire i test e verificare che falliscano**

Run: `cd backend && NODE_ENV=test npx jest events.test.js -t "approve"`
Expected: FAIL sui 2 nuovi test (nessun blocco implementato) e sui test (c)-(f) (mock desincronizzate rispetto al codice attuale).

- [ ] **Step 4: Implementare la modifica**

In `backend/src/routes/events.js`, tra la riga 212 (chiusura dell'`if (eventRequest.status !== 'PENDING')`) e la riga 214 (`const updateResult = ...`), inserire:

```js
      if (eventRequest.status !== 'PENDING') {
        throw new ValidationError('Event request has already been processed', { code: 'ALREADY_PROCESSED' });
      }

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
      }

      const updateResult = await client.query(
```

- [ ] **Step 5: Eseguire i test e verificare che passino**

Run: `cd backend && NODE_ENV=test npx jest events.test.js`
Expected: PASS, tutti i test nel file.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/events.js backend/src/__tests__/events.test.js
git commit -m "feat: block event approval when a checkin already exists for the event date"
```

---

## Task 7: `GET /api/v1/events/my-requests` — filtri data opzionali

**Files:**
- Modify: `backend/src/middleware/validation.js:673-717`
- Modify: `backend/src/routes/events.js:279-303`
- Modify: `backend/src/__tests__/events.test.js` (aggiungere test)

- [ ] **Step 1: Scrivere i test che falliscono**

In `backend/src/__tests__/events.test.js`, sostituire il blocco `describe('GET /api/v1/events/my-requests', ...)` (righe 181-192) con:

```js
  describe('GET /api/v1/events/my-requests', () => {
    it('should return 200 with array for my requests', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: TEST_EVENT_ID, user_id: TEST_EMPLOYEE_ID, status: 'PENDING' }],
      });

      const res = await request(app).get('/api/v1/events/my-requests');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('accepts date_from/date_to and adds them as ::date filters', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/v1/events/my-requests')
        .query({ date_from: '2026-08-21', date_to: '2026-08-21' });

      expect(res.status).toBe(200);
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('event_date >= $');
      expect(sql).toContain('event_date <= $');
      expect(params).toEqual(expect.arrayContaining(['2026-08-21']));
    });

    it('rejects an invalid date_from format with 400', async () => {
      const res = await request(app)
        .get('/api/v1/events/my-requests')
        .query({ date_from: 'not-a-date' });

      expect(res.status).toBe(400);
    });
  });
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `cd backend && NODE_ENV=test npx jest events.test.js -t "my-requests"`
Expected: FAIL sui 2 nuovi test (nessuna validazione/filtro implementato ancora).

- [ ] **Step 3: Aggiungere lo schema di validazione**

In `backend/src/middleware/validation.js`, subito dopo `GetApprovedEventsSchema` (righe 677-684), aggiungere:

```js
// =====================================================
// EVENT REQUESTS — GET /api/v1/events/my-requests
// =====================================================

const GetMyEventRequestsSchema = z.object({
  query: z.object({
    date_from: z.preprocess(val => val === '' ? undefined : val, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from must be YYYY-MM-DD').optional()),
    date_to: z.preprocess(val => val === '' ? undefined : val, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to must be YYYY-MM-DD').optional()),
  }),
});
```

e aggiungerlo a `module.exports` (dopo `GetApprovedEventsSchema,` alla riga 715):

```js
  GetApprovedEventsSchema,
  GetMyEventRequestsSchema,
  createValidationMiddleware,
```

- [ ] **Step 4: Aggiornare la route**

In `backend/src/routes/events.js`, riga 12, aggiungere `GetMyEventRequestsSchema` all'import:

```js
const { createValidationMiddleware, PostEventRequestSchema, ApproveEventRequestSchema, GetApprovedEventsSchema, GetMyEventRequestsSchema } = require('../middleware/validation');
```

Poi sostituire l'intera route `GET /my-requests` (righe 279-303):

```js
router.get('/my-requests', requireAuth, async (req, res, next) => {
  const userId = req.user.user_id;
  const clientId = req.user.client_id;

  try {
    const result = await pool.query(
      `SELECT id, client_id, user_id, event_date::text AS event_date, start_time, end_time,
              description, status, approved_by, approved_at, rejection_reason, created_at, updated_at
       FROM event_requests
       WHERE user_id = $1::uuid AND client_id = $2::uuid
       ORDER BY created_at DESC LIMIT 100`,
      [userId, clientId]
    );

    logger.info({
      action: 'my_events_viewed',
      user_id: userId,
      count: result.rows.length,
    });

    res.status(200).json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});
```

con:

```js
router.get('/my-requests', requireAuth, createValidationMiddleware(GetMyEventRequestsSchema), async (req, res, next) => {
  const { date_from, date_to } = req.validated.query;
  const userId = req.user.user_id;
  const clientId = req.user.client_id;

  try {
    const params = [userId, clientId];
    let query = `SELECT id, client_id, user_id, event_date::text AS event_date, start_time, end_time,
              description, status, approved_by, approved_at, rejection_reason, created_at, updated_at
       FROM event_requests
       WHERE user_id = $1::uuid AND client_id = $2::uuid`;

    if (date_from) {
      params.push(date_from);
      query += ` AND event_date >= $${params.length}::date`;
    }
    if (date_to) {
      params.push(date_to);
      query += ` AND event_date <= $${params.length}::date`;
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await pool.query(query, params);

    logger.info({
      action: 'my_events_viewed',
      user_id: userId,
      count: result.rows.length,
    });

    res.status(200).json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 5: Eseguire i test e verificare che passino**

Run: `cd backend && NODE_ENV=test npx jest events.test.js`
Expected: PASS, tutti i test nel file.

- [ ] **Step 6: Commit**

```bash
git add backend/src/middleware/validation.js backend/src/routes/events.js backend/src/__tests__/events.test.js
git commit -m "feat: add optional date_from/date_to filters to GET /events/my-requests"
```

---

## Task 8: Test di concorrenza reale (advisory lock)

**Files:**
- Create: `backend/src/__tests__/eventConflict-lock-race.test.js` (real-DB)

- [ ] **Step 1: Scrivere il test**

Creare `backend/src/__tests__/eventConflict-lock-race.test.js`:

```js
'use strict';

const { Pool } = require('pg');
const { lockEventConflictScope } = require('../utils/eventConflict');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'badge_system_test',
};

describe('lockEventConflictScope — Postgres advisory lock serialization', () => {
  jest.setTimeout(15000);

  let pool;
  let dbAvailable = false;

  beforeAll(async () => {
    pool = new Pool(dbConfig);
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[eventConflict-lock-race.test] Skipping — could not connect: ${err.message}`);
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('blocks a second transaction from acquiring the same (client, employee, date) lock until the first commits — proves the mutual exclusion feature is race-free, not just sequentially correct', async () => {
    if (!dbAvailable) return;
    const scope = { clientId: 'race-test-client', employeeId: 'race-test-employee', date: '2026-09-01' };

    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      await clientA.query('BEGIN');
      await lockEventConflictScope(clientA, scope); // acquires immediately, lock free

      await clientB.query('BEGIN');
      let bResolved = false;
      const bLockPromise = lockEventConflictScope(clientB, scope).then(() => { bResolved = true; });

      // Give B a real chance to finish if (incorrectly) not blocked.
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(bResolved).toBe(false); // B must still be waiting — proves serialization

      await clientA.query('COMMIT'); // releases A's advisory lock
      await bLockPromise; // B's acquisition now completes
      expect(bResolved).toBe(true);

      await clientB.query('COMMIT');
    } finally {
      clientA.release();
      clientB.release();
    }
  });

  it('different (employee, date) scopes never block each other', async () => {
    if (!dbAvailable) return;
    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      await clientA.query('BEGIN');
      await lockEventConflictScope(clientA, { clientId: 'c1', employeeId: 'e1', date: '2026-09-01' });

      await clientB.query('BEGIN');
      await expect(
        lockEventConflictScope(clientB, { clientId: 'c1', employeeId: 'e2', date: '2026-09-01' })
      ).resolves.toBeUndefined(); // different employeeId → different lock key, must not block

      await clientA.query('COMMIT');
      await clientB.query('COMMIT');
    } finally {
      clientA.release();
      clientB.release();
    }
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che passi**

Run: `cd backend && NODE_ENV=test npx jest eventConflict-lock-race.test.js`
Expected: PASS, entrambi i test (`lockEventConflictScope` è già implementata dal Task 2 — questo test verifica la garanzia di atomicità che gli altri test, sequenziali, non possono verificare).

Se il primo test fallisce con `bResolved` già `true` dopo 300ms, la garanzia di atomicità NON è rispettata — indagare prima di proseguire, non ignorare il fallimento.

- [ ] **Step 3: Commit**

```bash
git add backend/src/__tests__/eventConflict-lock-race.test.js
git commit -m "test: verify advisory lock actually serializes concurrent event/checkin writes"
```

---

## Task 9: Mobile — pre-check in `QRScannerScreen.jsx`

**Files:**
- Modify: `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx`
- Modify: `frontend-mobile/src/__tests__/QRScannerScreen.test.jsx`

- [ ] **Step 1: Aggiornare il mock di `apiClient` e aggiungere un default condiviso**

In `frontend-mobile/src/__tests__/QRScannerScreen.test.jsx`, riga 26-28, sostituire:

```js
jest.mock('../services/apiClient', () => ({
  post: jest.fn(),
}));
```

con:

```js
jest.mock('../services/apiClient', () => ({
  post: jest.fn(),
  get: jest.fn(),
}));
```

Poi, nel primo `beforeEach` del file (righe 124-131), aggiungere una riga per il default "nessun evento oggi" (fail-open per costruzione — nessun test esistente deve vedere un blocco):

```js
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    __resetLatestCameraProps();
    useCameraPermissions.mockReturnValue([{ granted: true, canAskAgain: true }, jest.fn()]);
    Crypto.randomUUID.mockReturnValue('generated-uuid-1234');
    authService.getUser.mockResolvedValue({ employee_id: 'emp-1' });
    apiClient.get.mockResolvedValue({ data: { data: [] } });
  });
```

E nel secondo `beforeEach` (blocco `describe('QRScannerScreen — low-end device animations', ...)`, righe 502-507):

```js
  beforeEach(() => {
    jest.clearAllMocks();
    __resetLatestCameraProps();
    useCameraPermissions.mockReturnValue([{ granted: true, canAskAgain: true }, jest.fn()]);
    authService.getUser.mockResolvedValue({ employee_id: 'emp-1' });
    apiClient.get.mockResolvedValue({ data: { data: [] } });
  });
```

- [ ] **Step 2: Scrivere i nuovi test che falliscono**

Aggiungere, in fondo al file (dopo l'ultimo test del primo `describe('QRScannerScreen', ...)`, prima della sua chiusura `});` a riga 499), un nuovo blocco:

```js

  describe('event pre-check', () => {
    test('shows a loading spinner while the pre-check request is in flight, not the camera', async () => {
      let resolveGet;
      apiClient.get.mockReturnValue(new Promise((resolve) => { resolveGet = resolve; }));

      const { queryByTestId } = await renderScreen();

      expect(queryByTestId('camera-view')).toBeNull();

      await act(async () => { resolveGet({ data: { data: [] } }); });
    });

    test('blocks the camera and shows event details when a PENDING event exists for today', async () => {
      apiClient.get.mockResolvedValue({
        data: { data: [{ id: 'evt-1', status: 'PENDING', description: 'Corso di formazione', start_time: '08:00:00', end_time: '18:00:00' }] },
      });

      const { queryByTestId, findByText } = await renderScreen();

      await findByText(/Corso di formazione/);
      expect(queryByTestId('camera-view')).toBeNull();
    });

    test('blocks the camera when an APPROVED event exists for today', async () => {
      apiClient.get.mockResolvedValue({
        data: { data: [{ id: 'evt-1', status: 'APPROVED', description: 'Congresso a Torino', start_time: '08:00:00', end_time: '18:00:00' }] },
      });

      const { queryByTestId, findByText } = await renderScreen();

      await findByText(/Congresso a Torino/);
      expect(queryByTestId('camera-view')).toBeNull();
    });

    test('does not block when the only event for today is REJECTED', async () => {
      apiClient.get.mockResolvedValue({
        data: { data: [{ id: 'evt-1', status: 'REJECTED', description: 'Corso', start_time: '08:00:00', end_time: '18:00:00' }] },
      });

      const { findByTestId } = await renderScreen();

      await findByTestId('camera-view');
    });

    test('fail-open: opens the camera when the pre-check request fails (network error)', async () => {
      apiClient.get.mockRejectedValue(new Error('Network Error'));

      const { findByTestId } = await renderScreen();

      await findByTestId('camera-view');
    });

    test('does not block when no event exists for today (no regression)', async () => {
      apiClient.get.mockResolvedValue({ data: { data: [] } });

      const { findByTestId } = await renderScreen();

      await findByTestId('camera-view');
    });
  });
```

- [ ] **Step 3: Eseguire i test e verificare che falliscano**

Run: `cd frontend-mobile && npx jest src/__tests__/QRScannerScreen.test.jsx -t "event pre-check"`
Expected: FAIL — `apiClient.get` non viene mai chiamato, `<CameraView testID="camera-view">` non ha `testID`, e nessuno stato di blocco esiste ancora.

- [ ] **Step 4: Implementare la modifica in `QRScannerScreen.jsx`**

Tutti gli import necessari esistono già nel file (`apiClient`, `ENDPOINTS`, `LoadingSpinner`, `COLORS` — righe 8, 11, 12, 15) tranne uno. Aggiungere UNA sola riga, subito dopo la riga 11 (`import { ENDPOINTS, OFFLINE_CONFIG, STORAGE_KEYS } from '../../config/endpoints';`):

```js
import { today, toISO } from '../../utils/dateUtils';
```

Nessun altro import va toccato.

Aggiungere lo stato e l'effect subito dopo la dichiarazione di `pendingRetryRef` (dopo la riga 73, prima di `scanLineAnim`):

```js
  const pendingRetryRef = useRef(null);

  // Pre-check: un evento PENDING/APPROVED per oggi blocca lo scan QR (mutua
  // esclusione evento↔check-in). undefined = in corso, null = nessun conflitto,
  // object = evento in conflitto. Fail-open su errore di rete: il controllo
  // lato server in checkins.js resta comunque l'autorità finale.
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

Aggiungere `testID="camera-view"` alla `<CameraView>` esistente (riga 391-395):

```js
      <CameraView
        testID="camera-view"
        style={StyleSheet.absoluteFillObject}
        onBarcodeScanned={handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />
```

Aggiungere i due nuovi rami di rendering, subito dopo il ramo `if (!permission.granted) { ... }` (dopo la riga 387, prima di `return ( <View style={styles.container}> ...`):

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
        <Text style={styles.errorText}>Check-in non disponibile oggi</Text>
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

- [ ] **Step 5: Eseguire i test e verificare che passino**

Run: `cd frontend-mobile && npx jest src/__tests__/QRScannerScreen.test.jsx`
Expected: PASS, tutti i test nel file (i 20 esistenti + i 6 nuovi).

Nota: verificare che `frontend-mobile/src/utils/dateUtils.js` esporti effettivamente `today`/`toISO` con `module.exports` (non `export`) — se il file usa CommonJS come confermato nell'esplorazione, l'`import { today, toISO } from '../../utils/dateUtils'` funziona comunque grazie all'interop di Babel/Metro già in uso nel resto del progetto (stesso pattern di `import { ENDPOINTS, ... } from '../../config/endpoints'`, anch'esso CommonJS).

- [ ] **Step 6: Commit**

```bash
git add frontend-mobile/src/screens/checkin/QRScannerScreen.jsx frontend-mobile/src/__tests__/QRScannerScreen.test.jsx
git commit -m "feat: block QR scan when a PENDING/APPROVED event exists for today (fail-open on network error)"
```

---

## Task 10: Regressione completa su tutte e 3 le suite

**Files:** nessuno (solo verifica)

- [ ] **Step 1: Backend — suite completa**

Run: `cd backend && npm run test`
Expected: tutti i test PASS. Se `migration-035-employee-lifecycle.test.js` o `admin-employeeSync-apply-reactivation-email.test.js` falliscono, ri-eseguire da soli (`npx jest <file>`) per confermare che sono i flake noti da stato condiviso del DB di test, non causati da questo lavoro (vedi note storiche del progetto) — se falliscono anche isolati, indagare come regressione reale.

- [ ] **Step 2: Frontend mobile — suite completa**

Run: `cd frontend-mobile && npm run test`
Expected: tutti i test PASS.

- [ ] **Step 3: Frontend web — suite completa**

Run: `cd frontend-web && npm run test -- --run`
Expected: tutti i test PASS (nessun file di questo pacchetto è stato toccato da questo piano — questa run conferma che non ci sono state rotture indirette, es. tipi/contratti condivisi).

- [ ] **Step 4: Lint su tutti i file modificati (evitare la regressione CI già avvenuta 2 volte in questa sessione)**

Run: `cd backend && npx eslint src/utils/eventConflict.js src/utils/errors.js src/routes/checkins.js src/routes/events.js src/middleware/validation.js src/__tests__/eventConflict.test.js src/__tests__/eventConflict-lock-race.test.js src/__tests__/checkins-event-conflict.test.js src/__tests__/checkins.test.js src/__tests__/events.test.js src/__tests__/errors.test.js --fix`

Run: `cd frontend-mobile && npx eslint src/screens/checkin/QRScannerScreen.jsx src/__tests__/QRScannerScreen.test.jsx --fix`

Expected: nessun errore residuo dopo `--fix`; se `--fix` modifica qualcosa, ri-eseguire i test del file toccato prima di committare.

- [ ] **Step 5: Commit finale (se il lint ha prodotto modifiche)**

```bash
git add -A
git commit -m "chore: lint fixes after event/checkin mutual exclusion implementation"
```

Se non ci sono modifiche da lint, questo step non produce nulla da committare — saltarlo.
