# Grafici Trend Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere alla Web Dashboard (`frontend-web`) un grafico di trend giornaliero (ultimi 30 giorni) con 4 metriche — presenze, ore lavorate, ore straordinarie, tasso di assenteismo — usando la libreria `recharts` già installata ma mai utilizzata.

**Architecture:** Nuovo endpoint backend `GET /api/v1/presences/trend` (aggiunto a `presences.js` esistente) che calcola le 4 metriche per ciascuno degli ultimi 30 giorni fissi, rispettando lo scope RBAC già in uso (manager → propria sede, admin/viewer → tutte le sedi o sede filtrata, employee → 403). La logica di aggregazione pura (nessuna query DB) vive in un nuovo file testabile in isolamento, seguendo il pattern già stabilito da `hours.js`. Sul frontend, un hook dedicato fa una singola chiamata e alimenta un `LineChart` principale (presenze) + 3 mini-grafici (ore lavorate, straordinarie, assenteismo) sotto le KPI Card esistenti.

**Tech Stack:** Express + Zod (backend, pattern esistente `presences.js`/`checkins.js`), `recharts` 2.10 (frontend, già in `package.json`), React + MUI + Tailwind (pattern esistente `KpiCards.jsx`), Jest (backend test), Vitest + Testing Library (frontend test).

---

## Decisioni chiave (da grilling)

| Area | Decisione |
|---|---|
| Metriche | Presenze giornaliere, ore lavorate totali, ore straordinarie, tasso di assenteismo (%) |
| Assenteismo — formula | Dipendenti in ferie approvate o malattia attiva quel giorno / totale dipendenti attivi (ruolo `employee`) nello scope |
| Granularità | Giornaliera, finestra fissa ultimi 30 giorni (oggi incluso) |
| Filtro date Dashboard | **Ignorato** — il trend è sempre "ultimi 30 giorni", indipendente da `date_from`/`date_to` del FilterBar |
| Scope RBAC (sede) | Rispetta i filtri già attivi: manager → propria sede (auto), admin/viewer → tutte le sedi o sede filtrata da FilterBar |
| Scope RBAC (ruolo) | **Employee bloccato** (403), stessa scelta già fatta per `/presences/summary` (FASE 9) |
| Fonte dati | Nuovo endpoint backend dedicato, non aggregazione client-side |
| Layout | 1 `LineChart` principale (presenze) + 3 mini-card trend (ore lavorate, straordinarie, assenteismo) sotto le KPI Card esistenti |

---

## File Structure

- **Create:** `backend/src/utils/trendStats.js` — funzione pura `buildTrendDays()`, nessuna query DB, testabile in isolamento
- **Create:** `backend/src/__tests__/trendStats.test.js` — unit test della funzione pura
- **Modify:** `backend/src/routes/presences.js` — nuovo handler `GET /trend`
- **Modify:** `backend/src/middleware/validation.js` — nuovo `GetPresencesTrendSchema`
- **Create:** `backend/src/__tests__/presences-trend.test.js` — integration test dell'endpoint (mock pool)
- **Create:** `frontend-web/src/features/dashboard/hooks/useTrendData.js` — hook di fetch
- **Create:** `frontend-web/src/features/dashboard/components/TrendChart.jsx` — `LineChart` principale (presenze)
- **Create:** `frontend-web/src/features/dashboard/components/MiniTrendCard.jsx` — mini-grafico riusabile (ore lavorate / straordinarie / assenteismo)
- **Create:** `frontend-web/src/__tests__/TrendChart.test.jsx` — component test
- **Create:** `frontend-web/src/__tests__/MiniTrendCard.test.jsx` — component test
- **Modify:** `frontend-web/src/features/dashboard/pages/DashboardPage.jsx` — wiring dei nuovi componenti

---

## Task 1: Backend — funzione pura di aggregazione trend

**Files:**
- Create: `backend/src/utils/trendStats.js`
- Test: `backend/src/__tests__/trendStats.test.js`

- [ ] **Step 1: Scrivere il test che fallisce**

