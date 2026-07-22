# Offline Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Su approvazione**: salvare questo piano in `docs/superpowers/plans/2026-07-19-offline-mode.md` e committare. **Esecuzione DOPO il lancio di domani (2026-07-20)**, per decisione utente: prima la Fase A (backend, deploy indipendente e retrocompatibile), poi la Fase B (mobile, nella prossima build TestFlight — che serve comunque entro l'8 settembre, scadenza Build 14).

**Goal:** timbrature IN/OUT che funzionano senza rete ("mai persa una timbratura") + consultazione offline di turni e presenze, con timestamp fedele, zero duplicati e badge "offline" visibile al manager.

**Architecture:** il client genera sempre `client_uuid` (idempotency key) e `occurred_at`; se il POST fallisce per rete, la timbratura entra in una coda persistente (AsyncStorage) e viene sincronizzata da un listener NetInfo. Il backend accetta `occurred_at` entro 48h, marca `is_offline`, e deduplica via UNIQUE su `client_uuid` (violazione → risponde col record esistente, sync idempotente). Turni/presenze: cache last-known-good in AsyncStorage con banner "dati aggiornati al…".

**Tech Stack:** già tutto presente — `@react-native-community/netinfo`, `@react-native-async-storage/async-storage`, `expo-crypto` (randomUUID), Express/Zod/pg, Jest/Vitest. **Zero dipendenze nuove.**

**Decisioni utente (grilling 2026-07-19):** perimetro = timbrature + consultazione read-only; anti-frode = finestra 48h + badge "offline" in dashboard; UX = successo garantito con contatore coda e conferma a sync; rollout = piano ora, esecuzione post-lancio.

---

## Contesto e vincoli scoperti in esplorazione

- `frontend-mobile/src/screens/checkin/CheckInScreen.jsx:31-36` — gate `NetInfo.fetch()` che **blocca** tutto se offline: da rimuovere.
- `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx:48-91` — parse QR `badge://checkin?site_id=…&client_id=…` e POST `/api/v1/checkins` con payload `{ employee_id, site_id, client_id, type, timestamp }`. **Il backend ignora `timestamp`**: lo Zod schema non lo accetta e l'INSERT usa `NOW()` (`backend/src/routes/checkins.js:112-121`).
- `backend/src/middleware/validation.js:73-86` — `PostCheckinSchema`: solo `employee_id`, `site_id`, `type`, lat/lng opzionali.
- **Nessuna idempotenza, nessun UNIQUE** sulla tabella checkins → i retry di sync creerebbero duplicati.
- Token: access 15m / refresh 7d con rotazione — l'interceptor 401→refresh esistente (`frontend-mobile/src/services/apiClient.js:33-72`) copre il re-auth al rientro online; offline > 7 giorni ⇒ re-login (accettabile).
- Rate limit generale 100 req/min/utente (`backend/src/middleware/rateLimiter.js`) → flush sequenziale, non parallelo.
- `TIMING`, `STORAGE_KEYS`, `ENDPOINTS` centralizzati in `frontend-mobile/src/config/endpoints.js` — estendere lì, mai hardcodare.
- Migrazioni: **idempotenti obbligatorie** (lezione Session 41).

---

# FASE A — Backend (deployabile subito, retrocompatibile)

### Task A1: Migration — client_uuid, is_offline, UNIQUE

**Files:**
- Create: `backend/src/db/migrations/031_add_offline_checkin_fields.sql` (verificare il prossimo numero libero in `backend/src/db/migrations/`)

- [ ] **Step 1: scrivere la migration (idempotente)**

```sql
-- 031: Offline mode — idempotency key + flag timbratura offline
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS client_uuid UUID;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS is_offline BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_client_uuid
  ON checkins (client_uuid) WHERE client_uuid IS NOT NULL;
```

- [ ] **Step 2: applicare in locale e verificare**

Run: `psql $DATABASE_URL -f backend/src/db/migrations/031_add_offline_checkin_fields.sql` (x2 — la seconda esecuzione deve essere no-op)
Expected: nessun errore in entrambe le esecuzioni; `\d checkins` mostra le 2 colonne e l'indice parziale.

- [ ] **Step 3: aggiornare `backend/src/db/schema.sql`** (sezione checkins, dopo il marker BOOTSTRAP) aggiungendo le stesse colonne/indice, così il bootstrap CI resta allineato.

