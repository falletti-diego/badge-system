# Fase C — Geofencing GPS reale + invalidazione QR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere operativo il geofencing GPS già costruito (backend haversine, consenso GDPR) e permettere l'invalidazione manuale del QR di una sede, chiudendo i finding #2 (HIGH) e #5 (MEDIUM) di `findings2agosto2016.md`, secondo lo spec approvato in `docs/superpowers/specs/2026-08-09-geofencing-qr-rotation-design.md`.

**Architecture:** Nessuna migration nuova (tutte le colonne/tabelle riusate esistono già). Backend: rimozione di un gate env globale, un nuovo campo opzionale validato, un nuovo endpoint admin, uno script di retention, un endpoint di revoca consenso, un fix di un bug preesistente di audit log. Mobile: riscrittura di un componente mai eseguibile, un flusso di retry GPS a due tentativi, una cache locale per l'offline, una nuova dipendenza nativa. Web: generalizzazione minima di un dialog di conferma esistente + un nuovo bottone admin.

**Tech Stack:** Node.js/Express/Zod/Jest (backend) · React/Vitest/MUI (frontend-web) · React Native/Expo/Jest (frontend-mobile) · nessuna migration PostgreSQL.

**Rollout:** Ogni task committa su `develop`. A fine piano: `/test-all` completo → push `develop` → verifica staging → **build nativa mobile richiesta** (non OTA, `expo-location` è un modulo nativo) → verifica manuale utente su staging → merge `develop`→`main` solo dopo conferma esplicita.

---

## File Structure (riepilogo)

**Backend:**
- `backend/src/routes/checkins.js` — rimozione gate `GEOFENCING_ENABLED`, validazione `qr_content`
- `backend/src/middleware/validation.js` — campo `qr_content` in `PostCheckinSchema`
- `backend/src/routes/admin/sites.js` — nuovo `POST /:id/regenerate-qr`
- `backend/src/routes/consent.js` — nuovo `POST /gps-revoke`, fix `logAudit` su `/gps-acceptance`
- `backend/scripts/checkin-gps-retention.js` (nuovo)
- Test: `backend/src/__tests__/checkins-geofence.test.js` (riscritto), `admin-sites-regenerate-qr.test.js` (nuovo), `consent.test.js` (esteso + 4 assert aggiornati), `backend/scripts/__tests__/checkin-gps-retention.test.js` (nuovo)

**Frontend-mobile:**
- `frontend-mobile/src/services/secureAuthStorage.js` — nuovo metodo `setUser()`
- `frontend-mobile/src/components/GPSConsentDialog.jsx` — riscritto
- `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx` — `qr_content` nel payload, retry GPS, cache offline-geofencing
- `frontend-mobile/src/screens/settings/SettingsScreen.jsx` — riga "Revoca consenso posizione"
- `frontend-mobile/src/config/endpoints.js` — `CONSENT_GPS_REVOKE`, `CACHE_GEOFENCING_STATUS`
- `frontend-mobile/app.json`, `package.json` — dipendenza `expo-location` + permesso iOS
- Test: `GPSConsentDialog.test.jsx` (nuovo), `QRScannerScreen.test.jsx` (esteso), `SettingsScreen.test.jsx` (esteso), `secureAuthStorage.test.js` (esteso se esiste, altrimenti nuovo)

**Frontend-web:**
- `frontend-web/src/features/admin/components/ConfirmDeleteDialog.jsx` — props `confirmLabel`/`confirmColor` opzionali
- `frontend-web/src/features/admin/tabs/SitesTab.jsx` — bottone "Rigenera QR"
- Test: nuovo `SitesTab.test.jsx` (non esiste ancora nessun test per questo componente)

---

## Task 1: Backend — rimuovere il gate globale `GEOFENCING_ENABLED`

**Files:**
- Modify: `backend/src/routes/checkins.js`
- Modify: `backend/src/__tests__/checkins-geofence.test.js`

- [ ] **Step 1: Rimuovere il blocco `beforeAll`/`afterAll` che manipola l'env var**

In `backend/src/__tests__/checkins-geofence.test.js`, righe 36-52, sostituire:

```javascript
// Disable global DISABLE_AUTH bypass so JWT role checks work.
// Enable GEOFENCING_ENABLED for these tests (feature is on hold by default in MVP).
// Save/restore GEOFENCING_ENABLED so CI env state is not corrupted for subsequent test files.
let _savedGeofencingEnabled;
beforeAll(() => {
  process.env.DISABLE_AUTH = 'false';
  _savedGeofencingEnabled = process.env.GEOFENCING_ENABLED;
  process.env.GEOFENCING_ENABLED = 'true';
});
afterAll(() => {
  process.env.DISABLE_AUTH = 'true';
  if (_savedGeofencingEnabled === undefined) {
    delete process.env.GEOFENCING_ENABLED;
  } else {
    process.env.GEOFENCING_ENABLED = _savedGeofencingEnabled;
  }
});
```

con:

```javascript
// Disable global DISABLE_AUTH bypass so JWT role checks work.
// Geofencing è ora controllato solo da geofencing_feature_enabled (client) +
// geofence_enabled (sede), entrambi già simulati via makeClientQuery() — nessun
// env var globale da manipolare (Fase C, 2026-08-09).
beforeAll(() => {
  process.env.DISABLE_AUTH = 'false';
});
afterAll(() => {
  process.env.DISABLE_AUTH = 'true';
});
```

- [ ] **Step 2: Eseguire la suite per verificare che sia ancora tutta verde (nessun test dipende più dall'env var, ma verificarlo prima di toccare il codice di produzione)**

Run: `cd backend && npx jest checkins-geofence`
Expected: PASS — tutti i test già controllano il comportamento via `geofenceEnabled`/`geofencingFeatureEnabled` nei mock, non tramite l'env var, quindi rimuovere il blocco non li rompe.

- [ ] **Step 3: Rimuovere il gate `geofencingEnabled` in `checkins.js`**

In `backend/src/routes/checkins.js`, righe 102-107, sostituire:

```javascript
      // 3.5 Geofence check — ON HOLD (MVP): re-enable by setting GEOFENCING_ENABLED=true
      // Code is preserved for Phase 2 implementation.
      const site = siteResult.rows[0];
      const { latitude: checkinLat, longitude: checkinLng } = req.validated.body;
      const geofencingEnabled = process.env.GEOFENCING_ENABLED === 'true';
      if (geofencingEnabled && (site.geofencing_feature_enabled !== false) && site.geofence_enabled) {
```

con:

```javascript
      // 3.5 Geofence check (Fase C, 2026-08-09) — controllato interamente dai toggle
      // admin già esistenti: geofencing_feature_enabled (per cliente) e geofence_enabled
      // (per sede). Nessun env var globale: l'admin del cliente decide da solo.
      const site = siteResult.rows[0];
      const { latitude: checkinLat, longitude: checkinLng } = req.validated.body;
      if ((site.geofencing_feature_enabled !== false) && site.geofence_enabled) {
```

- [ ] **Step 4: Rieseguire la suite geofence**

Run: `cd backend && npx jest checkins-geofence`
Expected: PASS (comportamento identico — nessun test impostava mai `GEOFENCING_ENABLED=false` esplicitamente per verificare che il gate lo bloccasse, quindi rimuoverlo non introduce nessun falso positivo).

- [ ] **Step 5: Suite completa backend per non-regressione**

Run: `cd backend && npm test`
Expected: tutti verdi, nessuna regressione.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/checkins.js backend/src/__tests__/checkins-geofence.test.js
git commit -m "feat(backend): remove global GEOFENCING_ENABLED gate — client/site toggles are now sufficient (finding #2)"
```

---

## Task 2: Backend — validazione `qr_content` contro `sites.qr_code_content`

**Files:**
- Modify: `backend/src/middleware/validation.js`
- Modify: `backend/src/routes/checkins.js`
- Modify: `backend/src/__tests__/checkins-geofence.test.js`

- [ ] **Step 1: Test rosso — campo troppo lungo rifiutato dallo schema**

Aggiungere in `backend/src/__tests__/checkins-geofence.test.js`, dentro `describe('POST /api/checkins — geofence disabled', ...)` (o in un nuovo `describe` dedicato subito dopo, per chiarezza — usare un nuovo blocco):

```javascript
// ─── POST /api/checkins — qr_content validation (finding #5) ─────────────────

describe('POST /api/checkins — qr_content validation', () => {
  beforeEach(() => jest.clearAllMocks());

  const QR_CONTENT = `badge://checkin?site_id=${SITE_ID}&client_id=${CLIENT_ID}&v=1`;

  it('qr_content oltre 500 caratteri → 400 (schema Zod)', async () => {
    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({ employee_id: EMP_ID, site_id: SITE_ID, type: 'IN', qr_content: 'x'.repeat(501) });

    expect(res.status).toBe(400);
  });

  it('qr_content assente → comportamento invariato (retrocompatibilità con app non aggiornate)', async () => {
    const checkinRow = { id: 'ci-qr-1', employee_id: EMP_ID, site_id: SITE_ID, type: 'IN', timestamp: new Date(), created_at: new Date() };
    pool.connect.mockResolvedValue({ query: makeClientQuery({ geofenceEnabled: false, checkinRow }), release: jest.fn() });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({ employee_id: EMP_ID, site_id: SITE_ID, type: 'IN' });

    expect(res.status).toBe(201);
  });

  it('qr_content corrisponde a sites.qr_code_content → 201', async () => {
    const checkinRow = { id: 'ci-qr-2', employee_id: EMP_ID, site_id: SITE_ID, type: 'IN', timestamp: new Date(), created_at: new Date() };
    pool.connect.mockResolvedValue({
      query: makeClientQuery({ geofenceEnabled: false, checkinRow, qrCodeContent: QR_CONTENT }),
      release: jest.fn(),
    });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({ employee_id: EMP_ID, site_id: SITE_ID, type: 'IN', qr_content: QR_CONTENT });

    expect(res.status).toBe(201);
  });

  it('qr_content non corrisponde a sites.qr_code_content → 403 QR_CODE_INVALID', async () => {
    pool.connect.mockResolvedValue({
      query: makeClientQuery({ geofenceEnabled: false, qrCodeContent: QR_CONTENT }),
      release: jest.fn(),
    });

    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${EMP_TOKEN}`)
      .send({ employee_id: EMP_ID, site_id: SITE_ID, type: 'IN', qr_content: 'badge://checkin?site_id=stale&client_id=stale&v=1' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('QR_CODE_INVALID');
  });

  it('la query di confronto qr_content è parametrizzata, non concatenata (regressione, stessa classe di bug del CSV import Session 25)', () => {
    const fs = require('fs');
    const source = fs.readFileSync(require.resolve('../routes/checkins.js'), 'utf8');
    // Nessuna concatenazione diretta di qr_content nella query SQL — deve sempre
    // passare come parametro $N, mai interpolato con template string dentro la SQL.
    const dangerousPattern = /qr_code_content\s*=\s*\$\{|`.*qr_content.*\$\{/;
    expect(dangerousPattern.test(source)).toBe(false);
  });
});
```

- [ ] **Step 2: Estendere `makeClientQuery` per accettare `qrCodeContent`**

In `backend/src/__tests__/checkins-geofence.test.js`, riga 87, modificare la firma e il `siteRow`:

```javascript
function makeClientQuery({ geofenceEnabled = true, geofencingFeatureEnabled = true, assignmentHits = true, checkinRow, qrCodeContent = null }) {
  const siteRow = {
    id: SITE_ID,
    geofence_enabled: geofenceEnabled,
    geofencing_feature_enabled: geofencingFeatureEnabled,
    latitude: geofenceEnabled ? SITE_LAT : null,
    longitude: geofenceEnabled ? SITE_LNG : null,
    geofence_radius_meters: SITE_RADIUS,
    qr_code_content: qrCodeContent,
  };
```

- [ ] **Step 3: Eseguire e verificare che i nuovi test fallano per il motivo giusto**

Run: `cd backend && npx jest checkins-geofence -t "qr_content"`
Expected: FAIL — `qr_content` non esiste nello schema Zod (viene scartato/rifiutato in modi diversi da quelli attesi), la colonna `qr_code_content` non è nemmeno selezionata nella query reale, nessuna validazione esiste ancora in `checkins.js`.

- [ ] **Step 4: Aggiungere `qr_content` allo schema Zod**

In `backend/src/middleware/validation.js`, riga 103, subito dopo `faceid_verified`:

```javascript
    faceid_verified: z.boolean().optional().default(false),
    // qr_content (finding #5, Fase C 2026-08-09): stringa raw scansionata dal QR fisico.
    // Confrontata byte-per-byte contro sites.qr_code_content — permette a un admin di
    // invalidare un QR rubato/fotografato rigenerandolo. Opzionale in questa fase
    // (retrocompatibilità con app non ancora aggiornate, vedi spec "Rollout campo qr_content").
    qr_content: z.string().max(500, 'qr_content must be at most 500 characters').optional(),
```

- [ ] **Step 5: Aggiungere `qr_code_content` alla SELECT della sede e la validazione in `checkins.js`**

In `backend/src/routes/checkins.js`, riga 36, estendere la destrutturazione:

```javascript
  const { employee_id, site_id, type, occurred_at, client_uuid, faceid_verified, qr_content } = req.validated.body;
```

Riga 76, aggiungere `s.qr_code_content` alla SELECT:

```javascript
      const siteResult = await client.query(
        `SELECT s.id, s.name, s.geofence_enabled, s.latitude, s.longitude, s.geofence_radius_meters,
                s.qr_code_content, c.geofencing_feature_enabled
         FROM sites s
         JOIN clients c ON c.id = s.client_id
         WHERE s.id = $1::uuid AND s.client_id = $2::uuid LIMIT 1`,
        [site_id, clientId]
      );
```

Subito dopo il blocco "3. Verify employee is assigned to site" (dopo riga 100, prima del blocco "3.5 Geofence check"), inserire un nuovo step "3.4":

```javascript
      // 3.4 QR content validation (finding #5, Fase C) — se il client invia qr_content
      // (retrocompatibile: opzionale), deve combaciare esattamente con il valore corrente
      // in DB. Confronto in JS (non in SQL) — è già in memoria dalla query precedente,
      // nessuna query aggiuntiva necessaria, zero rischio di concatenazione SQL.
      if (qr_content != null && qr_content !== site.qr_code_content) {
        logger.warn({ action: 'qr_code_invalid_attempt', site_id, employee_id });
        throw new ForbiddenError('QR code does not match this site', 'QR_CODE_INVALID');
      }
```

Nota: questo blocco va inserito DOPO la riga `const site = siteResult.rows[0];` (che oggi apre il blocco "3.5") — spostare quella riga prima del nuovo blocco 3.4, poi il blocco 3.5 esistente segue invariato. Il file finale in quella zona deve avere l'ordine: assegnazione `site`, poi validazione `qr_content` (3.4), poi geofence (3.5).

- [ ] **Step 6: Rieseguire i test**

Run: `cd backend && npx jest checkins-geofence`
Expected: PASS su tutti i test nuovi ed esistenti.

- [ ] **Step 7: Suite completa backend**

Run: `cd backend && npm test`
Expected: tutti verdi.

- [ ] **Step 8: Commit**

```bash
git add backend/src/middleware/validation.js backend/src/routes/checkins.js backend/src/__tests__/checkins-geofence.test.js
git commit -m "feat(backend): validate qr_content against sites.qr_code_content, optional field (finding #5)"
```

---

## Task 3: Backend — endpoint di rigenerazione QR

**Files:**
- Modify: `backend/src/routes/admin/sites.js`
- Test: Create `backend/src/__tests__/admin-sites-regenerate-qr.test.js`

- [ ] **Step 1: Test rosso**

```javascript
// backend/src/__tests__/admin-sites-regenerate-qr.test.js
'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../db/pool', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../db/redis', () => ({
  deleteCacheByPattern: jest.fn().mockResolvedValue(undefined),
  redisClient: { get: jest.fn(), set: jest.fn() },
}));

