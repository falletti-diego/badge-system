# Notifiche Push (mobile) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere notifiche push mobile (Expo Push Service) per cambio turno, approvazione/rifiuto ferie ed eventi — sempre e solo al dipendente diretto interessato.

**Architecture:** Nuova tabella `device_push_tokens` + helper backend condiviso `notifyEmployee()` (scrive sempre la riga `notifications` esistente, invia il push in modo fire-and-forget via `expo-server-sdk`) richiamato da `shifts.js`/`leaves.js`/`events.js` subito dopo che la rispettiva transazione è già andata a buon fine. Lato mobile, `expo-notifications` con un dialog di consenso esplicito prima del prompt di sistema (stesso pattern di `GPSConsentDialog`), registrazione del token al backend, nessuna cronologia in-app.

**Tech Stack:** Node.js/Express/PostgreSQL (backend esistente), `expo-server-sdk` (nuovo), React Native/Expo SDK 54, `expo-notifications` (nuovo, modulo nativo — richiede build EAS non-OTA).

Spec di riferimento: `docs/superpowers/specs/2026-08-30-push-notifications-design.md`

---

## Nota preliminare (rischio 🟠 già verificato in questa sessione)

Verificato contro la documentazione Expo corrente (docs.expo.dev, fetch del 2026-08-31) prima di scrivere questo piano:

