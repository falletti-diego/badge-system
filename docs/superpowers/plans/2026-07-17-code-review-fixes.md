# Code Review Fixes & Tech-Debt Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere i 3 bug nuovi trovati dalla code review del 17/07/2026 (timer `navigate` orfani, tab Saldi con ID troncati, catch silenzioso sul logout) e consolidare il tech-debt già tracciato: copy durata trial, percorso superadmin su `PUT /admin/sites/:id`, helper `resolveTenantScope`, codici errore uniformi, codice morto `axiosInterceptor`, cron di cleanup demo in produzione, servizio Postgres in CI.

**Architecture:** Fix puntuali su codice esistente, nessuna nuova feature. Backend Express + pg (query parametrizzate), frontend React 18 + MUI + vitest. I task 1-10 sono modifiche al repo (branch di lavoro in worktree isolato); il task 11 è un'operazione di produzione (cron su EC2) che **richiede autorizzazione esplicita dell'utente al momento dell'esecuzione**; il task 12 modifica la pipeline CI.

**Tech Stack:** Node.js 20 / Express 4 / pg / Zod / Jest (backend, test su Postgres reale locale) — React 18 / MUI 5 / vitest + React Testing Library (frontend) — GitHub Actions (CI) — EC2/Docker (produzione).

**Decisioni prese in grilling (non rimetterle in discussione):**
- Durata trial: **resta 7 giorni** — si corregge il copy frontend, non il backend.
- Scheduler cleanup: **cron sull'host EC2** (non EventBridge).
- Esclusi da questo piano: uscita SES da Sandbox (richiede DNS dell'utente), S.26 GPS (piano dedicato esistente), migrazione httpOnly cookie (C.5.3), screenshot reali per `/prova-demo` (servono immagini non ancora prodotte).

**Setup worktree (prima del Task 1):**

```bash
cd "/Users/diegofalletti/DATAXIOM/Dataxiom – Analisi & BI/badge"
git worktree add .claude/worktrees/code-review-fixes -b worktree-code-review-fixes main
cp backend/.env.test .claude/worktrees/code-review-fixes/backend/.env.test
cp backend/.env .claude/worktrees/code-review-fixes/backend/.env 2>/dev/null || true
cp frontend-web/.env .claude/worktrees/code-review-fixes/frontend-web/.env 2>/dev/null || true
cd .claude/worktrees/code-review-fixes/backend && npm ci
cd ../frontend-web && npm install
```

> ⚠️ I file `.env*` sono gitignored: un worktree nuovo non li eredita — copiarli è obbligatorio o 31+ test backend falliscono (lezione Session 71).

---

### Task 1: Timer `navigate` orfani in EmployeeIllnessReport e ManagerIllnessReport

Bug: `setTimeout(() => navigate('/dashboard'), 2000)` mai ripulito — un utente che invia la segnalazione e naviga altrove entro 2s viene forzatamente riportato a `/dashboard` da un timer orfano. Stessa classe di bug già fixata in `TryDemoPage.jsx:86` (Session 67) — replicare esattamente quel pattern: timer in `useRef`, `clearTimeout` nel cleanup di `useEffect`.

**Files:**
- Modify: `frontend-web/src/features/illness/pages/EmployeeIllnessReport.jsx`
- Modify: `frontend-web/src/features/illness/pages/ManagerIllnessReport.jsx` (struttura identica, stessa riga 35)
- Create: `frontend-web/src/features/illness/pages/EmployeeIllnessReport.test.jsx`

- [ ] **Step 1: Scrivi il test che fallisce**

I due file pagina NON hanno test esistenti. Crea `EmployeeIllnessReport.test.jsx` seguendo le convenzioni di mock di `frontend-web/src/features/leave/pages/ManagerLeaveRequest.test.jsx` (mock del hook, `BrowserRouter`, `mockNavigate`):

```jsx
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { EmployeeIllnessReport } from './EmployeeIllnessReport';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockReportIllness = vi.fn(async () => ({ id: 'ill-1' }));
vi.mock('../hooks/useIllness', () => ({
  useIllness: () => ({
    reportIllness: mockReportIllness,
    loading: false,
    error: null,
  }),
}));

const renderPage = () => render(<BrowserRouter><EmployeeIllnessReport /></BrowserRouter>);

describe('EmployeeIllnessReport — redirect timer cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does NOT navigate to /dashboard if the component unmounts before the 2s redirect fires', async () => {
    const { unmount } = renderPage();

    // Compila il minimo necessario e invia. NOTA per l'implementer: ispeziona il
    // JSX reale del form per i selettori esatti (date picker + submit button);
    // se compilare le date via UI è fragile con fake timers, in alternativa
    // chiama direttamente il submit del form via fireEvent.submit sul <form>.
    // L'essenza del test è: dopo un submit riuscito, unmount, avanza i timer,
    // navigate NON deve essere stato chiamato.
    const form = document.querySelector('form');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.submit(form);
    await waitFor(() => expect(mockReportIllness).toHaveBeenCalled());

    unmount();
    vi.advanceTimersByTime(3000);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('DOES navigate to /dashboard after 2s when the component stays mounted', async () => {
    renderPage();
    const form = document.querySelector('form');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.submit(form);
    await waitFor(() => expect(mockReportIllness).toHaveBeenCalled());

    vi.advanceTimersByTime(2500);

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });
});
```

- [ ] **Step 2: Esegui il test — deve fallire (primo caso rosso)**

Run: `cd frontend-web && npx vitest run src/features/illness/pages/EmployeeIllnessReport.test.jsx`
Expected: FAIL sul primo caso ("does NOT navigate...") — `mockNavigate` viene chiamato perché il timer non è ripulito. Il secondo caso passa.

- [ ] **Step 3: Fix in EmployeeIllnessReport.jsx**

Modifica gli import e il componente (diff rispetto al codice attuale):

```jsx
// riga 1 — aggiungi useRef, useEffect:
import React, { useState, useRef, useEffect } from 'react';
```

Dentro il componente, dopo `const [success, setSuccess] = useState(false);`:

```jsx
  const redirectTimeoutRef = useRef(null);

  // Il timer di redirect post-successo non deve sopravvivere allo smontaggio:
  // senza cleanup, un utente che naviga altrove entro 2s viene riportato
  // forzatamente a /dashboard da un timer orfano (stesso pattern di
  // TryDemoPage.jsx, code-review 2026-07-17).
  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
    };
  }, []);
```

E in `handleSubmit`, sostituisci la riga 35:

```jsx
      // PRIMA:  setTimeout(() => navigate('/dashboard'), 2000);
      redirectTimeoutRef.current = setTimeout(() => navigate('/dashboard'), 2000);
```

- [ ] **Step 4: Esegui il test — deve passare**

Run: `npx vitest run src/features/illness/pages/EmployeeIllnessReport.test.jsx`
Expected: PASS 2/2

- [ ] **Step 5: Applica lo stesso identico fix a ManagerIllnessReport.jsx**

Il file ha la stessa struttura (verifica con `grep -n setTimeout` che la riga sia la 35). Stesso diff: import `useRef, useEffect`, ref + cleanup effect, assegnazione del timer al ref. Non serve un secondo file di test fotocopia: la logica è identica e il pattern è ora coperto — ma verifica a mano con `grep -n 'clearTimeout' ManagerIllnessReport.jsx` che il cleanup ci sia.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/features/illness/pages/
git commit -m "fix(illness): clear orphan redirect timer on unmount in illness report pages"
```

---

### Task 2: Cleanup dei timer minori (leave pages + CorrectionsPage)

Aggiornamenti di stato dopo unmount: `setTimeout(() => loadRequests(), 500)` in `EmployeeLeaveRequest.jsx:156` e `ManagerLeaveRequest.jsx` (stesso pattern), `setTimeout(() => setSuccessMsg(null), 4000)` in `CorrectionsPage.jsx:126`. Nessun impatto utente (solo warning React), quindi niente TDD dedicato — fix meccanico + suite di regressione.

**Files:**
- Modify: `frontend-web/src/features/leave/pages/EmployeeLeaveRequest.jsx`
- Modify: `frontend-web/src/features/leave/pages/ManagerLeaveRequest.jsx`
- Modify: `frontend-web/src/features/corrections/pages/CorrectionsPage.jsx`

- [ ] **Step 1: EmployeeLeaveRequest.jsx**

Aggiungi `useRef` all'import React (già presente `useState, useEffect, useMemo`). Dopo gli altri `useState`:

```jsx
  const reloadTimeoutRef = useRef(null);
```

Nel `useEffect` di mount esistente (quello che chiama `loadRequests(); loadBalance();`) aggiungi il return di cleanup:

```jsx
  useEffect(() => {
    loadRequests();
    loadBalance();
    return () => {
      if (reloadTimeoutRef.current) clearTimeout(reloadTimeoutRef.current);
    };
  }, []);
```

E alla riga ~156 sostituisci:

```jsx
      // PRIMA:  setTimeout(() => { loadRequests(); }, 500);
      reloadTimeoutRef.current = setTimeout(() => {
        loadRequests();
      }, 500);
```

- [ ] **Step 2: ManagerLeaveRequest.jsx — stesso identico diff** (stessa struttura, il `useEffect` di mount chiama `loadRequests(); loadBalance();`).

- [ ] **Step 3: CorrectionsPage.jsx**

Stesso pattern: `useRef` nell'import, `successMsgTimeoutRef` come ref, e un effect di solo-cleanup se non esiste già un mount-effect adatto:

```jsx
  const successMsgTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (successMsgTimeoutRef.current) clearTimeout(successMsgTimeoutRef.current);
    };
  }, []);
