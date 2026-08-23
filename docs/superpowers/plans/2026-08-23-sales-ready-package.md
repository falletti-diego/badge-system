# Pacchetto "Sales-Ready" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chiudere la readiness prodotto/legale/commerciale necessaria prima che il primo cliente pilota possa essere avvicinato con fiducia: allineare la base giuridica del consenso GPS tra codice e documentazione, impedire che un nuovo cliente attivi il geofencing senza confermare l'autorizzazione Art. 4 Statuto Lavoratori, produrre un template DPIA precompilato, correggere una dicitura stale in `CLAUDE.md`, verificare il messaging anti-frode nel funnel demo, e produrre un modulo d'ordine commerciale minimo.

**Architettura:** Sei task indipendenti (nessuna dipendenza tra loro tranne l'ordine consigliato legale→documentale→prospect-facing), eseguiti inline uno alla volta con verifica esplicita per ciascuno. Un solo task tocca codice applicativo (Task 3, il gate Art. 4); gli altri sono contenuto/documento con verifica di lettura incrociata.

**Tech Stack:** Node.js/Express/Zod (backend), React/MUI (frontend-web), React Native (frontend-mobile), Jest + supertest contro Postgres reale (`badge_system_test`), Markdown per i documenti.

---

## Nota d'ordine

Eseguire i task in quest'ordine: **1 → 2 → 3 → 4 → 5 → 6**. I Task 1-3 sono i blocchi legali (priorità più alta secondo la spec), il Task 3 è l'unico con codice reale e conviene farlo con margine di tempo per eventuali sorprese nei test. I Task 4-6 sono indipendenti tra loro e possono essere riordinati liberamente se serve.

---

### Task 1: Allineare il testo di consenso GPS nel dialog mobile alla base giuridica già corretta nei documenti

**Contesto per chi esegue:** `docs/privacy-policy-IT.md` (v2.1) e il suo gemello pubblico `frontend-web/public/privacy-policy-it.html` **già** dichiarano la base giuridica corretta per il geofencing — `Art. 6(1)(f) Legittimo interesse + consenso esplicito Art. 7` (non "solo consenso"), verificato riga per riga, i due file sono già in sync tra loro. Il gap reale è nel codice: il commento JSDoc di `frontend-mobile/src/components/GPSConsentDialog.jsx` dice ancora `"GDPR Art. 7 explicit consent for geofencing"` — cita solo l'Art. 7, senza menzionare il legittimo interesse Art. 6(1)(f) che è la base legale primaria secondo il documento pubblicato. Il consenso Art. 7 resta un layer UX legittimo (blocco del check-in fino ad "Accetto"), ma il framing giuridico va allineato.

**Files:**
- Modify: `frontend-mobile/src/components/GPSConsentDialog.jsx:60-64` (commento JSDoc)
- Modify: `frontend-mobile/src/components/GPSConsentDialog.jsx:106` (testo mostrato al dipendente)
- Read-only (verifica, nessuna modifica attesa): `docs/privacy-policy-IT.md`, `frontend-web/public/privacy-policy-it.html`

- [ ] **Step 1: Leggere il commento JSDoc attuale e il testo del dialog**

Il commento attuale (righe 60-64):
```js
/**
 * GPSConsentDialog — GDPR Art. 7 explicit consent for geofencing
 * Shown before il primo check-in su una sede con geofencing attivo, e ad ogni
 * scan successivo finché il dipendente non accetta (nessun cooldown — il
 * check-in resta bloccato su quella sede fino al consenso, Fase C).
 */
```

Il testo mostrato al dipendente (riga 106, primo paragrafo del messaggio):
```
Il datore di lavoro ha abilitato la verifica di sede (GPS). Badge System registra la tua posizione solo al momento del check-in per verificare che tu sia fisicamente in sede.
```

- [ ] **Step 2: Aggiornare il commento JSDoc per citare entrambe le basi giuridiche**

Sostituire le righe 60-64 con:
```js
/**
 * GPSConsentDialog — GDPR Art. 6(1)(f) Legittimo interesse (sicurezza sede,
 * prevenzione frode) + consenso esplicito Art. 7 come layer UX aggiuntivo di
 * trasparenza (allineato a docs/privacy-policy-IT.md v2.1, sezione "Base
 * Legale"). Shown before il primo check-in su una sede con geofencing
 * attivo, e ad ogni scan successivo finché il dipendente non accetta
 * (nessun cooldown — il check-in resta bloccato su quella sede fino al
 * consenso, Fase C).
 */
```

- [ ] **Step 3: Aggiungere una riga esplicita sulla base giuridica nel testo mostrato al dipendente**

Nel blocco JSX del messaggio (dopo la riga 106, prima di "Dati raccolti:"), aggiungere una frase — sostituire:
```js
            Il datore di lavoro ha abilitato la verifica di sede (GPS). Badge System registra la tua posizione solo al momento del check-in per verificare che tu sia fisicamente in sede.{'\n\n'}
```
con:
```js
            Il datore di lavoro ha abilitato la verifica di sede (GPS) per motivi di sicurezza e prevenzione frodi. Badge System registra la tua posizione solo al momento del check-in per verificare che tu sia fisicamente in sede.{'\n\n'}
```

- [ ] **Step 4: Verificare che `docs/privacy-policy-IT.md` e `frontend-web/public/privacy-policy-it.html` restino coerenti col nuovo testo**

Grep per "sicurezza" e "frod" in entrambi i file:
```bash
grep -n "sicurezza\|frod" docs/privacy-policy-IT.md frontend-web/public/privacy-policy-it.html
```
Atteso: entrambi i file già menzionano "sicurezza sede, frode" (riga 41 di `docs/privacy-policy-IT.md`, riga 81 di `privacy-policy-it.html`) — nessuna modifica necessaria a questi due file, solo conferma di coerenza. Se il grep non trova nulla, il framing dei documenti è cambiato dall'ultima verifica: fermarsi e segnalare prima di procedere, non improvvisare un nuovo testo legale.

- [ ] **Step 5: Eseguire i test del componente**

Run: `cd frontend-mobile && npx jest GPSConsentDialog -v`
Expected: PASS (nessun test asserisce sul testo esatto del commento o del primo paragrafo — se un test rompe, leggere cosa asserisce prima di modificarlo)

- [ ] **Step 6: Commit**

```bash
git add frontend-mobile/src/components/GPSConsentDialog.jsx
git commit -m "fix(mobile): align GPS consent dialog wording with Art 6(1)(f) legal basis (S.27)"
```

---

### Task 2: Template DPIA precompilato (bozza interna, disclaimer esplicito)

**Contesto:** DPIA obbligatoria per Delibera Garante Privacy n. 467/2018 (geolocalizzazione dipendenti). Segue lo stesso pattern già consolidato in `docs/DPA_GDPR_Art28_IT.md` — placeholder `[TRA PARENTESI QUADRE]` per i campi che il cliente deve compilare, sezioni Dataxiom-as-processor già scritte.

**Files:**
- Create: `docs/DPIA_geofencing_IT.md`

- [ ] **Step 1: Creare il file con la struttura DPIA standard**

```markdown
# Valutazione d'Impatto sulla Protezione dei Dati (DPIA) — Geolocalizzazione Dipendenti

> **⚠️ BOZZA — da validare con un legale prima dell'uso vincolante con un cliente reale.**
> Questo documento è una bozza precompilata da Dataxiom per assistere il cliente
> (Titolare del Trattamento) nell'adempimento del proprio obbligo di DPIA secondo
> l'Art. 35 GDPR e la Delibera del Garante Privacy n. 467/2018 (che elenca
> esplicitamente la geolocalizzazione dei dipendenti tra i trattamenti soggetti
> a DPIA obbligatoria). Dataxiom fornisce lo strumento e le informazioni tecniche
> di sua competenza come Responsabile del Trattamento; la DPIA resta un obbligo
> del Titolare (cliente), che deve validarla con un proprio consulente legale/DPO
> prima di attivare il geofencing.

---

## 1. Descrizione sistematica del trattamento

**Compilato da Dataxiom (Responsabile del Trattamento):**

- **Natura del trattamento:** raccolta di coordinate GPS (latitudine/longitudine) del dispositivo del dipendente al momento del check-in, per verificare la prossimità fisica alla sede di lavoro (geofencing).
- **Ambito:** limitato al momento del check-in/check-out; nessun tracciamento continuo o in background.
- **Finalità dichiarata:** prevenzione frode (check-in da postazione non autorizzata), sicurezza della sede.
- **Base giuridica:** Art. 6(1)(f) GDPR (legittimo interesse) + consenso esplicito Art. 7 come layer di trasparenza aggiuntivo (vedi `docs/privacy-policy-IT.md` §1).
- **Categorie di dati:** coordinate GPS, timestamp, identificativo dipendente.
- **Conservazione:** 90 giorni, cancellazione automatica (cron notturno, verificato in produzione).
- **Destinatari:** nessuna condivisione con terzi salvo sub-processori infrastrutturali (AWS, elencati nel DPA).

**Da compilare dal Titolare (cliente):**

- **Ragione sociale e settore:** [RAGIONE SOCIALE CLIENTE]
- **Numero di dipendenti soggetti a geolocalizzazione:** [X]
- **Sedi interessate:** [ELENCO SEDI]
- **Contesto organizzativo/sindacale:** [descrivere se è presente una RSU/RSA e lo stato dell'accordo Art. 4 Statuto Lavoratori — vedi Task 3 di questo pacchetto]

## 2. Valutazione di necessità e proporzionalità

**Compilato da Dataxiom:**

- Il geofencing è **opzionale e disattivabile** per l'intero cliente (`geofencing_feature_enabled`) e per singola sede — non è una funzione always-on non disattivabile.
- Alternativa meno invasiva valutata: QR code/Face ID senza GPS (disponibile come modalità di default; il geofencing è un livello aggiuntivo opt-in per il cliente, non il meccanismo base di check-in).
- Il dato GPS non è mai usato per finalità diverse dalla verifica di prossimità (nessun tracciamento comportamentale, nessuna profilazione).

**Da compilare dal Titolare:**

- [ ] Motivazione specifica per cui il QR/Face ID senza GPS non è sufficiente per questa sede/azienda: [DA COMPILARE]

## 3. Valutazione dei rischi per i diritti e le libertà degli interessati

| Rischio | Probabilità | Gravità | Misura di mitigazione (già in essere) |
|---|---|---|---|
| Accesso non autorizzato ai dati GPS | Bassa | Media | Cifratura a riposo (AWS RDS), RBAC multi-tenant, audit log completo |
| Uso del dato oltre la finalità dichiarata (function creep) | Bassa | Alta | Nessun endpoint di reporting aggregato su GPS oltre la verifica check-in; cancellazione automatica 90gg |
| Consenso non genuinamente libero (squilibrio datore/dipendente) | Media | Media | Base giuridica primaria = legittimo interesse Art. 6(1)(f), non solo consenso (vedi Task 1); diritto di revoca sempre disponibile da Impostazioni |
| Assenza di autorizzazione sindacale/ITL (Art. 4 Statuto Lavoratori) | **Da valutare dal Titolare** | Alta | Gate tecnico che impedisce l'attivazione senza conferma esplicita del cliente (vedi Task 3 di questo pacchetto) |

## 4. Misure per affrontare i rischi

**Già in essere (Dataxiom):**
- Retention automatica 90 giorni
- Diritto di revoca self-service (app mobile, Impostazioni)
- Toggle di disattivazione a livello cliente e per singola sede
- Audit log di ogni modifica (chi/quando/cosa)
- Gate tecnico di conferma Art. 4 prima dell'attivazione (vedi Task 3)

**Responsabilità del Titolare:**
- [ ] Ottenere l'accordo sindacale o l'autorizzazione ITL prima di confermare l'attivazione (Art. 4 Statuto Lavoratori)
- [ ] Informare i dipendenti tramite l'informativa privacy interna aziendale, oltre alla Privacy Policy di Badge System
- [ ] Consultare il proprio DPO/legale su questa DPIA prima della firma

## 5. Consultazione e parere

- [ ] Data consultazione DPO/legale del Titolare: [DATA]
- [ ] Esito: [APPROVATO / APPROVATO CON RISERVE / RESPINTO]
- [ ] Firma Titolare: [NOME, RUOLO, DATA]

---

*Documento bozza Dataxiom S.r.l. — v1.0, 23 Agosto 2026. Non sostituisce una consulenza legale.*
```

- [ ] **Step 2: Verificare che ogni sezione richiesta da una DPIA standard sia presente**

Checklist di verifica (Art. 35 GDPR + prassi Garante): descrizione sistematica ✓, valutazione necessità/proporzionalità ✓, valutazione rischi ✓, misure di mitigazione ✓, consultazione/parere ✓. Tutte presenti nel documento sopra.

- [ ] **Step 3: Commit**

```bash
git add docs/DPIA_geofencing_IT.md
git commit -m "docs: add DPIA template for geofencing (S.29), draft pending legal review"
```

---

### Task 3: Gate di conferma Art. 4 Statuto Lavoratori prima di attivare il geofencing

**Contesto:** Non esiste un "wizard di onboarding" per un nuovo cliente — la creazione di un cliente è un form a 3 campi in `ClientsTab.jsx`, compilato da un superadmin Dataxiom (`POST /api/v1/admin/clients`). Non è il superadmin che può attestare l'autorizzazione sindacale/ITL: è l'admin del cliente stesso, quando prova a **attivare** il geofencing dal proprio pannello (`SettingsTab.jsx` → `PUT /api/admin/settings`). Il gate va quindi lì, non alla creazione del cliente — solo il default iniziale (`false`) va impostato alla creazione.

**Files:**
- Modify: `backend/src/routes/admin/clients.js:19-24` (default esplicito alla creazione)
- Modify: `backend/src/middleware/validation.js:536-547` (schema `AdminSettingsSchema`)
- Modify: `backend/src/routes/admin/settings.js` (logica del gate + audit dedicato)
- Modify: `frontend-web/src/features/admin/tabs/SettingsTab.jsx` (checkbox di conferma nella UI)
- Test: `backend/src/__tests__/admin-settings-geofencing-gate.test.js` (nuovo, real-Postgres)

- [ ] **Step 1: Scrivere il test che fallisce, seguendo il pattern real-Postgres già in uso**

Creare `backend/src/__tests__/admin-settings-geofencing-gate.test.js`:

```js
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

describe('POST /admin/clients + PUT /admin/settings — geofencing Art.4 confirmation gate (S.28)', () => {
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
      console.warn(`[admin-settings-geofencing-gate.test] Skipping — could not connect: ${err.message}`);
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

  function tokenFor({ client_id, role }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign({ user_id: 'test-user', client_id, role, name: 'Test' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
  }

  let clientId;

  afterEach(async () => {
    if (!dbAvailable || !clientId) return;
    await pool.query('DELETE FROM clients WHERE id = $1', [clientId]);
    clientId = undefined;
  });

  it('defaults geofencing_feature_enabled to false for a newly created client', async () => {
    if (!dbAvailable) return;
    const superToken = tokenFor({ client_id: 'unused', role: 'superadmin' });
    const res = await request(app)
      .post('/api/v1/admin/clients')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'Gate Test Co', email: uniqueEmail('gate-test-client'), plan: 'starter' });

    expect(res.status).toBe(201);
    clientId = res.body.data.id;

    const row = await pool.query('SELECT geofencing_feature_enabled FROM clients WHERE id = $1', [clientId]);
    expect(row.rows[0].geofencing_feature_enabled).toBe(false);
  });

  it('rejects turning geofencing on without geofencing_art4_confirmed', async () => {
    if (!dbAvailable) return;
    const superToken = tokenFor({ client_id: 'unused', role: 'superadmin' });
    const createRes = await request(app)
      .post('/api/v1/admin/clients')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'Gate Reject Co', email: uniqueEmail('gate-reject-client'), plan: 'starter' });
    clientId = createRes.body.data.id;

    const adminToken = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ geofencing_feature_enabled: true });

    expect(res.status).toBe(400);

    const row = await pool.query('SELECT geofencing_feature_enabled FROM clients WHERE id = $1', [clientId]);
    expect(row.rows[0].geofencing_feature_enabled).toBe(false);
  });

  it('allows turning geofencing on with geofencing_art4_confirmed and logs a dedicated audit entry', async () => {
    if (!dbAvailable) return;
    const superToken = tokenFor({ client_id: 'unused', role: 'superadmin' });
    const createRes = await request(app)
      .post('/api/v1/admin/clients')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'Gate Confirm Co', email: uniqueEmail('gate-confirm-client'), plan: 'starter' });
    clientId = createRes.body.data.id;

    const adminToken = tokenFor({ client_id: clientId, role: 'admin' });
    const res = await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ geofencing_feature_enabled: true, geofencing_art4_confirmed: true });

    expect(res.status).toBe(200);
    expect(res.body.data.geofencing_feature_enabled).toBe(true);

    const audit = await pool.query(
      `SELECT * FROM audit_log WHERE entity_id = $1 AND action = 'geofencing_art4_confirmed' ORDER BY timestamp DESC LIMIT 1`,
      [clientId]
    );
    expect(audit.rows.length).toBe(1);
  });

  it('does not require confirmation when the flag is already true and only meal_voucher_hours changes', async () => {
    if (!dbAvailable) return;
    const superToken = tokenFor({ client_id: 'unused', role: 'superadmin' });
    const createRes = await request(app)
      .post('/api/v1/admin/clients')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ name: 'Gate Noop Co', email: uniqueEmail('gate-noop-client'), plan: 'starter' });
    clientId = createRes.body.data.id;

    const adminToken = tokenFor({ client_id: clientId, role: 'admin' });
    await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ geofencing_feature_enabled: true, geofencing_art4_confirmed: true });

    const res = await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ geofencing_feature_enabled: true, meal_voucher_hours: 6 });

    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `cd backend && npx jest admin-settings-geofencing-gate.test.js -v`
Expected: FAIL — il primo test fallisce perché `clients.js` non imposta ancora `geofencing_feature_enabled = false` esplicitamente all'insert (usa il default `true` della migration 013); gli altri falliscono perché lo schema non conosce ancora `geofencing_art4_confirmed`.

- [ ] **Step 3: Impostare il default esplicito alla creazione del cliente**

In `backend/src/routes/admin/clients.js`, modificare l'INSERT (righe 19-24):
```js
    const result = await pool.query(
      `INSERT INTO clients (name, email, plan, geofencing_feature_enabled)
       VALUES ($1, $2, $3, false)
       RETURNING id, name, email, plan, created_at`,
      [data.name, data.email, data.plan]
    );
```

- [ ] **Step 4: Aggiungere `geofencing_art4_confirmed` allo schema di validazione**

In `backend/src/middleware/validation.js`, sostituire il blocco `AdminSettingsSchema` (righe 536-547):
```js
const AdminSettingsSchema = z.object({
  body: z.object({
    meal_voucher_hours: z.number()
      .min(0, 'meal_voucher_hours must be >= 0')
      .max(24, 'meal_voucher_hours must be <= 24')
      .optional(),
    geofencing_feature_enabled: z.boolean().optional(),
    geofencing_art4_confirmed: z.boolean().optional(),
  }).refine(
    (data) => data.meal_voucher_hours !== undefined || data.geofencing_feature_enabled !== undefined,
    { message: 'At least one setting must be provided' }
  ),
});
```

- [ ] **Step 5: Implementare il gate nella route, con audit dedicato**

Sostituire l'intero contenuto di `backend/src/routes/admin/settings.js`:
```js
'use strict';

const express = require('express');
const { pool } = require('../../db/pool');
const { ForbiddenError, NotFoundError, ValidationError } = require('../../utils/errors');
const { logAudit } = require('../../middleware/audit');
const { AdminSettingsSchema, createValidationMiddleware } = require('../../middleware/validation');

const router = express.Router();

router.put('/', createValidationMiddleware(AdminSettingsSchema), async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(new ForbiddenError('Only admins can update settings', 'FORBIDDEN_ROLE'));
  }

  const { meal_voucher_hours, geofencing_feature_enabled, geofencing_art4_confirmed } = req.validated.body;
  const clientId = req.user.client_id;

  try {
    const current = await pool.query(
      'SELECT geofencing_feature_enabled FROM clients WHERE id = $1',
      [clientId]
    );
    if (current.rowCount === 0) {
      return next(new NotFoundError('Client not found', 'CLIENT_NOT_FOUND'));
    }

    const isActivating = geofencing_feature_enabled === true && current.rows[0].geofencing_feature_enabled !== true;
    if (isActivating && geofencing_art4_confirmed !== true) {
      return next(new ValidationError(
        'Attivare il geofencing richiede la conferma esplicita dell\'autorizzazione Art. 4 Statuto Lavoratori (geofencing_art4_confirmed)',
        { code: 'GEOFENCING_ART4_CONFIRMATION_REQUIRED' }
      ));
    }

    const setClauses = [];
    const params = [];

    if (meal_voucher_hours !== undefined) {
      params.push(meal_voucher_hours);
      setClauses.push(`meal_voucher_hours = $${params.length}`);
    }

    if (geofencing_feature_enabled !== undefined) {
      params.push(geofencing_feature_enabled);
      setClauses.push(`geofencing_feature_enabled = $${params.length}`);
    }

    params.push(clientId);
    const result = await pool.query(
      `UPDATE clients SET ${setClauses.join(', ')} WHERE id = $${params.length}::uuid
       RETURNING id, meal_voucher_hours, geofencing_feature_enabled`,
      params
    );

    await logAudit(pool, {
      action: 'update_settings',
      entity: 'client',
      entityId: clientId,
      oldValue: null,
      newValue: { meal_voucher_hours, geofencing_feature_enabled },
      userId: req.user.user_id,
    }).catch(() => {});

    if (isActivating) {
      await logAudit(pool, {
        action: 'geofencing_art4_confirmed',
        entity: 'client',
        entityId: clientId,
        oldValue: null,
        newValue: { confirmed_by: req.user.user_id },
        userId: req.user.user_id,
      });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

Nota: `ValidationError` ha firma `(message, details)` — non `(message, code)` — il secondo argomento è un oggetto (`{ code: '...' }`), pattern già usato in `backend/src/routes/events.js:213` e `backend/src/utils/tenantScope.js:20`. Va importato in cima al file insieme agli altri errori già presenti.

- [ ] **Step 6: Eseguire di nuovo il test**

Run: `cd backend && npx jest admin-settings-geofencing-gate.test.js -v`
Expected: PASS (4/4)

- [ ] **Step 7: Aggiungere il checkbox di conferma nella UI di `SettingsTab.jsx`**

Nel file `frontend-web/src/features/admin/tabs/SettingsTab.jsx`:

Aggiungere uno stato per il valore iniziale caricato e per la conferma:
```jsx
  const [mealHours, setMealHours] = useState('');
  const [geofencingEnabled, setGeofencingEnabled] = useState(true);
  const [initialGeofencingEnabled, setInitialGeofencingEnabled] = useState(true);
  const [art4Confirmed, setArt4Confirmed] = useState(false);
```

Nel `useEffect` di caricamento, impostare anche il valore iniziale:
```jsx
            setGeofencingEnabled(client.geofencing_feature_enabled !== false);
            setInitialGeofencingEnabled(client.geofencing_feature_enabled !== false);
```

Aggiungere la costante derivata subito prima del `return`:
```jsx
  const isActivatingGeofencing = !initialGeofencingEnabled && geofencingEnabled;
```

Nel body della richiesta in `handleConfirmSave`:
```jsx
      await apiClient.put('/api/v1/admin/settings', {
        meal_voucher_hours: parsed,
        geofencing_feature_enabled: geofencingEnabled,
        ...(isActivatingGeofencing ? { geofencing_art4_confirmed: art4Confirmed } : {}),
      });
      setInitialGeofencingEnabled(geofencingEnabled);
```

Nella sezione GEOFENCING, dopo il blocco `{!geofencingEnabled && (...)}`, aggiungere:
```jsx
              {isActivatingGeofencing && (
                <Alert severity="warning" sx={{ mt: 1, maxWidth: 500 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={art4Confirmed}
                        onChange={(e) => setArt4Confirmed(e.target.checked)}
                        color="warning"
                      />
                    }
                    label="Confermo di aver ottenuto l'autorizzazione sindacale o dell'Ispettorato del Lavoro (Art. 4 Statuto Lavoratori) prima di attivare la verifica GPS."
                  />
                </Alert>
              )}
```

E disabilitare il bottone Salva quando serve conferma e non è stata data:
```jsx
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={loading || (isActivatingGeofencing && !art4Confirmed)}
              sx={{ backgroundColor: '#1E3A5F', mt: 2 }}
            >
```

- [ ] **Step 8: Eseguire i test del frontend**

Run: `cd frontend-web && npx vitest run SettingsTab -t "geofencing"` (se non esiste ancora un test file per `SettingsTab`, questo comando non troverà nulla da eseguire — in tal caso eseguire l'intera suite con `cd frontend-web && npx vitest run` per verificare che non ci siano regressioni)
Expected: PASS, nessuna regressione

- [ ] **Step 9: Eseguire la suite completa backend**

Run: `cd backend && npm test`
Expected: tutti i test verdi, incluso il nuovo file

- [ ] **Step 10: Commit**

```bash
git add backend/src/routes/admin/clients.js backend/src/routes/admin/settings.js backend/src/middleware/validation.js backend/src/__tests__/admin-settings-geofencing-gate.test.js frontend-web/src/features/admin/tabs/SettingsTab.jsx
git commit -m "feat: gate geofencing activation behind Art.4 confirmation with dedicated audit trail (S.28)"
```

---

### Task 4: Correggere la dicitura stale in `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md:24-31`

- [ ] **Step 1: Leggere il blocco MVP Scope attuale**

```markdown
### MVP Scope
- ✅ Mobile app (QR scanning + Face ID)
- ✅ Web dashboard (reporting, corrections, corrections, corrections)
- ✅ CSV export
- ✅ Multi-site support
- ✅ Audit log
- ❌ Payroll API (Phase 2)
- ❌ Offline mode (Phase 2)
```

- [ ] **Step 2: Sostituire con la dicitura corretta**

```markdown
### MVP Scope
- ✅ Mobile app (QR scanning + Face ID)
- ✅ Web dashboard (reporting, corrections)
- ✅ CSV export
- ✅ Multi-site support
- ✅ Audit log
- ✅ Offline mode (coda check-in + sync, completo dalla Session 86)
- ✅ Export tracciati paghe Zucchetti/TeamSystem (export compatibile, non un'API diretta — quella resta Fase 2)
- ❌ Integrazione Payroll API diretta (Fase 2)
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: fix stale MVP scope wording (offline mode and payroll export are live, not Phase 2)"
```

---

### Task 5: Verificare/aggiornare il messaging Face ID/anti-frode in `/prova-demo`

**Contesto:** `TryDemoPage.jsx` oggi non menziona Face ID né l'argomento anti-frode/impersonificazione — l'hero è generico ("Vedi le presenze... prima ancora di parlarci"). Il messaging commerciale approvato (`.agents/product-marketing.md`, sezione Proof Points) è: *"Non solo digitalizzare il cartellino — impedire che qualcuno timbri al posto di un collega, con una traccia di audit che regge a un controllo."*

**Files:**
- Modify: `frontend-web/src/pages/TryDemoPage.jsx:151-162` (sottotitolo hero)
- Test: `frontend-web/src/__tests__/TryDemoPage.test.jsx` (verificare, non necessariamente modificare)

- [ ] **Step 1: Leggere il test esistente per capire cosa è già coperto**

Run: `cd frontend-web && grep -n "getByText\|Vedi le presenze\|Face ID\|impersonif" src/__tests__/TryDemoPage.test.jsx`

Se il test asserisce sul testo esatto del sottotitolo attuale (`"Una demo completa con dati realistici..."`), annotare la riga per aggiornarla nello Step 3.

- [ ] **Step 2: Aggiornare il sottotitolo hero per includere l'argomento anti-frode**

Sostituire (righe 151-162):
```jsx
            <Typography
              sx={{
                fontFamily: 'var(--font-sans)',
                fontSize: { xs: '1rem', md: '1.125rem' },
                color: 'var(--color-linen)',
                opacity: 0.85,
                maxWidth: '38rem',
              }}
            >
              Una demo completa con dati realistici, pronta in pochi secondi. Nessuna carta,
              nessun impegno.
            </Typography>
```
con:
```jsx
            <Typography
              sx={{
                fontFamily: 'var(--font-sans)',
                fontSize: { xs: '1rem', md: '1.125rem' },
                color: 'var(--color-linen)',
                opacity: 0.85,
                maxWidth: '38rem',
              }}
            >
              Face ID nativo impedisce che un collega timbri al posto di un altro — con una
              traccia di audit che regge a un controllo. Demo completa con dati realistici,
              pronta in pochi secondi. Nessuna carta, nessun impegno.
            </Typography>
```

- [ ] **Step 3: Aggiornare il test se asserisce sul testo esatto sostituito**

Se lo Step 1 ha trovato un'asserzione sul vecchio testo (es. `expect(screen.getByText(/Una demo completa/i)).toBeInTheDocument()`), aggiornarla per cercare il nuovo testo (es. `expect(screen.getByText(/Face ID nativo/i)).toBeInTheDocument()`). Se il test non asserisce sul testo esatto (verifica solo presenza di elementi/form), non serve modificarlo.

- [ ] **Step 4: Eseguire i test**

Run: `cd frontend-web && npx vitest run TryDemoPage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/TryDemoPage.jsx frontend-web/src/__tests__/TryDemoPage.test.jsx
git commit -m "feat(demo): surface Face ID anti-fraud messaging in self-serve demo funnel"
```

---

### Task 6: Modulo d'ordine commerciale breve

**Contesto:** Non un nuovo ToS/contratto completo — referenzia `docs/sla.md` e `docs/DPA_GDPR_Art28_IT.md` per tutto ciò che già coprono (disdetta, limitazione di responsabilità, protezione dati). Pricing dal listino approvato (`.agents/product-marketing.md`, sezione Goals).

**Files:**
- Create: `docs/modulo-ordine-commerciale-IT.md`

- [ ] **Step 1: Creare il file**

```markdown
# Modulo d'Ordine — Badge System

> Questo modulo d'ordine copre esclusivamente le condizioni commerciali specifiche
> dell'abbonamento. Per condizioni di servizio, disponibilità, procedura di disdetta
> e protezione dati, fa fede quanto già definito in `docs/sla.md` (SLA e Condizioni
> di Servizio) e `docs/DPA_GDPR_Art28_IT.md` (Accordo di Trattamento Dati), entrambi
> parte integrante di questo accordo per riferimento.

---

## 1. Parti

**Fornitore:** Dataxiom S.r.l.
**Cliente:** [RAGIONE SOCIALE CLIENTE]

## 2. Oggetto

Abbonamento al servizio Badge System (tracciamento presenze + pianificazione turni),
Tier [1 — SaaS multi-tenant condiviso / 2 — White-label dedicato, fuori listino].

## 3. Corrispettivo

| Voce | Prezzo | Scaglione |
|---|---|---|
| Per dipendente/mese | €8,00 | 25-99 dipendenti |
| Per dipendente/mese | €7,00 | 100-149 dipendenti |
| Per dipendente/mese | €6,50 | 150-200 dipendenti |
| Per sede aggiuntiva (una tantum) | €250,00 | Sedi 1-3 |
| Per sede aggiuntiva (una tantum) | €150,00 | Sedi 4-10 |
| Per sede aggiuntiva (una tantum) | €100,00 | Sedi 11+ |

**Numero di dipendenti pattuito alla firma:** [X] → scaglione applicato: [€_/dipendente/mese]
**Numero di sedi pattuito alla firma:** [X]

## 4. Fatturazione

- **Ciclo:** mensile posticipato, sulla base del numero di dipendenti attivi nel mese
- **Modalità di pagamento:** [BONIFICO / ALTRO — DA CONCORDARE]
- **Termini di pagamento:** [30 GG DATA FATTURA — DA CONCORDARE]

## 5. Durata

- **Decorrenza:** [DATA]
- **Durata iniziale:** [12 MESI — DA CONCORDARE]
- **Rinnovo:** tacito rinnovo per periodi di pari durata, salvo disdetta secondo la procedura descritta in `docs/sla.md` §8

## 6. Condizioni incorporate per riferimento

- Livello di servizio, severity e tempi di risposta: `docs/sla.md` §2-4
- Manutenzione programmata: `docs/sla.md` §5
- Protezione dati e GDPR: `docs/sla.md` §7, `docs/DPA_GDPR_Art28_IT.md` (integrale)
- Disdetta e cancellazione dati: `docs/sla.md` §8
- Limitazione di responsabilità: `docs/sla.md` §9

## 7. Firme

| | Nome | Ruolo | Data | Firma |
|---|---|---|---|---|
| Per il Fornitore | Diego Falletti | Amministratore | | |
| Per il Cliente | [NOME] | [RUOLO] | | |

---

*Modulo d'ordine Dataxiom S.r.l. — v1.0, 23 Agosto 2026.*
```

- [ ] **Step 2: Verificare che nessun contenuto duplichi `docs/sla.md`/`docs/DPA_GDPR_Art28_IT.md`**

Rileggere il file creato e confermare che copre solo: parti, oggetto, corrispettivo, fatturazione, durata — nessuna clausola di responsabilità, disdetta o protezione dati riscritta qui (solo referenziata).

- [ ] **Step 3: Commit**

```bash
git add docs/modulo-ordine-commerciale-IT.md
git commit -m "docs: add minimal commercial order form referencing existing SLA/DPA"
```

---

## Verifica finale (dopo tutti i 6 task)

- [ ] Run: `cd backend && npm test` — tutti verdi
- [ ] Run: `cd frontend-web && npx vitest run` — tutti verdi
- [ ] Run: `cd frontend-mobile && npx jest` — tutti verdi
- [ ] Grep di sicurezza: `grep -rn "Fase 2" CLAUDE.md` — non deve più comparire accanto a "Offline mode" o "export.*paghe"
- [ ] Aggiornare `TASKS.md` con una nuova riga di Session Log che chiude questo pacchetto, referenziando la spec e questo piano