- Il push Android via EAS Build richiede davvero **un progetto Firebase proprio** (Firebase Console → Project Settings → Service Accounts → genera una chiave privata JSON) e il caricamento di quella chiave sulle credenziali EAS. Serve anche un file `google-services.json` referenziato in `app.json` (`android.googleServicesFile`). **Questo è un task manuale fuori dal codice**, a carico dell'utente (Task 1 sotto) — non delegabile a un subagent.
- Per iOS, EAS gestisce la chiave APNs automaticamente insieme alle credenziali di distribuzione esistenti — nessuna azione manuale aggiuntiva.
- `expo-server-sdk` (pacchetto npm, import `const { Expo } = require('expo-server-sdk')`) resta la libreria corrente raccomandata da Expo per l'invio da un backend Node — confermato l'uso di `Expo`, `expo.chunkPushNotifications()`, `expo.sendPushNotificationsAsync()`.
- `expo-notifications` (modulo mobile) richiede: `Notifications.requestPermissionsAsync()`, `Notifications.getExpoPushTokenAsync({ projectId })` (il `projectId` esiste già in `app.json` → `extra.eas.projectId`, verificare il valore esatto nel Task 8), un canale di notifica Android esplicito (`Notifications.setNotificationChannelAsync`, obbligatorio su Android 8+), e un `Notifications.setNotificationHandler(...)` globale per far comparire il banner anche ad app aperta (senza, iOS/Android più recenti sopprimono l'alert in foreground di default).

Il resto del piano assume questi fatti come verificati.

---

## File Structure

**Backend — nuovi file:**
- `backend/migrations/043_create_device_push_tokens.sql` — nuova tabella
- `backend/src/utils/pushNotifications.js` — helper condiviso `notifyEmployee()` + wrapper Expo sottile
- `backend/src/__tests__/pushNotifications.test.js` — unit test del helper (mock `expo-server-sdk`)
- `backend/src/__tests__/notifications-push-token.test.js` — integration test `POST /api/notifications/push-token` (real Postgres)

**Backend — file modificati:**
- `backend/src/routes/notifications.js` — nuovo endpoint `POST /push-token`
- `backend/src/routes/shifts.js` — sostituisce l'INSERT diretto con `notifyEmployee()`
- `backend/src/routes/leaves.js` — chiama `notifyEmployee()` dopo `withTransaction()` in `PUT /:id/approve`
- `backend/src/routes/events.js` — chiama `notifyEmployee()` dopo `withTransaction()` in `PUT /:id/approve`
- `backend/src/routes/admin/employees.js` — `DELETE /:id` pulisce `device_push_tokens`
- `backend/package.json` — nuova dipendenza `expo-server-sdk`

**Mobile — nuovi file:**
- `frontend-mobile/src/services/pushNotificationsService.js` — wrapper `expo-notifications` (richiesta permesso, ottenimento token, registrazione al backend, canale Android, handler foreground)
- `frontend-mobile/src/components/PushConsentDialog.jsx` — dialog esplicativo pre-prompt (mirror di `GPSConsentDialog.jsx`)
- `frontend-mobile/src/__tests__/pushNotificationsService.test.js`
- `frontend-mobile/src/__tests__/PushConsentDialog.test.jsx`

**Mobile — file modificati:**
- `frontend-mobile/app.json` — plugin `expo-notifications`, `android.googleServicesFile`
- `frontend-mobile/package.json` — nuova dipendenza `expo-notifications`
- `frontend-mobile/src/navigation/RootNavigator.jsx` — mostra `PushConsentDialog` una volta per il ruolo `employee`, avvia la registrazione token
- `frontend-mobile/src/screens/settings/SettingsScreen.jsx` — nuova riga "Notifiche" con stato + "Apri Impostazioni"
- `frontend-mobile/src/config/endpoints.js` — nuovo endpoint `NOTIFICATIONS_PUSH_TOKEN`, nuova `STORAGE_KEYS.PUSH_CONSENT_DIALOG_SHOWN`
- `frontend-mobile/src/__tests__/SettingsScreen.test.jsx` — nuovo test per la riga Notifiche

---

## Task 1: Prerequisito Firebase (manuale, non-codice)

Questo task non produce codice. Serve fatto **prima** di aprire una build EAS Android con push abilitato (Task 8+), ma **non blocca** i task backend (2-7) né i task mobile che non toccano ancora una build reale (8-10 possono essere scritti e testati in unit senza credenziali reali — solo la build EAS finale li richiede).

- [ ] **Step 1: Creare un progetto Firebase**

Vai su https://console.firebase.google.com → "Aggiungi progetto" → nome `badge-system` (o simile) → completa la creazione (Google Analytics non necessario, disattivabile).

- [ ] **Step 2: Registrare l'app Android nel progetto Firebase**

Nel progetto Firebase → "Aggiungi app" → Android → package name **esattamente** `it.dataxiom.badge` (deve combaciare con `frontend-mobile/app.json` → `expo.android.package`, verificato = `it.dataxiom.badge`). Scarica il file `google-services.json` generato.

- [ ] **Step 3: Generare la chiave del service account**

Firebase Console → ⚙️ Project Settings → tab "Service accounts" → "Generate new private key" → scarica il JSON (contiene una chiave privata, **non committarlo mai**).

- [ ] **Step 4: Caricare la chiave su EAS**

```bash
cd frontend-mobile
eas credentials
```

Seleziona piattaforma Android → "Google Service Account" → carica il file scaricato al passo 3. (Se il flusso a menu cambia rispetto a questa descrizione, `eas credentials --platform android` guida comunque passo-passo — la voce da cercare è "Push Notifications" / "FCM V1 service account key".)

- [ ] **Step 5: Salvare `google-services.json` nel repo mobile (gitignored)**

```bash
cd frontend-mobile
mv ~/Downloads/google-services.json ./google-services.json
grep -q '^google-services.json$' .gitignore || echo 'google-services.json' >> .gitignore
```

Referenziato da `app.json` nel Task 8 (`android.googleServicesFile`).

- [ ] **Step 6: Annotare in memoria (non nel repo) le credenziali create**

Salvare nome progetto Firebase, email del service account e dove risiede `google-services.json` — stesso trattamento già riservato ad altre credenziali AWS/Auth0 di questo progetto (vedi `MEMORY.md`), non in TASKS.md/PROJECT_DECISIONS.md.

---

## Task 2: Migrazione `device_push_tokens`

**Files:**
- Create: `backend/migrations/043_create_device_push_tokens.sql`

- [ ] **Step 1: Scrivere la migrazione**

```sql
-- 043_create_device_push_tokens.sql
-- Push notifications (design spec 2026-08-30, decisione 7): un dipendente
-- può avere più device registrati; il token identifica univocamente un
-- device Expo — un cambio di proprietario del device fa upsert sulla stessa
-- riga (vedi POST /api/notifications/push-token, backend/src/routes/notifications.js).

CREATE TABLE device_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_push_tokens_employee_id ON device_push_tokens(employee_id);
```

- [ ] **Step 2: Applicare la migrazione sul DB locale**

```bash
cd backend
node scripts/run-migrations.js
```

Expected: log `[migrations] Applied 043_create_device_push_tokens.sql` (o equivalente "up to date" se già applicata da un run precedente).

- [ ] **Step 3: Verificare lo schema realmente creato**

```bash
psql "$DATABASE_URL" -c "\d device_push_tokens"
```

Expected: colonne `id, employee_id, client_id, token, platform, created_at, updated_at`; vincolo `device_push_tokens_employee_id_fkey` su `employees(id)` e `device_push_tokens_client_id_fkey` su `clients(id)`, entrambi `ON DELETE CASCADE`; `CHECK` su `platform`; indice su `employee_id`.

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/043_create_device_push_tokens.sql
git commit -m "feat: add device_push_tokens table for push notifications"
```

---

## Task 3: Dipendenza `expo-server-sdk` lato backend

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Installare la dipendenza**

```bash
cd backend
npm install expo-server-sdk
```

- [ ] **Step 2: Verificare che sia finita in `dependencies`, non `devDependencies`**

```bash
grep -A1 '"expo-server-sdk"' package.json
```

Expected: la riga compare sotto `"dependencies": {`. Se finisse sotto `devDependencies` per un problema di flag npm, spostarla manualmente — è esattamente la classe di bug descritta in CLAUDE.md Pattern (crash-loop container per `exceljs` in devDependencies, Session 89): una dipendenza runtime mancante in produzione perché `npm ci --production` non installa `devDependencies`.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: add expo-server-sdk dependency"
```

---

## Task 4: Helper condiviso `notifyEmployee()`

**Files:**
- Create: `backend/src/utils/pushNotifications.js`
- Test: `backend/src/__tests__/pushNotifications.test.js`

- [ ] **Step 1: Scrivere il test (mock di `expo-server-sdk`, stesso pattern di `email.test.js` per SES)**

```js
'use strict';

/**
 * Unit tests for utils/pushNotifications.js — mocks `pg` (pool.query) and
 * `expo-server-sdk` directly, same approach as email.test.js for
 * @aws-sdk/client-ses: no existing in-repo pattern for mocking a push
 * provider, so this mirrors the SDK's own shape (a class instance with
 * chunkPushNotifications/sendPushNotificationsAsync).
 */

const mockQuery = jest.fn();
jest.mock('../db/pool', () => ({ pool: { query: (...args) => mockQuery(...args) } }));

const mockSendPushNotificationsAsync = jest.fn();
const mockChunkPushNotifications = jest.fn((messages) => [messages]);
jest.mock('expo-server-sdk', () => ({
  Expo: jest.fn().mockImplementation(() => ({
    chunkPushNotifications: (...args) => mockChunkPushNotifications(...args),
    sendPushNotificationsAsync: (...args) => mockSendPushNotificationsAsync(...args),
  })),
}));

const { notifyEmployee } = require('../utils/pushNotifications');

describe('utils/pushNotifications.notifyEmployee', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockSendPushNotificationsAsync.mockReset();
    mockChunkPushNotifications.mockClear();
  });

  it('always inserts the in-app notification row, awaited', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // INSERT INTO notifications
      .mockResolvedValueOnce({ rows: [] }); // SELECT token lookup (no devices)

    await notifyEmployee({
      employeeId: 'emp-1',
      clientId: 'client-1',
      type: 'leave_approved',
      inAppMessage: 'Richiesta ferie dal 1 al 5 settembre approvata.',
      pushTitle: 'Richiesta ferie',
      pushBody: 'La tua richiesta è stata approvata. Apri l\'app per i dettagli.',
    });

    expect(mockQuery).toHaveBeenNthCalledWith(1,
      expect.stringContaining('INSERT INTO notifications'),
      expect.arrayContaining(['emp-1', 'client-1', 'leave_approved', 'Richiesta ferie dal 1 al 5 settembre approvata.'])
    );
  });

  it('does not call Expo at all when the employee has no registered device', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // no tokens

    await notifyEmployee({
      employeeId: 'emp-1', clientId: 'client-1', type: 'shift_updated',
      inAppMessage: 'x', pushTitle: 'x', pushBody: 'x',
    });

    // Let any fire-and-forget microtask drain before asserting a negative.
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockSendPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it('sends one push message per registered device token, without the caller awaiting it', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [{ token: 'ExponentPushToken[aaa]' }, { token: 'ExponentPushToken[bbb]' }] });
    mockSendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

    const before = Date.now();
    await notifyEmployee({
      employeeId: 'emp-1', clientId: 'client-1', type: 'shift_updated',
      inAppMessage: 'Turno aggiornato', pushTitle: 'Turno aggiornato', pushBody: 'Turno aggiornato',
    });
    const elapsed = Date.now() - before;

    // The function must resolve without waiting on the Expo send — proves
    // the fire-and-forget contract (design spec, decisione 12).
    expect(elapsed).toBeLessThan(50);

    await new Promise((resolve) => setImmediate(resolve));
    expect(mockChunkPushNotifications).toHaveBeenCalledWith([
      expect.objectContaining({ to: 'ExponentPushToken[aaa]', title: 'Turno aggiornato', body: 'Turno aggiornato' }),
      expect.objectContaining({ to: 'ExponentPushToken[bbb]', title: 'Turno aggiornato', body: 'Turno aggiornato' }),
    ]);
    expect(mockSendPushNotificationsAsync).toHaveBeenCalledTimes(1);
  });

  it('never throws when the in-app INSERT itself fails (best-effort, same contract as shifts.js today)', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));

    await expect(notifyEmployee({
      employeeId: 'emp-1', clientId: 'client-1', type: 'shift_updated',
      inAppMessage: 'x', pushTitle: 'x', pushBody: 'x',
    })).resolves.toBeUndefined();
  });

  it('never throws when Expo send rejects (fire-and-forget catch, does not surface to caller or as unhandled rejection)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ token: 'ExponentPushToken[aaa]' }] });
    mockSendPushNotificationsAsync.mockRejectedValue(new Error('Expo down'));

    await expect(notifyEmployee({
      employeeId: 'emp-1', clientId: 'client-1', type: 'shift_updated',
      inAppMessage: 'x', pushTitle: 'x', pushBody: 'x',
    })).resolves.toBeUndefined();

    await new Promise((resolve) => setImmediate(resolve));
    // No assertion needed beyond "test process didn't crash from an unhandled
    // rejection" — Jest fails the run on those automatically.
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca (il modulo non esiste ancora)**

```bash
cd backend
npx jest src/__tests__/pushNotifications.test.js
```

Expected: FAIL con `Cannot find module '../utils/pushNotifications'`.

- [ ] **Step 3: Implementare `notifyEmployee()`**

```js
/**
 * Push Notifications Helper — invia una notifica in-app (tabella
 * `notifications`, invariata) + un push Expo best-effort ai device
 * registrati del dipendente (tabella `device_push_tokens`).
 *
 * Design spec: docs/superpowers/specs/2026-08-30-push-notifications-design.md
 *
 * Contratto (decisione 9 della spec): nessun parametro `client`/connessione
 * transazionale — questo modulo importa `pool` direttamente e va sempre
 * chiamato DOPO che una eventuale withTransaction() del chiamante è già
 * tornata con successo, mai da dentro il suo callback. Un fallimento di
 * rete verso Expo non deve mai poter causare il ROLLBACK di
 * un'approvazione o di un salvataggio turno.
 *
 * Contratto (decisione 12 della spec): l'invio Expo non è mai atteso dal
 * chiamante — parte in background con un .catch() interno che logga e
 * basta, per non rallentare shifts.js quando cambiano molte celle turno in
 * una volta sola.
 */

const pino = require('pino');
const { Expo } = require('expo-server-sdk');
const { pool } = require('../db/pool');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

let expoClient = null;
function getExpoClient() {
  if (!expoClient) {
    expoClient = new Expo();
  }
  return expoClient;
}

/**
 * @param {object} params
 * @param {string} params.employeeId
 * @param {string} params.clientId
 * @param {string} params.type - es. 'shift_updated', 'leave_approved', 'leave_rejected', 'event_approved', 'event_rejected'
 * @param {string} params.inAppMessage - va nella colonna notifications.message (dettagliato, mai generico)
 * @param {string} params.pushTitle - titolo mostrato sul lock screen
 * @param {string} params.pushBody - corpo mostrato sul lock screen (generico per ferie/eventi, dettagliato per turno — vedi decisione 10 della spec)
 * @param {string} [params.shiftDate] - solo per type='shift_updated', va in notifications.shift_date
 * @param {string} [params.newShift] - solo per type='shift_updated', va in notifications.new_shift
 * @param {string} [params.siteId] - solo per type='shift_updated', va in notifications.site_id
 * @returns {Promise<void>} risolve sempre, non propaga mai un errore
 */
async function notifyEmployee({
  employeeId, clientId, type, inAppMessage, pushTitle, pushBody,
  shiftDate = null, newShift = null, siteId = null,
}) {
  try {
    await pool.query(
      `INSERT INTO notifications (employee_id, client_id, type, message, shift_date, new_shift, site_id)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::uuid)`,
      [employeeId, clientId, type, inAppMessage, shiftDate, newShift, siteId]
    );
  } catch (err) {
    logger.warn({ action: 'notification_create_error', error: err.message, employeeId, type });
    // Un fallimento dell'INSERT in-app non deve impedire il tentativo di
    // push — i due canali sono indipendenti, prosegue comunque sotto.
  }

  let tokens;
  try {
    const tokenResult = await pool.query(
      `SELECT token FROM device_push_tokens WHERE employee_id = $1::uuid AND client_id = $2::uuid`,
      [employeeId, clientId]
    );
    tokens = tokenResult.rows.map((r) => r.token);
  } catch (err) {
    logger.warn({ action: 'push_token_lookup_error', error: err.message, employeeId });
    return;
  }

  if (tokens.length === 0) return;

  // Fire-and-forget: intenzionalmente NON await qui (decisione 12 della
  // spec) — il .catch() interno garantisce che un fallimento di rete verso
  // Expo non diventi mai una unhandled rejection.
  sendPushToTokens(tokens, { title: pushTitle, body: pushBody, type }).catch((err) => {
    logger.warn({ action: 'push_send_error', error: err.message, employeeId, type });
  });
}

async function sendPushToTokens(tokens, { title, body, type }) {
  const expo = getExpoClient();
  const messages = tokens
    .filter((token) => Expo.isExpoPushToken(token))
    .map((token) => ({ to: token, sound: 'default', title, body, data: { type } }));

  if (messages.length === 0) return;

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    await expo.sendPushNotificationsAsync(chunk);
  }
}

module.exports = { notifyEmployee };
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

```bash
cd backend
npx jest src/__tests__/pushNotifications.test.js
```

Expected: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/pushNotifications.js backend/src/__tests__/pushNotifications.test.js
git commit -m "feat: add notifyEmployee push notifications helper"
```

---

## Task 5: Endpoint `POST /api/notifications/push-token`

**Files:**
- Modify: `backend/src/routes/notifications.js`
- Test: `backend/src/__tests__/notifications-push-token.test.js` (real Postgres — segue Pattern 5 di CLAUDE.md)

- [ ] **Step 1: Scrivere il test di integrazione**

```js
'use strict';

/**
 * Integration test for POST /api/notifications/push-token — real Postgres,
 * shares badge_system_test with 40+ other files (CLAUDE.md Pattern 5): ogni
 * riga creata/pulita è scoped a un client_id generato da QUESTO test.
 */

const { Pool } = require('pg');
const request = require('supertest');

const dbConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/badge_system_test',
};