```

E alla riga ~126:

```jsx
      // PRIMA:  setTimeout(() => setSuccessMsg(null), 4000);
      successMsgTimeoutRef.current = setTimeout(() => setSuccessMsg(null), 4000);
```

Nota: se il messaggio può essere mostrato più volte di seguito, ripulisci il timer precedente prima di riassegnarlo:

```jsx
      if (successMsgTimeoutRef.current) clearTimeout(successMsgTimeoutRef.current);
      successMsgTimeoutRef.current = setTimeout(() => setSuccessMsg(null), 4000);
```

- [ ] **Step 4: Regressione**

Run: `cd frontend-web && npx vitest run src/features/leave src/features/corrections 2>&1 | tail -5`
Expected: tutti i test esistenti verdi (nessuna assertion tocca questi timer).

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/features/leave/pages/ frontend-web/src/features/corrections/pages/CorrectionsPage.jsx
git commit -m "fix(frontend): clear minor state-update timers on unmount (leave, corrections)"
```

---

### Task 3: Catch silenzioso sul logout in NavBar

`NavBar.jsx:39`: `catch (_) {}` inghiotte qualunque fallimento della chiamata di logout (es. revoca token server-side fallita). Il comportamento (proseguire comunque verso `/login`) è corretto — va solo loggato.