jest.mock('../middleware/rateLimiter', () => {
  const passThrough = (req, res, next) => next();
  return { apiLimiter: passThrough, authLimiter: passThrough, csvLimiter: passThrough, demoStartLimiter: passThrough, onboardingInviteLimiter: passThrough };
});

const { pool } = require('../db/pool');
const app = require('../app');

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '1h' });
}

const CLIENT_A = '550e8400-e29b-41d4-a716-446655440001';
const CLIENT_B = '550e8400-e29b-41d4-a716-446655440002';
const SITE_ID = '550e8400-e29b-41d4-a716-446655440010';

const ADMIN_A_TOKEN = makeToken({ user_id: 'admin-a', client_id: CLIENT_A, role: 'admin' });
const EMPLOYEE_TOKEN = makeToken({ user_id: 'emp-1', client_id: CLIENT_A, role: 'employee', employee_id: 'emp-1' });
const MANAGER_TOKEN = makeToken({ user_id: 'mgr-1', client_id: CLIENT_A, role: 'manager' });

describe('POST /api/admin/sites/:id/regenerate-qr', () => {
  beforeAll(() => { process.env.DISABLE_AUTH = 'false'; });
  afterAll(() => { process.env.DISABLE_AUTH = 'true'; });
  beforeEach(() => jest.clearAllMocks());

  it('employee → 403 ADMIN_REQUIRED', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/sites/${SITE_ID}/regenerate-qr`)
      .set('Authorization', `Bearer ${EMPLOYEE_TOKEN}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ADMIN_REQUIRED');
  });

  it('manager → 403 ADMIN_REQUIRED', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/sites/${SITE_ID}/regenerate-qr`)
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ADMIN_REQUIRED');
  });

  it('tenant-scoping: un admin del Cliente A non può rigenerare il QR di una sede del Cliente B (finding cross-tenant, Session 71)', async () => {
    // La UPDATE è scoped a client_id — se la sede appartiene a un altro tenant,
    // WHERE id = $1 AND client_id = $2 non trova righe → 404, non 200.
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post(`/api/v1/admin/sites/${SITE_ID}/regenerate-qr`)
      .set('Authorization', `Bearer ${ADMIN_A_TOKEN}`);

    expect(res.status).toBe(404);
    // Verifica che la query sia stata davvero scoped al client_id dell'admin, non solo all'id sede
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/client_id/i);
    expect(params).toContain(CLIENT_A);
  });

  it('admin del proprio cliente → 200, nuovo qr_code_content diverso dal vecchio, audit log scritto', async () => {
    // 3 chiamate pool.query in sequenza: SELECT (legge client_id/qr_code_content attuali),
    // UPDATE (scrive il nuovo qr_code_content), INSERT audit_log (dentro logAudit).
    pool.query
      .mockResolvedValueOnce({
        rows: [{ id: SITE_ID, name: 'Torino Store', client_id: CLIENT_A, qr_code_content: 'badge://checkin?site_id=X&client_id=Y&v=OLD' }],
        rowCount: 1,
      }) // SELECT
      .mockResolvedValueOnce({
        rows: [{ id: SITE_ID, name: 'Torino Store', client_id: CLIENT_A, qr_code_content: `badge://checkin?site_id=${SITE_ID}&client_id=${CLIENT_A}&v=NEW` }],
      }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // audit log

    const res = await request(app)
      .post(`/api/v1/admin/sites/${SITE_ID}/regenerate-qr`)
      .set('Authorization', `Bearer ${ADMIN_A_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.qr_code_content).not.toBe('badge://checkin?site_id=X&client_id=Y&v=OLD');
    expect(res.body.data.qr_code_content).toMatch(new RegExp(`^badge://checkin\\?site_id=${SITE_ID}&client_id=`));
    expect(pool.query).toHaveBeenCalledTimes(3); // SELECT + UPDATE + audit log
  });

  it('sede inesistente → 404', async () => {
    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post(`/api/v1/admin/sites/00000000-0000-0000-0000-000000000000/regenerate-qr`)
      .set('Authorization', `Bearer ${ADMIN_A_TOKEN}`);

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd backend && npx jest admin-sites-regenerate-qr`
Expected: FAIL — l'endpoint non esiste (404 generico di Express, non il 404 applicativo atteso; i test di RBAC falliscono comunque perché la rotta non esiste).

- [ ] **Step 3: Implementare l'endpoint**

In `backend/src/routes/admin/sites.js`, dopo il blocco `router.put('/:id', ...)` (dopo riga 162, prima di `module.exports`):

```javascript
router.post('/:id/regenerate-qr', async (req, res, next) => {
  try {
    const { id } = req.params;
    const uuidCheck = z.string().uuid().safeParse(id);
    if (!uuidCheck.success) return next(new ValidationError('Invalid site id'));

    const isSuperadmin = req.user.role === 'superadmin';
    const params = isSuperadmin ? [id] : [id, req.user.client_id];
    const scopeClause = isSuperadmin ? '' : 'AND client_id = $2::uuid';

    // Leggiamo prima la sede per costruire il nuovo qr_code_content con lo stesso
    // client_id già presente (evita di doverlo passare separatamente).
    const siteResult = await pool.query(
      `SELECT id, name, client_id, qr_code_content FROM sites WHERE id = $1::uuid ${scopeClause}`,
      params
    );
    if (siteResult.rows.length === 0) return next(new NotFoundError('Site not found', 'SITE_NOT_FOUND'));

    const site = siteResult.rows[0];
    const oldQrContent = site.qr_code_content;
    // crypto.randomUUID() come nonce (finding #5): imprevedibile, non un contatore
    // incrementale indovinabile — stessa utility già in uso in questo file (riga 27).
    const newQrContent = `badge://checkin?site_id=${site.id}&client_id=${site.client_id}&v=${randomUUID()}`;

    const updateResult = await pool.query(
      `UPDATE sites SET qr_code_content = $1, updated_at = NOW() WHERE id = $2::uuid RETURNING id, name, client_id, qr_code_content`,
      [newQrContent, site.id]
    );

    await logAudit(pool, {
      action: 'admin_regenerate_site_qr',
      entity: 'site',
      entityId: site.id,
      clientId: site.client_id,
      oldValue: { qr_code_content: oldQrContent },
      newValue: { qr_code_content: newQrContent },
      userId: req.user.user_id,
    }).catch((err) => logger.warn({ action: 'audit_log_failed', error: err.message }));

    logger.info({ action: 'admin_regenerate_site_qr', site_id: site.id });
    res.json({ success: true, data: updateResult.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

(rimuovere la vecchia riga `module.exports = router;` duplicata alla fine del file — deve restarne una sola, dopo questa nuova rotta).

- [ ] **Step 4: Rieseguire i test**

Run: `cd backend && npx jest admin-sites-regenerate-qr`
Expected: PASS su tutti.

- [ ] **Step 5: Suite completa backend**

Run: `cd backend && npm test`
Expected: tutti verdi.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/admin/sites.js backend/src/__tests__/admin-sites-regenerate-qr.test.js
git commit -m "feat(backend): add POST /admin/sites/:id/regenerate-qr, tenant-scoped, audited (finding #5)"
```

---

## Task 4: Backend — script di retention coordinate GPS

**Files:**
- Create: `backend/scripts/checkin-gps-retention.js`
- Test: Create `backend/scripts/__tests__/checkin-gps-retention.test.js`

- [ ] **Step 1: Test rosso**

Lo script espone una funzione pura `runRetention({ pool, retentionDays, dryRun })` testabile con un pool mockato (nessun precedente di test per `scripts/` in questo repo — `audit-log-retention.js` non ne ha mai avuto uno; qui introduciamo il pattern testabile fin da subito).

```javascript
// backend/scripts/__tests__/checkin-gps-retention.test.js
'use strict';

const { runRetention } = require('../checkin-gps-retention');

describe('checkin-gps-retention — runRetention', () => {
  function makePool(countRows, updateRowCount) {
    return {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ count: String(countRows) }] })
        .mockResolvedValueOnce({ rowCount: updateRowCount }),
    };
  }

  it('nullifica checkin_latitude/checkin_longitude per check-in oltre retentionDays, riga preservata', async () => {
    const pool = makePool(3, 3);
    const result = await runRetention({ pool, retentionDays: 90, dryRun: false });

    expect(result.updated).toBe(3);
    const updateCall = pool.query.mock.calls[1];
    expect(updateCall[0]).toMatch(/UPDATE checkins/i);
    expect(updateCall[0]).toMatch(/checkin_latitude = NULL/i);
    expect(updateCall[0]).toMatch(/checkin_longitude = NULL/i);
    expect(updateCall[0]).not.toMatch(/DELETE/i); // la riga NON viene mai cancellata
  });

  it('--dry-run non esegue la UPDATE', async () => {
    const pool = { query: jest.fn().mockResolvedValueOnce({ rows: [{ count: '5' }] }) };
    const result = await runRetention({ pool, retentionDays: 90, dryRun: true });

    expect(result.wouldUpdate).toBe(5);
    expect(pool.query).toHaveBeenCalledTimes(1); // solo il COUNT, nessuna UPDATE
  });

  it('nessun check-in da aggiornare → nessuna UPDATE eseguita', async () => {
    const pool = { query: jest.fn().mockResolvedValueOnce({ rows: [{ count: '0' }] }) };
    const result = await runRetention({ pool, retentionDays: 90, dryRun: false });

    expect(result.updated).toBe(0);
    expect(pool.query).toHaveBeenCalledTimes(1); // solo il COUNT
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd backend && npx jest checkin-gps-retention`
Expected: FAIL — `../checkin-gps-retention` non esiste ancora.

- [ ] **Step 3: Implementare lo script**

```javascript
#!/usr/bin/env node
/**
 * checkin-gps-retention.js
 * Nullifica checkin_latitude/checkin_longitude per check-in più vecchi di
 * RETENTION_DAYS (default: 90 giorni) — GDPR Art. 5(1)(e), promessa esplicita
 * di GPSConsentDialog (mobile). A differenza di audit-log-retention.js, la
 * RIGA di check-in resta (serve per lo storico presenze/ore) — solo le
 * coordinate vengono nullificate.
 *
 * Usage:
 *   node scripts/checkin-gps-retention.js [--dry-run]
 *
 * Env vars required: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 */
'use strict';

require('dotenv').config();
const { Pool } = require('pg');

const RETENTION_DAYS = parseInt(process.env.CHECKIN_GPS_RETENTION_DAYS || '90', 10);
const DRY_RUN = process.argv.includes('--dry-run');

async function runRetention({ pool, retentionDays, dryRun }) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffISO = cutoff.toISOString();

  const countResult = await pool.query(
    'SELECT COUNT(*) FROM checkins WHERE timestamp < $1 AND checkin_latitude IS NOT NULL',
    [cutoffISO]
  );
  const count = parseInt(countResult.rows[0].count, 10);

  if (dryRun) {
    console.log(`[DRY RUN] Would nullify GPS coordinates on ${count} checkins older than ${cutoffISO} (${retentionDays} days)`);
    return { wouldUpdate: count };
  }

  if (count === 0) {
    console.log(`No checkins with GPS coordinates older than ${retentionDays} days. Nothing to update.`);
    return { updated: 0 };
  }

  const result = await pool.query(
    `UPDATE checkins SET checkin_latitude = NULL, checkin_longitude = NULL
     WHERE timestamp < $1 AND checkin_latitude IS NOT NULL`,
    [cutoffISO]
  );
  console.log(`Nullified GPS coordinates on ${result.rowCount} checkins older than ${cutoffISO}`);
  return { updated: result.rowCount };
}

async function run() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
      : false,
  });

  try {
    await runRetention({ pool, retentionDays: RETENTION_DAYS, dryRun: DRY_RUN });
  } finally {
    await pool.end();
  }
}

module.exports = { runRetention };

if (require.main === module) {
  run().catch((err) => {
    console.error('Retention script failed:', err.message);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Rieseguire i test**

Run: `cd backend && npx jest checkin-gps-retention`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/checkin-gps-retention.js backend/scripts/__tests__/checkin-gps-retention.test.js
git commit -m "feat(backend): add GPS coordinate retention script (90d default), keeps checkin row (GDPR Art. 5(1)(e))"
```

Nota per il gate finale (Task 14): schedulare questo script via cron/EventBridge Scheduler come già fatto per `audit-log-retention.js` — azione operativa, non parte del codice applicativo, da eseguire dall'utente dopo il deploy.

---

## Task 5: Backend — fix bug preesistente `logAudit` su `/gps-acceptance` + nuovo endpoint `/gps-revoke`

**Files:**
- Modify: `backend/src/routes/consent.js`
- Modify: `backend/src/__tests__/consent.test.js`

- [ ] **Step 1: Test rosso — l'audit log di `/gps-acceptance` deve scrivere davvero una riga**

In `backend/src/__tests__/consent.test.js`, sostituire il test esistente (righe 205-240, `'should create audit log entry (best-effort, non-fatal)'`) con una versione che verifica realmente la scrittura, non solo che la request non crashi:

```javascript
    test('should create a real audit_log entry with correct params (regression: logAudit call used wrong snake_case param names and silently no-op\'d)', async () => {
      const updateResult = {
        rows: [{ id: employeeId, email: 'alice@test.com', gps_consent_given: true, gps_consent_given_at: '2026-06-11T10:30:00.000Z' }],
      };
      const logResult = {
        rows: [{ id: '550e8400-e29b-41d4-a716-446655440200', accepted_at: '2026-06-11T10:30:00.000Z' }],
      };
      const auditResult = { rows: [] };

      pool.query
        .mockResolvedValueOnce(updateResult)   // UPDATE employees
        .mockResolvedValueOnce(logResult)      // INSERT employee_consent_log
        .mockResolvedValueOnce(auditResult);   // INSERT audit_log (logAudit)

      const res = await request(app)
        .post('/api/v1/consent/gps-acceptance')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ consent_given: true, privacy_policy_version: '2.0' });

      expect(res.status).toBe(201);
      expect(pool.query).toHaveBeenCalledTimes(3);
      const auditCall = pool.query.mock.calls[2];
      expect(auditCall[0]).toMatch(/INSERT INTO audit_log/i);
      // entity_id (4° placeholder posizionale) deve essere il vero id della riga di consenso appena creata
      expect(auditCall[1]).toContain(logResult.rows[0].id);
    });
```

Aggiornare anche i 2 test che asseriscono esplicitamente `expect(pool.query).toHaveBeenCalledTimes(2)` (righe 96 e 185) a `toHaveBeenCalledTimes(3)`, aggiungendo un terzo `.mockResolvedValueOnce({ rows: [] })` alla loro catena di mock (dopo `updateResult`/`logResult`) in ciascuno dei 4 test che oggi incatenano solo 2 `mockResolvedValueOnce` (righe 80-82, 120-122, 172-174 — il quarto, righe 226-228, è quello appena riscritto sopra).

- [ ] **Step 2: Eseguire e verificare che il nuovo test fallisca per il motivo giusto**

Run: `cd backend && npx jest consent -t "regression: logAudit"`
Expected: FAIL — oggi `logAudit` viene chiamato con `entity_id`/`old_value`/`new_value`/`user_id` (snake_case), non corrispondono ai parametri attesi (`entityId`/`newValue`), il guard interno di `logAudit` (`if (!action || !entity || !entityId || !newValue)`) scarta la chiamata senza mai arrivare a un terzo `pool.query` — quindi `pool.query` viene chiamato solo 2 volte, non 3, e il test fallisce su `toHaveBeenCalledTimes(3)`.

- [ ] **Step 3: Correggere i nomi dei parametri in `/gps-acceptance`**

In `backend/src/routes/consent.js`, righe 70-83, sostituire:

```javascript
    await logAudit(pool, {
      action: 'gps_consent_recorded',
      entity: 'employee_consent_log',
      entity_id: logResult.rows[0].id,
      old_value: null,
      new_value: JSON.stringify({
        employee_id,
        consent_type: 'gps',
        consent_given: consentValue,
        privacy_policy_version: ppVersion,
      }),
      user_id: employee_id,
      client_id,
    }).catch((err) => logger.warn('Audit log GPS consent failed:', err));
```

con:

```javascript
    await logAudit(pool, {
      action: 'gps_consent_recorded',
      entity: 'employee_consent_log',
      entityId: logResult.rows[0].id,
      oldValue: null,
      newValue: {
        employee_id,
        consent_type: 'gps',
        consent_given: consentValue,
        privacy_policy_version: ppVersion,
      },
      userId: employee_id,
      clientId: client_id,
    }).catch((err) => logger.warn('Audit log GPS consent failed:', err));
```

Nota: `logAudit` fa già `JSON.stringify(newValue)` internamente (`middleware/audit.js`, riga 49) — passare `newValue` come oggetto già pronto, non pre-stringificato (evita una doppia serializzazione che avrebbe prodotto una stringa JSON dentro una stringa JSON).

- [ ] **Step 4: Rieseguire tutti i test di `/gps-acceptance`**

Run: `cd backend && npx jest consent`
Expected: PASS su tutti, incluso il nuovo test di regressione.

- [ ] **Step 5: Test rosso per il nuovo endpoint `/gps-revoke`**

Aggiungere un nuovo `describe` in `consent.test.js`, dopo la chiusura del `describe('POST /api/v1/consent/gps-acceptance', ...)`:

```javascript
  // =====================================================
  // POST /api/v1/consent/gps-revoke
  // =====================================================

  describe('POST /api/v1/consent/gps-revoke', () => {
    test('revoca il consenso: gps_consent_given diventa false, scrive audit log', async () => {
      const updateResult = {
        rows: [{ id: employeeId, email: 'alice@test.com', gps_consent_given: false, gps_consent_given_at: '2026-06-11T10:30:00.000Z' }],
      };
      const logResult = {
        rows: [{ id: '550e8400-e29b-41d4-a716-446655440201', accepted_at: '2026-08-09T12:00:00.000Z' }],
      };

      pool.query
        .mockResolvedValueOnce(updateResult)
        .mockResolvedValueOnce(logResult)
        .mockResolvedValueOnce({ rows: [] }); // audit log

      const res = await request(app)
        .post('/api/v1/consent/gps-revoke')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.gps_consent_given).toBe(false);
      // La seconda query (employee_consent_log) deve registrare consent_given: false
      const logInsertCall = pool.query.mock.calls[1];
      expect(logInsertCall[1]).toContain(false);
    });

    test('un dipendente non trovato → 400', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/v1/consent/gps-revoke')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(400);
    });
  });
```

- [ ] **Step 6: Eseguire e verificare che fallisca**

Run: `cd backend && npx jest consent -t "gps-revoke"`
Expected: FAIL — la rotta non esiste (404).

- [ ] **Step 7: Implementare `POST /gps-revoke`**

In `backend/src/routes/consent.js`, dopo la chiusura di `router.post('/gps-acceptance', ...)` (dopo riga 97, prima di `// GET /api/consent/my-consents`):

```javascript
// =====================================================
// POST /api/consent/gps-revoke
// Employee revokes previously given GPS consent (GDPR Art. 7(3) —
// revocation must be as easy as giving consent). Symmetric to /gps-acceptance.
// =====================================================
router.post('/gps-revoke', async (req, res, next) => {
  try {
    const { client_id, employee_id } = req.user;

    const updateResult = await pool.query(
      `UPDATE employees
       SET gps_consent_given = false
       WHERE id = $1 AND client_id = $2
       RETURNING id, email, gps_consent_given`,
      [employee_id, client_id]
    );

    if (updateResult.rows.length === 0) {
      return next(new ValidationError('Employee not found or permission denied'));
    }

    const logResult = await pool.query(
      `INSERT INTO employee_consent_log
       (employee_id, client_id, consent_type, consent_given, privacy_policy_version, user_agent, ip_address, accepted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING id, accepted_at`,
      [employee_id, client_id, 'gps', false, '2.0', req.get('user-agent') || 'unknown', req.ip || '0.0.0.0']
    );

    await logAudit(pool, {
      action: 'gps_consent_revoked',
      entity: 'employee_consent_log',
      entityId: logResult.rows[0].id,
      oldValue: null,
      newValue: { employee_id, consent_type: 'gps', consent_given: false },
      userId: employee_id,
      clientId: client_id,
    }).catch((err) => logger.warn('Audit log GPS consent revoke failed:', err));

    res.json({
      success: true,
      message: 'GPS consent revoked',
      data: { employee_id, gps_consent_given: false },
    });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 8: Rieseguire i test**

Run: `cd backend && npx jest consent`
Expected: PASS su tutti.

- [ ] **Step 9: Suite completa backend**

Run: `cd backend && npm test`
Expected: tutti verdi.

- [ ] **Step 10: Commit**

```bash
git add backend/src/routes/consent.js backend/src/__tests__/consent.test.js
git commit -m "fix(backend): correct silently-noop logAudit params on gps-acceptance, add symmetric gps-revoke endpoint (GDPR Art. 7(3))"
```

---

## Task 6: Mobile — `secureAuthStorage.setUser()`

**Files:**
- Modify: `frontend-mobile/src/services/secureAuthStorage.js`
- Test: Create or extend `frontend-mobile/src/__tests__/secureAuthStorage.test.js`

- [ ] **Step 1: Verificare se esiste già un file di test per questo modulo**

Run: `find frontend-mobile/src/__tests__ -iname "*secureAuthStorage*"`

Se non esiste, crearlo nuovo con il setup minimo (mock di `expo-secure-store`). Se esiste, estenderlo seguendo lo stesso pattern di mock già presente.

- [ ] **Step 2: Test rosso**

```javascript
// frontend-mobile/src/__tests__/secureAuthStorage.test.js (nuovo se non esiste, altrimenti aggiungere questo describe)
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const SecureStore = require('expo-secure-store');
const secureAuthStorage = require('../services/secureAuthStorage').default;

describe('secureAuthStorage.setUser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fa merge del patch con l\'utente esistente, non lo sovrascrive interamente', async () => {
    SecureStore.getItemAsync.mockResolvedValue(JSON.stringify({ name: 'Maria', employee_id: 'emp-1', gps_consent_given: false }));
    SecureStore.setItemAsync.mockResolvedValue(undefined);

    const merged = await secureAuthStorage.setUser({ gps_consent_given: true });

    expect(merged).toEqual({ name: 'Maria', employee_id: 'emp-1', gps_consent_given: true });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('badge_user', JSON.stringify(merged));
  });

  it('funziona anche quando non c\'è ancora nessun utente salvato', async () => {
    SecureStore.getItemAsync.mockResolvedValue(null);
    SecureStore.setItemAsync.mockResolvedValue(undefined);

    const merged = await secureAuthStorage.setUser({ gps_consent_given: true });

    expect(merged).toEqual({ gps_consent_given: true });
  });
});
```

- [ ] **Step 3: Eseguire e verificare che fallisca**

Run: `cd frontend-mobile && npm test -- secureAuthStorage`
Expected: FAIL — `setUser` non è una funzione esportata da `secureAuthStorage`.

- [ ] **Step 4: Implementare `setUser`**

In `frontend-mobile/src/services/secureAuthStorage.js`, dentro l'oggetto `secureAuthStorage` (dopo il metodo `getUser`, riga 57, prima di `setSession`):

```javascript
  async setUser(patch) {
    const current = await this.getUser();
    const merged = { ...(current || {}), ...patch };
    await setItem(USER_DATA, JSON.stringify(merged));
    return merged;
  },

```

- [ ] **Step 5: Rieseguire il test**

Run: `cd frontend-mobile && npm test -- secureAuthStorage`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend-mobile/src/services/secureAuthStorage.js frontend-mobile/src/__tests__/secureAuthStorage.test.js
git commit -m "feat(mobile): add secureAuthStorage.setUser() for partial local user cache updates"
```

---

## Task 7: Mobile — dipendenza `expo-location` + configurazione permessi

**Files:**
- Modify: `frontend-mobile/package.json` (via comando, non a mano)
- Modify: `frontend-mobile/app.json`

- [ ] **Step 1: Installare la dipendenza con la versione corretta per l'SDK installato**

Run: `cd frontend-mobile && npx expo install expo-location`

Expected: `expo-location` aggiunto a `package.json` con la versione compatibile con Expo SDK ~54.0.0 (risolta automaticamente da `expo install`, non va scelta a mano).

- [ ] **Step 2: Aggiungere il permesso iOS in `app.json`**

In `frontend-mobile/app.json`, dentro `ios.infoPlist` (riga 18-23), aggiungere:

```json
      "infoPlist": {
        "NSCameraUsageDescription": "Utilizzato per scansionare il QR code della sede",
        "NSFaceIDUsageDescription": "Utilizzato per autenticare il check-in",
        "NSPhotoLibraryUsageDescription": "Non utilizzato",
        "NSLocationWhenInUseUsageDescription": "Usiamo la tua posizione solo al momento del check-in per verificare che tu sia in sede",
        "ITSAppUsesNonExemptEncryption": false
      }
```

- [ ] **Step 3: Aggiungere il plugin `expo-location` con permesso configurato**

Nell'array `plugins` (riga 47-66), aggiungere dopo `expo-local-authentication`:

```json
    "plugins": [
      "expo-updates",
      [
        "expo-local-authentication",
        {
          "faceIDPermission": "Autorizza Badge System a usare Face ID per il check-in"
        }
      ],
      [
        "expo-location",
        {
          "locationWhenInUsePermission": "Usiamo la tua posizione solo al momento del check-in per verificare che tu sia in sede"
        }
      ],
      "expo-asset",
      "expo-font",
      [
        "@sentry/react-native/expo",
        {
          "organization": "dataxium",
          "project": "badge-mobile"
        }
      ],
      "@react-native-community/datetimepicker",
      "expo-secure-store"
    ],
```

- [ ] **Step 4: Incrementare `ios.buildNumber`**

In `app.json`, riga 17, `"buildNumber": "35"` → `"buildNumber": "36"` (nuova build nativa richiesta — `expo-location` non è OTA-deployabile, stesso motivo già documentato per `expo-secure-store` in Fase B).

- [ ] **Step 5: Verificare che l'app si avvii ancora in locale (nessun test automatico per questo step — è configurazione, non codice testabile)**

Run: `cd frontend-mobile && npx expo start` (avviare, verificare nessun errore di config all'avvio, poi fermare con Ctrl+C — non serve una build completa a questo punto del piano).

- [ ] **Step 6: Commit**

```bash
git add frontend-mobile/package.json frontend-mobile/package-lock.json frontend-mobile/app.json
git commit -m "feat(mobile): add expo-location dependency + iOS location permission config (finding #2), bump buildNumber to 36"
```

---

## Task 8: Mobile — riscrittura `GPSConsentDialog.jsx`

**Files:**
- Modify: `frontend-mobile/src/components/GPSConsentDialog.jsx`
- Test: Create `frontend-mobile/src/__tests__/GPSConsentDialog.test.jsx`

- [ ] **Step 1: Aggiungere `CONSENT_GPS_REVOKE` a `endpoints.js` (serve anche qui per coerenza, anche se usato pienamente in Task 11)**

In `frontend-mobile/src/config/endpoints.js`, riga 24, subito dopo `CONSENT_GPS_ACCEPTANCE`:

```javascript
  // Consent (GDPR Art. 7)
  CONSENT_GPS_ACCEPTANCE: '/api/v1/consent/gps-acceptance',
  CONSENT_GPS_REVOKE: '/api/v1/consent/gps-revoke',
```

- [ ] **Step 2: Test rosso**

```javascript
// frontend-mobile/src/__tests__/GPSConsentDialog.test.jsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('../services/apiClient', () => ({ post: jest.fn() }));
jest.mock('../services/secureAuthStorage', () => ({ setUser: jest.fn() }));

const apiClient = require('../services/apiClient').default || require('../services/apiClient');
const secureAuthStorage = require('../services/secureAuthStorage').default || require('../services/secureAuthStorage');
const GPSConsentDialog = require('../components/GPSConsentDialog').default;

describe('GPSConsentDialog', () => {
  beforeEach(() => jest.clearAllMocks());

  it('non renderizza nulla quando visible è false', () => {
    const { queryByText } = render(<GPSConsentDialog visible={false} onConsent={jest.fn()} onDecline={jest.fn()} />);
    expect(queryByText('Verifica di Sede', { exact: false })).toBeNull();
  });

  it('renderizza il testo quando visible è true, senza la frase "puoi rifiutare (check-in senza GPS)"', () => {
    const { getByText, queryByText } = render(<GPSConsentDialog visible onConsent={jest.fn()} onDecline={jest.fn()} />);
    expect(getByText(/Verifica di Sede/)).toBeTruthy();
    expect(queryByText(/check-in senza GPS/)).toBeNull();
  });

  it('su "Accetto": chiama l\'endpoint di consenso, aggiorna la cache locale utente, poi chiama onConsent', async () => {
    apiClient.post.mockResolvedValue({ data: { success: true } });
    secureAuthStorage.setUser.mockResolvedValue({ gps_consent_given: true });
    const onConsent = jest.fn();

    const { getByText } = render(<GPSConsentDialog visible onConsent={onConsent} onDecline={jest.fn()} />);
    fireEvent.press(getByText('Accetto'));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
      '/api/v1/consent/gps-acceptance',
      expect.objectContaining({ consent_given: true })
    ));
    expect(secureAuthStorage.setUser).toHaveBeenCalledWith({ gps_consent_given: true });
    await waitFor(() => expect(onConsent).toHaveBeenCalled());
  });

  it('su "Rifiuto": non chiama l\'endpoint, chiama onDecline', () => {
    const onDecline = jest.fn();
    const { getByText } = render(<GPSConsentDialog visible onConsent={jest.fn()} onDecline={onDecline} />);
    fireEvent.press(getByText('Rifiuto'));

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(onDecline).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Eseguire e verificare che fallisca**

Run: `cd frontend-mobile && npm test -- GPSConsentDialog`
Expected: FAIL — il componente attuale importa `AlertDialog` da `react-native` (API inesistente), quindi il render probabilmente lancia un errore prima ancora di arrivare alle asserzioni; inoltre non chiama né `apiClient.post` né `secureAuthStorage.setUser` oggi.

- [ ] **Step 4: Riscrivere il componente**

```javascript
// frontend-mobile/src/components/GPSConsentDialog.jsx
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Linking,
  StyleSheet,
} from 'react-native';
import apiClient from '../services/apiClient';
import secureAuthStorage from '../services/secureAuthStorage';
import { ENDPOINTS } from '../config/endpoints';

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E3A5F',
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    color: '#2A2520',
    lineHeight: 20,
  },
  link: {
    color: '#0066CC',
    textDecorationLine: 'underline',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  button: {
    minWidth: 100,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  declineButton: { backgroundColor: '#FBEAEA' },
  declineText: { color: '#B91C1C', fontWeight: '600' },
  acceptButton: { backgroundColor: '#2D7049' },
  acceptText: { color: '#fff', fontWeight: '600' },
});

