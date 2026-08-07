# Badge System — Session 95 Handoff

**Date:** 2026-08-07
**Session:** 95 — Build nativa iOS #35 rilasciata su TestFlight, distribuisce il fix Fase B (finding #1) a utenti reali
**Status:** ✅ Build 35 completata con successo (confermato dall'utente). Il fix mergeato in Session 94 (secure token storage, `expo-secure-store`) è ora effettivamente in distribuzione, non più solo "in `main`".

---

## Goal (Session 95)

Continuazione diretta di Session 94, stessa giornata. Chiudere il gap "mergeato ma non distribuito": la Fase B è in `main` da Session 94 ma `expo-secure-store` è un modulo nativo, non raggiungibile via OTA — serve una build nativa nuova per arrivare a un dispositivo reale.

## Esito (Session 95)

### Backlog MVP prioritizzato + correzione di una voce stale
Su richiesta dell'utente, prodotta una lista prioritizzata del lavoro MVP rimanente (`findings2agosto2016.md` + `TASKS.md` §MVP Hardening + questo file). Nel farlo, verificato sul codice — non fidandosi della documentazione — che il "bug UX redirect post-login" ancora segnalato aperto in questo file era **già fixato** in Session 89 (`frontend-web/src/pages/LoginPage.jsx:44-49`, `user.has_sites`). Rimosso dal backlog attivo, corretto qui e in `PROJECT_DECISIONS.md`.

### Preflight + bump buildNumber
Verificati `frontend-mobile/app.json` (`ios.buildNumber: "34"`) e `codemagic.yaml` (workflow `badge-ios-testflight`: prebuild → CocoaPods → build IPA → submit automatico a TestFlight). Nessun auto-increment nello script — bump manuale `34`→`35`, commit `6a7761b`, pushato su `origin/main`.

### Disallineamento scoperto: skill `/build-mobile` vs pipeline reale
Lo skill `/build-mobile` (`disable-model-invocation` — solo l'utente può lanciarlo) di default userebbe `npx eas build --platform ios --profile preview`, un percorso EAS Build diretto che **non sottomette a TestFlight**. La pipeline reale del progetto (usata per tutte le build precedenti, es. Build 34) è Codemagic. Segnalato esplicitamente invece di eseguire lo skill alla lettera; chiesto all'utente quale pipeline usare (`AskUserQuestion`) — confermato Codemagic.

### Trigger manuale, nessun accesso programmatico
`codemagic.yaml` non ha trigger automatico configurato (nessuna sezione webhook/branch) e non ci sono credenziali API Codemagic in questo ambiente. L'utente ha avviato la build direttamente dal dashboard Codemagic (workflow "Badge System iOS — TestFlight", branch `main`).

### Risultato
**Build 35 completata con successo**, confermato dall'utente. Fix Fase B ora attivo su utenti reali (test interno).

## Cosa NON è stato fatto (Session 95)

Nessuna verifica manuale post-installazione della build 35 (login → secure storage effettivamente cifrato su device reale) — non richiesta in questa sessione. Nessuna verifica della data di scadenza TestFlight esatta della build 35 su App Store Connect (la stima ~5 Novembre 2026 riportata nel footer di `PROJECT_DECISIONS.md` è ereditata dalla Build 34 e va confermata).

## Backlog per la prossima sessione (in ordine di urgenza)

1. **Fase C** (geofencing/QR rotation reali, finding #2+#5) — non iniziata. Resta l'unico finding HIGH ancora aperto di `findings2agosto2016.md`.
2. **S.26** — consenso GPS esplicito (GDPR Art. 7, HIGH) — dormiente finché nessun cliente reale chiede il geofencing, va di pari passo con Fase C.
3. **ANDROID.1/1b** — verifica manuale scan QR reale su device fisico/Virtual Scene, bloccato da un limite di automazione GUI-only.
4. **2 sotto-punti checklist wizard non verificabili** (Sezioni 6.4/6.5, da Session 92) — richiedono una build mobile puntata su staging, mai costruita.
5. **Fallimenti CI pre-esistenti, non bloccanti**: `Mobile - Test` (flakiness nota `MyScheduleScreen.test.jsx`), `Security Check`/`npm audit` (vulnerabilità documentate da Session 79).
6. (Opzionale) Verifica manuale della build 35 su un dispositivo reale — login, secure storage, TestFlight expiry esatta su App Store Connect.

## Note operative (Session 95)

- **Skill con `disable-model-invocation` possono comunque essere lette/preparate**: il contenuto dello skill `/build-mobile` è arrivato in chat quando l'utente lo ha invocato — utile per fare un preflight (versioni, `node_modules`, `app.json`) e per accorgersi di un disallineamento (EAS Build vs Codemagic) prima che l'utente lanciasse qualcosa di sbagliato, pur non potendo eseguire lo skill io stesso.
- **Non assumere che uno skill generico rispecchi la pipeline reale del progetto**: `/build-mobile` è scritto per un flusso EAS Build generico; questo progetto usa Codemagic per TestFlight da diverse sessioni (Build 33, 34, ora 35). Verificare sempre `codemagic.yaml`/`eas.json` contro quello che lo skill sta per eseguire.
- **Codemagic non ha trigger automatico** — confermato di nuovo in questa sessione (già annotato in Session 93). Ogni build va avviata manualmente dal dashboard.
- **Non fidarsi ciecamente di un backlog scritto in sessioni precedenti**: la voce "bug redirect post-login" era rimasta erroneamente aperta in questo file per 6 sessioni dopo essere stata effettivamente fixata — un controllo diretto sul codice (`grep`/`Read`) l'ha smentita in pochi secondi.

---

## Handoff precedenti (invariati, riportati sotto per contesto)

### Session 94 — Fase B findings 2 Agosto (finding #1, secure storage mobile) implementata e mergeata in `main`

**Goal:** Continuazione diretta di Session 93 nella stessa giornata: indirizzare il Finding #1 (Fase B) di `findings2agosto2016.md` — token mobile (access token, refresh token, oggetto utente) salvati in chiaro via `AsyncStorage` invece che in `expo-secure-store` cifrato.

**Esito:** Design via `/superpowers:brainstorming` (nuovo modulo `secureAuthStorage.js`, nessuna migrazione dati — forza re-login, + scrubbing Sentry mobile + gestione esplicita errori SecureStore aggiunti allo scope). Piano 9 task TDD via `/superpowers:writing-plans`, eseguito con `/superpowers:subagent-driven-development` in worktree isolato. Problema di provenance del worktree (branchato prima dei commit di spec+piano) risolto con `git rebase --onto`. 2 bug reali trovati durante l'esecuzione: `await import()` incompatibile con Jest in `apiClient.js` (fixato con `require()` lazy), `Promise.all` del cold-start senza `.catch` in `RootNavigator.jsx` dopo la migrazione a `SecureStore` (che può fallire davvero, a differenza di `AsyncStorage`). Merge fast-forward pulito su `main`, push su `origin/main` (13 commit, incluso backlog Session 93 mai pushato). **Non fatto**: nessuna build nativa lanciata — chiuso in Session 95 (vedi sopra).

**Credenziali/dettagli completi**: vedi `PROJECT_DECISIONS.md` sezione Session 94.

---

### Session 93 — Fase A findings 2 Agosto + bug strutturale `assigned_sites` + wizard "Aggiorna Dipendenti" in produzione + fix migration 035 + rinnovo TestFlight

**Goal:** Chiudere gli 8 findings isolati a basso rischio di `findings2agosto2016.md`, verificarli su staging, promuoverli in produzione.

**Esito:** **(1) Fase A** — 8 findings (#4,6,7,9,10,11,12,13) chiusi via `/superpowers:subagent-driven-development` (14 task, doppia review ciascuno). Review finale olistica ha trovato il problema più importante: header `X-Truncated` non esposto in `Access-Control-Expose-Headers`, vanificava silenziosamente il fix del finding #13 su un'architettura cross-origin — corretto. **(2) Bug strutturale `assigned_sites`** scoperto durante la verifica manuale (`maria@badge.local` non timbrava su staging): le migration storiche 018/019a valorizzano solo `site_id`, mai `assigned_sites` (stessa causa già colpita in produzione una volta, Session 81, patch one-off mai generalizzata). Verifica quantitativa su produzione: 1 riga rotta dal 19 Giugno. Fix strutturale: migration 038 con backfill + trigger Postgres `BEFORE INSERT OR UPDATE` che mantiene per sempre l'invariante, testato a 3 livelli su richiesta esplicita dell'utente. **(3)** Deploy complicato da un major outage GitHub Actions (~11 ore) — risolto senza bypass, solo `workflow_dispatch`/commit vuoto. Il merge `develop`→`main` ha portato con sé anche il wizard "Aggiorna Dipendenti" (segnalato esplicitamente prima di procedere). **(4)** Fix CI ricorrente: migration 035 resa idempotente (`IF NOT EXISTS`), verificato replicando lo scenario CI esatto in locale. **Bonus**: `/skill-doctor`, rimosse 2 skill duplicate. **Rinnovo TestFlight** eseguito a fine sessione: Build 34, scadenza reale calcolata **5 Novembre 2026** (promemoria 21 Ottobre) — la nota precedente ("Build 14, 2026-09-08") era rimasta non aggiornata per 3 build consecutive.

**Credenziali/dettagli completi**: vedi `PROJECT_DECISIONS.md` sezioni Session 93 (se presenti) e `TASKS.md` riga Session 93 nel Session Log per il resoconto integrale.

---

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
