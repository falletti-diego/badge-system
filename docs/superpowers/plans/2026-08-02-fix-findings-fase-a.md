# Fase A — Fix Findings 2 Agosto 2026 (isolati, basso rischio) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere 8 findings isolati e a basso rischio da `findings2agosto2016.md` (#4, #6, #7, #9, #10, #11, #12, #13) con TDD, più la verifica-e-chiusura del finding #8 (nessun codice necessario). Findings #1 (mobile secure storage) e #2+#5 (geofencing/QR rotation) sono deliberatamente FUORI SCOPE — vanno in Fase B e Fase C, piani separati. Finding #3 (web token in localStorage) resta deliberatamente non affrontato, coerente con la decisione già presa in `TASKS.md` C.5.3 ("Phase 2 TODO, non MVP-critical").

**Architecture:** Nessuna modifica architetturale. Ogni finding è un fix mirato nel file/pattern già esistente, seguendo esattamente le convenzioni già in uso nel repo (es. il fix del finding #4 ricalca 1:1 il pattern già usato per `is_offline` in `checkins.js`). Ogni fix ha un test rosso→verde dedicato che riproduce lo scenario di fallimento descritto nel finding, non solo un'asserzione generica.

**Tech Stack:** Node.js/Express/Zod/Jest (backend) · React/Vitest (frontend-web) · React Native/Jest (frontend-mobile) · PostgreSQL migrations.

**Rollout:** Ogni task committa su `develop` (non `main`). A fine piano: `/test-all` completo → push `develop` → verifica automatica staging (`deploy-staging.yml`) → verifica manuale utente su staging (in particolare #4 e #13, che toccano UI) → merge `develop`→`main` solo dopo conferma esplicita dell'utente. Nessun push diretto su `main` in questo piano.

---

## File Structure (riepilogo di cosa viene toccato)

**Backend:**
- `backend/migrations/036_add_faceid_verified_to_checkins.sql` (nuovo) — finding #4
- `backend/migrations/037_add_client_id_to_audit_log.sql` (nuovo) — finding #6
- `backend/src/middleware/validation.js` — aggiunge `faceid_verified` allo schema Zod di POST /checkins (#4)
- `backend/src/routes/checkins.js` — INSERT/SELECT `faceid_verified` (#4), scoping client_id sulla query di assegnazione sede (#10)
- `backend/src/middleware/audit.js` — popola `client_id` nell'INSERT (#6)
- `backend/src/routes/auth.js` — aggiunge `jti` al payload dell'access token nei 3 punti di emissione (#12)
- `backend/src/middleware/auth.js` — calcola `jti_hash` da `decoded.jti` e lo allega a `req.user` (#12)
- Test: `backend/src/__tests__/checkins-faceid.test.js`, `checkins-audit-client-scope.test.js` (nuovi), estensioni a `checkins-ownership.test.js` (#10), `auth-checkrevoked.test.js` (#12), nuovo `admin-role-guard.test.js` (#8, verifica)

**Frontend-web:**
- `frontend-web/src/features/dashboard/components/PresencesTable.jsx` — chip "No Face ID" (#4), messaggio chiaro invece di `—` (#11)
- `frontend-web/src/features/dashboard/hooks/usePresences.js` — `setError` anche nel poller (#9)
- `frontend-web/src/services/authService.js` — lock cross-tab atomico via Web Locks API (#7)
- `frontend-web/src/features/dashboard/components/ExportButton.jsx` — legge `X-Truncated` e mostra avviso (#13)
- Test: estensioni a `PresencesTable.test.jsx` (#4, #11), `authService.test.js` (#7), nuovi `usePresences.test.js`, `ExportButton.test.jsx`

**Frontend-mobile:**
- `frontend-mobile/src/screens/checkin/FaceIDScreen.jsx:73` — passa `{ faceidVerified: true }` (#4)
- `frontend-mobile/src/screens/checkin/CheckInScreen.jsx` — passa `{ faceidVerified: false }` quando salta Face ID (#4)
- `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx` — legge `route.params`, include `faceid_verified` nel payload (#4)
- Test: estensioni a `FaceIDScreen.test.jsx`, `QRScannerScreen.test.jsx`

---

## Task 1: Migration — colonna `faceid_verified` su `checkins`

**Files:**
- Create: `backend/migrations/036_add_faceid_verified_to_checkins.sql`

- [ ] **Step 1: Scrivere la migration**

```sql
-- 036_add_faceid_verified_to_checkins.sql
-- Finding #4 (2026-08-02): rende visibile quando un check-in NON ha avuto
-- attestazione biometrica (hardware assente o utente ha disabilitato il
-- toggle in Impostazioni). Non è un controllo di sicurezza enforced
-- server-side (il client potrebbe mentire, come is_offline prima di essere
-- derivato — qui però non è derivabile server-side, è un fatto del device),
-- è metadato di audit/dashboard, stesso ruolo di is_offline.
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS faceid_verified BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Applicare in locale e verificare**

Run: `cd backend && npm run migrate` (o lo script equivalente già in uso, es. `node scripts/run-migrations.js`)
Expected: la migration 035 applicata senza errori; `\d checkins` in psql mostra la nuova colonna.

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/036_add_faceid_verified_to_checkins.sql
git commit -m "feat(db): add faceid_verified column to checkins (finding #4)"
```

---

## Task 2: Backend — accettare e persistere `faceid_verified` su POST /checkins

**Files:**
- Modify: `backend/src/middleware/validation.js` (schema `PostCheckinSchema`)
- Modify: `backend/src/routes/checkins.js` (handler POST, INSERT, GET list)
- Test: Create `backend/src/__tests__/checkins-faceid.test.js`

- [ ] **Step 1: Scrivere il test rosso**

```javascript
// backend/src/__tests__/checkins-faceid.test.js
const request = require('supertest');
const app = require('../app');
const { pool } = require('../db/pool');
const { getDefaultAdminUser } = require('../__fixtures__/demo-users'); // pattern esistente nel repo

describe('POST /api/v1/checkins — faceid_verified (finding #4)', () => {
  afterAll(async () => { await pool.end(); });

  it('persiste faceid_verified:false quando il client lo dichiara esplicitamente', async () => {
    const admin = getDefaultAdminUser();
    // riusa employee/site demo già assegnati nel fixture, come fanno gli altri test checkins-*.test.js
    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${global.testToken}`) // vedi helper già usato in checkins-offline.test.js
      .send({
        employee_id: global.demoEmployeeId,
        site_id: global.demoSiteId,
        type: 'IN',
        faceid_verified: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.faceid_verified).toBe(false);
  });

  it('default a false quando il client non lo invia (retrocompatibilità)', async () => {
    const res = await request(app)
      .post('/api/v1/checkins')
      .set('Authorization', `Bearer ${global.testToken}`)
      .send({ employee_id: global.demoEmployeeId, site_id: global.demoSiteId, type: 'OUT' });

    expect(res.status).toBe(201);
    expect(res.body.data.faceid_verified).toBe(false);
  });
});
```

Nota per l'implementer: adatta l'helper di auth/token esatto guardando l'inizio di `checkins-offline.test.js` o `checkins-ownership.test.js` (pattern già consolidato nel repo, non reinventarlo).

- [ ] **Step 2: Eseguire e verificare che fallisca**

Run: `cd backend && npx jest checkins-faceid --silent=false`
Expected: FAIL — `faceid_verified` undefined nella response (lo schema Zod lo scarta, `.strict()` non presente ma il campo non è nell'INSERT/RETURNING).

- [ ] **Step 3: Aggiungere il campo allo schema Zod**

In `backend/src/middleware/validation.js`, dentro `PostCheckinSchema.body`, subito dopo il commento su `client_uuid`:

```javascript
    client_uuid: z.string().uuid('Invalid client_uuid: must be valid UUID').optional(),
    // faceid_verified (finding #4, 2026-08-02): dichiarato dal client (FaceIDScreen ha
    // eseguito con successo prima del check-in). NON è un controllo di sicurezza — a
    // differenza di is_offline non è derivabile server-side — è visibilità/audit: rende
    // esplicito nel dashboard/audit log quando un check-in non ha avuto attestazione
    // biometrica, invece di nasconderlo silenziosamente.
    faceid_verified: z.boolean().optional().default(false),
```

- [ ] **Step 4: Destrutturare e passare all'INSERT in `checkins.js`**

In `backend/src/routes/checkins.js`, riga 36, estendi la destrutturazione:

```javascript
  const { employee_id, site_id, type, occurred_at, client_uuid, faceid_verified } = req.validated.body;
```

Poi nell'INSERT (blocco intorno alla riga 129), aggiungi la colonna:

```javascript
      const checkinResult = await client.query(
        `INSERT INTO checkins (
          employee_id, site_id, client_id, type, timestamp, created_by, created_at,
          checkin_latitude, checkin_longitude, client_uuid, is_offline, faceid_verified
        ) VALUES ($1, $2, $3, $4, COALESCE($8::timestamptz, NOW()), $5, NOW(), $6, $7, $9, $10, $11)
        ON CONFLICT (client_id, client_uuid) WHERE client_uuid IS NOT NULL DO NOTHING
        RETURNING id, employee_id, site_id, type, timestamp, created_at, is_offline, faceid_verified`,
        [employee_id, site_id, clientId, type, employee_id,
          checkinLat != null ? checkinLat : null,
          checkinLng != null ? checkinLng : null,
          occurred_at || null,
          client_uuid || null,
          is_offline === true,
          faceid_verified === true]
      );
```

E nella SELECT di recovery (dedup path, poche righe sotto) aggiungi `faceid_verified` alla lista colonne.

- [ ] **Step 5: Aggiungere `faceid_verified` alla GET /api/v1/checkins (list)**

Nella query SELECT della route GET (intorno alla riga 260), aggiungi `c.faceid_verified,` accanto a `c.is_offline,`.

- [ ] **Step 6: Rieseguire il test**

Run: `cd backend && npx jest checkins-faceid`
Expected: PASS.

- [ ] **Step 7: Rieseguire l'intera suite backend per non-regressione**

Run: `cd backend && npm test`
Expected: tutti verdi (nessuna regressione su `checkins.test.js`, `checkins-offline.test.js`, `checkins-ownership.test.js`, `checkins-geofence.test.js` — l'INSERT ora ha una colonna in più ma con default `false`, retrocompatibile).

- [ ] **Step 8: Commit**

```bash
git add backend/src/middleware/validation.js backend/src/routes/checkins.js backend/src/__tests__/checkins-faceid.test.js
git commit -m "feat(backend): accept and persist faceid_verified on check-in (finding #4)"
```

---

## Task 3: Frontend-web — badge "No Face ID" in dashboard

**Files:**
- Modify: `frontend-web/src/features/dashboard/components/PresencesTable.jsx`
- Test: Modify `frontend-web/src/__tests__/PresencesTable.test.jsx`

- [ ] **Step 1: Test rosso**

Aggiungi in `PresencesTable.test.jsx` (segui il pattern del test esistente per il chip "Offline"):

```javascript
it('mostra il chip "No Face ID" quando faceid_verified è false', () => {
  const data = { rows: [{ id: 'c1', employee_id: 'e1', type: 'IN', timestamp: '2026-08-02T09:00:00Z', faceid_verified: false }], total: 1 };
  render(<PresencesTable data={data} />);
  expect(screen.getByText('No Face ID')).toBeInTheDocument();
});

it('non mostra il chip quando faceid_verified è true', () => {
  const data = { rows: [{ id: 'c1', employee_id: 'e1', type: 'IN', timestamp: '2026-08-02T09:00:00Z', faceid_verified: true }], total: 1 };
  render(<PresencesTable data={data} />);
  expect(screen.queryByText('No Face ID')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Eseguire e verificare fallimento**

Run: `cd frontend-web && npx vitest run PresencesTable`
Expected: FAIL — nessun chip renderizzato oggi per `faceid_verified`.

- [ ] **Step 3: Implementare il chip**

In `PresencesTable.jsx`, subito dopo il blocco `{row.is_offline && (...)}` (riga ~168), aggiungi:

```jsx
                  {row.faceid_verified === false && (
                    <Chip label="No Face ID" size="small" color="warning" sx={{ ml: 1, height: '20px', fontSize: '0.7rem' }} />
                  )}
```

- [ ] **Step 4: Rieseguire il test**

Run: `cd frontend-web && npx vitest run PresencesTable`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/features/dashboard/components/PresencesTable.jsx frontend-web/src/__tests__/PresencesTable.test.jsx
git commit -m "feat(web): show No Face ID badge on unverified check-ins (finding #4)"
```

---

## Task 4: Frontend-mobile — propagare l'esito Face ID nel payload di check-in

**Files:**
- Modify: `frontend-mobile/src/screens/checkin/FaceIDScreen.jsx:73`
- Modify: `frontend-mobile/src/screens/checkin/CheckInScreen.jsx` (handleCheckIn)
- Modify: `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx`
- Test: Modify `frontend-mobile/src/__tests__/FaceIDScreen.test.jsx`, `QRScannerScreen.test.jsx`

- [ ] **Step 1: Test rosso su FaceIDScreen**

In `FaceIDScreen.test.jsx`, aggiungi:

```javascript
it('naviga a QRScanner passando faceidVerified:true dopo un successo', async () => {
  // ... setup esistente che porta authenticateAsync a risolvere {success:true}
  await waitFor(() => {
    expect(mockNavigation.replace).toHaveBeenCalledWith('QRScanner', { faceidVerified: true });
  });
});
```

- [ ] **Step 2: Eseguire e verificare fallimento**

Run: `cd frontend-mobile && npm test -- FaceIDScreen`
Expected: FAIL — oggi la chiamata è `navigation.replace('QRScanner')` senza secondo argomento.

- [ ] **Step 3: Implementare in FaceIDScreen.jsx**

Riga 73, cambia:

```javascript
        navigation.replace('QRScanner', { faceidVerified: true });
```

- [ ] **Step 4: Rieseguire il test FaceIDScreen**

Run: `cd frontend-mobile && npm test -- FaceIDScreen`
Expected: PASS.

- [ ] **Step 5: Test rosso su CheckInScreen (skip Face ID)**

Nota: `CheckInScreen.jsx` non ha oggi un file di test dedicato — verificare con `find frontend-mobile/src/__tests__ -iname "*CheckInScreen*"`. Se assente, crearlo con un solo test mirato (non serve una suite completa, fuori scope):

```javascript
// frontend-mobile/src/__tests__/CheckInScreen.test.jsx (nuovo, minimo)
it('naviga a QRScanner con faceidVerified:false quando Face ID è disabilitato', async () => {
  // mock AsyncStorage FACE_ID_ENABLED = 'false', mock hasHardwareAsync = true
  // render, press il bottone "Scannerizza QR Code"
  await waitFor(() => {
    expect(mockNavigation.navigate).toHaveBeenCalledWith('QRScanner', { faceidVerified: false });
  });
});
```

- [ ] **Step 6: Eseguire e verificare fallimento, poi implementare**

In `CheckInScreen.jsx`, funzione `handleCheckIn`:

```javascript
  const handleCheckIn = async () => {
    const faceIdPref = await AsyncStorage.getItem(STORAGE_KEYS.FACE_ID_ENABLED);
    const faceIdWanted = faceIdAvailable && faceIdPref !== 'false';
    if (faceIdWanted) {
      navigation.navigate('FaceID');
    } else {
      navigation.navigate('QRScanner', { faceidVerified: false });
    }
  };
```

Run: `cd frontend-mobile && npm test -- CheckInScreen`
Expected: PASS.

- [ ] **Step 7: Test rosso su QRScannerScreen (payload include faceid_verified)**

In `QRScannerScreen.test.jsx`, aggiungi un test che monta il componente con `route={{ params: { faceidVerified: true } }}` e verifica che `apiClient.post` sia chiamato con `expect.objectContaining({ faceid_verified: true })`.

- [ ] **Step 8: Eseguire e verificare fallimento**

Run: `cd frontend-mobile && npm test -- QRScannerScreen`
Expected: FAIL — il componente non legge `route` oggi (firma `{ navigation }`).

- [ ] **Step 9: Implementare in QRScannerScreen.jsx**

Cambia la firma del componente (riga 17):

```javascript
export default function QRScannerScreen({ navigation, route }) {
```

Aggiungi subito dopo gli altri `useState`:

```javascript
  const faceidVerified = route?.params?.faceidVerified === true;
```

Nel payload (blocco intorno alla riga 106):

```javascript
      payload = {
        employee_id: employeeId,
        site_id: siteId,
        client_id: clientId,
        type: checkType,
        timestamp: occurredAt,
        occurred_at: occurredAt,
        client_uuid: clientUuid,
        faceid_verified: faceidVerified,
      };
```

- [ ] **Step 10: Rieseguire il test**

Run: `cd frontend-mobile && npm test -- QRScannerScreen`
Expected: PASS.

- [ ] **Step 11: Suite mobile completa**

Run: `cd frontend-mobile && npm test`
Expected: tutti verdi, nessuna regressione.

- [ ] **Step 12: Commit**

```bash
git add frontend-mobile/src/screens/checkin/FaceIDScreen.jsx frontend-mobile/src/screens/checkin/CheckInScreen.jsx frontend-mobile/src/screens/checkin/QRScannerScreen.jsx frontend-mobile/src/__tests__/FaceIDScreen.test.jsx frontend-mobile/src/__tests__/QRScannerScreen.test.jsx frontend-mobile/src/__tests__/CheckInScreen.test.jsx
git commit -m "feat(mobile): propagate Face ID verification outcome into check-in payload (finding #4)"
```

Questo chiude interamente il finding #4 (Soluzione A concordata).

---

## Task 5: Migration — colonna `client_id` su `audit_log`

**Files:**
- Create: `backend/migrations/037_add_client_id_to_audit_log.sql`

- [ ] **Step 1: Scrivere la migration**

```sql
-- 037_add_client_id_to_audit_log.sql
-- Finding #6 (2026-08-02): audit_log non aveva colonna tenant — un futuro
-- endpoint di audit-log admin (scope MVP, CLAUDE.md) rischierebbe un leak
-- cross-tenant silenzioso con una query naive. Nessun backfill delle righe
-- storiche (non derivabile in modo affidabile senza join per tipo entità):
-- restano NULL, accettabile perché il rischio riguarda i log futuri.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS client_id UUID;
CREATE INDEX IF NOT EXISTS idx_audit_log_client_id_timestamp ON audit_log (client_id, timestamp);
```

- [ ] **Step 2: Applicare e verificare**

Run: `cd backend && npm run migrate`
Expected: applicata senza errori, `\d audit_log` mostra la colonna e l'indice.

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/037_add_client_id_to_audit_log.sql
git commit -m "feat(db): add client_id column to audit_log (finding #6)"
```

---

## Task 6: Backend — popolare `client_id` in `logAudit()`

**Files:**
- Modify: `backend/src/middleware/audit.js`
- Test: Create `backend/src/__tests__/audit-client-scope.test.js`

- [ ] **Step 1: Test rosso**

```javascript
// backend/src/__tests__/audit-client-scope.test.js
const { pool } = require('../db/pool');
const logAudit = require('../middleware/audit'); // adattare al vero export (module.exports)

describe('logAudit — client_id scoping (finding #6)', () => {
  afterAll(async () => { await pool.end(); });

  it('popola client_id nella riga audit_log quando fornito', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await logAudit(client, {
        action: 'test_action',
        entity: 'checkin',
        entityId: 'test-entity-id',
        clientId: global.demoClientId, // stesso fixture usato altrove
        oldValue: null,
        newValue: { foo: 'bar' },
        userId: global.demoEmployeeId,
      });
      const row = await client.query(
        "SELECT client_id FROM audit_log WHERE entity_id = 'test-entity-id' ORDER BY id DESC LIMIT 1"
      );
      expect(row.rows[0].client_id).toBe(global.demoClientId);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
```

Nota per l'implementer: verificare il nome esatto del parametro (`clientId` vs `_clientId`) e il vero export di `audit.js` prima di scrivere il test — leggere il file per intero, non solo l'estratto di questo piano.

- [ ] **Step 2: Eseguire e verificare fallimento**

Run: `cd backend && npx jest audit-client-scope`
Expected: FAIL — `client_id` è `NULL` nella riga inserita (il parametro `_clientId` è scartato).

- [ ] **Step 3: Implementare in `audit.js`**

Rinomina il parametro da `_clientId` a `clientId` nella firma di `logAudit`, e aggiungilo all'INSERT esistente (adattare ai nomi esatti di colonne/placeholder già presenti nella query — leggere l'INSERT reale prima di modificarlo, questo file ha già logica SAVEPOINT non banale da preservare intatta).

- [ ] **Step 4: Aggiornare tutti i call-site**

Run: `grep -rn "_clientId" backend/src/` per trovare ogni chiamata a `logAudit` che passa il parametro con underscore, e rinominarlo in `clientId` (mantenendo lo stesso valore passato).

- [ ] **Step 5: Rieseguire il test e l'intera suite**

Run: `cd backend && npx jest audit-client-scope && npm test`
Expected: tutti verdi.

- [ ] **Step 6: Commit**

```bash
git add backend/src/middleware/audit.js backend/src/__tests__/audit-client-scope.test.js
git commit -m "fix(backend): populate client_id in audit_log inserts (finding #6)"
```

---

## Task 7: Backend — scoping esplicito `client_id` sulla verifica assegnazione sede

**Files:**
- Modify: `backend/src/routes/checkins.js:86` (query di assignment)
- Test: Modify `backend/src/__tests__/checkins-ownership.test.js`

- [ ] **Step 1: Test rosso**

Aggiungi un test che verifica che la query di assegnazione sede sia scoped su `client_id` — dato che oggi non è sfruttabile (i controlli precedenti nella stessa richiesta già filtrano per client_id), il test corretto è un unit test diretto sulla query SQL, non un test end-to-end di exploit:

```javascript
it('la query di verifica assegnazione sede include client_id nel WHERE (finding #10, difesa in profondità)', () => {
  const fs = require('fs');
  const source = fs.readFileSync(require.resolve('../routes/checkins.js'), 'utf8');
  const assignmentQueryMatch = source.match(/SELECT 1 FROM employees\s+WHERE id = \$1::uuid AND \$2::uuid = ANY\(assigned_sites\)/);
  // Questo match deve FALLIRE dopo il fix: la query non deve più avere questa forma a 2 soli parametri
  expect(assignmentQueryMatch).toBeNull();
});
```

- [ ] **Step 2: Eseguire e verificare fallimento**

Run: `cd backend && npx jest checkins-ownership`
Expected: FAIL — la query attuale matcha esattamente il pattern a 2 parametri.

- [ ] **Step 3: Implementare in `checkins.js`**

Riga 86, cambia la query da:

```javascript
      const assignmentResult = await client.query(
        `SELECT 1 FROM employees
         WHERE id = $1::uuid AND $2::uuid = ANY(assigned_sites)`,
        [employee_id, site_id]
      );
```

a:

```javascript
      const assignmentResult = await client.query(
        `SELECT 1 FROM employees
         WHERE id = $1::uuid AND client_id = $2::uuid AND $3::uuid = ANY(assigned_sites)`,
        [employee_id, clientId, site_id]
      );
```

- [ ] **Step 4: Rieseguire il test e l'intera suite checkins**

Run: `cd backend && npx jest checkins-ownership checkins checkins-offline checkins-geofence checkins-faceid`
Expected: tutti verdi (comportamento identico per ogni caso già coperto, dato che employee/site sono già scoped al client nei passi 1-2 della stessa transazione).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/checkins.js backend/src/__tests__/checkins-ownership.test.js
git commit -m "fix(backend): scope site-assignment check to client_id explicitly (finding #10)"
```

---

## Task 8: Backend — `jti` sull'access token e `jti_hash` popolato nell'audit di revoca

**Files:**
- Modify: `backend/src/routes/auth.js` (3 punti di emissione access token: login, refresh, righe ~149, ~472, ~739 — verificare i numeri esatti leggendo il file, potrebbero essere leggermente cambiati)
- Modify: `backend/src/middleware/auth.js` (righe 92-99, dove si costruisce `req.user`)
- Test: Modify `backend/src/__tests__/auth-checkrevoked.test.js`

- [ ] **Step 1: Test rosso**

```javascript
it('jti_hash è popolato (non null) in un audit REVOKED_TOKEN_ATTEMPT (finding #12)', async () => {
  // riusa il setup esistente in questo file per un utente revocato che tenta una richiesta
  // ... login, poi revoca via endpoint/query diretta, poi richiesta con token revocato
  const auditRow = await pool.query(
    "SELECT jti_hash FROM audit_log WHERE action = 'revoked_token_attempt' ORDER BY id DESC LIMIT 1"
  ); // adattare nome tabella/colonna esatti leggendo checkRevoked.js per intero
  expect(auditRow.rows[0].jti_hash).not.toBeNull();
});
```

Nota per l'implementer: leggere `checkRevoked.js` per intero per capire ESATTAMENTE dove/come viene scritta la riga di audit (`REVOKED_TOKEN_ATTEMPT`) prima di scrivere l'assert — il piano descrive l'intento, non ha visibilità sull'ultima parte del file.

- [ ] **Step 2: Eseguire e verificare fallimento**

Run: `cd backend && npx jest auth-checkrevoked`
Expected: FAIL — `jti_hash` è sempre `null` oggi.

- [ ] **Step 3: Aggiungere `jti` al payload dell'access token in `auth.js`**

In tutti e 3 i punti dove viene creato `tokenPayload` per l'access token (login, refresh, accept-invito onboarding), aggiungere un `jti` generato con la stessa utility già in uso per il refresh token (`const jti = uuid();`, guardare l'import esistente in cima al file):

```javascript
    const jti = uuid();
    const tokenPayload = {
      // ... campi esistenti invariati ...
      jti,
    };
```

Attenzione: ogni punto ha un `tokenPayload` costruito localmente con campi leggermente diversi (login include `employee_id`/`site_id` opzionali, refresh no) — aggiungere `jti` a CIASCUNO senza toccare gli altri campi.

- [ ] **Step 4: Calcolare `jti_hash` in `middleware/auth.js`**

In cima al file, verificare se `crypto` è già importato (usato altrove per hash sha256, vedi `routes/auth.js:394`); se no, aggiungere `const crypto = require('crypto');`.

Nel blocco che costruisce `req.user` (righe 92-99), aggiungere:

```javascript
    req.user = {
      user_id: decoded.user_id,
      name: decoded.name || null,
      auth0_sub: decoded.auth0_sub,
      client_id: decoded.client_id,
      role: decoded.role,
      iat: decoded.iat,
      exp: decoded.exp,
      jti_hash: decoded.jti ? crypto.createHash('sha256').update(decoded.jti).digest('hex') : null,
    };
```

- [ ] **Step 5: Rieseguire il test e l'intera suite auth**

Run: `cd backend && npx jest auth-checkrevoked auth.test auth.integration auth-refresh-race auth-refresh-first-use auth-revoke-session`
Expected: tutti verdi — nessuna regressione sui flussi di rotazione/revoca già esistenti (il nuovo campo `jti` sull'access token è puramente additivo, mai validato/atteso dal middleware attuale se assente).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/auth.js backend/src/middleware/auth.js backend/src/__tests__/auth-checkrevoked.test.js
git commit -m "fix(backend): populate jti_hash in revoked-token audit trail (finding #12)"
```

---

## Task 9: Backend — verifica/chiusura finding #8 (RBAC client-side)

Nessun bug di codice: `backend/src/routes/admin.js:129-131` applica già un guard server-side (`role !== 'admin' && role !== 'superadmin'` → 403 `ADMIN_REQUIRED`) su tutti i sotto-router admin, con `role` decodificato da un JWT RS256 firmato (`middleware/auth.js:39`), mai fidato dal client. Il finding stesso lo segnalava come "PLAUSIBLE — da verificare", non confermato. Questo task aggiunge solo un test esplicito e nominato per rendere la chiusura tracciabile.

**Files:**
- Create: `backend/src/__tests__/admin-role-guard.test.js`

- [ ] **Step 1: Scrivere il test (dovrebbe già passare, essendo una verifica non un fix)**

```javascript
// backend/src/__tests__/admin-role-guard.test.js
// Finding #8 (2026-08-02): verifica esplicita che il guard server-side su
// /api/v1/admin/* non dipenda in alcun modo da localStorage/dati client —
// solo dal ruolo decodificato dal JWT firmato RS256.
const request = require('supertest');
const app = require('../app');

describe('Admin route guard — finding #8', () => {
  it('un token con role=employee riceve 403 ADMIN_REQUIRED su una rotta admin generica', async () => {
    // riusa l'helper di login/token già usato in admin-clients-scoping.test.js per un utente employee
    const res = await request(app)
      .get('/api/v1/admin/employees')
      .set('Authorization', `Bearer ${global.employeeTestToken}`); // adattare al nome reale dell'helper
    expect(res.status).toBe(403);
    expect(res.body.error?.code || res.body.error).toBe('ADMIN_REQUIRED');
  });

  it('un token con role=manager riceve 403 ADMIN_REQUIRED su una rotta admin generica', async () => {
    const res = await request(app)
      .get('/api/v1/admin/employees')
      .set('Authorization', `Bearer ${global.managerTestToken}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Eseguire**

Run: `cd backend && npx jest admin-role-guard`
Expected: PASS immediato (nessun codice di produzione modificato in questo task — è una verifica, non un fix).

- [ ] **Step 3: Commit**

```bash
git add backend/src/__tests__/admin-role-guard.test.js
git commit -m "test(backend): add explicit regression guard for admin RBAC server-side enforcement (finding #8, verified safe)"
```

---

## Task 10: Frontend-web — errore visibile quando il polling delle stats fallisce

**Files:**
- Modify: `frontend-web/src/features/dashboard/hooks/usePresences.js`
- Test: Create `frontend-web/src/features/dashboard/hooks/__tests__/usePresences.test.js`

- [ ] **Step 1: Test rosso**

```javascript
// frontend-web/src/features/dashboard/hooks/__tests__/usePresences.test.js
import { renderHook, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { usePresences } from '../usePresences';
import apiClient from '../../../../services/apiClient';

vi.mock('../../../../services/apiClient');
vi.useFakeTimers();

describe('usePresences — pollStats error visibility (finding #9)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('imposta error quando il poll in background fallisce', async () => {
    apiClient.get.mockResolvedValueOnce({ data: { data: [], pagination: { total: 0 } } }); // fetchPresences iniziale
    apiClient.get.mockResolvedValueOnce({ data: { data: {} } }); // fetchStats iniziale
    apiClient.get.mockRejectedValueOnce(new Error('Network Error')); // pollStats dopo 30s

    const { result } = renderHook(() => usePresences({}));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { vi.advanceTimersByTime(30000); });
    await waitFor(() => expect(result.current.error).toBeTruthy());
  });
});
```

- [ ] **Step 2: Eseguire e verificare fallimento**

Run: `cd frontend-web && npx vitest run usePresences`
Expected: FAIL — `pollStats` oggi fa solo `console.error`, `error` resta `null`.

- [ ] **Step 3: Implementare**

In `usePresences.js`, dentro `pollStats` (il blocco `useEffect` con `setInterval`):

```javascript
    const pollStats = async () => {
      try {
        const response = await apiClient.get('/api/v1/checkins/stats', { params: filtersRef.current });
        setStats(response.data.data || {});
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Failed to poll stats');
        console.error('Error polling stats:', err);
      }
    };
```

- [ ] **Step 4: Rieseguire il test**

Run: `cd frontend-web && npx vitest run usePresences`
Expected: PASS. Verificare anche manualmente che `DashboardPage.jsx:230` renderizzi già l'Alert con questo `error` (confermato in fase di analisi — non serve nessuna modifica a `DashboardPage.jsx`).

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/features/dashboard/hooks/usePresences.js frontend-web/src/features/dashboard/hooks/__tests__/usePresences.test.js
git commit -m "fix(web): surface polling errors on dashboard stats (finding #9)"
```

---

## Task 11: Frontend-web — lock cross-tab atomico per il refresh token

**Files:**
- Modify: `frontend-web/src/services/authService.js` (funzione `refreshAccessToken`, righe 192-221)
- Test: Modify `frontend-web/src/services/__tests__/authService.test.js`

- [ ] **Step 1: Test rosso**

```javascript
it('due refresh concorrenti non causano una doppia chiamata di rete (finding #7)', async () => {
  localStorage.setItem('badge_refresh_token', 'rt-123');
  apiClient.post.mockImplementation(() => new Promise((resolve) =>
    setTimeout(() => resolve({ data: { data: { token: 'new-token', refresh_token: 'rt-456' } } }), 50)
  ));

  const [a, b] = await Promise.all([
    authService.refreshAccessToken(),
    authService.refreshAccessToken(),
  ]);

  expect(apiClient.post).toHaveBeenCalledTimes(1); // solo UNA delle due chiamate arriva davvero alla rete
  expect(a).toBe('new-token');
  expect(b).toBe('new-token');
});
```

- [ ] **Step 2: Eseguire e verificare fallimento**

Run: `cd frontend-web && npx vitest run authService`
Expected: FAIL — con il lock a due scritture separate, entrambe le chiamate concorrenti possono superare il check prima che l'altra scriva il lock (race genuina, riproducibile con `Promise.all` sullo stesso tick).

- [ ] **Step 3: Implementare con Web Locks API (fallback al meccanismo esistente se non supportata)**

In `authService.js`, sostituire il corpo di `refreshAccessToken` con:

```javascript
  async refreshAccessToken() {
    const refresh_token = this.getRefreshToken();
    if (!refresh_token) throw new Error('No refresh token');

    const doRefresh = async () => {
      // Un'altra tab potrebbe aver già completato il refresh mentre aspettavamo il lock
      if (this.getRefreshToken() !== refresh_token) {
        const raced = this.getToken();
        if (raced) return raced;
      }
      const response = await apiClient.post('/api/v1/auth/refresh', { refresh_token });
      const { token, refresh_token: new_refresh } = response.data.data;
      localStorage.setItem(TOKEN_KEY, token);
      if (new_refresh) localStorage.setItem(REFRESH_TOKEN_KEY, new_refresh);
      return token;
    };

    // Web Locks API: mutua esclusione cross-tab realmente atomica (Chrome/Edge/Firefox/
    // Safari 16.4+). Se non disponibile (browser molto vecchio), fallback al vecchio
    // meccanismo a timestamp — non atomico ma meglio di niente.
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      return navigator.locks.request('badge_refresh_lock', doRefresh);
    }

    const LOCK_KEY = 'badge_refreshing';
    const LOCK_TTL_MS = 4000;
    const existing = localStorage.getItem(LOCK_KEY);
    if (existing && Date.now() - parseInt(existing, 10) < LOCK_TTL_MS) {
      await new Promise((r) => setTimeout(r, 600));
      const raced = localStorage.getItem(TOKEN_KEY);
      if (raced) return raced;
    }
    localStorage.setItem(LOCK_KEY, String(Date.now()));
    try {
      return await doRefresh();
    } finally {
      localStorage.removeItem(LOCK_KEY);
    }
  },
```

- [ ] **Step 4: Rieseguire il test (con Web Locks mockata nell'ambiente jsdom/Vitest se non nativa)**

Se l'ambiente di test (jsdom) non implementa `navigator.locks`, aggiungere nel test un mock minimale prima del test:

```javascript
beforeEach(() => {
  global.navigator.locks = {
    request: (name, cb) => cb(), // esegue subito, serializzato per costruzione in un singolo test sincrono di jsdom
  };
});
```

Run: `cd frontend-web && npx vitest run authService`
Expected: PASS.

- [ ] **Step 5: Suite completa frontend-web**

Run: `cd frontend-web && npm test`
Expected: tutti verdi.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/services/authService.js frontend-web/src/services/__tests__/authService.test.js
git commit -m "fix(web): atomic cross-tab refresh lock via Web Locks API (finding #7)"
```

---

## Task 12: Frontend-web — messaggio chiaro per ore non calcolabili (paginazione)

**Files:**
- Modify: `frontend-web/src/features/dashboard/components/PresencesTable.jsx` (funzione `computeOreMap` e la cella che la usa)
- Test: Modify `frontend-web/src/__tests__/PresencesTable.test.jsx`

- [ ] **Step 1: Test rosso**

```javascript
it('mostra un messaggio esplicito (non un semplice trattino) quando il pairing IN/OUT fallisce per limite di pagina (finding #11)', () => {
  const data = { rows: [{ id: 'c1', employee_id: 'e1', type: 'OUT', timestamp: '2026-08-02T18:00:00Z' }], total: 1 };
  render(<PresencesTable data={data} />);
  expect(screen.getByText(/verifica pagina precedente/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Eseguire e verificare fallimento**

Run: `cd frontend-web && npx vitest run PresencesTable`
Expected: FAIL — oggi la cella mostra solo `—`.

- [ ] **Step 3: Individuare la cella che consuma `oreMap` e aggiornarla**

Cercare nel file dove `oreMap.get(row.id)` (o simile) viene usato per renderizzare la cella "Ore lavorate", e sostituire il fallback:

```jsx
{oreMap.get(row.id) ?? (row.type === 'OUT' ? 'N/D (verifica pagina precedente)' : '—')}
```

(il trattino semplice resta corretto per le righe IN, che non hanno mai una durata associata — solo le righe OUT senza IN abbinato nella pagina corrente devono mostrare il messaggio esplicito).

- [ ] **Step 4: Rieseguire il test**

Run: `cd frontend-web && npx vitest run PresencesTable`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/features/dashboard/components/PresencesTable.jsx frontend-web/src/__tests__/PresencesTable.test.jsx
git commit -m "fix(web): clarify unpaired OUT duration message across page boundaries (finding #11)"
```

---

## Task 13: Frontend-web — avviso quando l'export CSV è troncato

**Files:**
- Modify: `frontend-web/src/features/dashboard/components/ExportButton.jsx`
- Test: Create `frontend-web/src/features/dashboard/components/__tests__/ExportButton.test.jsx`

- [ ] **Step 1: Leggere il file per intero prima di scrivere test/fix**

`ExportButton.jsx` non ha oggi un file di test (verificato: assente in `frontend-web/src/__tests__` e non trovato altrove). Leggere l'intero componente (è piccolo, ~180 righe) per capire come effettua la richiesta di export (fetch diretta con headers, o tramite `apiClient`?) prima di scrivere il test, dato che l'header `X-Truncated` va letto dalla risposta HTTP grezza.

- [ ] **Step 2: Test rosso**

```javascript
// frontend-web/src/features/dashboard/components/__tests__/ExportButton.test.jsx
it('mostra un avviso quando la risposta ha X-Truncated: true (finding #13)', async () => {
  // mock della chiamata di export con response.headers['x-truncated'] = 'true'
  // (adattare al meccanismo di fetch reale scoperto nello Step 1 — axios headers sono
  // lowercase per convenzione: response.headers['x-truncated'])
  render(<ExportButton filters={{}} />);
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => {
    expect(screen.getByText(/export troncato/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Eseguire e verificare fallimento**

Run: `cd frontend-web && npx vitest run ExportButton`
Expected: FAIL — nessun avviso implementato oggi.

- [ ] **Step 4: Implementare**

Nel gestore di successo dell'export (dove oggi si triggera il download del blob), leggere l'header e impostare uno stato locale:

```javascript
      if (response.headers?.['x-truncated'] === 'true') {
        setError('Export troncato a 50.000 righe — restringi il periodo per un export completo.');
      }
```

(riusare lo stesso meccanismo `setError`/Alert già presente nel componente per gli errori di rete — vedi riga 58 dell'estratto già letto in fase di analisi, non introdurre un secondo stato parallelo).

- [ ] **Step 5: Rieseguire il test**

Run: `cd frontend-web && npx vitest run ExportButton`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/features/dashboard/components/ExportButton.jsx frontend-web/src/features/dashboard/components/__tests__/ExportButton.test.jsx
git commit -m "fix(web): warn user when CSV export is truncated at 50k rows (finding #13)"
```

---

## Task 14: Gate finale — suite completa, push develop, verifica staging

- [ ] **Step 1: Suite completa dei 3 progetti**

Run: `cd backend && npm test`
Run: `cd frontend-web && npm test`
Run: `cd frontend-mobile && npm test`
Expected: tutti verdi, zero regressioni rispetto al baseline pre-piano (backend 630+/644, frontend-web 248+/249, mobile 75+/75 — i numeri esatti sono saliti coi nuovi test aggiunti in questo piano, verificare che nessun test PREESISTENTE sia passato da PASS a FAIL).

- [ ] **Step 2: Lint (ricorda la lezione di Session 89 — npm test non esegue lint)**

Run: `cd backend && npm run lint`
Expected: nessun errore. Se ci sono errori, `npx eslint --fix` e rieseguire.

- [ ] **Step 3: Push su develop**

```bash
git push origin develop
```

Verificare che il workflow `deploy-staging.yml` (GitHub Actions) parta e completi con successo (build → push ECR `:staging-latest` → deploy SSH → smoke test).

- [ ] **Step 4: Verifica manuale utente su staging**

Chiedere esplicitamente all'utente di verificare su staging, in particolare:
- Un check-in con Face ID disabilitato mostra il chip "No Face ID" nel dashboard
- Un export CSV di un periodo ampio (se il tenant di staging ha >50k righe simulabili, altrimenti verificare solo che l'header sia letto senza errori) mostra l'avviso di troncamento
- Login/refresh multi-tab funziona ancora normalmente (nessuna regressione visibile sul lock cross-tab)

- [ ] **Step 5: Merge in main SOLO dopo conferma esplicita dell'utente**

```bash
git checkout main
git merge develop
git push origin main
```

Non eseguire questo step senza una conferma esplicita e separata dell'utente dopo la verifica su staging.

---

## Note per l'implementer (subagent-driven-development / executing-plans)

- Ogni task in questo piano fa riferimento a righe/pattern osservati durante l'analisi (2026-08-02) — i numeri di riga possono essere leggermente cambiati se il file è stato toccato nel frattempo. **Rileggere sempre il file reale prima di applicare un diff**, non fidarsi ciecamente del numero di riga citato.
- Gli helper di test esatti (nomi di fixture, token di test, funzioni di setup) sono descritti per pattern, non per nome garantito al 100% — il repo ha una convenzione consolidata (`__fixtures__/demo-users.js`, pattern già visto in `checkins-*.test.js`); riusarla, non reinventarla.
- Nessun task di questo piano tocca `frontend-mobile/src/services/authService.js` (secure storage, finding #1) né `expo-location`/geofencing (finding #2/#5) — sono esplicitamente Fase B/C, piani separati.
- Finding #3 (web token in localStorage) non è toccato in nessun task — decisione già presa (`TASKS.md` C.5.3).