/**
 * GPSConsentDialog — GDPR Art. 7 explicit consent for geofencing
 * Shown before il primo check-in su una sede con geofencing attivo, e ad ogni
 * scan successivo finché il dipendente non accetta (nessun cooldown — il
 * check-in resta bloccato su quella sede fino al consenso, Fase C).
 */
export default function GPSConsentDialog({ visible, onConsent, onDecline }) {
  const [submitting, setSubmitting] = useState(false);

  if (!visible) return null;

  const handlePrivacyLink = () => {
    Linking.openURL('https://badge.dataxiom.it/privacy-policy-it');
  };

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      await apiClient.post(ENDPOINTS.CONSENT_GPS_ACCEPTANCE, {
        consent_given: true,
        privacy_policy_version: '2.0',
      });
      await secureAuthStorage.setUser({ gps_consent_given: true });
      onConsent();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <Text style={styles.title}>📍 Verifica di Sede</Text>
          <Text style={styles.message}>
            Il datore di lavoro ha abilitato la verifica di sede (GPS). Badge System registra la tua posizione solo al momento del check-in per verificare che tu sia fisicamente in sede.{'\n\n'}
            <Text style={{ fontWeight: '600' }}>Dati raccolti:</Text>
            {'\n'}• Latitudine e longitudine al momento del check-in{'\n'}
            {'\n'}
            <Text style={{ fontWeight: '600' }}>Conservazione:</Text>
            {'\n'}• Le coordinate sono cancellate automaticamente dopo 90 giorni{'\n'}
            {'\n'}
            <Text style={{ fontWeight: '600' }}>Diritti:</Text>
            {'\n'}• Puoi rivedere le coordinate via app{'\n'}
            • Puoi revocare il consenso in qualsiasi momento da Impostazioni{'\n\n'}
            <Text>
              Per dettagli vedi la{' '}
              <Text style={styles.link} onPress={handlePrivacyLink}>
                Privacy Policy
              </Text>
            </Text>
          </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity style={[styles.button, styles.declineButton]} onPress={onDecline} disabled={submitting}>
              <Text style={styles.declineText}>Rifiuto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.acceptButton]} onPress={handleAccept} disabled={submitting}>
              <Text style={styles.acceptText}>Accetto</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