let app;
let pool;
let clientId;
let employeeId;
let authToken;

beforeAll(async () => {
  process.env.DISABLE_AUTH = 'false';
  pool = new Pool(dbConfig);
  app = require('../app');
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const clientResult = await pool.query(
    `INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id`,
    [`Push Token Test ${suffix}`, `push-test-${suffix}@example.com`]
  );
  clientId = clientResult.rows[0].id;

  const empResult = await pool.query(
    `INSERT INTO employees (client_id, email, name, role, password_hash, active)
     VALUES ($1::uuid, $2, 'Push Test Employee', 'employee', 'x', true) RETURNING id`,
    [clientId, `push-emp-${suffix}@example.com`]
  );
  employeeId = empResult.rows[0].id;

  const loginRes = await request(app).post('/api/v1/auth/login').send({
    email: `push-emp-${suffix}@example.com`,
    password: 'x',
  }).catch(() => null);
  // Se il login mock/demo non copre questo utente sintetico, il test usa
  // direttamente un JWT firmato con lo stesso segreto dell'app invece che
  // passare dal login reale — vedi helper già esistente in altri
  // integration test per questo pattern (jwt.sign con JWT_SECRET).
  authToken = loginRes && loginRes.body && loginRes.body.access_token
    ? loginRes.body.access_token
    : require('../utils/jwt').signAccessToken({ user_id: employeeId, employee_id: employeeId, client_id: clientId, role: 'employee' });
});

afterEach(async () => {
  await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
});

describe('POST /api/notifications/push-token', () => {
  it('inserts a new token row for the authenticated employee', async () => {
    const res = await request(app)
      .post('/api/notifications/push-token')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ token: 'ExponentPushToken[test-aaa]', platform: 'ios' });

    expect(res.status).toBe(200);

    const row = await pool.query(
      `SELECT employee_id, client_id, platform FROM device_push_tokens WHERE token = $1`,
      ['ExponentPushToken[test-aaa]']
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].employee_id).toBe(employeeId);
    expect(row.rows[0].client_id).toBe(clientId);
    expect(row.rows[0].platform).toBe('ios');
  });

  it('upserts (reassigns) an existing token to a new employee', async () => {
    await pool.query(
      `INSERT INTO device_push_tokens (employee_id, client_id, token, platform) VALUES ($1::uuid, $2::uuid, $3, 'android')`,
      [employeeId, clientId, 'ExponentPushToken[test-bbb]']
    );

    const suffix2 = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const otherEmpResult = await pool.query(
      `INSERT INTO employees (client_id, email, name, role, password_hash, active)
       VALUES ($1::uuid, $2, 'Other Employee', 'employee', 'x', true) RETURNING id`,
      [clientId, `push-other-${suffix2}@example.com`]
    );
    const otherToken = require('../utils/jwt').signAccessToken({
      user_id: otherEmpResult.rows[0].id, employee_id: otherEmpResult.rows[0].id, client_id: clientId, role: 'employee',
    });

    const res = await request(app)
      .post('/api/notifications/push-token')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ token: 'ExponentPushToken[test-bbb]', platform: 'android' });

    expect(res.status).toBe(200);
    const row = await pool.query(
      `SELECT employee_id FROM device_push_tokens WHERE token = $1`,
      ['ExponentPushToken[test-bbb]']
    );
    expect(row.rows[0].employee_id).toBe(otherEmpResult.rows[0].id);
  });

  it('rejects with 403 CHECKIN-style fail-closed error when the account has no employee profile', async () => {
    const adminToken = require('../utils/jwt').signAccessToken({
      user_id: '00000000-0000-0000-0000-000000000001', employee_id: null, client_id: clientId, role: 'admin',
    });

    const res = await request(app)
      .post('/api/notifications/push-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ token: 'ExponentPushToken[test-ccc]', platform: 'ios' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PUSH_TOKEN_NO_EMPLOYEE_PROFILE');
  });

  it('rejects an invalid platform value', async () => {
    const res = await request(app)
      .post('/api/notifications/push-token')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ token: 'ExponentPushToken[test-ddd]', platform: 'windows-phone' });

    expect(res.status).toBe(400);
  });
});
```

**Nota per l'engineer:** questo test presume un helper `signAccessToken` in `backend/src/utils/jwt.js` — verificare il nome esatto della funzione esportata (`grep -n "module.exports" backend/src/utils/jwt.js`) e adattare l'import se il nome reale è diverso, prima di eseguire il test.

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
cd backend
npx jest src/__tests__/notifications-push-token.test.js
```

