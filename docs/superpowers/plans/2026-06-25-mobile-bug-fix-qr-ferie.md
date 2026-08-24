# Mobile Bug Fix — QR Crash + Ferie 404 + Date Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correggere 3 bug critici sulla app mobile Build 18: crash al QR scan, 404 sulle richieste ferie, bottone "Fine" non visibile nel date picker delle ferie.

**Architecture:** Tre fix indipendenti. Bug 1 (QR crash): sostituire `new URL()` con parsing robusto via split/URLSearchParams. Bug 2 (Ferie 404): allineare le URL frontend alle route backend (`/leave/*`) e aggiungere endpoint `/balance` mancante. Bug 3 (Date picker): aggiungere ScrollView ref + scrollTo per rivelare il bottone Fine quando il picker fine-ferie si apre.

**Tech Stack:** React Native (Expo SDK 54), Express.js, Jest (backend), nessuna nuova dipendenza

---

## File Map

| File | Operazione | Motivo |
|------|-----------|--------|
| `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx` | Modify | Sostituire `new URL(data)` con parsing robusto |
| `frontend-mobile/src/screens/leave/LeaveRequestScreen.jsx` | Modify | ScrollView ref + scrollTo + fix campo `reason→motivation` |
| `frontend-mobile/src/config/endpoints.js` | Modify | Correggere le 3 URL ferie (plurale → singolare + path giusti) |
| `backend/src/routes/leaves.js` | Modify | Aggiungere `GET /api/v1/leave/balance` per i dipendenti |
| `backend/src/__tests__/leaves.balance.test.js` | Create | Test per il nuovo endpoint balance |

---

## Root Cause Summary (già analizzato — non re-investigare)

### Bug 1 — QR Crash (app si chiude)
- **Causa:** `new URL('badge://checkin?site_id=...')` nell'engine Hermes di React Native production può throw in modo non recoverable su custom URL scheme non HTTP/HTTPS. In dev build va, in prod crash silenzioso.
- **Fix:** Parsing con `split('?')` + `URLSearchParams` standard, con fallback manuale.

### Bug 2 — Ferie 404
- **Causa:** `endpoints.js` usa `/api/v1/leaves` (plurale) ma il backend è montato su `/api/v1/leave` (singolare). Tutti e tre gli endpoint ferie sono 404.
- Mismatch specifici:
  - `LEAVES_LIST: '/api/v1/leaves'` → deve essere `/api/v1/leave/my-requests`
  - `LEAVES_CREATE: '/api/v1/leaves'` → deve essere `/api/v1/leave/request`
  - `LEAVES_BALANCE: '/api/v1/leaves/balance'` → deve essere `/api/v1/leave/balance` (endpoint non esiste → va creato)
- **Campo sbagliato:** Frontend invia `reason` nel body, backend schema (`PostLeaveRequestSchema`) si aspetta `motivation`. Campo opzionale quindi non blocca, ma motivazione non viene mai salvata.

### Bug 3 — Date Picker "Fine" button invisibile
- **Causa:** Schermata ferie è lunga (balance cards, type chips, start date picker, end date picker). Quando il picker della data fine si apre, il bottone "Fine" appare SOTTO il picker a circa 150px di distanza. La ScrollView non scrolla automaticamente → il bottone è fuori dall'area visibile.
- **Fix:** Aggiungere `ref` alla ScrollView e chiamare `scrollToEnd()` quando `showEndPicker` diventa `true`. Identico al comportamento atteso (illness funziona perché la schermata è più corta e il bottone rimane visibile).

---

## Task 1 — Fix QR Crash: parsing robusto senza `new URL()`

**Files:**
- Modify: `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx` (linee 65-70)

**Contesto:** La funzione `handleBarCodeScanned` fa `const url = new URL(data)` dove `data = 'badge://checkin?site_id=...&client_id=...&v=1'`. In Hermes production, `new URL()` su custom scheme può crashare. Sostituiamo con parsing manuale robusto.

- [ ] **Step 1: Aprire il file**

  Aprire: `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx`
  
  Individuare il blocco `try {` a linea ~65:
  ```javascript
  try {
    const url = new URL(data);
    const siteId = url.searchParams.get('site_id');
    const clientId = url.searchParams.get('client_id');

    if (!siteId || !clientId) throw new Error('QR incompleto');
  ```