```

Nota: la frase "Puoi rifiutare (check-in senza GPS, se disponibile)" del testo originale è sostituita con "Puoi revocare il consenso in qualsiasi momento da Impostazioni" — non contraddice più il blocco rigido, e anticipa la funzionalità del Task 11.

- [ ] **Step 5: Rieseguire i test**

Run: `cd frontend-mobile && npm test -- GPSConsentDialog`
Expected: PASS su tutti.

- [ ] **Step 6: Commit**

```bash
git add frontend-mobile/src/components/GPSConsentDialog.jsx frontend-mobile/src/config/endpoints.js frontend-mobile/src/__tests__/GPSConsentDialog.test.jsx
git commit -m "fix(mobile): rewrite GPSConsentDialog — previous version imported a nonexistent react-native API, was never executable (finding #2)"
```

---

## Task 9: Mobile — cache locale stato geofencing (chiave di storage)

**Files:**
- Modify: `frontend-mobile/src/config/endpoints.js`

- [ ] **Step 1: Aggiungere la nuova chiave di cache**

In `frontend-mobile/src/config/endpoints.js`, riga 108-116, dentro `STORAGE_KEYS`:

```javascript
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'badge_auth_token',
  REFRESH_TOKEN: 'badge_refresh_token',
  USER_DATA: 'badge_user',
  FACE_ID_ENABLED: 'badge_face_id_enabled',
  OFFLINE_QUEUE: 'badge_offline_queue',
  CACHE_SHIFTS: 'badge_cache_shifts',
  CACHE_PRESENCES: 'badge_cache_presences',
  // Fase C: stato geofencing per sede, popolato ad ogni check-in (successo o
  // GEOFENCE_COORDINATES_REQUIRED) — usato per decidere se bloccare l'accodamento
  // offline di un check-in su una sede nota (o sconosciuta) come geofenced.
  CACHE_GEOFENCING_STATUS: 'badge_cache_geofencing_status',
};
```

Nessun test dedicato per questo step — è una costante, verificata indirettamente dai test del Task 10 che la useranno.

- [ ] **Step 2: Commit**

```bash
git add frontend-mobile/src/config/endpoints.js
git commit -m "feat(mobile): add CACHE_GEOFENCING_STATUS storage key for offline geofencing decisions"
```

---

## Task 10: Mobile — `QRScannerScreen.jsx`: `qr_content`, retry GPS, blocco offline geofenced

**Files:**
- Modify: `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx`
- Modify: `frontend-mobile/src/__tests__/QRScannerScreen.test.jsx`

Questo è il task più corposo del piano — diviso in 3 sotto-obiettivi testati separatamente per mantenere ogni step piccolo: (A) `qr_content` sempre nel payload, (B) retry GPS su `GEOFENCE_COORDINATES_REQUIRED`, (C) blocco offline per sedi geofenced.

### 10A — `qr_content` sempre incluso nel payload

- [ ] **Step 1: Test rosso**

Aggiungere in `frontend-mobile/src/__tests__/QRScannerScreen.test.jsx`, dentro il `describe('QRScannerScreen', ...)` esistente, dopo il test `'happy path online...'`:

```javascript
  test('il payload include sempre qr_content con la stringa raw scansionata', async () => {
    apiClient.post.mockResolvedValue({ data: { data: { id: 'checkin-1' } } });
    await renderScreen();

    const qrString = buildQrString({ siteId: 'site-42', clientId: 'client-1' });
    await scan(qrString);

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    const [, postedPayload] = apiClient.post.mock.calls[0];
    expect(postedPayload.qr_content).toBe(qrString);
  });
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-mobile && npm test -- QRScannerScreen -t "qr_content"`
Expected: FAIL — `payload.qr_content` è `undefined`.

- [ ] **Step 3: Includere `data` nel payload**

In `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx`, riga 108-117, aggiungere `qr_content: data,`:

```javascript
      payload = {
        employee_id: employeeId,
        site_id: siteId,
        client_id: clientId,     // tenant id — unrelated to client_uuid
        type: checkType,
        timestamp: occurredAt,   // legacy field, harmless to keep sending
        occurred_at: occurredAt, // the field the backend actually reads
        client_uuid: clientUuid, // idempotency key
        faceid_verified: faceidVerified,
        qr_content: data,        // stringa raw scansionata (finding #5) — sempre inclusa,
                                  // indipendentemente dal geofencing, protegge anche le sedi senza GPS
      };
