# Badge System — Session 93 Handoff

**Date:** 2026-08-07
**Session:** 93 — Fase A findings 2 Agosto (8 fix sicurezza/correttezza) + bug strutturale `assigned_sites` scoperto e chiuso con trigger DB + wizard "Aggiorna Dipendenti" promosso in produzione + fix idempotenza migration 035
**Status:** ✅ Tutti e 3 i fix live in produzione e verificati dal vivo (health check + chiamate API reali contro `api.dataxiom.it`, non solo deploy "riuscito"). ✅ Wizard "Aggiorna Dipendenti" ora anche su `main`. Deploy complicato da un major outage GitHub Actions (~11 ore) — risolto senza bypass, solo leve legittime dei workflow.

---

## Goal (Session 93)

Chiudere gli 8 findings isolati a basso rischio di `findings2agosto2016.md` (analisi di sicurezza/correttezza di 4 giorni prima), verificarli su staging, e promuoverli in produzione. Durante la verifica manuale è emerso un secondo problema, non pianificato, che ha finito per occupare gran parte della sessione: un bug strutturale sull'assegnazione sede dei dipendenti.

## Esito (Session 93)

### 1. Fase A — 8 findings chiusi (`fix/findings-2026-08-02-fase-a`, poi mergeato)

Deciso con l'utente via `/superpowers:brainstorming`+`/grilling`: solo i findings isolati (#4,6,7,9,10,11,12,13) + verifica-chiusura del #8 (RBAC lato client — confermato già mitigato server-side, non un bug). Rimandati esplicitamente: #1 (secure storage mobile, Fase B), #2+#5 (geofencing/QR rotation reali, Fase C). Lasciato invariato: #3 (token web localStorage, decisione già presa in `TASKS.md` C.5.3).

Eseguito via `/superpowers:subagent-driven-development`, 14 task, ognuno con doppia review (spec compliance + code quality). Diversi round di fix-and-re-review hanno trovato problemi reali non catturati al primo giro: audit log mancante per `faceid_verified`, tooltip mancante sul chip "No Face ID", test basato su regex fragile sostituito con un'asserzione comportamentale, stato d'errore "sticky" mai ripulito su un poll riuscito, coverage mancante sul ramo fallback del lock cross-tab, `user_id` non-UUID hardcoded in un nuovo test (pattern esplicitamente vietato da CLAUDE.md "Pattern 1").

**La code review finale olistica sull'intero branch** (dopo tutti i 14 task, non task-per-task) ha trovato il problema più importante della sessione: l'header `X-Truncated` non era esposto in `Access-Control-Expose-Headers`. Su un'architettura cross-origin (dashboard Netlify ↔ API EC2) il warning di export CSV troncato — uno degli 8 findings appena fixati — non sarebbe mai arrivato a un browser reale, vanificando silenziosamente il fix. Corretto con `exposedHeaders` in `app.js` + test CORS dedicato.

Verifica manuale su staging fatta insieme all'utente, passo-passo, con correzioni mie quando la procedura di test proposta non esercitava davvero il path giusto — es. il lock cross-tab (finding #7) va testato **corrompendo** il token senza ricaricare la pagina, non cancellandolo e ricaricando: quest'ultimo attiva solo `ProtectedRoute.jsx` (redirect sincrono al login), mai il meccanismo di refresh/lock che si voleva verificare.

### 2. Bug strutturale `assigned_sites` (`fix/assigned-sites-invariant-2026-08-06`, poi mergeato)

Durante la verifica manuale, `maria@badge.local` non riusciva a timbrare su staging. Investigato a fondo invece di patchare il sintomo: `POST /checkins` autorizza solo tramite `assigned_sites` (array), mai tramite `site_id` (colonna singola) — e le migration storiche 018/019a (che creano gli account demo) valorizzano solo `site_id`. **Stessa causa già colpita in produzione una volta** (Pino, Session 81), sistemata allora con una migration mirata a quella singola riga (033), mai generalizzata.

Verifica quantitativa **prima** di scrivere codice (script diagnostico via SSH su EC2/RDS, sola lettura, ripulito dopo): 1 riga rotta in produzione (dal 19 Giugno, mai scoperta), 2 su staging. Nessun cliente reale coinvolto.

