# Onboarding Cliente Self-Service — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **NON eseguire questo piano finché SES non è verificato in produzione** (Task 5-7 di `docs/superpowers/plans/2026-07-19-demo-funnel-screenshots-ses.md`) — senza email funzionanti verso domini reali, i test di Task 4/5/7 sotto potrebbero passare solo mockati, mai verificati end-to-end.

**Goal:** trasformare l'onboarding cliente da processo "concierge" manuale (Dataxiom esegue uno script CLI su un Excel) a wizard self-service nel dashboard admin, riusando la logica Excel→DB già scritta e testata, più un meccanismo di invito via email per il primo admin di ogni nuovo cliente.

**Architecture:** vedi `docs/superpowers/specs/2026-07-28-onboarding-self-service-design.md` per il design completo. In sintesi: `backend/scripts/onboarding/*.js` (già modulare) si sposta in `backend/src/services/onboarding/`, richiamabile sia dal CLI che da 2 nuovi endpoint HTTP; un solo pezzo di infrastruttura nuova (token invito one-time) copre l'invito del primo admin; il welcome-dipendenti riusa `must_change_password` già esistente.

**Tech Stack:** invariato — Node/Express/pg (backend), React/Vite/MUI (frontend), Jest+supertest (backend test), Vitest+RTL (frontend test). Nessuna nuova dipendenza esterna (MUI `Stepper` è già nel pacchetto `@mui/material` installato).

---

### Task 1: Migration `034_create_invite_tokens.sql`

**Files:**
- Create: `backend/migrations/034_create_invite_tokens.sql`

- [ ] **Step 1: scrivere la migration**
```sql
CREATE TABLE invite_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email VARCHAR NOT NULL,
  token_hash VARCHAR NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invite_tokens_client ON invite_tokens(client_id);
CREATE INDEX idx_invite_tokens_lookup ON invite_tokens(token_hash) WHERE used_at IS NULL;
```
L'indice parziale su `token_hash WHERE used_at IS NULL` accelera il lookup più frequente (verifica di un token non ancora consumato) senza indicizzare inutilmente le righe già usate/storiche.

- [ ] **Step 2: applicare in locale e verificare idempotenza**
```bash
cd backend && node scripts/run-migrations.js
node scripts/run-migrations.js
```
Expected: primo run crea la tabella, secondo run no-op (nessun errore "already exists" — stesso comportamento del runner esistente per tutte le altre migration).

- [ ] **Step 3: commit**
```bash
git add backend/migrations/034_create_invite_tokens.sql
git commit -m "feat(db): migration invite_tokens per onboarding self-service"
```

---

### Task 2: Spostare `backend/scripts/onboarding/*.js` in `backend/src/services/onboarding/`

**Files:**
- Move: `backend/scripts/onboarding/parseWorkbook.js` → `backend/src/services/onboarding/parseWorkbook.js`
- Move: `backend/scripts/onboarding/validate.js` → `backend/src/services/onboarding/validate.js`
- Move: `backend/scripts/onboarding/validateAgainstDb.js` → `backend/src/services/onboarding/validateAgainstDb.js`
- Move: `backend/scripts/onboarding/apply.js` → `backend/src/services/onboarding/apply.js`
- Move: `backend/scripts/onboarding/preview.js` → `backend/src/services/onboarding/preview.js`
- Modify: `backend/scripts/onboard-client.js` (CLI, aggiorna i path di `require`)