```

- [ ] **Step 4: Rieseguire il test**

Run: `cd frontend-mobile && npm test -- QRScannerScreen -t "qr_content"`
Expected: PASS.

### 10B — Retry GPS su `GEOFENCE_COORDINATES_REQUIRED`

- [ ] **Step 5: Test rosso — flusso completo con consenso già dato**

```javascript
  test('GEOFENCE_COORDINATES_REQUIRED con consenso già dato: acquisisce GPS e ripete la POST con lat/lng e stesso client_uuid', async () => {
    const geofenceError = makeResponseError('GPS coordinates required for check-in at this site');
    geofenceError.response = { status: 400, data: { error: 'VALIDATION_ERROR', details: { code: 'GEOFENCE_COORDINATES_REQUIRED' } } };

    apiClient.post
      .mockRejectedValueOnce(geofenceError)
      .mockResolvedValueOnce({ data: { data: { id: 'checkin-2' } } });

    authService.getUser.mockResolvedValue({ employee_id: 'emp-1', gps_consent_given: true });
    Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 45.46, longitude: 9.18 } });

    const { navigation } = await renderScreen();
    await scan(buildQrString({ siteId: 'site-42', clientId: 'client-1' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));

    const [, firstPayload] = apiClient.post.mock.calls[0];
    const [, secondPayload] = apiClient.post.mock.calls[1];
    expect(secondPayload.client_uuid).toBe(firstPayload.client_uuid); // stesso client_uuid, idempotenza
    expect(secondPayload.latitude).toBe(45.46);
    expect(secondPayload.longitude).toBe(9.18);

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('Success', expect.objectContaining({ checkIn: { id: 'checkin-2' } })));
  });

  test('GEOFENCE_COORDINATES_REQUIRED senza consenso: mostra GPSConsentDialog, poi acquisisce GPS dopo "Accetto"', async () => {
    // GPSConsentDialog è mockato in questo file (vedi jest.mock in cima) come uno stub
    // che chiama onConsent/onDecline direttamente, senza eseguire la vera POST verso
    // /consent/gps-acceptance — quella chiamata reale è già coperta a fondo da
    // GPSConsentDialog.test.jsx (Task 8). Qui la sequenza di apiClient.post ha quindi
    // solo 2 elementi: il tentativo iniziale (fallito) e il retry con GPS.
    const geofenceError = makeResponseError('GPS coordinates required');
    geofenceError.response = { status: 400, data: { error: 'VALIDATION_ERROR', details: { code: 'GEOFENCE_COORDINATES_REQUIRED' } } };

    apiClient.post
      .mockRejectedValueOnce(geofenceError)
      .mockResolvedValueOnce({ data: { data: { id: 'checkin-3' } } }); // retry check-in

    authService.getUser.mockResolvedValue({ employee_id: 'emp-1', gps_consent_given: false });
    Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 45.46, longitude: 9.18 } });

    const { getByText } = await renderScreen();
    await scan(buildQrString({ siteId: 'site-42', clientId: 'client-1' }));

    await waitFor(() => expect(getByText(/Verifica di Sede/)).toBeTruthy());
    await act(async () => { fireEvent.press(getByText('Accetto')); });

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    const [, retryPayload] = apiClient.post.mock.calls[1];
    expect(retryPayload.latitude).toBe(45.46);
  });

  test('timeout GPS: mostra messaggio dedicato, "Riprova" ritenta solo l\'acquisizione posizione (nessuna nuova scansione)', async () => {
    const geofenceError = makeResponseError('GPS coordinates required');
    geofenceError.response = { status: 400, data: { error: 'VALIDATION_ERROR', details: { code: 'GEOFENCE_COORDINATES_REQUIRED' } } };

    apiClient.post.mockRejectedValueOnce(geofenceError);
    authService.getUser.mockResolvedValue({ employee_id: 'emp-1', gps_consent_given: true });
    Location.getCurrentPositionAsync.mockRejectedValueOnce(new Error('Location request timed out'));

    await renderScreen();
    await scan(buildQrString({ siteId: 'site-42', clientId: 'client-1' }));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      'Posizione non disponibile',
      expect.stringContaining('Attiva la posizione'),
      expect.any(Array)
    ));

    // "Riprova" ritenta SOLO getCurrentPositionAsync — nessuna nuova chiamata a apiClient.post
    // per un secondo tentativo di check-in "al buio" (il codice geofence è già confermato).
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  test('un secondo rifiuto (OUTSIDE_GEOFENCE) dopo il retry con GPS è un errore finale, nessun ulteriore tentativo automatico', async () => {
    const geofenceRequired = makeResponseError('GPS coordinates required');
    geofenceRequired.response = { status: 400, data: { error: 'VALIDATION_ERROR', details: { code: 'GEOFENCE_COORDINATES_REQUIRED' } } };
    const outsideGeofence = makeResponseError('Check-in location is outside the allowed area');
    outsideGeofence.response = { status: 403, data: { error: 'OUTSIDE_GEOFENCE', details: { distance_meters: 500, max_meters: 150 } } };

    apiClient.post
      .mockRejectedValueOnce(geofenceRequired)
      .mockRejectedValueOnce(outsideGeofence);

    authService.getUser.mockResolvedValue({ employee_id: 'emp-1', gps_consent_given: true });
    Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 45.50, longitude: 9.18 } });

    await renderScreen();
    await scan(buildQrString({ siteId: 'site-42', clientId: 'client-1' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      'Errore check-in',
      'Check-in location is outside the allowed area',
      expect.any(Array)
    ));
  });