- [ ] **Step 2: Sostituire il parsing URL**

  Sostituire il blocco `try {` (solo le prime 4 righe, mantenere tutto il resto):

  ```javascript
  try {
    // Parsing robusto: new URL() può crashare su custom scheme (badge://) in Hermes production
    const qmark = data.indexOf('?');
    const queryString = qmark >= 0 ? data.slice(qmark + 1) : '';
    const params = {};
    queryString.split('&').forEach(pair => {
      const eq = pair.indexOf('=');
      if (eq >= 0) params[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1));
    });
    const siteId = params.site_id || null;
    const clientId = params.client_id || null;

    if (!siteId || !clientId) throw new Error('QR incompleto: parametri site_id o client_id mancanti');
  ```

  Il resto del `try` block (authService.getUser, tryGetLocation, GPS consent, apiClient.post, navigation.replace) rimane **invariato**.

- [ ] **Step 3: Verificare che non ci siano altre occorrenze di `new URL` nel file**

  ```bash
  grep -n "new URL" "frontend-mobile/src/screens/checkin/QRScannerScreen.jsx"
  ```
  
  Expected: nessun output (0 matches).

- [ ] **Step 4: Commit**

  ```bash
  git add frontend-mobile/src/screens/checkin/QRScannerScreen.jsx
  git commit -m "fix(mobile): replace new URL() with robust QR parsing for Hermes production compatibility"
  ```

---

## Task 2 — Fix Ferie 404: correggere URL in endpoints.js

**Files:**
- Modify: `frontend-mobile/src/config/endpoints.js` (sezione `LEAVES_*`, linee 25-27)

**Contesto:** Il `endpoints.js` usa `/api/v1/leaves` (plurale) ma il backend Express è montato su `v1Router.use('/leave', leavesRouter)` (singolare). Tutte le chiamate ferie ricevono 404.

- [ ] **Step 1: Aprire il file e localizzare la sezione LEAVES**

  Aprire: `frontend-mobile/src/config/endpoints.js`
  
  Trovare questo blocco (circa linea 24-28):
  ```javascript
  // Leaves (ferie)
  LEAVES_LIST: '/api/v1/leaves',
  LEAVES_CREATE: '/api/v1/leaves',
  LEAVES_BALANCE: '/api/v1/leaves/balance',
  ```

- [ ] **Step 2: Correggere le tre URL**

  Sostituire con:
  ```javascript
  // Leaves (ferie)
  LEAVES_LIST: '/api/v1/leave/my-requests',
  LEAVES_CREATE: '/api/v1/leave/request',
  LEAVES_BALANCE: '/api/v1/leave/balance',
  ```

  Note:
  - `LEAVES_LIST`: route backend esistente `GET /leave/my-requests` in `leaves.js:309`
  - `LEAVES_CREATE`: route backend esistente `POST /leave/request` in `leaves.js:26`
  - `LEAVES_BALANCE`: `/api/v1/leave/balance` — endpoint da creare nel Task 3

- [ ] **Step 3: Verificare che non ci siano altri riferimenti a `/api/v1/leaves`**

  ```bash
  grep -rn "api/v1/leaves" frontend-mobile/src/
  ```
  
  Expected: nessun output (0 matches).

- [ ] **Step 4: Commit**

  ```bash
  git add frontend-mobile/src/config/endpoints.js
  git commit -m "fix(mobile): correct ferie API endpoints from /leaves to /leave/* matching backend routes"
  ```

---

## Task 3 — Fix Ferie 404: aggiungere endpoint balance + fix campo motivation

**Files:**
- Modify: `backend/src/routes/leaves.js` (aggiungere route prima di `module.exports`)
- Modify: `frontend-mobile/src/screens/leave/LeaveRequestScreen.jsx` (linea 56: `reason` → `motivation`)
- Create: `backend/src/__tests__/leaves.balance.test.js`