Su decisione esplicita dell'utente (`/superpowers:brainstorming` dedicato), scelto un fix strutturale: migration `038` con backfill generale + **trigger Postgres `BEFORE INSERT OR UPDATE`** che mantiene per sempre l'invariante `site_id ⊆ assigned_sites` — additivo (mai rimuove siti da un dipendente multi-sede), NULL-safe (`COALESCE`, aggiunto in un round di code review dopo che il primo passaggio non gestiva `assigned_sites IS NULL`). L'utente ha chiesto esplicitamente test che verificassero anche **l'interazione con il codice esistente**, non solo il fix isolato — soddisfatto con test a 3 livelli: trigger/backfill isolati (Postgres reale, 6 scenari), non-regressione dei path applicativi esistenti (in particolare `employeeSync/applyDiff.js`, che gestisce `assigned_sites` per conto suo — verificato che il trigger sia un no-op corretto lì), end-to-end attraverso l'handler reale di `POST /checkins`.

Un fix di code review in più durante l'esecuzione: `ROLLBACK` spostato da `try` a `finally` nei test transazionali (un'asserzione fallita avrebbe altrimenti lasciato una transazione aperta nel pool condiviso, con rischio di inquinare test successivi).

### 3. Deploy complicato da un major outage GitHub Actions

Dalle 15:22 UTC del 6 Agosto alle ~02:00 UTC del 7 (causa dichiarata da GitHub: pod Runner Controller bloccati in stato idle), i webhook erano deliberatamente rallentati per favorire il recupero — push su `develop`/`main` smettevano di attivare qualunque run, e una run già partita è rimasta orfana (`queued` per 8+ ore, `rerun`/`cancel` in stato contraddittorio anche a outage risolto). Risolto senza bypass di sicurezza, solo leve già esposte dai workflow: `gh workflow run <file>.yml --ref <branch>` (trigger manuale `workflow_dispatch`) dove disponibile, un commit vuoto per forzare un nuovo run pulito dove necessario.

**Decisione di scope segnalata esplicitamente prima di agire**: il merge `develop`→`main` per Fase A ha portato con sé anche l'intero wizard "Aggiorna Dipendenti" (rimasto intenzionalmente solo su `develop` da Session 92, per istruzione esplicita dell'utente in quella sessione — "lascialo su staging per ora"). Segnalato all'utente prima del push ("il merge include molto più di Fase A") invece di procedere silenziosamente; l'utente ha confermato di voler comunque procedere con tutto insieme.

### 4. Fix aggiuntivo — CI rotta ricorrente (segnalato dall'utente)