```javascript
// backend/src/__tests__/trendStats.test.js
'use strict';

const { buildTrendDays } = require('../utils/trendStats');

describe('buildTrendDays', () => {
  test('produce un bucket per ogni giorno nel range, anche senza dati', () => {
    const days = buildTrendDays({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-03',
      dailyHourEntries: [],
      activeEmployeeIds: ['emp-1', 'emp-2'],
      leaveRows: [],
      illnessRows: [],
    });

    expect(days).toHaveLength(3);
    expect(days.map((d) => d.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    expect(days[0]).toEqual({
      date: '2026-07-01',
      presenze: 0,
      ore_lavorate: 0,
      ore_straordinarie: 0,
      assenteismo_pct: 0,
    });
  });

  test('conta le presenze come dipendenti distinti con almeno un daily entry quel giorno', () => {
    const days = buildTrendDays({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-01',
      dailyHourEntries: [
        { employee_id: 'emp-1', date: '2026-07-01', minutes: 480, presenza_aperta: false },
        { employee_id: 'emp-2', date: '2026-07-01', minutes: 240, presenza_aperta: false },
      ],
      activeEmployeeIds: ['emp-1', 'emp-2'],
      leaveRows: [],
      illnessRows: [],
    });

    expect(days[0].presenze).toBe(2);
    expect(days[0].ore_lavorate).toBe(12); // (480+240)/60
  });

  test('calcola le ore straordinarie oltre le 8 ore giornaliere, sommate su tutti i dipendenti', () => {
    const days = buildTrendDays({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-01',
      dailyHourEntries: [
        { employee_id: 'emp-1', date: '2026-07-01', minutes: 600, presenza_aperta: false }, // 10h → 2h straord.
        { employee_id: 'emp-2', date: '2026-07-01', minutes: 420, presenza_aperta: false }, // 7h → 0h straord.
      ],
      activeEmployeeIds: ['emp-1', 'emp-2'],
      leaveRows: [],
      illnessRows: [],
    });

    expect(days[0].ore_straordinarie).toBe(2);
  });

  test('ignora le presenze aperte (minutes null) nel calcolo ore, ma le conta come presenza', () => {
    const days = buildTrendDays({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-01',
      dailyHourEntries: [
        { employee_id: 'emp-1', date: '2026-07-01', minutes: null, presenza_aperta: true },
      ],
      activeEmployeeIds: ['emp-1'],
      leaveRows: [],
      illnessRows: [],
    });

    expect(days[0].presenze).toBe(1);
    expect(days[0].ore_lavorate).toBe(0);
  });

  test('calcola assenteismo_pct come dipendenti assenti (ferie+malattia) / dipendenti attivi', () => {
    const days = buildTrendDays({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-01',
      dailyHourEntries: [],
      activeEmployeeIds: ['emp-1', 'emp-2', 'emp-3', 'emp-4'],
      leaveRows: [{ user_id: 'emp-1', start_date: '2026-06-30', end_date: '2026-07-02' }],
      illnessRows: [{ employee_id: 'emp-2', start_date: '2026-07-01', end_date: '2026-07-01' }],
    });

    expect(days[0].assenteismo_pct).toBe(50); // 2 assenti su 4 attivi
  });

  test('non conta due volte lo stesso dipendente assente sia per ferie sia per malattia', () => {
    const days = buildTrendDays({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-01',
      dailyHourEntries: [],
      activeEmployeeIds: ['emp-1', 'emp-2'],
      leaveRows: [{ user_id: 'emp-1', start_date: '2026-07-01', end_date: '2026-07-01' }],
      illnessRows: [{ employee_id: 'emp-1', start_date: '2026-07-01', end_date: '2026-07-01' }],
    });

    expect(days[0].assenteismo_pct).toBe(50); // emp-1 conta una sola volta su 2 attivi
  });

  test('assenteismo_pct è 0 quando non ci sono dipendenti attivi (nessuna divisione per zero)', () => {
    const days = buildTrendDays({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-01',
      dailyHourEntries: [],
      activeEmployeeIds: [],
      leaveRows: [],
      illnessRows: [],
    });

    expect(days[0].assenteismo_pct).toBe(0);
  });

  test('un intervallo di ferie/malattia fuori dal giorno corrente non conta come assenza', () => {
    const days = buildTrendDays({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-01',
      dailyHourEntries: [],
      activeEmployeeIds: ['emp-1'],
      leaveRows: [{ user_id: 'emp-1', start_date: '2026-06-20', end_date: '2026-06-25' }],
      illnessRows: [],
    });

    expect(days[0].assenteismo_pct).toBe(0);
  });
});
```

- [ ] **Step 2: Eseguire il test per verificare che fallisca**

Run: `cd backend && npx jest trendStats.test.js`
Expected: FAIL con `Cannot find module '../utils/trendStats'`

- [ ] **Step 3: Implementare la funzione**