**Files:**
- Modify: `frontend-web/src/components/NavBar.jsx`

- [ ] **Step 1: Aggiungi l'import del logger** (il file NON lo importa oggi):

```jsx
import logger from '../utils/logger';
```

- [ ] **Step 2: Sostituisci il catch vuoto** (righe 36-41):

```jsx
  const handleLogout = async () => {
    handleClose();
    try {
      await authService.logout();
    } catch (err) {
      // Best-effort: la revoca server-side può fallire (rete, token già scaduto)
      // ma la sessione locale va chiusa comunque — logghiamo e proseguiamo.
      logger.warn('NavBar', 'server-side logout failed, proceeding to /login', err);
    }
    navigate('/login');
  };
```

- [ ] **Step 3: Regressione + lint**

Run: `npx vitest run 2>&1 | tail -3 && npx eslint src/components/NavBar.jsx`
Expected: suite verde, lint pulito (attenzione: la variabile `err` ora è usata, nessun warning unused).

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/components/NavBar.jsx
git commit -m "fix(navbar): log server-side logout failures instead of swallowing them"
```

---

### Task 4: Tab Saldi — il backend restituisce anche il nome dipendente

Bug: `GET /api/v1/leave/admin/saldi` restituisce solo `user_id`; il frontend ricava il nome da `allRequests.find(...)` → un dipendente con saldo ma zero richieste ferie appare come "Employee 550e8400". Fix alla radice: JOIN con `employees` nel backend.

**Files:**
- Modify: `backend/src/routes/leaves.js` (route `/admin/saldi`, righe ~461-502)
- Create: `backend/src/__tests__/admin-saldi-names.test.js`

- [ ] **Step 1: Scrivi il test che fallisce**

Test di integrazione su Postgres reale, seguendo le convenzioni di `backend/src/__tests__/admin-clients-scoping.test.js` (setup/teardown con `pool`, dati con UUID generati, cleanup in `afterAll`). Contenuto:

```javascript
'use strict';
/**
 * GET /api/v1/leave/admin/saldi — il payload deve includere il nome del
 * dipendente (JOIN employees), anche per dipendenti senza alcuna richiesta
 * ferie (bug code-review 2026-07-17: il frontend mostrava "Employee 550e8400").
 * Test su Postgres reale, nessun mock del DB.
 */
const request = require('supertest');
const { randomUUID } = require('crypto');
const app = require('../app');
const { pool } = require('../db/pool');