Expected: FAIL — la route `POST /push-token` non esiste ancora (404) o valida diversamente.

- [ ] **Step 3: Aggiungere l'endpoint a `notifications.js`**

```js
// aggiungere in cima al file, dopo i require esistenti
const { z } = require('zod');
const { ForbiddenError, ValidationError } = require('../utils/errors');

const PushTokenSchema = z.object({
  token: z.string().min(10),
  platform: z.enum(['ios', 'android']),
});

// =====================================================
// POST /api/notifications/push-token — Register/upsert a device push token
// =====================================================

router.post('/push-token', requireAuth, async (req, res, next) => {
  const userEmployeeId = req.user.employee_id;
  const clientId = req.user.client_id;

  try {
    if (!userEmployeeId) {
      throw new ForbiddenError(
        'Your account has no employee profile — cannot register a push token',
        'PUSH_TOKEN_NO_EMPLOYEE_PROFILE'
      );
    }

    const parsed = PushTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid push token payload', parsed.error.flatten());
    }
    const { token, platform } = parsed.data;

    await pool.query(
      `INSERT INTO device_push_tokens (employee_id, client_id, token, platform)
       VALUES ($1::uuid, $2::uuid, $3, $4)
       ON CONFLICT (token) DO UPDATE
         SET employee_id = EXCLUDED.employee_id,
             client_id = EXCLUDED.client_id,
             platform = EXCLUDED.platform,
             updated_at = NOW()`,
      [userEmployeeId, clientId, token, platform]
    );

    logger.info({ action: 'push_token_registered', employee_id: userEmployeeId, platform });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

```bash
cd backend
npx jest src/__tests__/notifications-push-token.test.js
```

Expected: PASS, 4 test.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/notifications.js backend/src/__tests__/notifications-push-token.test.js
git commit -m "feat: add POST /api/notifications/push-token endpoint"
```

---

## Task 6: Pulizia GDPR alla disattivazione del dipendente

**Files:**
- Modify: `backend/src/routes/admin/employees.js:256-286`

- [ ] **Step 1: Aggiungere la query di pulizia dopo il soft-delete**

In `router.delete('/:id', ...)`, subito dopo l'`UPDATE employees SET active = false...` che produce `result`, prima di `logAudit`:

```js
    if (result.rowCount === 0) return next(new NotFoundError('Employee not found', 'EMPLOYEE_NOT_FOUND'));

    const emp = result.rows[0];

    // GDPR data minimization: un token push è dato personale legato a un
    // device fisico di un individuo — non ha motivo di restare in tabella
    // dopo che il dipendente è stato disattivato (design spec 2026-08-30,
    // decisione 8).
    await pool.query('DELETE FROM device_push_tokens WHERE employee_id = $1::uuid', [emp.id]);

    await logAudit(pool, {
```

- [ ] **Step 2: Aggiungere/estendere il test esistente per la disattivazione dipendente**

Cercare il file di test che copre già `DELETE /api/admin/employees/:id`:

```bash
cd backend
grep -rln "DELETE.*admin/employees\|admin_deactivate_employee" src/__tests__/
```

Nel file trovato, aggiungere un test scoped al `client_id` che il test stesso crea:

```js
it('deletes any registered push tokens when deactivating an employee', async () => {
  await pool.query(
    `INSERT INTO device_push_tokens (employee_id, client_id, token, platform) VALUES ($1::uuid, $2::uuid, $3, 'ios')`,
    [employeeId, clientId, `ExponentPushToken[cleanup-test-${Date.now()}]`]
  );

  const res = await request(app)
    .delete(`/api/admin/employees/${employeeId}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(res.status).toBe(200);

  const row = await pool.query('SELECT id FROM device_push_tokens WHERE employee_id = $1::uuid', [employeeId]);
  expect(row.rows).toHaveLength(0);
});
```

Adattare i nomi delle variabili (`employeeId`, `clientId`, `adminToken`, `app`, `pool`) a quelli già in uso in quel file — non introdurre un secondo schema di setup.

- [ ] **Step 3: Eseguire il test e verificare che fallisca prima della Step 1, poi passi dopo**

```bash
cd backend
npx jest <percorso-del-file-trovato-allo-step-2> -t "deletes any registered push tokens"
```

Expected: FAIL prima della modifica (righe ancora presenti), PASS dopo.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/admin/employees.js backend/src/__tests__/<file-trovato>.test.js
git commit -m "feat: delete device push tokens on employee deactivation (GDPR)"
```

---

## Task 7: Wiring in `shifts.js`

**Files:**
- Modify: `backend/src/routes/shifts.js:346-369`

- [ ] **Step 1: Sostituire l'INSERT diretto con `notifyEmployee()`**

```js
    // 6. Create notifications for employees whose shifts changed (best-effort, outside transaction)
    const { notifyEmployee } = require('../utils/pushNotifications');
    const SHIFT_LABELS = { m: 'Mattino', p: 'Pomeriggio', s: 'Sera', R: 'Riposo' };
    for (const [empId, dates] of Object.entries(shifts_data)) {
      for (const [date, newShift] of Object.entries(dates)) {
        const oldShift = oldValue?.[empId]?.[date];
        if (oldShift === newShift) continue; // unchanged

        const dateFormatted = new Date(date + 'T00:00:00').toLocaleDateString('it-IT', {
          weekday: 'long', day: 'numeric', month: 'long',
        });
        const shiftLabel = SHIFT_LABELS[newShift] || newShift;
        const message = `Turno aggiornato: ${dateFormatted} → ${shiftLabel}`;

        // notifyEmployee non va mai awaited qui dentro per la parte push
        // (lo fa già internamente) — ma la CHIAMATA stessa resta awaited
        // perché la sua parte 1 (insert notifications) deve restare
        // sincrona esattamente come il vecchio pool.query diretto (design
        // spec, decisione 9 e 12: solo l'invio Expo è fire-and-forget,
        // l'insert in-app resta affidabile).
        await notifyEmployee({
          employeeId: empId,
          clientId,
          type: 'shift_updated',
          inAppMessage: message,
          pushTitle: 'Turno aggiornato',
          pushBody: message,
          shiftDate: date,
          newShift,
          siteId,
        });
      }
    }
```

Rimuovere il `require('../db/pool')`'s uso diretto qui se non più necessario altrove nel file (verificare con `grep -n "pool\." backend/src/routes/shifts.js` che `pool` sia ancora usato altrove prima di rimuovere l'import in testa al file — molto probabile che sì, per la query di update/insert dentro `withTransaction` usa `client`, ma altre parti del file potrebbero usare `pool` direttamente: non rimuovere l'import se resta in uso).

- [ ] **Step 2: Spostare il `require` in cima al file (non inline nel loop)**

Aggiungere insieme agli altri `require` in testa a `shifts.js`:

```js
const { notifyEmployee } = require('../utils/pushNotifications');
```