**Contesto:** Il frontend chiama `GET /api/v1/leave/balance` ma questo endpoint non esiste nel backend. Deve restituire i saldi ferie dell'utente corrente (solo i propri, filtrato per anno corrente). Inoltre il POST ferie invia `reason` ma il backend `PostLeaveRequestSchema` si aspetta `motivation` — il campo è opzionale quindi non causa 422 ma la motivazione viene scartata.

- [ ] **Step 1: Scrivere il test per il nuovo endpoint balance**

  Creare: `backend/src/__tests__/leaves.balance.test.js`

  ```javascript
  /**
   * Tests for GET /api/v1/leave/balance
   * Endpoint: returns current employee's leave saldi for current year
   */
  const request = require('supertest');
  const app = require('../app');

  const EMPLOYEE_TOKEN = process.env.TEST_EMPLOYEE_TOKEN || '';
  const ADMIN_TOKEN = process.env.TEST_ADMIN_TOKEN || '';

  describe('GET /api/v1/leave/balance', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app)
        .get('/api/v1/leave/balance')
        .expect(401);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 200 with array of saldi for authenticated employee', async () => {
      if (!EMPLOYEE_TOKEN) {
        console.warn('TEST_EMPLOYEE_TOKEN not set — skipping live test');
        return;
      }
      const res = await request(app)
        .get('/api/v1/leave/balance')
        .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      // Each saldo has leave_type and remaining_days
      if (res.body.data.length > 0) {
        expect(res.body.data[0]).toHaveProperty('leave_type');
        expect(res.body.data[0]).toHaveProperty('remaining_days');
      }
    });

    it('returns 200 with saldi for admin user', async () => {
      if (!ADMIN_TOKEN) {
        console.warn('TEST_ADMIN_TOKEN not set — skipping live test');
        return;
      }
      const res = await request(app)
        .get('/api/v1/leave/balance')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Eseguire il test per verificare che fallisce con 404**

  ```bash
  cd backend
  DISABLE_AUTH=false npx jest src/__tests__/leaves.balance.test.js --no-coverage 2>&1 | tail -20
  ```
  
  Expected: test "returns 401 without auth token" **PASS** (perché 404 non è 401), ma almeno un test fallisce o mostra che la route non esiste.
  
  Nota: se DISABLE_AUTH e token non sono disponibili in locale il test con token verrà skippato — è normale.

- [ ] **Step 3: Aggiungere il nuovo endpoint `GET /leave/balance` in `leaves.js`**

  Aprire: `backend/src/routes/leaves.js`
  
  Trovare la riga `module.exports = router;` alla fine del file (linea 506) e inserire prima di essa:

  ```javascript
  // =====================================================
  // GET /api/v1/leave/balance — Employee's own leave saldi (current year)
  // All roles can call this; returns only the caller's own saldi
  // =====================================================

  router.get('/balance', requireAuth, async (req, res, next) => {
    const userId = req.user.user_id;
    const clientId = req.user.client_id;
    const year = new Date().getFullYear();

    try {
      const result = await pool.query(
        `SELECT leave_type, year, total_days, used_days, remaining_days
         FROM leave_saldi
         WHERE user_id = $1::uuid AND client_id = $2::uuid AND year = $3
         ORDER BY leave_type`,
        [userId, clientId, year]
      );

      logger.info({
        action: 'leave_balance_viewed',
        user_id: userId,
        year,
        count: result.rows.length,
      });

      res.status(200).json({ data: result.rows });
    } catch (error) {
      next(error);
    }
  });
  ```

  **Importante:** questa route deve trovarsi PRIMA di `module.exports = router;` e PRIMA di qualsiasi route con path parametrico (`:id`) per evitare conflitti di routing Express.

- [ ] **Step 4: Correggere il campo `reason → motivation` in LeaveRequestScreen.jsx**

  Aprire: `frontend-mobile/src/screens/leave/LeaveRequestScreen.jsx`
  
  Trovare il blocco `handleSubmit` (linea ~56):
  ```javascript
  await apiClient.post(ENDPOINTS.LEAVES_CREATE, {
    leave_type: leaveType,
    start_date: toISO(startDate),
    end_date: toISO(endDate),
    reason: reason.trim() || null,
  });
  ```
  
  Sostituire con:
  ```javascript
  await apiClient.post(ENDPOINTS.LEAVES_CREATE, {
    leave_type: leaveType,
    start_date: toISO(startDate),
    end_date: toISO(endDate),
    motivation: reason.trim() || null,
  });
  ```
  
  Nota: la variabile di stato React rimane `reason` (non cambiarla), solo la chiave del body JSON passa da `reason` a `motivation`.

- [ ] **Step 5: Verificare che il backend accetti correttamente (grep schema)**

  ```bash
  grep -n "motivation\|reason" backend/src/middleware/validation.js | head -10
  ```
  
  Expected output deve mostrare `motivation` come campo definito in `PostLeaveRequestSchema`.

- [ ] **Step 6: Eseguire i test del backend**

  ```bash
  cd backend && npm test -- --testPathPattern="leaves" --no-coverage 2>&1 | tail -30
  ```
  
  Expected: tutti i test leaves passano, incluso il nuovo `leaves.balance.test.js`.

- [ ] **Step 7: Commit**

  ```bash
  git add backend/src/routes/leaves.js \
          backend/src/__tests__/leaves.balance.test.js \
          frontend-mobile/src/screens/leave/LeaveRequestScreen.jsx
  git commit -m "fix(ferie): add GET /leave/balance endpoint and fix motivation field name"
  ```

---

## Task 4 — Fix Date Picker: bottone "Fine" visibile per data fine ferie

**Files:**
- Modify: `frontend-mobile/src/screens/leave/LeaveRequestScreen.jsx`

**Contesto:** La schermata ferie ha molto contenuto prima del date picker della data fine (balance cards, type chips, date inizio). Quando si apre il picker della data fine, il bottone "Fine" appare inline dopo il picker (height: 150) ma la ScrollView non scrolla automaticamente per mostrarlo → utente vede solo le date che scorrono senza poter confermare.

La schermata malattia (illness) non ha questo problema perché ha meno contenuto e il bottone è già visibile nell'area corrente.

**Fix:** Aggiungere un `ref` alla ScrollView e chiamare `scrollToEnd({ animated: true })` quando si imposta `showEndPicker = true`. Nessun package aggiuntivo necessario.

- [ ] **Step 1: Aggiungere `useRef` all'import e creare il ref per la ScrollView**

  Aprire: `frontend-mobile/src/screens/leave/LeaveRequestScreen.jsx`
  
  Trovare la prima riga:
  ```javascript
  import React, { useState, useEffect, useCallback } from 'react';
  ```
  
  `useRef` è già importato? Verificare. Se non c'è, aggiungere `useRef` all'import:
  ```javascript
  import React, { useState, useEffect, useCallback, useRef } from 'react';
  ```

- [ ] **Step 2: Aggiungere `scrollRef` subito dopo gli useState esistenti**

  Trovare il blocco di `useState` (linee 16-26 circa):
  ```javascript
  const [historyLoading, setHistoryLoading] = useState(true);
  ```
  
  Aggiungere dopo l'ultimo `useState`:
  ```javascript
  const scrollRef = useRef(null);
  ```

- [ ] **Step 3: Attaccare il ref alla ScrollView e aggiornare il handler del bottone data fine**

  Trovare il tag `<ScrollView` (linea ~82):
  ```jsx
  <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
  ```
  
  Sostituire con:
  ```jsx
  <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
  ```

- [ ] **Step 4: Aggiungere lo scroll al handler del bottone "Data fine"**

  Trovare il `TouchableOpacity` che apre il picker della data fine (linea ~106):
  ```jsx
  <TouchableOpacity
    style={styles.dateButton}
    onPress={() => { setShowEndPicker(true); setShowStartPicker(false); }}
  >
  ```
  
  Sostituire con:
  ```jsx
  <TouchableOpacity
    style={styles.dateButton}
    onPress={() => {
      setShowEndPicker(true);
      setShowStartPicker(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }}
  >
  ```
  
  Il `setTimeout(100ms)` è necessario perché `setShowEndPicker(true)` aggiorna lo stato React in modo asincrono — senza timeout, la ScrollView non ha ancora renderizzato il picker quando viene chiamato `scrollToEnd`.

- [ ] **Step 5: Verificare che il bottone "Fine" del picker data inizio non abbia lo stesso problema**

  Controllare: il picker della data inizio è più in alto nello schermo, quindi il suo bottone Fine è solitamente visibile. Non modificare il suo handler a meno che non sia necessario.

- [ ] **Step 6: Verificare la struttura finale del componente (ricerca pattern)**

  ```bash
  grep -n "scrollRef\|scrollToEnd\|useRef\|showEndPicker" \
    "frontend-mobile/src/screens/leave/LeaveRequestScreen.jsx"
  ```
  
  Expected output:
  ```
  1:import React, { useState, useEffect, useCallback, useRef } from 'react';
  ...
  XX:  const scrollRef = useRef(null);
  ...
  XX:  <ScrollView ref={scrollRef} ...
  ...
  XX:  onPress={() => { setShowEndPicker(true); setShowStartPicker(false); setTimeout(...) }}
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add frontend-mobile/src/screens/leave/LeaveRequestScreen.jsx
  git commit -m "fix(mobile): scroll to end when leave end-date picker opens to reveal Fine button"
  ```

---

## Task 5 — Verifica migration illnesses in produzione (pre-deploy check)

**Files:**
- Nessuna modifica — solo verifica

**Contesto:** La comunicazione malattia ora funziona (confermato dall'utente). Ma per evitare regressions future, verificare che la migration `021_create_illnesses_table.sql` sia stata applicata in produzione.

- [ ] **Step 1: Verificare via SSH che la tabella illnesses esiste in produzione**

  ```bash
  # Da terminale locale, SSH all'EC2:
  ssh -i ~/.ssh/badge-system.pem ubuntu@<EC2_IP> \
    "docker exec badge-system-backend \
     psql \$DATABASE_URL -c '\dt illnesses' 2>&1"
  ```
  
  Expected: una riga con `illnesses` nella lista delle tabelle.
  
  Se la tabella NON esiste, applicare la migration:
  ```bash
  ssh -i ~/.ssh/badge-system.pem ubuntu@<EC2_IP> \
    "docker exec badge-system-backend \
     psql \$DATABASE_URL -f /app/migrations/021_create_illnesses_table.sql 2>&1"
  ```

- [ ] **Step 2: (Solo se illnesses mancava) Verificare che la malattia ora funzioni**

  Testare con curl dalla macchina locale (sostituire TOKEN con JWT valido di Maria):
  ```bash
  curl -s -X POST https://api.dataxiom.it/api/v1/illnesses/report \
    -H "Authorization: Bearer TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"start_date":"2026-06-25","end_date":"2026-06-25","reason":"test"}' | jq .
  ```
  
  Expected: `{"data": {...}, "message": "Comunicazione malattia inviata con successo"}`

---

## Self-Review Checklist

**Spec coverage:**
- ✅ QR crash → Task 1 (parsing robusto senza `new URL()`)
- ✅ Ferie 404 → Task 2 (URL fix) + Task 3 (endpoint balance + campo motivation)
- ✅ Date picker Fine non visibile → Task 4 (scrollToEnd)
- ✅ Malattia funziona (confermato) → Task 5 (solo verifica migration, non serve fix)

**Placeholder scan:** Nessun "TBD", tutti i task hanno codice completo.

**Type consistency:**
- `scrollRef` definito in Task 4 Step 2, usato in Step 3 e 4 ✅
- `LEAVES_LIST/CREATE/BALANCE` definiti in Task 2, allineati con endpoint Task 3 ✅
- `motivation` nel Task 3 corrisponde a `PostLeaveRequestSchema` in `validation.js:468` ✅
- Route `GET /leave/balance` aggiunta in Task 3 corrisponde a `LEAVES_BALANCE` in Task 2 ✅
- Route `/leave/balance` deve essere prima di route con `:id` — verificato: nel file `leaves.js` non ci sono route con `:id` che iniziano con `/balance` ✅

**Dipendenze tra task:**
- Task 2 (URL fix) dipende da Task 3 (endpoint balance) — entrambi devono essere committati prima del deploy
- Task 1, Task 4 sono indipendenti
- Task 5 è solo una verifica, non modifica codice