```javascript
// backend/src/utils/trendStats.js
'use strict';

/**
 * buildTrendDays()
 *
 * Aggrega dati grezzi (daily hour entries, richieste ferie/malattia) in un
 * bucket per ciascun giorno del range [dateFrom, dateTo] inclusi, per
 * alimentare i grafici trend della Dashboard.
 *
 * Funzione pura: nessuna query DB, tutti i dati sono passati già risolti
 * dal chiamante — testabile in isolamento.
 */

const DAILY_ORDINARY_HOURS = 8;

/**
 * @param {object} params
 * @param {string} params.dateFrom - 'YYYY-MM-DD' incluso
 * @param {string} params.dateTo - 'YYYY-MM-DD' incluso
 * @param {Array<{employee_id: string, date: string, minutes: number|null, presenza_aperta: boolean}>} params.dailyHourEntries
 *   Output di calculateDailyHours() da hours.js
 * @param {Array<string>} params.activeEmployeeIds - id dei dipendenti nello scope (ruolo 'employee')
 * @param {Array<{user_id: string, start_date: string, end_date: string}>} params.leaveRows
 *   Righe leave_requests con status='APPROVED', date già castate a testo ('YYYY-MM-DD')
 * @param {Array<{employee_id: string, start_date: string, end_date: string}>} params.illnessRows
 *   Righe illnesses non cancellate, date già castate a testo ('YYYY-MM-DD')
 * @returns {Array<{date: string, presenze: number, ore_lavorate: number, ore_straordinarie: number, assenteismo_pct: number}>}
 */
function buildTrendDays({ dateFrom, dateTo, dailyHourEntries, activeEmployeeIds, leaveRows, illnessRows }) {
  const from = new Date(`${dateFrom}T00:00:00.000Z`);
  const to = new Date(`${dateTo}T00:00:00.000Z`);
  const dayCount = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;

  const activeCount = activeEmployeeIds.length;
  const days = [];

  for (let i = 0; i < dayCount; i++) {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);

    const entriesForDay = dailyHourEntries.filter((e) => e.date === dateStr);
    const presenzeSet = new Set(entriesForDay.map((e) => e.employee_id));

    let oreLavorate = 0;
    let oreStraordinarie = 0;
    for (const entry of entriesForDay) {
      if (entry.minutes === null) continue;
      const hours = entry.minutes / 60;
      oreLavorate += hours;
      oreStraordinarie += Math.max(hours - DAILY_ORDINARY_HOURS, 0);
    }

    const absentSet = new Set();
    for (const row of leaveRows) {
      if (row.start_date <= dateStr && row.end_date >= dateStr) absentSet.add(row.user_id);
    }
    for (const row of illnessRows) {
      if (row.start_date <= dateStr && row.end_date >= dateStr) absentSet.add(row.employee_id);
    }

    const assenteismoPct = activeCount === 0 ? 0 : Math.round((absentSet.size / activeCount) * 1000) / 10;

    days.push({
      date: dateStr,
      presenze: presenzeSet.size,
      ore_lavorate: Math.round(oreLavorate * 100) / 100,
      ore_straordinarie: Math.round(oreStraordinarie * 100) / 100,
      assenteismo_pct: assenteismoPct,
    });
  }

  return days;
}

module.exports = { buildTrendDays };
```

- [ ] **Step 4: Eseguire il test per verificare che passi**

Run: `cd backend && npx jest trendStats.test.js -v`
Expected: PASS — 8/8 test verdi

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/trendStats.js backend/src/__tests__/trendStats.test.js
git commit -m "feat(backend): aggiungi buildTrendDays per aggregazione trend Dashboard"
```

---

## Task 2: Backend — Zod schema di validazione

**Files:**
- Modify: `backend/src/middleware/validation.js`

- [ ] **Step 1: Aggiungere lo schema**

Individuare la posizione di `GetStatsSchema` (circa riga 158) e aggiungere subito dopo la sua chiusura (`});`):

```javascript
const GetPresencesTrendSchema = z.object({
  query: z.object({
    site_id: z.preprocess(val => val === '' ? undefined : val, z.string().optional()),
  }),
});
```

- [ ] **Step 2: Esportare lo schema**

Nel blocco `module.exports` in fondo al file, aggiungere `GetPresencesTrendSchema,` accanto a `GetPresencesSummarySchema,`.

- [ ] **Step 3: Verificare che il file sia sintatticamente valido**

Run: `cd backend && node -e "require('./src/middleware/validation.js'); console.log('OK')"`
Expected: `OK` (nessun errore di require)

- [ ] **Step 4: Commit**

```bash
git add backend/src/middleware/validation.js
git commit -m "feat(backend): aggiungi GetPresencesTrendSchema"
```

---

## Task 3: Backend — endpoint GET /api/v1/presences/trend

**Files:**
- Modify: `backend/src/routes/presences.js`
- Test: `backend/src/__tests__/presences-trend.test.js`

- [ ] **Step 1: Scrivere il test di integrazione che fallisce**

```javascript
// backend/src/__tests__/presences-trend.test.js
'use strict';