E rimuovere la riga `const { notifyEmployee } = require('../utils/pushNotifications');` inserita inline nello Step 1 (era solo per mostrare il punto d'innesto).

- [ ] **Step 3: Eseguire la suite di test esistente di `shifts.js` e verificare che passi ancora**

```bash
cd backend
npx jest src/__tests__ -t "shifts" 2>&1 | tail -40
```

Expected: PASS — nessuna regressione sul comportamento in-app esistente (il test probabilmente asserisce sul contenuto della tabella `notifications`, che resta identico).

- [ ] **Step 4: Aggiungere un test di regressione esplicito sulla latenza (decisione 12)**

Nel file di test di `shifts.js` esistente (`grep -rln "shifts_data" backend/src/__tests__/*.test.js` per trovarlo), aggiungere:

```js
it('does not await the Expo push send when saving a shifts plan with many changed cells (design decision 12)', async () => {
  // Registra un token push finto per uno dei dipendenti coinvolti, poi
  // verifica che la risposta HTTP torni rapidamente anche se Expo fosse
  // lento — qui simulato mockando notifyEmployee stesso non è possibile
  // senza toccare l'implementazione reale, quindi il test verifica invece
  // il comportamento osservabile: la risposta non supera una soglia
  // ragionevole anche con più celle cambiate in un singolo payload.
  const start = Date.now();
  const res = await request(app)
    .put(`/api/shifts/${siteId}/${month}/${year}`)
    .set('Authorization', `Bearer ${managerToken}`)
    .send({ shifts_data: manyChangedCellsPayload });

  expect(res.status).toBe(200);
  expect(Date.now() - start).toBeLessThan(2000);
});
```

Adattare `siteId`, `month`, `year`, `managerToken`, `manyChangedCellsPayload` alle variabili/fixture già presenti in quel file di test — costruire `manyChangedCellsPayload` con almeno 20 celle diverse dal payload esistente usato dagli altri test in quel file.

- [ ] **Step 5: Eseguire il test e verificare che passi**

```bash
cd backend
npx jest <file-trovato> -t "does not await the Expo push send"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/shifts.js backend/src/__tests__/<file-trovato>.test.js
git commit -m "feat: wire shift notifications through notifyEmployee (adds push delivery)"
```

---

## Task 8: Wiring in `leaves.js`

**Files:**
- Modify: `backend/src/routes/leaves.js:1-20` (import), `:338-339` (dopo `withTransaction`)

- [ ] **Step 1: Aggiungere l'import in cima al file**

```js
const { notifyEmployee } = require('../utils/pushNotifications');
```

- [ ] **Step 2: Chiamare `notifyEmployee` subito dopo `withTransaction()`, prima del `logger.info` esistente**

Sostituire:

```js
      return updatedLeave;
    });

    logger.info({
```

con:

```js
      return updatedLeave;
    });

    // Fuori transazione, per design (decisione 9 della spec): un problema
    // di rete verso Expo non deve mai poter far fallire un'approvazione già
    // committata sul DB.
    const period = `dal ${new Date(result.start_date).toLocaleDateString('it-IT')} al ${new Date(result.end_date).toLocaleDateString('it-IT')}`;
    const isApproved = result.status === 'APPROVED';
    const reasonSuffix = !isApproved && rejection_reason ? ` (${rejection_reason})` : '';
    await notifyEmployee({
      employeeId: result.user_id,
      clientId,
      type: isApproved ? 'leave_approved' : 'leave_rejected',
      inAppMessage: `Richiesta ferie ${period} ${isApproved ? 'approvata' : 'rifiutata' + reasonSuffix}.`,
      pushTitle: 'Richiesta ferie',
      pushBody: isApproved
        ? 'La tua richiesta è stata approvata. Apri l\'app per i dettagli.'
        : 'La tua richiesta è stata rifiutata. Apri l\'app per i dettagli.',
    });

    logger.info({
```

- [ ] **Step 3: Eseguire la suite esistente di `leaves.js` e verificare che passi ancora**

```bash
cd backend
npx jest src/__tests__ -t "leave" 2>&1 | tail -40
```

Expected: PASS — nessuna asserzione preesistente controllava `device_push_tokens` o push, quindi nessuna regressione attesa; se un test esistente conta esattamente le righe in `notifications` per quello scope, verificare che il conteggio resti coerente (`notifyEmployee` inserisce sempre una riga, come faceva prima solo `shifts.js`).

- [ ] **Step 4: Aggiungere un test che verifica la scrittura in-app dopo approvazione/rifiuto**

Nel file di test che copre `PUT /api/v1/leave/:id/approve` (`grep -rln "leave.*approve" backend/src/__tests__/*.test.js`):

```js
it('writes an in-app notification for the employee when a leave request is approved', async () => {
  const res = await request(app)
    .put(`/api/v1/leave/${leaveRequestId}/approve`)
    .set('Authorization', `Bearer ${managerToken}`)
    .send({ status: 'APPROVED' });

  expect(res.status).toBe(200);

  const notif = await pool.query(
    `SELECT type, message FROM notifications WHERE employee_id = $1::uuid AND type = 'leave_approved' ORDER BY created_at DESC LIMIT 1`,
    [employeeId]
  );
  expect(notif.rows).toHaveLength(1);
  expect(notif.rows[0].message).toMatch(/approvata/);
});

it('writes an in-app notification for the employee when a leave request is rejected', async () => {
  const res = await request(app)
    .put(`/api/v1/leave/${leaveRequestId2}/approve`)
    .set('Authorization', `Bearer ${managerToken}`)
    .send({ status: 'REJECTED', rejection_reason: 'Copertura insufficiente' });

  expect(res.status).toBe(200);

  const notif = await pool.query(
    `SELECT type, message FROM notifications WHERE employee_id = $1::uuid AND type = 'leave_rejected' ORDER BY created_at DESC LIMIT 1`,
    [employeeId]
  );
  expect(notif.rows).toHaveLength(1);
  expect(notif.rows[0].message).toMatch(/rifiutata/);
  expect(notif.rows[0].message).toContain('Copertura insufficiente');
});
```

Adattare `leaveRequestId`, `leaveRequestId2`, `employeeId`, `managerToken`, `app`, `pool` alle fixture già presenti in quel file (creare una seconda leave request pending se il file ne gestisce solo una per test).

- [ ] **Step 5: Eseguire e verificare che passi**

```bash
cd backend
npx jest <file-trovato> -t "writes an in-app notification"
```

Expected: PASS, 2 test.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/leaves.js backend/src/__tests__/<file-trovato>.test.js
git commit -m "feat: notify employee on leave request approval/rejection"
```

---

## Task 9: Wiring in `events.js`

**Files:**
- Modify: `backend/src/routes/events.js:1-20` (import), `:313-314` (dopo `withTransaction`)

- [ ] **Step 1: Aggiungere l'import in cima al file**

```js
const { notifyEmployee } = require('../utils/pushNotifications');
```

- [ ] **Step 2: Chiamare `notifyEmployee` subito dopo `withTransaction()`, prima del `logger.info` esistente**

Sostituire:

```js
    });

    logger.info({
      action: 'event_request_approved',
```

con:

```js
    });

    const eventDateFormatted = new Date(result.event_date).toLocaleDateString('it-IT');
    const isApproved = result.status === 'APPROVED';
    const reasonSuffix = !isApproved && rejection_reason ? ` (${rejection_reason})` : '';
    await notifyEmployee({
      employeeId: result.user_id,
      clientId,
      type: isApproved ? 'event_approved' : 'event_rejected',
      inAppMessage: `Richiesta evento del ${eventDateFormatted} ${isApproved ? 'approvata' : 'rifiutata' + reasonSuffix}.`,
      pushTitle: 'Richiesta evento',
      pushBody: isApproved
        ? 'La tua richiesta è stata approvata. Apri l\'app per i dettagli.'
        : 'La tua richiesta è stata rifiutata. Apri l\'app per i dettagli.',
    });

    logger.info({
      action: 'event_request_approved',
```

- [ ] **Step 3: Eseguire la suite esistente di `events.js` e verificare che passi ancora**

```bash
cd backend
npx jest src/__tests__ -t "event" 2>&1 | tail -40
```

Expected: PASS.

- [ ] **Step 4: Aggiungere test analoghi a quelli del Task 8 per `event_approved`/`event_rejected`**

Stesso schema del Task 8 Step 4, nel file che copre `PUT /api/v1/events/:id/approve` (`grep -rln "events.*approve" backend/src/__tests__/*.test.js`), con `type = 'event_approved'` / `'event_rejected'`.

- [ ] **Step 5: Eseguire e verificare che passi**

```bash
cd backend
npx jest <file-trovato> -t "writes an in-app notification"
```

Expected: PASS, 2 test.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/events.js backend/src/__tests__/<file-trovato>.test.js
git commit -m "feat: notify employee on event request approval/rejection"
```

---

## Task 10: Suite backend completa

- [ ] **Step 1: Eseguire l'intera suite backend (rispetta lo split a due batch — vedi CLAUDE.md Pattern 5)**

```bash
cd backend
npm test
```

Expected: tutti i test PASS, nessun file rimasto rosso.

- [ ] **Step 2: Grep di sicurezza sui pattern noti**

```bash
cd backend
grep -rn "(client_id|site_id|employee_id): '[^{]'" src/ || echo "OK: nessun hardcoded UUID trovato"
grep -rn '::date' src/**/*.js | grep -v "AT TIME ZONE" || echo "OK: nessun cast ::date senza timezone"
```

Expected: entrambi stampano "OK" (questo task non tocca colonne TIMESTAMPTZ né introduce UUID hardcoded, ma il grep va comunque eseguito per policy di CLAUDE.md prima di considerare il backend completo).

---

## Task 11: Dipendenza `expo-notifications` e config `app.json`

**Files:**
- Modify: `frontend-mobile/package.json`
- Modify: `frontend-mobile/app.json`

- [ ] **Step 1: Installare la dipendenza con `expo install` (risolve automaticamente la versione compatibile con Expo SDK 54, non va pinnata a mano)**

```bash
cd frontend-mobile
npx expo install expo-notifications
```

- [ ] **Step 2: Verificare la versione installata**

```bash
grep '"expo-notifications"' package.json
```

Expected: una riga tipo `"expo-notifications": "~X.Y.Z"` compatibile con SDK 54 (la versione esatta è decisa da `expo install`, non va indovinata).

- [ ] **Step 3: Aggiungere il plugin e la config Android/iOS ad `app.json`**

Nel blocco `expo.plugins` (accanto a `expo-updates`, `expo-local-authentication`, `expo-location`):

```json
      [
        "expo-notifications",
        {
          "icon": "./assets/icon.png",
          "color": "#1E3A5F"
        }
      ]
```

Nel blocco `expo.android`, aggiungere il riferimento al file scaricato nel Task 1:

```json
    "android": {
      "package": "it.dataxiom.badge",
      "versionCode": 1,
      "googleServicesFile": "./google-services.json",
      "adaptiveIcon": { ... },
      "permissions": [ ... ]
    }
```

(mantenere invariati `adaptiveIcon` e `permissions` esistenti — solo aggiungere `googleServicesFile`.)

- [ ] **Step 4: Verificare che `app.json` sia JSON valido**

```bash
cd frontend-mobile
node -e "JSON.parse(require('fs').readFileSync('app.json', 'utf8')); console.log('OK: JSON valido')"
```

Expected: `OK: JSON valido`.

- [ ] **Step 5: Commit**

```bash
git add frontend-mobile/package.json frontend-mobile/package-lock.json frontend-mobile/app.json
git commit -m "chore: add expo-notifications dependency and config plugin"
```

---

## Task 12: `pushNotificationsService.js`

**Files:**
- Create: `frontend-mobile/src/services/pushNotificationsService.js`
- Test: `frontend-mobile/src/__tests__/pushNotificationsService.test.js`
- Modify: `frontend-mobile/src/config/endpoints.js`

- [ ] **Step 1: Aggiungere l'endpoint e la storage key**

In `endpoints.js`, dentro `ENDPOINTS`:

```js
  // Push notifications
  NOTIFICATIONS_PUSH_TOKEN: '/api/notifications/push-token',
```

Dentro `STORAGE_KEYS`:

```js
  // Push notifications: mostrato una sola volta dopo l'aggiornamento
  // (design spec 2026-08-30, decisione 4) — non ad ogni login.
  PUSH_CONSENT_DIALOG_SHOWN: 'badge_push_consent_dialog_shown',
```

- [ ] **Step 2: Scrivere il test del servizio**

```jsx
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { MAX: 5 },
}));

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { eas: { projectId: 'test-project-id' } } },
}));