```

Aggiungere in cima al file (dopo gli altri `jest.mock`, riga 40):

```javascript
jest.mock('expo-location', () => ({
  getCurrentPositionAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
}));

jest.mock('../services/secureAuthStorage', () => ({ setUser: jest.fn() }));
jest.mock('../components/GPSConsentDialog', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  return function MockGPSConsentDialog({ visible, onConsent, onDecline }) {
    if (!visible) return null;
    return React.createElement(View, null,
      React.createElement(Text, null, '📍 Verifica di Sede'),
      React.createElement(TouchableOpacity, { onPress: onConsent }, React.createElement(Text, null, 'Accetto')),
      React.createElement(TouchableOpacity, { onPress: onDecline }, React.createElement(Text, null, 'Rifiuto')),
    );
  };
});
```

e, dopo la riga 48 (`const { isLowEndDevice } = ...`), aggiungere gli import dei nuovi mock:

```javascript
const Location = require('expo-location');
const secureAuthStorage = require('../services/secureAuthStorage').default || require('../services/secureAuthStorage');
```

- [ ] **Step 6: Eseguire e verificare che tutti e 4 falliscano**

Run: `cd frontend-mobile && npm test -- QRScannerScreen -t "GEOFENCE\|timeout GPS\|OUTSIDE_GEOFENCE"`
Expected: FAIL — nessuna di questa logica esiste ancora nel componente.

- [ ] **Step 7: Implementare il flusso di retry**

In `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx`:

Aggiungere gli import (righe 1-13):

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import secureAuthStorage from '../../services/secureAuthStorage';
import GPSConsentDialog from '../../components/GPSConsentDialog';
```