Il job CI "Backend - Lint & Test" falliva la migration 035 ("column active already exists") ad ogni singolo push da quando il wizard è stato scritto — `schema.sql` era stato aggiornato per riflettere le colonne della 035 (fonte di verità per un'installazione da zero), ma CI fa bootstrap-da-schema.sql e POI rigioca tutte le migration storiche nello stesso passo. Mai un problema per staging/produzione (storico incrementale via `run-migrations.js`, mai bootstrap+replay insieme). Fix: `IF NOT EXISTS` su ogni `ADD COLUMN`/`CREATE INDEX` (stesso pattern già usato in 036/037/038), **verificato replicando lo scenario CI esatto su un DB Postgres locale usa-e-getta** prima di committare, non solo per lettura del codice.

### 5. Bonus — pulizia skill personali

Su richiesta dell'utente, eseguita `/skill-doctor`: trovati e rimossi (dopo conferma) 2 duplicati — `grill-me` (quasi identica a `grilling`, tenuta) ed `engineering-skills` (catalogo ridondante di 23 skill già installate singolarmente, con path di quick-start non più corrispondenti).

## Verifiche finali (dal vivo, non solo "deploy riuscito")

- `GET /health` su `api.dataxiom.it` → `status: ok`, DB connesso
- `GET /admin/employee-sync/template` (wizard) → `200` reale su produzione
- `maria@badge.local` su produzione e staging → `assigned_sites` corretto (verificato via `/admin/debug/employee-assignment/:id`)
- CORS `Access-Control-Expose-Headers: X-Truncated` presente su richiesta cross-origin reale
- CI "Backend - Lint & Test" verde su `develop`/`main` dopo il fix migration 035 (restano solo i 2 fallimenti pre-esistenti sotto)

## Backlog per la prossima sessione (in ordine di urgenza)

1. **Rinnovo build TestFlight** — scade **2026-09-08**, promemoria segnato per **2026-08-25**. Hard deadline, non negoziabile.
2. **S.26** — consenso GPS esplicito (GDPR Art. 7, HIGH) — ancora aperto, dormiente finché nessun cliente reale chiede il geofencing.
3. **Fase B** (secure storage mobile, finding #1 — token in AsyncStorage non cifrato) — non iniziata.
4. **Fase C** (geofencing/QR rotation reali, finding #2+#5 — il geofencing esiste nel codice ma il mobile non invia mai le coordinate GPS) — non iniziata. Va di pari passo con S.26 se un cliente lo richiede.
5. **ANDROID.1/1b** — verifica manuale scan QR reale su device fisico/Virtual Scene, bloccato da un limite di automazione GUI-only.
6. Backlog invariato da Session 89: bug UX redirect post-login (`LoginPage.jsx:44`, basso rischio).
7. **2 sotto-punti checklist wizard non verificabili** (Sezioni 6.4/6.5, da Session 92) — richiedono una build mobile puntata su staging, mai costruita.
8. **Fallimenti CI pre-esistenti, non bloccanti**: `Mobile - Test` (flakiness nota `MyScheduleScreen.test.jsx`), `Security Check`/`npm audit` (vulnerabilità documentate da Session 79).

## Note operative (Session 93)

- **Verifica manuale col cliente/utente**: se dai una procedura di test e il risultato non torna, non assumere che sia un bug — verifica prima se la procedura esercita davvero il path che si vuole testare (vedi il caso del lock cross-tab sopra).
- **Prima di decidere l'ampiezza di un fix su dati di produzione**: una query di sola lettura per misurare il blast radius reale costa poco e cambia la decisione — qui ha dato fiducia per un trigger DB invece di una patch mirata.
- **Durante un outage GitHub Actions**: controllare `githubstatus.com` prima di continuare a ritentare a raffica; se un workflow supporta `workflow_dispatch`, usarlo per bypassare un webhook rallentato; per workflow senza `workflow_dispatch`, un commit vuoto genera un run pulito quando uno vecchio resta orfano.
- **Prima di un merge `developX`→`main`**: controllare sempre `git log main..origin/develop` per sapere ESATTAMENTE cosa si sta per portare in produzione — può includere più di quanto pianificato nella sessione corrente (successo qui col wizard).
- **Migration idempotenti**: ogni nuova migration in questo repo dovrebbe usare `IF NOT EXISTS`/`ON CONFLICT` per default (035, 036, 037, 038 lo fanno tutte ora) — evita sia il problema del bootstrap CI sia futuri re-run accidentali.
- Script diagnostici ad-hoc su produzione: sempre `require('/app/src/config-loader.js')` prima di `pg`/`db/pool.js`. Scrivere il file, `scp` su EC2, `docker cp` nel container, eseguire con `docker exec -w /app <container> node <script>.js`, poi ripulire da container+host+locale — pattern riconfermato in questa sessione.
- Worktree `.claude/worktrees/employee-sync-wizard` (branch `develop`) e `.claude/worktrees/code-review-fixes`/`demo-self-service`/`hotfix-refresh-replay-detection` non toccati in questa sessione, restano come da sessioni precedenti.
- Branch di questa sessione (`fix/findings-2026-08-02-fase-a`, `fix/assigned-sites-invariant-2026-08-06`, `fix/migration-035-idempotent-ci-2026-08-07`) ormai tutti mergeati in `main` — da eliminare quando comodo, non urgente.

---

## Handoff precedenti (invariati, riportati sotto per contesto)

### Session 92 — Verifica manuale wizard (12/12 sezioni) + saldo ferie negativo

**Goal:** Continuazione diretta di Session 91 (wizard "Aggiorna Dipendenti" appena implementato, mai testato manualmente da un umano reale). L'utente ha eseguito personalmente, sezione per sezione, `docs/employee-sync-wizard-test-checklist.md` (12 sezioni) contro staging, chiedendo ad ogni segnalazione una verifica indipendente. A fine checklist, richiesta aggiuntiva fuori scope wizard: rimuovere il blocco sul saldo ferie negativo.

**Esito:** Verifica checklist 12/12 sezioni chiuse. 5 bug reali aggiuntivi trovati (totale 9 sull'intero ciclo di vita del wizard): IAM SES mai concesso su staging (email di benvenuto falliva silenziosamente), dettaglio del cambiamento assente per righe Modificati/Riattivati (fix con nomi sede leggibili), 3 bug minori dalla verifica automatica precedente. 3 miglioramenti UX su proposta dell'utente (lista scorrevole Anomalie, email "bentornato" con reset password automatico, bottone "Annulla" nella preview). Fuori scope: rimosso il blocco `INSUFFICIENT_SALDO` — saldo ferie ora può scendere sotto zero, mostrato in rosso. `/code-review:code-review` (5 agenti + scoring Haiku, nessun blocco ≥80) + `/test-all` finale (backend 706/706, frontend-web 264/264). Tutto rimasto su `develop` per istruzione esplicita dell'utente ("Lascialo su staging per ora") — **promosso su `main` in Session 93**.

**Credenziali staging usate**: `pippo@badge.local` / `NQQG65D7Zawy57ur` (admin, cliente "Dataxiom MVP"), password Maria/Pino da SSM `/badge/staging/DEMO_MARIA_PASSWORD`/`DEMO_PINO_PASSWORD`.

---

### Session 89 — SES fuori sandbox + Gate finale onboarding self-service

**Goal:** AWS ha approvato il sandbox-exit SES (dopo `DENIED` fermo da Session 84). L'utente ha scelto di eseguire in sequenza: Task 7 del piano SES (config produzione), poi il Gate finale del piano onboarding self-service.

**Esito:** Task 7 SES completato, `MAX_ACTIVE_DEMOS=20` in SSM produzione, test E2E email reale riuscito. Gate finale onboarding ha scoperto 2 bug di produzione reali: 55 commit mai pushati (Session 83-88), `exceljs` in `devDependencies` invece che `dependencies` (crash-loop container). Entrambi fixati e deployati. Gate finale eseguito passo-passo dall'utente: creazione client → invito → accept → wizard → import Excel → welcome email — tutto riuscito. Bug UX scoperto (non fixato allora): redirect post-login per admin con onboarding incompleto (`LoginPage.jsx:44`) — **fixato in Session 89 stessa più avanti** (vedi `TASKS.md` MVP Hardening).

**Note operative**: `npm test` non esegue `lint` in questo repo — controllare `npm run lint` prima di push importanti. Qualunque modulo richiesto a runtime da `backend/src/` deve stare in `dependencies`, mai `devDependencies`.

---

### Session 87-88 — ANDROID.2

**Esito:** Jank animazioni Android low-end ridotto (`deviceTier.js`, `isLowEndDevice()`). Causa reale del blocco d'ambiente Session 87: PIN di blocco schermo residuo sugli AVD (BFU state), non un problema di toolchain. `FaceIDScreen` mediana dimezzata 61ms→32ms dopo il fix; `QRScannerScreen` marginale (CameraView resta il collo di bottiglia). Dettaglio completo in `PROJECT_DECISIONS.md`.

---

### Session 85 — Onboarding cliente self-service implementato

**Esito:** 8/8 task del piano eseguiti. Code review finale ha trovato 5 problemi reali (JWT senza `employee_id` su accept-invito, guard fail-fast mancante, audit log mancante, `generateInviteToken()` fuori dal try, rate-limiter condiviso tra `/onboarding/invite` e `/demo/start`). QA manuale ha trovato un leak di password in chiaro nel preview. Suite finale: backend 630/644, frontend-web 248/249. SES ancora `DENIED` a quel punto (risolto Session 89).

**Dove sono le cose**: piano `docs/superpowers/plans/2026-07-28-onboarding-self-service.md`, nuovi file backend (`onboardingInvite.js`, `admin/onboarding.js`, `inviteTokens.js`, `services/onboarding/*.js`), nuovi file frontend (`AcceptInvitePage.jsx`, `OnboardingWizardPage.jsx`, `useOnboarding.js`).
