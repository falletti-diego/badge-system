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
- Create: `backend/migrations/032_add_offline_checkin_fields.sql` (la directory reale è `backend/migrations/`, non `backend/src/db/migrations/`; `031` era già occupata da `031_add_superadmin_role.sql`, quindi usata `032`)

> **Deviazioni dal piano (scoperte durante l'esecuzione):**
> - Directory e numero migration corretti come sopra.
> - Step 3 (aggiornare `schema.sql`) **non eseguito deliberatamente**: il bootstrap CI applica `schema.sql` (solo tabelle base) e poi TUTTE le migration in `backend/migrations/` in sequenza (vedi `.github/workflows/ci.yml` + `scripts/run-migrations.js`) — la migration 030 (client_id) non è mai stata backportata in `schema.sql` per lo stesso motivo. Aggiungere le colonne anche lì sarebbe stato ridondante e contrario alla convenzione già in uso.
> - L'indice UNIQUE finale è su `(client_id, client_uuid)`, non su `client_uuid` da solo — corretto durante il gate `/code-review` (A-G2) per garantire isolamento multi-tenant a livello DB. Vedi Task A3 per il dettaglio.

- [x] **Step 1: scrivere la migration (idempotente)**

```sql
-- 032: Offline mode — idempotency key + flag timbratura offline
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS client_uuid UUID;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS is_offline BOOLEAN NOT NULL DEFAULT false;
DROP INDEX IF EXISTS idx_checkins_client_uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_client_id_uuid
  ON checkins (client_id, client_uuid) WHERE client_uuid IS NOT NULL;
```

- [x] **Step 2: applicare in locale e verificare**

Applicata con `psql -f` su `badge_system` e `badge_system_test` (x2 ciascuna — la seconda esecuzione no-op, confermato dai NOTICE "already exists, skipping"). `\d checkins` mostra le 2 colonne e l'indice UNIQUE composito.

- [x] ~~Step 3: aggiornare schema.sql~~ — **non eseguito, deliberatamente** (vedi nota sopra)

- [x] **Step 4: commit** — `feat(db): client_uuid + is_offline su checkins per offline mode (migration 032)` (a344dee), poi corretto dal gate code-review in `f89b933`

### Task A2: Schema Zod — occurred_at, client_uuid, is_offline (TDD)

**Files:**
- Modify: `backend/src/middleware/validation.js:73-86` (`PostCheckinSchema`)
- Test: `backend/src/__tests__/checkins-offline.test.js` (nuovo)

- [x] **Step 1: scrivere i test fallenti** (seguire il pattern di mock pool/auth di `checkins-geofence.test.js`)

```javascript
// checkins-offline.test.js — casi schema
it('accetta occurred_at entro 48h', ...);           // 201
it('rifiuta occurred_at più vecchio di 48h', ...);   // 400 OFFLINE_TIMESTAMP_OUT_OF_WINDOW
it('rifiuta occurred_at nel futuro (> 5 min)', ...); // 400 OFFLINE_TIMESTAMP_OUT_OF_WINDOW
it('rifiuta client_uuid non-UUID', ...);             // 400 VALIDATION_ERROR
it('POST senza campi nuovi funziona come prima', ...); // 201, retrocompatibilità
```

- [x] **Step 2: run test → FAIL** — `cd backend && npx jest checkins-offline`

- [x] **Step 3: estendere lo schema**

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

- [x] **Step 4: run test → PASS, poi commit**

### Task A3: Route — INSERT con occurred_at + risposta idempotente (TDD)

**Files:**
- Modify: `backend/src/routes/checkins.js:27-168` (handler POST)
- Test: `backend/src/__tests__/checkins-offline.test.js` (estendere)

- [x] **Step 1: test fallenti**

```javascript
it('salva occurred_at come timestamp della timbratura e is_offline=true', ...);
it('due POST con lo stesso client_uuid creano UNA riga; il secondo risponde 200 col record esistente e deduplicated:true', ...);
it('audit log include is_offline nel newValue', ...);
```

- [x] **Step 2: run → FAIL**

- [x] **Step 3: implementare nel handler**

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

- [x] **Step 4: run → PASS; suite completa** — `npm test` (599+ test verdi)

- [x] **Step 5: commit** — `git commit -m "feat(api): offline check-in — occurred_at (finestra 48h), idempotenza client_uuid, flag is_offline"`

### Task A4: Dashboard — badge "registrata offline" (TDD)

**Files:**
- Modify: la GET presences/checkins deve esporre `is_offline` (verificare `backend/src/routes/presences.js` o la SELECT di `checkins.js` — aggiungere la colonna alla proiezione se esplicita)
- Modify: `frontend-web/src/pages/PresencesPage.jsx` (o il componente tabella presenze — individuarlo con grep `timestamp` in `frontend-web/src/pages/`)
- Test: test Vitest del componente tabella (pattern dei test esistenti in `frontend-web/src/__tests__/`)

- [x] **Step 1: test fallente frontend** — riga con `is_offline: true` mostra un Chip MUI "Offline" (size small, color warning, con tooltip "Timbratura registrata senza rete e sincronizzata in seguito"); riga con `is_offline: false/undefined` NON lo mostra.
- [x] **Step 2: run → FAIL** — `cd frontend-web && npm run test -- --run <file>` — Expected: FAIL (chip non trovato)
- [x] **Step 3: implementare il Chip accanto all'orario nella cella timestamp**
- [x] **Step 4: run → PASS** — stesso comando, Expected: PASS; poi suite intera `npm run test -- --run` senza regressioni
- [x] **Step 5: verifica visiva** — `npm run dev`, aprire la tabella presenze con un record fittizio `is_offline: true` (mock o seed locale): il chip appare, il tooltip è leggibile, il layout della cella non si rompe su viewport stretto
- [x] **Step 6: commit**

### Gate di fine FASE A (obbligatorio prima del deploy)

- [x] **A-G1: suite completa** — 608/608 backend (Jest) + 239/240 frontend-web (Vitest, 1 skip pre-esistente) verdi. Un fallimento visto in run parallela (`demo-start.test.js`, cap conteggio demo attive) è il flake inter-worker già noto in backlog — passa in isolamento, non causato da questa fase.
- [x] **A-G2: /code-review** (medium effort, 8 finder-agent + verifica) sul diff A1-A4. **1 finding CRITICO confermato empiricamente contro Postgres reale**: il catch(23505) lasciava la transazione in stato aborted → la SELECT di recovery falliva sempre con `25P02` invece di rispondere `deduplicated:true` (il mock dei test non lo copriva, non simulando lo stato reale della transazione). Fix: sostituito con `INSERT ... ON CONFLICT (client_id, client_uuid) DO NOTHING RETURNING` (nessuna eccezione mai lanciata) — riverificato con script diretto contro `badge_system_test` reale. Altri 2 fix applicati: indice UNIQUE scoped per tenant (`client_id, client_uuid` invece di solo `client_uuid`); recovery SELECT ora filtra anche per `employee_id`, con risposta `409 CHECKIN_UUID_COLLISION` fail-closed se un client_uuid risulta riusato da un employee diverso. Commit fix: `f89b933`.
- [x] **A-G3: migration in produzione** — applicata la 032 su RDS via EC2 (RDS non raggiungibile direttamente dal locale, corretto: security group VPC-only). Idempotenza riverificata con doppia esecuzione (2° run tutto no-op). Query di verifica CLAUDE.md eseguita: `SELECT client_uuid, is_offline FROM checkins LIMIT 1;` → nessun errore, `\d checkins` conferma le 2 colonne + l'indice UNIQUE composito `(client_id, client_uuid)`.
- [x] **A-G4: smoke test API live** eseguito su `api.dataxiom.it` con un tenant demo self-service isolato (nessun dato di cliente reale toccato), poi eliminato a fine test:
  1. `POST /api/v1/checkins` SENZA campi nuovi → 201, `is_offline:false` ✓ (retrocompatibilità confermata)
  2. POST con `occurred_at` = 1h fa + `client_uuid` nuovo → 201, `timestamp` = occurred_at esatto (non NOW), `is_offline:true` derivato server-side ✓
  3. Stesso identico POST ripetuto → 200 `deduplicated:true`, stesso `id` restituito (nessuna riga duplicata) ✓
  4. POST con `occurred_at` = 3 giorni fa → 400 `OFFLINE_TIMESTAMP_OUT_OF_WINDOW` ✓
  5. Pulizia: `DELETE FROM clients WHERE id = ...` (cascata su employees/sites/checkins) — eseguita ✓

  **Finding aggiuntivo durante lo smoke test (non nel piano originale):** un security review automatico post-push ha segnalato che `is_offline` era accettato as-is dal client e finiva senza verifica nell'audit trail e nel badge dashboard — un client (bug o malevolo) poteva falsare entrambi i segnali di trasparenza pensati per il manager. Corretto **dopo che la Fase A era già stata deployata una prima volta** (breve finestra, nessun dato reale compromesso — `is_offline` è solo informativo, non un controllo di autorizzazione): `is_offline` ora è calcolato server-side da `occurred_at` (distanza da `now()` > 60s), mai letto dall'input client; rimosso dallo schema Zod. Commit `5067e01`, ri-deployato e ri-verificato con lo smoke test sopra (che riflette già il comportamento corretto).
- [x] **A-G5: dashboard live** — verificato a livello di contratto dati: `GET /api/v1/checkins` (l'endpoint che alimenta `PresencesTable`) espone `is_offline:true` esattamente sul record creato al punto 2, `is_offline:false` su tutti gli altri. Il rendering del Chip MUI su quel campo è già coperto da test Vitest (Task A4). **Non verificato visivamente in un browser reale** (nessun tool di rendering browser disponibile in questa sessione) — solo verifica a livello di API/dati.

---

# FASE B — Mobile (prossima build TestFlight)

### Task B1: Config — chiavi e costanti

**Files:**
- Modify: `frontend-mobile/src/config/endpoints.js`

> **Deviazione dal piano (scoperta durante l'esecuzione):** il piano affermava "già tutto presente — zero dipendenze nuove", ma `expo-crypto` **non era installato** (né in `package.json` né in `node_modules`). Aggiunto con `npx expo install expo-crypto` (versione compatibile SDK 54 risolta automaticamente, `~15.0.9`) — nessun codice nativo da toccare (`ios/` è gitignored, Continuous Native Generation via EAS Build). API `Crypto.randomUUID()` confermata esistente prima dell'uso.

- [x] **Step 1: estendere le costanti centralizzate**

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

- [x] **Step 2: commit**

### Task B2: offlineQueue service (TDD)

**Files:**
- Create: `frontend-mobile/src/services/offlineQueue.js`
- Test: `frontend-mobile/src/__tests__/offlineQueue.test.js` (percorso corretto — vedi nota sotto)

> **Deviazione dal piano (scoperta durante l'esecuzione):** il percorso indicato dal piano (`frontend-mobile/src/services/__tests__/`) non sarebbe mai stato eseguito da `npm test` — lo script è `jest src/__tests__/` e il `testMatch` di Jest è ristretto a `**/src/__tests__/**/*.test.js` (piatto, nessuna sottocartella). Test creato nel percorso corretto, coerente con `dateUtils.test.js`/`presenceUtils.test.js` già esistenti.

- [x] **Step 1: test fallenti** — enqueue persiste su AsyncStorage; flush POSTa in ordine FIFO con `client_uuid`/`occurred_at`/`is_offline:true`; su successo o `deduplicated` rimuove dalla coda; su errore di rete interrompe e mantiene; su 400 `OFFLINE_TIMESTAMP_OUT_OF_WINDOW` (o altra 4xx definitiva) sposta l'item in stato `failed` (non ritenta all'infinito); rispetta `MAX_QUEUE_SIZE`; scarta item più vecchi di `MAX_AGE_HOURS` marcandoli `failed`.

- [x] **Step 2: run → FAIL**

- [x] **Step 3: implementare**

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

- [x] **Step 4: run → PASS** — `cd frontend-mobile && npx jest offlineQueue` — Expected: tutti i casi del passo 1 verdi, inclusi i 3 critici: (a) flush interrotto a metà da errore rete lascia in coda SOLO gli item non ancora inviati, (b) risposta `deduplicated: true` rimuove l'item come un successo, (c) due `flushQueue()` concorrenti non generano POST doppi (mutex)
- [x] **Step 5: commit**

### Task B3: Sync automatico — listener NetInfo + foreground

**Files:**
- Modify: root dell'app (`frontend-mobile/App.js` o dove sta il NavigationContainer)

- [x] **Step 1:** all'avvio: `flushQueue()` best-effort. Registrare `NetInfo.addEventListener`: transizione a `isConnected && isInternetReachable` → `flushQueue()`. Registrare `AppState` listener: `active` → `flushQueue()`.
- [x] **Step 2:** verificare che il listener sia registrato una sola volta (useRef guard — stesso pattern del fix duplicati di Build 7).
- [ ] ~~Step 3: verifica su simulatore/Expo Go~~ — **non eseguita, nessun simulatore/device disponibile in questa sessione.** Verificato solo staticamente (rilettura del file, regressione dei 41 test esistenti invariati). Deferita a Task B6.
- [x] **Step 4: commit**

### Task B4: Flusso timbratura — successo garantito

**Files:**
- Modify: `frontend-mobile/src/screens/checkin/CheckInScreen.jsx` (rimuovere gate NetInfo righe 31-36)
- Modify: `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx` (handleBarCodeScanned)
- Modify: `frontend-mobile/src/screens/checkin/SuccessScreen.jsx` (variante "in attesa di rete")

- [x] **Step 1:** in QRScannerScreen, generare SEMPRE `client_uuid` + `occurred_at` prima del POST (innocuo online, e se il POST va in timeout ma il server l'ha ricevuto, il retry dalla coda viene deduplicato — chiude anche il bug del "doppio tap"). POST con timeout `POST_TIMEOUT_OFFLINE_MS`.
- [x] **Step 2:** su errore di rete/timeout (no `error.response`): `await enqueueCheckin(payload)` → navigare a Success con param `{ pending: true }`. Su errore applicativo (4xx/5xx con response): comportamento attuale (errore mostrato).
- [x] **Step 3:** SuccessScreen con `pending: true`: stessa schermata verde ma sottotitolo "Timbratura salvata sul telefono — verrà sincronizzata appena torna la rete" + icona cloud-off.
- [x] **Step 4:** CheckInScreen: rimosso il gate; aggiungere sotto i bottoni il contatore coda (via `subscribe`): "🕓 N timbrature in attesa di sincronizzazione" (visibile solo se N>0) e, al completamento di un flush, toast/banner "✓ N timbrature sincronizzate".
- [ ] ~~Step 5: verifica su simulatore~~ — **non eseguita, nessun simulatore/device disponibile in questa sessione.** Verificato invece con uno smoke test diretto contro `api.dataxiom.it` (tenant demo isolato) che il payload esatto ora inviato da QRScannerScreen per il flusso online produce `201`/`is_offline:false` (vedi Gate B-G3). I sotto-casi (b)/(c)/(d) — comportamento offline/errore applicativo/contatore — richiedono un device reale, deferiti a Task B6.
- [x] **Step 6: commit**

### Task B5: Cache read-only turni e presenze

**Files:**
- Modify: `frontend-mobile/src/screens/…/MyScheduleScreen.jsx` e `MyPresencesScreen.jsx` (individuare i fetch esistenti)

- [x] **Step 1:** dopo ogni GET riuscita: `AsyncStorage.setItem(CACHE_SHIFTS/CACHE_PRESENCES, JSON.stringify({ savedAt: Date.now(), data }))`.
- [x] **Step 2:** su GET fallita per rete: leggere la cache; se presente, renderizzare i dati con banner giallo "Sei offline — dati aggiornati al {data/ora}"; se assente, l'attuale schermata errore/Riprova.
- [ ] ~~Step 3: verifica su simulatore~~ — **non eseguita, nessun simulatore/device disponibile in questa sessione.** Verificato solo staticamente (rilettura dei file, edge case corrotti/mismatch gestiti esplicitamente nel codice). Deferita a Task B6.
- [x] **Step 4: commit**

### Gate di fine FASE B (prima della build)

- [x] **B-G1: /test-all** — backend 610/610 (Jest), frontend-web 239/240 (Vitest, 1 skip pre-esistente), mobile 41/41 (Jest) — tutto verde.
- [x] **B-G2: /code-review** (medium effort, 8 finder-agent + verifica manuale) sul diff mobile A1-B5. **3 problemi reali trovati e corretti**: (1) **leak cache cross-utente** — `authService.logout()` non ripuliva `CACHE_SHIFTS`/`CACHE_PRESENCES`, su device condiviso (comune nel retail) un dipendente poteva vedere dati cache del precedente; fix: aggiunte le 2 chiavi al `multiRemove` del logout (la coda offline NON viene ripulita, di proposito — le timbrature in coda restano di chi le ha create). (2) `flushQueue` persisteva la coda una sola volta a fine ciclo invece che dopo ogni item — un kill dell'app a metà flush poteva causare un re-invio di item già sincronizzati (innocuo per il dedup server, ma spreco); fix: persistenza incrementale, deliberatamente fuori dal try/catch del POST. (3) `flushQueue` poteva propagare un'eccezione inattesa come promise rejection non gestita (è chiamata fire-and-forget da `RootNavigator`); fix: mai un reject, default sicuro su errore imprevisto. 2 nuovi test TDD aggiunti. Backlog non bloccante: pattern di cache-fallback duplicato tra `MyScheduleScreen`/`MyPresencesScreen` (candidato per hook condiviso futuro); item della coda mescola campi wire-payload e bookkeeping interno. Commit fix: `0cde2eb`.

**Finding aggiuntivo (security review automatico post-commit su `0cde2eb`)**: la coda offline non ripulita al logout (di proposito) poteva contenere timbrature di un employee precedente su un device condiviso — verificato che il rischio reale non è solo un leak informativo ma un **bug funzionale**: un flush scattato durante la sessione di un employee B con timbrature di un employee A in coda le avrebbe fatte rifiutare dal backend (403 ownership, S.32.1) e marcare `failed` permanentemente, perdendo la timbratura reale di A. Fix: `flushQueue` ora tenta solo gli item il cui `employee_id` corrisponde all'utente attualmente autenticato (`authService.getUser()`); gli item di un altro employee (o nessun utente loggato) restano `pending` intatti, mai tentati né marcati failed. Contatore in `CheckInScreen` scoped allo stesso modo. 2 nuovi test TDD, 43/43 suite mobile. Commit fix: `8a5e6ad`.
- [x] **B-G3: regressione flusso online** — **nessun simulatore/device disponibile in questa sessione** (non "su simulatore" come da piano originale). Verificato invece con uno smoke test diretto contro `api.dataxiom.it` (tenant demo isolato, creato e ripulito): il payload esatto ora inviato da `QRScannerScreen` per un check-in online normale (`client_id` tenant + `client_uuid` + `occurred_at` ≈ now) produce `201`/`is_offline:false` — nessuna regressione sul flusso online lato backend. La verifica UI/UX end-to end reale (scan QR fisico → Success → contatore) resta da fare su device in Task B6.

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