(`AsyncStorage` è necessario da subito perché lo stub temporaneo `isSiteKnownNotGeofenced` introdotto in questo step verrà sostituito nel Task 10C con un'implementazione che lo usa — importarlo qui evita un secondo giro di modifiche agli import).

Aggiungere nuovo stato dentro il componente (dopo riga 25, `const processingRef = useRef(false);`):

```javascript
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  // Conserva payload/siteId tra il primo tentativo (fallito) e il retry con GPS —
  // stesso client_uuid riusato (idempotenza, ON CONFLICT DO NOTHING lato backend).
  const pendingRetryRef = useRef(null);
```

Estrarre in una funzione dedicata la logica di acquisizione posizione + retry, e modificare il blocco `catch` esistente. Sostituire l'intero blocco `catch (err) { ... }` (righe 132-184) con:

```javascript
    } catch (err) {
      const geofenceCode = err.response?.data?.details?.code;

      if (geofenceCode === 'GEOFENCE_COORDINATES_REQUIRED') {
        pendingRetryRef.current = payload;
        const user = await authService.getUser().catch(() => null);
        if (user?.gps_consent_given) {
          await acquireLocationAndRetry();
        } else {
          setShowConsentDialog(true);
        }
        return;
      }

      // `err.isAxiosError && !err.response` — a request that was actually sent but never got
      // a response (offline or POST_TIMEOUT_OFFLINE_MS hit). This must NOT match the manually
      // thrown validation errors above (QR incompleto, employee_id mancante): those have no
      // `.response` either, but they're genuine application errors caught before any request
      // was made, so they must never be queued (and `payload` may still be null at that point).
      if (payload && err.isAxiosError && !err.response) {
        // Network/timeout error — never reached the server. Se sappiamo (da cache locale) che
        // questa sede è geofenced — o non lo sappiamo affatto — non accodiamo: un check-in
        // offline non può mai ricevere l'errore GEOFENCE_COORDINATES_REQUIRED che innesca la
        // richiesta GPS, quindi accodarlo comunque produrrebbe un fallimento silenzioso solo al
        // momento del flush (Fase C, blocco fail-safe).
        const geofencingKnown = await isSiteKnownNotGeofenced(siteId);
        if (!geofencingKnown) {
          Alert.alert(
            'Connessione richiesta',
            'Questa sede richiede una connessione per verificare la posizione al momento del check-in.',
            [
              { text: 'Riprova', onPress: () => {
                processingRef.current = false;
                setScanned(false);
                setLoading(false);
              }},
              { text: 'Annulla', onPress: () => navigation.goBack() },
            ]
          );
          setLoading(false);
          return;
        }

        // Everything below (enqueue + navigate) is wrapped in one try/catch: this exact
        // catch block already crashed the app twice on an unhandled ReferenceError from a
        // variable declared in the try block above but read here (first `payload`, then
        // `siteId` — try/catch are separate lexical scopes in JS). Both are fixed now, but
        // given the same mistake happened twice in a row, any future slip here must surface
        // as a visible alert instead of an untrapped exception that hangs the spinner and
        // takes the app down.
        try {
          await enqueueCheckin(payload);
          navigation.replace('Success', { pending: true, siteId });
          return;
        } catch (queueErr) {
          const msg = queueErr.message || 'Check-in fallito';
          Alert.alert('Errore check-in', msg, [
            { text: 'Riprova', onPress: () => {
              processingRef.current = false;
              setScanned(false);
              setLoading(false);
            }},
            { text: 'Annulla', onPress: () => navigation.goBack() },
          ]);
          setLoading(false);
          return;
        }
      }

      // Application error — a real 4xx/5xx from the server (e.g. wrong site assignment,
      // ownership violation, validation error, OUTSIDE_GEOFENCE, QR_CODE_INVALID). Genuinely
      // invalid, don't enqueue, don't retry automatically.
      const msg = err.response?.data?.message || err.message || 'Check-in fallito';

      Alert.alert('Errore check-in', msg, [
        { text: 'Riprova', onPress: () => {
          processingRef.current = false;
          setScanned(false);
          setLoading(false);
        }},
        { text: 'Annulla', onPress: () => navigation.goBack() },
      ]);
      setLoading(false);
    }
  };

  // Acquisisce la posizione one-shot e ripete la POST con lo stesso client_uuid del
  // tentativo originale (idempotenza). Su timeout/permesso negato mostra un messaggio
  // dedicato con "Riprova" che ritenta SOLO l'acquisizione posizione — il QR resta valido.
  const acquireLocationAndRetry = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({ timeout: 10000 });
      const retryPayload = {
        ...pendingRetryRef.current,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      const response = await apiClient.post(ENDPOINTS.CHECKINS_POST, retryPayload, {
        timeout: OFFLINE_CONFIG.POST_TIMEOUT_OFFLINE_MS,
      });
      Vibration.vibrate(500);
      Animated.timing(successAnim, { toValue: 1, duration: 150, useNativeDriver: false }).start();
      setTimeout(() => {
        navigation.replace('Success', { checkIn: response.data.data, siteId: pendingRetryRef.current?.site_id });
      }, SUCCESS_FLASH_DURATION);
    } catch (locErr) {
      if (locErr?.isAxiosError) {
        // Il retry stesso ha ricevuto una risposta applicativa (es. OUTSIDE_GEOFENCE) —
        // errore finale, nessun ulteriore tentativo automatico.
        const msg = locErr.response?.data?.message || locErr.message || 'Check-in fallito';
        Alert.alert('Errore check-in', msg, [
          { text: 'Riprova', onPress: () => {
            processingRef.current = false;
            setScanned(false);
            setLoading(false);
          }},
          { text: 'Annulla', onPress: () => navigation.goBack() },
        ]);
      } else {
        // Timeout/permesso negato sull'acquisizione GPS stessa.
        Alert.alert('Posizione non disponibile', 'Attiva la posizione per timbrare qui.', [
          { text: 'Riprova', onPress: () => acquireLocationAndRetry() },
          { text: 'Annulla', onPress: () => navigation.goBack() },
        ]);
      }
      setLoading(false);
    }
  };

  const handleConsentAccepted = async () => {
    setShowConsentDialog(false);
    await acquireLocationAndRetry();
  };

  const handleConsentDeclined = () => {
    setShowConsentDialog(false);
    Alert.alert('Check-in bloccato', 'Il consenso alla posizione è necessario per timbrare in questa sede.', [
      { text: 'Riprova', onPress: () => setShowConsentDialog(true) },
      { text: 'Annulla', onPress: () => navigation.goBack() },
    ]);
    setLoading(false);
  };
```

Nota per l'implementer: `isSiteKnownNotGeofenced` viene introdotta nel Task 10C — a questo punto dello sviluppo (10B da solo) non esiste ancora; il test del Task 10B relativo al blocco offline NON è in questo blocco (è nel Task 10C). Se si eseguono i task in ordine, questo riferimento verrà risolto al passo successivo — non lasciare il codice in uno stato che referenzia una funzione inesistente tra un commit e l'altro: implementare 10B e 10C nello stesso passaggio di modifica al file, committare insieme se necessario, oppure spostare temporaneamente la funzione stub `async function isSiteKnownNotGeofenced() { return false; }` in cima al file in questo step e sostituirla con l'implementazione reale nel Task 10C.

Aggiungere lo stub temporaneo ora (verrà sostituito nel Task 10C):

```javascript
// Stub temporaneo — implementazione reale nel Task 10C (cache offline-geofencing).
async function isSiteKnownNotGeofenced() {
  return false;
}
```

(da inserire subito dopo le costanti `QR_PREFIX`/`SUCCESS_FLASH_DURATION`, riga 16).

Infine, aggiungere il rendering del dialog nel JSX (subito prima della chiusura `</View>` finale del componente, dopo `</SafeAreaView>`, riga 301):

```jsx
      <GPSConsentDialog
        visible={showConsentDialog}
        onConsent={handleConsentAccepted}
        onDecline={handleConsentDeclined}
      />
```

- [ ] **Step 8: Rieseguire tutti i test del Task 10B**

Run: `cd frontend-mobile && npm test -- QRScannerScreen`
Expected: PASS su tutti (inclusi quelli preesistenti — verificare nessuna regressione).

### 10C — Cache offline-geofencing (sostituisce lo stub)

- [ ] **Step 9: Test rosso**

```javascript
  test('sede nota in cache come geofenced: un check-in offline NON viene accodato, mostra messaggio esplicito', async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.CACHE_GEOFENCING_STATUS, JSON.stringify({ 'site-99': { geofenced: true } }));
    apiClient.post.mockRejectedValue(makeNetworkError());

    await renderScreen();
    await scan(buildQrString({ siteId: 'site-99', clientId: 'client-1' }));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      'Connessione richiesta',
      expect.stringContaining('verificare la posizione'),
      expect.any(Array)
    ));
    expect(enqueueCheckin).not.toHaveBeenCalled();
  });

  test('sede nota in cache come NON geofenced: un check-in offline viene accodato normalmente (comportamento invariato)', async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.CACHE_GEOFENCING_STATUS, JSON.stringify({ 'site-99': { geofenced: false } }));
    apiClient.post.mockRejectedValue(makeNetworkError());
    enqueueCheckin.mockResolvedValue(undefined);

    const { navigation } = await renderScreen();
    await scan(buildQrString({ siteId: 'site-99', clientId: 'client-1' }));

    await waitFor(() => expect(enqueueCheckin).toHaveBeenCalledTimes(1));
    expect(navigation.replace).toHaveBeenCalledWith('Success', { pending: true, siteId: 'site-99' });
  });

  test('sede mai vista in cache: un check-in offline NON viene accodato per default (fail-safe)', async () => {
    apiClient.post.mockRejectedValue(makeNetworkError());

    await renderScreen();
    await scan(buildQrString({ siteId: 'site-never-seen', clientId: 'client-1' }));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      'Connessione richiesta',
      expect.any(String),
      expect.any(Array)
    ));
    expect(enqueueCheckin).not.toHaveBeenCalled();
  });

  test('un check-in online riuscito SENZA GPS salva in cache che la sede non è geofenced', async () => {
    apiClient.post.mockResolvedValue({ data: { data: { id: 'checkin-1' } } });
    await renderScreen();

    await scan(buildQrString({ siteId: 'site-42', clientId: 'client-1' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());

    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CACHE_GEOFENCING_STATUS);
    expect(JSON.parse(raw)).toEqual({ 'site-42': { geofenced: false } });
  });

  test('GEOFENCE_COORDINATES_REQUIRED salva in cache che la sede è geofenced', async () => {
    const geofenceError = makeResponseError('GPS required');
    geofenceError.response = { status: 400, data: { error: 'VALIDATION_ERROR', details: { code: 'GEOFENCE_COORDINATES_REQUIRED' } } };
    apiClient.post.mockRejectedValueOnce(geofenceError).mockResolvedValueOnce({ data: { data: { id: 'checkin-2' } } });
    authService.getUser.mockResolvedValue({ employee_id: 'emp-1', gps_consent_given: true });
    Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 45.46, longitude: 9.18 } });

    await renderScreen();
    await scan(buildQrString({ siteId: 'site-77', clientId: 'client-1' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CACHE_GEOFENCING_STATUS);
    expect(JSON.parse(raw)).toEqual({ 'site-77': { geofenced: true } });
  });
```

Aggiungere in cima al file:

```javascript
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const AsyncStorage = require('@react-native-async-storage/async-storage');
const { STORAGE_KEYS } = require('../config/endpoints');
```

e in `beforeEach` (riga 98), aggiungere `await AsyncStorage.clear();` prima delle altre righe, per isolare i test tra loro.

- [ ] **Step 10: Eseguire e verificare che falliscano**

Run: `cd frontend-mobile && npm test -- QRScannerScreen -t "geofenced\|geofencing"`
Expected: FAIL — `isSiteKnownNotGeofenced` è ancora lo stub che ritorna sempre `false`, nessuna scrittura in cache avviene.

- [ ] **Step 11: Implementare la cache reale**

Aggiungere `STORAGE_KEYS` all'import esistente da `config/endpoints` (riga 9 del file originale):

```javascript
import { ENDPOINTS, OFFLINE_CONFIG, STORAGE_KEYS } from '../../config/endpoints';
```

Sostituire lo stub temporaneo (inserito nel Task 10B) con:

```javascript
// Cache locale stato geofencing per sede (Fase C) — stesso pattern di
// MyScheduleScreen/MyPresencesScreen (AsyncStorage, chiave centralizzata in
// config/endpoints.js). Aggiornata ad ogni determinazione certa dello stato:
// check-in online riuscito SENZA GPS (sede non geofenced) o GEOFENCE_COORDINATES_REQUIRED
// (sede geofenced). Usata solo per decidere se bloccare l'accodamento offline —
// stessa finestra di staleness già accettata altrove nell'app per i dati offline.
async function readGeofencingCache() {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.CACHE_GEOFENCING_STATUS);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

async function writeGeofencingStatus(siteId, geofenced) {
  const cache = await readGeofencingCache();
  cache[siteId] = { geofenced };
  await AsyncStorage.setItem(STORAGE_KEYS.CACHE_GEOFENCING_STATUS, JSON.stringify(cache));
}

// true SOLO se la sede è nota in cache come NON geofenced. Sede sconosciuta o nota
// come geofenced → false (fail-safe, blocca l'accodamento offline).
async function isSiteKnownNotGeofenced(siteId) {
  const cache = await readGeofencingCache();
  return cache[siteId]?.geofenced === false;
}
```

Poi collegare le due scritture nei punti giusti:

1. Nel percorso di successo (dopo `const response = await apiClient.post(...)`, riga 119-121, prima di `Vibration.vibrate(500)`), aggiungere:

```javascript
      await writeGeofencingStatus(siteId, false); // check-in riuscito senza GPS → sede non geofenced
```

2. Nel ramo `GEOFENCE_COORDINATES_REQUIRED` del `catch` (subito dopo `pendingRetryRef.current = payload;`), aggiungere:

```javascript
        await writeGeofencingStatus(siteId, true);
```

- [ ] **Step 12: Rieseguire tutti i test del file**

Run: `cd frontend-mobile && npm test -- QRScannerScreen`
Expected: PASS su tutti (Task 10A + 10B + 10C + preesistenti).

- [ ] **Step 13: Suite mobile completa**

Run: `cd frontend-mobile && npm test`
Expected: tutti verdi, nessuna regressione.

- [ ] **Step 14: Commit**

```bash
git add frontend-mobile/src/screens/checkin/QRScannerScreen.jsx frontend-mobile/src/__tests__/QRScannerScreen.test.jsx
git commit -m "feat(mobile): GPS retry flow on GEOFENCE_COORDINATES_REQUIRED, qr_content in payload, offline-geofencing cache block (finding #2+#5)"
```

---

## Task 11: Mobile — riga "Revoca consenso posizione" in Impostazioni

**Files:**
- Modify: `frontend-mobile/src/screens/settings/SettingsScreen.jsx`
- Modify: `frontend-mobile/src/__tests__/SettingsScreen.test.jsx`

- [ ] **Step 1: Test rosso**

Aggiungere in `frontend-mobile/src/__tests__/SettingsScreen.test.jsx`:

```javascript
jest.mock('../services/apiClient', () => ({ post: jest.fn() }));
jest.mock('../services/secureAuthStorage', () => ({ setUser: jest.fn() }));

const apiClient = interopDefault(require('../services/apiClient'));
const secureAuthStorage = interopDefault(require('../services/secureAuthStorage'));

describe('SettingsScreen — revoca consenso posizione', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.getItem.mockResolvedValue(null);
  });

  test('la riga NON è visibile se il dipendente non ha mai dato consenso GPS', async () => {
    authService.getUser.mockResolvedValue({ name: 'Test User', email: 'test@example.com', role: 'employee', gps_consent_given: false });
    const { queryByText } = await renderInNavigator();

    await waitFor(() => expect(queryByText('Test User')).toBeTruthy());
    expect(queryByText('Revoca consenso posizione')).toBeNull();
  });

  test('la riga è visibile se il consenso è stato dato, e la revoca chiama l\'endpoint + aggiorna la cache locale', async () => {
    authService.getUser.mockResolvedValue({ name: 'Test User', email: 'test@example.com', role: 'employee', gps_consent_given: true });
    apiClient.post.mockResolvedValue({ data: { success: true } });
    secureAuthStorage.setUser.mockResolvedValue({ gps_consent_given: false });

    const { getByText } = await renderInNavigator();
    await waitFor(() => expect(getByText('Revoca consenso posizione')).toBeTruthy());

    await act(async () => { fireEvent.press(getByText('Revoca consenso posizione')); });

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/v1/consent/gps-revoke'));
    expect(secureAuthStorage.setUser).toHaveBeenCalledWith({ gps_consent_given: false });
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-mobile && npm test -- SettingsScreen -t "revoca consenso"`
Expected: FAIL — nessuna riga del genere esiste.

- [ ] **Step 3: Implementare**

In `frontend-mobile/src/screens/settings/SettingsScreen.jsx`, aggiungere gli import (righe 1-8):

```javascript
import apiClient from '../../services/apiClient';
import secureAuthStorage from '../../services/secureAuthStorage';
import { ENDPOINTS, STORAGE_KEYS } from '../../config/endpoints';
```

(nota: `ENDPOINTS` va aggiunto all'import esistente di `STORAGE_KEYS` dalla riga 7, non duplicato).

Aggiungere il gestore, dopo `toggleFaceId` (riga 31):

```javascript
  const handleRevokeGpsConsent = () => {
    Alert.alert('Revoca consenso posizione', 'Non potrai più timbrare su sedi con verifica GPS attiva finché non ridai il consenso. Continuare?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Revoca', style: 'destructive',
        onPress: async () => {
          await apiClient.post(ENDPOINTS.CONSENT_GPS_REVOKE);
          await secureAuthStorage.setUser({ gps_consent_given: false });
          setUser((prev) => ({ ...prev, gps_consent_given: false }));
        },
      },
    ]);
  };
```

Aggiungere la riga nel JSX, dentro la sezione "Preferenze" (dopo il blocco Face ID, riga 100, prima della chiusura `</View>` della sezione):

```jsx
        {user?.gps_consent_given === true && (
          <TouchableOpacity style={styles.row} onPress={handleRevokeGpsConsent}>
            <Text style={styles.rowLabel}>Revoca consenso posizione</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
```

- [ ] **Step 4: Rieseguire i test**

Run: `cd frontend-mobile && npm test -- SettingsScreen`
Expected: PASS su tutti.

- [ ] **Step 5: Suite mobile completa**

Run: `cd frontend-mobile && npm test`
Expected: tutti verdi.

- [ ] **Step 6: Commit**

```bash
git add frontend-mobile/src/screens/settings/SettingsScreen.jsx frontend-mobile/src/__tests__/SettingsScreen.test.jsx
git commit -m "feat(mobile): add GPS consent revocation row in Settings (GDPR Art. 7(3))"
```

---

## Task 12: Web — generalizzare `ConfirmDeleteDialog`

**Files:**
- Modify: `frontend-web/src/features/admin/components/ConfirmDeleteDialog.jsx`
- Test: Create `frontend-web/src/features/admin/components/__tests__/ConfirmDeleteDialog.test.jsx`

- [ ] **Step 1: Verificare se esiste già un test per questo componente**

Run: `find frontend-web/src -iname "*ConfirmDeleteDialog*"`

Non risulta alcun file di test esistente (verificato in fase di ricerca) — crearlo nuovo.

- [ ] **Step 2: Test rosso**

```javascript
// frontend-web/src/features/admin/components/__tests__/ConfirmDeleteDialog.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfirmDeleteDialog } from '../ConfirmDeleteDialog';

describe('ConfirmDeleteDialog', () => {
  it('usa "Elimina" e colore error di default (comportamento invariato per i call-site esistenti)', () => {
    render(<ConfirmDeleteDialog open title="t" description="d" onConfirm={vi.fn()} onCancel={vi.fn()} loading={false} />);
    expect(screen.getByText('Elimina')).toBeInTheDocument();
  });

  it('accetta confirmLabel/confirmColor personalizzati', () => {
    render(
      <ConfirmDeleteDialog
        open title="t" description="d" onConfirm={vi.fn()} onCancel={vi.fn()} loading={false}
        confirmLabel="Rigenera" confirmColor="warning"
      />
    );
    expect(screen.getByText('Rigenera')).toBeInTheDocument();
    expect(screen.queryByText('Elimina')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Eseguire e verificare che il secondo test fallisca**

Run: `cd frontend-web && npx vitest run ConfirmDeleteDialog`
Expected: primo test PASS (comportamento già esistente), secondo test FAIL — il bottone mostra sempre "Elimina", ignora `confirmLabel`.

- [ ] **Step 4: Generalizzare il componente**

In `frontend-web/src/features/admin/components/ConfirmDeleteDialog.jsx`:

```javascript
import React from 'react';
import {
  Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle,
} from '@mui/material';

export function ConfirmDeleteDialog({
  open, title, description, onConfirm, onCancel, loading,
  confirmLabel = 'Elimina', confirmColor = 'error',
}) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{description}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>Annulla</Button>
        <Button onClick={onConfirm} color={confirmColor} variant="contained" disabled={loading}>
          {loading ? <CircularProgress size={18} /> : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 5: Rieseguire i test**

Run: `cd frontend-web && npx vitest run ConfirmDeleteDialog`
Expected: PASS su entrambi.

- [ ] **Step 6: Suite web completa (verificare che i call-site esistenti — SitesTab delete, altri usi di ConfirmDeleteDialog — non regrediscano)**

Run: `cd frontend-web && npm test`
Expected: tutti verdi.

- [ ] **Step 7: Commit**

```bash
git add frontend-web/src/features/admin/components/ConfirmDeleteDialog.jsx frontend-web/src/features/admin/components/__tests__/ConfirmDeleteDialog.test.jsx
git commit -m "refactor(web): generalize ConfirmDeleteDialog with optional confirmLabel/confirmColor, defaults unchanged"
```

---

## Task 13: Web — bottone "Rigenera QR" in `SitesTab.jsx`

**Files:**
- Modify: `frontend-web/src/features/admin/tabs/SitesTab.jsx`
- Test: Create `frontend-web/src/features/admin/tabs/__tests__/SitesTab.test.jsx`

- [ ] **Step 1: Test rosso**

Non esiste alcun test per `SitesTab.jsx` — file nuovo, con solo lo scenario del bottone "Rigenera QR" (non l'intera suite del componente, fuori scope di questo piano):

```javascript
// frontend-web/src/features/admin/tabs/__tests__/SitesTab.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SitesTab from '../SitesTab';
import apiClient from '../../../../services/apiClient';
import { useFetch } from '../../components/useFetch';

vi.mock('../../../../services/apiClient');
vi.mock('../../components/useFetch');

describe('SitesTab — Rigenera QR', () => {
  const site = {
    id: 'site-1', name: 'Torino Store', client_name: 'Dataxiom', location: 'Via Roma 1',
    qr_code_content: 'badge://checkin?site_id=site-1&client_id=client-1&v=OLD',
    geofencing_feature_enabled: true, geofence_enabled: false, geofence_radius_meters: 150,
    created_at: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useFetch.mockImplementation((url) => {
      if (url.includes('/clients')) return { data: [{ id: 'client-1', name: 'Dataxiom', geofencing_feature_enabled: true }] };
      return { data: [site], loading: false, error: null, reload: vi.fn() };
    });
  });

  it('apre il dialog di conferma con testo esplicito sull\'invalidazione del poster', async () => {
    render(<SitesTab />);
    fireEvent.click(screen.getByRole('button', { name: /rigenera qr/i }));

    expect(await screen.findByText(/smette immediatamente di funzionare/i)).toBeInTheDocument();
  });

  it('alla conferma chiama POST /api/admin/sites/:id/regenerate-qr e ricarica la tabella', async () => {
    apiClient.post.mockResolvedValue({ data: { success: true, data: { ...site, qr_code_content: 'badge://checkin?site_id=site-1&client_id=client-1&v=NEW' } } });

    render(<SitesTab />);
    fireEvent.click(screen.getByRole('button', { name: /rigenera qr/i }));
    fireEvent.click(await screen.findByText('Rigenera'));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/v1/admin/sites/site-1/regenerate-qr'));
  });
});
```

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd frontend-web && npx vitest run SitesTab`
Expected: FAIL — nessun bottone "Rigenera QR" esiste.

- [ ] **Step 3: Implementare**

In `frontend-web/src/features/admin/tabs/SitesTab.jsx`:

Aggiungere lo stato (dopo riga 173, `const [geofenceTarget, setGeofenceTarget] = useState(null);`):

```javascript
  const [regenerateTarget, setRegenerateTarget] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
```

Aggiungere il gestore (dopo `handleDelete`, riga 187):

```javascript
  const handleRegenerateQr = async () => {
    setRegenerating(true);
    try {
      await apiClient.post(`/api/v1/admin/sites/${regenerateTarget.id}/regenerate-qr`);
      setRegenerateTarget(null);
      reload();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
      setRegenerateTarget(null);
    } finally {
      setRegenerating(false);
    }
  };
```

Aggiungere il bottone nella cella azioni della tabella (dopo il bottone "Elimina sede", subito prima della chiusura `</TableCell>` che contiene `<Tooltip title="Elimina sede">`):

```jsx
                        <Tooltip title="Rigenera QR — il poster stampato smette di funzionare">
                          <IconButton size="small" onClick={() => setRegenerateTarget(s)}>
                            <QrCodeIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
```

Aggiungere l'import dell'icona (riga 9, accanto agli altri import di icone):

```javascript
import QrCodeIcon from '@mui/icons-material/QrCode';
```

Aggiungere il dialog di conferma (subito dopo `<ConfirmDeleteDialog ... />` esistente, prima del blocco `{geofenceTarget && (...)}`):

```jsx
      <ConfirmDeleteDialog
        open={!!regenerateTarget}
        title={`Rigenera QR per "${regenerateTarget?.name}"?`}
        description="Il poster stampato attualmente in uso smette immediatamente di funzionare. Dovrai scaricare e ristampare il nuovo QR."
        onConfirm={handleRegenerateQr}
        onCancel={() => setRegenerateTarget(null)}
        loading={regenerating}
        confirmLabel="Rigenera"
        confirmColor="warning"
      />
```

- [ ] **Step 4: Rieseguire i test**

Run: `cd frontend-web && npx vitest run SitesTab`
Expected: PASS su entrambi.

- [ ] **Step 5: Suite web completa**

Run: `cd frontend-web && npm test`
Expected: tutti verdi.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/features/admin/tabs/SitesTab.jsx frontend-web/src/features/admin/tabs/__tests__/SitesTab.test.jsx
git commit -m "feat(web): add Rigenera QR button in SitesTab with explicit invalidation warning (finding #5)"
```

---

## Task 14: Gate finale — suite completa, lint, push, verifica staging, build nativa

- [ ] **Step 1: Suite completa dei 3 progetti**

Run: `cd backend && npm test`
Run: `cd frontend-web && npm test`
Run: `cd frontend-mobile && npm test`
Expected: tutti verdi, zero regressioni rispetto al baseline pre-piano.

- [ ] **Step 2: Lint (ricorda la lezione di Session 89 — npm test non esegue lint)**

Run: `cd backend && npm run lint`
Run: `cd frontend-web && npm run lint` (se presente)
Run: `cd frontend-mobile && npm run lint` (se presente)
Expected: nessun errore.

- [ ] **Step 3: Push su develop**

```bash
git push origin develop
```

Verificare che `deploy-staging.yml` completi con successo.

- [ ] **Step 4: Build nativa mobile (obbligatoria — `expo-location` non è OTA)**

Lanciare la build su Codemagic (stesso processo di Session 93/95, nessun trigger automatico configurato) — azione dell'utente, non eseguibile da questo piano.

- [ ] **Step 5: Verifica manuale utente su staging**

Chiedere esplicitamente all'utente di verificare, in particolare:
- Attivare `geofencing_feature_enabled` per un cliente demo dalla tab Impostazioni (senza intervento SSM) e `geofence_enabled` per una sede dalla tab Sedi — confermare che il toggle admin sia sufficiente, nessun flag Dataxiom richiesto.
- Un check-in su quella sede fuori raggio richiede consenso GPS al primo tentativo, poi rifiuta con messaggio chiaro se fuori raggio.
- "Rigenera QR" su una sede: il vecchio QR (se ancora testabile) viene rifiutato con `QR_CODE_INVALID`.
- Revoca del consenso GPS da Impostazioni: il check-in successivo richiede di nuovo il consenso.
- Un check-in offline (aereo attivo) su una sede geofenced nota mostra il messaggio "Connessione richiesta", non un accodamento silenzioso.

- [ ] **Step 6: Merge in main SOLO dopo conferma esplicita dell'utente**

```bash
git checkout main
git merge develop
git push origin main
```

Non eseguire questo step senza una conferma esplicita e separata dell'utente dopo la verifica su staging E dopo la conferma che la build nativa è stata distribuita (o almeno lanciata) — a differenza del Gruppo 1 (PDF/FAQ), questo piano non è utilizzabile dagli utenti reali finché la build nativa non arriva.

---

## Note per l'implementer (subagent-driven-development / executing-plans)

- I numeri di riga citati in questo piano riflettono lo stato del codice al 9 Agosto 2026 — **rileggere sempre il file reale prima di applicare un diff**, non fidarsi ciecamente del numero di riga.
- Il Task 10 (QRScannerScreen.jsx) è deliberatamente diviso in 3 sotto-obiettivi (10A/10B/10C) ma va implementato come un'unica sequenza di modifiche coerente al file — lo stub temporaneo di `isSiteKnownNotGeofenced` esiste solo per permettere di scrivere il piano in ordine logico, non per creare due commit separati con codice stub in mezzo. Se si esegue con subagent-driven-development, considerare di assegnare l'intero Task 10 a un singolo subagent invece di spezzarlo in 3 dispatch separati.
- Nessun task di questo piano introduce una migration — verificato che tutte le colonne/tabelle toccate (`sites.qr_code_content`, `sites.geofence_enabled`, `clients.geofencing_feature_enabled`, `checkins.checkin_latitude/longitude`, `employees.gps_consent_given`, `employee_consent_log`) esistono già.
- Il fix del bug preesistente `logAudit` (Task 5) tocca 4 test esistenti in `consent.test.js` che oggi assumono 2 chiamate a `pool.query` — verificare con attenzione che tutti e 4 vengano aggiornati, non solo quello esplicitamente riscritto nello Step 1.
- La build nativa (Task 14, Step 4) non è automatizzabile da questo piano — stesso vincolo già incontrato per Fase B (Session 94-95).