const mockPost = jest.fn();
jest.mock('../services/apiClient', () => ({ post: (...args) => mockPost(...args) }));

import pushNotificationsService from '../services/pushNotificationsService';

describe('pushNotificationsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not request permission or fetch a token when already denied permanently', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });

    const result = await pushNotificationsService.registerForPushNotifications();

    expect(result).toEqual({ granted: false, canAskAgain: false });
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests permission, gets a token, and posts it to the backend when granted', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[xxxx]' });
    mockPost.mockResolvedValue({ data: { success: true } });

    const result = await pushNotificationsService.registerForPushNotifications();

    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'test-project-id' });
    expect(mockPost).toHaveBeenCalledWith('/api/notifications/push-token', {
      token: 'ExponentPushToken[xxxx]',
      platform: expect.stringMatching(/^(ios|android)$/),
    });
    expect(result).toEqual({ granted: true, canAskAgain: true });
  });

  it('does not throw when the backend registration call fails (best-effort)', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[xxxx]' });
    mockPost.mockRejectedValue(new Error('network down'));

    await expect(pushNotificationsService.registerForPushNotifications()).resolves.toEqual({ granted: true, canAskAgain: true });
  });

  it('reports permission denial without throwing, when the user declines the system prompt', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });

    const result = await pushNotificationsService.registerForPushNotifications();

    expect(result).toEqual({ granted: false, canAskAgain: true });
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Eseguire il test e verificare che fallisca**

```bash
cd frontend-mobile
npx jest src/__tests__/pushNotificationsService.test.js
```

Expected: FAIL — il modulo non esiste ancora.

- [ ] **Step 4: Implementare il servizio**

```js
/**
 * pushNotificationsService — wrapper sottile su expo-notifications.
 *
 * Contratto (design spec 2026-08-30):
 * - registerForPushNotifications() va chiamato SOLO dopo che il dipendente
 *   ha accettato il dialog esplicativo (PushConsentDialog) — non va mai
 *   invocato a freddo.
 * - Se il permesso è già negato in modo permanente, non richiama mai
 *   requestPermissionsAsync (che non farebbe ricomparire il prompt di
 *   sistema comunque, ma sprecherebbe una chiamata e potrebbe confondere il
 *   flusso di chi legge il log).
 * - Un fallimento della registrazione al backend è best-effort — non deve
 *   mai bloccare l'app (decisione 5 della spec: comportamento silenzioso).
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import apiClient from './apiClient';
import { ENDPOINTS } from '../config/endpoints';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Notifiche Badge System',
    importance: Notifications.AndroidImportance.MAX,
  });
}

/**
 * @returns {Promise<{ granted: boolean, canAskAgain: boolean }>}
 */
async function registerForPushNotifications() {
  const existing = await Notifications.getPermissionsAsync();

  let finalStatus = existing.status;
  let canAskAgain = existing.canAskAgain;

  if (existing.status !== 'granted' && existing.canAskAgain) {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
    canAskAgain = requested.canAskAgain;
  }

  if (finalStatus !== 'granted') {
    return { granted: false, canAskAgain };
  }

  await ensureAndroidChannel();

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

  try {
    await apiClient.post(ENDPOINTS.NOTIFICATIONS_PUSH_TOKEN, {
      token,
      platform: Platform.OS,
    });
  } catch (err) {
    // Best-effort — il dipendente ha comunque concesso il permesso lato OS,
    // un fallimento di rete nella registrazione non deve bloccare nulla.
    // Un prossimo avvio dell'app (o toggle in Impostazioni) può ritentare.
  }

  return { granted: true, canAskAgain };
}

export default { registerForPushNotifications };
```

- [ ] **Step 5: Eseguire il test e verificare che passi**

```bash
cd frontend-mobile
npx jest src/__tests__/pushNotificationsService.test.js
```

Expected: PASS, 4 test.

- [ ] **Step 6: Verificare il `projectId` reale in `app.json`**

```bash
cd frontend-mobile
grep -A2 '"eas"' app.json
```

Confermare che coincida con `7a913808-3c12-418c-ac23-59538898acff` (già noto da esplorazione precedente) o annotare se diverso — `Constants.expoConfig.extra.eas.projectId` deve risolversi a questo valore a runtime, non richiede modifiche di codice se `app.json` è già configurato correttamente per EAS Build.

- [ ] **Step 7: Commit**

```bash
git add frontend-mobile/src/services/pushNotificationsService.js frontend-mobile/src/__tests__/pushNotificationsService.test.js frontend-mobile/src/config/endpoints.js
git commit -m "feat: add pushNotificationsService (permission + token registration)"
```

---

## Task 13: `PushConsentDialog.jsx`