- [ ] **Step 1: spostare i file** (`git mv`, non copia — un'unica sorgente di verità)
```bash
cd backend
mkdir -p src/services/onboarding
git mv scripts/onboarding/parseWorkbook.js src/services/onboarding/parseWorkbook.js
git mv scripts/onboarding/validate.js src/services/onboarding/validate.js
git mv scripts/onboarding/validateAgainstDb.js src/services/onboarding/validateAgainstDb.js
git mv scripts/onboarding/apply.js src/services/onboarding/apply.js
git mv scripts/onboarding/preview.js src/services/onboarding/preview.js
```
(`writeCredentials.js` **resta** in `backend/scripts/onboarding/` — è I/O su disco specifico del CLI, non riusabile/necessario lato HTTP, che invia email invece di scrivere un CSV.)

- [ ] **Step 2: aggiornare i `require` interni** — ogni file spostato referenzia gli altri con path relativi (`./validate`, `./apply`, ecc.), che restano invariati essendosi spostati tutti insieme nella stessa nuova directory. Aggiornare solo `backend/scripts/onboard-client.js`, che ora referenzia una directory esterna a `scripts/`:
```js
// Prima: require('./onboarding/parseWorkbook')
// Dopo:
const { parseWorkbook } = require('../src/services/onboarding/parseWorkbook');
const { validate } = require('../src/services/onboarding/validate');
const { validateAgainstDb } = require('../src/services/onboarding/validateAgainstDb');
const { apply } = require('../src/services/onboarding/apply');
const { formatPreview } = require('../src/services/onboarding/preview');
const { writeCredentials } = require('./onboarding/writeCredentials'); // invariato, resta locale
```

- [ ] **Step 3: verificare che il CLI funzioni ancora identico** — eseguire un dry-run reale contro il DB locale con un Excel di esempio esistente (`backend/scripts/seed-data/onboarding-template-esempio.xlsx`):
```bash
cd backend
node scripts/onboard-client.js --file scripts/seed-data/onboarding-template-esempio.xlsx --dry-run
```
Expected: stesso output di prima del refactor (nessun cambio di comportamento — solo posizione dei file). Se esiste una suite di test per `onboard-client`/`onboarding/*`, rieseguirla ora e verificare 100% verde prima di procedere — isola il rischio di migrazione dei file da quello del codice nuovo (stesso principio già applicato nel piano Android/mobile: verificare l'esistente PRIMA di aggiungere nuovo codice).

- [ ] **Step 4: adattare `parseWorkbook.js` ad accettare anche un Buffer** — l'upload multipart HTTP (Task 7) non scrive un file su disco, passa un Buffer in memoria; il CLI continua a passare un path stringa.
```js
// backend/src/services/onboarding/parseWorkbook.js
const XLSX = require('xlsx');

async function parseWorkbook(fileOrBuffer) {
  const workbook = Buffer.isBuffer(fileOrBuffer)
    ? XLSX.read(fileOrBuffer, { type: 'buffer' })
    : XLSX.readFile(fileOrBuffer);
  // ... resto della logica esistente invariato, opera sempre su `workbook`
}
```
- [ ] **Step 5: test — `parseWorkbook` con Buffer restituisce lo stesso risultato di `parseWorkbook` con path file**, usando lo stesso Excel di esempio letto sia da path che da `fs.readFileSync(path)` come Buffer:
```js
// backend/src/services/onboarding/__tests__/parseWorkbook.test.js
const fs = require('fs');
const path = require('path');
const { parseWorkbook } = require('../parseWorkbook');

const SAMPLE = path.join(__dirname, '../../../../scripts/seed-data/onboarding-template-esempio.xlsx');

test('parseWorkbook(buffer) produces the same result as parseWorkbook(path)', async () => {
  const fromPath = await parseWorkbook(SAMPLE);
  const fromBuffer = await parseWorkbook(fs.readFileSync(SAMPLE));
  expect(fromBuffer).toEqual(fromPath);
});
```

- [ ] **Step 6: commit**
```bash
git add backend/scripts/onboard-client.js backend/src/services/onboarding/
git commit -m "refactor(backend): sposta la logica onboarding in src/services/ per riuso da HTTP + CLI"
```

---

### Task 3: `backend/src/utils/inviteTokens.js`

**Files:**
- Create: `backend/src/utils/inviteTokens.js`
- Create: `backend/src/__tests__/inviteTokens.test.js`

- [ ] **Step 1: scrivere i 4 test che falliscono (TDD)**
```js
// backend/src/__tests__/inviteTokens.test.js
const { generateInviteToken, verifyInviteToken } = require('../utils/inviteTokens');

describe('inviteTokens', () => {
  let pool;
  beforeEach(() => {
    pool = { query: jest.fn() };
  });

  test('generateInviteToken returns a raw token and its hash, distinct from each other', () => {
    const { rawToken, tokenHash } = generateInviteToken();
    expect(rawToken).toHaveLength(43); // 32 byte base64url, no padding
    expect(tokenHash).not.toEqual(rawToken);
  });

  test('generateInviteToken sets expiresAt 7 days from now', () => {
    const before = Date.now();
    const { expiresAt } = generateInviteToken();
    const diffDays = (expiresAt.getTime() - before) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 1);
  });

  test('verifyInviteToken returns the row for a valid, unused, unexpired token', async () => {
    const row = { id: 'inv-1', client_id: 'client-1', email: 'admin@cliente.it', used_at: null, expires_at: new Date(Date.now() + 86400000) };
    pool.query.mockResolvedValue({ rows: [row] });
    const result = await verifyInviteToken(pool, 'raw-token-value');
    expect(result).toEqual(row);
  });

  test('verifyInviteToken returns null for an expired token', async () => {
    pool.query.mockResolvedValue({ rows: [] }); // query filtra già expires_at > now() lato SQL
    const result = await verifyInviteToken(pool, 'expired-token');
    expect(result).toBeNull();
  });

  test('verifyInviteToken returns null for an already-used token', async () => {
    pool.query.mockResolvedValue({ rows: [] }); // query filtra già used_at IS NULL lato SQL
    const result = await verifyInviteToken(pool, 'used-token');
    expect(result).toBeNull();
  });

  test('verifyInviteToken returns null for a nonexistent token', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const result = await verifyInviteToken(pool, 'never-existed');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: eseguire e verificare che falliscano** — `cd backend && npx jest inviteTokens` → `Cannot find module '../utils/inviteTokens'`

- [ ] **Step 3: implementazione minima**
```js
// backend/src/utils/inviteTokens.js
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const TOKEN_TTL_DAYS = 7;
const BCRYPT_ROUNDS = 12; // stesso costo di hashPassword in src/auth/password

function generateInviteToken() {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = bcrypt.hashSync(rawToken, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { rawToken, tokenHash, expiresAt };
}

async function verifyInviteToken(db, rawToken) {
  const { rows } = await db.query(
    `SELECT * FROM invite_tokens WHERE used_at IS NULL AND expires_at > now()`
  );
  for (const row of rows) {
    if (bcrypt.compareSync(rawToken, row.token_hash)) return row;
  }
  return null;
}

module.exports = { generateInviteToken, verifyInviteToken };
```
**Nota implementativa**: `token_hash` è un hash bcrypt (salt casuale per riga), quindi non è indicizzabile/cercabile con un semplice `WHERE token_hash = $1` — la verifica scorre le righe non scadute/non usate e confronta con `bcrypt.compareSync`. Il volume di inviti attivi contemporaneamente è basso (un'azienda B2B, non migliaia di utenti self-signup), quindi uno scan lineare su questo sottoinsieme è accettabile; se il volume crescesse, l'alternativa sarebbe un hash non salato (es. SHA-256) indicizzabile direttamente — da rivalutare solo se necessario, non ora (YAGNI).

- [ ] **Step 4: eseguire e verificare che passino** — `npx jest inviteTokens` → 6/6 verdi

- [ ] **Step 5: commit**
```bash
git add backend/src/utils/inviteTokens.js backend/src/__tests__/inviteTokens.test.js
git commit -m "feat(backend): token invito one-time per onboarding admin (TDD)"
```

---

### Task 4: `backend/src/routes/admin/clients.js` — invio automatico invito alla creazione client

**Files:**
- Modify: `backend/src/routes/admin/clients.js:14-42`
- Modify: `backend/src/utils/email.js` (nuovo template)
- Create/modify: `backend/src/__tests__/admin-clients.test.js` (o estendere quello esistente se già presente)

- [ ] **Step 1: aggiungere il template email in `backend/src/utils/email.js`**
```js
function buildAdminInviteEmail({ clientName, rawToken }) {
  const link = `https://badge.dataxiom.it/accetta-invito?token=${rawToken}`;
  return {
    subject: `Benvenuto su Badge System, ${clientName}`,
    text: `Ciao,\n\nil tuo account amministratore per ${clientName} su Badge System è pronto.\n`
      + `Imposta la tua password per iniziare: ${link}\n\n`
      + `Il link scade tra 7 giorni.\n\nTeam Badge System`,
  };
}

module.exports = { sendEmail, buildAdminInviteEmail };
```

- [ ] **Step 2: modificare `POST /` in `clients.js`** — dopo l'`INSERT INTO clients` esistente (righe ~18-23), generare il token e inviare l'email DOPO che la creazione del client è già commitata (mai bloccare la creazione cliente per un problema SES):
```js
// dopo: const client = result.rows[0]; (client creato con successo)
res.status(201).json({ data: client }); // risposta già inviata: la creazione client non aspetta l'email

const { rawToken, tokenHash, expiresAt } = generateInviteToken();
try {
  await pool.query(
    `INSERT INTO invite_tokens (client_id, email, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [client.id, client.email, tokenHash, expiresAt]
  );
  await sendEmail(buildAdminInviteEmail({ clientName: client.name, rawToken }));
} catch (err) {
  logger.warn({ action: 'admin_invite_send_failed', client_id: client.id, error: err.message },
    'Invito admin non inviato dopo la creazione del client');
}
```
**Nota**: la risposta HTTP (`201`) viene inviata *prima* del tentativo di invio email — un fallimento SES non deve mai riflettersi come errore sulla richiesta di creazione client, che ha già avuto successo lato dati. Il `logger.warn` garantisce che il fallimento non sia mai silenzioso (coerente con CLAUDE.md Pattern 3).

- [ ] **Step 3: test — scrivere il test che fallisce**
```js
test('client creation still returns 201 even if the invite email fails to send', async () => {
  mockSend.mockRejectedValueOnce(new Error('SES throttled'));
  const res = await request(app)
    .post('/api/v1/admin/clients')
    .set('Authorization', `Bearer ${superadminToken}`)
    .send({ name: 'Cliente Test', email: 'admin@clientetest.it', plan: 'starter' });

  expect(res.status).toBe(201);
  expect(res.body.data.name).toBe('Cliente Test');
});

test('client creation sends an invite email with a working token link', async () => {
  mockSend.mockResolvedValueOnce({ MessageId: 'abc' });
  await request(app)
    .post('/api/v1/admin/clients')
    .set('Authorization', `Bearer ${superadminToken}`)
    .send({ name: 'Cliente Test 2', email: 'admin@clientetest2.it', plan: 'starter' });

  expect(mockSend).toHaveBeenCalledTimes(1);
  const sentEmail = SendEmailCommand.mock.calls[0][0];
  expect(sentEmail.Destination.ToAddresses).toEqual(['admin@clientetest2.it']);
  expect(sentEmail.Message.Body.Text.Data).toMatch(/accetta-invito\?token=/);
});
```
(Stesso pattern di mock di `backend/src/__tests__/email.test.js`: `jest.mock('@aws-sdk/client-ses', ...)` con `mockSend`/`SendEmailCommand` mockati.)

- [ ] **Step 4: eseguire e verificare che passino** — `npx jest admin-clients`

- [ ] **Step 5: commit**
```bash
git add backend/src/routes/admin/clients.js backend/src/utils/email.js backend/src/__tests__/admin-clients.test.js
git commit -m "feat(backend): invito admin via email automatico alla creazione client (TDD)"
```

---

### Task 5: Endpoint pubblico di redemption — `POST /api/v1/onboarding/invite/:token/accept`

**Files:**
- Create: `backend/src/routes/onboardingInvite.js`
- Modify: `backend/src/app.js` (o dove sono montati i router pubblici come `demo.js`) — monta il nuovo router FUORI dal middleware di autenticazione admin
- Create: `backend/src/__tests__/onboarding-invite.test.js`

- [ ] **Step 1: scrivere i test che falliscono**
```js
// backend/src/__tests__/onboarding-invite.test.js
test('accept with a valid token creates the admin employee, consumes the token, returns a JWT', async () => {
  // seed: invite_tokens row valido per client-1 / admin@cliente.it
  const res = await request(app)
    .post(`/api/v1/onboarding/invite/${rawToken}/accept`)
    .send({ password: 'Passw0rd!2026' });

  expect(res.status).toBe(200);
  expect(res.body.data.token).toBeTruthy(); // JWT

  const employee = await pool.query(`SELECT * FROM employees WHERE email = $1`, ['admin@cliente.it']);
  expect(employee.rows).toHaveLength(1);
  expect(employee.rows[0].role).toBe('admin');
  expect(employee.rows[0].must_change_password).toBe(false); // l'utente ha appena scelto la propria password

  const token = await pool.query(`SELECT used_at FROM invite_tokens WHERE token_hash = $1`, [tokenHash]);
  expect(token.rows[0].used_at).not.toBeNull();
});

test('accept with an expired token returns 410, no employee row created', async () => {
  const res = await request(app)
    .post(`/api/v1/onboarding/invite/${expiredRawToken}/accept`)
    .send({ password: 'Passw0rd!2026' });

  expect(res.status).toBe(410);
  const employee = await pool.query(`SELECT * FROM employees WHERE email = $1`, ['admin@scaduto.it']);
  expect(employee.rows).toHaveLength(0);
});

test('accept with an already-used token returns 410', async () => {
  const res = await request(app)
    .post(`/api/v1/onboarding/invite/${usedRawToken}/accept`)
    .send({ password: 'Passw0rd!2026' });
  expect(res.status).toBe(410);
});

test('accept with a nonexistent token returns 404', async () => {
  const res = await request(app)
    .post(`/api/v1/onboarding/invite/not-a-real-token/accept`)
    .send({ password: 'Passw0rd!2026' });
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: eseguire e verificare che falliscano** (route inesistente → 404 generico non distinguibile dagli scenari attesi)

- [ ] **Step 3: implementazione**
```js
// backend/src/routes/onboardingInvite.js
const express = require('express');
const { verifyInviteToken } = require('../utils/inviteTokens');
const { hashPassword } = require('../auth/password');
const { issueToken } = require('../auth/jwt'); // stesso emittitore di POST /auth/login
const { pool } = require('../db/pool');
const { rateLimiter } = require('../middleware/rateLimiter'); // stesso middleware già usato per /demo/start

const router = express.Router();

router.post('/invite/:token/accept', rateLimiter, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invite = await verifyInviteToken(client, req.params.token);
    if (!invite) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'INVITE_NOT_FOUND' });
    }
    if (invite.used_at || new Date(invite.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'INVITE_EXPIRED_OR_USED' });
    }

    const passwordHash = await hashPassword(req.body.password);
    const employeeResult = await client.query(
      `INSERT INTO employees (client_id, email, role, password_hash, must_change_password)
       VALUES ($1, $2, 'admin', $3, false) RETURNING *`,
      [invite.client_id, invite.email, passwordHash]
    );
    await client.query(`UPDATE invite_tokens SET used_at = now() WHERE id = $1`, [invite.id]);
    await client.query('COMMIT');

    const employee = employeeResult.rows[0];
    const token = issueToken(employee);
    res.status(200).json({ data: { token, user: employee } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
```
- [ ] **Step 4: montare il router pubblico** — in `backend/src/app.js`, accanto a dove è montato `demo.js` (fuori dal middleware `authMiddleware` che protegge `/api/v1/admin/*`):
```js
app.use('/api/v1/onboarding', require('./routes/onboardingInvite'));
```

- [ ] **Step 5: eseguire e verificare che passino** — `npx jest onboarding-invite`

- [ ] **Step 6: commit**
```bash
git add backend/src/routes/onboardingInvite.js backend/src/app.js backend/src/__tests__/onboarding-invite.test.js
git commit -m "feat(backend): endpoint redemption invito admin (TDD)"
```

---

### Task 6: Frontend — `frontend-web/src/pages/AcceptInvitePage.jsx`

**Files:**
- Create: `frontend-web/src/pages/AcceptInvitePage.jsx`
- Modify: `frontend-web/src/App.jsx` (nuova route pubblica)
- Create: `frontend-web/src/pages/AcceptInvitePage.test.jsx`

- [ ] **Step 1: scrivere i test che falliscono** (mirror del pattern in `AdminLeaveManagement.test.jsx`: mock di un hook dedicato, non `apiClient` inline)
```jsx
// frontend-web/src/pages/AcceptInvitePage.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AcceptInvitePage } from './AcceptInvitePage';

const mockAccept = vi.fn();
vi.mock('../hooks/useOnboardingInvite', () => ({
  useOnboardingInvite: () => ({ accept: mockAccept, loading: false, error: null }),
}));

function renderPage(token = 'valid-token') {
  return render(
    <MemoryRouter initialEntries={[`/accetta-invito?token=${token}`]}>
      <AcceptInvitePage />
    </MemoryRouter>
  );
}

beforeEach(() => { mockAccept.mockReset(); });

test('submitting a password calls accept with the token from the query string', async () => {
  mockAccept.mockResolvedValue({ token: 'jwt-abc' });
  renderPage('valid-token');

  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Passw0rd!2026' } });
  fireEvent.click(screen.getByRole('button', { name: /imposta password/i }));

  await waitFor(() => expect(mockAccept).toHaveBeenCalledWith('valid-token', 'Passw0rd!2026'));
});

test('shows a clear error message when the invite is invalid/expired, no redirect', async () => {
  mockAccept.mockRejectedValue(new Error('INVITE_EXPIRED_OR_USED'));
  renderPage('expired-token');

  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'Passw0rd!2026' } });
  fireEvent.click(screen.getByRole('button', { name: /imposta password/i }));

  await waitFor(() => expect(screen.getByText(/invito non valido o scaduto/i)).toBeInTheDocument());
});
```

- [ ] **Step 2: eseguire e verificare che falliscano** — modulo inesistente

- [ ] **Step 3: implementazione minima** (form MUI, `useSearchParams` per leggere `?token=`, submit → hook dedicato → su successo `authService.setSession` + `navigate('/admin/onboarding')`)

- [ ] **Step 4: route pubblica in `App.jsx`** — fuori da qualunque `<ProtectedRoute>`, stesso livello di `/login`:
```jsx
<Route path="/accetta-invito" element={<AcceptInvitePage />} />
```

- [ ] **Step 5: eseguire e verificare che passino** — `cd frontend-web && npm test -- --run AcceptInvitePage`

- [ ] **Step 6: commit**
```bash
git add frontend-web/src/pages/AcceptInvitePage.jsx frontend-web/src/App.jsx frontend-web/src/pages/AcceptInvitePage.test.jsx frontend-web/src/hooks/useOnboardingInvite.js
git commit -m "feat(frontend): pagina pubblica di accettazione invito admin (TDD)"
```

---

### Task 7: Backend — `POST /api/v1/admin/onboarding/preview` + `POST /api/v1/admin/onboarding/apply`

**Files:**
- Create: `backend/src/routes/admin/onboarding.js`
- Modify: `backend/src/services/onboarding/preview.js` (aggiungere una variante JSON strutturata)
- Modify: `backend/src/app.js` (monta il router nel gruppo admin autenticato)
- Create: `backend/src/__tests__/admin-onboarding.test.js`

- [ ] **Step 0: aggiungere il secondo template email in `backend/src/utils/email.js`** (accanto a `buildAdminInviteEmail` del Task 4)
```js
function buildEmployeeWelcomeEmail({ email, tempPassword, clientName }) {
  return {
    subject: `Il tuo accesso a Badge System — ${clientName}`,
    text: `Ciao,\n\nè stato creato il tuo account su Badge System per ${clientName}.\n\n`
      + `Email: ${email}\nPassword temporanea: ${tempPassword}\n\n`
      + `Accedi su https://badge.dataxiom.it/login — al primo accesso ti verrà chiesto di impostarne una tua.\n\n`
      + `Team Badge System`,
  };
}

module.exports = { sendEmail, buildAdminInviteEmail, buildEmployeeWelcomeEmail };
```
`tempPassword` e `email` provengono da `result.credentials` già prodotto da `apply()` esistente (struttura confermata in esplorazione: `apply()` ritorna `{ clientId, summary, credentials }`).

- [ ] **Step 1: adattare `preview.js` per restituire anche JSON strutturato** — oggi produce solo una stringa per console (`formatPreview`); aggiungere una funzione sorella che ritorna dati, non testo:
```js
// backend/src/services/onboarding/preview.js
function toStructuredDiff(data, warnings = []) {
  return {
    created: { sites: data.sites.filter(s => !s.existing).length, employees: data.employees.filter(e => !e.existing).length },
    updated: { sites: data.sites.filter(s => s.existing).length, employees: data.employees.filter(e => e.existing).length },
    warnings,
  };
}

module.exports = { formatPreview, toStructuredDiff };
```

- [ ] **Step 2: scrivere i test che falliscono per `preview`**
```js
// backend/src/__tests__/admin-onboarding.test.js (parte 1: preview)
test('preview with a valid Excel returns a diff and writes nothing to the DB', async () => {
  const res = await request(app)
    .post('/api/v1/admin/onboarding/preview')
    .set('Authorization', `Bearer ${adminToken}`)
    .field('client_id', CLIENT_ID)
    .attach('file', validExcelBuffer, 'onboarding.xlsx');

  expect(res.status).toBe(200);
  expect(res.body.data.created.employees).toBeGreaterThan(0);
  const check = await pool.query(`SELECT count(*) FROM employees WHERE client_id = $1`, [CLIENT_ID]);
  expect(Number(check.rows[0].count)).toBe(0); // nessuna riga scritta, solo preview
});

test('preview with a missing site reports the error, writes nothing', async () => {
  const res = await request(app)
    .post('/api/v1/admin/onboarding/preview')
    .set('Authorization', `Bearer ${adminToken}`)
    .field('client_id', CLIENT_ID)
    .attach('file', excelWithBadSiteBuffer, 'onboarding.xlsx');

  expect(res.status).toBe(200);
  expect(res.body.data.warnings).toEqual(expect.arrayContaining([expect.stringContaining('sede non trovata')]));
});
```

- [ ] **Step 3: implementare `preview`** — riusa `parseWorkbook`+`validate`+`validateAgainstDb` dentro una transazione con `ROLLBACK` esplicito (mai un `COMMIT`, stesso principio del flag `--dry-run` del CLI):
```js
router.post('/preview', requireRole('admin'), upload.single('file'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const data = await parseWorkbook(req.file.buffer);
    const { errors, warnings } = validate(data);
    const dbCheck = await validateAgainstDb(client, data, { clientId: req.body.client_id });
    await client.query('ROLLBACK'); // preview non scrive MAI
    res.json({ data: toStructuredDiff(data, [...warnings, ...dbCheck.warnings]), errors: [...errors, ...dbCheck.errors] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});
```

- [ ] **Step 4: scrivere i test che falliscono per `apply`**
```js
test('apply creates rows and sends a welcome email only to NEW employees', async () => {
  mockSend.mockResolvedValue({ MessageId: 'x' });
  const res = await request(app)
    .post('/api/v1/admin/onboarding/apply')
    .set('Authorization', `Bearer ${adminToken}`)
    .field('client_id', CLIENT_ID)
    .attach('file', validExcelBuffer, 'onboarding.xlsx');

  expect(res.status).toBe(200);
  const created = res.body.data.summary.created.employees;
  expect(mockSend).toHaveBeenCalledTimes(created); // solo i nuovi, non gli aggiornati
});

test('apply commits data even if some welcome emails fail to send, reports which ones', async () => {
  mockSend.mockRejectedValueOnce(new Error('SES throttled')).mockResolvedValue({ MessageId: 'x' });
  const res = await request(app)
    .post('/api/v1/admin/onboarding/apply')
    .set('Authorization', `Bearer ${adminToken}`)
    .field('client_id', CLIENT_ID)
    .attach('file', validExcelBuffer, 'onboarding.xlsx');

  expect(res.status).toBe(200); // mai un 500 per un problema email
  expect(res.body.data.failedEmails).toHaveLength(1);
  const check = await pool.query(`SELECT count(*) FROM employees WHERE client_id = $1`, [CLIENT_ID]);
  expect(Number(check.rows[0].count)).toBeGreaterThan(0); // dati comunque commitati
});
```

- [ ] **Step 5: implementare `apply`** — stessa validazione, poi `apply()` esistente con `COMMIT`, poi (DOPO il commit) invio email ai nuovi dipendenti:
```js
router.post('/apply', requireRole('admin'), upload.single('file'), async (req, res) => {
  const client = await pool.connect();
  let result;
  try {
    await client.query('BEGIN');
    const data = await parseWorkbook(req.file.buffer);
    result = await apply(client, data, { clientId: req.body.client_id, year: new Date().getFullYear() });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const failedEmails = [];
  for (const cred of result.credentials.filter(c => c.isNew)) {
    try {
      await sendEmail(buildEmployeeWelcomeEmail(cred));
    } catch (err) {
      logger.warn({ action: 'welcome_email_failed', employee_email: cred.email, error: err.message },
        'Welcome email non inviata dopo apply onboarding');
      failedEmails.push(cred.email);
    }
  }
  res.json({ data: { ...result, failedEmails } });
});
```

- [ ] **Step 6: montare il router** — in `backend/src/app.js`, nel gruppo admin autenticato esistente (stesso middleware di `admin/employees.js`):
```js
app.use('/api/v1/admin/onboarding', authMiddleware, require('./routes/admin/onboarding'));
```

- [ ] **Step 7: eseguire e verificare che tutti i test passino** — `npx jest admin-onboarding`

- [ ] **Step 8: commit**
```bash
git add backend/src/routes/admin/onboarding.js backend/src/services/onboarding/preview.js backend/src/app.js backend/src/__tests__/admin-onboarding.test.js
git commit -m "feat(backend): endpoint preview/apply onboarding wizard (TDD)"
```

---

### Task 8: Frontend — `frontend-web/src/pages/OnboardingWizardPage.jsx`

**Files:**
- Create: `frontend-web/src/pages/OnboardingWizardPage.jsx`
- Create: `frontend-web/src/hooks/useOnboarding.js`
- Modify: `frontend-web/src/App.jsx` (nuova route `/admin/onboarding`)
- Create: `frontend-web/src/pages/OnboardingWizardPage.test.jsx`

- [ ] **Step 1: scrivere i test che falliscono** (mirror di `AdminLeaveManagement.test.jsx`: mock del hook dedicato `useOnboarding`, non `apiClient` inline)
```jsx
vi.mock('../hooks/useOnboarding', () => ({
  useOnboarding: () => ({
    preview: mockPreview, apply: mockApply, loading: false, error: null,
  }),
}));

test('after upload, shows the preview diff', async () => {
  mockPreview.mockResolvedValue({ created: { sites: 2, employees: 10 }, updated: { sites: 0, employees: 0 }, warnings: [] });
  render(<BrowserRouter><OnboardingWizardPage /></BrowserRouter>);
  fireEvent.change(screen.getByLabelText(/carica excel/i), { target: { files: [fakeFile] } });
  await waitFor(() => expect(screen.getByText(/10 dipendenti/i)).toBeInTheDocument());
});

test('confirm button is disabled when preview reports blocking errors', async () => {
  mockPreview.mockResolvedValue({ created: {}, updated: {}, warnings: [], errors: ['sede non trovata: Milano'] });
  render(<BrowserRouter><OnboardingWizardPage /></BrowserRouter>);
  fireEvent.change(screen.getByLabelText(/carica excel/i), { target: { files: [fakeFile] } });
  await waitFor(() => expect(screen.getByRole('button', { name: /conferma/i })).toBeDisabled());
});

test('after apply succeeds, shows summary with a link to /admin/sites', async () => {
  mockApply.mockResolvedValue({ summary: { created: { employees: 10 } }, failedEmails: [] });
  // ... upload, preview, click conferma
  await waitFor(() => expect(screen.getByRole('link', { name: /scarica i qr code/i })).toHaveAttribute('href', '/admin/sites'));
});

test('after apply with some failed emails, shows a retry list', async () => {
  mockApply.mockResolvedValue({ summary: { created: { employees: 10 } }, failedEmails: ['mario@cliente.it'] });
  // ... upload, preview, click conferma
  await waitFor(() => expect(screen.getByText(/mario@cliente.it/)).toBeInTheDocument());
});
```

- [ ] **Step 2: eseguire e verificare che falliscano** — modulo inesistente

- [ ] **Step 3: implementazione** — MUI `Stepper` a 3 step (Upload → Preview → Riepilogo), hook `useOnboarding` che wrappa le chiamate `apiClient.post('/api/v1/admin/onboarding/preview', ...)` / `/apply`.

- [ ] **Step 4: route in `App.jsx`** — stesso pattern esatto di `/admin/sites`:
```jsx
<Route
  path="/admin/onboarding"
  element={<ProtectedRoute requiredRole="admin"><OnboardingWizardPage /></ProtectedRoute>}
/>
```

- [ ] **Step 5: eseguire e verificare che tutti i test passino** — `cd frontend-web && npm test -- --run OnboardingWizardPage`

- [ ] **Step 6: commit**
```bash
git add frontend-web/src/pages/OnboardingWizardPage.jsx frontend-web/src/hooks/useOnboarding.js frontend-web/src/App.jsx frontend-web/src/pages/OnboardingWizardPage.test.jsx
git commit -m "feat(frontend): wizard onboarding self-service (upload/preview/apply) (TDD)"
```

---

## Gate finale

- [ ] **G1**: `cd backend && npm run test:coverage` → tutti i test verdi (esistenti invariati + i nuovi di Task 1-7), nessuna regressione
- [ ] **G2**: `cd frontend-web && npm test -- --run` → tutti i test verdi (esistenti invariati + i nuovi di Task 6/8)
- [ ] **G3**: `/code-review` sul diff completo — focus specifico: (a) nessun invio email dentro una transazione DB (Task 4/7), (b) transazionalità corretta di `onboardingInvite.js` (Task 5 — employee+token nella stessa transazione), (c) `preview` non scrive mai nulla nel DB in nessun path d'errore
- [ ] **G4**: verifica manuale end-to-end su un ambiente con SES verificato (non solo mock) — creazione client reale → email invito arriva davvero alla casella → accept → login admin → wizard → upload Excel reale → email welcome ai dipendenti arrivano davvero. **Questo gate non è eseguibile finché SES Task 5-7 non sono chiusi.**

---

## Verification (end-to-end)

- `cd backend && npm test` → 0 regressioni sui 610+ test esistenti + tutti i nuovi verdi
- `cd frontend-web && npm test -- --run` → 0 regressioni sui 239+ test esistenti + tutti i nuovi verdi
- Test manuale CLI (Task 2, Step 3): `onboard-client.js --dry-run` produce lo stesso output di prima del refactor
- Test manuale end-to-end reale (Gate G4): richiede SES verificato — non eseguibile nella stessa sessione in cui SES Task 4 è stato appena avviato

## Fuori perimetro (esplicito, coerente con la spec)

- Self-signup completo (pagamento/piano) — la creazione del client resta un'azione di Dataxiom.
- Rotazione/revoca di un invito già inviato prima della scadenza (7gg) — richiede oggi di rigenerarne uno nuovo manualmente, non un endpoint dedicato.
- Esecuzione di questo piano prima che SES sia verificato in produzione — vedi nota in testa al documento.