- [ ] **Step 4: commit** — `git commit -m "feat(db): client_uuid + is_offline su checkins per offline mode (migration 031)"`

### Task A2: Schema Zod — occurred_at, client_uuid, is_offline (TDD)

**Files:**
- Modify: `backend/src/middleware/validation.js:73-86` (`PostCheckinSchema`)
- Test: `backend/src/__tests__/checkins-offline.test.js` (nuovo)

- [ ] **Step 1: scrivere i test fallenti** (seguire il pattern di mock pool/auth di `checkins-geofence.test.js`)

```javascript
// checkins-offline.test.js — casi schema
it('accetta occurred_at entro 48h', ...);           // 201
it('rifiuta occurred_at più vecchio di 48h', ...);   // 400 OFFLINE_TIMESTAMP_OUT_OF_WINDOW
it('rifiuta occurred_at nel futuro (> 5 min)', ...); // 400 OFFLINE_TIMESTAMP_OUT_OF_WINDOW
it('rifiuta client_uuid non-UUID', ...);             // 400 VALIDATION_ERROR
it('POST senza campi nuovi funziona come prima', ...); // 201, retrocompatibilità
```

- [ ] **Step 2: run test → FAIL** — `cd backend && npx jest checkins-offline`

- [ ] **Step 3: estendere lo schema**

```javascript
// in PostCheckinSchema.body, dopo longitude:
occurred_at: z.string().datetime({ offset: true }).optional()
  .superRefine((val, ctx) => {
    if (!val) return;
    const t = new Date(val).getTime();
    const now = Date.now();
    if (t < now - 48 * 3600 * 1000 || t > now + 5 * 60 * 1000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'OFFLINE_TIMESTAMP_OUT_OF_WINDOW' });
    }
  }),
client_uuid: z.string().uuid().optional(),
is_offline: z.boolean().optional(),
```

(La finestra 48h/+5min è la decisione anti-frode; +5 min tollera clock skew del device.)

- [ ] **Step 4: run test → PASS, poi commit**

### Task A3: Route — INSERT con occurred_at + risposta idempotente (TDD)

**Files:**
- Modify: `backend/src/routes/checkins.js:27-168` (handler POST)
- Test: `backend/src/__tests__/checkins-offline.test.js` (estendere)

- [ ] **Step 1: test fallenti**

```javascript
it('salva occurred_at come timestamp della timbratura e is_offline=true', ...);
it('due POST con lo stesso client_uuid creano UNA riga; il secondo risponde 200 col record esistente e deduplicated:true', ...);
it('audit log include is_offline nel newValue', ...);
```

- [ ] **Step 2: run → FAIL**

- [ ] **Step 3: implementare nel handler**

```javascript
// prima dell'INSERT, dentro withTransaction:
const { occurred_at, client_uuid, is_offline } = req.body;

// dedup idempotente: se client_uuid già presente, restituisci l'esistente
if (client_uuid) {
  const dup = await client.query(
    'SELECT * FROM checkins WHERE client_uuid = $1 AND client_id = $2',
    [client_uuid, clientId]
  );
  if (dup.rows.length > 0) {
    return res.status(200).json({ success: true, deduplicated: true, data: dup.rows[0] });
  }
}

// INSERT: COALESCE del timestamp client, colonne nuove
INSERT INTO checkins (employee_id, site_id, client_id, type, timestamp, created_by,
                      created_at, checkin_latitude, checkin_longitude, client_uuid, is_offline)
VALUES ($1, $2, $3, $4, COALESCE($8::timestamptz, NOW()), $5, NOW(), $6, $7, $9, COALESCE($10, false))
```

Gestire anche la race sul UNIQUE (due sync simultanei): catch dell'errore pg `23505` su `idx_checkins_client_uuid` → ri-SELECT e risposta 200 `deduplicated:true`. Includere `is_offline` nel `newValue` di `logAudit` (`action:'checkin_created'`).

- [ ] **Step 4: run → PASS; suite completa** — `npm test` (599+ test verdi)

- [ ] **Step 5: commit** — `git commit -m "feat(api): offline check-in — occurred_at (finestra 48h), idempotenza client_uuid, flag is_offline"`

### Task A4: Dashboard — badge "registrata offline" (TDD)