const request = require('supertest');
const express = require('express');

jest.mock('../db/pool');
const { pool } = require('../db/pool');

jest.mock('../middleware/auth', () => ({
  requireAuth: (req, res, next) => next(),
}));

const presencesRouter = require('../routes/presences');

const createApp = (user) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/v1/presences', presencesRouter);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: err.code, message: err.message, statusCode });
  });
  return app;
};

const CLIENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const SITE_ID = '550e8400-e29b-41d4-a716-446655440010';

describe('GET /api/v1/presences/trend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('employee riceve 403 (stessa policy di /summary)', async () => {
    const app = createApp({ client_id: CLIENT_ID, role: 'employee', employee_id: 'emp-1' });
    const res = await request(app).get('/api/v1/presences/trend');

    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('manager senza site_id assegnato riceve 403 fail-closed', async () => {
    const app = createApp({ client_id: CLIENT_ID, role: 'manager', site_id: null });
    const res = await request(app).get('/api/v1/presences/trend');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NO_SITE_ASSIGNED');
  });

  test('admin senza filtro site_id riceve 30 giorni di dati aggregati su tutto il client', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'emp-1' }, { id: 'emp-2' }] }) // active employees
      .mockResolvedValueOnce({ rows: [] }) // checkins
      .mockResolvedValueOnce({ rows: [] }) // leave_requests
      .mockResolvedValueOnce({ rows: [] }); // illnesses

    const app = createApp({ client_id: CLIENT_ID, role: 'admin' });
    const res = await request(app).get('/api/v1/presences/trend');

    expect(res.status).toBe(200);
    expect(res.body.data.days).toHaveLength(30);
    expect(res.body.data.days[0]).toHaveProperty('presenze');
    expect(res.body.data.days[0]).toHaveProperty('ore_lavorate');
    expect(res.body.data.days[0]).toHaveProperty('ore_straordinarie');
    expect(res.body.data.days[0]).toHaveProperty('assenteismo_pct');
  });

  test('manager riceve dati scoped alla propria sede (query employees filtrata per assigned_sites)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'emp-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const app = createApp({ client_id: CLIENT_ID, role: 'manager', site_id: SITE_ID });
    const res = await request(app).get('/api/v1/presences/trend');

    expect(res.status).toBe(200);
    const [employeesQuery, employeesParams] = pool.query.mock.calls[0];
    expect(employeesQuery).toMatch(/ANY\(assigned_sites\)/);
    expect(employeesParams).toEqual([CLIENT_ID, SITE_ID]);
  });

  test('quando non ci sono dipendenti attivi, salta le query leave/illness (0 righe, nessuna query ANY su array vuoto)', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // active employees: nessuno
      .mockResolvedValueOnce({ rows: [] }); // checkins

    const app = createApp({ client_id: CLIENT_ID, role: 'admin' });
    const res = await request(app).get('/api/v1/presences/trend');

    expect(res.status).toBe(200);
    expect(pool.query).toHaveBeenCalledTimes(2); // solo employees + checkins, non leave/illness
    expect(res.body.data.days[0].assenteismo_pct).toBe(0);
  });
});
```

- [ ] **Step 2: Eseguire il test per verificare che fallisca**

Run: `cd backend && npx jest presences-trend.test.js`
Expected: FAIL — la route `/trend` non esiste ancora (404 invece di 403/200)

- [ ] **Step 3: Implementare l'endpoint**

In `backend/src/routes/presences.js`, aggiungere in cima al file (dopo gli import esistenti):

```javascript
const { createValidationMiddleware, GetPresencesSummarySchema, GetPresencesTrendSchema } = require('../middleware/validation');
const { calculateDailyHours, aggregateMonthly, toUtcDateString } = require('../utils/hours');
const { resolveSiteId } = require('../utils/resolvers');
const { buildTrendDays } = require('../utils/trendStats');
```

(sostituendo la riga `const { createValidationMiddleware, GetPresencesSummarySchema } = require('../middleware/validation');` e `const { calculateDailyHours, aggregateMonthly } = require('../utils/hours');` già presenti)

Poi aggiungere, subito prima di `module.exports = router;`:

```javascript
// =====================================================
// GET /api/presences/trend — ultimi 30 giorni, 4 metriche aggregate
// =====================================================