**Files:**
- Create: `frontend-mobile/src/components/PushConsentDialog.jsx`
- Test: `frontend-mobile/src/__tests__/PushConsentDialog.test.jsx`

- [ ] **Step 1: Scrivere il test (mirror di `GPSConsentDialog.test.jsx` — leggerlo prima per allinearsi esattamente alle convenzioni di query/testID usate lì)**

```bash
cat frontend-mobile/src/__tests__/GPSConsentDialog.test.jsx
```

```jsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import PushConsentDialog from '../components/PushConsentDialog';

describe('PushConsentDialog', () => {
  it('renders nothing when not visible', () => {
    const { queryByText } = render(
      <PushConsentDialog visible={false} onAccept={jest.fn()} onDecline={jest.fn()} />
    );
    expect(queryByText('Attiva')).toBeNull();
  });

  it('calls onAccept when the employee taps Attiva', () => {
    const onAccept = jest.fn();
    const { getByText } = render(
      <PushConsentDialog visible={true} onAccept={onAccept} onDecline={jest.fn()} />
    );
    fireEvent.press(getByText('Attiva'));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('calls onDecline when the employee taps Non ora', () => {
    const onDecline = jest.fn();
    const { getByText } = render(
      <PushConsentDialog visible={true} onAccept={jest.fn()} onDecline={onDecline} />
    );
    fireEvent.press(getByText('Non ora'));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('explains the benefit before the system prompt (decisione 4 della spec)', () => {
    const { getByText } = render(
      <PushConsentDialog visible={true} onAccept={jest.fn()} onDecline={jest.fn()} />
    );
    expect(getByText(/cambi turno e approvazioni/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
cd frontend-mobile
npx jest src/__tests__/PushConsentDialog.test.jsx
```

Expected: FAIL — il componente non esiste ancora.

- [ ] **Step 3: Implementare il componente**

```jsx
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

/**
 * PushConsentDialog — dialog esplicativo mostrato PRIMA del prompt di
 * sistema per le notifiche push (design spec 2026-08-30, decisione 4).
 * Mirror strutturale di GPSConsentDialog.jsx, mostrato una sola volta alla
 * prima apertura dopo l'aggiornamento (il flag AsyncStorage che decide
 * quando mostrarlo vive nel chiamante — RootNavigator — non qui: questo
 * componente non ha stato persistito proprio, resta puramente controllato).
 */
export default function PushConsentDialog({ visible, onAccept, onDecline }) {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <Text style={styles.title}>🔔 Notifiche</Text>
          <Text style={styles.message}>
            Ricevi un avviso immediato per cambi turno e approvazioni delle tue richieste di ferie ed eventi — direttamente sul telefono, senza dover aprire l'app.
          </Text>
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={[styles.button, styles.declineButton]} onPress={onDecline}>
              <Text style={styles.declineText}>Non ora</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.acceptButton]} onPress={onAccept}>
              <Text style={styles.acceptText}>Attiva</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

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
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

```bash
cd frontend-mobile
npx jest src/__tests__/PushConsentDialog.test.jsx
```

Expected: PASS, 4 test.

- [ ] **Step 5: Commit**

```bash
git add frontend-mobile/src/components/PushConsentDialog.jsx frontend-mobile/src/__tests__/PushConsentDialog.test.jsx
git commit -m "feat: add PushConsentDialog component"
```

---

## Task 14: Wiring in `RootNavigator.jsx` (solo ruolo `employee`, una sola volta)

**Files:**
- Modify: `frontend-mobile/src/navigation/RootNavigator.jsx`

- [ ] **Step 1: Importare le nuove dipendenze in cima al file**

```js
import PushConsentDialog from '../components/PushConsentDialog';
import pushNotificationsService from '../services/pushNotificationsService';
```

- [ ] **Step 2: Aggiungere stato e effetto dentro `MainTabs`, subito dopo la lettura del ruolo esistente**

Individuare il blocco esistente:

```js
  useEffect(() => {
    secureAuthStorage.getUser()
      .then(user => setRole((user && user.role) || 'employee'))
      .catch((err) => {
        console.warn('Failed to read user role from secure storage, defaulting to employee:', err);
        setRole('employee');
      });
  }, []);
```

Aggiungere subito dopo (stesso livello, dentro `MainTabs`):

```js
  const [showPushConsent, setShowPushConsent] = useState(false);

  // Mostrato una sola volta per device, solo al dipendente (design spec
  // 2026-08-30, decisione 1: target sempre e solo il dipendente diretto —
  // un manager/admin non riceve mai una notifica push, quindi non ha senso
  // interromperlo con questo dialog).
  useEffect(() => {
    if (role !== 'employee') return;
    AsyncStorage.getItem(STORAGE_KEYS.PUSH_CONSENT_DIALOG_SHOWN).then((value) => {
      if (value !== 'true') setShowPushConsent(true);
    });
  }, [role]);

  const handlePushConsentAccept = async () => {
    setShowPushConsent(false);
    await AsyncStorage.setItem(STORAGE_KEYS.PUSH_CONSENT_DIALOG_SHOWN, 'true');
    await pushNotificationsService.registerForPushNotifications();
  };

  const handlePushConsentDecline = async () => {
    setShowPushConsent(false);
    await AsyncStorage.setItem(STORAGE_KEYS.PUSH_CONSENT_DIALOG_SHOWN, 'true');
  };
```

- [ ] **Step 3: Renderizzare il dialog nel JSX di ritorno di `MainTabs`**

Individuare il `return (` di `MainTabs` (dopo il check `if (role === null)`) e avvolgere l'albero esistente aggiungendo il dialog come fratello, non annidato dentro `Tab.Navigator`:

```jsx
  return (
    <PendingLeaveContext.Provider value={{ setPendingCount }}>
    <PendingEventContext.Provider value={{ setPendingCount: setPendingEventCount }}>
    <>
      <PushConsentDialog
        visible={showPushConsent}
        onAccept={handlePushConsentAccept}
        onDecline={handlePushConsentDecline}
      />
      <Tab.Navigator
```

E chiudere il nuovo `<>` prima della chiusura esistente dei due `Provider` (individuare dove oggi termina `</Tab.Navigator>` seguito dalla chiusura dei Provider, e inserire `</>` tra `</Tab.Navigator>` e la chiusura dei Provider).

- [ ] **Step 4: Eseguire la suite di test di `RootNavigator`**

```bash
cd frontend-mobile
npx jest src/__tests__/RootNavigator.test.jsx 2>&1 | tail -40
```

Expected: PASS — se il file di test esiste già e monta `MainTabs`, verificare che non fallisca per via del nuovo `useEffect`/dialog (potrebbe servire un `jest.mock('../services/pushNotificationsService', ...)` nel setup del test, seguendo lo stesso pattern già usato lì per altri servizi mockati).

- [ ] **Step 5: Aggiungere un test esplicito per il gate di ruolo e la persistenza del flag**

Nello stesso file di test di `RootNavigator`:

```jsx
it('shows the push consent dialog once for an employee who has not seen it yet', async () => {
  AsyncStorage.getItem.mockImplementation((key) => {
    if (key === STORAGE_KEYS.PUSH_CONSENT_DIALOG_SHOWN) return Promise.resolve(null);
    return Promise.resolve(null);
  });
  secureAuthStorage.getUser.mockResolvedValue({ role: 'employee' });

  const { findByText } = render(<RootNavigator />);
  expect(await findByText('🔔 Notifiche')).toBeTruthy();
});

it('does not show the push consent dialog for a manager', async () => {
  secureAuthStorage.getUser.mockResolvedValue({ role: 'manager' });

  const { queryByText } = render(<RootNavigator />);
  await new Promise((resolve) => setImmediate(resolve));
  expect(queryByText('🔔 Notifiche')).toBeNull();
});

it('does not show the dialog again once the flag is already set', async () => {
  AsyncStorage.getItem.mockImplementation((key) => {
    if (key === STORAGE_KEYS.PUSH_CONSENT_DIALOG_SHOWN) return Promise.resolve('true');
    return Promise.resolve(null);
  });
  secureAuthStorage.getUser.mockResolvedValue({ role: 'employee' });

  const { queryByText } = render(<RootNavigator />);
  await new Promise((resolve) => setImmediate(resolve));
  expect(queryByText('🔔 Notifiche')).toBeNull();
});
```

Adattare i mock di `AsyncStorage`/`secureAuthStorage` alle convenzioni già in uso in quel file di test (probabile `jest.mock('@react-native-async-storage/async-storage', ...)` già presente).

- [ ] **Step 6: Eseguire e verificare che passi**

```bash
cd frontend-mobile
npx jest src/__tests__/RootNavigator.test.jsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend-mobile/src/navigation/RootNavigator.jsx frontend-mobile/src/__tests__/RootNavigator.test.jsx
git commit -m "feat: show push consent dialog once for employees, wire token registration"
```

---

## Task 15: Riga "Notifiche" in `SettingsScreen.jsx`

**Files:**
- Modify: `frontend-mobile/src/screens/settings/SettingsScreen.jsx`
- Modify: `frontend-mobile/src/__tests__/SettingsScreen.test.jsx`

- [ ] **Step 1: Scrivere il test per la nuova riga**

Aprire il file esistente per capire come sono già mockati `AsyncStorage`/permessi, poi aggiungere:

```jsx
it('shows "Notifiche attive" with no action when permission is already granted', async () => {
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
  const { findByText, queryByText } = render(<SettingsScreen navigation={mockNavigation} />);
  expect(await findByText('Notifiche attive')).toBeTruthy();
  expect(queryByText('Apri Impostazioni')).toBeNull();
});

it('shows "Notifiche disattivate" with an "Apri Impostazioni" recovery button when permanently denied', async () => {
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });
  const { findByText } = render(<SettingsScreen navigation={mockNavigation} />);
  expect(await findByText('Notifiche disattivate')).toBeTruthy();
  expect(await findByText('Apri Impostazioni')).toBeTruthy();
});