describe('GET /api/v1/leave/admin/saldi — employee names', () => {
  const clientId = randomUUID();
  const empId = randomUUID();

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO clients (id, name, email, plan) VALUES ($1, 'Saldi Test Client', $2, 'basic')`,
      [clientId, `saldi-test-${Date.now()}@example.com`]
    );
    await pool.query(
      `INSERT INTO employees (id, client_id, email, name, role)
       VALUES ($1, $2, $3, 'Mario Saldi Test', 'employee')`,
      [empId, clientId, `mario-saldi-${Date.now()}@example.com`]
    );
    // Saldo SENZA alcuna richiesta ferie associata — il caso che il frontend rompeva
    await pool.query(
      `INSERT INTO leave_saldi (user_id, client_id, leave_type, year, total_days, used_days, remaining_days)
       VALUES ($1, $2, 'FERIE_1', EXTRACT(YEAR FROM now())::int, 20, 5, 15)`,
      [empId, clientId]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM leave_saldi WHERE user_id = $1', [empId]);
    await pool.query('DELETE FROM employees WHERE id = $1', [empId]);
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
    await pool.end();
  });

  // NOTA implementer: usa lo stesso meccanismo di autenticazione admin degli
  // altri test di integrazione admin (vedi admin-clients-scoping.test.js per
  // come viene costruito/firmato il token admin di test scoped sul clientId).
  it('includes employee name in the saldi payload, even with zero leave requests', async () => {
    const adminToken = await buildAdminTokenFor(clientId); // helper come nei test scoping
    const res = await request(app)
      .get('/api/v1/leave/admin/saldi')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data[empId]).toBeDefined();
    expect(res.body.data[empId].name).toBe('Mario Saldi Test');
    expect(res.body.data[empId].FERIE_1).toBe(15);
  });
});
```

> ⚠️ `buildAdminTokenFor` non esiste con questo nome: l'implementer DEVE copiare il meccanismo reale di creazione token dai test di scoping esistenti (leggerli prima di scrivere) — non inventarne uno nuovo. Verificare anche i nomi colonna reali di `leave_saldi` con `\d leave_saldi` o leggendo la migration che la crea, prima di fidarsi dell'INSERT qui sopra.

- [ ] **Step 2: Esegui — deve fallire**

Run: `cd backend && NODE_ENV=test npx jest admin-saldi-names --forceExit`
Expected: FAIL su `res.body.data[empId].name` → `undefined`

- [ ] **Step 3: Modifica la query e la trasformazione in `leaves.js`**

```javascript
    const result = await pool.query(
      `SELECT ls.user_id, ls.leave_type, ls.year, ls.total_days, ls.used_days,
              ls.remaining_days, e.name AS employee_name
       FROM leave_saldi ls
       LEFT JOIN employees e ON e.id = ls.user_id
       WHERE ls.client_id = $1::uuid
       ORDER BY ls.user_id, ls.leave_type, ls.year DESC`,
      [clientId]
    );

    // Transform to nested object: { employee_id: { name, FERIE_1: N, ... } }
    const saldiByEmployee = {};
    result.rows.forEach(row => {
      if (!saldiByEmployee[row.user_id]) {
        saldiByEmployee[row.user_id] = { name: row.employee_name };
      }
      saldiByEmployee[row.user_id][row.leave_type] = row.remaining_days;
    });
```

Nota: la chiave `name` convive con le chiavi `FERIE_*`/`MALATTIA` — il frontend legge colonne fisse, non itera le chiavi, quindi è retrocompatibile (verificato in review).

- [ ] **Step 4: Esegui — deve passare**

Run: `NODE_ENV=test npx jest admin-saldi-names --forceExit`
Expected: PASS

- [ ] **Step 5: Regressione leave backend**

Run: `NODE_ENV=test npx jest leaves --forceExit 2>&1 | tail -5`
Expected: tutti verdi (se un test esistente assertava la shape esatta senza `name`, aggiornalo — è un cambiamento voluto).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/leaves.js backend/src/__tests__/admin-saldi-names.test.js
git commit -m "fix(leave): include employee name in admin saldi payload (JOIN employees)"
```

---

### Task 5: Tab Saldi — il frontend usa il nome dal payload

**Files:**
- Modify: `frontend-web/src/features/leave/pages/AdminLeaveManagement.jsx` (righe ~512-515)
- Modify: `frontend-web/src/features/leave/pages/AdminLeaveManagement.test.jsx` (blocco "should display employee saldi", riga ~112)

- [ ] **Step 1: Aggiorna il test esistente** — nel mock di `getEmployeeSaldi` aggiungi `name` alla shape e asserta che venga renderizzato:

```jsx
// nel mock: { 'emp-001': { name: 'Mario Rossi', FERIE_1: 15, ... } }
// nuova assertion nel test 'should display employee saldi':
expect(screen.getByText('Mario Rossi')).toBeInTheDocument();
// e un caso per il fallback: employee con name null → mostra l'ID troncato
```

- [ ] **Step 2: Esegui — deve fallire**

Run: `npx vitest run src/features/leave/pages/AdminLeaveManagement.test.jsx`
Expected: FAIL sulla nuova assertion

- [ ] **Step 3: Fix nel componente** — sostituisci le righe ~512-515:

```jsx
                  {Object.entries(saldi).map(([empId, saldiData]) => {
                    // Il nome ora arriva dal backend (JOIN employees) — il
                    // vecchio lookup su allRequests falliva per dipendenti
                    // senza richieste. Fallback su ID troncato solo se il
                    // dipendente è stato cancellato (LEFT JOIN → name null).
                    const empName = saldiData.name || `Employee ${empId.substring(0, 8)}`;
```

e rimuovi la riga `const request = allRequests.find(...)` non più necessaria.

- [ ] **Step 4: Esegui — deve passare** + regressione file completo.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/features/leave/pages/AdminLeaveManagement.jsx frontend-web/src/features/leave/pages/AdminLeaveManagement.test.jsx
git commit -m "fix(leave): show employee names from saldi payload in admin Saldi tab"
```

---

### Task 6: Copy durata trial — allineare a 7 giorni

Decisione presa: il backend resta a 7 giorni (`DEMO_TENANT_EXPIRY_DAYS = '7 days'`, `demo.js:61` — NON toccarlo). Si correggono le 2 stringhe frontend. Sfumatura importante: il micro-copy GDPR di TryDemoPage ("max 14 giorni in tutto") parla della **ritenzione dati** (7 trial + 7 grazia = 14 totali) ed è tecnicamente corretto ma ambiguo — va riformulato, non semplicemente cambiato in 7.

**Files:**
- Modify: `frontend-web/src/pages/DemoExpiredPage.jsx` (riga ~72)
- Modify: `frontend-web/src/pages/TryDemoPage.jsx` (riga ~251)
- Modify: eventuali test che assertano le stringhe (grep prima)

- [ ] **Step 1: Trova le assertion sulle stringhe attuali**

Run: `grep -rn "14 giorni" frontend-web/src --include="*.jsx"`
Expected: le 2 pagine + eventuali test (`DemoExpiredPage.test.jsx`, `TryDemoPage.test.jsx`) — annota quali test toccano il testo.

- [ ] **Step 2: DemoExpiredPage.jsx** — sostituisci il paragrafo:

```jsx
            La prova gratuita del Badge System dura 7 giorni. Puoi iniziare una nuova
            demo in qualsiasi momento — se usi la stessa email, ripartirai da dove avevi
            lasciato.
```

- [ ] **Step 3: TryDemoPage.jsx** — sostituisci il micro-copy GDPR:

```jsx
              La useremo solo per questa demo: 7 giorni di prova, e tutti i dati
              vengono cancellati del tutto entro 14. Niente spam.
```

- [ ] **Step 4: Aggiorna i test trovati allo Step 1** con le nuove stringhe, poi:

Run: `npx vitest run src/pages src/__tests__ 2>&1 | tail -3`
Expected: verdi

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/ frontend-web/src/__tests__/
git commit -m "fix(demo): align trial duration copy to actual 7-day backend expiry"
```

---

### Task 7: `PUT /admin/sites/:id` — percorso superadmin

Oggi la route scopa sempre su `req.user.client_id` → un superadmin (che non ha un tenant "proprio" significativo) non può aggiornare il geofencing di nessuna sede. Applicare lo stesso pattern condizionale già usato dal DELETE nello stesso file (riga ~93).

**Files:**
- Modify: `backend/src/routes/admin/sites.js` (route PUT, righe 121-150)
- Modify: `backend/src/__tests__/admin-sites-scoping.test.js` (aggiungi 2 casi)

- [ ] **Step 1: Scrivi i 2 test che falliscono** in `admin-sites-scoping.test.js`, seguendo le convenzioni già presenti nel file (fixture `makeSite` con `qr_code_content` unico per chiamata — NON hardcodarlo, c'è una UNIQUE constraint):

```javascript
  it('superadmin can update geofence on a site of ANY tenant', async () => {
    // site creato su un tenant qualsiasi; PUT con token superadmin → 200
    // e geofence_enabled aggiornato
  });

  it('admin still CANNOT update geofence on another tenant\'s site (404)', async () => {
    // PUT con token admin di un tenant diverso → 404 SITE_NOT_FOUND
  });
```

(Scrivili completi riusando gli helper di token/fixture del file — l'implementer li ha sotto gli occhi.)

- [ ] **Step 2: Esegui — il primo deve fallire (404 per superadmin), il secondo già passa**

Run: `NODE_ENV=test npx jest admin-sites-scoping --forceExit`

- [ ] **Step 3: Modifica la route PUT:**

```javascript
router.put('/:id', createValidationMiddleware(UpdateSiteGeofenceSchema), async (req, res, next) => {
  const { id } = req.validated.params;
  const { latitude, longitude, geofence_radius_meters, geofence_enabled } = req.validated.body;
  const isSuperadmin = req.user.role === 'superadmin';

  try {
    const params = [latitude ?? null, longitude ?? null, geofence_radius_meters, geofence_enabled, id];
    let where = 'WHERE id = $5::uuid';
    if (!isSuperadmin) {
      params.push(req.user.client_id);
      where += ' AND client_id = $6::uuid';
    }

    const result = await pool.query(
      `UPDATE sites
       SET latitude = $1, longitude = $2,
           geofence_radius_meters = $3, geofence_enabled = $4,
           updated_at = NOW()
       ${where}
       RETURNING id, name, client_id, latitude, longitude, geofence_radius_meters, geofence_enabled`,
      params
    );

    if (result.rows.length === 0) return next(new NotFoundError('Site not found or not in your organization', 'SITE_NOT_FOUND'));

    await logAudit(pool, {
      action: 'admin_update_site_geofence',
      entity: 'site',
      entityId: id,
      // Per un superadmin il tenant rilevante è quello della sede toccata,
      // non il suo — RETURNING client_id serve esattamente a questo.
      clientId: result.rows[0].client_id,
      oldValue: null,
      newValue: { latitude, longitude, geofence_radius_meters, geofence_enabled },
      userId: req.user.user_id,
      // ...resto invariato dal codice esistente
```

(Conserva tutto ciò che segue nel body attuale della route — la modifica è solo WHERE dinamico + `client_id` nel RETURNING + `clientId` dell'audit.)

- [ ] **Step 4: Esegui — entrambi verdi** + regressione file: `NODE_ENV=test npx jest admin-sites --forceExit`

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin/sites.js backend/src/__tests__/admin-sites-scoping.test.js
git commit -m "fix(admin): allow superadmin to update site geofence across tenants"
```

---

### Task 8: Helper `resolveTenantScope` + `client_id` opzionale negli schemi admin

Due backlog item interdipendenti, da fare INSIEME per evitare stati intermedi rotti: (a) il ternario `role === 'superadmin' ? data.client_id : req.user.client_id` è duplicato in `sites.js:21` e `employees.js:50` (+ la variante dell'import); (b) `AdminSiteSchema`/`AdminEmployeeSchema` richiedono `client_id` nel body anche per un admin normale, il cui valore viene ignorato — wart di API. Rendendo `client_id` opzionale, serve una guardia esplicita: un superadmin SENZA `client_id` nel body deve ricevere 400, non un insert con `undefined`.

**Files:**
- Create: `backend/src/utils/tenantScope.js`
- Create: `backend/src/__tests__/tenant-scope.test.js`
- Modify: `backend/src/middleware/validation.js` (righe 431, 443)
- Modify: `backend/src/routes/admin/sites.js` (riga ~21)
- Modify: `backend/src/routes/admin/employees.js` (riga ~50 e route import)
- Modify: `backend/src/__tests__/admin-sites-scoping.test.js`, `backend/src/__tests__/admin-employees-scoping.test.js` (nuovi casi)

- [ ] **Step 1: Scrivi il helper + unit test (TDD)**

`backend/src/utils/tenantScope.js`:

```javascript
'use strict';

const { ValidationError } = require('./errors');

/**
 * Risolve il tenant su cui opera una route admin.
 * - admin: SEMPRE il proprio client_id (qualunque client_id nel body è ignorato)
 * - superadmin: il client_id passato nel body/query — obbligatorio, perché un
 *   superadmin non ha un tenant proprio significativo. Se assente → ValidationError
 *   (fail-closed: mai un insert con client_id undefined).
 *
 * @param {object} user - req.user (deve avere role e client_id)
 * @param {string|undefined} requestedClientId - client_id dal body/query
 * @returns {string} il client_id target
 * @throws {ValidationError} superadmin senza client_id esplicito
 */
function resolveTenantScope(user, requestedClientId) {
  if (user.role !== 'superadmin') return user.client_id;
  if (!requestedClientId) {
    throw new ValidationError('client_id is required for superadmin operations', 'CLIENT_ID_REQUIRED');
  }
  return requestedClientId;
}

module.exports = { resolveTenantScope };
```

Unit test `tenant-scope.test.js` (4 casi: admin ignora il body, admin senza body ok, superadmin col body ok, superadmin senza body → throw). Verifica PRIMA la firma reale di `ValidationError` in `utils/errors.js` (ordine argomenti message/code) e adeguala.

- [ ] **Step 2: Rendi `client_id` opzionale nei 2 schemi** (`validation.js` righe 431 e 443):

```javascript
    client_id: z.string().uuid('client_id must be a valid UUID').optional(),
```

- [ ] **Step 3: Sostituisci i ternari con il helper**

In `sites.js` (~21) e `employees.js` (~50):

```javascript
const { resolveTenantScope } = require('../../utils/tenantScope');
// ...
    const targetClientId = resolveTenantScope(req.user, data.client_id);
```

Il helper può lanciare `ValidationError` in modo sincrono: le due route sono già dentro `try/catch` con `next(err)` — verifica che sia così anche nel punto esatto d'uso. Nella route import di `employees.js`: se esiste già una guardia esplicita "superadmin senza client_id → 400", sostituiscila col helper per uniformità.

- [ ] **Step 4: Nuovi casi di test scoping** (in entrambi i file di scoping):
  - admin POST **senza** `client_id` nel body → 201, risorsa creata nel proprio tenant (il wart era proprio questo: prima era un 400 di validazione)
  - superadmin POST senza `client_id` → 400 `CLIENT_ID_REQUIRED`

- [ ] **Step 5: Esegui tutta la fascia admin**

Run: `NODE_ENV=test npx jest tenant-scope admin-sites admin-employees admin-clients admin-csv --forceExit 2>&1 | tail -5`
Expected: tutti verdi. ⚠️ `admin-csv-import.test.js` ha un test "admin role: client_id in body is not required" (Session 71) — deve restare verde; se altri test inviavano `client_id` obbligatorio aggiornali SOLO se il loro intento era testare la validazione, non lo scoping.

- [ ] **Step 6: Commit**

```bash
git add backend/src/utils/tenantScope.js backend/src/__tests__/tenant-scope.test.js backend/src/middleware/validation.js backend/src/routes/admin/ backend/src/__tests__/admin-*.test.js
git commit -m "refactor(admin): shared resolveTenantScope helper, optional client_id for admin callers"
```

---

### Task 9: Codici errore uniformi sui DELETE admin (400 → 404)

`clients.js:82` e `sites.js:101` rispondono `ValidationError` (400) per "not found o tenant altrui", mentre `employees.js` usa `NotFoundError` (404). Uniformare a 404 — nessuna informazione in più viene rivelata (il messaggio resta identico). NON toccare i `ValidationError` sui POST (riferimento a client inesistente nel body → 400 è semanticamente corretto lì).

**Files:**
- Modify: `backend/src/routes/admin/clients.js` (riga 82)
- Modify: `backend/src/routes/admin/sites.js` (riga 101)
- Modify: i test che assertano 400 su questi DELETE

- [ ] **Step 1: Trova le assertion attuali**

Run: `grep -n "400" backend/src/__tests__/admin-clients-scoping.test.js backend/src/__tests__/admin-sites-scoping.test.js`

- [ ] **Step 2: Cambia i 2 return** (verifica che `NotFoundError` sia già importato in entrambi i file — in `sites.js` lo è, in `clients.js` controllare):

```javascript
// clients.js:82
if (result.rowCount === 0) return next(new NotFoundError('Client not found', 'CLIENT_NOT_FOUND'));
// sites.js:101
if (result.rowCount === 0) return next(new NotFoundError('Site not found', 'SITE_NOT_FOUND'));
```

- [ ] **Step 3: Aggiorna le assertion dei test da 400 → 404** (solo quelle sui DELETE), esegui:

Run: `NODE_ENV=test npx jest admin-clients-scoping admin-sites-scoping --forceExit`
Expected: verdi

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/admin/clients.js backend/src/routes/admin/sites.js backend/src/__tests__/
git commit -m "fix(admin): uniform 404 NotFoundError on DELETE for missing/foreign-tenant resources"
```

---

### Task 10: Rimozione codice morto `lib/axiosInterceptor.js`

Interceptor inerte (dirama su un campo `.code` mai popolato dagli errori reali del backend, che usano `.error`) — confermato inerte in Session 68 e lasciato deliberatamente; ora si rimuove.

**Files:**
- Delete: `frontend-web/src/lib/axiosInterceptor.js`
- Delete: `frontend-web/src/lib/__tests__/axiosInterceptor.test.js`
- Modify: `frontend-web/src/App.jsx` (riga 28: import; riga 126: chiamata `setupAxiosInterceptor(apiClient, () => tokenRefresh);`)
- Modify: `frontend-web/src/services/__tests__/apiClient.test.js` (solo il commento alla riga ~72 che lo cita)

- [ ] **Step 1: PRIMA di cancellare, rileggi `axiosInterceptor.js` per intero** e verifica che nessun ramo sia effettivamente raggiungibile (il redirect SESSION_REVOKED e il refresh-retry vivono già in `apiClient.js` — confermalo con grep su `SESSION_REVOKED` in `apiClient.js`). Se trovi un ramo NON coperto da `apiClient.js`, FERMATI e riporta al coordinatore invece di cancellare.

- [ ] **Step 2: Rimuovi import + chiamata da App.jsx, cancella i 2 file, aggiorna il commento in apiClient.test.js.**

```bash
git rm frontend-web/src/lib/axiosInterceptor.js frontend-web/src/lib/__tests__/axiosInterceptor.test.js
```

- [ ] **Step 3: Suite completa frontend + build**

Run: `npx vitest run 2>&1 | tail -3 && npm run build 2>&1 | tail -3`
Expected: suite verde (meno i test del file cancellato), build pulita.

- [ ] **Step 4: Commit**

```bash
git add -A frontend-web/src
git commit -m "chore(frontend): remove inert axiosInterceptor dead code (confirmed unreachable)"
```

---

### Task 11: Cron di cleanup demo su EC2 (PRODUZIONE — richiede autorizzazione utente)

`backend/scripts/cleanup-expired-demos.js` esiste ma non viene mai eseguito in produzione → i dati dei prospect scaduti (email = dato personale, GDPR) si accumulano per sempre. Decisione presa: cron sull'host EC2, non EventBridge.

> ⚠️ **GOTCHA CRITICO**: `docker exec` NON eredita l'ambiente del processo principale (le env da SSM sono caricate via `source /etc/badge/.env` solo nell'entrypoint). Un `docker exec node script.js` nudo fallirebbe senza credenziali DB. Il comando DEVE sorgere l'env file (verificato: `docker exec` senza env in Session 74 mostrava env vuote).

> ⚠️ **Questo task NON va eseguito da un subagent**: è un'operazione su produzione. Il coordinatore la esegue direttamente, chiedendo autorizzazione esplicita all'utente PRIMA del passo 2.

**Files:** nessun file di repo (solo crontab su EC2 + una riga di documentazione).

- [ ] **Step 1: Test manuale una-tantum del comando (lettura+scrittura su DB prod — chiedi autorizzazione):**

```bash
ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@34.245.145.143 \
  "docker exec badge-system-api bash -c 'source /etc/badge/.env && node /app/scripts/cleanup-expired-demos.js'"
```

Expected: lo script termina con exit 0 e logga quanti tenant scaduti-oltre-grazia ha rimosso (probabilmente 0 o pochi — i tenant di test QA delle Session 72-75 potrebbero rientrarci solo tra 14 giorni). Un secondo run immediato deve essere idempotente (già verificato in Session 69).

- [ ] **Step 2: Installa la riga di crontab (autorizzazione esplicita già ottenuta al passo 1):**

```bash
ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@34.245.145.143 \
  "(crontab -l 2>/dev/null | grep -v cleanup-expired-demos; echo '30 3 * * * docker exec badge-system-api bash -c \"source /etc/badge/.env && node /app/scripts/cleanup-expired-demos.js\" >> /home/ubuntu/cleanup-demos.log 2>&1') | crontab -"
```

(Ore 3:30 UTC — fuori orario retail. Il filtro `grep -v` rende il comando idempotente su ri-esecuzioni.)

- [ ] **Step 3: Verifica la crontab installata:**

```bash
ssh -i ~/.ssh/badge-system-ec2-v2.pem ubuntu@34.245.145.143 "crontab -l"
```

Expected: la riga presente, una sola volta.

- [ ] **Step 4: Documenta**: aggiungi in `TASKS.md` (sezione infrastruttura non provisionata) che il cron è attivo, con il comando esatto e il path del log (`/home/ubuntu/cleanup-demos.log`). Il giorno dopo, controllare il log per confermare la prima esecuzione automatica. Commit della sola modifica a TASKS.md insieme al Task 12.

---

### Task 12: CI con servizio Postgres reale

Oggi il job "Backend - Lint & Test" gira senza DB (env `DATABASE_URL: postgres://test:test@localhost:5432/test` che non esiste) → i test DB-dipendenti critici (race condition email duplicata, scoping RBAC, migration) non girano mai in CI. Aggiungere un service container e allineare l'env a `.env.test`.

> ⚠️ **Task a rischio più alto del piano**: potrebbe far emergere test che passano solo in locale per motivi ambientali. Se dopo il fix la suite CI mostra fallimenti NON riproducibili in locale, riportarli al coordinatore senza tentare fix creativi.

**Files:**
- Modify: `.github/workflows/ci.yml` (job `Backend - Lint & Test`, righe ~17-60)

- [ ] **Step 1: Aggiungi il service container al job:**

```yaml
  backend:
    name: Backend - Lint & Test
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: badge_system_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
```

- [ ] **Step 2: Allinea l'env del passo "Run backend tests" a `.env.test`** (i valori attuali `test:test@.../test` sono fittizi):

```yaml
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/badge_system_test  # pragma: allowlist secret
          DB_HOST: localhost
          DB_PORT: '5432'
          DB_USER: postgres
          DB_PASSWORD: postgres  # pragma: allowlist secret
          DB_NAME: badge_system_test
```

(Le altre env del passo restano invariate. Confronta con `backend/.env.test` per eventuali variabili DB aggiuntive richieste — es. `DB_POOL_*`.)

- [ ] **Step 3: Aggiungi lo step di migrazione PRIMA dei test:**

```yaml
      - name: Apply database migrations
        working-directory: ./backend
        env:
          NODE_ENV: test
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/badge_system_test  # pragma: allowlist secret
          DB_HOST: localhost
          DB_PORT: '5432'
          DB_USER: postgres
          DB_PASSWORD: postgres  # pragma: allowlist secret
          DB_NAME: badge_system_test
        run: node scripts/run-migrations.js
```

⚠️ Verifica PRIMA quale script è quello canonico: il container di produzione usa `node /app/scripts/run-migrations.js` (entrypoint.sh) — usare lo stesso. Controlla che legga `DATABASE_URL`/`DB_*` dall'ambiente e non da un file .env assente in CI. Se i test si aspettano anche dati seed (fixture Pippo/Maria — migration 022), le migration li creano già: NON aggiungere seed manuali.

- [ ] **Step 4: Commit + push del branch, osserva il run CI**

```bash
git add .github/workflows/ci.yml TASKS.md
git commit -m "ci: run backend tests against a real Postgres 14 service container"
git push -u origin worktree-code-review-fixes
gh run watch --exit-status   # oppure Monitor sul run
```

Expected: job verde con i test DB-dipendenti ESEGUITI (confronta il conteggio test eseguiti/skippati col run precedente — deve salire il numero degli eseguiti). Se rosso per test ambientali → riporta al coordinatore.

---

## Verifica finale (dopo tutti i task, prima della decisione merge/PR)

- [ ] Suite backend completa: `cd backend && NODE_ENV=test npx jest --forceExit 2>&1 | tail -5` → 0 fallimenti (14 skip noti ammessi; il flake noto `auth-refresh-first-use` va ricontrollato sul commit base prima di attribuirlo a questo branch)
- [ ] Suite frontend completa: `cd frontend-web && npx vitest run 2>&1 | tail -3` → 0 fallimenti (1 skip noto)
- [ ] Build frontend pulita: `npm run build`
- [ ] Lint entrambi: `npm run lint` (backend) + `npx eslint src` (frontend) → 0 errori
- [ ] Grep di controllo timer: `grep -rn "setTimeout" frontend-web/src --include="*.jsx" | grep -v -e ref -e test -e Ref` → nessun timer di navigazione/stato senza ref residuo
- [ ] CI verde sul branch pushato (Task 12 già lo verifica)
- [ ] Cron installato e loggato (Task 11, verificato il giorno dopo)
- [ ] `superpowers:finishing-a-development-branch` per la decisione merge/PR

## Fuori scope (deliberatamente)

- Uscita SES da Sandbox + verifica dominio (richiede accesso DNS dell'utente)
- S.26 consenso GPS (piano dedicato `2026-06-20-s24-gdpr-gps-disclosure.md`, trigger-based)
- Migrazione JWT localStorage → httpOnly cookie (C.5.3)
- Screenshot reali per `/prova-demo` (servono le immagini)
- Refactoring delle funzioni lunghe segnalate dai tool (opportunistico, non pianificato)