router.get('/trend', requireAuth, createValidationMiddleware(GetPresencesTrendSchema), async (req, res, next) => {
  const { site_id } = req.validated.query;
  const { client_id, role, site_id: managerSiteId } = req.user;

  if (role === 'employee') {
    return next(new ForbiddenError('Employees cannot access trend charts', 'FORBIDDEN_ROLE'));
  }

  try {
    let resolvedSiteId;
    if (role === 'manager') {
      if (!managerSiteId) {
        return next(new ForbiddenError('Manager has no assigned site', 'NO_SITE_ASSIGNED'));
      }
      resolvedSiteId = managerSiteId;
    } else if (site_id) {
      resolvedSiteId = await resolveSiteId(site_id, client_id);
    }

    const today = new Date();
    const dateTo = toUtcDateString(today);
    const fromDate = new Date(today);
    fromDate.setUTCDate(fromDate.getUTCDate() - 29);
    const dateFrom = toUtcDateString(fromDate);

    // Dipendenti attivi nello scope (solo ruolo 'employee', mai manager/admin/viewer)
    const employeesQuery = resolvedSiteId
      ? `SELECT id FROM employees WHERE client_id = $1::uuid AND role = 'employee' AND $2::uuid = ANY(assigned_sites)`
      : `SELECT id FROM employees WHERE client_id = $1::uuid AND role = 'employee'`;
    const employeesParams = resolvedSiteId ? [client_id, resolvedSiteId] : [client_id];
    const employeesResult = await pool.query(employeesQuery, employeesParams);
    const activeEmployeeIds = employeesResult.rows.map((r) => r.id);

    // Check-ins nel range, scoped per client + sede opzionale
    const checkinsParams = [client_id, `${dateFrom}T00:00:00.000Z`, `${dateTo}T23:59:59.999Z`];
    let siteFilter = '';
    if (resolvedSiteId) {
      checkinsParams.push(resolvedSiteId);
      siteFilter = `AND site_id = $${checkinsParams.length}::uuid`;
    }
    const checkinsResult = await pool.query(
      `SELECT employee_id, timestamp, type FROM checkins
       WHERE client_id = $1::uuid AND timestamp >= $2 AND timestamp <= $3 ${siteFilter}
       ORDER BY employee_id, timestamp ASC`,
      checkinsParams
    );
    const dailyHourEntries = calculateDailyHours(checkinsResult.rows);

    // Ferie approvate e malattie attive nel range, scoped ai dipendenti attivi.
    // NOTA: start_date/end_date castati a ::text — node-pg interpreta DATE come
    // mezzanotte locale del server, che poi shifterebbe di un giorno in JSON
    // (vedi PROJECT_DECISIONS.md Session 55 per il bug reale già trovato).
    let leaveRows = [];
    let illnessRows = [];
    if (activeEmployeeIds.length > 0) {
      const leaveResult = await pool.query(
        `SELECT user_id, start_date::text AS start_date, end_date::text AS end_date
         FROM leave_requests
         WHERE client_id = $1::uuid AND status = 'APPROVED'
           AND start_date <= $3::date AND end_date >= $2::date
           AND user_id = ANY($4::uuid[])`,
        [client_id, dateFrom, dateTo, activeEmployeeIds]
      );
      leaveRows = leaveResult.rows;

      const illnessResult = await pool.query(
        `SELECT employee_id, start_date::text AS start_date, end_date::text AS end_date
         FROM illnesses
         WHERE client_id = $1::uuid AND cancelled_at IS NULL
           AND start_date <= $3::date AND end_date >= $2::date
           AND employee_id = ANY($4::uuid[])`,
        [client_id, dateFrom, dateTo, activeEmployeeIds]
      );
      illnessRows = illnessResult.rows;
    }

    const days = buildTrendDays({
      dateFrom,
      dateTo,
      dailyHourEntries,
      activeEmployeeIds,
      leaveRows,
      illnessRows,
    });

    res.json({ data: { date_from: dateFrom, date_to: dateTo, days } });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Eseguire il test per verificare che passi**

Run: `cd backend && npx jest presences-trend.test.js -v`
Expected: PASS — 5/5 test verdi

- [ ] **Step 5: Eseguire l'intera suite backend per verificare l'assenza di regressioni**

Run: `cd backend && npm test`
Expected: PASS — tutti i test verdi (nessuna regressione su `presences.js`)

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/presences.js backend/src/__tests__/presences-trend.test.js
git commit -m "feat(backend): endpoint GET /api/v1/presences/trend per grafici Dashboard"
```

---

## Task 4: Frontend — hook di fetch

**Files:**
- Create: `frontend-web/src/features/dashboard/hooks/useTrendData.js`

- [ ] **Step 1: Implementare l'hook**

```javascript
// frontend-web/src/features/dashboard/hooks/useTrendData.js
/**
 * Custom Hook: useTrendData
 * Fetches the 30-day trend data for the Dashboard charts (presenze,
 * ore lavorate, ore straordinarie, assenteismo). Ignores date_from/date_to —
 * il backend calcola sempre gli ultimi 30 giorni fissi.
 */

import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../../services/apiClient';

export const useTrendData = (siteId) => {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTrend = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = siteId ? { site_id: siteId } : {};
      const response = await apiClient.get('/api/v1/presences/trend', { params });
      setDays(response.data.data?.days || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch trend data');
      setDays([]);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchTrend();
  }, [fetchTrend]);

  return { days, loading, error, refetch: fetchTrend };
};
```

- [ ] **Step 2: Verificare che il file sia sintatticamente valido**

Run: `cd frontend-web && node -e "require('@babel/core')" 2>/dev/null; npx vite build --mode development 2>&1 | tail -20`
Expected: build completa senza errori di import/sintassi (il file non è ancora usato da nessuno, ma deve essere valido)

- [ ] **Step 3: Commit**

```bash
git add frontend-web/src/features/dashboard/hooks/useTrendData.js
git commit -m "feat(frontend): hook useTrendData per grafici trend Dashboard"
```

---

## Task 5: Frontend — componente TrendChart (grafico principale)

**Files:**
- Create: `frontend-web/src/features/dashboard/components/TrendChart.jsx`
- Test: `frontend-web/src/__tests__/TrendChart.test.jsx`

- [ ] **Step 1: Scrivere il test che fallisce**

```javascript
// frontend-web/src/__tests__/TrendChart.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrendChart from '../features/dashboard/components/TrendChart';

describe('TrendChart', () => {
  it('mostra il titolo e non crasha con dati vuoti', () => {
    render(<TrendChart days={[]} loading={false} error={null} />);
    expect(screen.getByText(/Presenze giornaliere/i)).toBeInTheDocument();
  });

  it('mostra un messaggio di errore quando error è presente', () => {
    render(<TrendChart days={[]} loading={false} error="Errore di rete" />);
    expect(screen.getByText(/Errore di rete/i)).toBeInTheDocument();
  });

  it('mostra un indicatore di caricamento quando loading è true', () => {
    render(<TrendChart days={[]} loading={true} error={null} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Eseguire il test per verificare che fallisca**

Run: `cd frontend-web && npx vitest run TrendChart.test.jsx`
Expected: FAIL — `Cannot find module '../features/dashboard/components/TrendChart'`

- [ ] **Step 3: Implementare il componente**

```jsx
// frontend-web/src/features/dashboard/components/TrendChart.jsx
/**
 * TrendChart — grafico a linea delle presenze giornaliere (ultimi 30 giorni)
 */

import React from 'react';
import { Card, CircularProgress, Alert } from '@mui/material';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts';

const NAVY = '#1E3A5F';

const formatDayLabel = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
};

const TrendChart = ({ days = [], loading = false, error = null }) => {
  const chartData = days.map((d) => ({ ...d, label: formatDayLabel(d.date) }));

  return (
    <Card
      sx={{
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      <p className="text-sm font-dm-sans text-stone-600 mb-4">Presenze giornaliere (ultimi 30 giorni)</p>

      {loading && (
        <div className="flex justify-center py-8">
          <CircularProgress size={28} sx={{ color: NAVY }} />
        </div>
      )}

      {!loading && error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E1DA" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="presenze" stroke={NAVY} strokeWidth={2} dot={false} name="Presenze" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};

export default TrendChart;
```

- [ ] **Step 4: Eseguire il test per verificare che passi**

Run: `cd frontend-web && npx vitest run TrendChart.test.jsx`
Expected: PASS — 3/3 test verdi

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/features/dashboard/components/TrendChart.jsx frontend-web/src/__tests__/TrendChart.test.jsx
git commit -m "feat(frontend): componente TrendChart (grafico presenze giornaliere)"
```

---

## Task 6: Frontend — componente MiniTrendCard (riusabile x3)

**Files:**
- Create: `frontend-web/src/features/dashboard/components/MiniTrendCard.jsx`
- Test: `frontend-web/src/__tests__/MiniTrendCard.test.jsx`

- [ ] **Step 1: Scrivere il test che fallisce**

```javascript
// frontend-web/src/__tests__/MiniTrendCard.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MiniTrendCard from '../features/dashboard/components/MiniTrendCard';

describe('MiniTrendCard', () => {
  const days = [
    { date: '2026-07-01', ore_lavorate: 40, ore_straordinarie: 2, assenteismo_pct: 10 },
    { date: '2026-07-02', ore_lavorate: 42, ore_straordinarie: 3, assenteismo_pct: 5 },
  ];

  it('mostra il titolo passato come prop', () => {
    render(<MiniTrendCard title="Ore Lavorate" dataKey="ore_lavorate" days={days} color="#1E3A5F" suffix="h" />);
    expect(screen.getByText('Ore Lavorate')).toBeInTheDocument();
  });

  it('mostra il valore dell\'ultimo giorno come cifra corrente', () => {
    render(<MiniTrendCard title="Ore Lavorate" dataKey="ore_lavorate" days={days} color="#1E3A5F" suffix="h" />);
    expect(screen.getByText('42h')).toBeInTheDocument();
  });

  it('non crasha con array vuoto', () => {
    render(<MiniTrendCard title="Ore Lavorate" dataKey="ore_lavorate" days={[]} color="#1E3A5F" suffix="h" />);
    expect(screen.getByText('Ore Lavorate')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Eseguire il test per verificare che fallisca**

Run: `cd frontend-web && npx vitest run MiniTrendCard.test.jsx`
Expected: FAIL — `Cannot find module '../features/dashboard/components/MiniTrendCard'`

- [ ] **Step 3: Implementare il componente**

```jsx
// frontend-web/src/features/dashboard/components/MiniTrendCard.jsx
/**
 * MiniTrendCard — mini-grafico a linea riusabile per una singola metrica
 * (ore lavorate, ore straordinarie, assenteismo %), con il valore
 * dell'ultimo giorno come cifra in evidenza.
 */

import React from 'react';
import { Card } from '@mui/material';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

const MiniTrendCard = ({ title, dataKey, days = [], color, suffix = '' }) => {
  const lastValue = days.length > 0 ? days[days.length - 1][dataKey] : 0;

  return (
    <Card
      sx={{
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      <p className="text-sm font-dm-sans text-stone-600 mb-2">{title}</p>
      <p className="text-2xl font-cormorant font-bold mb-2" style={{ color }}>
        {lastValue}{suffix}
      </p>
      {days.length > 0 && (
        <ResponsiveContainer width="100%" height={48}>
          <LineChart data={days}>
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};

export default MiniTrendCard;
```

- [ ] **Step 4: Eseguire il test per verificare che passi**

Run: `cd frontend-web && npx vitest run MiniTrendCard.test.jsx`
Expected: PASS — 3/3 test verdi

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/features/dashboard/components/MiniTrendCard.jsx frontend-web/src/__tests__/MiniTrendCard.test.jsx
git commit -m "feat(frontend): componente MiniTrendCard riusabile per mini-grafici trend"
```

---

## Task 7: Frontend — wiring in DashboardPage

**Files:**
- Modify: `frontend-web/src/features/dashboard/pages/DashboardPage.jsx`
- Modify: `frontend-web/src/features/dashboard/hooks/useTrendData.js` (aggiunta del parametro `enabled`)

- [ ] **Step 1: Aggiungere gli import**

Subito dopo `import KpiCards from '../components/KpiCards';`, aggiungere:

```javascript
import TrendChart from '../components/TrendChart';
import MiniTrendCard from '../components/MiniTrendCard';
import { useTrendData } from '../hooks/useTrendData';
```

- [ ] **Step 2: Chiamare l'hook e nascondere la sezione per il ruolo employee**

Subito dopo la riga `const { data, stats, loading, error, refetch } = usePresences(memoizedFilters);`, aggiungere:

```javascript
  const { days: trendDays, loading: trendLoading, error: trendError } = useTrendData(filters.site_id);
```

- [ ] **Step 3: Renderizzare i grafici tra KpiCards e FilterBar**

Individuare nel JSX il punto in cui viene renderizzato `<KpiCards stats={stats} />` e aggiungere subito dopo (solo se `!isEmployee`, dato che il backend blocca comunque employee con 403 — questo evita la chiamata inutile e l'errore visibile):

```jsx
        {!isEmployee && (
          <>
            <TrendChart days={trendDays} loading={trendLoading} error={trendError} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <MiniTrendCard title="Ore Lavorate" dataKey="ore_lavorate" days={trendDays} color="#1E3A5F" suffix="h" />
              <MiniTrendCard title="Ore Straordinarie" dataKey="ore_straordinarie" days={trendDays} color="#B45309" suffix="h" />
              <MiniTrendCard title="Assenteismo" dataKey="assenteismo_pct" days={trendDays} color="#C0392B" suffix="%" />
            </div>
          </>
        )}
```

- [ ] **Step 4: Anche l'hook non deve chiamare l'API per l'utente employee**

Modificare la chiamata dell'hook al passo 2 perché non parta affatto per `isEmployee` (evita anche il costo della richiesta HTTP che riceverebbe comunque 403):

```javascript
  const { days: trendDays, loading: trendLoading, error: trendError } = useTrendData(isEmployee ? null : filters.site_id);
```

E in `useTrendData.js` (Task 4), la fetch deve essere saltata quando non c'è motivo di chiamarla per un employee. Poiché il criterio esatto ("è employee") appartiene a `DashboardPage`, non all'hook, aggiungere invece un parametro esplicito `enabled`:

Modificare `frontend-web/src/features/dashboard/hooks/useTrendData.js`:

```javascript
export const useTrendData = (siteId, enabled = true) => {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTrend = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      const params = siteId ? { site_id: siteId } : {};
      const response = await apiClient.get('/api/v1/presences/trend', { params });
      setDays(response.data.data?.days || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch trend data');
      setDays([]);
    } finally {
      setLoading(false);
    }
  }, [siteId, enabled]);

  useEffect(() => {
    fetchTrend();
  }, [fetchTrend]);

  return { days, loading, error, refetch: fetchTrend };
};
```

E in `DashboardPage.jsx`, la chiamata dell'hook diventa:

```javascript
  const { days: trendDays, loading: trendLoading, error: trendError } = useTrendData(filters.site_id, !isEmployee);
```

- [ ] **Step 5: Eseguire la suite frontend per verificare l'assenza di regressioni**

Run: `cd frontend-web && npx vitest run`
Expected: PASS — tutti i test verdi (incluso `TrendChart.test.jsx`/`MiniTrendCard.test.jsx`)

- [ ] **Step 6: Build di verifica**

Run: `cd frontend-web && npm run build`
Expected: build completata senza errori

- [ ] **Step 7: Commit**

```bash
git add frontend-web/src/features/dashboard/pages/DashboardPage.jsx frontend-web/src/features/dashboard/hooks/useTrendData.js
git commit -m "feat(frontend): integra grafici trend nella Dashboard"
```

---

## Verifica finale end-to-end (manuale)

1. **Backend**: `cd backend && npm test` → tutti i test verdi (inclusi i nuovi `trendStats.test.js` e `presences-trend.test.js`).
2. **Frontend**: `cd frontend-web && npx vitest run && npm run build` → tutti i test verdi, build pulita.
3. **Test manuale locale** (`npm run dev` in `frontend-web`, backend locale attivo):
   - Login come **admin** → la Dashboard mostra il grafico principale + 3 mini-card, con dati reali per gli ultimi 30 giorni.
   - Login come **manager** → il grafico mostra solo i dati della propria sede (verificare che i numeri combacino con i check-in reali di quella sede).
   - Login come **employee** → nessun grafico visibile, nessuna chiamata di rete a `/presences/trend` (verificare da DevTools → Network).
   - Filtrare una sede specifica da FilterBar (come admin) → il grafico si aggiorna di conseguenza.
   - Cambiare `date_from`/`date_to` nel FilterBar → il grafico **non cambia** (per design, sempre ultimi 30 giorni fissi) — verificare che questo comportamento non confonda visivamente rispetto a KPI Cards/tabella che invece rispettano quei filtri.
4. **Verifica sicurezza**: provare a chiamare `GET /api/v1/presences/trend?site_id=<sede-di-un-altro-manager>` autenticato come manager → deve ignorare il parametro e restituire sempre solo la propria sede (comportamento già garantito dal codice: `resolvedSiteId = managerSiteId` ignora `site_id` in query per il ruolo manager).

---

## Checklist di sicurezza e casi limite

- [ ] **RBAC fail-closed**: employee riceve sempre 403, manager non può forzare una sede diversa dalla propria passando `site_id` in query.
- [ ] **Nessuna divisione per zero**: `assenteismo_pct` è 0 (non `NaN`/errore) quando `activeEmployeeIds` è vuoto — coperto da test unitario.
- [ ] **Cast `::text` sulle colonne DATE**: `leave_requests.start_date/end_date` e `illnesses.start_date/end_date` sono castate esplicitamente, per evitare il bug di shift di un giorno già documentato in `PROJECT_DECISIONS.md` (Session 55).
- [ ] **Nessuna query con array vuoto**: quando `activeEmployeeIds.length === 0`, le query su `leave_requests`/`illnesses` vengono saltate del tutto (evita `ANY('{}'::uuid[])` che pur essendo valido in Postgres è comunque una query sprecata).
- [ ] **Nessuna chiamata di rete per il ruolo employee**: verificato sia lato UI (sezione nascosta) sia lato hook (`enabled=false`), a difesa in profondità anche se il backend blocca comunque con 403.

---

Per riprendere se la sessione si interrompe: leggi questo piano + `git log --oneline -10` per capire a quale task ci si è fermati (ogni task termina con un commit dedicato).