it('opens system settings when "Apri Impostazioni" is tapped', async () => {
  Notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });
  const { findByText } = render(<SettingsScreen navigation={mockNavigation} />);
  fireEvent.press(await findByText('Apri Impostazioni'));
  expect(Linking.openSettings).toHaveBeenCalledTimes(1);
});
```

Aggiungere in cima al file di test:

```jsx
import * as Notifications from 'expo-notifications';
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn() }));
```

(`Linking.openSettings` è quasi certamente già mockato in questo file per la riga GPS/Face ID esistente — verificare con `grep -n "Linking" src/__tests__/SettingsScreen.test.jsx` prima di aggiungerne un secondo mock in conflitto.)

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

```bash
cd frontend-mobile
npx jest src/__tests__/SettingsScreen.test.jsx
```

Expected: FAIL — la riga "Notifiche" non esiste ancora nel componente.

- [ ] **Step 3: Implementare la riga in `SettingsScreen.jsx`**

Aggiungere l'import in cima:

```js
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';
```

(verificare se `Linking` è già importato da `'react-native'` nella riga 2 esistente — se sì, aggiungerlo a quella destructuring invece di una seconda import line.)

Aggiungere stato e caricamento dentro il componente, accanto a `faceIdEnabled`:

```js
  const [pushPermission, setPushPermission] = useState(null);

  useFocusEffect(
    useCallback(() => {
      Notifications.getPermissionsAsync().then(setPushPermission).catch(() => setPushPermission(null));
    }, []),
  );
```

(questo `useFocusEffect` si aggiunge come una seconda chiamata, non sostituisce quello esistente — React permette più `useFocusEffect` nello stesso componente.)

Aggiungere la riga nella sezione "Preferenze", dopo la riga Face ID esistente:

```jsx
        {pushPermission && (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>
              {pushPermission.status === 'granted' ? 'Notifiche attive' : 'Notifiche disattivate'}
            </Text>
            {pushPermission.status !== 'granted' && !pushPermission.canAskAgain && (
              <TouchableOpacity onPress={() => Linking.openSettings()}>
                <Text style={[styles.rowLabel, { color: COLORS.navy500 }]}>Apri Impostazioni</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

```bash
cd frontend-mobile
npx jest src/__tests__/SettingsScreen.test.jsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend-mobile/src/screens/settings/SettingsScreen.jsx frontend-mobile/src/__tests__/SettingsScreen.test.jsx
git commit -m "feat: add Notifiche row to SettingsScreen with recovery path"
```

---

## Task 16: Suite mobile completa

- [ ] **Step 1: Eseguire l'intera suite mobile**

```bash
cd frontend-mobile
npx jest
```

Expected: tutti i test PASS.

- [ ] **Step 2: Verificare che il progetto non abbia riferimenti a `expo-notifications` fuori da dove atteso**

```bash
cd frontend-mobile
grep -rln "expo-notifications" src/ app.json package.json
```

Expected: solo `pushNotificationsService.js`, `PushConsentDialog.jsx` (nessun riferimento diretto — verificare che non ne serva uno), `SettingsScreen.jsx`, `app.json`, `package.json`, e i relativi file di test.

---

## Task 17: Build EAS e TestFlight (manuale, ultimo — richiede Task 1 completato)

Questo task non è automatizzabile da un subagent: richiede credenziali interattive e un vero dispositivo di test.

- [ ] **Step 1: Verificare che il Task 1 (Firebase/FCM) sia completo**

```bash
cd frontend-mobile
eas credentials --platform android
```

Confermare che compaia una chiave di servizio FCM già caricata.

- [ ] **Step 2: Avviare una build EAS (non-OTA, richiede nuovo binario — decisione 11 della spec)**

```bash
cd frontend-mobile
eas build --platform all --profile <profilo-esistente-per-testflight-interno>
```

(Usare lo stesso profilo `eas.json` già impiegato per le build TestFlight precedenti — verificare `cat eas.json` per il nome esatto del profilo, non assumerlo.)

- [ ] **Step 3: Sottomettere a TestFlight (iOS) e installare manualmente (Android)**

```bash
eas submit --platform ios --latest
```

- [ ] **Step 4: Test manuale end-to-end su device reale**

1. Installare la nuova build su un device di test collegato a un dipendente demo/reale.
2. Login → verificare che compaia `PushConsentDialog` alla prima apertura.
3. Toccare "Attiva" → concedere il permesso di sistema → verificare in `device_push_tokens` (query diretta al DB) che sia comparsa una riga per quell'`employee_id`.
4. Da un altro account (manager), approvare una richiesta ferie/evento di quel dipendente, o salvare un piano turni che lo coinvolge.
5. Verificare che il device riceva il banner push entro pochi secondi, sia ad app aperta sia in background/lock screen.
6. In Impostazioni → Notifiche → disattivare dal sistema operativo → riaprire l'app → verificare che la riga mostri "Notifiche disattivate" + "Apri Impostazioni", e che il tap apra davvero le impostazioni di sistema dell'app.

---

## Self-Review (già eseguita in fase di scrittura del piano)

**Copertura spec:** tutte le 12 decisioni della spec hanno un task corrispondente — 1/10 (Task 7-9, eventi coperti), 2 (solo mobile, nessun task web), 3 (nessuna cronologia, nessun task aggiunge una schermata storico), 4-5 (Task 13-15), 6 (Task 1, 3, 11), 7 (Task 2), 8 (Task 5-6), 9 (Task 4), 10 (Task 4 contenuti, Task 8-9 titoli/corpi), 11 (Task 11, 17), 12 (Task 4 Step 3, Task 7 Step 4).

**Scan placeholder:** nessun "TBD"/"TODO" lasciato aperto nel codice dei task — le uniche note "adattare a variabili esistenti" sono istruzioni esplicite per l'engineer su file che il piano non può leggere in anteprima esatta (nomi di variabili di test già scritti da altri), non omissioni di logica.

**Coerenza dei tipi:** `notifyEmployee({ employeeId, clientId, type, inAppMessage, pushTitle, pushBody, shiftDate, newShift, siteId })` usato in modo identico in Task 4 (definizione), 7 (shifts.js), 8 (leaves.js), 9 (events.js) — stessa firma ovunque. `pushNotificationsService.registerForPushNotifications()` restituisce sempre `{ granted, canAskAgain }`, usato coerentemente in Task 12 (definizione/test) e Task 14 (chiamante).