**Files:**
- Modify: la GET presences/checkins deve esporre `is_offline` (verificare `backend/src/routes/presences.js` o la SELECT di `checkins.js` — aggiungere la colonna alla proiezione se esplicita)
- Modify: `frontend-web/src/pages/PresencesPage.jsx` (o il componente tabella presenze — individuarlo con grep `timestamp` in `frontend-web/src/pages/`)
- Test: test Vitest del componente tabella (pattern dei test esistenti in `frontend-web/src/__tests__/`)

- [ ] **Step 1: test fallente frontend** — riga con `is_offline: true` mostra un Chip MUI "Offline" (size small, color warning, con tooltip "Timbratura registrata senza rete e sincronizzata in seguito"); riga con `is_offline: false/undefined` NON lo mostra.
- [ ] **Step 2: run → FAIL** — `cd frontend-web && npm run test -- --run <file>` — Expected: FAIL (chip non trovato)
- [ ] **Step 3: implementare il Chip accanto all'orario nella cella timestamp**
- [ ] **Step 4: run → PASS** — stesso comando, Expected: PASS; poi suite intera `npm run test -- --run` senza regressioni
- [ ] **Step 5: verifica visiva** — `npm run dev`, aprire la tabella presenze con un record fittizio `is_offline: true` (mock o seed locale): il chip appare, il tooltip è leggibile, il layout della cella non si rompe su viewport stretto
- [ ] **Step 6: commit**

### Gate di fine FASE A (obbligatorio prima del deploy)

- [ ] **A-G1: suite completa** — `cd backend && npm test -- --coverage` → tutti i test verdi (599+ preesistenti + nuovi), nessun hang a fine suite (verificare che il processo esca da solo, lezione pg-pool)
- [ ] **A-G2: /code-review** sul diff della fase (focus: race 23505, finestra 48h, retrocompatibilità schema) — findings CONFIRMED fixati prima di procedere
- [ ] **A-G3: migration in produzione** — applicare la 031 su RDS, poi ri-eseguire le query interessate (regola CLAUDE.md): `SELECT client_uuid, is_offline FROM checkins LIMIT 1;` → nessun errore
- [ ] **A-G4: smoke test API live** con token valido su api.dataxiom.it:
  1. `POST /api/v1/checkins` SENZA campi nuovi → 201 (retrocompatibilità: l'app mobile attuale continua a funzionare)
  2. POST con `occurred_at` = 1h fa + `client_uuid` nuovo + `is_offline: true` → 201, `timestamp` nel DB = occurred_at (non NOW)
  3. Stesso identico POST ripetuto → 200 `deduplicated: true`, `SELECT COUNT(*) WHERE client_uuid=…` = 1
  4. POST con `occurred_at` = 3 giorni fa → 400 `OFFLINE_TIMESTAMP_OUT_OF_WINDOW`
  5. Pulizia: DELETE dei record di test creati
- [ ] **A-G5: dashboard live** — badge "Offline" visibile sul record del punto 2 prima della pulizia

---

# FASE B — Mobile (prossima build TestFlight)

### Task B1: Config — chiavi e costanti

**Files:**
- Modify: `frontend-mobile/src/config/endpoints.js`

- [ ] **Step 1: estendere le costanti centralizzate**

```javascript
// in STORAGE_KEYS:
OFFLINE_QUEUE: 'badge_offline_queue',
CACHE_SHIFTS: 'badge_cache_shifts',
CACHE_PRESENCES: 'badge_cache_presences',

// nuovo blocco:
export const OFFLINE_CONFIG = {
  MAX_QUEUE_SIZE: 200,          // hard cap anti-abuso storage
  MAX_AGE_HOURS: 48,            // allineata alla finestra server
  FLUSH_DELAY_MS: 700,          // pausa tra POST sequenziali (rate limit 100/min)
  POST_TIMEOUT_OFFLINE_MS: 6000 // timeout corto per decidere in fretta "sei offline"
};
```

- [ ] **Step 2: commit**

### Task B2: offlineQueue service (TDD)

**Files:**
- Create: `frontend-mobile/src/services/offlineQueue.js`
- Test: `frontend-mobile/src/services/__tests__/offlineQueue.test.js` (mock AsyncStorage + apiClient, come i test service esistenti se presenti; altrimenti jest-expo standard)

- [ ] **Step 1: test fallenti** — enqueue persiste su AsyncStorage; flush POSTa in ordine FIFO con `client_uuid`/`occurred_at`/`is_offline:true`; su successo o `deduplicated` rimuove dalla coda; su errore di rete interrompe e mantiene; su 400 `OFFLINE_TIMESTAMP_OUT_OF_WINDOW` (o altra 4xx definitiva) sposta l'item in stato `failed` (non ritenta all'infinito); rispetta `MAX_QUEUE_SIZE`; scarta item più vecchi di `MAX_AGE_HOURS` marcandoli `failed`.

- [ ] **Step 2: run → FAIL**

- [ ] **Step 3: implementare**

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import apiClient from './apiClient';
import { ENDPOINTS, STORAGE_KEYS, OFFLINE_CONFIG } from '../config/endpoints';

// API del modulo:
export async function enqueueCheckin(payload)  // aggiunge { client_uuid: Crypto.randomUUID(), occurred_at: new Date().toISOString(), is_offline: true, ...payload }
export async function getQueue()                // [{...}] per il contatore UI
export async function flushQueue()              // sequenziale, FLUSH_DELAY_MS tra i POST; ritorna { synced, failed, remaining }
export function subscribe(listener)             // notifica la UI a ogni cambio coda (contatore + toast sync)
```

Mutex semplice (flag module-level `isFlushing`) per evitare flush concorrenti. Il flush usa `apiClient` così il 401→refresh esistente funziona gratis.

- [ ] **Step 4: run → PASS** — `cd frontend-mobile && npx jest offlineQueue` — Expected: tutti i casi del passo 1 verdi, inclusi i 3 critici: (a) flush interrotto a metà da errore rete lascia in coda SOLO gli item non ancora inviati, (b) risposta `deduplicated: true` rimuove l'item come un successo, (c) due `flushQueue()` concorrenti non generano POST doppi (mutex)
- [ ] **Step 5: commit**

### Task B3: Sync automatico — listener NetInfo + foreground

**Files:**
- Modify: root dell'app (`frontend-mobile/App.js` o dove sta il NavigationContainer)

- [ ] **Step 1:** all'avvio: `flushQueue()` best-effort. Registrare `NetInfo.addEventListener`: transizione a `isConnected && isInternetReachable` → `flushQueue()`. Registrare `AppState` listener: `active` → `flushQueue()`.
- [ ] **Step 2:** verificare che il listener sia registrato una sola volta (useRef guard — stesso pattern del fix duplicati di Build 7).
- [ ] **Step 3: verifica su simulatore/Expo Go** — con backend locale attivo: mettere 2 item finti in coda (`AsyncStorage.setItem` da debug), riaprire l'app → log del flush parte da solo; spegnere il backend, toggle wifi off/on → il listener scatta UNA volta sola (contare i log, no doppioni)
- [ ] **Step 4: commit**

### Task B4: Flusso timbratura — successo garantito

**Files:**
- Modify: `frontend-mobile/src/screens/checkin/CheckInScreen.jsx` (rimuovere gate NetInfo righe 31-36)
- Modify: `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx` (handleBarCodeScanned)
- Modify: `frontend-mobile/src/screens/checkin/SuccessScreen.jsx` (variante "in attesa di rete")

- [ ] **Step 1:** in QRScannerScreen, generare SEMPRE `client_uuid` + `occurred_at` prima del POST (innocuo online, e se il POST va in timeout ma il server l'ha ricevuto, il retry dalla coda viene deduplicato — chiude anche il bug del "doppio tap"). POST con timeout `POST_TIMEOUT_OFFLINE_MS`.
- [ ] **Step 2:** su errore di rete/timeout (no `error.response`): `await enqueueCheckin(payload)` → navigare a Success con param `{ pending: true }`. Su errore applicativo (4xx/5xx con response): comportamento attuale (errore mostrato).
- [ ] **Step 3:** SuccessScreen con `pending: true`: stessa schermata verde ma sottotitolo "Timbratura salvata sul telefono — verrà sincronizzata appena torna la rete" + icona cloud-off.
- [ ] **Step 4:** CheckInScreen: rimosso il gate; aggiungere sotto i bottoni il contatore coda (via `subscribe`): "🕓 N timbrature in attesa di sincronizzazione" (visibile solo se N>0) e, al completamento di un flush, toast/banner "✓ N timbrature sincronizzate".
- [ ] **Step 5: verifica su simulatore** — (a) online: timbratura normale → Success classica, nessun contatore; (b) backend spento: timbratura → Success "in attesa di rete" entro ~6s (timeout corto), contatore = 1; (c) errore applicativo simulato (403 ownership): NIENTE coda, errore mostrato come oggi; (d) backend riacceso: contatore torna a 0 e toast di conferma
- [ ] **Step 6: commit**

### Task B5: Cache read-only turni e presenze

**Files:**
- Modify: `frontend-mobile/src/screens/…/MyScheduleScreen.jsx` e `MyPresencesScreen.jsx` (individuare i fetch esistenti)

- [ ] **Step 1:** dopo ogni GET riuscita: `AsyncStorage.setItem(CACHE_SHIFTS/CACHE_PRESENCES, JSON.stringify({ savedAt: Date.now(), data }))`.
- [ ] **Step 2:** su GET fallita per rete: leggere la cache; se presente, renderizzare i dati con banner giallo "Sei offline — dati aggiornati al {data/ora}"; se assente, l'attuale schermata errore/Riprova.
- [ ] **Step 3: verifica su simulatore** — aprire turni e presenze online (popola cache) → spegnere il backend → riaprire le schermate: dati visibili + banner con orario corretto; svuotare AsyncStorage → stessa prova: schermata errore/Riprova classica (no crash su cache assente)
- [ ] **Step 4: commit**

### Gate di fine FASE B (prima della build)

- [ ] **B-G1: /test-all** (backend Jest + frontend Vitest + jest mobile) — tutto verde, riportare il sommario nel formato della skill
- [ ] **B-G2: /code-review** sul diff mobile (focus: persistenza coda dopo kill app, mutex flush, listener singolo, nessun dato sensibile in AsyncStorage oltre l'esistente)
- [ ] **B-G3: regressione flusso online** — timbratura online classica su simulatore end-to-end (scan QR demo → Success → record in DB con is_offline=false)

### Task B6: Build, E2E device e chiusura

- [ ] **Step 1:** EAS build TestFlight (skill `/build-mobile`). Checklist E2E su iPhone reale in modalità aereo:
  1. Timbratura IN in aereo → Success "in attesa di rete", contatore = 1
  2. Seconda timbratura OUT → contatore = 2
  3. Kill dell'app, riapertura in aereo → contatore ancora 2 (persistenza)
  4. Disattivare modalità aereo → sync automatico, toast "2 sincronizzate", contatore 0
  5. Dashboard web: le 2 timbrature hanno orario REALE (non l'ora del sync) e badge "Offline"
  6. Ripetere il punto 4 due volte con la stessa coda ricostruita a mano → nessun duplicato in DB
- [ ] **Step 2:** aggiornare TASKS.md (item Offline Mode → done), PROJECT_DECISIONS.md (decisioni grilling), HANDOFF.md.
- [ ] **Step 3:** marketing (post-implementazione, su ok utente): claim "Mai persa una timbratura — funziona anche senza rete" da aggiungere a badge-system.html e materiale LinkedIn futuro.

---

## Verification (end-to-end)

- Backend: `cd backend && npm test` (nuova suite `checkins-offline.test.js` inclusa); curl manuale su api.dataxiom.it con token valido: POST con `occurred_at` di 1h fa → riga con timestamp corretto; stesso `client_uuid` due volte → una sola riga.
- Frontend web: Vitest + verifica visiva badge Offline in dashboard.
- Mobile: checklist E2E modalità aereo del Task B6 (il vero test di accettazione).
- Regola CLAUDE.md: dopo le modifiche schema, ri-eseguire le query interessate prima di dichiarare successo.

## Fuori perimetro (esplicito)

- Richieste ferie/permessi/correzioni offline (decisione utente: no, prima versione).
- Hash chain "timbratura sigillata" (scartata al grilling).
- Background sync con l'app chiusa (expo-background-fetch): non necessario — il sync all'apertura + listener copre il caso d'uso retail; eventuale Fase 3.
- GPS/geofencing offline: il geofencing è feature-flagged off; quando verrà attivato, `occurred_at`+coordinate cached viaggiano già nel payload della coda senza modifiche strutturali.
